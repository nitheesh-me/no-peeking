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
  **`--heavy` is REQUIRED for every headless-Chromium render and every 4K ffmpeg encode/composite.** It takes one of **3 render slots machine-wide** (a 4th waits). Light jobs (python, JSON, short 1080p ffmpeg) run without `--heavy`.
- The pool as a whole is capped at **16 of 22 cores** with low CPU/IO weight; the desktop (`session.slice`) has **3 GB of protected memory** and top CPU/IO weight. Per-job default CPUQuota is 8 cores.
- A last-resort watchdog kills only Playwright browsers and ffmpeg if system MemAvailable drops below 1.5 GB (logged in `videos/watchdog.log`).

## Still required (these were the actual crash causes)
1. **Chromium: deviceScaleFactor ≤ 2** (1920×1080 × 2 = 4K). Never above 2.
2. **Software rendering only:** `--disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`. No real-GPU rendering (the Intel iGPU shares system RAM and can hang the machine).
3. One browser instance per job, closed in `finally`. Prefer one shared `vite preview` server.
4. Stream frames through pipes into ffmpeg; never hold 4K frame sequences in RAM or in `/tmp` (a tmpfs, so it counts as RAM). Lossless intermediates go to `videos/` on disk.
5. Long renders: chunk them (≤ 600 frames per job), so a failure loses little.
