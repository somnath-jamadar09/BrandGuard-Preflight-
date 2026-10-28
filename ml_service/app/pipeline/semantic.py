"""Optional CPU semantic retrieval backed by sentence-transformers and FAISS.

Passage content remains the source of truth in passages.json. FAISS indices are
rebuildable caches keyed by passage IDs, text, and model name; they are written
atomically below INDEX_DIR so a restart does not require re-embedding unchanged
documents when a cache is available.
"""
from __future__ import annotations
import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

_LOG = logging.getLogger(__name__)
_MODEL = None
_MODEL_NAME = None

def _model():
    global _MODEL, _MODEL_NAME
    name = os.getenv("SENTENCE_TRANSFORMER_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    if _MODEL is not None and _MODEL_NAME == name:
        return _MODEL
    from sentence_transformers import SentenceTransformer
    _MODEL = SentenceTransformer(name, device=os.getenv("EMBEDDING_DEVICE", "cpu"))
    _MODEL_NAME = name
    return _MODEL

def _fingerprint(passages: list[dict[str, Any]], model_name: str) -> str:
    stable = [(str(item.get("passageId", "")), str(item.get("text", ""))) for item in passages]
    material = json.dumps({"model": model_name, "passages": stable}, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()

def rank_semantically(query: str, passages: list[dict[str, Any]], top_k: int = 5) -> list[dict[str, Any]] | None:
    """Return FAISS-ranked passages, or None when semantic mode is unavailable."""
    if os.getenv("SEMANTIC_RETRIEVAL_ENABLED", "false").lower() not in {"1", "true", "yes"}:
        return None
    if not query.strip() or not passages:
        return []
    try:
        import faiss
        import numpy as np
        model_name = os.getenv("SENTENCE_TRANSFORMER_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
        model = _model()
        fingerprint = _fingerprint(passages, model_name)
        root = Path(os.getenv("INDEX_DIR", "indexes")) / "semantic"
        root.mkdir(parents=True, exist_ok=True)
        index_path = root / (fingerprint + ".faiss")
        ids_path = root / (fingerprint + ".json")
        ordered_ids = [str(item.get("passageId", "")) for item in passages]
        index = None
        if index_path.exists() and ids_path.exists():
            try:
                cached_index = faiss.read_index(str(index_path))
                cached_ids = json.loads(ids_path.read_text(encoding="utf-8"))
                if cached_ids == ordered_ids and cached_index.ntotal == len(passages):
                    index = cached_index
            except (OSError, ValueError, RuntimeError, json.JSONDecodeError):
                index = None
        if index is None:
            vectors = model.encode(
                [str(item.get("text", "")) for item in passages],
                normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False,
            )
            vectors = np.asarray(vectors, dtype=np.float32)
            index = faiss.IndexFlatIP(vectors.shape[1])
            index.add(vectors)
            with tempfile.NamedTemporaryFile(dir=root, suffix=".faiss", delete=False) as handle:
                temp_index = handle.name
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=root, suffix=".json", delete=False) as handle:
                temp_ids = handle.name
                json.dump(ordered_ids, handle)
            try:
                faiss.write_index(index, temp_index)
                os.replace(temp_index, index_path)
                os.replace(temp_ids, ids_path)
            finally:
                for temporary in (temp_index, temp_ids):
                    if os.path.exists(temporary):
                        os.unlink(temporary)
        query_vector = model.encode([query], normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
        scores, positions = index.search(np.asarray(query_vector, dtype=np.float32), min(max(1, top_k), len(passages)))
        minimum = float(os.getenv("SEMANTIC_MIN_SCORE", "0.25"))
        ranked = []
        for score, position in zip(scores[0], positions[0]):
            if position < 0 or float(score) < minimum:
                continue
            ranked.append({**passages[int(position)], "score": float(score), "retrievalMethod": "faiss"})
        return ranked
    except (ImportError, OSError, RuntimeError, ValueError, KeyError) as error:
        _LOG.warning("Semantic retrieval unavailable; using lexical fallback (%s)", type(error).__name__)
        return None
