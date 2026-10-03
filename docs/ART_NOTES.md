# Art Notes (Art Designer)

Procedural Canvas2D, everything in `src/art/`. Preview: `npx vite`, then open `/src/art/preview.html`
(`?only=scene|qubbles|cast|closeup|room|map`, `&t=3.3` freezes time, `&night=1`).

## Palette and line
- Anchor colours: paper `#f2f0eb`, ink `#0e0e0e`, red `#fe443d` (BEEP and Flipper only), Sunny `#ffb72b` (|0>), Moony `#6c63ff` (|1>), Phasey `#b04dff`, mint `#3ddc97` (pass / QUIET).
- Ink outline is 2.5px at s=1 (`LINE`), with round joins. Details use 1.2 to 2px. Shadows are soft radial ellipses.
- **Readability rule:** Sunny and Moony mean a dream state, so props, quilts, the caretaker and the UI never use pure Sunny or Moony as a large fill. Quilts are pink/teal/cream. The caretaker is mint with a pink cap. Red is reserved for BEEP, Flipper and danger.

## Bloch → Qubble visuals
- Body colour = mix(Moony, Sunny, (1+z)/2). The poles are pure.
- Equatorial strength e = √(x²+y²) shows a two-tone swirl. The Sunny half points along φ = atan2(y,x) (screen angle, CCW from +x), and the chirality = cos φ. So + and − are mirror images, and ±i is a straight split (Sunny up for +i, down for −i). Sparkles flow along the seam in the chirality direction. The rim back-light hue follows φ.
- r = |b| < 1 makes the qubble misty: desaturated, semi-transparent, with a fog halo and drifting puffs. r≈0 is a grey ghost.
- `blanket`: 1 = an opaque quilt bump (the face is hidden, it snores). Below 1 the quilt is translucent with a dashed edge (X-ray ≈ 0.25).
- `collapsed`: flat single colour, squashed, with dizzy spiral eyes. `classical`: a flat bit-ball with a sleep mask and 0/1.

## Sizes and anchors (s = 1 is tuned for an iso tile of 96×48 px; the engine passes s = TW/96)
| Thing | Anchor | Approx size at s=1 |
|---|---|---|
| Qubble (+ bed) | ground centre | body 42×38, bed ellipse 60×28 |
| Ancillabot | wheel contact point | ~32 wide, ~58 tall with antenna |
| Caretaker | feet | ~36 wide, ~64 tall (cap pompom swings ~25 to the back) |
| Gremlins / Schrödi | ground centre | ~40–50 tall |
| Sign | hanging nail (top centre) | width follows the text |
| Map island | floor centre | floor 180×90, walls +58 up, underside +80 down |
| Map node | pillow centre | 64×44, moons at +30 below, hover title at −40 |

## Room (v0.2, `drawRoom`)
The floor uses the same grid as `drawFloor`, plus a 0.42-tile trim margin. The two back walls (gx = −m and gy = −m) are 2.6 tile-heights tall (≈125·s px above the back corner) and 0.2 tiles thick, with a cut cap. The front floor slab is 22·s deep. There's no island underside. Static parts are cached per geometry and DPR (day and night layers cross-faded by `night`). The clock hands, window twinkles and the nightlight glow are drawn live.

## Caretaker (`drawCaretaker`)
`phase` 0..1 has contact at 0.5: boop (finger reach), shush (finger to lips and a "shh" puff), spin (hands twirl), peek (flashlight cone when `flashlight`), listen (cupped ear and sound arcs), press (floating red button), cheer, facepalm, yawn, and tiptoe (a walk cycle driven by `t`). Idle yawns about every 7 s.

## Performance
Floor, room, sky and map backdrop are cached on offscreen canvases. Entities use only gradients and paths. 20+ entities run at 60 fps.
