// くま(マスコット)の SVG。絵本・水彩の画風: セピアの手描き線 + 線から少しにじむ水彩の塗り。
// 顔は「ちょっと抜けた」点目と小さな「ω」の口。耳にしおりのリボン。
//
//   peek  … 開いた本のページの間から顔を出す(普段・顔を出すだけの出来事)
//   talk  … 手を挙げて話す(うんちく)
//   cheer … バンザイ(正解・読了)
//
// フィルタの id は呼ぶたびに変える(同じ Shadow DOM に複数のくまが居ても衝突しない)。

const LINE = '#4a2f24';
let serial = 0;

export function bearSVG(pose = 'peek', { flag = false, sweat = false } = {}) {
  serial += 1;
  const id = `bear${serial}`;
  const bleed = `url(#${id}b)`;
  const wobble = `url(#${id}w)`;
  // 部品ごとに「にじんだ塗り → 揺れた線」の順で、奥から手前へ重ねる
  const part = (fill, line, width = 4.2) =>
    `<g filter="${bleed}">${fill}</g><g filter="${wobble}" fill="none" stroke="${LINE}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${line}</g>`;

  const defs = `<defs>
    <filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="4" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="7" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="${id}w" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <radialGradient id="${id}f" cx="42%" cy="35%" r="70%"><stop offset="0" stop-color="#f7b96b"/><stop offset=".7" stop-color="#e8964a"/><stop offset="1" stop-color="#d77f37"/></radialGradient>
    <radialGradient id="${id}c" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#fff3dc"/><stop offset="1" stop-color="#fbe2bd"/></radialGradient>
  </defs>`;
  const fur = `url(#${id}f)`;
  const cream = `url(#${id}c)`;

  const ribbonTail = `<g filter="${wobble}" stroke="${LINE}" stroke-width="3.5" stroke-linejoin="round"><path d="M46 56 C40 74 40 90 44 106 L38 100 L34 108 C30 90 34 70 42 54" fill="#f26b8a"/></g>`;
  const ribbonBow = `<g transform="rotate(-22 52 46)" filter="${wobble}" stroke="${LINE}" stroke-width="3.5" stroke-linejoin="round"><path d="M50 44 L36 30 L40 56 Z" fill="#f26b8a"/><path d="M54 44 L70 28 L66 54 Z" fill="#f26b8a"/><circle cx="52" cy="46" r="6" fill="#ff9fb4"/></g>`;
  const ears = part(
    '<circle cx="70" cy="62" r="28" fill="#e8964a"/><circle cx="170" cy="62" r="28" fill="#e8964a"/><circle cx="70" cy="64" r="14" fill="#f7a8a0"/><circle cx="170" cy="64" r="14" fill="#f7a8a0"/>',
    '<circle cx="70" cy="62" r="28"/><circle cx="170" cy="62" r="28"/>',
  );
  const head = part(`<ellipse cx="120" cy="122" rx="80" ry="70" fill="${fur}"/>`, '<ellipse cx="120" cy="122" rx="80" ry="70"/>');
  const muzzle = part(
    `<ellipse cx="120" cy="154" rx="33" ry="25" fill="${cream}"/><ellipse cx="80" cy="140" rx="15" ry="9.5" fill="#f26b8a" opacity=".5"/><ellipse cx="160" cy="140" rx="15" ry="9.5" fill="#f26b8a" opacity=".5"/>`,
    '<ellipse cx="120" cy="154" rx="33" ry="25"/>',
  );
  // 目は大きく丸く、光を2つ(王道の可愛さ)。口は小さな「ω」
  const eye = (x) => `
    <ellipse cx="${x}" cy="116" rx="9" ry="10.5" fill="${LINE}"/>
    <circle cx="${x - 2.8}" cy="111.8" r="3.6" fill="#fff"/><circle cx="${x + 3}" cy="120" r="1.6" fill="#fff" opacity=".9"/>`;
  const face = `${eye(91)}${eye(149)}
    <ellipse cx="120" cy="142" rx="10" ry="7" fill="${LINE}"/><ellipse cx="116.5" cy="139.8" rx="3" ry="1.7" fill="#fff" opacity=".7"/>
    <path d="M111 156 q4.5 5.5 9 0 q4.5 5.5 9 0" fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${sweat ? `<path d="M178 92 q7 9 0 16 q-7 -7 0 -16 z" fill="#8fd3ff" stroke="${LINE}" stroke-width="2.5"/>` : ''}`;
  const bust = ribbonTail + ears + head + ribbonBow + muzzle + face;
  const arm = (d) =>
    `<g filter="${wobble}" fill="none" stroke-linecap="round"><path d="${d}" stroke="${LINE}" stroke-width="29"/><path d="${d}" stroke="#e8964a" stroke-width="21"/></g>`;

  let body = '';
  let viewBox = '-10 -6 260 270';
  if (pose === 'peek') {
    body =
      bust +
      `<g filter="${bleed}"><path d="M6 196 C50 178 92 180 120 198 C148 180 190 178 234 196 L234 252 C190 236 148 238 120 256 C92 238 50 236 6 252 Z" fill="#4fa3e3"/></g>
      <g filter="${wobble}" stroke="${LINE}" stroke-width="4" stroke-linejoin="round">
        <path d="M6 196 C50 178 92 180 120 198 C148 180 190 178 234 196 L234 252 C190 236 148 238 120 256 C92 238 50 236 6 252 Z" fill="none"/>
        <path d="M16 192 C54 176 94 178 120 194 C146 178 186 176 224 192 L224 244 C186 230 146 232 120 248 C94 232 54 230 16 244 Z" fill="#fffdf6"/>
        <path d="M120 194 L120 248" fill="none"/>
        <path d="M34 206 Q60 198 96 206 M34 220 Q60 212 96 220 M144 206 Q178 198 206 206 M144 220 Q178 212 206 220" fill="none" stroke="#c9b9a6" stroke-width="2.5"/>
        <ellipse cx="74" cy="192" rx="18" ry="12" fill="#e8964a"/>
        <ellipse cx="166" cy="192" rx="18" ry="12" fill="#e8964a"/>
      </g>`;
  } else if (pose === 'talk') {
    viewBox = '-10 -6 270 280';
    body =
      arm('M170 200 C186 188 196 176 200 164') +
      part(`<ellipse cx="120" cy="214" rx="62" ry="46" fill="${fur}"/><ellipse cx="120" cy="222" rx="34" ry="28" fill="${cream}"/>`, '<ellipse cx="120" cy="214" rx="62" ry="46"/>') +
      bust +
      part('<ellipse cx="202" cy="158" rx="17" ry="21" fill="#e8964a"/>', '<ellipse cx="202" cy="158" rx="17" ry="21"/>') +
      `<g stroke="#ffb000" stroke-width="5" stroke-linecap="round"><path d="M226 126 l10 -10 M232 146 l14 -2 M226 104 l2 -14"/></g>`;
  } else {
    viewBox = '-24 -34 300 304';
    body =
      arm('M80 198 C58 174 36 142 22 116') +
      arm('M160 198 C182 174 204 142 218 116') +
      part(`<ellipse cx="120" cy="214" rx="62" ry="46" fill="${fur}"/><ellipse cx="120" cy="222" rx="34" ry="28" fill="${cream}"/>`, '<ellipse cx="120" cy="214" rx="62" ry="46"/>') +
      part(
        '<ellipse cx="18" cy="104" rx="17" ry="21" fill="#e8964a"/><ellipse cx="222" cy="104" rx="17" ry="21" fill="#e8964a"/>',
        '<ellipse cx="18" cy="104" rx="17" ry="21"/><ellipse cx="222" cy="104" rx="17" ry="21"/>',
      ) +
      bust +
      (flag
        ? `<g filter="${wobble}" stroke="${LINE}" stroke-width="3.5" stroke-linejoin="round"><path d="M226 92 L238 -6" fill="none"/><path d="M238 -6 L276 8 L234 24 Z" fill="#f26b8a"/></g>`
        : `<g stroke="#ffb000" stroke-width="5" stroke-linecap="round"><path d="M-6 74 l-12 -8 M246 74 l12 -8 M120 -8 l0 -14 M66 2 l-6 -12 M174 2 l6 -12"/></g>`);
  }
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${body}</svg>`;
}
