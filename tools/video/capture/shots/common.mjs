/** Shared choreography helpers for the shot scripts. */
export const ALL_DONE = ['0-1', '0-2', '1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '4-1', '4-2'];
/** Judge-mode save: everything unlocked, the given levels done (default: none, so no "Continue" etc.). */
export const judge = (progress = [], extra = {}) => ({ unlockAll: true, progress, ...extra });

/**
 * Open a level and (off camera) close its intro dialogue and load programs.
 * progs: 'solution' | { bedtime?: text, morning?: text } | null (keep the level's starter program)
 */
export async function prepLevel(s, id, { progs = 'solution', settle = 0.4, xray = false } = {}) {
  await s.goto('#level/' + id, { settle: 0.2 });
  await s.offCamera(async () => {
    await s.wait(0.5);
    await s.np((np, a) => {
      np.closeDialogue?.();
      const L = np.LEVELS.find((l) => l.id === a.id);
      if (a.progs === 'solution') np.editor().setProgs({ bedtime: L.solution.bedtime ?? [], morning: L.solution.morning ?? [] });
      else if (a.progs) {
        const P = (t) => (t ? np.quantum.parseProgram(t).prog : []);
        np.editor().setProgs({ bedtime: P(a.progs.bedtime), morning: P(a.progs.morning) });
      }
      if (a.xray) np.setXray(true);
    }, { id, progs, xray });
    await s.wait(settle);
    await s.skipDialogue();
  });
}

/** Start a night through the ?qa hook. errors: [{ kind:'flip'|'phase'|'both'|'wobble', t:'q2', … }] */
export async function runNight(s, input = 'zero', errors = []) {
  await s.np((np, a) => np.runNight(a.input, a.errors), { input, errors });
  s.mark('run');
}

/** Wait for an audio event; returns it. kind: sfx name | 'botNote' | 'syndromeChord'. */
export async function waitSfx(s, kind, { timeout = 40, after = 0, mark } = {}) {
  const e = await s.waitForEvent((ev) => (kind === 'botNote' || kind === 'syndromeChord' ? ev.type === kind : ev.type === 'sfx' && (kind instanceof RegExp ? kind.test(ev.name) : ev.name === kind)), { timeout, after });
  if (mark) s.mark(mark, { eventFrame: e.frame });
  return e;
}

/** Wait until the night playback is finished (the test strip / toast appears or pb.done). */
export async function waitNightDone(s, { timeout = 60, after = 0 } = {}) {
  await s.waitFor(() => { const pb = window.__np?.pb?.(); return !!pb && !!pb.done; }, { timeout, after });
  s.mark('night-done');
}

/** Wait for the night phase (lights dimmed) of a running night. */
export async function waitDark(s, { timeout = 30, after = 0 } = {}) {
  await s.waitFor(() => (window.__np?.scene?.night ?? 0) > 0.93, { timeout, after });
  s.mark('dark');
}
