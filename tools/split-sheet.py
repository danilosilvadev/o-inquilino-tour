#!/usr/bin/env python3
"""
Split the character turnaround into separate views.

Ink on pale paper actually has a figure/ground boundary (unlike the first
drawing), so a threshold finds it. Each view is isolated as its own connected
blob, the label text is rejected by shape, and the alpha keeps the soft edge of
the charcoal instead of stamping a hard silhouette.
"""
import numpy as np, pathlib, sys
from PIL import Image
from scipy import ndimage

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "character"


def split(src, names):
    img = Image.open(src).convert("RGB")
    a = np.array(img).astype(np.float32) / 255.0
    lum = a @ np.array([0.299, 0.587, 0.114])

    # paper is the bright mode; ink is anything meaningfully darker
    paper = np.percentile(lum, 90)
    ink = lum < paper - 0.12

    # merge each figure's strokes into one blob without merging the figures
    blobs = ndimage.binary_closing(ink, structure=np.ones((25, 25)))
    blobs = ndimage.binary_fill_holes(blobs)
    lab, n = ndimage.label(blobs)
    print(f"{n} blobs")

    H = lum.shape[0]
    keep = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        h, w = ys.max() - ys.min(), xs.max() - xs.min()
        # a figure is tall; the captions are short and wide
        if h < H * 0.12 or h < w * 0.8:
            continue
        keep.append((xs.min(), ys.min(), xs.max(), ys.max(), i))
    keep.sort(key=lambda b: b[0])
    print(f"{len(keep)} figures kept")

    OUT.mkdir(parents=True, exist_ok=True)
    for idx, (x0, y0, x1, y1, i) in enumerate(keep):
        name = names[idx] if idx < len(names) else f"view{idx}"
        mask = (lab == i)
        # alpha from ink density, so charcoal edges stay soft
        dens = np.clip((paper - lum) / max(paper - lum[mask].min(), 1e-3), 0, 1)
        alpha = np.where(mask, np.clip(dens * 1.35, 0, 1), 0)
        alpha = ndimage.gaussian_filter(alpha, sigma=0.6)

        rgba = np.dstack([np.array(img), (alpha * 255).astype(np.uint8)])
        pad = 10
        crop = rgba[max(0, y0-pad):y1+pad, max(0, x0-pad):x1+pad]

        # the caption below the feet gets bridged into the figure by the ground
        # strokes; drop anything past the last clear horizontal gap if what
        # follows is short and wide, i.e. a word rather than a body
        rows = (crop[..., 3] > 40).sum(axis=1)
        ch = crop.shape[0]
        gaps = []
        run = None
        for y in range(ch):
            if rows[y] <= 3:
                run = y if run is None else run
            else:
                if run is not None and y - run > 12:
                    gaps.append((run, y))
                run = None
        for g0, g1 in reversed(gaps):
            tail = crop[g1:]
            tail_rows = (tail[..., 3] > 40)
            if not tail_rows.any():
                continue
            th = tail.shape[0]
            tw = np.nonzero(tail_rows.any(axis=0))[0]
            if th < ch * 0.14 and th < (tw.max() - tw.min()) * 0.7:
                crop = crop[:g0]
                print(f"    trimmed caption below y={g0}")
            break
        p = OUT / f"{name}.png"
        Image.fromarray(crop, mode="RGBA").save(p)
        print(f"  {name:14} {crop.shape[1]}x{crop.shape[0]}  -> {p.name}")


SHEETS = {
    "turnaround": ("Gemini_Generated_Image_262ar2262ar2262a.jpeg",
                   ["front", "right-profile", "left-profile", "back"]),
    "seated":     ("Gemini_Generated_Image_2oahju2oahju2oah.jpeg", ["seated"]),
}

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "turnaround"
    fname, names = SHEETS[which]
    split(pathlib.Path.home()/"Downloads"/fname, names)
