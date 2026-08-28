# O Inquilino — Tour

An interactive staging of Dani's poem *O Inquilino*, built on the structural idea
behind [santionispirits.com](https://santionispirits.com) (Active Theory / Hydra):
**there is no page. There is one continuous world, and scrolling is time.**

This build covers **Canto I, parte ✳** — the first part. Each part of a canto is a scene.

---

## Run it

```bash
npm install
npm run dev      # http://127.0.0.1:5180
npm run build    # static bundle in dist/
```

Add `?debug` to the URL for `window.SCENE`, `window.SCRUB`, `window.FILM`,
`JUMP(t)` to settle the rig at any playhead position, and keys `1–4` to jump to beats.

---

## The concept

The part has four paragraphs. Each becomes a **beat** — a station in one corridor
that is also the inside of a rented body:

| beat | line | what the world does |
|---|---|---|
| `acordar` | *Hoje eu acordei estranho…* | an iris opens; a figure of dust waits down the corridor |
| `coracao` | *O meu coração não era meu…* | you reach it; a dark heart beats **out of sync** with everything, hung on a thread |
| `lucidez` | *…arranhava as paredes da minha cabeça* | a cold lamp flares, the image trembles, scratches carve themselves into the walls and ceiling |
| `rastro` | *…o rastro de terra, de brita, de chão* | the body comes apart, the heart falls to the floor and is dragged ahead of you, scraping a trail |

Choices worth keeping when you extend this:

- **The heart is the only colour.** Everything else is bone and void.
- **Its pulse is deliberately offset** from the audio and from your input — you hear a
  heart you do not drive. That is the whole poem in one parameter (`heart.desync`).
- **The threshold** ("Você está em seu corpo?") answers the same either way. SIM →
  *mentira. mas entra.* NÃO → *nem eu. entra assim mesmo.*
- **Nothing is downloaded that can be drawn.** The body is a figure painted into a 2D
  canvas and rejection-sampled into 26k points. The heartbeat is synthesised with
  WebAudio. There are no models, no textures, no audio files.

---

## Structure

```
src/
  main.js                  boot, threshold, loader, frame loop, HUD
  config/canto-i-p1.json   ← every tunable value lives here (the "mini-UIL")
  poem/cantoI.js           the verbatim text, split into beats
  scenes/CantoI_P1.js      the world: corridor, body, heart, scratches, trail, stanzas
  core/
    Scrubber.js            virtual playhead — the document never scrolls
    Post.js                one combined pass: iris, tremor, bleed, grain, vignette, grade
    Silhouette.js          the drawn figure → point cloud
    Heartbeat.js           synthesised lub-dub + room tone
```

`config/canto-i-p1.json` is the analogue of Active Theory's UIL: camera stations,
shader uniforms, particle counts, beat windows. **Tune the piece there, not in the
shaders.** Santioni ships 3,612 such values; this ships about 90.

---

## How the camera works

`camera.stations` gives one z per beat boundary. Within a beat the camera eases
between its two stations, so it **arrives and dwells** at each station rather than
gliding at constant speed. That dwell is what makes a beat readable.

Stanzas are *not* welded to the corridor. While a stanza is being read it holds
`text.readDistance` in front of the camera (drifting in from `text.approach` further
back as it fades up); when it starts fading out it freezes in place and the camera
passes through it. This keeps every line legible regardless of camera speed.

---

## Extending to the rest of the poem

*O Inquilino* has six cantos and 22 parts. To add one:

1. Add its beats to `src/poem/`, verbatim — including the punctuation.
2. Copy `config/canto-i-p1.json`, set `beats` (one window per paragraph) and
   `camera.stations` (one more entry than there are beats).
3. Write a scene class exposing `buildText()`, `resize()`, `update(t, time, dt)`
   returning `{ lucid, beat, tremor }`. Reuse the corridor/points/scratch builders.

The three-file triad (poem / config / scene) is the same shape Santioni uses for its
eighteen scenes, and it is what makes adding the nineteenth cheap.

## Not built yet

- Voiceover. The structure is ready for it (a timestamp array per beat, the way
  Santioni syncs `vo/all_timestamps`) — it needs Dani's voice reading the part.
- A mobile pass. It runs, but the corridor was framed for landscape.
- Parts ✳✳ through ✳✳✳✳✳ of Canto I.
