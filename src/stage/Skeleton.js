const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};
const rad = (d) => (d * Math.PI) / 180;

/**
 * Skeleton — a very small person, drawn with a dozen lines.
 *
 * Everything is angles. A pose is just numbers, so poses interpolate, and the
 * figure can be given a feeling by moving joints rather than by being redrawn.
 * It stays deliberately tiny: the landscape is the size of the feeling, and he
 * is the size of a person inside it.
 */

// bone lengths, in the figure's own units (head is roughly 2.4 tall)
const L = {
  spine: 13, neck: 3.4, head: 3.1,
  shoulder: 5.2, upperArm: 7.4, foreArm: 7.0,
  hip: 3.6, thigh: 8.6, shin: 8.4
};

/** angles are degrees from straight down; 0 hangs, +ve swings to the figure's left */
export const REST = {
  spine: 180, neckTilt: 0,
  armLU: 172, armLF: 176, armRU: -172, armRF: -176,
  legLU: 4, legLF: 2, legRU: -4, legRF: -2,
  lean: 0, crouch: 0
};

export class Skeleton {
  constructor(parent, { scale = 1, opacity = 1 } = {}) {
    this.g = el('g', { class: 'skeleton', opacity });
    this.inner = el('g');
    this.g.appendChild(this.inner);
    parent.appendChild(this.g);
    this.scale = scale;

    this.bones = {};
    const bone = (id, w = 1) => (this.bones[id] = el('line', {
      'stroke-width': w, 'stroke-linecap': 'round', class: 'bone'
    }));
    for (const id of ['spine', 'armLU', 'armLF', 'armRU', 'armRF',
                      'legLU', 'legLF', 'legRU', 'legRF', 'shoulders']) {
      this.inner.appendChild(bone(id, id === 'spine' ? 1.5 : 1.1));
    }
    this.head = el('circle', { r: L.head, class: 'head' });
    this.inner.appendChild(this.head);

    this.pose(REST);
  }

  setPosition(x, y, scale = this.scale) {
    this.scale = scale;
    this.g.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
  }

  setOpacity(v) { this.g.setAttribute('opacity', v); }

  /** @param {object} p angles, merged over REST */
  pose(p) {
    const a = { ...REST, ...p };
    const pt = (from, deg, len) => [
      from[0] + Math.sin(rad(deg)) * len,
      from[1] + Math.cos(rad(deg)) * len
    ];

    // the whole body leans and sinks from the hips
    const pelvis = [0, -a.crouch];
    const spineDeg = a.spine + a.lean;
    const neck = pt(pelvis, spineDeg, L.spine);
    const headC = pt(neck, spineDeg + a.neckTilt, L.neck + L.head * 0.55);

    const shL = pt(neck, spineDeg + 90, L.shoulder * 0.5);
    const shR = pt(neck, spineDeg - 90, L.shoulder * 0.5);
    const elL = pt(shL, a.armLU + a.lean, L.upperArm);
    const haL = pt(elL, a.armLF + a.lean, L.foreArm);
    const elR = pt(shR, a.armRU + a.lean, L.upperArm);
    const haR = pt(elR, a.armRF + a.lean, L.foreArm);

    const hpL = [pelvis[0] + L.hip * 0.5, pelvis[1]];
    const hpR = [pelvis[0] - L.hip * 0.5, pelvis[1]];
    const knL = pt(hpL, a.legLU, L.thigh);
    const ftL = pt(knL, a.legLF, L.shin);
    const knR = pt(hpR, a.legRU, L.thigh);
    const ftR = pt(knR, a.legRF, L.shin);

    const set = (id, p0, p1) => {
      const b = this.bones[id];
      b.setAttribute('x1', p0[0].toFixed(2)); b.setAttribute('y1', p0[1].toFixed(2));
      b.setAttribute('x2', p1[0].toFixed(2)); b.setAttribute('y2', p1[1].toFixed(2));
    };
    set('spine', pelvis, neck);
    set('shoulders', shL, shR);
    set('armLU', shL, elL); set('armLF', elL, haL);
    set('armRU', shR, elR); set('armRF', elR, haR);
    set('legLU', hpL, knL); set('legLF', knL, ftL);
    set('legRU', hpR, knR); set('legRF', knR, ftR);
    this.head.setAttribute('cx', headC[0].toFixed(2));
    this.head.setAttribute('cy', headC[1].toFixed(2));

    this.joints = { pelvis, neck, headC, haL, haR, ftL, ftR };
  }

  remove() { this.g.remove(); }
}

export { el, NS, L };
