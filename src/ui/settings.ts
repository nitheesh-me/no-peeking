/** Settings modal: volumes, nerd mode, reduced motion, x-ray default, and the save-file joke (which is true). */
import { audio } from '../engine/deps';
import { save, persist, resetSave, lastRepair } from '../engine/store';
import { h, modal, toast } from '../engine/util';
import { applySettings, nav } from './app';

export function openSettings(): void {
  const s = save.settings;
  const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
    const out = h('span', null, `${Math.round(s[key] * 100)}`);
    const inp = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100), 'aria-label': label }) as HTMLInputElement;
    inp.addEventListener('input', () => { s[key] = +inp.value / 100; out.textContent = inp.value; applySettings(); });
    inp.addEventListener('change', () => audio.sfx('ui_click'));
    return h('div', { class: 'setting' }, h('span', null, label), inp, out);
  };
  const toggle = (label: string, sub: string, key: 'nerd' | 'reducedMotion' | 'xrayDefault') => {
    const inp = h('input', { type: 'checkbox' }) as HTMLInputElement;
    inp.checked = s[key];
    inp.addEventListener('change', () => { s[key] = inp.checked; applySettings(); audio.sfx('ui_click'); });
    return h('label', { class: 'toggle' }, h('span', null, h('div', null, label), h('div', { class: 'muted', style: 'font-size:12px' }, sub)), inp);
  };
  let close = () => {};
  const body = h('div', null,
    h('h2', null, 'Settings'),
    slider('Master', 'master'), slider('Music', 'music'), slider('Sounds', 'sfx'),
    toggle('Nerd mode', 'X-ray also shows amplitudes, kets and ⟨Z⟩ numbers', 'nerd'),
    toggle('X-ray on by default', 'for replays and the curious (spoils the blanket!)', 'xrayDefault'),
    toggle('Reduced motion', 'fewer wiggles and shakes', 'reducedMotion'),
    h('div', { class: 'save-joke' }, 'Save data protected by 3-qubit repetition code ✓',
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:2px' }, lastRepair ? 'A corrupted copy was found and outvoted on load. It works!' : 'Really: three copies, majority vote on load.')),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => { save.flags.unlockAll = !save.flags.unlockAll; persist(); toast(save.flags.unlockAll ? 'All levels unlocked (judge mode)' : 'Normal unlocks'); } }, 'Unlock all levels'),
      h('button', { class: 'btn small', onclick: () => { if (confirm('Erase all progress?')) { resetSave(); applySettings(); close(); nav.go('title'); } } }, 'Erase save')),
  );
  close = modal(body);
}
