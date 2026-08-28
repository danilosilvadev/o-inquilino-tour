/**
 * Silhouette — the body is not a model. It is drawn, then dissolved into dust.
 * A standing figure is painted into an offscreen 2D canvas, its opaque pixels
 * are rejection-sampled into a point cloud. No asset, no download, and the
 * shape stays editable as a drawing rather than a mesh.
 */
export function sampleFigure(count, heightUnits) {
  const W = 220;
  const H = 440;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';

  const cx = W * 0.5;

  // head
  g.beginPath();
  g.ellipse(cx, H * 0.085, W * 0.098, H * 0.058, 0, 0, Math.PI * 2);
  g.fill();

  // neck
  g.fillRect(cx - W * 0.032, H * 0.128, W * 0.064, H * 0.035);

  // torso — narrow, sunken, tapering to the hips
  g.beginPath();
  g.moveTo(cx - W * 0.145, H * 0.163);
  g.bezierCurveTo(cx - W * 0.175, H * 0.30, cx - W * 0.125, H * 0.40, cx - W * 0.115, H * 0.50);
  g.lineTo(cx + W * 0.115, H * 0.50);
  g.bezierCurveTo(cx + W * 0.125, H * 0.40, cx + W * 0.175, H * 0.30, cx + W * 0.145, H * 0.163);
  g.closePath();
  g.fill();

  // arms — hanging, slightly away from the body, one longer (the one that drags)
  arm(g, cx - W * 0.15, H * 0.18, cx - W * 0.235, H * 0.36, cx - W * 0.205, H * 0.545, W * 0.035);
  arm(g, cx + W * 0.15, H * 0.18, cx + W * 0.245, H * 0.375, cx + W * 0.30, H * 0.60, W * 0.035);

  // legs
  leg(g, cx - W * 0.058, H * 0.50, cx - W * 0.085, H * 0.73, cx - W * 0.072, H * 0.965, W * 0.046);
  leg(g, cx + W * 0.058, H * 0.50, cx + W * 0.082, H * 0.73, cx + W * 0.070, H * 0.965, W * 0.046);

  const data = g.getImageData(0, 0, W, H).data;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const aspect = W / H;
  const hh = heightUnits;
  const hw = hh * aspect;

  let written = 0;
  let guard = 0;
  while (written < count && guard < count * 400) {
    guard++;
    const px = Math.floor(Math.random() * W);
    const py = Math.floor(Math.random() * H);
    const alpha = data[(py * W + px) * 4];      // red channel === coverage
    if (alpha < 128) continue;

    const i3 = written * 3;
    const i4 = written * 4;
    // jitter inside the pixel so the cloud does not read as a grid
    positions[i3]     = ((px + Math.random()) / W - 0.5) * hw;
    positions[i3 + 1] = (1 - (py + Math.random()) / H - 0.5) * hh;
    positions[i3 + 2] = (Math.random() - 0.5) * hh * 0.085;   // shallow depth — a relief, not a body
    seeds[i4]     = Math.random();
    seeds[i4 + 1] = Math.random();
    seeds[i4 + 2] = Math.random();
    // vertical rank 0(feet) → 1(head): drives the sag and the dispersion order
    seeds[i4 + 3] = 1 - py / H;
    written++;
  }

  return { positions, seeds, count: written };
}

function arm(g, x0, y0, x1, y1, x2, y2, w) {
  limb(g, x0, y0, x1, y1, x2, y2, w, w * 0.72);
}
function leg(g, x0, y0, x1, y1, x2, y2, w) {
  limb(g, x0, y0, x1, y1, x2, y2, w, w * 0.62);
}
function limb(g, x0, y0, x1, y1, x2, y2, wTop, wBottom) {
  const steps = 26;
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = quad(x0, y0, x1, y1, x2, y2, t);
    const w = wTop + (wBottom - wTop) * t;
    if (i === 0) g.moveTo(p.x - w, p.y);
    else g.lineTo(p.x - w, p.y);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const p = quad(x0, y0, x1, y1, x2, y2, t);
    const w = wTop + (wBottom - wTop) * t;
    g.lineTo(p.x + w, p.y);
  }
  g.closePath();
  g.fill();
}
function quad(x0, y0, x1, y1, x2, y2, t) {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * x1 + t * t * x2,
    y: u * u * y0 + 2 * u * t * y1 + t * t * y2
  };
}
