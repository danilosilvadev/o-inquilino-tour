#!/usr/bin/env python3
"""
Turn the poem into stage directions.

Every part of O Inquilino becomes data: its paragraphs become beats, its beats
get camera stations, and each part selects from a small grammar of non-literal
moves. Nothing here illustrates the text. The moves act on the room, the light
and the body's ability to stay one body — the figure itself never performs.

    double     the same body, a moment behind itself
    afterimage he leaves copies of himself where he has been
    erase      the drawing of him is scratched away rather than lit
    pulse      the room throbs on a beat he does not share
    press      the corridor closes in
    tilt       the room stops being level
    sink       the floor takes him
    cold       the light goes blue and thin
    swarm      the dark has grain moving in it
    stretch    the space gets longer than it should be
"""
import json, textwrap, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ROMAN = ["I", "II", "III", "IV", "V", "VI"]

# ── the artistic table: what each part does, and how hard ──────────────
# read from the poem, not generated. this is the score for the images.
MOVES = {
    "I-1":  {"double": 0.8, "pulse": 0.5, "erase": 0.4, "afterimage": 0.5},
    "I-2":  {"double": 1.0, "press": 0.6, "stretch": 0.3},
    "I-3":  {"cold": 1.0, "swarm": 0.7, "erase": 0.3},
    "I-4":  {"sink": 1.0, "swarm": 0.8, "press": 0.4},
    "I-5":  {"erase": 1.0, "stretch": 0.6, "cold": 0.3},

    "II-1": {"double": 1.0, "erase": 0.6, "tilt": 0.3},
    "II-2": {"press": 1.0, "swarm": 0.8, "erase": 0.4},
    "II-3": {"tilt": 1.0, "press": 0.7, "sink": 0.5},
    "II-4": {"sink": 0.8, "stretch": 0.7, "cold": 0.5, "double": 0.4},

    "III-1": {"sink": 1.0, "erase": 0.8},
    "III-2": {"stretch": 1.0, "cold": 0.8, "swarm": 0.4},
    "III-3": {"erase": 0.7, "double": 0.6, "stretch": 0.4},

    "IV-1": {"afterimage": 1.0, "cold": 0.5, "stretch": 0.4},
    "IV-2": {"press": 0.9, "cold": 0.7, "swarm": 0.3},
    "IV-3": {"swarm": 1.0, "pulse": 0.6, "tilt": 0.4},
    "IV-4": {"pulse": 0.8, "erase": 0.3},
    "IV-5": {"erase": 0.9, "stretch": 0.5, "cold": 0.4},

    "V-1":  {"double": 1.0, "pulse": 0.8, "afterimage": 0.4},
    "V-2":  {"pulse": 1.0, "double": 0.7},
    "V-3":  {"stretch": 0.8, "afterimage": 0.7, "tilt": 0.5},
    "V-4":  {"sink": 1.0, "cold": 0.8, "erase": 0.5},

    "VI-1": {"erase": 0.9, "pulse": 0.5, "cold": 0.6},
    "VI-2": {"afterimage": 1.0, "tilt": 0.7, "pulse": 0.6},
    "VI-3": {"stretch": 1.0, "erase": 0.7, "pulse": 0.8},
}

# where the reader ends the part: the last line of VI-3 is "Me fiz."
# 36 characters overran a 16:9 frame: the visible half-width at reading
# distance is 3.92 units and a 36-character line is 3.55, so a stanza starting
# at x=0.5 ended 0.13 units past the edge. 31 leaves a real margin.
WRAP = 31


def wrap_lines(para):
    return textwrap.wrap(para, WRAP, break_long_words=False) or [para]


def build():
    cantos = json.loads((ROOT / "tools" / "structure.json").read_text(encoding="utf-8"))
    parts = []

    for ci, canto in enumerate(cantos):
        for pi, part in enumerate(canto["parts"]):
            pid = f"{ROMAN[ci]}-{pi + 1}"
            paras = part["paras"]
            n = len(paras)

            # beats are weighted by how much there is to read
            weights = [max(len(p), 40) for p in paras]
            total = sum(weights)
            beats, acc = [], 0.0
            for i, (para, w) in enumerate(zip(paras, weights)):
                frac = w / total
                beats.append({
                    "id": f"b{i + 1}",
                    "from": round(acc, 4),
                    "to": round(acc + frac, 4),
                    "lines": wrap_lines(para),
                    # alternate which side of the corridor the words hang on
                    "x": 0.30 if i % 2 == 0 else -3.45,
                    "y": 1.55 + (0.30 if len(wrap_lines(para)) > 4 else 0.0),
                    "anchor": "left",
                })
                acc += frac
            beats[-1]["to"] = 1.0

            # the camera crosses the corridor once per part, dwelling per beat
            stations = [5.0]
            span = 9.0 + 2.4 * n
            for i in range(n):
                stations.append(round(5.0 - span * (i + 1) / n, 2))

            parts.append({
                "id": pid,
                "canto": canto["name"],
                "mark": part["mark"],
                "beats": beats,
                "stations": stations,
                "moves": MOVES.get(pid, {}),
            })

    out = ROOT / "src" / "poem" / "parts.json"
    out.write_text(json.dumps(parts, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(parts)} parts -> {out.relative_to(ROOT)}")
    for p in parts:
        mv = ",".join(f"{k}:{v}" for k, v in p["moves"].items())
        print(f"  {p['id']:>6} {p['mark']:<6} {len(p['beats'])} beats  {mv}")


if __name__ == "__main__":
    build()
