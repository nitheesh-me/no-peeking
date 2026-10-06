# Lab Notebook v2: "the notebook gets a desk" (Director's brief, 2026-10-06)

## The problem (user feedback, verbatim)
> the "Lab Notebook" positioning and responsiveness are bad! not as polished as anything, please pick an appropriate
> location, may be in this mode (specifically) move Bedtime and Morning into same vertical view and have a responsive
> design, pick an awesome view for the notebook … GO WILD and make AWESOME with impact and uniqueness factor!

Today (v1): the notebook is a 360px drawer (`.nb`, `src/styles/nerd.css`) absolutely positioned over the LEFT edge of
the scene canvas (`nerdHost` inside `sceneArea`, `src/ui/screens/level.ts:55,74`). It covers the daycare, has a fixed
width, ignores viewport size, and the editor (`.editor`, width `clamp(420px,42vw,620px)`, Bedtime | Morning columns
side by side) stays exactly as wide as before. It feels bolted on.

## Director's direction (designer owns the final call on the look; record decisions below)
1. **Nerd mode gets its own layout, not an overlay.** When nerd mode is ON (and only then; nerd off must be pixel
   identical to today), the level screen becomes a three-part "lab bench":
   `scene | notebook | editor`, with the notebook docked as a real column between the daycare and the code, so the
   Circuit page sits right next to the cards it mirrors (cards ↔ gates is the big reveal).
2. **Editor in nerd mode: Bedtime and Morning stacked vertically** in ONE column (Bedtime on top, a "🌙 night" divider,
   Morning below), each phase scrolls/collapses sensibly. The editor gets narrower; the freed width goes to the notebook.
   The toolbox must still work (drag + click to add, slots, fixed phases, END cards).
3. **Responsive, with named breakpoints** (designer picks exact numbers, programmer implements):
   - ultra-wide (≥ ~1700px): scene | notebook (open book: two facing pages possible) | stacked editor
   - desktop (~1200–1700): scene | notebook (single page) | stacked editor; notebook width resizable by a drag handle
     on its spine, remembered in localStorage
   - laptop/small (~900–1200): notebook collapses to a spine you can open as a column (pushes, never covers, controls)
   - tablet/portrait (< ~900): notebook becomes a bottom sheet / tab next to the editor; nothing overlaps the timeline
     or controls; no horizontal page scroll at any size
   - The scene canvas must re-fit (Scene resize) whenever the layout changes; no stretched canvas.
4. **Go wild on the book itself.** It is Schrödi's real lab notebook: think spiral/stitched binding, graph paper,
   coffee ring, tabbed index stickers per page (with the locked ones as blank tabs), a page-turn animation, pencil
   marginalia in a handwriting font, rubber-stamp effects (🙈 HIDDEN, NOT A COPY. ENTANGLED., LOGICAL QUBIT SURVIVED ✓),
   tape/paperclips holding the plots. It must stay readable (contrast, sizes), honour reduced motion, and be quick.
   Assets: anything goes (hobby project, licence not a concern), but prefer self-hosted files in `public/` (fonts in
   `public/fonts`, art in `public/art/notebook/`) so the build works offline. Keep the existing ink/paper style
   (`--ink`, `--paper*`, Quantum + Quicksand) as the base.
5. Physics stays exact: every number comes from the simulator (`Snapshot.nerd`). The quantum expert signs off content.

## Ground rules for every agent
- Dev server (shared, already running): http://127.0.0.1:4420/ (Vite, HMR). Do not start another on that port.
- **No git push, no `npm run deploy`, do not commit** (the Director commits). Leave `docs/VIDEO_CRITIQUE.md` alone.
- **No polling / wait loops** (no sleep/until/tail -f on files or other agents). If blocked on someone else, say
  "BLOCKED on X" in your final report and stop; the Director resumes you.
- Headless Chromium: one browser at a time, DPR ≤ 2, software GL flags
  (`--disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`). Playwright lives in
  `tools/video/capture/node_modules` (see `tools/video/capture/playthrough-check.mjs` for the save-seeding pattern:
  `flags.unlockAll: true`, `settings.nerd: true`). Put scratch scripts/screens in `tools/nb/` (not in `src/`).
- File ownership (avoid collisions):
  - Designer: `src/styles/nerd.css` (+ new `src/styles/nerd-layout.css` if wanted), `public/art/notebook/**`,
    `public/fonts/**`, visual parts of `src/ui/nerd/notebook.ts` (coordinate with programmer via this doc).
  - Programmer: `src/ui/screens/level.ts`, `src/ui/editor/**`, `src/ui/nerd/loader.ts`, `src/ui/nerd/pages.ts`,
    layout CSS in `src/styles/main.css`, logic in `src/ui/nerd/notebook.ts`.
  - Quantum expert: `src/ui/nerd/qmath.ts`, `src/quantum/nerd.ts`, `tests/quantum/**`, content text review.
  - QA: `tools/nb/**`, `docs/NOTEBOOK_V2_QA.md`.
- `npm run typecheck` and `npm test` must pass before you report done.

## Designer spec — "The Bench Book" (designer, 2026-10-06, phase 1)

Working files: draft CSS `tools/nb/designer/nb-v2-draft.css` (every rule below, ready to port), static mock
`tools/nb/designer/mock.html` (open via the dev server: `http://127.0.0.1:4420/tools/nb/designer/mock.html`, params
`?page=export&pin=circuit&nb=closed&sheet=code&sealed=dump,density`), screenshots `tools/nb/designer/mock-*.png`, v1
"before" shots `tools/nb/designer/current-*.png`, shooters `shoot-current.mjs` / `shoot-mock.mjs`.

### 1. Concept
**The Bench Book.** In nerd mode the daycare becomes Schrödi's lab bench, and his real notebook lies open on it, between
the room and the code. It is a kraft-covered, twin-wire-bound engineering notebook: graph paper, a double red margin, a
"Step / Night / Exp." form line at the top of every page, coloured sticky index flags on the fore-edge (blank flags for
sealed pages), pencil marginalia in a handwriting font, figures taped in, Bloch spheres as polaroids, rubber stamps in
real ink, a coffee ring on the late-night pages, and a "witnessed & understood by 🐾" line that Schrödi paw-signs when a
night passes. The Circuit page sits right next to the stacked Bot Code, so cards and gates read side by side. The timeline
and controls run under both the room and the book, so the circuit's highlighter cursor sits over the timeline it follows.

### 2. Breakpoints (JS-measured width of `.level-main`; the programmer sets `data-bench`)
| `data-bench` | width | scene | notebook column (`--nb-col`) | editor (`--ed-w`, stacked) |
|---|---|---|---|---|
| `xl` | ≥ 1720 | 1fr (≥ 560) | open: `--nb-w-xl`, default `clamp(640px, 40vw, 880px)`, drag range [560, min(1000, W − ed − 560)]; **two-page spread**. Closed: 44 | `clamp(380px, 22vw, 460px)` |
| `lg` | 1200–1719 | 1fr (≥ 480) | open: `--nb-w`, default 400, drag range [320, min(720, W − ed − 480)]. Single page (becomes a spread if dragged ≥ 640). Closed: 44 | `clamp(340px, 25vw, 400px)` |
| `md` | 900–1199 | 1fr | **starts closed** (44px spine) on every level load. Open: `clamp(300px, 32vw, 380px)`, not resizable, pushes the scene | 340 |
| `sm` | < 900 | full width | **bottom sheet**: the notebook and the editor swap in one slot under the controls, chosen by two tabs (`data-sheet`) | same slot, full width |

Rules: spread ⇔ dock width ≥ 640 (`data-spread="1"` on `.nb`, set by notebook.ts from its ResizeObserver). Tab flags show
text labels only when `data-spread="0"` and the dock is ≥ 600 (CSS container query). No horizontal page scroll at any size
(the mock checks `scrollWidth`; all seven shots pass). Example sizes: 1920 → scene 730 | book 768 | editor 422;
1440 → 680 | 400 | 360; 1280 → 540 | 400 | 340; 1024 open → 356 | 328 | 340 (closed: 640 | 44 | 340).

### 3. Layout sketches
```
xl ≥1720 (1920×1080)                                    lg 1200–1719 (1440×900)
┌ topbar ───────────────────────────────────────────┐ ┌ topbar ───────────────────────────────┐
│           │§ STEP 17/22 NIGHT 4 EXP 2-3   ×│ψ│Cards│Bedtime│ │         │§ STEP 17/22   ×│ψ│Cards│Bedtime│
│  scene    │§ Checks   §§ Circuit        │◐│     │ chk  │ │  scene  │§ Circuit      │◐│     │ chk  │
│ (daycare) │§ table    §§ ─●──⊕──[X]──   │∞│BOOP │🌙night│ │         │§ ┌tape──────┐ │∞│BOOP │🌙night│
│           │§ STAMP    §§  taped card    │⊕│SPIN │Morning│ │         │§ │ q1 ─●─⊕─ │ │⊕│SPIN │Morning│
│           │§ S.—note  §§ S.—note        │ZZ│ …  │ cards │ │         │§ └──────────┘ │ZZ│ …  │ cards │
│           │§ p.05 🐾  §§ p.04 🐾         │  │     │      │ │         │§ S.— note     │  │     │      │
├ timeline (scene+book) ───────────────────┤ foot │ ├ timeline ──────────────────┤ foot  │
└ controls (scene+book) ───────────────────┴──────┘ └ controls ──────────────────┴───────┘
  §=twin-wire binding (= resize handle)  §§=centre gutter  │ψ│=fore-edge flags  left page=browse, right=pinned

md 900–1199 closed (1024×768)                md open                          sm < 900 (820×1180, portrait)
┌ topbar ──────────────────────────┐ ┌ topbar ──────────────────────────┐ ┌ topbar ───────────────┐
│                    │█│Cards│Bed  │ │         │§ page       │ψ│Cards│Bed│ │        scene          │
│      scene         │L│     │🌙   │ │  scene  │§            │◐│     │🌙 │ │                       │
│                    │A│     │Morn │ │ (≥280)  │§            │∞│     │Mo │ ├ timeline ─────────────┤
│                    │B│     │     │ │         │§            │⊕│     │   │ ├ controls ─────────────┤
│                    │▤│     │     │ │         │§            │ │     │   │ │[🃏 Bot Code][📓 Notebook] ━━ │
├ timeline ──────────┴─┤ foot      │ ├ timeline ────────────────┤ foot  │ │ sheet (46vh): EITHER  │
└ controls ────────────┴───────────┘ └ controls ────────────────┴───────┘ │ the stacked editor OR │
  █ = 44px kraft spine: label + coloured flag ticks; click opens          │ the book (full width) │
                                                                          └───────────────────────┘
```

### 4. Bench layout contract (programmer: `level.ts`, `main.css`/new `nerd-layout.css`)
- **Root toggle:** `.level-main.nerd-bench` is present only when `nerdOn() && !cinema.on`. Everything new is scoped under
  it (or `.editor.stacked`, `.nb-v2`), so **nerd off stays pixel identical**. Under `html.cinema` keep today's path (the
  signed-off videos use the `.nerd-host` overlay and `cinema-nb`).
- **Attributes on `.level-main`** (set by level.ts):
  - `data-bench="xl|lg|md|sm"`, from a ResizeObserver on `.level-main` (thresholds in §2). Recompute on change only.
  - `data-nb="open|closed"`, mirrors the notebook (new `NerdNotebookOpts.onOpenChange(open)` callback, or a `nb-open`
    CustomEvent on the host). In `sm` it is always "open" (the sheet tab decides visibility).
  - `data-sheet="code|notes"` (sm only), persisted in `np.nb.sheet` (default `code`).
  - CSS vars: `--nb-w` (lg width, persisted `np.nb.w2`), `--nb-w-xl` (persisted `np.nb.wxl`), `--sheet-h` (sm, in vh,
    persisted `np.nb.sheetH`, range 30–70, default 46). The old `np.nb.w` key is ignored (old semantics).
- **DOM changes:** give `sceneArea` the class `stage-scene` (move its inline style into CSS:
  `.stage-scene{position:relative;flex:1;min-height:0;display:flex}`; identical when nerd is off). Add
  `div.nb-dock` as a child of `.stage` between `sceneArea` and `tlRow`, and mount the notebook there in bench mode (keep
  `nerdHost` for cinema only). Add `div.bench-tabs[role=tablist]` as a child of `.level-main` (before the editor), holding
  `button.bench-tab.code[role=tab]` "🃏 Bot Code", `button.bench-tab.notes[role=tab]` "📓 Lab notebook" (aria-selected)
  and `div.bench-grab[role=separator]` (vertical drag sets `--sheet-h`). It is hidden by CSS outside `sm`.
- **Grid** (from the draft): `.nerd-bench` = grid with columns `minmax(0,1fr) var(--nb-col) var(--ed-w)` and areas
  `"scene nb ed" "tl tl ed" "ctl ctl ed"`. `.nerd-bench > .stage { display: contents }` puts scene, dock, timeline and
  controls on the grid, so the timeline and controls span the scene and the book. `sm` has one column with areas
  `scene / tl / ctl / tabs / ed`, and `.nb-dock` and `.editor` share area `ed` (the one not selected gets `display:none`).
- **Scene refit:** Scene already has a ResizeObserver on its canvas, so it refits by itself. **Never transition
  `grid-template-columns` or `--nb-col`.** The column snaps and only the book's contents animate. **Resize drag:** on
  pointerdown on `.nb-binding`, show a ghost line (`.nb-resize-ghost`, absolute in `.level-main`, 3px dashed sunny) that
  follows the pointer, and apply `--nb-w` once on pointerup. That is one canvas resize, not 60 per second. Keyboard on the
  binding: ←/→ ±24px, Home/End = min/max, double-click = default.
- **Default open state:** xl/lg use `np.nb.open` (default open when unset). md starts closed on every level load. sm
  ignores it.

### 5. Stacked editor contract (programmer: `src/ui/editor/**`)
- `Editor` gets an option/method `setStacked(on)` that toggles `.editor.stacked`. level.ts turns it on with
  `.nerd-bench`, in every breakpoint.
- In stacked mode `.columns` is the **single vertical scroller** (Bedtime → divider → Morning reads like one script).
  `.prog-list` stops scrolling (`overflow: visible`). The drag auto-scroll at `editor.ts:757` must scroll the nearest
  scrolling ancestor (`.columns` when stacked). Arrows still draw relative to their list, but redraw on `.columns` scroll
  too.
- Insert `div.night-divider[role=separator]` between the Bedtime and Morning columns:
  `🌙 night falls <span class="gr">· gremlins prowl</span>`. Only add it when both phases render.
- `.prog-col-head` is sticky, and gets `button.fold[aria-expanded]` (▾/▸) that toggles `.prog-col.collapsed` (this hides
  its list, fixed-phase and slot tabs). Defaults: fixed-only phases with more than 4 cards start collapsed, and editable
  phases start expanded. The current-step card forces its phase open during playback.
- Fixed phases, slots, END cards, click-to-add and drag all stay as they are. Only CSS changes their geometry. The toolbox
  stays a left column (100px; cards 13px), and program cards are 14px in stacked mode.

### 6. Notebook DOM contract (notebook.ts; logic = programmer, classes and CSS = designer)
```
div.nb.nb-v2[.nb-open][data-mode="column|sheet"][data-spread="0|1"]     (sheet = data-bench sm)
  button.nb-spine[aria-expanded]            closed state (44px column): span.lbl "📓 Lab notebook" + span.ticks > i[style=--c] per unlocked page
  div.nb-book                               grid: binding | head/spread | tabs
    div.nb-binding[role=separator][tabindex=0][aria-valuemin/max/now]   twin-wire coil = resize handle (lg/xl only)
    header.nb-head
      h2.nb-title                           5-click easter egg stays here
      div.nb-runhead > span.nb-field ×3     DOM order: step "<i>step</i><b>17/22</b>", input/night "<b>☀ / 4 of 9</b>", exp "<b>2-3</b>" (fields that don't fit hide themselves)
      button.nb-close                       → closed (spine). In sheet mode it switches data-sheet to code.
    div.nb-spread
      section.nb-sheet[data-page=<id>]      left/only page: h3.nb-ptitle, p.nb-plain, div.nb-body, aside.nb-margin, footer.nb-foot, (button.nb-dogear)
      div.nb-gutter                         (spread only)
      section.nb-sheet.nb-pinned[data-page] (spread only) right page = pinned page (np.nb.pin, default 'circuit')
      div.nb-turn[aria-hidden]              page-turn leaf
    nav.nb-tabs[role=tablist][aria-orientation=vertical]
      button.nb-tab[data-id][role=tab][.on][.pinned][.sealed][.fresh] > span.g (glyph) + span.t (label)
```
- Tab glyph/label: state `ψ` State · bloch `◐` Bloch · entangle `∞` Entangle · circuit `⊕` Circuit · stabilizers `ZZ`
  Checks · threshold `p*` Threshold · density `ρ` ρ matrix · export `⇪` Export · dump `{ }` DUMP. Tab colours come from
  the CSS (`[data-id]`). Sealed tabs render **blank** (no glyph or text), with `aria-label="Sealed page: unlocks after 2-3"`
  and the existing "nope" shake.
- Spread behaviour: a tab click opens the page on the **left**. Shift+click (or long-press) on a tab, or `button.nb-pinbtn`
  "📌" in the left page's title row, moves that page to the right (pinned) slot. If the pinned page is locked or the same
  as the left page, render a single page (`data-spread="0"`). Each sheet renders independently
  (`render(pageId, sheetEl)`), and each page's Bloch widgets are disposed per sheet.
- Footer: `footer.nb-foot > span.pg "p. 04"` (index in NERD_PAGES + 1) `+ span.wit "witnessed & understood by"`. Add
  `.signed` (paw stamp) when the shown night is at its last step and `night.pass`.
- `button.nb-dogear[aria-label="Next page"]`: the folded corner at the bottom of the sheet opens the next unlocked page.
- Figures get `.nb-taped` on their wrapper (add `.b` for mint washi tape): the state histogram wrapper, the entangle
  heatmap wrapper, a wrapper around `.nb-cwrap`, the threshold svg wrapper, `.nb-dens .nb-row2` (`.b`), and `.nb-dark`
  (`.b`).
- Export: wrap the code in `div.nb-printout > div.nb-clip + pre.nb-code`.
- Circuit legend: render each card name as `b.nb-cchip.op-BOOP` (etc.) so it gets the real card colour.
- Circuit fit: add `.fit` to `svg.nb-circ` only when its natural width ≤ 1.25× the scroller **and** the wire labels are
  inside the same SVG. Otherwise keep today's horizontal scroll and cursor auto-follow.
- `pulseUnlock`: wiggle `.nb-spine` if the book is closed, otherwise the fresh tab's flag. The old `.nb-grip` and `.nb-pin`
  go away (the binding replaces both).

### 7. Art direction
- **Base palette kept:** `--ink`, `--paper*`, Quantum (titles) + Quicksand (body and numbers). The paper is
  `#fbf8ef` (`--nb-paper`), the head band is `#efe6d2`, and the dock "desk" is `#e2dbcc`. Ink outline 2.5px, with the
  game's offset sticker shadow, plus 2 stacked-page lines on the fore-edge.
- **Handwriting** (new): **Caveat** 600–700 for marginalia, figcaptions, form-field values and page numbers (never below
  16px), and **Patrick Hand** for tab labels (16px). Both are self-hosted latin subsets and only download when nerd CSS
  uses them. Numbers stay in Quicksand (tabular) so the physics stays readable. Graphite `#3c3c46`, field ink
  `#233a8f` (blue pen).
- **Paper:** engineering grid (20px minor at 13% / 100px major at 30% teal), plus a static fibre grain, plus a double red
  margin at 27–32px, all as `background-attachment: local` so it scrolls with the page.
- **Binding:** a twin-wire coil runs along the scene-side edge (and down the centre gutter in a spread). It doubles as the
  resize grip and glows sunny on hover or focus.
- **Index flags:** pastel sticky flags (pink, butter, lilac, sky, mint, peach, orchid, sage; DUMP is black). The active
  flag pulls toward the page and merges with it. Fresh flags get a red pencil ★.
- **Stamps:** one rubber-stamp style (Quantum caps, double border, ink-grunge mask, multiply blend, slight rotation).
  Red = NOT A COPY. ENTANGLED. and 🙈 HIDDEN, green = LOGICAL QUBIT SURVIVED ✓, purple = CAUGHT IN THE ACT.
- **Props:** washi or masking tape on figures, polaroids for Bloch, a paperclip on the printout, a coffee ring (threshold
  and export pages only), pencil underline under each plain-words line, a pencil arrow from each margin note.

### 8. Page by page
| page | look |
|---|---|
| State | Dirac sum in big math serif on the grid; amplitude rows as hand-ruled bars with phase-wheel "clock dials"; histogram on a taped white card. **Hidden** (🙈): the page is full of scribbled-out pencil lines (`scribble-out.svg`) under a big round red HIDDEN stamp with 🙈, plus the line in Caveat 20px. |
| Bloch | Each qubit is a **polaroid**: white frame, tape strip, Caveat caption "q1", numbers in the bottom margin, alternating ±1.5° tilt. A focused qubit gets a sunny ring. |
| Entanglement | Heatmap taped in; entropy bars hand-ruled. NOT A COPY. ENTANGLED. as a red stamp that slaps over the heatmap's corner. |
| Circuit | Ink circuit on a taped white card; "Your Bot Code is a quantum circuit." in Caveat 22px; **yellow highlighter swipe** as the step cursor (multiply); gremlin boxes in red dashed ink; legend chips in real card colours (Rosetta stone). Card→gate morph kept. |
| Stabilizers | Ledger tables (ruled, head band), BEEP/quiet chips, fidelity as a pencil-ruled bar, green SURVIVED stamp; the footer gets paw-signed on a passing night. |
| Threshold | Plot on a taped card, "this room" point with a red pencil ring (`pencil-circle.svg`), coffee ring on the page. |
| Density | Re/Im grids as a taped "cityscape" (mint tape); purple CAUGHT IN THE ACT stamp slaps when the coherence snaps. |
| Export | **Dot-matrix printout**: green-bar paper, tractor-feed holes on both edges, Courier 12/16px dark text, paperclipped at the top; Copy keeps its button. Coffee ring. |
| RAW DUMP | Black flag; the page looks like a manila "CLASSIFIED" insert: red stamp "RAW DUMP — CLASSIFIED", typewriter JSON tree. |
| Lights out (4-2) | The dark waveform is a taped "photo of the dark room" (`.nb-dark.nb-taped.b`); page text says the notebook can't see either. |

### 9. Motion (transform/opacity/clip-path only) and reduced-motion fallbacks
| beat | animation | reduced motion (`prefers-reduced-motion` or `.reduced`) |
|---|---|---|
| open from spine | `.nb-book` swings in from the binding, `rotateY(-24°)→0`, .32s; the column snaps | instant |
| page change | `.nb-turn` leaf (graph paper + shading) turns from the binding, `rotateY 0→-180°` (fwd) / reverse (back), .4s. In a spread it flips from the right page across the gutter onto the left page. New content is already under it. | no leaf, instant swap |
| unlock | closed: spine wiggle ×2 (.9s). Open: the new flag "sticks on" (`nbStick` .5s), the first visit tears in (existing `nb-tear`), the margin note writes itself (`nbWrite` 1.3s, steps) | static sunny ring on the spine/flag for 3s, no tear or write |
| stamps | `nbStamp`: scale 2.2→.94→1 with rotation, .42s | appear in place |
| paw signature | stamp slap on `.nb-foot.signed` | appear |
| resize | ghost line only; one relayout on release | same |
Perf budget: backgrounds are static SVGs (the browser rasterises them once), `contain: layout paint` on sheets, no
animated shadows or filters, only the visible page(s) render (as today), and the fonts are about 100KB total, lazy.

### 10. Assets (created, self-hosted)
`public/art/notebook/`: `paper-grid.svg`, `paper-grain.svg`, `kraft.svg`, `binding-coil.svg`, `tape-a.svg`,
`tape-b.svg`, `paperclip.svg`, `coffee-ring.svg`, `stamp-grunge.svg` (mask), `pencil-underline.svg`,
`pencil-circle.svg`, `pencil-arrow.svg`, `scribble-out.svg`, `paw-sign.svg`, `dog-ear.svg`, `greenbar.svg`,
`sprocket.svg` (17 files, 72KB). `public/fonts/`: `Caveat.woff2` (variable 400–700, latin, 75KB), `PatrickHand.woff2`
(latin, 24KB). @font-face rules are in the draft and move into nerd.css. CSS references use `url('/art/notebook/…')`,
the same pattern as the existing fonts.

### 11. Who does what next (phase 2)
- Programmer: §4 grid/attributes/DOM in level.ts + layout CSS; §5 stacked editor; §6 notebook DOM/logic (second sheet,
  pin, footer signing, dog-ear, page-turn class toggling `fwd|back` + cleanup on `animationend`, ghost-line resize).
- Designer: port `nb-v2-draft.css` into `src/styles/nerd.css` (+ `nerd-layout.css` if the programmer prefers that the
  layout lives there), remove v1 drawer rules, tune against the real app, and re-shoot the 4 viewports.
- QA: no horizontal scroll at 1920/1440/1280/1024/820 portrait/390 phone; nerd-off screenshots diff-identical to today;
  drag/click/slots/END in the stacked editor; scene not stretched after every layout change.

## Programmer notes
_(programmer: add yours here. The designer's CSS port (phase 2) is in place and styles exactly the hooks below.)_

### Programmer → designer / QA: what shipped (2026-10-06, phase 2)
Files: `src/ui/screens/level.ts`, `src/ui/editor/editor.ts`, `src/ui/nerd/notebook.ts` (DOM + logic rewritten to §6),
`src/ui/nerd/loader.ts` (interfaces), `src/styles/main.css` (one rule: `.stage-scene`). All bench layout CSS stays in
the designer's `nerd-layout.css`; nothing from the draft was duplicated in main.css.
- **Bench (§4):** exactly as contracted. `.nerd-bench`, `data-bench` (ResizeObserver on `.level-main`, recomputed on
  change only), `data-nb`, `data-sheet`, `--nb-w` / `--nb-w-xl` / `--sheet-h` (keys `np.nb.w2`, `np.nb.wxl`,
  `np.nb.sheetH`, `np.nb.sheet`; all try/catch). Saved widths are re-clamped to what fits on every resize (not persisted).
  `.nb-dock` and `.bench-tabs` are inserted only while the bench is on and removed when it's off, so nerd OFF has the
  old DOM (verified: `tools/nb/diff.py baseline-off prog-off` = 40/40 identical / raster noise at 1920, 1440, 1024,
  820, 390). Open state: `np.nb.open`; when unset, xl/lg open, md closed (decision 1). sm ignores it.
- **Resize:** pointer drag on `.nb-binding` (lg/xl) shows `.nb-resize-ghost` and applies `--nb-w(-xl)` once on release;
  ←/→ ±24 (← = wider, the binding is on the room side), Home/End = min/max, double-click = default. `aria-valuemin/max/now`
  kept current. The sm grab bar uses the same ghost class, inline-styled as a horizontal line (top set inline,
  `border-top: 3px dashed var(--sunny)`); restyle it via `.bench-grab`'s ghost if you want: it's
  `.level-main > .nb-resize-ghost[style*="border-top"]`. ↑/↓ on the grab = ±4vh.
- **HUD strip host:** I left the inline `style` on the HUD's last child (`flex:1;display:flex;justify-content:flex-end;min-width:0`),
  so your `flex-basis … !important` must stay.
- **Notebook modes:** `.nb.nb-v2[data-mode="column|sheet|overlay"]` (overlay = `?cinema`, mounted in `.nerd-host`). In
  sheet mode `nb-open` is always set; × / Esc switch `data-sheet` to `code`. Esc closes only in md/sm (and overlay).
- **Pin:** `button.nb-pinbtn` is the **first child** of the left `section.nb-sheet` (before `h3.nb-ptitle`, so your
  `float: right` works); it carries `.hidden` unless the dock is ≥ 640px and the page isn't already the pinned one.
  Shift+click or long-press (550ms, touch/pen) on a flag also pins. The right sheet is `section.nb-sheet.nb-pinned`.
- **Flags:** `button.nb-tab[role=tab]` with a roving tabindex (only the active flag is in the Tab order; ↑/↓/←/→/Home/End
  move focus, Enter/Space opens). Sealed flags have empty `.g`/`.t` and `aria-label="Sealed page: unlocks after X"`.
- **Page turn:** `.nb-turn.fwd|.back` (direction = page order), removed on `animationend` (700ms fallback timer).
  Reduced motion (`.reduced` or the media query) = no class at all. `.nb-sheet.nb-tear` on a page's first visit.
- **Card ↔ gate link (decision 5), your names:** `g.nb-g` circuit groups now carry `data-col`, `data-line="phase:part:pc"`
  and `data-op` (BOOP/SHUSH/SPIN/HIGHFIVE/RESET/LISTEN/PEEK). Hover a card → `.gate-hl` on its column(s) + a
  `rect.nb-hlband` (rx 4) as the first child of the circuit layer group `g.nb-layer` + `.gate-hl` on the legend
  `span[data-op]`; the circuit card scrolls the column into view. Hover a gate → `.card-hl` on the editor card (scrolled
  into view, smooth unless reduced). The mapping is the trace's line events (`lineRefsOf()` in notebook.ts mirrors
  `Playback.mapLines`); a looped line maps to every column it produced. Quantum expert: please verify.
- **Circuit fit (decision 6):** all gates live in `svg.nb-circ > g.nb-layer`. `.fit` is added only when the natural
  width is > the room and ≤ 1.25× it; then the wire labels move into the same SVG as `g.nb-clabels` (no upscaling when it
  already fits; no shrinking past 0.8×). Otherwise the separate `svg.nb-clabels` + horizontal scroll + cursor
  auto-follow (smooth; reduced motion = jump; the scroll position is restored instantly across re-renders).
- **Run head:** `span.nb-field` ×3: `<i>step</i><b>8/12</b>` (visible events done / total), `<i>night</i><b>☀ · 3 of 8</b>`
  (input label; "k of n" when the shown night is one of the last Test-all nights), `<i>exp.</i><b>2-3</b>`.
- **Stacked editor (§5):** `.editor.stacked`, `div.night-divider[role=separator]` only when both phases render,
  `button.fold[aria-expanded]` appended to `.prog-col-head` (created only in stacked mode), `.prog-col.collapsed`.
  `.prog-col` now always has `data-phase` (no CSS effect). Folded phases spring open while a card is dragged over them
  and when the running card is inside. Auto-scroll while dragging scrolls `.columns` (56px under the sticky head,
  36px at the bottom).

### Round 2: smooth transitions (programmer, 2026-10-06), names for the designer's keyframes
- **One helper, `layoutTransition(kind, mutate)` in level.ts**, wraps every bench layout change. When
  `document.startViewTransition` exists, these elements get an inline `view-transition-name` **only while a transition
  runs** (removed afterwards, so nothing leaks into other transitions or nerd-off): `.stage-scene` = `nb-room`,
  `.nb-dock` = `nb-book`, `.editor` = `nb-editor`, `.tl-row` = `nb-timeline`, `.controls` = `nb-controls`. For the
  duration `<html data-vt="KIND">` is set, so you can tune each kind:
  `html[data-vt="nb-open"]::view-transition-group(nb-book) { … }`. Kinds: `nb-open`, `nb-close`, `bench-on`,
  `bench-off` (📓 Nerd button), `breakpoint`, `sheet` (sm tab switch, × / Esc in the sheet), `resize` (binding or grab
  release). The browser defaults are used until you add CSS (a 250ms morph plus crossfade). The DOM changes once, inside
  the transition, so the scene canvas re-fits once. The `::view-transition-new(nb-room)` image keeps its aspect ratio
  (no stretched frame). `object-fit: cover` on `::view-transition-old/new(nb-room)` looked fine in my tests if you
  prefer a crop over the default letterbox-and-crossfade.
- **Fallback (no View Transitions):** WAAPI translateX FLIP on `.nb-dock` and `.editor` (fade for newly inserted
  ones). The room only fades, because any transform on the canvas' ancestors would be measured by `Scene.resize()` and
  stretch the backing store. **So please never put a transform animation on `.stage-scene` or its ancestors in normal
  CSS either**: that is exactly the bug I hit (canvas 630 px wide in a 640 px box). VT pseudo-elements are fine.
- **Reduced motion** (`.reduced` or the media query): instant, no transition at all.
- **Book open, cover swing + paw pat:** after an open commits (spine click, `openPage`), the book root gets
  `.nb-v2.nb-opening`; it is removed on the `animationend` of `.nb-paw` (fallback timer 1.4s). `div.nb-paw[aria-hidden]`
  is a new, empty last child of `.nb-book` for the paw art (position it absolute, hidden when not `.nb-opening`).
  Suggested: `.nb-opening .nb-book` = the rotateY swing on the binding (transform-origin: left center), then
  `.nb-opening .nb-paw` = a pat with a delay of the swing's duration. Close has no class: the VT morph handles it.
- **Page turn:** unchanged (`.nb-turn.fwd|.back`), it already animates inside the book and doesn't change the layout.
- **Review fixes:** the run head's night field is now text only, e.g. `1 of 4 · |+⟩` (or `|0⟩`), no emoji. Hovering
  a gate no longer scrolls the circuit under the pointer. Only a hover that starts on an editor card brings the column
  into view. While a card↔gate link is showing, the circuit's cursor auto-follow and the editor's "scroll to the
  running card" both pause, so the two scrolls never fight.

### Round 3 (programmer, 2026-10-06): reconciled with "Designer → programmer, round 2"
- `.bench-tabs` gets `view-transition-name: nb-sheettabs` during transitions (with the other five names).
- `scene.resize()` runs synchronously inside the `startViewTransition` update callback, right after the DOM change, so the
  new room snapshot is the real re-fitted buffer.
- No view transition (instant) under reduced motion, or when `window.__cap` exists (capture shim / `tools/nb/shoot.mjs`):
  that removes the "covered by html" false positives.
- **Close:** `.nb-closing` goes on `.nb.nb-v2` for **420ms** (the lid swings shut), then the close transition
  (`data-vt="nb-close"`) runs. Re-opening during those 420ms cancels it. Skipped under reduced motion.
- **Open: `.nb-opening` now stays on for as long as the book is open** and is removed when it closes (re-added, with a
  reflow, on every open). Reason: your `.nb-v2.nb-opening.nb-open .nb-book { animation: none }` means removing the
  class mid-open restarts `nbBookIn`. Under the shim's frozen clock that left the book invisible, rotated and covering the
  controls (QA's `kbd-tab6` "covered by nb-sheet" hits). Your lid and paw animations end invisible (`fill: both`), so a
  lingering class is harmless. Please keep any future `.nb-opening` rules end-state-safe. The `div.nb-paw` element is gone
  (you draw the paw on `.nb-spread::after`).
- **Night field:** `<i>night</i><b>1 of 8</b><span class="nb-in">|+⟩</span>` (`<b>1</b>` for a lone Run night). Inputs:
  zero |0⟩, one |1⟩, plus |+⟩, minus |−⟩, plusI |+i⟩, minusI |−i⟩, random 🎲, θ/φ → |ψ⟩. The emoji input label is in
  the field's `title`.
- **Decoder verdict:** `b.nb-verdict[data-v="ok|eq|bad|unk"]`, on top of the quantum expert's exact `fixVerdict`
  (same → ok, equivalent → eq, logical or wrong → bad, unknown or night not finished → unk).
- **Circuit:** wire pitch `WY` capped at 40. The observable band under the wires is reserved only when LISTEN columns have
  a label: 1 row (17px) for one, 2 staggered rows (30px) for more.
- **Folded phase + gate hover (quantum expert §6):** hovering a gate whose card is in a folded stacked phase adds
  **`.prog-col.collapsed.card-hl-inside`** to that phase's column (cleared with the link). Please style its
  `.prog-col-head`, e.g. a sky pulse or ring. The phase is not auto-expanded on hover.
- Harness: `tools/nb/out/prog-on3` (1920/1440/1024/820, nerd on, 1440 page tour) has 0 high-severity issues.

### New content classes from the quantum expert's P1–P10 / ★W1 / ★W2 (please style)
- Circuit: `text.nb-svgt.nb-obs` = the measured observable under each LISTEN (two staggered rows under the wires,
  `🎲` when the bot was in superposition), `p.nb-cap.nb-obscap` (caption), `p.nb-cap.nb-condunk` ("classical controls
  unknown"). Classical control lines (`.nb-cl`) now also on meters and resets.
- Stabilizers: `div.nb-sub` "Stabilizers of this code" + `table.nb-table.nb-stabs`; `details.nb-other > summary` +
  table (grey, collapsed: "Other checks"); `div.nb-decoder > table.nb-table.nb-dectable` with `tr.on` = this night's
  row, `td.nb-mine` (what the player's code applied) `> b.nb-verdict` (✓ / ≡ equivalent and passed / ✗ / ?);
  `.nb-sub.nb-recov` + a second `.nb-fid` bar (recoverable); `figure.nb-sparkfig.nb-taped.b > svg.nb-spark`
  (`polyline.nb-spark-f` ink, `polyline.nb-spark-r` green, `line.nb-spark-cur` sunny cursor, `line.nb-spark-grid`) +
  `figcaption.nb-cap` with `b.nb-key-f` / `b.nb-key-r`; `div.nb-stampx.nb-fooled` "FOOLED" (red stamp; two-flip nights).
  Presentation attributes on the sparkline are fallbacks, CSS may override.
- State: `div.nb-cap.nb-ampcap` above the amplitude rows. Threshold: `g.nb-thr-mine` (green measured point + Wilson bar,
  "your nights: k/n").
- Known CSS nits for the designer: the coffee ring `::before` on `threshold`/`export` sheets makes the sheet scroll
  sideways by ~20px at 1440 (QA probe `inner-hscroll`); SVG text on the threshold plot renders < 8px in the 400px column.
  QA's `btn-covered` hits at 390×844 are cards scrolled under the sticky phase head (expected with a sticky header).

### Designer → programmer: CSS hooks shipped in `src/styles/nerd.css` + `src/styles/nerd-layout.css` (2026-10-06)
- **Loading:** `nerd.css` starts with `@import './nerd-layout.css'`. It is already loaded globally through the loader's
  eager glob, so nothing else needs importing. The v1 drawer rules (`.nb`, `.nb-spine`, `.nb-book`, `.nb-grip`, `.nb-pin`,
  `.nb-tabs`, `.nb-sheet`, …) are **deleted**. The v1 DOM looks broken until notebook.ts emits the v2 DOM (§6).
- **Card ↔ gate hover link (decision 5). These names are a designer proposal; tell me here if you change them:**
  - Hovering or focusing an editor card: add `.gate-hl` to every `g.nb-g` circuit column group that came from that
    program line. Optionally draw a `rect.nb-hlband` behind that column (full wire height, rx 4) as the first child of the
    circuit SVG. Also add `.gate-hl` to the matching legend `span` in `.nb-clegend`.
  - Hovering a gate (`g.nb-g`): add `.card-hl` to the editor `.card` for that program line, and scroll it into view
    (`block: 'nearest'`; smooth unless reduced motion). The style is a sky ring (`--sky`), distinct from the sunny
    `.current`. Both together stack as ink, sky, then sunny.
  - Clear both on pointerleave/blur. Only in nerd mode (the CSS is scoped to `.nerd-bench` / `.nb-v2`).
- **Circuit card (decision 6):** wrap `.nb-cwrap` in `div.nb-taped.nb-circcard`. `.nb-cscroll` scrolls horizontally with
  edge scroll-shadows, `scroll-behavior: smooth` (auto under reduced motion), and the wire-label column stays fixed on the
  left. Use `.fit` on `svg.nb-circ` only at scale ≥ 0.8 with labels inside the same SVG. Never scale below that.
- **Legend chips:** `b.nb-cchip.op-<OP>` (BOOP, SHUSH, SPIN, HIGHFIVE, LISTEN, PEEK, RESET, IF, JUMP).
- **Stacked footer (decision 7):** no DOM change. `.editor.stacked .editor-foot` wraps every tool into two compact rows
  (trash, help, undo, redo, Text, Clear, Snippets, stats).
- **HUD (decision 8):** no DOM change. In the bench, `.stage-hud` wraps, the pills and fidelity meter never shrink, and the
  test-strip host (the HUD's last child) moves to its own row instead of squeezing. `.stage-scene` is a size container
  (`room`), so the HUD compacts below 520px.
- **Other hooks styled:** `.nb-resize-ghost` (absolute child of `.level-main`); `.nb-pinbtn`; `.nb-turn.fwd|.back`
  (single page 0.38s, spread 0.45s; remove on `animationend`); `.nb-sheet.nb-tear`; `.nb-sheet[data-page=dump]` (manila +
  CLASSIFIED stamp); `.nb-taped.nb-dark` for Lights Out; `.nb-v2.nb-reduced`; cinema: `.nerd-host > .nb.nb-v2` (420px,
  or full width under `html.cinema-nb`).

### Designer → programmer, round 2 (2026-10-06): cat/daycare layer + transition hooks + 3 small asks
**Transitions (the CSS is in nerd.css §9).** Superseded by the Director's reconciliation: the CSS now keys off
`html[data-vt]`, with `[data-vt="nb-open"]` (the book swings in), `[data-vt="nb-close"]` (it swings out) and
`[data-vt="sheet"]` (the panel slides up). Every other value gets the plain 340ms soft-overshoot morph. The
view-transition-names are set inline by the programmer. The room crops (`object-fit: cover`) instead of stretching.
Under reduced motion every `::view-transition-*` animation is `none`.
- **Cover swing:** add `.nb-opening` to `.nb.nb-v2` when the book opens and remove it after **1100ms** (or on the paw's
  `animationend`). The cardboard lid swings on the binding (`::after`, 460ms), then a paw pats the page (`.nb-spread::after`,
  700ms starting at 340ms). Optional close: add `.nb-closing`, wait **420ms** (the lid swings shut), then set
  `data-nb="closed"`. Both classes do nothing under reduced motion.

**Three small DOM asks (each has a CSS fallback):**
1. **Night field** (Director's review #2: it shows only "🌀"). Please render
   `<i>night</i><b>1 of 8</b><span class="nb-in">|+⟩</span>`, i.e. the index (or "1" for a single Run night) plus the input as a
   ket: zero `|0⟩`, one `|1⟩`, plus `|+⟩`, minus `|−⟩`, plusI `|+i⟩`, minusI `|−i⟩`, random `🎲`, and θ/φ → `|ψ⟩`. Keep the emoji
   in `title`. `.nb-in` is styled already.
2. **Decoder verdict:** add `data-v="ok|eq|bad|unk"` to `b.nb-verdict` (✓ / ≡ / ✗ / ?). `ok` becomes a gold-star sticker,
   `eq` blue pen, `bad` red, `unk` dashed grey.
3. **Circuit card height (review #6):** please cap `WY` at about 40, and reserve the two `.nb-obs` rows below the wires
   only when there are LISTEN columns. The empty band under the 1920 circuit comes from those two.

**Cat/daycare art (CSS only, no DOM):**
- Cardboard-box spine with claw scratches and a "PROPERTY OF SCHRÖDI · DO NOT PEEK" label; the same lid on the cover swing.
- Yarn-ball bookmark down the binding.
- Paw-print page numbers, plus a gold star when a page is signed.
- Gold stars on SURVIVED and on fresh flags.
- Alphabet-block glyphs on the flags.
- Crayon Qubble and sun/moon doodles in the footers (dock ≥ 420px).
- Muddy paw tracks on Entangle, Stabilizers and Dump.
- A fur tuft taped beside the margin note on Entangle and Density.
- Juice-box ring on Threshold, coffee ring on Export, a fish paperclip on the printout.
- A name label at the end of every page.
- A paw cursor over the paper.
- New files in `public/art/notebook/`: paw, paw-cursor, paw-tracks, claw-scratch, fur-tuft, fish-clip, yarn-bookmark,
  box-cover, box-print, crayon-qubble, crayon-sunmoon, gold-star, juice-ring (.svg).

**QA note:** in the shim-driven `tools/nb/shoot.mjs` run (virtual clock), every control reports "covered by html". That
looks like a View Transition pseudo-tree that never finishes under the frozen clock. Please skip `startViewTransition` when
`window.__cap` exists, or when `document.timeline` isn't advancing.

## Decisions log
- 2026-10-06 Director: nerd-mode-only "lab bench" layout; stacked Bedtime/Morning in nerd mode; notebook docked between
  scene and editor.
- 2026-10-06 Designer: "The Bench Book". Breakpoints xl ≥1720 (spread) / lg 1200–1719 / md 900–1199 (spine, starts closed) / sm <900 (bottom-sheet swap);
  timeline + controls span scene+book; stacked editor = one scroller with a night divider; ghost-line resize (no animated
  column widths); Caveat + Patrick Hand self-hosted; bench layout off under `html.cinema`.
- 2026-10-06 Director, answers to designer's open questions + review of the mock:
  1. md: default CLOSED, but remember the player's last open/closed choice (`np.nb.open`); a first-ever visit starts closed.
  2. Spread pinned page = Circuit (fallback single page while locked): approved.
  3. Bench layout stays OFF under `?cinema` (signed-off videos must not change): approved.
  4. Night index: programmer passes `nightIndex`/`nightCount` in `notebook.update(...)`.
  5. Card ↔ gate hover highlight (both directions) is IN scope, not stretch: it is the signature "cards are gates" moment.
     Programmer exposes the card↔gate mapping (program line → circuit column(s)); quantum expert verifies.
  6. Circuit legibility: never scale the circuit below 0.8×. When it doesn't fit, it scrolls horizontally inside its taped
     card and auto-follows the step cursor (smooth, reduced-motion = jump). The 1440 mock's shrunken circuit is a defect.
  7. The stacked editor keeps ALL footer tools (trash, help, undo/redo, Text, Clear, Snippets, line count/par): wrap
     them into two rows or an overflow "⋯" menu; the IF/JUMP gutter arrows must still draw correctly when stacked.
  8. The fidelity meter and HUD must stay fully visible over the narrower room (mock clips "0%" at the left edge).
- 2026-10-06 USER request (mid-build): "can we have cat paws and other things as the book belongs to a cat and at a day
  care! also a smoother transition". Director split:
  - Designer: the book is a CAT's notebook kept at a DAYCARE. Paw prints (inky paw stamps, muddy paw tracks across a page
    corner, a paw-print page-number stamp), claw-scratched cover edge, a stray whisker/fur tuft taped in, fish-shaped
    paperclip, yarn-ball bookmark ribbon, Schrödi's box-cardboard cover texture, kid-daycare bits: crayon doodles of
    Qubbles in the margins, gold star stickers, a name label "PROPERTY OF SCHRÖDI — DO NOT PEEK", juice-box ring instead
    of (or beside) coffee ring, alphabet-block tab glyphs. Cursor over the book = tiny paw. Keep it readable, light (SVG),
    reduced-motion safe.
  - Programmer: smooth transitions for every layout change (open/close notebook, bench on/off, breakpoint changes, sheet
    tab switch, resize release, page turn): use the View Transitions API (`document.startViewTransition`) when present,
    with named elements (room, book, editor) so they morph; FLIP/transform fallback otherwise; the canvas still re-fits
    once (after the transition), no per-frame canvas resize; reduced motion = instant. Book open: the cover swings open
    on its binding (3D rotateY) and a paw "pats" the page.
- 2026-10-06 Director (after session restart): transition naming RECONCILED. The programmer's mechanism is canonical:
  `<html data-vt="nb-open|nb-close|bench-on|bench-off|breakpoint|sheet|resize">` while a transition runs, and
  view-transition-names set inline only during it (nb-room, nb-book, nb-editor, nb-timeline, nb-controls; programmer
  adds nb-sheettabs). Designer rewrites its §9 selectors from `html.nb-vt*` to `html[data-vt]` /
  `html[data-vt="nb-open"]` etc. Programmer: scene.resize() synchronously inside the VT update callback; `.nb-closing`
  (420ms) before closed; the 3 DOM asks (night field markup with `.nb-in`, `data-v` on `b.nb-verdict`, WY cap + obs rows
  only with LISTEN columns); skip startViewTransition when `window.__cap` exists or under reduced motion.
