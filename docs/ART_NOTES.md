# Art Notes (Art Designer)

Procedural Canvas2D, everything in `src/art/`. Preview: `npx vite`, then open `/src/art/preview.html`
(`?only=scene|qubbles|cast|closeup|room|map|actors`, `&t=3.3` freezes time, `&night=1`).

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
| Qubble (+ bed) | tile centre | body 42×38 sitting on the bed |
| Ancillabot | wheel contact point | ~32 wide, ~58 tall with antenna |
| Caretaker | feet | ~36 wide, ~64 tall (cap pompom swings ~25 to the back) |
| Gremlins / Schrödi (in box) | ground centre | ~40–50 tall |
| Schrödi actor (`drawSchrodiActor`) | feet | ~34 wide sitting (tail +18 behind), ~60 to the ear tips; walking ~44 long. hop-in/out: the box is AT the anchor and the cat lands 40·s toward `facing` |
| Sign (legacy `drawSign`) | hanging nail (top centre) | width follows the text |
| Wall sign (`drawWallSign`) | centre of the sign ON the wall surface | ≤106·s wide (≤2.2 tiles along a wall), ≤44·s tall; wraps to 2 lines, shrinks to fit |
| Bed (part of `drawQubble`) | tile centre (same as the qubble) | iso mattress 0.78×0.78 tile (≈75×37), 7·s thick, pillow at the back corner; the qubble sits 5·s up on it |
| Map island | floor centre | floor 180×90, walls +58 up, underside +80 down |
| Map node | pillow centre | 64×44, moons at +30 below, hover title at −40 |

## Room (v0.2, `drawRoom`)
The floor uses the same grid as `drawFloor`, plus a 0.42-tile trim margin. The two back walls (gx = −m and gy = −m) are 2.6 tile-heights tall (≈125·s px above the back corner) and 0.2 tiles thick, with a cut cap. The front floor slab is 22·s deep. There's no island underside. Static parts are cached per geometry and DPR (day and night layers cross-faded by `night`). The clock hands, window twinkles and the nightlight glow are drawn live.

## Caretaker (`drawCaretaker`)
`phase` 0..1 has contact at 0.5: boop (finger reach), shush (finger to lips and a "shh" puff), spin (hands twirl), peek (flashlight cone when `flashlight`), listen (cupped ear and sound arcs), press (floating red button), cheer, facepalm, yawn, and tiptoe (a walk cycle driven by `t`). Idle yawns about every 7 s. **Facing:** the WHOLE figure (head, face, cap tail, arms, slippers) is mirrored by `facing`, in every action; only the 'shh' text and the flashlight beam are computed unmirrored. v0.3 tiptoe is a slow, exaggerated sneak (≈0.57 steps/s per foot, driven by `t`): high knee lifts, a stride, a hunch, rising on each step, paws held up. The engine has to SET `facing` toward the target: it currently passes `facing: -1` for idle and for every action, so the kid always looks the same way.

## Performance
Floor, room, sky and map backdrop are cached on offscreen canvases. Entities use only gradients and paths. 20+ entities run at 60 fps.

## Room v0.3: walls, signs, rug, props
**Wall geometry.** Trim margin m = 0.42 tiles. The wall SURFACES are the planes gx = −0.42 (left wall, runs along +gy) and gy = −0.42 (right wall, runs along +gx). Wall length: Lr = cols + 0.84 (right), Ll = rows + 0.84 (left). u = tiles along the wall from the back corner, z = tile-heights up (TH units, iso gz).
A point on the right wall is `iso(-0.42 + u, -0.42, z)`, and on the left wall `iso(-0.42, -0.42 + u, z)`.

**Sign band (both walls):** z ∈ [0.98, 1.95], centre z = 1.45 (`SIGN_BAND`). Below it is the dado rail (0.78–0.86); above it is the bunting (lowest flag tip ≈ 2.04).

**Free spans** (no window, door, clock or shelves), in tiles from the back corner:
| Wall | Span u | 6×5 room (min) as fractions of the wall |
|---|---|---|
| right (gy = −0.42) | [1.2, Lr − 3.2] | [0.175, 0.532] (2.44 tiles) |
| left (gx = −0.42) | [1.7, Ll − 1.78] | [0.291, 0.695] (2.36 tiles) |
Occupied: right wall has the clock at u ≈ 0.4–1.05 and the window + curtains at [Lr − 3.1, Lr − 0.3]; left wall has the shelves at [0.4, 1.5], the nightlight at u = 1 (low, z 0.3–0.6) and the door at [Ll − 1.63, Ll − 0.52].

**Easiest path:** `import { wallSignSlots } from '../art'`; `wallSignSlots(cols, rows)` returns slots `{ wall, gx, gy, gz, span, spanTiles }`, the right wall first, then the left wall, then extra slots (a span ≥ 4.6 tiles is split in two). Mount the level's sign i at slot i:
```ts
const sl = wallSignSlots(cols, rows)[i]; const p = iso(sl.gx, sl.gy, sl.gz);
art.drawWallSign(ctx, p.x, p.y, s, text, sl.wall, t, shake);
```
Draw wall signs right after `drawRoom` and before the entities; they are on the wall, so every entity is in front of them.
`drawWallSign` shears with slope ±0.5 (it assumes the 2:1 iso tile). The 'right' wall's text runs down-right; the 'left' wall's text runs up-right (it reads from the front). Frame colour is picked by a hash of the text (wood, mint or pink). `shake` wobbles it in the wall plane and adds red jitter marks.

**Rug:** a grid-aligned rounded rectangle exactly on tile edges, tiles [1, cols−1] × [1, rows−1] (`rugRect`), with a diamond-pattern border, a stitched inner line and a fabric weave. It is drawn inside the cached floor.

**Floor props:** toy blocks (left trim) and a ball (right trim) are drawn AFTER the walls, with footprints inside the back trim strip only (≥0.07 tiles from the wall, ≥0.05 tiles from the tiles), so they never intersect a wall or a playable tile. The old floor star lamp was removed (the wall nightlight replaces it). Ambient occlusion is a soft band on the floor along both walls plus a deeper pocket in the back corner.

**Beds:** every `drawQubble` call draws its own iso mattress and pillow aligned to the tile (no engine work needed). `drawBed(ctx, x, y, s, night)` is also exported if you want an empty bed. `highlight` is now a dashed red tile diamond.

## Schrödi actor (v0.3, `drawSchrodiActor`)
Same design as the boxed Schrödi (grey tabby, forehead stripes, heavy-lidded yellow eyes, pink nose), now with a full body: a pear-shaped body with a belly patch, a striped-tip tail, a sitting haunch and stubby legs with toe-bean paws. `phase` 0..1 has contact at ≈0.5; `walk` cycles on `t`. The actions are sit, walk, boop (paw tap with impact ticks), shush (paw to mouth plus a 'shh' puff), spin (paw twirl with phasey arcs), point (straight paw with dashes), listen (front ear swivels toward `facing`, eyes shut, sound arcs), press (red button), stretch (rump up, chest down), hop-in/hop-out (an arc between the box at the anchor and 40·s toward `facing`; the box front is drawn over the cat while it is inside) and yawn. `mood` is passed to the face (shock adds a red "!"). The whole figure mirrors with `facing`.

## Click reactions (v0.3)
- Qubble `mumble`: a slow lopsided roll to one side and back (the whole body or quilt rotates ±0.2 rad), with squeezed-shut eyes, a wavy mouth and a drifting "mmh" plus a squiggle in neutral ink. A full blanket still hides all colour.
- Under a blanket (≥ 0.5): `giggle` makes the quilt shake fast and hop, with "hee/hi" notes; `scared` makes the quilt tremble hard, with shiver chevrons, flying sweat drops and a "!!" above.
- Bot `wave`: the front arm raised and wagging, motion arcs, ^^ eyes and a slight lean back.

## Fidelity pass (v0.3)
Multi-stop gradients on the walls (floor AO band, top light), the floor slab (highlight, shade, wood-grain streaks), the rug and the mattress. AO bands on the floor along both walls and in the back corner. Contact shadows under props, beds, the rug, signs and Schrödi. Fabric weave on the rug, the quilt tile and the mattress sheet. Qubbles get bottom AO, a crisp cool rim light and the existing specular. Bots get floor bounce light, a rim light and a specular glint. All static work stays in the cached room/floor layers.
**Night tint for signs and beds:** `drawRoom`/`drawFloor` store the frame's `night` in a shared `sceneState`; `drawWallSign` and the bed under each qubble read it. So always call `drawRoom` before the signs and entities in a frame (the engine already does).
