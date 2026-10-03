# Technical Aficionado: style guide (Visual Director)

> Neo-technical dreamscape: elegant, surreal, beautiful, mysterious, and **exact**. No characters, no anthropomorphism.
> Everything visible is either data from the simulator (labelled as such) or decoration (labelled as such).

## 1. Principles
1. **Data is luminous, decoration is dim.** Anything that encodes a number glows (pillars, arrows, filaments, lit tiles). Fog, sea, sky, dust and the orientation lattice stay dim and are captioned as decoration or metaphor when they could be mistaken for data.
2. **Honest captions.** Every oracle view carries `◇ simulator oracle: not observable on hardware`; veiled views say `state not observable during execution`. Interpolated motion between discrete gates is disclosed (projection freeze caption).
3. **Slow and deliberate.** Ease `cubic-bezier(0.65, 0, 0.35, 1)`, 600 / 900 / 1200 ms; the veil lift is 2.6 s. Nothing bounces, nothing flashes faster than ~2 Hz.
4. **One accent per meaning.** Cyan = primary data / Z-type; gold = secondary data / X-type / measured 1; red = errors only. Never use red for a syndrome (a −1 stabilizer is "lit", not "wrong").
5. **Swappable.** Modules read `theme/theme.ts` (canvas/WebGL) and `theme/tokens.css` (DOM). No literal colours or copy outside theme files and the content pack.

## 2. Palette (`DREAMSCAPE`)
| Token | Value | Use |
|---|---|---|
| `--afi-bg` → `--afi-bg2` | `#070a16` → `#0e1430` | night gradient (top → bottom) |
| `--afi-panel`, `--afi-panel2` | ink-blue glass | panels, tooltips |
| `--afi-line` | cyan 18 % | hairlines, borders |
| `--afi-ink` / `ink2` / `ink3` | `#e6ecff` / `#9aa6cf` / `#5b6694` | text: primary / secondary / muted |
| `--afi-accent` | `#6ef2ff` cyan | primary data, Z-type tiles, phase 0 |
| `--afi-accent2` | `#ffcf6e` gold | secondary data, X-type tiles, phase π, measured 1 |
| `--afi-err` | `#ff5a5f` | injected errors only |
| `--afi-ok` | `#8ef5b4` | success states |
| `--afi-fog`, `--afi-horizon`, `--afi-sea` | `#0b1128`, `#2a3a7a`, `#04060f` | dreamscape set pieces |
| `--afi-paper` / `--afi-paper-ink` | `#f2f0eb` / `#0e0e0e` | printed briefings and reports (links to the classic game) |

**Phase wheel** (`phaseRgb(φ)`): OKLab interpolation through four anchors: arg 0 cyan `#6ef2ff` → π/2 violet `#b59cff` → π gold `#ffcf6e` → −π/2 mint `#8ef5b4` → back to cyan. No red on the wheel, so phase never reads as error. Real positive amplitudes are cyan, real negative are gold.

Charts: cyan and gold pass the CVD and normal-vision separation checks on `#0a0f22` (ΔE 18 / 21). They are deliberately lighter than the usual categorical band (luminous style), so series identity is always doubled with a dash pattern, a legend and direct end labels.

## 3. Typography
| Role | Family | Where |
|---|---|---|
| Title / wordmark | **Quantum** (`/fonts/Quantum.woff2`, Latin caps only) | module titles, the wordmark, nothing longer than a line |
| Math & code | **JetBrains Mono** (Google Fonts, lazy via `ensureFonts()`), system mono fallback | numbers, kets, labels, captions, code |
| Prose | **Quicksand** (`/fonts/Quicksand.woff2`) | briefings, explanations, orientation captions |

Scale (`--afi-fs-*`): 11 / 12.5 / 14 / 18 / 26 / 44 px, all multiplied by `--afi-scale`. `.afi-root.afi-lecture` sets `--afi-scale: 1.35` (presentation / projector mode). Numbers are tabular; minus is a true `−`.

**Math helper** (`theme/math.ts`): `ket('011')` → |011⟩, `expect('Z₁Z₂')` → ⟨Z₁Z₂⟩, `amp(re, im)` → `0.707·e^{i·0.79}`, `pauliLabel('ZZI')` → Z₁Z₂, `qubitName('q3')` → q₃, `tensor(a, b)` → a ⊗ b. Each has an HTML flavour (styled spans) and a plain Unicode flavour for SVG, canvas and aria labels. No TeX engine is loaded.

## 4. Conventions (physics)
- Bloch: z up = |0⟩, +x = |+⟩, +y = |+i⟩. In three.js: Bloch (x, y, z) → (x, z, −y) (`blochToThree`).
- Ket order follows `NerdInfo.order`, left to right; the state space shows it in its corner (`ket order: q₁ q₂ q₃ a b`).
- Mutual information in bits, 0..2; filaments drawn above 0.02 bit, labelled from 0.1 bit; a pair at I = 2 braids (double helix).
- Stabilizer tiles: brightness ∝ (1 − ⟨S⟩)/2, so +1 calm, −1 lit, fractional values in between; unknown values are near-invisible with a "—".
- Surface code: `CODES.surface3` layout, q1..q9 row-major; X̄ = X₁X₄X₇ (left column, top ↔ bottom boundary), Z̄ = Z₁Z₂Z₃ (top row, left ↔ right boundary).

## 5. Scene grammar (three.js)
- **Sky dome**: night gradient + soft horizon band. **Sea**: still deep plane fading into the horizon, reflections are mirrored clones at 20–35 % opacity (no second render pass). **Fog**: `FogExp2`, density 0.02–0.03 (0.11 when veiled). **Dust**: a few hundred gold motes drifting upward, decoration only.
- Glow comes from additive sprites (`glowTexture`) and fresnel shells, not post-processing, to hold 60 fps on laptops.
- Render order: sky −10, mirrored clones −2, sea −1, data ≥ 0 (lattice tiles 2–3).
- Camera: OrbitControls with damping, slow auto-rotate (off in reduced motion), no pan, polar angle capped above the sea.

## 6. Motion and reduced motion
| Element | Motion | Reduced motion |
|---|---|---|
| Loading circuit | gate columns scale/fade in, wires light up, needles swing, bits scramble into the wordmark | instant placement, final state |
| Orientation | 18 s camera pull-back, captions every ~6 s | one still frame, all captions, continue button |
| State space | pillars ease to new heights/hues; veil lift 2.6 s, staggered from the centre | instant |
| Bloch field | arrows damp to new vectors; filaments flow; braid flashes on first appearance | static |
| Tiling / lattice | lit tiles breathe (0.85–1), sign flips ripple, lattice materialises tile by tile | static lit state |
| Projection freeze | 1.1 s per gate, 3.2 s hold on the freeze frame | the freeze frame only |

## 7. Accessibility
Every module sets `role="img"` and an `aria-label` that includes the current numbers (top amplitudes, purities, stabilizer values). The loading circuit is a `role="progressbar"` with real stage counts. Charts have a data-table toggle. Skips work from the keyboard (Esc / Enter / Space). Every WebGL scene has a 2D canvas or SVG fallback (`webgl: false`).

## 8. Making a second theme
Copy `DREAMSCAPE` in `theme/theme.ts` to a new `AfiTheme` object, change the values, call `setTheme(theme)` and `applyTheme(root, theme)`. Modules pick it up on creation; nothing else changes. For a light "paper" theme keep the phase anchors' lightness spread and keep `err` the only red.
