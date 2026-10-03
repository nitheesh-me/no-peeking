/**
 * Tiny math typesetting helper (no TeX). Two flavours of every function:
 *   html: spans styled by tokens.css (.afi-m …) for DOM;   plain: Unicode-only text for SVG <text>/canvas/aria.
 */
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎' };
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', 'n': 'ⁿ', 'i': 'ⁱ' };
const SUB_REV: Record<string, string> = Object.fromEntries(Object.entries(SUB).map(([k, v]) => [v, k]));

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const toSub = (s: string) => s.split('').map((c) => SUB[c] ?? c).join('');
export const toSup = (s: string) => s.split('').map((c) => SUP[c] ?? c).join('');
export const fromSub = (s: string) => s.split('').map((c) => SUB_REV[c] ?? c).join('');

/** Number with a true minus sign and fixed digits: −0.71 */
export function num(x: number, d = 2, signed = false): string {
  const v = Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x;
  const s = Math.abs(v).toFixed(d);
  return (v < 0 ? '−' : signed ? '+' : '') + s;
}

/** Qubit id → typeset name: 'q1' → q₁, 'a' → a */
export function qubitName(id: string): string {
  const m = /^q(\d+)$/.exec(id);
  return m ? 'q' + toSub(m[1]) : id;
}

/** |bits⟩ */
export function ket(bits: string, html = true): string {
  return html ? `<span class="afi-m"><span class="kb">|</span><span class="k">${esc(bits)}</span><span class="kb">⟩</span></span>` : `|${bits}⟩`;
}
export function bra(bits: string, html = true): string {
  return html ? `<span class="afi-m"><span class="kb">⟨</span><span class="k">${esc(bits)}</span><span class="kb">|</span></span>` : `⟨${bits}|`;
}
/** ⟨op⟩ expectation value, op already typeset (e.g. 'Z₁Z₂') */
export function expect(op: string, html = true): string {
  return html ? `<span class="afi-m"><span class="kb">⟨</span><span class="op">${esc(op)}</span><span class="kb">⟩</span></span>` : `⟨${op}⟩`;
}
export const tensor = (...parts: string[]) => parts.join(' ⊗ ');

/** Pauli string in data-qubit order → label: 'ZZI' → 'Z₁Z₂'; 'IXX' → 'X₂X₃' (offset = first index) */
export function pauliLabel(p: string, offset = 1): string {
  let out = '';
  for (let i = 0; i < p.length; i++) if (p[i] !== 'I' && p[i] !== '_') out += p[i] + toSub(String(i + offset));
  return out || 'I';
}
/** Inverse: 'Z₁Z₂' (or 'Z1Z2') → [{ p: 'Z', q: 1 }, { p: 'Z', q: 2 }] */
export function parsePauliLabel(label: string): { p: 'X' | 'Y' | 'Z'; q: number }[] {
  const s = fromSub(label);
  const out: { p: 'X' | 'Y' | 'Z'; q: number }[] = [];
  const re = /([XYZ])(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push({ p: m[1] as 'X' | 'Y' | 'Z', q: +m[2] });
  return out;
}

/** Complex amplitude in polar form: 0.707·e^{i·0.79}. Real ±r prints plainly. */
export function amp(re: number, im: number, html = true, d = 3): string {
  const r = Math.hypot(re, im), phi = Math.atan2(im, re);
  if (Math.abs(phi) < 1e-3) return num(r, d);
  if (Math.abs(Math.abs(phi) - Math.PI) < 1e-3) return num(-r, d);
  const ph = num(phi, 2);
  return html ? `${num(r, d)}·<i>e</i><sup><i>i</i>·${ph}</sup>` : `${num(r, d)}·e^{i·${ph}}`;
}
/** amplitude · |ket⟩ */
export function term(re: number, im: number, bits: string, html = true): string {
  return html ? `<span class="afi-m"><span class="ph">${amp(re, im, true)}</span></span>${ket(bits)}` : amp(re, im, false) + ket(bits, false);
}
/** bits in a human scale: 612 kB */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} kB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
