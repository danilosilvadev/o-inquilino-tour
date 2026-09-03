/**
 * film.mjs — assemble the poem into films.
 *
 * Renders every chunk in parallel, concatenates them in order, builds the
 * score to match the cut, and muxes. A part chunk is one scene, so the same
 * files become the reels — no second render and no re-cutting.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ASPECT = arg('aspect', '16x9');
const FPS = +arg('fps', 24);
const JOBS = +arg('jobs', Math.max(2, Math.min(5, cpus().length - 3)));
const DIR = `video/${ASPECT}`;
const OUT = arg('out', `video/o-inquilino-${ASPECT === '9x16' ? 'vertical' : '1080p'}.mp4`);

const run = (cmd, args, quiet = true) => new Promise((res, rej) => {
  const c = spawn(cmd, args, { stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  let err = '';
  if (quiet) { c.stderr.on('data', (d) => (err += d)); c.stdout.on('data', () => {}); }
  c.on('close', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${code}: ${err.slice(-600)}`))));
});

mkdirSync(DIR, { recursive: true });
const parts = JSON.parse(readFileSync('src/poem/parts.json', 'utf8'));

// the running order
const plan = [{ chunk: 'intro', file: `${DIR}/00-intro.mp4` }];
parts.forEach((p, i) => {
  if (i > 0 && p.canto !== parts[i - 1].canto)
    plan.push({ chunk: `card:${p.canto}`, file: `${DIR}/${String(plan.length).padStart(2,'0')}-card-${p.canto.replace(/\s/g,'')}.mp4` });
  plan.push({ chunk: `part:${i}`, file: `${DIR}/${String(plan.length).padStart(2,'0')}-${p.id}.mp4`, id: p.id, canto: p.canto });
});
plan.push({ chunk: 'end', file: `${DIR}/${String(plan.length).padStart(2,'0')}-fim.mp4` });

// ── render, a few at a time ───────────────────────────
const todo = plan.filter((c) => !(existsSync(c.file) && existsSync(c.file.replace(/\.mp4$/, '.json'))));
console.log(`  ${plan.length} chunks, ${todo.length} to render, ${JOBS} at a time`);
let done = plan.length - todo.length, failed = [];
const queue = [...todo];
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (queue.length) {
    const c = queue.shift();
    try {
      await run('node', ['tools/render.mjs', '--chunk', c.chunk, '--aspect', ASPECT,
        '--out', c.file, '--fps', String(FPS)]);
    } catch (e) { failed.push(c.chunk); console.error(`\n  FAILED ${c.chunk}: ${e.message}`); }
    done++;
    process.stdout.write(`\r  rendered ${done}/${plan.length}   `);
  }
}));
process.stdout.write('\n');
if (failed.length) { console.error('  failed chunks:', failed.join(', ')); process.exit(1); }

// ── where everything lands in the finished film ───────
let at = 0;
const timeline = plan.map((c) => {
  const m = JSON.parse(readFileSync(c.file.replace(/\.mp4$/, '.json'), 'utf8'));
  const row = { ...c, start: +at.toFixed(3), seconds: m.seconds };
  at += m.seconds; row.end = +at.toFixed(3);
  return row;
});
const total = at;
const cantoV = timeline.find((r) => r.chunk === 'card:Canto V') || timeline.find((r) => r.canto === 'Canto V');
const SWITCH = cantoV ? cantoV.start : total * 0.6;
console.log(`  film ${(total / 60).toFixed(1)} min · Canto V at ${(SWITCH / 60).toFixed(1)} min`);

// ── the score, cut to match ───────────────────────────
// two pieces, as in the piece itself: the early bed until the register changes
// at Canto V, then the nocturne, crossfaded rather than cut, and gone by Fim
const A = `${DIR}/bed-a.wav`, B = `${DIR}/bed-b.wav`, SCORE = `${DIR}/score.wav`;
const XF = 7;
await run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-stream_loop','-1','-i','public/audio/bed.mp3',
  '-t', String(SWITCH + XF), '-af', 'afade=t=in:st=0:d=3', A]);
await run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-stream_loop','-1','-i','public/audio/bed-2.mp3',
  '-t', String(total - SWITCH + XF), B]);
await run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i',A,'-i',B,
  '-filter_complex', `[0][1]acrossfade=d=${XF}:c1=tri:c2=tri,afade=t=out:st=${Math.max(0,total-12).toFixed(2)}:d=12`,
  '-t', String(total), SCORE]);

// ── concatenate and mux ───────────────────────────────
const list = `${DIR}/order.txt`;
writeFileSync(list, timeline.map((r) => `file '${process.cwd()}/${r.file}'`).join('\n'));
const silent = `${DIR}/silent.mp4`;
await run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',list,'-c','copy',silent]);
await run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i',silent,'-i',SCORE,
  '-c:v','copy','-c:a','aac','-b:a','192k','-shortest', OUT]);

writeFileSync(`video/timeline-${ASPECT}.json`,
  JSON.stringify({ aspect: ASPECT, fps: FPS, seconds: +total.toFixed(3), cantoVAt: +SWITCH.toFixed(3), timeline }, null, 1));
console.log(`  wrote ${OUT}`);

// ── the reels: each scene, with its own slice of the score ──
if (ASPECT === '9x16') {
  mkdirSync('video/reels', { recursive: true });
  for (const r of timeline.filter((x) => x.id)) {
    const out = `video/reels/${r.id}.mp4`;
    await run('ffmpeg', ['-y','-hide_banner','-loglevel','error',
      '-i', r.file, '-ss', String(r.start), '-t', String(r.seconds), '-i', SCORE,
      '-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k',
      '-af', `afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0,r.seconds-2.5).toFixed(2)}:d=2.5`,
      '-shortest', out]);
    process.stdout.write(`\r  reel ${r.id}      `);
  }
  process.stdout.write('\n  wrote video/reels/\n');
}
