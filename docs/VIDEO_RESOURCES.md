# Video pipeline: resource rules (MANDATORY for every agent)

**History:** the machine hard-froze twice (no swap; oversized DPR-4.5 GPU Chromium renders, several at once). The first fix used tight 6 GB per-job caps, which then **killed agents' jobs repeatedly**. Those caps are gone.

## Crash #3 (04:18): CPU starvation + desktop page thrash
Six or seven 4 GB software-GL Chromium renders ran at once and saturated all 22 cores. With anonymous memory near the cap and no swap, the kernel evicted the desktop's code pages, so the desktop froze while services kept logging. The fixes are below: the desktop's memory and CPU are protected, the pool's CPU is capped, and at most 3 heavy renders run concurrently.

## Current policy (set by the user): keep 4 GB for the system, give jobs everything else
- **All video jobs run in one shared memory pool**, `npvideo.slice` (systemd user slice): `MemoryMax` = total RAM − 4 GB (≈ 26 GB), and a soft `MemoryHigh` 3 GB lower, where the kernel reclaims and throttles before killing anything. The system's 4 GB is never touched by our jobs.
- **Run every job through the wrapper:**
  ```bash
  tools/video/safe-run.sh -- <command>             # no per-job cap: use what the pool has free
  tools/video/safe-run.sh --mem 12G -- <command>   # optional ceiling; the job WAITS for that much free memory instead of failing
  ```
  **`--heavy` is REQUIRED for every headless-Chromium render and every 4K ffmpeg encode/composite.** It takes one of **2 render slots machine-wide** (a 4th waits). Light jobs (python, JSON, short 1080p ffmpeg) run without `--heavy`.
  **Never wrap an orchestrator in `--heavy`** (`assemble/render.py`, `capture/run.mjs`, `motion/render.mjs` with several jobs): they take slots for their own child jobs. Wrapping the parent made it hold a slot while its children queued for one, a deadlock (19:15–19:50). safe-run now passes the slot down (`NP_RENDER_SLOT`) and a waiting job takes whichever slot frees first. Even so, launch orchestrators plainly: `tools/video/safe-run.sh -- python3 tools/video/assemble/render.py …`.
- The pool as a whole is capped at **10 of 22 cores** with low CPU/IO weight; the desktop (`session.slice`) has **3 GB of protected memory** and top CPU/IO weight. Per-job default CPUQuota is 6 cores. Render one video at a time (crash #4 at 10:35: three 4K renders at once after 6 h of sustained load; thermald runs degraded on this laptop).
- **Sleep is blocked while any job runs** (`systemd-inhibit` inside safe-run.sh): crash #5 at 17:40 was the laptop suspending and hanging on resume mid-render.
- **Crash #6 (20:11):** a hard freeze with no kernel message, and the next boot died about 1 s in. It wasn't resources: at the last sysstat sample (20:10), CPU was 30 % busy, 16 GB was available, load was 7, and there was no OOM. Right before it, the log shows a burst of `msi_wmi` embedded-controller events (20:07–20:08) and USB-C `ucsi_acpi` errors (20:10). That points to firmware, power or heat, not our jobs. **Until it is understood, ONE heavy job at a time**, enforced by safe-run (`NP_RENDER_SLOTS`, default 1). Other heavy jobs show as queued. `tools/video/telemetry.sh` (unit `np-telemetry`) now writes temperatures, clock, load and memory every 5 s to `videos/telemetry.log`, with fsync, so the next freeze leaves evidence.
- **Crash #7 (01:14), the first one caught by the telemetry recorder:**
  - Not heat or memory: CPU at 62 °C, 19.5 GB available, on AC.
  - Load jumped from 7 to 16 (npvideo tasks 43 → 159) in two minutes, as a render fanned out its jobs.
  - Same as #6: bursts of `msi_wmi` embedded-controller events came a few minutes before the freeze.
  - Renders that survived ran at load 2–4.
  - Working theory: power spikes. A CPU *quota* lets the pool burst over all 22 cores for part of each 100 ms period and then throttles it, and the firmware or EC doesn't cope.
  - **Fix: safe-run pins every job to the 8 E-cores (`taskset -c 12-19`, override with `NP_CPUS`); pool quota 800 %.** Steady, lower draw, the P-cores stay free for the desktop, and the load can't spike past 8. Slower, but stable.
  - Keep job fan-out low: render.py should run its chunk jobs one at a time.
  - **2026-10-05, widened at the user's request:** pinned set is now 16 CPUs (`3,4,6-19`: the 8 E-cores plus P-cores 12/20/24/28 with their hyperthreads), pool quota 1600 %, QA ffmpeg 15 threads, render ffmpeg 8 threads. cpu0,1,2,5 and the LP cores stay free for the desktop. If a freeze recurs, check telemetry and revert with `NP_CPUS=12-19`.
- **Crash #8 (2026-10-06 10:23):** a hard freeze during the showcase render's B/C composite stage, with the 16-CPU pin from 10-05 in place. Same signature as #7: load went from 5 to 14 and npvideo tasks from 95 to about 720 within a minute of B/C starting. 63 °C, 8.9 GB minimum MemAvailable, and msi_wmi EC events at 10:10. It left a truncated, non-.tmp B/C chunk in the cache. Response: chunk encodes are now atomic (.tmp then rename), cached chunks are frame-count validated, and the relaunch is pinned to the E-cores (`NP_CPUS=12-19`) with one compositor worker. Whether to revert the 16-CPU widening is the user's call.
- A last-resort watchdog kills only Playwright browsers and ffmpeg if system MemAvailable drops below 1.5 GB (logged in `videos/watchdog.log`).

## Still required (these were the actual crash causes)
1. **Chromium: deviceScaleFactor ≤ 2** (1920×1080 × 2 = 4K). Never above 2.
2. **Software rendering only:** `--disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`. No real-GPU rendering (the Intel iGPU shares system RAM and can hang the machine).
3. One browser instance per job, closed in `finally`. Prefer one shared `vite preview` server.
4. Stream frames through pipes into ffmpeg; never hold 4K frame sequences in RAM or in `/tmp` (a tmpfs, so it counts as RAM). Lossless intermediates go to `videos/` on disk.
5. Long renders: chunk them (≤ 600 frames per job), so a failure loses little.

## No polling (user rule)
**Never write wait loops** (`sleep`/`until`/`while … grep`/`tail -f`/`inotifywait`) to wait for a log file, a keyword, or another agent's output.
- For a long job of your own: run it with the Bash tool's `run_in_background: true` and end your turn. You're re-invoked automatically when it exits. Or run it in the foreground if it fits the timeout.
- If you need another agent's output: don't wait. Finish what you can, report "blocked on X", and stop. The Director is notified when X lands and resumes you.

## Progress board and reviewable outputs (user rule: no silent waiting)
- **Live board:** open `tools/video/progress/status.html` in a browser (it refreshes every 3 s), or run `node tools/video/progress/status.mjs` in a terminal. Every job shows a progress bar, rate, ETA and state (running / queued / done / failed / dead), plus its outputs.
- **Already reporting:** capture (per shot), motion (per job), `assemble/render.py` (stages A, B/C and mux) and `audio/mix.py`. `safe-run.sh` shows a job as **queued** while it waits for a render slot or for memory.
- **Every new long tool must report too:** `tools/video/progress/progress.mjs` (`new Progress(id, {title, total, unit})`, then `.tick(n)`, `.output(path, label)`, `.done(note)` / `.fail(err)`). Python uses `progress.py`, with the same API. Set `NP_AGENT=<your role>` in the environment.
- **Every finished job leaves something to review:** a contact sheet (`contactSheet()` / `contact_sheet()` writes `videos/review/<name>_sheet.png`), stills, or an H.264 preview MP4, registered with `.output()`. Lossless FFV1 masters don't play in a browser, so they don't count as reviewable.
- **Record:** every finished or failed job is appended to `videos/progress/history.jsonl`.
- **Don't idle.** If your next step depends on something not ready yet, work with what exists (placeholders, proxies, partial cuts). Placeholders get replaced when the real asset lands.

## Disk guard (2026-10-05)
`/home` reached 97 % full (the video pipeline holds about 218 GB). safe-run now refuses any heavy job, nested ones included, when the videos disk has less than `NP_MIN_FREE_GB` free (default 8). It exits with code 75, so capture/run.mjs retries for a while. Free space before relaunching. Do NOT delete captures, motion assets or render caches without asking the user; only QA by-products, logs and sample renders of finished videos may be removed.
