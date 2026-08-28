#!/usr/bin/env python3
"""
Cut a standing view into rigid parts for cutout animation.

Rigid is the whole point: parts are rotated and moved, never stretched, so the
charcoal grain is preserved exactly as drawn. Joints overlap so a rotation
cannot open a seam.

Alpha here is the FILLED silhouette, not ink density — inside the outline the
paper belongs to him, and in a dark corridor that paper is what catches light.
"""
import json, numpy as np, pathlib
from PIL import Image
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
CH = ROOT / "public" / "character"

# measured from the silhouette profile of back.png
JOINTS = {"neck": 0.17, "hip": 0.62, "legSplit": 0.505}   # fractions of h, and x of w
PARTS = [
    # name    y0     y1     x0     x1    pivot (x,y) in figure fractions
    ("upper", 0.00, 0.665, 0.00, 1.00, (0.500, 0.620)),
    ("legL",  0.575, 1.00, 0.06, 0.525, (0.375, 0.605)),
    ("legR",  0.575, 1.00, 0.475, 0.94, (0.630, 0.605)),
]


def main(view="back"):
    src = CH / f"{view}.png"
    img = Image.open(src).convert("RGBA")
    a = np.array(img)
    H, W = a.shape[:2]

    # solid silhouette: close the open charcoal outline, then fill it
    ink = a[..., 3] > 45
    closed = ndimage.binary_closing(ink, np.ones((13, 13)))

    # the ground strokes bridge his shoes, which turns the gap between his legs
    # into an enclosed hole. Fill the small holes; leave the big ones open.
    solid = ndimage.binary_fill_holes(closed)
    holes = solid & ~closed
    lab_h, nh = ndimage.label(holes)
    if nh:
        sizes = ndimage.sum(holes, lab_h, range(1, nh + 1))
        for i, sz in enumerate(sizes):
            if sz > 0.010 * ink.size:
                solid[lab_h == i + 1] = False
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        solid = lab == int(np.argmax(sizes)) + 1
    alpha = ndimage.gaussian_filter((solid * 255).astype(np.uint8), sigma=1.1)

    rgb = a[..., :3]
    manifest = {"view": view, "source": [W, H], "joints": JOINTS, "parts": []}

    for name, y0, y1, x0, x1, (px, py) in PARTS:
        Y0, Y1 = int(y0 * H), int(y1 * H)
        X0, X1 = int(x0 * W), int(x1 * W)
        piece = np.dstack([rgb, alpha])[Y0:Y1, X0:X1].copy()

        # feather the cut edge so overlapping parts blend instead of stacking
        ph, pw = piece.shape[:2]
        if name == "upper":
            fade = np.clip(np.linspace(1, 0, max(1, int(ph * 0.10)))[:, None], 0, 1)
            piece[-fade.shape[0]:, :, 3] = (piece[-fade.shape[0]:, :, 3] * fade).astype(np.uint8)
        else:
            fade = np.clip(np.linspace(0, 1, max(1, int(ph * 0.14)))[:, None], 0, 1)
            piece[:fade.shape[0], :, 3] = (piece[:fade.shape[0], :, 3] * fade).astype(np.uint8)

        out = CH / f"{view}-{name}.png"
        Image.fromarray(piece, mode="RGBA").save(out)

        manifest["parts"].append({
            "name": name,
            "file": f"character/{view}-{name}.png",
            "size": [pw, ph],
            # where the piece sits, and where it turns, in figure fractions
            "rect": [x0, y0, x1, y1],
            "pivot": [(px - x0) / (x1 - x0), (py - y0) / (y1 - y0)],
            "pivotFigure": [px, py],
        })
        print(f"  {name:6} {pw}x{ph}  pivot in piece "
              f"({manifest['parts'][-1]['pivot'][0]:.3f}, {manifest['parts'][-1]['pivot'][1]:.3f})")

    (ROOT / "src" / "config" / f"figure-{view}.json").write_text(
        json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"-> src/config/figure-{view}.json")


if __name__ == "__main__":
    main()
