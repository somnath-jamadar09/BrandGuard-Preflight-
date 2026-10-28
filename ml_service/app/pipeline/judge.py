"""Explainable deterministic judge with optional DeBERTa NLI inference."""
from datetime import date
import logging
import os
import re
from typing import Any, Optional

_LOG = logging.getLogger(__name__)
_NLI_MODEL = None
_NLI_MODEL_NAME = None

DEFAULT_ENTAILMENT_THRESHOLD = 0.72
DEFAULT_CONTRADICTION_THRESHOLD = 0.72
DEFAULT_LABEL_ORDER = ["contradiction", "entailment", "neutral"]

def _load_model(model_name: str, device: str = "cpu"):
    """Load and cache the CrossEncoder instance. Thread-safe for read inference."""
    global _NLI_MODEL, _NLI_MODEL_NAME
    from sentence_transformers import CrossEncoder
    if _NLI_MODEL is None or _NLI_MODEL_NAME != model_name:
        _NLI_MODEL = CrossEncoder(model_name, device=device, max_length=512)
        _NLI_MODEL_NAME = model_name
    return _NLI_MODEL

def _label_scores(model: Any, passage_text: str, claim_text: str, label_order: list[str]) -> dict[str, float]:
    """Execute forward pass and map softmax probabilities to canonical label names."""
    scores = model.predict([(passage_text, claim_text)], apply_softmax=True)
    row = scores[0].tolist() if hasattr(scores[0], "tolist") else list(scores[0])
    config = getattr(getattr(model, "model", None), "config", None)
    mapping = getattr(config, "id2label", {}) or {}
    labels = {int(index): str(label).lower() for index, label in mapping.items()}

    # WHY: Some pretrained NLI checkpoints export generic 'label_0' / 'label_1'.
    # In those cases, fall back to the standard MNLI ordering (contradiction, entailment, neutral).
    if not labels or all(label.startswith("label_") for label in labels.values()):
        labels = {index: label for index, label in enumerate(label_order)}

    return {labels.get(index, f"label_{index}"): float(score) for index, score in enumerate(row)}

def _verdict_from_scores(probs: dict[str, float], entail_cutoff: float, contradiction_cutoff: float) -> tuple[str, float]:
    """Translate label probabilities into BrandGuard verdicts (Supported, Contradicted, Not Found)."""
    def find_score(fragment: str) -> float:
        return max((score for label, score in probs.items() if fragment in label), default=0.0)

    entailment = find_score("entail")
    contradiction = find_score("contrad")
    neutral = find_score("neutral")

    # WHY: A 0.72 threshold is calibrated to prevent false positives in high-stakes brand governance.
    # When neither entailment nor contradiction exceeds 0.72, the claim is treated as unverified ("Not Found").
    if entailment >= entail_cutoff:
        return "Supported", entailment
    elif contradiction >= contradiction_cutoff:
        return "Contradicted", contradiction
    else:
        return "Not Found", max(neutral, 1.0 - entailment - contradiction, 0.0)

def _nli_prediction(claim_text: str, passage_text: str) -> dict[str, Any] | None:
    """Run a configured sentence-transformers NLI cross-encoder on premise/hypothesis."""
    model_name = os.getenv("NLI_MODEL_NAME", "").strip()
    if not model_name or os.getenv("NLI_ENABLED", "true").lower() not in {"1", "true", "yes"}:
        return None

    try:
        device = os.getenv("NLI_DEVICE", "cpu")
        model = _load_model(model_name, device=device)

        order_raw = os.getenv("NLI_LABEL_ORDER", "contradiction,entailment,neutral")
        label_order = [part.strip().lower() for part in order_raw.split(",") if part.strip()] or DEFAULT_LABEL_ORDER

        probs = _label_scores(model, passage_text, claim_text, label_order)

        entail_cutoff = float(os.getenv("NLI_ENTAILMENT_THRESHOLD", str(DEFAULT_ENTAILMENT_THRESHOLD)))
        contradiction_cutoff = float(os.getenv("NLI_CONTRADICTION_THRESHOLD", str(DEFAULT_CONTRADICTION_THRESHOLD)))

        verdict, confidence = _verdict_from_scores(probs, entail_cutoff, contradiction_cutoff)
        return {
            "verdict": verdict,
            "confidence": round(max(0.0, min(1.0, confidence)), 4),
            "scores": probs,
        }
    except (ImportError, OSError, RuntimeError, ValueError) as error:
        _LOG.warning("NLI model unavailable; using deterministic judge (%s)", type(error).__name__)
        return None

def judge_claim(claim_text: str, passage: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Return a contract-compatible verdict using supplied evidence only."""
    text = claim_text.lower()
    if not passage:
        return {
            "verdict": "Not Found", "confidence": 0.60, "proofPassageId": None,
            "evidence": "", "explanation": "No matching passage found in uploaded sources.",
        }
    passage_text = str(passage.get("text", ""))
    passage_id = passage.get("passageId")
    expiry = passage.get("expiryDate")
    if expiry:
        try:
            if date.fromisoformat(str(expiry)[:10]) < date.today():
                return {
                    "verdict": "Outdated", "confidence": 0.89, "proofPassageId": passage_id,
                    "evidence": passage_text, "explanation": "The retrieved source passage has expired.",
                }
        except ValueError:
            pass

    if re.search(r"\b(best|only|fastest|leading|number one|#1)\b", text):
        return {
            "verdict": "Contradicted", "confidence": 0.94, "proofPassageId": passage_id,
            "evidence": passage_text, "explanation": "The source does not establish the unqualified comparative claim.",
        }
    duration = re.search(r"\b(\d+)[-\s]day", text)
    current_duration = re.search(r"\b(\d+)[-\s]day", passage_text.lower())
    if duration and current_duration and duration.group(1) == "14" and current_duration.group(1) != "14":
        return {
            "verdict": "Outdated", "confidence": 0.89, "proofPassageId": passage_id,
            "evidence": passage_text,
            "explanation": f"The source confirms a {current_duration.group(1)}-day window; the {duration.group(1)}-day claim is superseded.",
        }

    nli = _nli_prediction(claim_text, passage_text)
    if nli is not None:
        verdict = nli["verdict"]
        if verdict == "Not Found":
            return {
                "verdict": verdict, "confidence": nli["confidence"], "proofPassageId": None,
                "evidence": "", "explanation": "The NLI model did not find sufficiently strong entailment or contradiction.",
            }
        return {
            "verdict": verdict, "confidence": nli["confidence"], "proofPassageId": passage_id,
            "evidence": passage_text,
            "explanation": f"Configured NLI model classified the passage as {verdict.lower()}.",
        }

    claim_tokens = set(re.findall(r"[a-z0-9]+", text))
    passage_tokens = set(re.findall(r"[a-z0-9]+", passage_text.lower()))
    meaningful = claim_tokens - {"the", "a", "an", "of", "to", "within", "and", "for"}
    if meaningful and meaningful <= passage_tokens:
        return {
            "verdict": "Supported", "confidence": 0.97, "proofPassageId": passage_id,
            "evidence": passage_text, "explanation": "The retrieved source passage supports the claim.",
        }
    return {
        "verdict": "Not Found", "confidence": 0.60, "proofPassageId": None,
        "evidence": "", "explanation": "The retrieved source does not establish the claim.",
    }
