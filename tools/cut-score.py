#!/usr/bin/env python3
"""
Slice the score across the whole poem.

The music is one continuous thread through O Inquilino, not a loop per scene.
Every part gets a slice proportional to how much text it carries, laid end to
end so that part N+1 picks up exactly where part N stopped. Build a new part,
run this, and it cuts that part's slice — the flow stays intact.

    python3 tools/cut-score.py --part I-1
"""
import argparse, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path.home() / "Downloads" / "Adagio Albinoni (best live version) - MusicArtstrings (youtube).mp3"

# the recording opens and closes on applause; only the music is usable
MUSIC_IN, MUSIC_OUT = 10.0, 486.0
FADE = 1.5                       # short, so consecutive slices still butt together
ROMAN = ["I", "II", "III", "IV", "V", "VI"]


def build_map():
    cantos = json.loads((ROOT / "tools" / "structure.json").read_text(encoding="utf-8"))
    parts = []
    for ci, canto in enumerate(cantos):
        for pi, part in enumerate(canto["parts"]):
            parts.append({
                "id": f"{ROMAN[ci]}-{pi + 1}",
                "canto": canto["name"],
                "mark": part["mark"],
                "paras": len(part["paras"]),
            })

    total = sum(p["paras"] for p in parts)
    span = MUSIC_OUT - MUSIC_IN
    t = MUSIC_IN
    for p in parts:
        dur = span * p["paras"] / total
        p["start"] = round(t, 2)
        p["duration"] = round(dur, 2)
        t += dur
    return parts


def cut(part):
    out = ROOT / "public" / "audio" / f"{part['id']}.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    d = part["duration"]
    subprocess.run([
        "ffmpeg", "-v", "error", "-y",
        "-ss", str(part["start"]), "-t", str(d), "-i", str(SRC),
        "-af", f"afade=t=in:st=0:d={FADE},afade=t=out:st={max(0, d - FADE):.2f}:d={FADE},aresample=44100",
        "-c:a", "libmp3lame", "-b:a", "128k", "-ac", "2", str(out),
    ], check=True)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", default="I-1")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    parts = build_map()
    (ROOT / "src" / "config" / "score-map.json").write_text(
        json.dumps(parts, ensure_ascii=False, indent=1), encoding="utf-8")

    if a.list:
        for p in parts:
            print(f"{p['id']:>6}  {p['canto']:<9} {p['mark']:<6} "
                  f"{p['paras']:>2} paras   {p['start']:>7.2f}s +{p['duration']:>5.2f}s")
        sys.exit(0)

    part = next((p for p in parts if p["id"] == a.part), None)
    if not part:
        sys.exit(f"no such part: {a.part}")
    f = cut(part)
    print(f"{part['id']}: {part['start']:.2f}s +{part['duration']:.2f}s -> {f.relative_to(ROOT)} "
          f"({f.stat().st_size // 1024} KB)")
