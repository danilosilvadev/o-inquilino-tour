/**
 * render.mjs — one chunk of the film, as frames.
 *
 * The piece runs on the wall clock, which is right for a reader and wrong for
 * a camera: anything that stutters becomes a jump in the file. So nothing here
 * waits. The page is asked for an exact moment, it draws it, the frame goes
 * down the pipe to ffmpeg, and the clock moves on by one frame. Same input,
 * same output, however long the machine takes.
 *
 * A chunk is one of: intro | card:<canto> | part:<i> | end. Chunks are
 * independent, so they render in parallel and concatenate afterwards — and a
 * part chunk is exactly one scene, which is the reel.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const CHUNK = arg('chunk', 'intro');
const ASPECT = arg('aspect', '16x9');
const OUT = arg('out', 'video/chunk.mp4');
const FPS = +arg('fps', 24);
const URL = arg('url', 'http://127.0.0.1:5201/?render');
const CRF = arg('crf', '18');

// Vertical is laid out at phone width and scaled up to 1080x1920, so the
// stanzas get the mobile measure and read at arm's length. Rendering straight
// at 1080 CSS px puts it above the 900px breakpoint and the type comes out
// desktop-sized in a tall frame — legible on a monitor, tiny on a phone.
const SIZE = ASPECT === '9x16' ? { width: 720, height: 1280 } : { width: 1920, height: 1080 };
const DSF = ASPECT === '9x16' ? 1.5 : 1;
const T = { title: 20.0, titleOut: 1.4, cardIn: 0.9, cardHold: 3.6, cardOut: 1.8,
            burn: 2.8, burnCanto: 4.2, fim: 8.0, fimIn: 1.6 };
const ease = (x) => x * x * (3 - 2 * x);

mkdirSync(path.dirname(OUT), { recursive: true });
const ff = spawn('ffmpeg', ['-y','-hide_banner','-loglevel','error',
  '-f','image2pipe','-c:v','mjpeg','-r',String(FPS),'-i','-',
  '-c:v','libx264','-preset','medium','-crf',CRF,'-pix_fmt','yuv420p',
  '-r',String(FPS),'-g',String(FPS*2),'-movflags','+faststart', OUT]);
ff.stderr.on('data', (d) => process.stderr.write(d));

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined,
  args: ['--force-color-profile=srgb','--hide-scrollbars','--disable-lcd-text'] });
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: DSF });
page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('!!window.RENDER', null, { timeout: 60000 });
// every fade here is drawn frame by frame; the CSS ones would smear across
await page.addStyleTag({ content:
  `*,*::before,*::after{transition:none !important}#chrome{display:none !important}.rotate{display:none !important}` });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.RENDER.chrome(false));
const cdp = await page.context().newCDPSession(page);
// Playwright's deviceScaleFactor does not reach a raw CDP capture, which comes
// back at CSS size; say it again where the screenshots are actually taken
if (DSF !== 1) await cdp.send('Emulation.setDeviceMetricsOverride',
  { width: SIZE.width, height: SIZE.height, deviceScaleFactor: DSF, mobile: false });

let frames = 0;
const shoot = async () => {
  const { data } = await cdp.send('Page.captureScreenshot',
    { format: 'jpeg', quality: 94, captureBeyondViewport: false });
  const buf = Buffer.from(data, 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  frames++;
};
const span = (s) => Math.max(1, Math.round(s * FPS));
const started = Date.now();
const tick = () => process.stdout.write(
  `\r  ${CHUNK} ${ASPECT}: ${frames} frames · ${(frames / ((Date.now() - started) / 1000)).toFixed(1)} fps  `);

const PARTS = await page.evaluate(() => window.RENDER.parts);

const card = async (name) => {
  for (let f = 0; f < span(T.cardIn); f++) {
    await page.evaluate(({ n, a }) => window.RENDER.card(n, 1, a), { n: name, a: ease(f / span(T.cardIn)) });
    await shoot();
  }
  for (let f = 0; f < span(T.cardHold); f++) {
    await page.evaluate((n) => window.RENDER.card(n, 1, 1), name); await shoot();
  }
  for (let f = 0; f < span(T.cardOut); f++) {
    const a = ease(f / span(T.cardOut));
    await page.evaluate(({ n, k }) => window.RENDER.card(n, 1 - k, 1 - k), { n: name, k: a });
    await shoot();
  }
  await page.evaluate(() => window.RENDER.cardHide());
};

const meta = { chunk: CHUNK, aspect: ASPECT, fps: FPS };

if (CHUNK === 'intro') {
  const ms = await page.evaluate(() => window.RENDER.titleBuild());
  const n = span(T.title);
  for (let f = 0; f < n; f++) {
    await page.evaluate((v) => window.RENDER.titleFrame(v), (f / n) * ms);
    await shoot(); if (f % 24 === 0) tick();
  }
  const o = span(T.titleOut);
  for (let f = 0; f < o; f++) {
    const k = ease(f / o);
    await page.evaluate(({ k, ms }) => {
      window.RENDER.titleFrame(ms);
      document.getElementById('intro').style.opacity = String(1 - k);
      window.RENDER.card('', k, 0);
    }, { k, ms });
    await shoot();
  }
  await page.evaluate(() => window.RENDER.titleHide());
  await card(PARTS[0].canto);
} else if (CHUNK.startsWith('card:')) {
  await card(CHUNK.slice(5));
} else if (CHUNK.startsWith('part:')) {
  const i = +CHUNK.slice(5);
  const p = PARTS[i];
  const next = PARTS[i + 1];
  const crossing = !next || next.canto !== p.canto;
  await page.evaluate((n) => window.RENDER.part(n), i);
  await page.evaluate(() => window.RENDER.chrome(false));
  const n = span(p.seconds);
  for (let f = 0; f < n; f++) {
    await page.evaluate(({ t, time }) => window.RENDER.frame(t, time),
      { t: f / (n - 1), time: f / FPS });
    await shoot(); if (f % 48 === 0) tick();
  }
  const bn = span(crossing ? T.burnCanto : T.burn);
  for (let f = 0; f < bn; f++) {
    await page.evaluate(({ k, time }) => window.RENDER.burn(k, time),
      { k: f / (bn - 1), time: (n + f) / FPS });
    await shoot();
  }
  Object.assign(meta, { id: p.id, canto: p.canto, mark: p.mark });
} else if (CHUNK === 'end') {
  for (let f = 0; f < span(T.fim); f++) {
    await page.evaluate((a) => window.RENDER.end(a), ease(Math.min(1, f / span(T.fimIn))));
    await shoot();
  }
}

tick(); process.stdout.write('\n');
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
meta.frames = frames; meta.seconds = +(frames / FPS).toFixed(3);
writeFileSync(OUT.replace(/\.mp4$/, '.json'), JSON.stringify(meta, null, 1));
console.log(`  ${CHUNK} ${ASPECT} → ${OUT} (${meta.seconds}s)`);
