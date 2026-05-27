from __future__ import annotations

import base64
import contextlib
import inspect
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

DEFAULT_MODEL_ID = "KittenML/kitten-tts-nano-0.1"
MODEL_FILENAME = "kitten_tts_nano_v0_1.onnx"
VOICES_FILENAME = "voices.npz"
DEFAULT_VOICE = "expr-voice-5-m"
SAMPLE_RATE = 24_000


def configure_cpu_defaults() -> None:
    intra_op_threads = os.environ.get("LOCAL_TTS_INTRA_OP_THREADS", "1")
    os.environ.setdefault("OMP_NUM_THREADS", intra_op_threads)
    os.environ.setdefault("ONNX_NUM_THREADS", intra_op_threads)
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
    os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
    os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

    cache_dir = os.environ.get("LOCAL_TTS_CACHE_DIR")
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        os.environ.setdefault("HF_HOME", cache_dir)


def write_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def get_espeak_install_hint() -> str:
    if sys.platform == "win32":
        return (
            "Install eSpeak NG for Windows, then restart the dev server. "
            "If phonemizer still cannot find it, set LOCAL_TTS_ESPEAK_LIBRARY to the full "
            "libespeak-ng.dll path, for example C:\\Program Files\\eSpeak NG\\libespeak-ng.dll."
        )
    if sys.platform == "darwin":
        return "Install eSpeak NG with: brew install espeak-ng"
    return "Install eSpeak NG with: sudo apt-get install -y espeak-ng libespeak-ng1"


def windows_espeak_candidates() -> list[Path]:
    candidates: list[Path] = []
    for root_name in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        root = os.environ.get(root_name)
        if not root:
            continue
        candidates.extend([
            Path(root) / "eSpeak NG" / "libespeak-ng.dll",
            Path(root) / "eSpeak NG" / "espeak-ng.dll",
        ])
    return candidates


def configure_espeak() -> None:
    try:
        from phonemizer.backend import EspeakBackend
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Python phonemizer is not installed. Run: pip install -r requirements-tts.txt"
        ) from exc

    explicit_library = (
        os.environ.get("LOCAL_TTS_ESPEAK_LIBRARY")
        or os.environ.get("PHONEMIZER_ESPEAK_LIBRARY")
        or os.environ.get("ESPEAK_LIBRARY")
    )
    if explicit_library:
        EspeakBackend.set_library(explicit_library)
    elif sys.platform == "win32":
        for candidate in windows_espeak_candidates():
            if candidate.is_file():
                EspeakBackend.set_library(str(candidate))
                break

    try:
        library = EspeakBackend.library()
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"eSpeak NG is required for KittenTTS phonemization. {get_espeak_install_hint()}") from exc

    log(f"[kitten-tts-worker] using eSpeak library {library}")


def resolve_existing_file(path_value: str | None, label: str) -> str | None:
    if not path_value:
        return None

    path = Path(path_value).expanduser()
    if path.is_file():
        return str(path)
    raise RuntimeError(f"{label} does not exist: {path}")


def download_hf_asset(model_id: str, filename: str) -> str:
    try:
        from huggingface_hub import hf_hub_download, try_to_load_from_cache
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "huggingface_hub is not installed. Run: pip install -r requirements-tts.txt"
        ) from exc

    cache_dir = os.environ.get("LOCAL_TTS_CACHE_DIR")
    cached_path = try_to_load_from_cache(model_id, filename, cache_dir=cache_dir)
    if isinstance(cached_path, str) and Path(cached_path).is_file():
        return cached_path

    kwargs: dict[str, Any] = {"repo_id": model_id, "filename": filename}
    if cache_dir:
        kwargs["cache_dir"] = cache_dir
    if os.environ.get("LOCAL_TTS_OFFLINE") == "1" or os.environ.get("HF_HUB_OFFLINE") == "1":
        kwargs["local_files_only"] = True
    return hf_hub_download(**kwargs)


def resolve_model_assets(model_id: str) -> tuple[str, str]:
    model_path = resolve_existing_file(os.environ.get("LOCAL_TTS_MODEL_PATH"), "LOCAL_TTS_MODEL_PATH")
    voices_path = resolve_existing_file(os.environ.get("LOCAL_TTS_VOICES_PATH"), "LOCAL_TTS_VOICES_PATH")

    legacy_model_path = os.environ.get("KITTEN_TTS_MODEL_PATH")
    if model_path is None and legacy_model_path:
        model_path = resolve_existing_file(legacy_model_path, "KITTEN_TTS_MODEL_PATH")

    if model_path is None:
        model_path = download_hf_asset(model_id, MODEL_FILENAME)
    if voices_path is None:
        voices_path = download_hf_asset(model_id, VOICES_FILENAME)

    return model_path, voices_path


class KittenWorker:
    def __init__(self) -> None:
        self.model: Any | None = None
        self.generate_accepts_speed = False

    def load_model(self) -> Any:
        if self.model is not None:
            return self.model

        with contextlib.redirect_stdout(sys.stderr):
            try:
                from kittentts import KittenTTS
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(
                    "KittenTTS dependencies are not installed. Run: pip install -r requirements-tts.txt"
                ) from exc

            model_id = os.environ.get("LOCAL_TTS_MODEL_ID") or os.environ.get("KITTEN_TTS_MODEL") or DEFAULT_MODEL_ID
            configure_espeak()
            log(f"[kitten-tts-worker] loading {model_id}")
            model_path, voices_path = resolve_model_assets(model_id)
            self.model = KittenTTS(model_path=model_path, voices_path=voices_path)

        try:
            signature = inspect.signature(self.model.generate)
            self.generate_accepts_speed = "speed" in signature.parameters or any(
                parameter.kind == inspect.Parameter.VAR_KEYWORD
                for parameter in signature.parameters.values()
            )
        except (TypeError, ValueError):
            self.generate_accepts_speed = False

        return self.model

    def synthesize(self, text: str, voice: str, speed: float) -> dict[str, Any]:
        try:
            import numpy as np
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "KittenTTS dependencies are not installed. Run: pip install -r requirements-tts.txt"
            ) from exc

        model = self.load_model()
        kwargs: dict[str, Any] = {"voice": voice or DEFAULT_VOICE}
        speed_applied = False

        if self.generate_accepts_speed:
            kwargs["speed"] = speed
            speed_applied = True

        started_at = time.perf_counter()
        with contextlib.redirect_stdout(sys.stderr):
            try:
                audio = model.generate(text or "Ready.", **kwargs)
            except TypeError as exc:
                if "speed" not in kwargs or "speed" not in str(exc):
                    raise
                kwargs.pop("speed", None)
                speed_applied = False
                audio = model.generate(text or "Ready.", **kwargs)

        sample_rate = SAMPLE_RATE
        if isinstance(audio, tuple):
            audio, maybe_sample_rate = audio[0], audio[1] if len(audio) > 1 else SAMPLE_RATE
            try:
                sample_rate = int(maybe_sample_rate)
            except (TypeError, ValueError):
                sample_rate = SAMPLE_RATE
        if sample_rate <= 0:
            sample_rate = SAMPLE_RATE

        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        samples = np.nan_to_num(samples, nan=0.0, posinf=1.0, neginf=-1.0)
        samples = np.clip(samples, -1.0, 1.0).astype(np.float32, copy=False)
        audio_base64 = base64.b64encode(samples.tobytes()).decode("ascii")
        duration_ms = round((time.perf_counter() - started_at) * 1000)

        return {
            "sampleRate": sample_rate,
            "audioBase64": audio_base64,
            "durationMs": duration_ms,
            "audioSeconds": float(samples.size / sample_rate),
            "speedApplied": speed_applied,
        }


def handle_request(worker: KittenWorker, request: dict[str, Any]) -> dict[str, Any]:
    request_id = str(request.get("id", ""))
    request_type = request.get("type")
    text = str(request.get("text") or "Ready.")
    voice = str(request.get("voice") or DEFAULT_VOICE)

    try:
        speed = float(request.get("speed", 1.0))
    except (TypeError, ValueError):
        speed = 1.0

    if request_type not in {"preload", "synthesize"}:
        return {"id": request_id, "type": "error", "message": "Unknown request type."}

    result = worker.synthesize(text, voice, speed)
    return {"id": request_id, "type": "result", **result}


def main() -> None:
    configure_cpu_defaults()
    worker = KittenWorker()
    log("[kitten-tts-worker] Ready.")

    for line in sys.stdin:
        if not line.strip():
            continue

        try:
            request = json.loads(line)
            response = handle_request(worker, request)
        except Exception as exc:  # noqa: BLE001
            request_id = ""
            try:
                request_id = str(json.loads(line).get("id", ""))
            except Exception:  # noqa: BLE001
                pass
            log(f"[kitten-tts-worker] error: {exc}")
            response = {"id": request_id, "type": "error", "message": str(exc)}

        write_json(response)


if __name__ == "__main__":
    main()