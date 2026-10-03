// Dialogue portraits as SVG data URLs (120×120, round paper badge with ink rim).
import type { Speaker, DialogueLine } from '../core/contracts';

type Mood = NonNullable<DialogueLine['mood']>;
const INK = '#0e0e0e';
const sw = (w = 3.5, c = INK) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const SW = sw();

function badge(bg: string, inner: string, rim = INK) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
<defs><clipPath id="c"><circle cx="60" cy="60" r="56"/></clipPath></defs>
<circle cx="60" cy="60" r="56" fill="${bg}"/>
<g clip-path="url(#c)">${inner}</g>
<circle cx="60" cy="60" r="56" fill="none" stroke="${rim}" stroke-width="4"/></svg>`;
}

function catEyes(m: Mood) {
  if (m === 'happy') return `<path d="M36 62 q8 -9 16 0 M68 62 q8 -9 16 0" fill="none" ${SW}/>`;
  if (m === 'sleepy') return `<path d="M36 60 h16 M68 60 h16" fill="none" ${SW}/><text x="92" y="34" font-family="Quicksand,sans-serif" font-weight="700" font-size="16" fill="${INK}">z</text><text x="100" y="22" font-family="Quicksand,sans-serif" font-weight="700" font-size="12" fill="${INK}">z</text>`;
  if (m === 'shock') return `<ellipse cx="44" cy="58" rx="10" ry="12" fill="#e8f27a" ${SW}/><ellipse cx="76" cy="58" rx="10" ry="12" fill="#e8f27a" ${SW}/><circle cx="44" cy="58" r="3" fill="${INK}"/><circle cx="76" cy="58" r="3" fill="${INK}"/>`;
  const lidL = m === 'smug' ? 52 : 57, lidR = m === 'smug' ? 55 : 57;
  return `<ellipse cx="44" cy="60" rx="10" ry="9" fill="#e8f27a" ${SW}/><ellipse cx="76" cy="60" rx="10" ry="9" fill="#e8f27a" ${SW}/>
<ellipse cx="45" cy="62" rx="2.6" ry="6" fill="${INK}"/><ellipse cx="75" cy="62" rx="2.6" ry="6" fill="${INK}"/>
<path d="M33 ${lidL} Q44 46 55 ${lidL} L55 49 L33 49Z" fill="#6b6f86"/><path d="M65 ${lidR} Q76 46 87 ${lidR} L87 49 L65 49Z" fill="#6b6f86"/>
<path d="M33 ${lidL} L55 ${lidL} M65 ${lidR} L87 ${lidR - (m === 'smug' ? 3 : 0)}" ${SW} fill="none"/>`;
}
function catMouth(m: Mood) {
  if (m === 'shock') return `<ellipse cx="60" cy="86" rx="5" ry="6.5" fill="${INK}"/>`;
  if (m === 'happy' || m === 'smug') return `<path d="M50 82 q5 6 10 0 q5 6 10 0${m === 'smug' ? ' l4 -4' : ''}" fill="none" ${SW}/>`;
  return `<path d="M54 84 h12" fill="none" ${SW}/>`;
}
function schrodi(m: Mood) {
  const bg = m === 'shock' ? '#ffe1dc' : '#e9e3f7';
  return badge(bg, `
<path d="M10 120 L10 96 L110 96 L110 120Z" fill="#d9a865" ${SW}/>
<path d="M28 34 L36 8 L52 28Z M92 34 L84 8 L68 28Z" fill="#6b6f86" ${SW}/>
<path d="M34 30 L37 16 L46 28Z M86 30 L83 16 L74 28Z" fill="#f2a7b8"/>
<ellipse cx="60" cy="64" rx="38" ry="34" fill="#6b6f86" ${SW}/>
<path d="M52 32 l1 10 M60 31 v11 M68 32 l-1 10" ${sw(3, '#4c4f63')}/>
<ellipse cx="60" cy="80" rx="17" ry="12" fill="#e9e6f2"/>
${catEyes(m)}
<path d="M56 75 h8 l-4 4z" fill="#f08aa3"/>
${catMouth(m)}
<path d="M40 80 L14 76 M40 84 L14 88 M80 80 L106 76 M80 84 L106 88" stroke="#0e0e0e" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round"/>
<path d="M2 98 L118 98 L118 120 L2 120Z" fill="#ebc48b" ${SW}/>
<rect x="54" y="98" width="12" height="12" fill="#fff0c8" opacity="0.8"/>`);
}

function flipper(m: Mood) {
  const mouth = m === 'shock'
    ? `<ellipse cx="62" cy="84" rx="7" ry="8" fill="${INK}"/>`
    : `<path d="M44 78 Q62 98 82 74 Q62 86 44 78Z" fill="${INK}" ${SW}/><path d="M68 81 l3 6 l3 -7z" fill="#fff"/>${m === 'happy' || m === 'smug' ? `<ellipse cx="60" cy="88" rx="6" ry="4" fill="#ff9ab0" ${sw(2)}/>` : ''}`;
  return badge('#ffe6e3', `
<path d="M38 36 Q30 14 22 10 Q30 30 30 44Z M82 36 Q90 14 98 10 Q90 30 90 44Z" fill="#fff3d6" ${SW}/>
<circle cx="60" cy="66" r="40" fill="#fe443d" ${SW}/>
<ellipse cx="44" cy="44" rx="8" ry="5" fill="#fff" opacity="0.6" transform="rotate(-30 44 44)"/>
<rect x="34" y="54" width="22" height="16" rx="7" fill="${INK}"/><rect x="64" y="54" width="22" height="16" rx="7" fill="${INK}"/><rect x="54" y="58" width="12" height="4" fill="${INK}"/>
<rect x="38" y="57" width="6" height="3" fill="#fff" opacity="0.8"/><rect x="68" y="57" width="6" height="3" fill="#fff" opacity="0.8"/>
${mouth}`);
}

function phasey(m: Mood) {
  const eyes = m === 'shock'
    ? `<ellipse cx="46" cy="56" rx="7" ry="9" fill="#fff" ${SW}/><ellipse cx="74" cy="56" rx="7" ry="9" fill="#fff" ${SW}/><circle cx="47" cy="57" r="2.5" fill="${INK}"/><circle cx="75" cy="57" r="2.5" fill="${INK}"/>`
    : `<path d="M38 54 a8 9 0 0 0 16 0Z M66 54 a8 9 0 0 0 16 0Z" fill="${INK}"/>`;
  const mouth = m === 'shock' ? `<ellipse cx="60" cy="78" rx="5" ry="6" fill="${INK}"/>` : `<path d="M50 72 Q60 84 72 70" fill="none" ${SW}/>`;
  return badge('#efe0ff', `
<circle cx="60" cy="60" r="50" fill="#b04dff" opacity="0.18"/>
<path d="M22 60 A38 38 0 0 1 98 60 L98 104 Q88 116 79 104 Q70 92 60 104 Q50 116 41 104 Q32 92 22 104Z" fill="#c27bff" fill-opacity="0.85" ${SW}/>
<ellipse cx="42" cy="38" rx="8" ry="5" fill="#fff" opacity="0.7" transform="rotate(-30 42 38)"/>
${eyes}${mouth}
<ellipse cx="34" cy="68" rx="6" ry="3.5" fill="#ff78c8" opacity="0.5"/><ellipse cx="86" cy="68" rx="6" ry="3.5" fill="#ff78c8" opacity="0.5"/>`);
}

function wobbles(m: Mood) {
  const mouth = m === 'shock' ? `<ellipse cx="60" cy="84" rx="6" ry="7" fill="${INK}"/>` : `<path d="M44 84 q4 -5 8 0 q4 5 8 0 q4 -5 8 0 q4 5 8 0" fill="none" ${SW}/>`;
  return badge('#eefbe0', `
<path d="M30 30 L44 18 L102 18 L88 30Z" fill="#d8f7a8" ${SW}/>
<path d="M88 30 L102 18 L102 92 L88 104Z" fill="#6fb52c" ${SW}/>
<rect x="18" y="30" width="72" height="76" rx="12" fill="#a5e05b" fill-opacity="0.95" ${SW}/>
<rect x="26" y="38" width="8" height="22" rx="4" fill="#fff" opacity="0.75"/>
<circle cx="42" cy="60" r="10" fill="#fff" ${SW}/><circle cx="68" cy="60" r="10" fill="#fff" ${SW}/>
<circle cx="45" cy="63" r="4" fill="${INK}"/><circle cx="65" cy="57" r="4" fill="${INK}"/>
${mouth}
<circle cx="74" cy="94" r="3" fill="#fff" opacity="0.6"/><circle cx="34" cy="98" r="2" fill="#fff" opacity="0.6"/>`);
}

function qubble(m: Mood) {
  const sunny = m !== 'sleepy';
  const face =
    m === 'happy' ? `<path d="M40 70 q7 -8 14 0 M66 70 q7 -8 14 0" fill="none" ${SW}/><path d="M50 80 Q60 96 70 80Z" fill="${INK}"/>`
    : m === 'shock' ? `<ellipse cx="47" cy="68" rx="7" ry="8" fill="#fff" ${SW}/><ellipse cx="73" cy="68" rx="7" ry="8" fill="#fff" ${SW}/><circle cx="47" cy="69" r="2.5" fill="${INK}"/><circle cx="73" cy="69" r="2.5" fill="${INK}"/><path d="M52 88 l4 -3 l4 3 l4 -3 l4 3" fill="none" ${SW}/>`
    : m === 'smug' ? `<path d="M40 70 h14 M66 70 h14" ${SW}/><path d="M42 64 l12 3 M78 64 l-12 3" ${SW}/><path d="M52 86 q4 -4 8 -2 q4 -4 8 2" fill="none" ${SW}/>`
    : `<path d="M40 68 q7 8 14 0 M66 68 q7 8 14 0" fill="none" ${SW}/><ellipse cx="60" cy="84" rx="3" ry="3.6" fill="${INK}"/><text x="88" y="36" font-family="Quicksand,sans-serif" font-weight="700" font-size="16" fill="${INK}">z</text>`;
  return badge(sunny ? '#fff1d1' : '#e6e4ff', `
<defs><linearGradient id="q" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb72b"/><stop offset="0.5" stop-color="#ffb72b"/><stop offset="0.5" stop-color="#6c63ff"/><stop offset="1" stop-color="#6c63ff"/></linearGradient></defs>
<path d="M18 118 C14 80 20 46 40 34 C52 26 68 26 80 34 C100 46 106 80 102 118Z" fill="${m === 'deadpan' ? 'url(#q)' : sunny ? '#ffb72b' : '#6c63ff'}" ${SW}/>
<ellipse cx="42" cy="44" rx="8" ry="5" fill="#fff" opacity="0.8" transform="rotate(-35 42 44)"/>
<ellipse cx="34" cy="80" rx="7" ry="4" fill="#ff6e82" opacity="0.55"/><ellipse cx="86" cy="80" rx="7" ry="4" fill="#ff6e82" opacity="0.55"/>
${face}`);
}

function eye(m: Mood) {
  const pupil = m === 'sleepy' ? '' : `<circle cx="60" cy="60" r="${m === 'shock' ? 8 : 14}" fill="${INK}"/><circle cx="55" cy="55" r="4" fill="#fff"/>`;
  const lid = m === 'sleepy' ? `<path d="M14 60 Q60 96 106 60" fill="none" ${sw(4, '#f2f0eb')}/><path d="M30 74 l-6 8 M60 80 v10 M90 74 l6 8" fill="none" ${sw(3, '#f2f0eb')}/>` :
    `<path d="M14 60 Q60 14 106 60 Q60 106 14 60Z" fill="#fff" ${sw(4)}/><circle cx="60" cy="60" r="24" fill="#fe443d" ${SW}/>${pupil}`;
  return badge('#1a1a2e', `
<g opacity="0.6" fill="#fff"><circle cx="20" cy="24" r="1.5"/><circle cx="96" cy="20" r="1"/><circle cx="100" cy="96" r="1.5"/><circle cx="22" cy="92" r="1"/></g>
${lid}
<path d="M30 30 l-6 -8 M60 22 v-10 M90 30 l6 -8" ${sw(3.5, '#f2f0eb')}/>`, INK);
}

function system() {
  return badge('#f2f0eb', `
<rect x="26" y="34" width="68" height="52" rx="10" fill="#fff" ${SW}/>
<rect x="34" y="42" width="52" height="30" rx="5" fill="#22263f"/>
<path d="M40 52 h20 M40 60 h30" stroke="#9ff3ff" stroke-width="3.5" stroke-linecap="round"/>
<circle cx="74" cy="52" r="3" fill="#3ddc97"/>
<path d="M50 86 l-4 10 h28 l-4 -10" fill="#d9d5cc" ${SW}/>
<circle cx="60" cy="18" r="5" fill="#fe443d" ${SW}/><path d="M60 23 v11" ${SW}/>`);
}

const cache = new Map<string, string>();
/** Classical (Ch0) data box portrait: 7 Billion Humans-style crate with its value. value null = closed lid with "?". */
function dataBox(value: 0 | 1 | null) {
  const panel = value === 1 ? '#6c63ff' : value === 0 ? '#ffb72b' : '#ebc48b';
  const digit = value === null ? '?' : String(value);
  const dcol = value === 1 ? '#fff' : INK;
  return badge(value === 1 ? '#e6e4ff' : '#fff1d1', `
<ellipse cx="60" cy="104" rx="40" ry="10" fill="#0e0e1e" opacity="0.18"/>
<path d="M20 50 L60 30 L100 50 L100 88 L60 108 L20 88Z" fill="#deb070" ${SW}/>
<path d="M60 70 L100 50 L100 88 L60 108Z" fill="#b2803f" ${SW}/>
<path d="M20 50 L60 30 L100 50 L60 70Z" fill="${panel}" ${SW}/>
<path d="M60 74 v30 M26 60 v20 M94 60 v20" stroke="#8a5a2b" stroke-width="1.5" opacity="0.4"/>
<path d="M36 82 v-10 m-3 3 l3 -3 l3 3 M46 87 v-10 m-3 3 l3 -3 l3 3" fill="none" stroke="${INK}" stroke-width="2" opacity="0.45" stroke-linecap="round"/>
<g transform="matrix(1 0.5 -1 0.5 60 50)"><text x="0" y="9" text-anchor="middle" font-family="Quantum,Quicksand,sans-serif" font-weight="700" font-size="30" fill="${dcol}" ${value === 1 ? `stroke="${INK}" stroke-width="2" paint-order="stroke"` : ''}>${digit}</text></g>
<ellipse cx="44" cy="46" rx="6" ry="2.5" fill="#fff" opacity="0.6" transform="rotate(25 44 46)"/>`);
}
/** Extra (outside the contract): portrait of a classical data box. */
export function dataBoxPortrait(value: 0 | 1 | null = null): string {
  const key = 'databox:' + value;
  let url = cache.get(key);
  if (!url) { url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(dataBox(value)); cache.set(key, url); }
  return url;
}

export function portrait(who: Speaker, mood?: DialogueLine['mood']): string {
  const m: Mood = mood ?? (who === 'qubble' ? 'sleepy' : who === 'flipper' || who === 'phasey' || who === 'wobbles' ? 'smug' : 'deadpan');
  const key = who + ':' + m;
  let url = cache.get(key);
  if (url) return url;
  let svg: string;
  switch (who) {
    case 'schrodi': svg = schrodi(m); break;
    case 'flipper': svg = flipper(m); break;
    case 'phasey': svg = phasey(m); break;
    case 'wobbles': svg = wobbles(m); break;
    case 'qubble': svg = qubble(m); break;
    case 'eye': svg = eye(m); break;
    default: svg = system();
  }
  url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  cache.set(key, url);
  return url;
}
