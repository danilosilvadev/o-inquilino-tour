#!/usr/bin/env python3
"""
Narration for a part of the poem.

pocket-tts speaks Portuguese (voice "rafael" by default). If you hand it a
recording of a real voice with --voice-wav, it conditions on that instead —
which is how Dani's own voice gets in here once a sample exists.

    python3 tools/narrate.py --part I-1
    python3 tools/narrate.py --part I-1 --voice-wav ~/dani.wav
"""
import argparse, json, subprocess, tempfile
from pathlib import Path

import torch
from pocket_tts import TTSModel
from pocket_tts.utils.utils import get_predefined_voice

ROOT = Path(__file__).resolve().parent.parent
ROMAN = ["I", "II", "III", "IV", "V", "VI"]


def paragraphs(part_id):
    cantos = json.loads((ROOT / "tools" / "structure.json").read_text(encoding="utf-8"))
    canto_str, idx = part_id.split("-")
    canto = cantos[ROMAN.index(canto_str)]
    return canto["parts"][int(idx) - 1]["paras"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", default="I-1")
    ap.add_argument("--language", default="portuguese")
    ap.add_argument("--voice", default="rafael")
    ap.add_argument("--voice-wav", default=None, help="a real recording to speak in")
    ap.add_argument("--temp", type=float, default=0.55, help="lower = flatter, more read-aloud")
    a = ap.parse_args()

    paras = paragraphs(a.part)
    print(f"{a.part}: {len(paras)} paragraphs")

    model = TTSModel.load_model(language=a.language, temp=a.temp)

    if a.voice_wav:
        state = model.get_state_for_audio_prompt(Path(a.voice_wav), truncate=True)
        print(f"voice: cloned from {a.voice_wav}")
    else:
        state = model._cached_get_state_for_audio_prompt(
            get_predefined_voice(a.language, a.voice))
        print(f"voice: {a.voice} ({a.language})")

    out_dir = ROOT / "public" / "audio" / "vo"
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []

    for i, text in enumerate(paras):
        wav = model.generate_audio(state, text)
        if isinstance(wav, torch.Tensor):
            wav = wav.detach().cpu().float().squeeze()
        sr = model.sample_rate
        dur = wav.shape[-1] / sr

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
            import scipy.io.wavfile as wf
            import numpy as np
            wf.write(tf.name, sr, (wav.numpy() * 32767).astype(np.int16))
            mp3 = out_dir / f"{a.part}-{i + 1}.mp3"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tf.name,
                            "-af", "afade=t=in:st=0:d=0.15,"
                                   f"afade=t=out:st={max(0, dur - 0.3):.2f}:d=0.3",
                            "-c:a", "libmp3lame", "-b:a", "96k", str(mp3)], check=True)
        manifest.append({"index": i, "file": f"vo/{a.part}-{i + 1}.mp3",
                         "duration": round(dur, 2), "text": text})
        print(f"  [{i + 1}] {dur:5.2f}s  {text[:64]}...")

    (ROOT / "src" / "config" / f"vo-{a.part}.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"total {sum(m['duration'] for m in manifest):.1f}s -> {out_dir}")


if __name__ == "__main__":
    main()
