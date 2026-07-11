from __future__ import annotations

import base64
import contextlib
import hashlib
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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as reference_file:
        for chunk in iter(lambda: reference_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reference_hash_sidecar_path(state_path: Path) -> Path:
    return state_path.with_name(f"{state_path.name}.reference.sha256")


def read_reference_hash_sidecar(sidecar_path: Path) -> str | None:
    try:
        value = sidecar_path.read_text(encoding="ascii").strip().lower()
    except OSError:
        return None
    return value if len(value) == 64 and all(character in "0123456789abcdef" for character in value) else None


def write_text_atomically(path: Path, value: str) -> None:
    temporary_fd, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}-", suffix=".tmp")
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(temporary_fd, "w", encoding="ascii", newline="\n") as temporary_file:
            temporary_file.write(f"{value}\n")
        os.replace(temporary_path, path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


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
        self.reference_revision: str | None = None

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
        cache_dir = resolve_path(os.environ.get("LOCAL_TTS_CACHE_DIR"), Path.home() / ".cache" / "portfolio" / "pocket-tts")
        state_path = resolve_path(
            os.environ.get("LOCAL_TTS_VOICE_STATE_PATH"),
            cache_dir / "custom-dhruv.safetensors",
        )
        reference_path = resolve_path(os.environ.get("LOCAL_TTS_REFERENCE_PATH"), DEFAULT_REFERENCE_PATH)
        sidecar_path = reference_hash_sidecar_path(state_path)

        if not reference_path.is_file():
            raise RuntimeError(f"TTS reference audio does not exist: {reference_path}")

        reference_revision = sha256_file(reference_path)
        if self.voice_state is not None and self.reference_revision == reference_revision:
            return self.voice_state

        if self.voice_state is not None:
            log("[pocket-tts-worker] reference audio changed; regenerating voice state")
            self.voice_state = None
            self.reference_revision = None

        model = self.load_model()

        with contextlib.redirect_stdout(sys.stderr):
            cached_revision = read_reference_hash_sidecar(sidecar_path)
            if state_path.is_file() and cached_revision == reference_revision:
                log(f"[pocket-tts-worker] loading cached voice state {state_path}")
                try:
                    self.voice_state = model.get_state_for_audio_prompt(str(state_path))
                    self.reference_revision = reference_revision
                    return self.voice_state
                except Exception as exc:  # noqa: BLE001
                    log(f"[pocket-tts-worker] cached voice state is unreadable; regenerating ({exc})")
            elif state_path.is_file():
                reason = "missing sidecar" if cached_revision is None else "reference hash mismatch"
                log(f"[pocket-tts-worker] cached voice state is stale ({reason}); regenerating")

            for attempt in range(2):
                starting_revision = sha256_file(reference_path)
                log(f"[pocket-tts-worker] deriving voice state from {reference_path}")
                try:
                    voice_state = model.get_state_for_audio_prompt(str(reference_path))
                except Exception as exc:  # noqa: BLE001
                    message = str(exc)
                    if "voice cloning" in message and "download the weights" in message:
                        raise RuntimeError(
                            "Custom Pocket TTS voice access is not configured. Accept the model terms at "
                            "https://huggingface.co/kyutai/pocket-tts, then provide HF_TOKEN or run "
                            "`hf auth login` for the account starting this process."
                        ) from exc
                    raise

                completed_revision = sha256_file(reference_path)
                if completed_revision != starting_revision:
                    if attempt == 0:
                        log("[pocket-tts-worker] reference audio changed during derivation; retrying")
                        continue
                    raise RuntimeError("TTS reference audio changed during voice-state derivation; try again after replacement completes.")

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
                    self.export_model_state(voice_state, str(temporary_path))
                    os.replace(temporary_path, state_path)
                    write_text_atomically(sidecar_path, completed_revision)
                finally:
                    if temporary_path.exists():
                        temporary_path.unlink()

                self.voice_state = voice_state
                self.reference_revision = completed_revision
                return self.voice_state

        raise RuntimeError("Unable to derive a Pocket TTS voice state from the reference audio.")


    def generate(self, text: str) -> Iterator[dict[str, Any]]:
        model = self.load_model()
        voice_state = self.load_voice_state()
        voice_revision = self.reference_revision
        if voice_revision is None:
            raise RuntimeError("Pocket TTS voice state has no reference revision.")
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
                "voiceRevision": voice_revision,
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