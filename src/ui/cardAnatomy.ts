/**
 * Card Anatomy: a rich explainer for one Bot Code card.
 *  1. Anatomy diagram: the real card (same classes as the editor), drawn big, with numbered callout
 *     bubbles + leader lines pointing at each part, and a legend that explains every part.
 *  2. "How it works": a tiny scripted program with a ▶ pointer, a light/dream state strip, captions
 *     (aria-live), play / step / restart, scenario toggles (e.g. jump taken vs fall-through) and
 *     curvy jump arrows like the editor's. Reduced motion ⇒ no autoplay, instant steps.
 *
 * Usage: const a = cardAnatomy('IF', level); parent.append(a.el); … a.destroy();
 */
import type { LevelDef, Op, OpName } from '../core/contracts';
import { h } from '../engine/util';
import { CARD_GUIDE } from './cardGuide';
import { doodleSvg, PENS } from './editor/doodle';
import '../styles/cardAnatomy.css';

// ───────────────────────── card rendering (mirrors editor cardEl, non-interactive) ─────────────────────────

const isBotId = (s: string) => /^[a-h]$/.test(s);
const SAMPLE_DOODLE = '0:M8 30L18 12L28 30|1:M40 22L70 22|1:M63 15L70 22L63 29|4:M82 12L82 13|4:M90 12L90 13|4:M80 24L86 29L94 24';

interface CardParts { card: HTMLElement; parts: Record<string, HTMLElement> }

function chip(text: string, cls = ''): HTMLElement {
  return h('span', { class: `chip ${cls}`.trim() }, text);
}

function buildCard(op: Op, o: { peekWakes?: boolean; interactive?: boolean } = {}): CardParts {
  const parts: Record<string, HTMLElement> = {};
  const c = h('div', { class: `card op-${op.op}` });
  const name = op.op === 'LABEL' ? '⚑' : op.op === 'NOTE' ? '✎' : op.op;
  if (op.op === 'PEEK' && o.peekWakes && !isBotId(op.t)) c.classList.add('hazard');
  parts.name = h('span', { class: 'cname' }, name);
  c.appendChild(parts.name);
  const target = (v: string, key: string) => { const el = chip(v, isBotId(v) ? 'bot' : ''); parts[key] = el; c.appendChild(el); };
  switch (op.op) {
    case 'BOOP': case 'SHUSH': case 'SPIN': case 'LISTEN': case 'RESET': target(op.t, 'target'); break;
    case 'PEEK':
      target(op.t, 'target');
      if (o.peekWakes !== undefined) {
        const wakes = o.peekWakes && !isBotId(op.t);
        parts.tag = h('small', { class: 'peek-tag ' + (wakes ? 'wakes' : 'safe') }, wakes ? 'wakes it!' : 'safe');
        c.appendChild(parts.tag);
      }
      break;
    case 'HIGHFIVE':
      target(op.from, 'from');
      parts.arrow = h('span', { class: 'arrow' }, '→'); c.appendChild(parts.arrow);
      target(op.to, 'to');
      break;
    case 'IF': {
      const box = h('div', { class: 'conds' });
      op.conds.forEach((cd, k) => {
        const row = h('span', { class: 'cond-row' });
        if (k > 0) { const kw = h('span', { class: 'kw' }, 'and'); row.appendChild(kw); if (k === 1) parts.and = kw; }
        const who = chip(cd.who, isBotId(cd.who) ? 'bot' : '');
        let light: HTMLElement;
        if (o.interactive) {
          const b = h('button', { type: 'button', class: `chip ${cd.is === 'BEEP' ? 'beep' : 'quiet'}`, 'aria-label': `Light to check for ${cd.who}: ${cd.is}. Click to toggle.` }, cd.is);
          b.addEventListener('click', () => {
            cd.is = cd.is === 'BEEP' ? 'QUIET' : 'BEEP';
            b.textContent = cd.is; b.className = `chip ${cd.is === 'BEEP' ? 'beep' : 'quiet'} ca-toggled`;
            b.setAttribute('aria-label', `Light to check for ${cd.who}: ${cd.is}. Click to toggle.`);
          });
          light = b;
        } else light = chip(cd.is, cd.is === 'BEEP' ? 'beep' : 'quiet');
        row.append(who, light);
        if (k === 0) { parts.who = who; parts.light = light; parts.row = row; }
        box.appendChild(row);
      });
      if (o.interactive) { parts.add = chip('+', 'add'); box.appendChild(parts.add); }
      c.appendChild(box);
      parts.arrow = h('span', { class: 'arrow' }, '→'); c.appendChild(parts.arrow);
      parts.label = chip(op.label); c.appendChild(parts.label);
      break;
    }
    case 'JUMP': parts.label = chip(op.label); c.appendChild(parts.label); break;
    case 'LABEL': parts.label = h('span', { class: 'ca-lname' }, op.name); c.appendChild(parts.label); break;
    case 'NOTE':
      parts.text = h('span', { class: 'ca-ntext' }, op.text); c.appendChild(parts.text);
      if (op.drawing) { parts.pad = h('div', { class: 'doodle-box' }, doodleSvg(op.drawing)); c.appendChild(parts.pad); }
      break;
    case 'END': break;
  }
  return { card: c, parts };
}

// ───────────────────────── anatomy specs ─────────────────────────

interface Callout { targets: string[]; side: 'top' | 'bottom' | 'none'; title: string; text: string; extra?: () => HTMLElement }
interface AnatomySpec { op: Op; callouts: Callout[]; notes?: string[]; below?: 'fallthrough' | 'phases'; wide?: boolean }

function anatomySpec(name: OpName, level?: LevelDef): AnatomySpec {
  const bots = level?.bots?.map((b) => b.id) ?? [];
  const day = !!level?.classical;
  const w1 = day ? 'q1' : (bots[0] ?? 'a'), w2 = day ? 'q2' : (bots[1] ?? 'b');
  const q = 'q1', bot = bots[0] ?? 'a';
  const g = CARD_GUIDE[name];
  const targetTxt = 'Who to do it to: a Qubble (q1, q2…) or a bot (a, b…). Click the chip, or click a creature in the room.';
  switch (name) {
    case 'IF': return {
      op: { op: 'IF', conds: [{ who: w1, is: 'BEEP' }, { who: w2, is: 'QUIET' }], label: 'fix1' }, wide: true, below: 'fallthrough',
      callouts: [
        { targets: ['who'], side: 'bottom', title: 'Condition row: who to check', text: day ? 'Pick a box you already PEEKed (or a bot). Click the chip to choose.' : 'Pick a bot to check (on the day shift: a box you PEEKed). Click the chip to choose.' },
        { targets: ['light'], side: 'bottom', title: 'The light to check', text: 'BEEP means it heard a 1, QUIET means a 0. Click it to toggle. A bot nobody has listened to counts as QUIET.' },
        { targets: ['and', 'add'], side: 'bottom', title: '"and" + the + button', text: 'Press + to add another row (up to 4). Rows are joined by "and": EVERY row must match.' },
        { targets: ['arrow', 'label'], side: 'top', title: 'Arrow and spot chip: where to jump', text: 'If everything matches, the bots jump to this ⚑ spot. Click it to pick a spot, or "+ new spot".' },
        { targets: [], side: 'none', title: 'No match? Fall through', text: 'If any row fails, nothing happens: the bots just carry on with the very next card.' },
      ],
    };
    case 'JUMP': return {
      op: { op: 'JUMP', label: 'done' },
      callouts: [
        { targets: ['name'], side: 'top', title: 'JUMP: always jumps', text: 'No lights are checked, no questions asked. Every single time.' },
        { targets: ['label'], side: 'top', title: 'The spot chip: where to land', text: 'A ⚑ spot (LABEL). Click it to pick one, or choose "+ new spot" to make one.' },
      ],
      notes: ['Jump forward to skip cards (for example, the other fixes).', 'Jump backward to make a loop. The night has a step limit, so add an IF to escape.'],
    };
    case 'LABEL': return {
      op: { op: 'LABEL', name: 'fix1' },
      callouts: [
        { targets: ['name'], side: 'top', title: 'The ⚑ flag', text: 'Marks a spot in your program that IF and JUMP can land on.' },
        { targets: ['label'], side: 'top', title: 'The spot name', text: 'IF and JUMP chips point at this name. It is made for you when you pick "+ new spot" on an IF or JUMP.' },
      ],
      notes: ['Does nothing by itself: bots walk right over it.', 'Does not count as a line.'],
    };
    case 'END': return {
      op: { op: 'END' }, below: 'phases',
      callouts: [
        { targets: ['name'], side: 'top', title: 'END: stop this phase now', text: 'Bedtime or Morning stops right here. Cards below it do not run.' },
      ],
      notes: ['After a Bedtime END, the night still happens, then Morning runs.', 'Put END after each fix so you do not fall into the next fix.', 'Running off the bottom of a phase ends it too.'],
    };
    case 'NOTE': return {
      op: { op: 'NOTE', text: 'check a, then b', drawing: SAMPLE_DOODLE }, wide: true,
      callouts: [
        { targets: ['name'], side: 'top', title: 'The ✎ comment mark', text: 'This card is a note for you, not for the bots.' },
        { targets: ['text'], side: 'top', title: 'The text line', text: 'Type anything (up to 60 letters) right on the card.' },
        { targets: ['pad'], side: 'bottom', title: 'The doodle pad', text: 'Click it to draw your plan: 5 pens, an eraser and undo.', extra: penRow },
      ],
      notes: ['Bots ignore it completely.', 'Does not count as a line.', 'Kept in Text copy and paste, and in snippets.'],
    };
    case 'HIGHFIVE': return {
      op: { op: 'HIGHFIVE', from: 'q1', to: bot },
      callouts: [
        { targets: ['name'], side: 'top', title: 'Card name: what to do', text: g.what },
        { targets: ['from'], side: 'bottom', title: 'From: the one who decides', text: 'If it is Moony (1), the other one flips. If Sunny (0), nothing happens.' },
        { targets: ['arrow'], side: 'top', title: 'The arrow', text: 'Order matters: it points from the decider to the one who flips.' },
        { targets: ['to'], side: 'bottom', title: 'To: the one who flips', text: 'Often a bot, so it can learn about the Qubbles without peeking.' },
      ],
    };
    case 'LISTEN': case 'RESET': return {
      op: { op: name, t: bot } as Op,
      callouts: [
        { targets: ['name'], side: 'top', title: 'Card name: what to do', text: g.what },
        { targets: ['target'], side: 'bottom', title: 'Which bot', text: 'Bots only (a, b…). Click the chip, or click a bot in the room.' },
      ],
    };
    case 'PEEK': {
      const wakes = !(level?.classical || level?.allowPeekData);
      return {
        op: { op: 'PEEK', t: q },
        callouts: [
          { targets: ['name'], side: 'top', title: 'Card name: what to do', text: day ? 'Open the box and read the bit inside. On the day shift this is fine.' : g.what },
          { targets: ['target'], side: 'bottom', title: 'What to look at', text: 'A Qubble or box (q1…) or a bot (a…). Peeking at a bot is always safe.' },
          { targets: ['tag'], side: 'top', title: wakes ? 'Wakes it!' : 'Safe here', text: wakes ? 'Looking at a Qubble wakes it, and its double-dream pops into one. Ask a bot instead.' : 'Peeking is allowed in this level.' },
        ],
      };
    }
    default: return {
      op: { op: name, t: q } as Op,
      callouts: [
        { targets: ['name'], side: 'top', title: 'Card name: what to do', text: g.what },
        { targets: ['target'], side: 'bottom', title: 'Who: the target chip', text: targetTxt },
      ],
    };
  }
}

function penRow(): HTMLElement {
  return h('span', { class: 'ca-pens', 'aria-hidden': 'true' },
    ...PENS.map((c) => h('i', { class: 'ca-pen', style: `background:${c}` })),
    h('i', { class: 'ca-tool' }, '⌫'), h('i', { class: 'ca-tool' }, '↶'));
}

// ───────────────────────── anatomy diagram ─────────────────────────

function offsetIn(el: HTMLElement, root: HTMLElement): { x: number; y: number; w: number; h: number } {
  let x = 0, y = 0, n: HTMLElement | null = el;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function buildAnatomy(name: OpName, level: LevelDef | undefined): { el: HTMLElement; layout: () => void } {
  const spec = anatomySpec(name, level);
  const peekWakes = name === 'PEEK' ? !(level?.classical || level?.allowPeekData) : undefined;
  const { card, parts } = buildCard(spec.op, { peekWakes, interactive: true });
  card.classList.add('ca-big');
  if (spec.wide) card.classList.add('ca-wide');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ca-leaders'); svg.setAttribute('aria-hidden', 'true');
  const stage = h('div', { class: 'ca-stage' }, card);
  const diagram = h('div', { class: 'ca-diagram', role: 'group', 'aria-label': `${CARD_GUIDE[name].name} card, labelled parts` });
  diagram.append(svg, stage, h('div', { class: 'ca-gap' + (spec.callouts.some((c) => c.side === 'bottom') ? '' : ' short') }));
  const legend = h('ol', { class: 'ca-legend' });
  const bubbles: { b: HTMLElement; c: Callout; targets: HTMLElement[] }[] = [];
  spec.callouts.forEach((c, i) => {
    const n = String(i + 1);
    const targets = c.targets.map((k) => parts[k]).filter(Boolean);
    const item = h('li', { tabindex: 0 },
      h('span', { class: 'ca-num', 'aria-hidden': 'true' }, n),
      h('span', { class: 'ca-li-body' }, h('b', null, c.title), ' ', c.text, c.extra ? c.extra() : null));
    legend.appendChild(item);
    let b: HTMLElement | null = null;
    if (c.side !== 'none') {
      b = h('span', { class: `ca-bubble ${c.side}`, 'aria-hidden': 'true' }, n);
      diagram.appendChild(b);
      bubbles.push({ b, c, targets });
    }
    const hl = (on: boolean) => { targets.forEach((t) => t.classList.toggle('ca-hl', on)); b?.classList.toggle('ca-hl', on); item.classList.toggle('ca-hl', on); svg.querySelectorAll(`[data-n="${n}"]`).forEach((p) => p.classList.toggle('ca-hl', on)); };
    item.addEventListener('pointerenter', () => hl(true)); item.addEventListener('pointerleave', () => hl(false));
    item.addEventListener('focus', () => hl(true)); item.addEventListener('blur', () => hl(false));
    b?.addEventListener('pointerenter', () => hl(true)); b?.addEventListener('pointerleave', () => hl(false));
  });
  if (spec.below === 'fallthrough') {
    const n = String(spec.callouts.length);
    diagram.appendChild(h('div', { class: 'ca-next' },
      h('span', { class: 'ca-num', 'aria-hidden': 'true' }, n),
      h('span', { class: 'ca-next-arrow', 'aria-hidden': 'true' }, '↓'),
      h('span', null, 'no match? the ', h('b', null, 'next card'), ' runs')));
  }
  if (spec.below === 'phases') {
    diagram.appendChild(h('div', { class: 'ca-phases', 'aria-label': 'Bedtime ends, then the night, then Morning' },
      h('span', { class: 'ca-ph' }, '🛏 Bedtime', h('span', { class: 'ca-endpip' }, 'END')),
      h('span', { class: 'ca-ph-arrow', 'aria-hidden': 'true' }, '→'),
      h('span', { class: 'ca-ph night' }, '👻 Night'),
      h('span', { class: 'ca-ph-arrow', 'aria-hidden': 'true' }, '→'),
      h('span', { class: 'ca-ph' }, '☀ Morning')));
  }
  const notes = spec.notes?.length ? h('ul', { class: 'ca-notes' }, ...spec.notes.map((t) => h('li', null, t))) : null;
  const el = h('div', { class: 'ca-anatomy' }, diagram, legend, notes);

  const layout = () => {
    const W = diagram.clientWidth, H = diagram.clientHeight;
    if (!W) return;
    svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const cr = offsetIn(card, diagram);
    const R = 13, GAP = 2 * R + 6;
    for (const side of ['top', 'bottom'] as const) {
      const group = bubbles.filter((x) => x.c.side === side && x.targets.length).map((x) => {
        const rs = x.targets.map((t) => offsetIn(t, diagram));
        const tx = rs[0].x + rs[0].w / 2;
        return { ...x, rs, x: tx };
      }).sort((a, b) => a.x - b.x);
      for (let i = 0; i < group.length; i++) group[i].x = Math.max(group[i].x, R + 2, i ? group[i - 1].x + GAP : -1e9);
      for (let i = group.length - 1; i >= 0; i--) group[i].x = Math.min(group[i].x, W - R - 2, i < group.length - 1 ? group[i + 1].x - GAP : 1e9);
      const by = side === 'top' ? cr.y - 34 : cr.y + cr.h + 34;
      for (const gq of group) {
        gq.b.style.left = `${gq.x - R}px`; gq.b.style.top = `${by - R}px`;
        const n = gq.b.textContent ?? '';
        for (const r of gq.rs) {
          const tx = r.x + r.w / 2, ty = side === 'top' ? r.y - 2 : r.y + r.h + 2;
          const sy = side === 'top' ? by + R : by - R;
          const p = document.createElementNS(NS, 'path');
          const my = (sy + ty) / 2;
          p.setAttribute('d', `M ${gq.x} ${sy} C ${gq.x} ${my}, ${tx} ${my}, ${tx} ${ty}`);
          p.setAttribute('data-n', n);
          svg.appendChild(p);
          const dot = document.createElementNS(NS, 'circle');
          dot.setAttribute('cx', String(tx)); dot.setAttribute('cy', String(ty)); dot.setAttribute('r', '3.5');
          dot.setAttribute('data-n', n);
          svg.appendChild(dot);
        }
      }
    }
  };
  return { el, layout };
}

// ───────────────────────── walkthrough data ─────────────────────────

type Cell = string; // 'sunny' | 'moony' | 'plus' | 'minus' | 'woke' | 'BEEP' | 'QUIET' | 'unheard' | '0' | '1' | 'box?'
interface Step { pc: number | null; cap: string; st: Record<string, Cell>; jump?: [number, number]; flash?: 'yes' | 'no'; checks?: boolean[]; done?: string; say?: string; bad?: string }
interface Scenario { label: string; prog: Op[]; steps: Step[] }
interface Walk { ask: string; scenarios: Scenario[] }

const L = (name: string): Op => ({ op: 'LABEL', name });

function walkFor(name: OpName, level?: LevelDef): Walk {
  const day = !!level?.classical;
  switch (name) {
    case 'IF': {
      const prog: Op[] = [{ op: 'LISTEN', t: 'a' }, { op: 'LISTEN', t: 'b' }, { op: 'IF', conds: [{ who: 'a', is: 'BEEP' }, { who: 'b', is: 'QUIET' }], label: 'fix1' }, { op: 'END' }, L('fix1'), { op: 'BOOP', t: 'q1' }, { op: 'END' }];
      return {
        ask: 'What the bots hear:',
        scenarios: [
          { label: 'a BEEP · b QUIET', prog, steps: [
            { pc: null, st: { q1: 'moony', a: 'unheard', b: 'unheard' }, cap: 'Flipper flipped q1 in the night. Nobody has listened yet, so both lights count as QUIET.' },
            { pc: 0, st: { q1: 'moony', a: 'BEEP', b: 'unheard' }, cap: 'LISTEN a: bot a heard something odd. Its light is BEEP.' },
            { pc: 1, st: { q1: 'moony', a: 'BEEP', b: 'QUIET' }, cap: 'LISTEN b: bot b heard nothing odd. QUIET.' },
            { pc: 2, st: { q1: 'moony', a: 'BEEP', b: 'QUIET' }, jump: [2, 4], flash: 'yes', checks: [true, true], cap: 'IF: a is BEEP ✓ and b is QUIET ✓. Every row matches, so jump to ⚑ fix1!' },
            { pc: 4, st: { q1: 'moony', a: 'BEEP', b: 'QUIET' }, cap: 'Landed on ⚑ fix1. A spot does nothing by itself: keep going.' },
            { pc: 5, st: { q1: 'sunny', a: 'BEEP', b: 'QUIET' }, cap: 'BOOP q1: the fix runs. q1 is Sunny again.' },
            { pc: 6, st: { q1: 'sunny', a: 'BEEP', b: 'QUIET' }, done: '💤 done', cap: 'END: stop here. Fixed, and back to sleep.' },
          ] },
          { label: 'a QUIET · b QUIET', prog, steps: [
            { pc: null, st: { q1: 'sunny', a: 'unheard', b: 'unheard' }, cap: 'A quiet night: no gremlins. Nobody has listened yet, so both lights count as QUIET.' },
            { pc: 0, st: { q1: 'sunny', a: 'QUIET', b: 'unheard' }, cap: 'LISTEN a: nothing odd. QUIET.' },
            { pc: 1, st: { q1: 'sunny', a: 'QUIET', b: 'QUIET' }, cap: 'LISTEN b: nothing odd. QUIET.' },
            { pc: 2, st: { q1: 'sunny', a: 'QUIET', b: 'QUIET' }, flash: 'no', checks: [false, true], cap: 'IF: a is QUIET, not BEEP ✗. One row fails, so no jump: fall through to the next card.' },
            { pc: 3, st: { q1: 'sunny', a: 'QUIET', b: 'QUIET' }, done: '💤 done', cap: 'END: stop. The fix below never runs, which is right: nothing was broken.' },
          ] },
        ],
      };
    }
    case 'JUMP': return {
      ask: 'Try:',
      scenarios: [
        { label: 'skip ahead', prog: [{ op: 'BOOP', t: 'q1' }, { op: 'JUMP', label: 'done' }, { op: 'SHUSH', t: 'q1' }, { op: 'SPIN', t: 'q1' }, L('done'), { op: 'END' }], steps: [
          { pc: null, st: { q1: 'sunny' }, cap: 'q1 is Sunny. Press play.' },
          { pc: 0, st: { q1: 'moony' }, cap: 'BOOP q1: now Moony.' },
          { pc: 1, st: { q1: 'moony' }, jump: [1, 4], flash: 'yes', cap: 'JUMP done: always jumps, nothing is checked. Off to ⚑ done!' },
          { pc: 4, st: { q1: 'moony' }, cap: 'Landed on ⚑ done. SHUSH and SPIN were skipped.' },
          { pc: 5, st: { q1: 'moony' }, done: '💤 done', cap: 'END. The skipped cards never ran.' },
        ] },
        { label: 'loop back', prog: [L('top'), { op: 'BOOP', t: 'q1' }, { op: 'JUMP', label: 'top' }, { op: 'END' }], steps: [
          { pc: null, st: { q1: 'sunny' }, cap: 'q1 is Sunny. Press play.' },
          { pc: 0, st: { q1: 'sunny' }, cap: 'Walk onto ⚑ top: nothing happens.' },
          { pc: 1, st: { q1: 'moony' }, cap: 'BOOP q1: Moony.' },
          { pc: 2, st: { q1: 'moony' }, jump: [2, 0], flash: 'yes', cap: 'JUMP top: back up we go. That is a loop!' },
          { pc: 0, st: { q1: 'moony' }, cap: 'Back at ⚑ top.' },
          { pc: 1, st: { q1: 'sunny' }, cap: 'BOOP q1: Sunny again.' },
          { pc: 2, st: { q1: 'sunny' }, jump: [2, 0], flash: 'yes', cap: 'JUMP top: and again…' },
          { pc: 0, st: { q1: 'sunny' }, done: '⟳ forever…', cap: '…round and round until the night\'s step limit. Put an IF before the JUMP so it can escape.' },
        ] },
      ],
    };
    case 'LABEL': return {
      ask: 'Try:',
      scenarios: [
        { label: 'jumped to', prog: [{ op: 'IF', conds: [{ who: 'a', is: 'BEEP' }], label: 'fix1' }, { op: 'END' }, L('fix1'), { op: 'BOOP', t: 'q1' }], steps: [
          { pc: null, st: { a: 'BEEP', q1: 'moony' }, cap: 'Bot a said BEEP earlier: q1 needs a fix.' },
          { pc: 0, st: { a: 'BEEP', q1: 'moony' }, jump: [0, 2], flash: 'yes', checks: [true], cap: 'IF a BEEP: yes! Jump to the spot named fix1.' },
          { pc: 2, st: { a: 'BEEP', q1: 'moony' }, cap: 'Landed on ⚑ fix1. That is all a spot is: a place to land.' },
          { pc: 3, st: { a: 'BEEP', q1: 'sunny' }, cap: 'BOOP q1: fixed.' },
          { pc: 3, st: { a: 'BEEP', q1: 'sunny' }, done: '💤 done', cap: 'Ran off the bottom: that ends the phase too.' },
        ] },
        { label: 'walked past', prog: [{ op: 'BOOP', t: 'q1' }, L('spot'), { op: 'SPIN', t: 'q1' }], steps: [
          { pc: null, st: { q1: 'sunny' }, cap: 'q1 is Sunny. Press play.' },
          { pc: 0, st: { q1: 'moony' }, cap: 'BOOP q1: Moony.' },
          { pc: 1, st: { q1: 'moony' }, cap: 'Walk onto ⚑ spot: nothing at all happens. It is not even a line.' },
          { pc: 2, st: { q1: 'minus' }, cap: 'SPIN q1: a swirl.' },
          { pc: 2, st: { q1: 'minus' }, done: '💤 done', cap: 'Done. The spot just sat there, waiting for a jump.' },
        ] },
      ],
    };
    case 'END': {
      const head: Op[] = [{ op: 'IF', conds: [{ who: 'a', is: 'BEEP' }], label: 'fix1' }, { op: 'END' }, L('fix1'), { op: 'BOOP', t: 'q1' }];
      const tail: Op[] = [L('fix2'), { op: 'BOOP', t: 'q2' }];
      const s0 = { a: 'BEEP', q1: 'moony', q2: 'sunny' }, s1 = { a: 'BEEP', q1: 'sunny', q2: 'sunny' };
      return {
        ask: 'Try:',
        scenarios: [
          { label: 'with END', prog: [...head, { op: 'END' }, ...tail], steps: [
            { pc: null, st: s0, cap: 'Bot a said BEEP: q1 got flipped.' },
            { pc: 0, st: s0, jump: [0, 2], flash: 'yes', checks: [true], cap: 'IF a BEEP: jump to ⚑ fix1.' },
            { pc: 2, st: s0, cap: 'Landed on ⚑ fix1.' },
            { pc: 3, st: s1, cap: 'BOOP q1: fixed!' },
            { pc: 4, st: s1, done: '💤 done', cap: 'END: Bedtime stops right here. The fix2 cards never run. (The night still happens next.)' },
          ] },
          { label: 'without END (oops)', prog: [...head, ...tail], steps: [
            { pc: null, st: s0, cap: 'Bot a said BEEP: q1 got flipped.' },
            { pc: 0, st: s0, jump: [0, 2], flash: 'yes', checks: [true], cap: 'IF a BEEP: jump to ⚑ fix1.' },
            { pc: 2, st: s0, cap: 'Landed on ⚑ fix1.' },
            { pc: 3, st: s1, cap: 'BOOP q1: fixed!' },
            { pc: 4, st: s1, cap: 'No END here… so we fall straight into ⚑ fix2.' },
            { pc: 5, st: { a: 'BEEP', q1: 'sunny', q2: 'moony' }, bad: 'q2', cap: 'BOOP q2: oops! q2 was fine, and now IT is flipped.' },
            { pc: 5, st: { a: 'BEEP', q1: 'sunny', q2: 'moony' }, bad: 'q2', done: '💥 oops', cap: 'Ran off the bottom. An END after each fix stops this.' },
          ] },
        ],
      };
    }
    case 'NOTE': return {
      ask: '',
      scenarios: [{ label: '', prog: [{ op: 'NOTE', text: 'plan: flip q1' }, { op: 'BOOP', t: 'q1' }, { op: 'NOTE', text: 'then swirl it', drawing: SAMPLE_DOODLE }, { op: 'SPIN', t: 'q1' }], steps: [
        { pc: null, st: { q1: 'sunny' }, cap: 'Two comments sit in this program. Watch the bots.' },
        { pc: 0, st: { q1: 'sunny' }, say: 'bots ignore me', cap: 'A comment: the bots skip right past it. It is not a line.' },
        { pc: 1, st: { q1: 'moony' }, cap: 'BOOP q1: Moony.' },
        { pc: 2, st: { q1: 'moony' }, say: 'bots ignore me', cap: 'A doodle comment: skipped too. It is just for you.' },
        { pc: 3, st: { q1: 'minus' }, cap: 'SPIN q1: a swirl.' },
        { pc: 3, st: { q1: 'minus' }, done: '💤 done', cap: 'Done: 2 lines ran. The comments cost nothing.' },
      ] }],
    };
    case 'BOOP': return one([{ op: 'BOOP', t: 'q1' }, { op: 'BOOP', t: 'q1' }], [
      [null, { q1: day ? '0' : 'sunny' }, day ? 'Box q1 holds a 0.' : 'q1 dreams Sunny.'],
      [0, { q1: day ? '1' : 'moony' }, day ? 'BOOP q1: the bit flips to 1.' : 'BOOP q1: the dream flips to Moony.'],
      [1, { q1: day ? '0' : 'sunny' }, 'BOOP it again: back where it started. Two BOOPs undo each other.', '💤 done'],
    ]);
    case 'SHUSH': return one([{ op: 'SPIN', t: 'q1' }, { op: 'SHUSH', t: 'q1' }, { op: 'SPIN', t: 'q1' }], [
      [null, { q1: 'sunny' }, 'q1 dreams Sunny.'],
      [0, { q1: 'plus' }, 'SPIN q1: now it swirls one way.'],
      [1, { q1: 'minus' }, 'SHUSH q1: the swirl turns the other way.'],
      [2, { q1: 'moony' }, 'SPIN q1: and it comes out Moony! A shushed swirl spins back to the other dream.', '💤 done'],
    ]);
    case 'SPIN': return one([{ op: 'SPIN', t: 'q1' }, { op: 'SPIN', t: 'q1' }], [
      [null, { q1: 'sunny' }, 'q1 dreams Sunny.'],
      [0, { q1: 'plus' }, 'SPIN q1: the dream turns sideways into a swirl (both dreams at once).'],
      [1, { q1: 'sunny' }, 'SPIN again: Sunny again. Two SPINs undo each other.', '💤 done'],
    ]);
    case 'HIGHFIVE': return one([{ op: 'HIGHFIVE', from: 'q1', to: 'a' }, { op: 'BOOP', t: 'q1' }, { op: 'HIGHFIVE', from: 'q1', to: 'a' }], [
      [null, { q1: 'sunny', a: 'flat' }, 'q1 is Sunny, bot a is fresh.'],
      [0, { q1: 'sunny', a: 'flat' }, 'HIGHFIVE q1 → a: q1 is Sunny, so nothing happens.'],
      [1, { q1: 'moony', a: 'flat' }, 'BOOP q1: now Moony.'],
      [2, { q1: 'moony', a: 'flipped' }, 'HIGHFIVE q1 → a: q1 is Moony, so a flips. (LISTEN to a would now BEEP.)', '💤 done'],
    ]);
    case 'LISTEN': return one([{ op: 'HIGHFIVE', from: 'q1', to: 'a' }, { op: 'LISTEN', t: 'a' }], [
      [null, { q1: 'moony', a: 'unheard' }, 'q1 is Moony. Bot a has not been listened to (counts as QUIET).'],
      [0, { q1: 'moony', a: 'unheard' }, 'HIGHFIVE q1 → a: q1 is Moony, so bot a flips. Its light does not show it yet.'],
      [1, { q1: 'moony', a: 'BEEP' }, 'LISTEN a: its light comes on BEEP (1). IF cards can now check it.', '💤 done'],
    ]);
    case 'RESET': return one([{ op: 'LISTEN', t: 'a' }, { op: 'RESET', t: 'a' }, { op: 'LISTEN', t: 'a' }], [
      [null, { a: 'unheard' }, 'Bot a heard a flip earlier in the night.'],
      [0, { a: 'BEEP' }, 'LISTEN a: BEEP.'],
      [1, { a: 'BEEP' }, 'RESET a: the bot forgets everything and is fresh again. IF still remembers that last BEEP.'],
      [2, { a: 'QUIET' }, 'LISTEN a again: QUIET. Ready to answer a new question.', '💤 done'],
    ]);
    case 'PEEK': {
      const wakes = !(level?.classical || level?.allowPeekData);
      if (day) return one([{ op: 'BOOP', t: 'q1' }, { op: 'PEEK', t: 'q1' }], [
        [null, { q1: 'box?' }, 'Box q1 is closed.'], [0, { q1: 'box?' }, 'BOOP q1: the bit inside flips (you can not see it yet).'],
        [1, { q1: '1' }, 'PEEK q1: open the box and read it: a 1. Safe on the day shift.', '💤 done']]);
      return one([{ op: 'SPIN', t: 'q1' }, { op: 'PEEK', t: 'q1' }], [
        [null, { q1: 'sunny' }, 'q1 dreams Sunny.'], [0, { q1: 'plus' }, 'SPIN q1: a swirl, both dreams at once.'],
        [1, { q1: wakes ? 'woke' : 'moony' }, wakes ? 'PEEK q1: it WAKES UP and the swirl pops into one plain dream. Ask a bot instead!' : 'PEEK q1: the swirl picks one dream at random (allowed here).', wakes ? '😾 woke!' : '💤 done']]);
    }
  }
  return { ask: '', scenarios: [] };
}

function one(prog: Op[], rows: [number | null, Record<string, Cell>, string, string?][]): Walk {
  return { ask: '', scenarios: [{ label: '', prog, steps: rows.map(([pc, st, cap, done]) => ({ pc, st, cap, done })) }] };
}

const CELL: Record<string, [string, string]> = {
  sunny: ['☀ Sunny', 'sunny'], moony: ['☾ Moony', 'moony'], plus: ['↻ swirl', 'swirl'], minus: ['↺ swirl', 'swirl'],
  woke: ['😾 awake: Sunny', 'woke'], '0': ['0', 'bit'], '1': ['1', 'bit'], 'box?': ['📦 ?', 'bit'],
  BEEP: ['BEEP', 'beep'], QUIET: ['QUIET', 'quiet'], unheard: ['QUIET?', 'unheard'], flat: ['fresh', 'fresh'], flipped: ['flipped', 'flipped'],
};

// ───────────────────────── walkthrough player ─────────────────────────

function buildWalk(name: OpName, level: LevelDef | undefined, reduced: boolean): { el: HTMLElement; destroy(): void; layout(): void } {
  const walk = walkFor(name, level);
  const peekWakes = !(level?.classical || level?.allowPeekData);
  let sc = 0, si = 0, timer = 0, playing = false;
  let cards: HTMLElement[] = [];
  const NS = 'http://www.w3.org/2000/svg';
  const stateEl = h('div', { class: 'ca-state', 'aria-label': 'Current lights and dreams' });
  const list = h('ol', { class: 'ca-prog', 'aria-label': 'Mini program' });
  const doneEl = h('div', { class: 'ca-done', 'aria-hidden': 'true' });
  const cap = h('p', { class: 'ca-cap', 'aria-live': 'polite' });
  const counter = h('span', { class: 'ca-count' });
  const playBtn = h('button', { type: 'button', class: 'btn small go ca-play' }, '▶ Play');
  const stepBtn = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Next step' }, 'Step ⏭');
  const backBtn = h('button', { type: 'button', class: 'btn small icon ca-restart', 'aria-label': 'Restart' }, '⏮');
  const toggles: HTMLButtonElement[] = [];
  const scen = () => walk.scenarios[sc];

  let tog: HTMLElement | null = null;
  if (walk.scenarios.length > 1) {
    tog = h('div', { class: 'ca-toggle', role: 'group', 'aria-label': walk.ask || 'Scenario' },
      walk.ask ? h('span', { class: 'ca-ask' }, walk.ask) : null);
    walk.scenarios.forEach((s, i) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(i === 0) }, s.label) as HTMLButtonElement;
      b.addEventListener('click', () => { if (sc === i) return; sc = i; toggles.forEach((t, k) => t.setAttribute('aria-pressed', String(k === i))); const was = playing; stop(); buildList(); go(0); if (was || !reduced) play(); });
      toggles.push(b); tog!.appendChild(b);
    });
  }

  function buildList(): void {
    list.textContent = '';
    cards = scen().prog.map((op) => {
      const { card } = buildCard(op, { peekWakes: name === 'PEEK' ? peekWakes : undefined });
      const li = h('li', { class: 'ca-li' }, card);
      list.appendChild(li);
      return card;
    });
    list.appendChild(doneEl);
    requestAnimationFrame(() => drawArrows(null));
  }

  function drawArrows(taken: [number, number] | null, missed: number | null = null): void {
    list.querySelectorAll(':scope > svg').forEach((n) => n.remove());
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ca-arrows'); svg.setAttribute('aria-hidden', 'true');
    svg.style.height = list.scrollHeight + 'px';
    const prog = scen().prog;
    const yOf = (el: HTMLElement) => offsetIn(el, list).y + el.offsetHeight / 2;
    let depth = 0;
    prog.forEach((op, i) => {
      if (op.op !== 'IF' && op.op !== 'JUMP') return;
      const j = prog.findIndex((o) => o.op === 'LABEL' && o.name === op.label);
      if (j < 0 || !cards[i] || !cards[j]) return;
      const y1 = yOf(cards[i]), y2 = yOf(cards[j]);
      const x = offsetIn(cards[i], list).x - 1, bulge = 12 + (depth++ % 2) * 7;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M ${x} ${y1} C ${x - bulge * 2} ${y1}, ${x - bulge * 2} ${y2}, ${x - 2} ${y2}`);
      const on = !!taken && taken[0] === i && taken[1] === j;
      if (on) path.setAttribute('class', 'taken');
      else if (missed === i) path.setAttribute('class', 'missed');
      svg.appendChild(path);
      const tri = document.createElementNS(NS, 'polygon');
      tri.setAttribute('points', `${x + 2},${y2} ${x - 7},${y2 - 5} ${x - 7},${y2 + 5}`);
      if (on) tri.setAttribute('class', 'taken');
      else if (missed === i) tri.setAttribute('class', 'missed');
      svg.appendChild(tri);
      if (on && !reduced) {
        const len = path.getTotalLength?.() ?? 200;
        path.style.strokeDasharray = `${len}`; path.style.strokeDashoffset = `${len}`;
        path.animate?.([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' });
      }
    });
    list.prepend(svg);
  }

  function renderState(st: Record<string, Cell>, prev: Record<string, Cell> | null, bad?: string): void {
    stateEl.textContent = '';
    for (const [id, v] of Object.entries(st)) {
      const [txt, cls] = CELL[v] ?? [v, ''];
      const isLight = ['BEEP', 'QUIET', 'unheard'].includes(v);
      const val = h('span', { class: `${isLight ? 'chip ' : ''}ca-val ${cls}${prev && prev[id] !== v ? ' ca-changed' : ''}${bad === id ? ' ca-bad' : ''}` }, txt);
      if (v === 'unheard') val.title = 'Nobody has listened yet: counts as QUIET';
      stateEl.appendChild(h('span', { class: 'ca-cell' }, h('b', null, id), val));
    }
  }

  function go(i: number): void {
    const steps = scen().steps;
    const prev = i === si + 1 ? steps[si].st : null;
    si = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[si];
    // visited & skipped
    const ranTo = new Set<number>();
    for (let k = 1; k <= si; k++) { const pc = steps[k].pc; if (pc != null) ranTo.add(pc); }
    const allRun = new Set(steps.map((x) => x.pc).filter((x): x is number => x != null));
    const skipped = new Set<number>();
    for (let k = 1; k <= si; k++) { const j = steps[k].jump; if (j && j[1] > j[0]) for (let m = j[0] + 1; m < j[1]; m++) if (!allRun.has(m)) skipped.add(m); }
    cards.forEach((c, k) => {
      const cur = s.pc === k;
      c.classList.toggle('current', cur);
      c.classList.toggle('ca-ran', ranTo.has(k) && !cur);
      c.classList.toggle('ca-dim', skipped.has(k) || (!!s.done && !allRun.has(k)));
      c.classList.remove('jump-yes', 'jump-no');
      if (cur) c.setAttribute('aria-current', 'step'); else c.removeAttribute('aria-current');
      c.parentElement?.querySelector('.ca-say')?.remove();
    });
    if (s.pc != null && cards[s.pc]) {
      const c = cards[s.pc];
      if (s.flash && !reduced) { void c.offsetWidth; c.classList.add(s.flash === 'yes' ? 'jump-yes' : 'jump-no'); }
      if (s.say) c.parentElement!.appendChild(h('span', { class: 'ca-say', 'aria-hidden': 'true' }, s.say));
    }
    list.querySelectorAll('.ca-check').forEach((n) => n.remove());
    if (s.checks && s.pc != null) cards[s.pc]?.querySelectorAll('.cond-row').forEach((row, k) => {
      if (s.checks![k] === undefined) return;
      row.appendChild(h('span', { class: 'ca-check ' + (s.checks![k] ? 'ok' : 'no'), 'aria-hidden': 'true' }, s.checks![k] ? '✓' : '✗'));
    });
    drawArrows(s.jump ?? null, s.flash === 'no' ? s.pc : null);
    renderState(s.st, prev, s.bad);
    doneEl.textContent = s.done ?? '';
    doneEl.classList.toggle('on', !!s.done);
    doneEl.classList.toggle('oops', !!s.done && /oops|woke/.test(s.done));
    cap.textContent = s.cap;
    counter.textContent = si === 0 ? 'ready' : `step ${si} / ${steps.length - 1}`;
    stepBtn.toggleAttribute('disabled', si >= steps.length - 1);
    if (si >= steps.length - 1) { stop(); playBtn.textContent = '↻ Replay'; }
    else if (!playing) playBtn.textContent = '▶ Play';
  }

  function stop(): void { playing = false; clearInterval(timer); timer = 0; playBtn.setAttribute('aria-pressed', 'false'); if (si < scen().steps.length - 1) playBtn.textContent = '▶ Play'; }
  function play(): void {
    if (si >= scen().steps.length - 1) go(0);
    playing = true; playBtn.textContent = '⏸ Pause'; playBtn.setAttribute('aria-pressed', 'true');
    clearInterval(timer);
    timer = window.setInterval(() => go(si + 1), 1700);
  }
  playBtn.addEventListener('click', () => (playing ? stop() : play()));
  stepBtn.addEventListener('click', () => { stop(); go(si + 1); });
  backBtn.addEventListener('click', () => { stop(); go(0); });

  buildList();
  go(0);
  const el = h('div', { class: 'ca-walk' },
    tog,
    stateEl,
    list,
    cap,
    h('div', { class: 'ca-ctrl' }, backBtn, playBtn, stepBtn, counter));
  const auto = reduced ? 0 : window.setTimeout(() => { if (el.isConnected && !playing && si === 0) play(); }, 900);
  return {
    el,
    layout: () => { const st = scen().steps[si]; drawArrows(st.jump ?? null, st.flash === 'no' ? st.pc : null); },
    destroy: () => { stop(); clearTimeout(auto); },
  };
}

// ───────────────────────── public API ─────────────────────────

export function cardAnatomy(op: OpName, level?: LevelDef): { el: HTMLElement; destroy(): void } {
  const reduced = (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('reduced');
  const ana = buildAnatomy(op, level);
  const walk = buildWalk(op, level, reduced);
  const el = h('div', { class: 'ca' + (reduced ? ' ca-reduced' : '') },
    h('h4', { class: 'ca-h' }, 'What is on the card'),
    ana.el,
    h('h4', { class: 'ca-h' }, 'How it works'),
    walk.el);
  let raf = 0;
  const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { ana.layout(); walk.layout(); }); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
  ro?.observe(el);
  const t1 = window.setTimeout(relayout, 60), t2 = window.setTimeout(relayout, 400);
  document.fonts?.ready.then(relayout).catch(() => {});
  return {
    el,
    destroy() { ro?.disconnect(); clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(raf); walk.destroy(); },
  };
}
