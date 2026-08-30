import { el } from './Skeleton.js';

/**
 * Landscapes — one per canto, six in all.
 *
 * The old build had a single corridor behind the whole poem, so twenty-four
 * parts looked identical while the writing changed completely. Each canto now
 * gets its own dark, near-empty place, built from a handful of shapes and
 * moved by the playhead. None of them illustrate a line; they are the shape of
 * the feeling the canto happens inside.
 *
 * Coordinates are in a 1000x520 viewBox. The horizon sits around y=380 when a
 * canto has one at all.
 */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function scatter(root, n, cls, seedFn) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const c = el('circle', { class: cls, r: 0.8 });
    root.appendChild(c);
    list.push({ node: c, ...seedFn(i, n) });
  }
  return list;
}

/* ── I — the rented body ────────────────────────────────
   A floor, and one lit doorway far off that keeps narrowing. Nothing else.
   You are a guest in a room with one way out and it is closing.            */
function cantoI(root) {
  const floor = el('line', { class: 'edge', x1: 0, y1: 380, x2: 1000, y2: 380 });
  const glow = el('rect', { class: 'glow', x: 496, y: 250, width: 8, height: 130 });
  const jamb = el('rect', { class: 'form', x: 494, y: 248, width: 12, height: 132,
                            fill: 'none', 'stroke-width': 0.8 });
  root.append(floor, glow, jamb);

  return (t) => {
    const w = lerp(26, 2.5, clamp01(t));
    glow.setAttribute('x', 500 - w / 2); glow.setAttribute('width', w);
    jamb.setAttribute('x', 500 - w / 2 - 2); jamb.setAttribute('width', w + 4);
    glow.setAttribute('opacity', lerp(0.5, 0.14, t));
  };
}

/* ── II — the room, the hunger ──────────────────────────
   Two masses press in from the sides and the ceiling comes down. The place
   does not contain him so much as reduce him.                              */
function cantoII(root) {
  const L = el('rect', { class: 'mass', x: -420, y: 0, width: 420, height: 520 });
  const R = el('rect', { class: 'mass', x: 1000, y: 0, width: 420, height: 520 });
  const ceil = el('line', { class: 'edge', x1: 0, y1: 40, x2: 1000, y2: 40 });
  const floor = el('line', { class: 'edge', x1: 0, y1: 380, x2: 1000, y2: 380 });
  root.append(L, R, ceil, floor);

  return (t) => {
    const k = clamp01(t);
    L.setAttribute('x', lerp(-420, -170, k));
    R.setAttribute('x', lerp(1000, 750, k));
    const y = lerp(40, 232, k * k);
    ceil.setAttribute('y1', y); ceil.setAttribute('y2', y);
  };
}

/* ── III — running out, the hole ────────────────────────
   No ground at all. A slow drip, and points that drift apart and never meet:
   nothing here touches anything.                                           */
function cantoIII(root) {
  const hole = el('ellipse', { class: 'hole', cx: 500, cy: 470, rx: 120, ry: 26 });
  const drop = el('circle', { class: 'drip', cx: 500, cy: 120, r: 2.2 });
  root.append(hole, drop);
  const dust = scatter(root, 46, 'dust', (i, n) => ({
    a: (i / n) * Math.PI * 2, r0: 30 + (i % 7) * 26, y: 90 + ((i * 37) % 260)
  }));

  return (t, time) => {
    const k = clamp01(t);
    const fall = (time * 0.22) % 1;
    drop.setAttribute('cy', lerp(120, 452, fall));
    drop.setAttribute('opacity', 1 - fall * 0.7);
    hole.setAttribute('rx', lerp(120, 190, k));
    hole.setAttribute('opacity', lerp(0.35, 0.75, k));
    for (const d of dust) {
      const r = d.r0 * (1 + k * 1.9);
      d.node.setAttribute('cx', 500 + Math.cos(d.a) * r);
      d.node.setAttribute('cy', d.y + Math.sin(d.a) * r * 0.32);
      d.node.setAttribute('opacity', lerp(0.5, 0.08, k));
    }
  };
}

/* ── IV — the earth, the appetite ───────────────────────
   A heavy ground that swells and settles like something breathing under it,
   and marks below the surface that never quite surface.                    */
function cantoIV(root) {
  const ground = el('path', { class: 'mass' });
  const line = el('path', { class: 'edge', fill: 'none' });
  root.append(ground, line);
  const buried = scatter(root, 22, 'dust', (i) => ({ x: 60 + i * 42, d: (i % 5) * 0.6 }));

  const shape = (bulge, time) => {
    let d = 'M0,520 L0,380';
    for (let x = 0; x <= 1000; x += 50) {
      const y = 380 - Math.sin((x / 1000) * Math.PI) * bulge
                    - Math.sin(x * 0.011 + time * 0.5) * 5 * (bulge / 46);
      d += ` L${x},${y.toFixed(1)}`;
    }
    return d + ' L1000,520 Z';
  };

  return (t, time) => {
    const bulge = lerp(6, 46, clamp01(t));
    const d = shape(bulge, time);
    ground.setAttribute('d', d);
    line.setAttribute('d', d.replace(/^M0,520 L/, 'M').replace(/ L1000,520 Z$/, ''));
    for (const b of buried) {
      const y = 380 - Math.sin((b.x / 1000) * Math.PI) * bulge + 14
              + Math.sin(time * 0.7 + b.d) * 3;
      b.node.setAttribute('cx', b.x); b.node.setAttribute('cy', y);
      b.node.setAttribute('opacity', 0.10 + 0.22 * Math.abs(Math.sin(time * 0.4 + b.d)));
    }
  };
}

/* ── V — you ────────────────────────────────────────────
   The only canto with someone else in it. The ground lifts, a second figure
   is there, and by the end the ground has dropped and there are two holes.  */
function cantoV(root) {
  const floor = el('line', { class: 'edge', x1: 0, y1: 380, x2: 1000, y2: 380 });
  const h1 = el('ellipse', { class: 'hole', cx: 430, cy: 380, rx: 0, ry: 5 });
  const h2 = el('ellipse', { class: 'hole', cx: 570, cy: 380, rx: 0, ry: 5 });
  root.append(floor, h1, h2);

  return (t) => {
    const k = clamp01(t);
    const y = lerp(380, 344, Math.sin(Math.min(k, 0.66) * Math.PI * 0.75));
    floor.setAttribute('y1', y); floor.setAttribute('y2', y);
    h1.setAttribute('cy', y); h2.setAttribute('cy', y);
    const dig = clamp01((k - 0.62) / 0.38);
    h1.setAttribute('rx', dig * 34); h2.setAttribute('rx', dig * 34);
  };
}

/* ── VI — the solitude, the dance ───────────────────────
   An empty field, ash coming down slowly, and a ring worn into the ground
   from going round it. He is the only thing standing.                      */
function cantoVI(root) {
  const floor = el('line', { class: 'edge', x1: 0, y1: 380, x2: 1000, y2: 380 });
  const ring = el('ellipse', { class: 'ring', cx: 500, cy: 392, rx: 0, ry: 12, fill: 'none' });
  root.append(floor, ring);
  const ash = scatter(root, 60, 'ash', (i, n) => ({
    x: (i * 997) % 1000, sp: 0.25 + ((i * 13) % 10) / 22, ph: (i / n) * 6.28
  }));

  return (t, time) => {
    const k = clamp01(t);
    ring.setAttribute('rx', lerp(0, 92, k));
    ring.setAttribute('opacity', lerp(0, 0.5, k));
    for (const a of ash) {
      const f = ((time * a.sp * 0.12) + a.ph / 6.28) % 1;
      a.node.setAttribute('cx', a.x + Math.sin(time * 0.3 + a.ph) * 16);
      a.node.setAttribute('cy', lerp(-10, 384, f));
      a.node.setAttribute('opacity', (1 - f) * 0.5 * (0.35 + k * 0.65));
    }
  };
}

const BUILDERS = { 'Canto I': cantoI, 'Canto II': cantoII, 'Canto III': cantoIII,
                   'Canto IV': cantoIV, 'Canto V': cantoV, 'Canto VI': cantoVI };

/** the horizon each canto stands on, so the figure knows where the floor is */
export const GROUND = {
  'Canto I': 380, 'Canto II': 380, 'Canto III': 452,
  'Canto IV': 372, 'Canto V': 380, 'Canto VI': 380
};

export function buildLandscape(root, canto) {
  const g = el('g', { class: `landscape ${canto.replace(/\s+/g, '-').toLowerCase()}` });
  root.appendChild(g);
  const update = (BUILDERS[canto] || cantoI)(g);
  return { node: g, update };
}
