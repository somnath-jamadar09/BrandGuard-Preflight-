"""Image accessibility and visual checks, including optional OpenCV file analysis."""
from __future__ import annotations
import base64
from collections import Counter
import math
import os
import re
from typing import Sequence

def _rgb(value: Sequence[int]) -> tuple[int, int, int]:
    if len(value) != 3 or any(not isinstance(channel, (int, float)) for channel in value):
        raise ValueError("RGB values must contain three numbers")
    return tuple(max(0, min(255, int(channel))) for channel in value)

def _luminance(rgb: Sequence[int]) -> float:
    channels = []
    for channel in _rgb(rgb):
        value = channel / 255
        channels.append(value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

def contrast_ratio(foreground: Sequence[int], background: Sequence[int]) -> float:
    first, second = _luminance(foreground), _luminance(background)
    return (max(first, second) + 0.05) / (min(first, second) + 0.05)

def _decode_image(payload: dict):
    """Decode explicit base64 image bytes; never fetch user-supplied URLs."""
    encoded = payload.get("imageBase64") or payload.get("imageData")
    if not isinstance(encoded, str) or not encoded.strip():
        storage_ref = payload.get("storageRef")
        if isinstance(storage_ref, str) and storage_ref.startswith("data:image/"):
            encoded = storage_ref.split(",", 1)[1] if "," in storage_ref else ""
    if not encoded:
        return None
    encoded = re.sub(r"^data:image/[^;]+;base64,", "", encoded.strip(), flags=re.IGNORECASE)
    try:
        max_bytes = int(os.getenv("IMAGE_MAX_BYTES", str(12 * 1024 * 1024)))
        if max_bytes <= 0 or len(encoded) > ((max_bytes + 2) // 3) * 4 + 4:
            return None
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > max_bytes:
            return None
        import cv2
        import numpy as np
        return cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    except (ValueError, ImportError):
        return None

def _analyse_decoded_image(image) -> list[dict]:
    import cv2
    height, width = image.shape[:2]
    results = [{
        "checkType": "image-integrity", "passed": width > 0 and height > 0,
        "details": "Image bytes decoded successfully." if width > 0 and height > 0 else "Image dimensions are empty.",
    }]
    results.append({
        "checkType": "image-dimensions", "passed": width >= 320 and height >= 200,
        "width": int(width), "height": int(height),
        "details": f"Decoded image is {width}x{height}; checks are advisory and do not replace visual review.",
    })
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    min_sharpness = float(os.getenv("IMAGE_MIN_SHARPNESS", "35"))
    results.append({
        "checkType": "image-sharpness", "passed": variance >= min_sharpness,
        "laplacianVariance": round(variance, 3),
        "details": "Image sharpness is within the configured baseline." if variance >= min_sharpness else "Image may be blurry; inspect it before publishing.",
    })
    sample = cv2.resize(image, (min(128, width), min(128, height)), interpolation=cv2.INTER_AREA)
    import numpy as np
    pixels = cv2.cvtColor(sample, cv2.COLOR_BGR2RGB).reshape(-1, 3)
    mean_rgb = [round(float(channel)) for channel in pixels.mean(axis=0)]
    saturation = float(cv2.cvtColor(sample, cv2.COLOR_BGR2HSV)[:, :, 1].mean())
    results.append({
        "checkType": "image-colour-profile", "passed": True,
        "meanRgb": mean_rgb, "meanSaturation": round(saturation, 2),
        "details": "Basic colour statistics computed; compare against brand-specific palette policy when configured.",
    })
    return results

def analyze_image(payload: dict) -> list[dict]:
    results = []
    image = _decode_image(payload)
    if image is not None:
        try:
            results.extend(_analyse_decoded_image(image))
        except (ImportError, ValueError, TypeError):
            results.append({"checkType": "image-analysis", "passed": False, "details": "OpenCV could not analyse the supplied image."})
    elif payload.get("imageBase64") or payload.get("imageData") or (
        isinstance(payload.get("storageRef"), str) and payload["storageRef"].startswith("data:image/")
    ):
        results.append({"checkType": "image-integrity", "passed": False, "details": "Image data was invalid, unsupported, or exceeded the upload-size limit."})

    pixels = payload.get("pixels") or []
    palette = payload.get("brandPalette") or []
    if pixels and palette:
        try:
            colors = Counter(_rgb(pixel) for pixel in pixels)
            dominant = [color for color, _ in colors.most_common(5)]
            brand = [_rgb(color) for color in palette]
            distances = [min(math.dist(color, expected) for expected in brand) for color in dominant]
            passed = max(distances, default=999) <= 45
            results.append({
                "checkType": "palette", "passed": passed,
                "details": "Dominant colours match the supplied brand palette." if passed else "One or more dominant colours fall outside the supplied brand palette.",
            })
        except (TypeError, ValueError):
            results.append({"checkType": "palette", "passed": False, "details": "Pixel or palette data could not be evaluated."})
    elif palette and image is not None:
        try:
            import cv2
            import numpy as np
            sample = cv2.resize(image, (min(128, image.shape[1]), min(128, image.shape[0])), interpolation=cv2.INTER_AREA)
            sampled_pixels = cv2.cvtColor(sample, cv2.COLOR_BGR2RGB).reshape(-1, 3)
            colors = Counter(tuple(int(channel) for channel in row) for row in sampled_pixels)
            dominant = [color for color, _ in colors.most_common(5)]
            brand = [_rgb(color) for color in palette]
            distances = [min(math.dist(color, expected) for expected in brand) for color in dominant]
            passed = max(distances, default=999) <= 45
            results.append({
                "checkType": "palette", "passed": passed,
                "details": "Decoded image colours match the supplied brand palette." if passed else "Decoded image has dominant colours outside the supplied brand palette.",
            })
        except (ImportError, TypeError, ValueError):
            results.append({"checkType": "palette", "passed": False, "details": "Decoded image palette could not be evaluated."})
    elif payload.get("brandPalette") is not None and image is None:
        results.append({"checkType": "palette", "passed": False, "details": "No decodable image or pixel data was supplied; palette match was not evaluated."})

    foreground, background = payload.get("textForeground"), payload.get("textBackground")
    if foreground is not None and background is not None:
        try:
            ratio = contrast_ratio(foreground, background)
            results.append({
                "checkType": "contrast", "passed": ratio >= 4.5,
                "wcagLevel": "AA" if ratio >= 4.5 else "A",
                "details": f"Contrast ratio {ratio:.2f}:1; WCAG AA requires at least 4.5:1.",
            })
        except (TypeError, ValueError):
            results.append({"checkType": "contrast", "passed": False, "details": "Text colours could not be evaluated."})

    alt_text = payload.get("altText")
    if alt_text is not None or pixels or payload.get("storageRef") or image is not None:
        present = bool(isinstance(alt_text, str) and alt_text.strip())
        results.append({
            "checkType": "alt-text", "passed": present,
            "details": "Alt text is present." if present else "Alt text is missing.",
        })

    if image is not None:
        try:
            import cv2
            import pytesseract
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            text = pytesseract.image_to_string(gray, timeout=5).strip()
            results.append({
                "checkType": "embedded-text", "passed": bool(text),
                "detectedText": text[:1000],
                "details": "OCR found text; verify it against the approved copy." if text else "No embedded text was detected by OCR.",
            })
        except (ImportError, OSError, RuntimeError, ValueError):
            results.append({"checkType": "embedded-text", "passed": False, "status": "skipped", "details": "OCR is unavailable; embedded-text analysis could not be completed."})
    return results
