/** QASM-like text pane, two-way synced with the grid. Parse errors are shown inline (gutter marks + list). */
import type { QubitId } from '../../../core/contracts';
import { t } from '../../../i18n/index';
import type { Column, PhaseName } from './model';
import { parseText, printText, type TextError } from './qasm';

export interface TextPaneHandle {
  /** grid → text (ignored while the user is typing in the pane) */
  show(stages: { phase: PhaseName; cols: Column[] }[]): void;
  setReadOnly(ro: boolean): void;
  destroy(): void;
}

export function createTextPane(host: HTMLElement, opts: { wires: QubitId[]; phases: PhaseName[]; onParsed(stages: Partial<Record<PhaseName, Column[]>>): void }): TextPaneHandle {
  const wrap = document.createElement('div'); wrap.className = 'afi-text';
  const body = document.createElement('div'); body.className = 'afi-text-body';
  const gutter = document.createElement('pre'); gutter.className = 'afi-text-gutter'; gutter.setAttribute('aria-hidden', 'true');
  const ta = document.createElement('textarea');
  ta.className = 'afi-text-area'; ta.spellcheck = false; ta.wrap = 'off';
  ta.setAttribute('aria-label', t('afi.editor.textLabel'));
  const errs = document.createElement('ul'); errs.className = 'afi-text-errors'; errs.setAttribute('aria-live', 'polite');
  body.append(gutter, ta);
  wrap.append(body, errs);
  host.appendChild(wrap);
  let typing = false, timer = 0;

  const paintGutter = (bad: Set<number>) => {
    const n = ta.value.split('\n').length;
    gutter.innerHTML = Array.from({ length: n }, (_, i) => (bad.has(i + 1) ? `<span class="bad">${i + 1}</span>` : String(i + 1))).join('\n');
  };
  const showErrors = (es: TextError[]) => {
    errs.replaceChildren(...es.map((e) => { const li = document.createElement('li'); li.textContent = `${e.line ? t('afi.editor.line', { n: e.line }) + ': ' : ''}${t(e.key, e.vars)}`; return li; }));
    wrap.classList.toggle('has-errors', es.length > 0);
    paintGutter(new Set(es.map((e) => e.line)));
  };
  const reparse = () => {
    const r = parseText(ta.value, opts.wires, opts.phases);
    showErrors(r.errors);
    if (!r.errors.length) opts.onParsed(r.stages);
  };
  ta.addEventListener('input', () => { typing = true; paintGutter(new Set()); clearTimeout(timer); timer = window.setTimeout(reparse, 350); });
  ta.addEventListener('blur', () => { typing = false; });
  ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) { /* keep Tab for focus navigation */ }
  });
  return {
    show(stages) { if (typing) return; ta.value = printText(stages, opts.wires); showErrors([]); },
    setReadOnly(ro) { ta.readOnly = ro; },
    destroy() { clearTimeout(timer); wrap.remove(); },
  };
}
