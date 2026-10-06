# Lab Notebook v2: QA harness + v1 baseline defects (QA/Critic, 2026-10-06)

## 1. The harness

Files (QA-owned): `tools/nb/shoot.mjs` (screens + layout report), `tools/nb/diff.py` (pixel diff between two runs).

`shoot.mjs` loads the video capture shim (`tools/video/capture/shim.js`): virtual clock, seeded `Math.random`, CSS
animations driven by virtual time, transitions disabled, audio off. It also stubs Vite's HMR socket, so another agent
saving a file can't reload the page mid-run (a reload that happens anyway retries the session up to 3 times). Each
viewport gets its own browser context, DPR 1, software GL, and one Chromium at a time.

Per viewport (2560x1440, 1920x1080, 1440x900, 1366x768, 1280x720, 1024x768, 820x1180, 390x844), per nerd on/off, and
per level (`2-3` = fixed Bedtime + editable Morning, `3-1` = both phases editable), each phase pre-loaded with the
level's solution, it shoots these states:
`idle` → (nerd on) `nbopen` (spine clicked) → Step mode + 3x `step ▶` = `step3` (State page: the 🙈 hidden state) →
`step3-xray` → (nerd on, first level) a page tour `page-<id>` over all 8 pages plus `pinned-wide` → `end` (night played out).
With nerd on it also shoots `locked` / `locked-click` (a save with progress up to 2-2, so later pages are sealed) and
`kbd-tab6` (keyboard walk: focus the spine, Enter, Tab x6, Esc, Space; the walk is logged in report.json).

Output: `tools/nb/out/<label>/<viewport>/<on|off>-<level>-<state>.png`, `report.json` (bounding boxes of canvas, `.nb`,
`.nb-book`, `.nb-spine`, `.editor`, every `.prog-col`, `.controls`, `.timeline`, topbar, HUD, …, plus issues) and
`summary.txt` (issue counts plus the issues for each shot).

Automated checks for each shot: horizontal/vertical page scroll; notebook book/spine overlapping controls, timeline,
editor, editor foot, topbar, HUD, dialogue or hints; % of the scene canvas the notebook covers; key elements outside the
viewport; for every visible button/tab/card, whether its centre is on screen and `elementFromPoint` actually hits it
(catches covering and clipping; items merely scrolled out of an inner scroller are ignored); canvas stretched
(backing aspect ≠ CSS aspect) or not re-fitted; clipped/truncated labels (overflow hidden, ellipsis, line clamp) and
text spilling out of its box; inner horizontal scroll in notebook/editor containers; notebook text below 11px; SVG
text in the notebook rendered < 8px tall; touch targets < 24px (touch viewports only); console errors and page errors.

### Commands

```bash
# full run (all viewports, nerd on+off, both levels, tour + extras): ~10-12 min
node tools/nb/shoot.mjs --label=v2
# one or a few viewports (regression gate while iterating)
node tools/nb/shoot.mjs --label=v2-1366 --only=1366x768
node tools/nb/shoot.mjs --label=v2-small --only=1024x768,820x1180,390x844
# nerd OFF only (for the pixel-identity proof)
node tools/nb/shoot.mjs --label=v2-off --nerd=off --no-extras
# other knobs: --base=http://127.0.0.1:4420/ (default)  --levels=2-3,3-1  --nerd=on|off|both  --tour=none|<vp,...>  --dpr=1|2

# the nerd-OFF gate: compare against the pristine-HEAD baseline
python3 tools/nb/diff.py baseline-off v2-off            # exit 1 if any image differs; diff PNGs in tools/nb/out/_diff/
python3 tools/nb/diff.py baseline-off v2-off --strict   # no raster-noise allowance
cat tools/nb/out/v2/summary.txt                          # layout checks
```

### Baseline and how far to trust the diff

- `tools/nb/out/baseline-off/` was shot from **pristine HEAD (3f0ce62)**. I exported it with `git archive HEAD` into my
  scratchpad, symlinked node_modules, and served it with Vite on :4421 using its own cacheDir. None of it came from :4420.
  `tools/nb/out/v1-head/` holds the nerd-ON "before" shots from the same server. That run was cut short by the session
  restart, so only 2560x1440, 1920x1080 and 1440x900 exist.
- Determinism: two runs of the same HEAD build agree to within a few anti-aliased pixels (≤ 64 px, delta ≤ 48, almost
  all on the fidelity bar / timeline). `diff.py` reports these as `noise` and passes them; `--strict` fails them instead.
  In the second baseline pair, 7 shots differed by 65-875 px, all in the timeline/controls row (bottom-left area). The
  cause was a `step ▶` button caught mid press/hover transition. **Fixed in the harness after the baseline was taken**:
  every shot now moves the mouse to (0,0), settles for 400 ms of virtual time, and turns off CSS transitions.
  **Before the final gate, retake the baseline with the fixed harness**, so the two runs differ only in the code under test:
  ```bash
  S=<scratch>/head; git archive 3f0ce62 | tar -x -C $S; ln -s $PWD/node_modules $S/node_modules
  # give the copy its own cache: vite.config.ts → cacheDir: '../vite-cache-4421'
  (cd $S && npx vite --port 4421 --strictPort --host 127.0.0.1 &)
  node tools/nb/shoot.mjs --label=baseline-off --base=http://127.0.0.1:4421/ --nerd=off --no-extras
  node tools/nb/shoot.mjs --label=v1-head --base=http://127.0.0.1:4421/ --nerd=on
  ```
  When killing that server, don't use `pkill -f "vite --port 4421"`: the pattern matches the calling shell and kills it
  too. Use `pgrep -f "[v]ite --port 442[1]"`.
- Early warning (from before the transition fix): WIP on :4420 at ~21:30 vs baseline-off differed only in
  `1440x900/off-2-3-end` and `2560x1440/off-2-3-end` (161 px in the controls row: the same press-state jitter, not a
  real change). Everything else was identical or noise.

## 2. v1 defects (nerd mode), ranked

Screens are `tools/nb/out/v1-head/<vp>/…` unless noted. Numbers come from `report.json`.

1. **The book sits on the game.** `.nb-book` is a ~300px absolute overlay on the scene's left edge. It covers 15% of
   the canvas at 2560, 23% at 1920, 36-38% at 1440/1366, 40% at 1280, and 51% at 1024 (first run). The q1 Qubble and
   Schrödi are under the book or the spine in most shots (`1440x900/on-2-3-step3.png`). Nothing re-fits the scene
   around it.
2. **The notebook hides the HUD.** It overlaps `.stage-hud` in every open shot (8.9-10k px²). The X-RAY pill and the
   "dream" fidelity label sit under the book, and only "3%" pokes out (`1920x1080/on-2-3-pinned-wide.png`,
   `1440x900/on-2-3-step3-xray.png`). Cause: `.nerd-host` is z 3 and the HUD is z 2.
3. **The width doesn't respond, and Pin "wide" does nothing.** The book is ~300px at every viewport, 2560 included. In
   `createNerdNotebook`, `maxW() = host.clientWidth * 0.6`, but `host` (`.nerd-host`) is sized *by the book itself*. The
   ResizeObserver therefore clamps the default 360 down to the 300 floor at once, and `📌` toggles to "60% of itself"
   (`1920x1080/on-2-3-pinned-wide.png` is the same width as `…-page-export.png`). The resize grip has the same
   ceiling. Real bug, not just style.
4. **The spine tab floats mid-scene.** When the book is open, "📓 LAB NOTEBOOK" hangs beside it, over the daycare, at
   vertical centre (covers 1% of the canvas plus a Qubble at ≤1280). It reads as a stray sticker, not a book spine.
5. **No keyboard path into the book.** Focus spine → Enter opens it, but the next Tab goes to the playback controls
   (`Step mode`, `▶`, …). Focus never enters the book, because the spine comes after the book in the DOM and nothing
   moves focus on open. Escape only closes when focus is already inside, so after tabbing away the book can't be
   closed from the keyboard. The book is `role=dialog` with no focus management. (`kbd-tab6` walk in report.json.)
6. **Pages are crushed into ~200px of usable width.** 96px tab rail plus 30px margin padding:
   - Circuit: one column of gates shows, the rest needs horizontal scroll, and the "NIGHT" phase label is cut to "N"
     (`1440x900/on-2-3-page-circuit.png`). This is the page that's supposed to deliver the big cards ↔ gates reveal.
   - Export: Qiskit/QASM lines are cut off at about 25 characters in a horizontal scroller
     (`1920x1080/on-2-3-pinned-wide.png`).
   - State: the Dirac sum wraps awkwardly, and the histogram's axis labels render 6-7px tall (`svg-text-tiny` in every
     resolution).
7. **Tab labels break mid-word.** "Entanglem/ent", "Stabilizers / & / syndrome" over 3 lines, "Density / matrix".
   The sub-lines (`small`) are hidden below 1100px, so the tabs lose their plain-words explanation. Tab text is
   11.5px and hints are 9.5px. Half the text runs on the open page are < 11px (min 10.5px; `small-text` on every
   shot).
8. **The open book is mostly empty paper.** With no night run, a page is a title, one line, "Run a night…" and the
   margin note, with 60-70% of a full-height column left blank (`1920x1080/on-2-3-locked.png`). After 3 steps with
   X-ray off, State/Bloch/Entangle/Density all show the same 🙈 stamp. Correct, but it's a dead end: there's no
   "turn on X-ray" button on the stamp, just text.
9. **Locked/NEW states are noisy and dull.** With unlock-all, every tab gets a red "NEW" badge every time a profile
   is fresh. Sealed tabs are grey hatching with a 🔒 and tiny text, and clicking one only wiggles it: no tooltip
   on touch, nothing saying *which* level ("unlocks after 2-3" is hidden in the `<small>` at small widths)
   (`…/on-2-3-locked-click.png`).
10. **The editor doesn't change in nerd mode.** Bedtime | Morning stay side by side at their nerd-off widths. At 1024
    the `.prog-list` scrolls sideways (201px of content in 190px), and at 1024x768 "Clear" in the editor foot is
    covered by "Test all" (first run: `btn-covered`).
11. **Small viewports (first run; the v1 reshoot didn't get this far).** 390x844: the notebook overlay covers the
    whole scene, 50 key-element off-screen hits, 22 clipped labels, the book overlaps the timeline/controls region
    (`overlap` x35), and editor columns scroll sideways. 820x1180: the scene is a strip, and the 360/300px book covers
    37% of it. No bottom-sheet behaviour exists. These numbers all need confirming on the fresh baseline.
12. **Animation/polish.** The open animation is a 30px slide plus fade, with no page-turn. The margin note animates in
    with a `clip-path` wipe (1.2 s) that is still mid-wipe 0.6 s after opening, and looks like clipped text in quick
    screenshots. The tear-in only plays on "fresh" pages. Reduced motion is honoured: `.nb-reduced`, `.reduced .nb`
    and the media query all kill the animations.

Nothing in v1 caused horizontal *page* scroll or console errors at any desktop size. The canvas is never stretched,
because it re-fits via its own ResizeObserver, though the overlay means it doesn't need to.

## 3. Final-gate checklist (for the v2 run)
- `python3 tools/nb/diff.py baseline-off v2-off` → all identical or noise.
- `summary.txt` for v2 shows zero `overlap:high`, `btn-covered`, `btn-offscreen`, `offscreen`, `hscroll`,
  `canvas-aspect` and `console`, and no `covers-scene` (the notebook is a column now).
- `svg-text-tiny` and `small-text` are gone or justified. The `kbd` walk enters the book after Enter on the spine,
  and Esc closes it from anywhere in the book.
- Eyeball the 390x844 and 820x1180 shots (bottom sheet) and 2560 (open-book spread).
