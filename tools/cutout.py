#!/usr/bin/env python3
"""
Lift the boy off his paper.

u2net reads a charcoal drawing as texture and eats the head, so this uses
isnet-general-use, which holds fine dark detail against a dark ground far
better. The alpha is then cleaned: holes inside the figure are filled, because
in a drawing the "gaps" are just places the artist left the paper showing.
"""
from rembg import remove, new_session
from PIL import Image
import numpy as np, pathlib, sys
from scipy import ndimage

SRC = pathlib.Path.home()/"Downloads"/"Gemini_Generated_Image_tcxc55tcxc55tcxc.jpeg"
OUT = pathlib.Path(__file__).resolve().parent.parent/"public"/"character"

def main(model="isnet-general-use"):
    img = Image.open(SRC).convert("RGB")
    out = remove(img, session=new_session(model), post_process_mask=False).convert("RGBA")
    alpha = np.array(out)[..., 3]

    # isnet is confident about him and vague about the paper he sits on, so cut
    # high and keep only what it is sure of
    solid = alpha > 150

    # close pin-holes the scribble leaves inside him, but nothing large enough
    # to be background: fill holes, then reject any fill bigger than a limb
    filled = ndimage.binary_fill_holes(solid)
    holes = filled & ~solid
    lab, n = ndimage.label(holes)
    if n:
        sizes = ndimage.sum(holes, lab, range(1, n + 1))
        big = {i + 1 for i, sz in enumerate(sizes) if sz > 0.004 * alpha.size}
        for i in big:
            filled[lab == i] = False

    # keep the single largest piece — drops speckle isnet left in the corners
    lab, n = ndimage.label(filled)
    if n > 1:
        sizes = ndimage.sum(filled, lab, range(1, n + 1))
        filled = lab == (int(np.argmax(sizes)) + 1)

    new_alpha = (filled * 255).astype(np.uint8)
    new_alpha = ndimage.gaussian_filter(new_alpha, sigma=1.0)

    # rembg premultiplies its RGB, so take colour from the untouched drawing
    rgb = np.array(img)
    res = Image.fromarray(np.dstack([rgb, new_alpha]).astype(np.uint8), mode="RGBA")

    ys, xs = np.nonzero(new_alpha > 12)
    pad = 6
    res = res.crop((max(0, xs.min()-pad), max(0, ys.min()-pad),
                    min(res.width, xs.max()+pad), min(res.height, ys.max()+pad)))
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT/"boy.png"
    res.save(p)
    print(f"model={model} kept={100*(new_alpha>12).mean():.1f}% size={res.size} -> {p}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "isnet-general-use")
