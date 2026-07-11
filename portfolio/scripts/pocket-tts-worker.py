from __future__ import annotations

import base64
import contextlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Iterator

SAMPLE_RATE = 24_000
DEFAULT_REFERENCE_PATH = Path("public") / "sounds" / "voice" / "TTSReference.mp3"


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def write_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def resolve_path(value: str | None, fallback: Path) -> Path:
    path = Path(value).expanduser() if value else fallback
    if not path.is_absolute():
        path = Path.cwd() / path
    return path


def pcm16_bytes(audio: Any) -> bytes:
    try:
        import numpy as np
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("numpy is required by Pocket TTS. Run: pip install -r requirements-tts.txt") from exc

    if hasattr(audio, "detach"):
        audio = audio.detach()
    if hasattr(audio, "cpu"):
        audio = audio.cpu()
    if hasattr(audio, "numpy"):
        audio = audio.numpy()

    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    samples = np.nan_to_num(samples, nan=0.0, posinf=1.0, neginf=-1.0)
    samples = np.clip(samples, -1.0, 1.0)
    scaled = np.where(samples < 0, samples * 32768.0, samples * 32767.0)
    return np.rint(scaled).astype("<i2", copy=False).tobytes()


class PocketTtsWorker:
    def __init__(self) -> None:
        self.model: Any | None = None
        self.export_model_state: Any | None = None
        self.voice_state: Any | None = None

    def load_model(self) -> Any:
        if self.model is not None:
            return self.model

        try:
            with contextlib.redirect_stdout(sys.stderr):
                from pocket_tts import TTSModel, export_model_state

                log("[pocket-tts-worker] loading english model")
                self.model = TTSModel.load_model()
                self.export_model_state = export_model_state
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "Pocket TTS dependencies are not installed. Run: pip install -r requirements-tts.txt"
            ) from exc

        return self.model

    def load_voice_state(self) -> Any:
        if self.voice_state is not None:
            return self.voice_state

        model = self.load_model()
        cache_dir = resolve_path(os.environ.get("LOCAL_TTS_CACHE_DIR"), Path.home() / ".cache" / "portfolio" / "pocket-tts")
        state_path = resolve_path(
            os.environ.get("LOCAL_TTS_VOICE_STATE_PATH"),
            cache_dir / "custom-dhruv.safetensors",
        )
        reference_path = resolve_path(os.environ.get("LOCAL_TTS_REFERENCE_PATH"), DEFAULT_REFERENCE_PATH)

        with contextlib.redirect_stdout(sys.stderr):
            if state_path.is_file():
                log(f"[pocket-tts-worker] loading cached voice state {state_path}")
                self.voice_state = model.get_state_for_audio_prompt(str(state_path))
                return self.voice_state

            if not reference_path.is_file():
                raise RuntimeError(f"TTS reference audio does not exist: {reference_path}")

            log(f"[pocket-tts-worker] deriving voice state from {reference_path}")
            try:
                self.voice_state = model.get_state_for_audio_prompt(str(reference_path))
            except Exception as exc:  # noqa: BLE001
                message = str(exc)
                if "voice cloning" in message and "download the weights" in message:
                    raise RuntimeError(
                        "Custom Pocket TTS voice access is not configured. Accept the model terms at "
                        "https://huggingface.co/kyutai/pocket-tts, then provide HF_TOKEN or run "
                        "`hf auth login` for the account starting this process."
                    ) from exc
                raise
            state_path.parent.mkdir(parents=True, exist_ok=True)
            temporary_fd, temporary_name = tempfile.mkstemp(
                dir=state_path.parent,
                prefix=f".{state_path.stem}-",
                suffix=state_path.suffix or ".safetensors",
            )
            os.close(temporary_fd)
            temporary_path = Path(temporary_name)
            try:
                temporary_path.unlink()
                if self.export_model_state is None:
                    raise RuntimeError("Pocket TTS model state exporter is unavailable.")
                self.export_model_state(self.voice_state, str(temporary_path))
                os.replace(temporary_path, state_path)
            finally:
                if temporary_path.exists():
                    temporary_path.unlink()

        return self.voice_state

    def generate(self, text: str) -> Iterator[dict[str, Any]]:
        model = self.load_model()
        voice_state = self.load_voice_state()
        with contextlib.redirect_stdout(sys.stderr):
            audio_stream = model.generate_audio_stream(voice_state, text, copy_state=True)
        iterator = iter(audio_stream)
        index = 0
        while True:
            try:
                with contextlib.redirect_stdout(sys.stderr):
                    audio = next(iterator)
            except StopIteration:
                return
            yield {
                "audioBase64": base64.b64encode(pcm16_bytes(audio)).decode("ascii"),
                "index": index,
                "sampleRate": SAMPLE_RATE,
            }
            index += 1


def handle_request(worker: PocketTtsWorker, request: dict[str, Any]) -> None:
    request_id = str(request.get("id", ""))
    if request.get("type") != "synthesize":
        write_json({"id": request_id, "type": "error", "message": "Unknown request type."})
        return

    text = str(request.get("text") or "").strip()
    if not text:
        write_json({"id": request_id, "type": "error", "message": "Text is required."})
        return

    started_at = time.perf_counter()
    audio_bytes = 0
    try:
        for chunk in worker.generate(text):
            chunk_bytes = base64.b64decode(chunk["audioBase64"])
            audio_bytes += len(chunk_bytes)
            write_json({"id": request_id, "type": "chunk", **chunk})
        write_json({
            "id": request_id,
            "type": "done",
            "sampleRate": SAMPLE_RATE,
            "durationMs": round((time.perf_counter() - started_at) * 1000),
            "audioSeconds": audio_bytes / 2 / SAMPLE_RATE,
        })
    except Exception as exc:  # noqa: BLE001
        log(f"[pocket-tts-worker] error: {exc}")
        write_json({"id": request_id, "type": "error", "message": str(exc)})


def main() -> None:
    worker = PocketTtsWorker()
    log("[pocket-tts-worker] ready")
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            write_json({"id": "", "type": "error", "message": "Invalid JSON request."})
            continue
        handle_request(worker, request)


if __name__ == "__main__":
    main()