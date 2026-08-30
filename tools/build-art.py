#!/usr/bin/env python3
"""
One scene per part.

Twenty-four parts, twenty-four images. The table below is read from the poem —
each entry is the thing that is actually happening in that part, not a mood
word. It generates src/config/art.json (what the app loads) and prints the
prompts to make the images with.

The app falls back to the seated drawing for any part whose image is not on
disk yet, so art can land one file at a time.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
STYLE = ("charcoal and ink sketch, heavy crosshatching, loose scribbled line, "
         "high contrast, dark, on pale paper, no colour, plain background")

SCENES = {
 "I-1":  "a boy sitting up on the edge of a bed at dawn, an empty room, he does not recognise it",
 "I-2":  "a locked door seen from the inside, no handle on this side",
 "I-3":  "a boy curled under a thin blanket, frost creeping across the window",
 "I-4":  "wet turned earth opened up, roots and worms, a patch where nothing grows",
 "I-5":  "an open mouth making no sound, the face already going under",

 "II-1": "a boy standing over his own body lying on the floor",
 "II-2": "a bare bedroom with peeling walls, hyenas and vultures feeding in the dark corner",
 "II-3": "a bed with a mouth, a boy pinned flat on it, arms out",
 "II-4": "a crossroads at night, two figures walking away hand in hand",

 "III-1": "a boy melting, running off the chair into a puddle",
 "III-2": "a pit dug from the inside, footsteps passing overhead, dead stars above",
 "III-3": "one stitch of thread holding a body upright, a puppet by a single suture",

 "IV-1": "long hair growing down into a mattress, a shape approaching through the dark",
 "IV-2": "an airless room, a boy breathing thick still air, curtains dead flat",
 "IV-3": "an insect in an open mouth, eyes wide, tasting for the first time",
 "IV-4": "a boy drinking from a filthy spring, smiling with bad teeth",
 "IV-5": "a withered field, everything in it already old",

 "V-1":  "a boy face down on asphalt, blood at his forehead, a girl standing over him",
 "V-2":  "two faces almost touching, mouth to mouth, too close",
 "V-3":  "two children with a violin and a piano, a heavy curtain coming down on them",
 "V-4":  "a grave with wilted flowers, the headstone sunk, two open holes in the ground",

 "VI-1": "an open chest with something slipping out of it",
 "VI-2": "a wedding that is a funeral, a wet veil, dancing on ash",
 "VI-3": "a boy stepping back inside his own outline",
}


def main():
    parts = json.loads((ROOT / "src" / "poem" / "parts.json").read_text(encoding="utf-8"))
    art_dir = ROOT / "public" / "art"
    out = {}
    print(f"{'part':>6}  {'have':<5} scene")
    for p in parts:
        pid = p["id"]
        scene = SCENES.get(pid, "")
        have = (art_dir / f"{pid}.png").exists()
        out[pid] = {"file": f"art/{pid}.png", "scene": scene}
        print(f"{pid:>6}  {'yes' if have else '—':<5} {scene}")

    (ROOT / "src" / "config" / "art.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    prompts = ROOT / "tools" / "art-prompts.txt"
    prompts.write_text("\n\n".join(
        f"### {pid} — save as public/art/{pid}.png\n{SCENES[pid]}, {STYLE}"
        for pid in SCENES), encoding="utf-8")
    print(f"\n-> src/config/art.json")
    print(f"-> {prompts.relative_to(ROOT)}  ({len(SCENES)} prompts)")


if __name__ == "__main__":
    main()
