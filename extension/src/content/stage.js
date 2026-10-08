// 絵本・水彩の「舞台」(Play ブックス): くまが顔を出す・うんちく・突然クイズ・読了フィナーレ・めくった瞬間の花びら。
//
// 出すかどうか・何を出すかは main.js が決め、ここは見た目と操作だけを持つ。
// 独立した Shadow DOM に描き、ページの DOM は改変しない。
//
//   画面の下の隅(corner)… くまが顔を出す / うんちく。読書を止めない(本文は触れたまま)
//   画面全体(modal)     … 突然クイズ / 読了フィナーレ。開いている間は下のページをめくらない
//   めくった瞬間(shower) … 花びら・ことば吹雪が上から数秒降る。操作は素通し
//
// 派手さは intensity(0〜1、θに比例)で決まる。高い=祭り、低い=静か — タペリングを壊さない。
// 責めない: クイズは間違えても「おしい!」で答え直せる。減点・残り時間・連続記録・得点は持たない。
// 正解・読了の言葉(「大当たり!!」等)は words=false で消せる。

const CSS = `
.wrap {
  position: fixed; inset: 0; --ink: #4a2f24; --paper: #fffdf6; --i: 1;
  font-family: "Hiragino Maru Gothic ProN", "Zen Maru Gothic", "M PLUS Rounded 1c", "Hiragino Sans", sans-serif;
  color: var(--ink);
}
.modal { animation: fade-in .25s ease-out both; }
.modal.out, .corner.out { animation: fade-out .25s ease-in both; }
@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes fade-out { to { opacity: 0 } }

.veil {
  position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 45%, rgba(255, 250, 238, .93), rgba(255, 230, 196, .96));
  opacity: calc(.82 + .18 * var(--i));
}
.rays {
  /* 中心から画面の隅までを覆う最小の大きさ(152vmax)。縁はぼかし(filter)ではなく色の移り変わりで
     柔らかくする — 画面より大きい面にぼかしを掛けて回し続けると重い */
  position: absolute; left: 50%; top: 46%; width: 152vmax; height: 152vmax; margin: -76vmax 0 0 -76vmax;
  background: conic-gradient(from 0deg, transparent 0deg,
    rgba(255, 210, 63, .32) 6deg 26deg, transparent 32deg 60deg,
    rgba(242, 107, 138, .26) 66deg 86deg, transparent 92deg 120deg,
    rgba(76, 201, 163, .26) 126deg 146deg, transparent 152deg 180deg,
    rgba(79, 163, 227, .26) 186deg 206deg, transparent 212deg 240deg,
    rgba(167, 139, 250, .26) 246deg 266deg, transparent 272deg 300deg,
    rgba(255, 179, 71, .3) 306deg 326deg, transparent 332deg 360deg);
  /* 答えを待つ間は2周(1分)で止まる。正解・読了の間だけ速く回す */
  animation: spin 30s linear 2; opacity: calc(.35 + .65 * var(--i));
}
.win .rays { animation: spin 8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg) } }
canvas.paint { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

/* 本の帯のラベル(小) */
.label {
  position: absolute; left: 50%; top: -21px; transform: translateX(-50%) rotate(-3deg);
  background: #fff8ea; border: 3px solid var(--ink); border-radius: 4px; padding: 7px 20px 6px;
  font-weight: 900; font-size: 17px; white-space: nowrap;
  background-image: linear-gradient(90deg, #f26b8a, #ffd23f, #4cc9a3, #4fa3e3), linear-gradient(90deg, #f26b8a, #ffd23f, #4cc9a3, #4fa3e3);
  background-size: 100% 5px; background-repeat: no-repeat; background-position: top, bottom;
  animation: bob 1.4s ease-in-out infinite;
}
@keyframes bob { 50% { transform: translateX(-50%) rotate(3deg) translateY(-2px) } }

.card {
  position: absolute; left: 50%; top: 46%; width: min(92vw, 500px); box-sizing: border-box;
  transform: translate(-50%, -50%);
  background: var(--paper); border: 4px solid var(--ink); border-radius: 26px 20px 28px 22px / 22px 28px 20px 26px;
  box-shadow: 7px 9px 0 rgba(242, 107, 138, .38);
  padding: 38px 16px 18px;
  animation: pop .6s cubic-bezier(.2, 1.5, .4, 1) both;
}
@keyframes pop {
  0% { transform: translate(-50%, -40%) scale(.3) rotate(-8deg); opacity: 0 }
  60% { transform: translate(-50%, -50%) scale(1.06) rotate(1.5deg); opacity: 1 }
  100% { transform: translate(-50%, -50%) scale(1) rotate(0) }
}
.win .card { animation: hop .6s cubic-bezier(.3, 1.8, .5, 1); }
@keyframes hop {
  0% { transform: translate(-50%, -50%) }
  40% { transform: translate(-50%, -56%) rotate(-1.5deg) }
  100% { transform: translate(-50%, -50%) }
}
.close {
  position: absolute; right: 10px; top: 10px; width: 32px; height: 32px; border-radius: 50%;
  border: 3px solid var(--ink); background: var(--paper); color: var(--ink);
  font-family: inherit; font-weight: 900; font-size: 17px; line-height: 1; cursor: pointer; padding: 0;
}
.q { margin: 2px 4px 14px; font-size: clamp(16px, 4.2vw, 20px); line-height: 1.6; font-weight: 800; }
.choices { display: grid; gap: 10px; }
.choice {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border: 3px solid var(--ink); border-radius: 18px 14px 18px 16px;
  box-shadow: 4px 5px 0 rgba(74, 47, 36, .16);
  font-size: clamp(15px, 3.8vw, 18px); font-weight: 800; color: var(--ink); cursor: pointer;
  transition: transform .12s, opacity .3s;
  animation: slide .45s cubic-bezier(.2, 1.4, .4, 1) both;
}
.choice:nth-child(1) { background: #ffd6de; animation-delay: .12s; }
.choice:nth-child(2) { background: #ffe7a8; animation-delay: .2s; }
.choice:nth-child(3) { background: #cfe8ff; animation-delay: .28s; }
.choice:hover { transform: translateY(-2px) rotate(-.4deg); }
.choice:focus-visible { outline: 3px dashed var(--ink); outline-offset: 3px; }
@keyframes slide { from { transform: translateX(-26px) scale(.92); opacity: 0 } to { transform: none; opacity: 1 } }
.mark {
  flex: none; width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--ink); background: var(--paper);
  display: grid; place-items: center; font-weight: 900; font-size: 14px;
}
.choice.wrong { background: #ece6dd; color: #a4968a; cursor: default; animation: shake .4s; }
@keyframes shake { 20% { transform: translateX(-8px) } 40% { transform: translateX(8px) } 60% { transform: translateX(-5px) } 80% { transform: translateX(5px) } }
.choice.right {
  background: linear-gradient(100deg, #ffd6de, #ffe7a8, #c9f0e0, #cfe8ff, #e3d8ff, #ffd6de); background-size: 300% 100%;
  animation: wash 1.6s linear infinite;
}
@keyframes wash { to { background-position: 300% 0 } }
.win .choice:not(.right) { opacity: .35; }
.oops {
  position: absolute; font-weight: 900; font-size: 24px; color: #f26b8a; pointer-events: none;
  -webkit-text-stroke: 5px var(--paper); paint-order: stroke fill;
  animation: oops .9s ease-out both;
}
@keyframes oops { 0% { transform: translate(-50%, 0) scale(.6); opacity: 0 } 20% { transform: translate(-50%, -14px) scale(1.1); opacity: 1 } 100% { transform: translate(-50%, -40px); opacity: 0 } }

/* 本の帯(大): 正解・読了の言葉 */
.obi {
  position: absolute; left: -14%; right: -14%; top: 50%; height: clamp(86px, 21vh, 132px);
  transform: translateY(-50%) rotate(-7deg) translateX(-135%);
  background: #fff8ea; border-top: 4px solid var(--ink); border-bottom: 4px solid var(--ink);
  display: grid; place-items: center; pointer-events: none;
}
.obi::before, .obi::after {
  content: ""; position: absolute; left: 0; right: 0; height: 14px;
  background: linear-gradient(90deg, #f26b8a, #ffb347, #ffd23f, #4cc9a3, #4fa3e3, #a78bfa, #f26b8a);
}
.obi::before { top: 9px; }
.obi::after { bottom: 9px; }
.obi.show { animation: obi 2.7s cubic-bezier(.2, .9, .2, 1) both; }
.finale .obi.show { animation: obi-stay 4.6s cubic-bezier(.2, .9, .2, 1) both; }
@keyframes obi {
  0% { transform: translateY(-50%) rotate(-7deg) translateX(-135%) }
  16% { transform: translateY(-50%) rotate(-7deg) translateX(0) }
  82% { transform: translateY(-50%) rotate(-7deg) translateX(0) }
  100% { transform: translateY(-50%) rotate(-7deg) translateX(135%) }
}
@keyframes obi-stay {
  0% { transform: translateY(-50%) rotate(-5deg) translateX(-135%) }
  12% { transform: translateY(-50%) rotate(-5deg) translateX(0) }
  100% { transform: translateY(-50%) rotate(-5deg) translateX(0) }
}
.word {
  position: relative; font-size: clamp(38px, 11vw, 72px); font-weight: 900; letter-spacing: .04em; color: #ffd23f;
  -webkit-text-stroke: 7px var(--ink); paint-order: stroke fill; text-shadow: 0 5px 0 var(--ink);
  animation: word .5s .3s cubic-bezier(.2, 1.8, .4, 1) both;
}
@keyframes word { from { transform: scale(2.2); opacity: 0 } to { transform: scale(1); opacity: 1 } }

/* くま */
.bear { position: absolute; pointer-events: none; }
.bear svg { display: block; width: 100%; height: auto; overflow: visible; }
.modal .bear { left: 3%; bottom: -10px; width: min(34vw, 150px); transform: translateY(120%); }
.modal .bear.show { animation: jump .7s cubic-bezier(.2, 1.6, .4, 1) forwards, bounce 1s .7s ease-in-out infinite; }
@keyframes jump { to { transform: translateY(0) } }
@keyframes bounce { 50% { transform: translateY(-10px) rotate(-3deg) } }

/* 水彩の虹(読了) */
.rainbow { position: absolute; left: 50%; top: 9%; width: min(96vw, 560px); transform: translateX(-50%); }
.rainbow path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.1s ease-out forwards; }
.rainbow path:nth-child(2) { animation-delay: .12s; }
.rainbow path:nth-child(3) { animation-delay: .24s; }
.rainbow path:nth-child(4) { animation-delay: .36s; }
.rainbow path:nth-child(5) { animation-delay: .48s; }
@keyframes draw { to { stroke-dashoffset: 0 } }
.finale .bear { left: 50%; bottom: -8px; width: min(42vw, 190px); transform: translate(-50%, 120%); }
.finale .bear.show { animation: rise-c .7s cubic-bezier(.2, 1.6, .4, 1) forwards, wave 1.1s .7s ease-in-out infinite; }
@keyframes rise-c { to { transform: translate(-50%, 0) } }
@keyframes wave { 50% { transform: translate(-50%, -12px) rotate(3deg) } }

/* 画面の下の隅: くまが顔を出す / うんちく(読書は止めない) */
.corner { pointer-events: none; }
.corner .bear { bottom: -10px; width: min(36vw, 150px); transform: translateY(115%); pointer-events: auto; cursor: pointer; }
.corner .bear.right { right: 3%; }
.corner .bear.left { left: 3%; }
.corner .bear.show { animation: rise .55s cubic-bezier(.2, 1.6, .4, 1) forwards; }
.corner .bear.peek.show { animation: rise .55s cubic-bezier(.2, 1.6, .4, 1) forwards, wiggle .5s .6s ease-in-out 2; }
.corner .bear.show.bye { animation: sink .4s ease-in forwards; }
@keyframes rise { to { transform: translateY(0) } }
@keyframes sink { from { transform: translateY(0) } to { transform: translateY(120%) } }
@keyframes wiggle { 25% { transform: rotate(-6deg) } 75% { transform: rotate(6deg) } }
.bubble {
  position: absolute; right: 5%; bottom: calc(min(36vw, 150px) * .98); max-width: min(80vw, 360px); box-sizing: border-box;
  background: var(--paper); border: 3px solid var(--ink); border-radius: 22px 16px 22px 18px;
  box-shadow: 5px 6px 0 rgba(76, 201, 163, .4);
  padding: 18px 16px 12px; pointer-events: auto; cursor: pointer;
  transform-origin: 82% 115%; animation: bubble .45s .3s cubic-bezier(.2, 1.6, .4, 1) both;
}
.bubble::after {
  content: ""; position: absolute; right: 22%; bottom: -16px; width: 22px; height: 18px;
  background: var(--paper); border-right: 3px solid var(--ink); border-bottom: 3px solid var(--ink);
  transform: skewX(-28deg) rotate(28deg); border-bottom-right-radius: 6px;
}
/* 左側に出すときは吹き出しも左に(しっぽを鏡写しにする) */
.bubble.left { right: auto; left: 5%; transform-origin: 18% 115%; }
.bubble.left::after { right: auto; left: 22%; transform: scaleX(-1) skewX(-28deg) rotate(28deg); }
@keyframes bubble { from { transform: scale(.3); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.bubble .tag {
  position: absolute; left: 14px; top: -15px; background: #4cc9a3; color: #fff;
  border: 3px solid var(--ink); border-radius: 999px; padding: 2px 13px; font-size: 13px; font-weight: 900;
}
.bubble .text { font-size: clamp(15px, 3.9vw, 18px); font-weight: 800; line-height: 1.6; }
.bubble .from { margin-top: 4px; font-size: 12px; color: #8a7462; }

.reduced *, .reduced { animation-duration: .001s !important; animation-iteration-count: 1 !important; animation-delay: 0s !important; }
.reduced .rays { display: none; }
.reduced .obi.show { animation: none !important; transform: translateY(-50%) rotate(-7deg); }
`;

const MARKS = ['A', 'B', 'C'];

export function createStage({ Paint, bearSVG }) {
  let modal = null; // mount() の層
  let corner = null;

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ampOf = (intensity) => Math.min(1, Math.max(0.15, intensity));

  /**
   * Shadow DOM の層を1枚作る。水彩の canvas の描画ループは、舞っているものがある間だけ回す
   * (答えを待つクイズの間など、何も舞っていなければ止めておく。部品が足されると回り出す)。
   */
  function mount(className, amp, html) {
    const host = document.createElement('div');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
    const root = host.attachShadow({ mode: 'open' });
    const reduced = reducedMotion();
    root.innerHTML = `<style>${CSS}</style><div class="wrap ${className}${reduced ? ' reduced' : ''}">${html}</div>`;
    const wrap = root.querySelector('.wrap');
    wrap.style.setProperty('--i', String(amp));
    document.documentElement.append(host);
    const paint = new Paint(root.querySelector('canvas.paint'));
    paint.motion = amp;
    paint.reduced = reduced;
    const layer = {
      host,
      root,
      wrap,
      paint,
      raf: 0,
      autoClose: 0,
      timers: [],
      onKey: null,
      onClose: null,
      prevFocus: null, // 開く前にフォーカスがあった要素(閉じたら返す)
    };
    let last = 0;
    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      paint.update(dt);
      paint.draw();
      layer.raf = paint.busy ? requestAnimationFrame(loop) : 0;
    };
    paint.onWake = () => {
      if (layer.raf) return;
      last = performance.now();
      layer.raf = requestAnimationFrame(loop);
    };
    return layer;
  }

  function unmount(layer) {
    if (!layer) return;
    clearTimeout(layer.autoClose);
    for (const t of layer.timers) clearTimeout(t);
    if (layer.onKey) removeEventListener('keydown', layer.onKey, true);
    // フォーカスが層の中にあれば、開く前の場所へ返す
    const focused = layer.root.activeElement;
    if (focused) {
      focused.blur();
      if (layer.prevFocus?.isConnected) layer.prevFocus.focus?.({ preventScroll: true });
    }
    layer.wrap.classList.add('out');
    setTimeout(() => {
      layer.paint.onWake = null;
      cancelAnimationFrame(layer.raf);
      layer.host.remove();
    }, 260);
    layer.onClose?.();
  }

  function closeModal() {
    const m = modal;
    modal = null;
    unmount(m);
  }

  function dismissCorner() {
    const c = corner;
    if (!c) return;
    corner = null;
    for (const b of c.root.querySelectorAll('.bear')) b.classList.add('bye');
    unmount(c);
  }

  // ---- 画面の下の隅 ----------------------------------------------------------

  function cornerBear(pose, side, extraHtml = '') {
    dismissCorner();
    const layer = mount('corner', 1, `<canvas class="paint"></canvas>${extraHtml}<div class="bear ${pose} ${side}">${bearSVG(pose)}</div>`);
    layer.wrap.style.pointerEvents = 'none';
    corner = layer;
    requestAnimationFrame(() => layer.root.querySelector('.bear').classList.add('show'));
    return layer;
  }

  /** くまが本ごと顔を出して、少し揺れて、花びらを散らして引っ込む。 */
  function peek({ intensity = 1, side, onClose } = {}) {
    const amp = ampOf(intensity);
    if (side !== 'left' && side !== 'right') side = Math.random() < 0.5 ? 'left' : 'right';
    const layer = cornerBear('peek', side);
    layer.onClose = onClose;
    layer.paint.motion = amp;
    const bear = layer.root.querySelector('.bear');
    bear.addEventListener('click', dismissCorner);
    layer.timers.push(setTimeout(() => {
      if (corner !== layer) return;
      const r = bear.getBoundingClientRect();
      layer.paint.scatter(r.left + r.width / 2, r.top + 10, { count: 12, kinds: ['petal', 'star'], speed: 300, spread: 1.6 });
    }, 500));
    layer.autoClose = setTimeout(() => corner === layer && dismissCorner(), 2_900);
  }

  /**
   * くまが手を挙げて、うんちくを一言。クリックかページ送りで消える。
   * side は出す側(main.js が本文の枠と読んでいる位置から決める)。caption は出どころの一行。
   */
  function trivia({ text, term = '' }, { intensity = 1, side = 'right', caption, onClose } = {}) {
    const amp = ampOf(intensity);
    if (side !== 'left' && side !== 'right') side = 'right';
    const from = caption ?? (term ? `さっきのページの「${term}」より` : '');
    const layer = cornerBear(
      'talk',
      side,
      `<div class="bubble ${side}" role="status"><span class="tag">うんちく</span><div class="text"></div>${from ? '<div class="from"></div>' : ''}</div>`,
    );
    layer.onClose = onClose;
    layer.paint.motion = amp;
    layer.root.querySelector('.text').textContent = text;
    if (from) layer.root.querySelector('.from').textContent = from;
    layer.root.querySelector('.bubble').addEventListener('click', dismissCorner);
    layer.root.querySelector('.bear').addEventListener('click', dismissCorner);
    layer.timers.push(setTimeout(() => {
      if (corner !== layer) return;
      const r = layer.root.querySelector('.bubble').getBoundingClientRect();
      layer.paint.scatter(side === 'left' ? r.left + 20 : r.right - 20, r.top, { count: 10, kinds: ['star', 'petal'], speed: 260, spread: 2, stars: 'gold' });
    }, 700));
    // 読む長さに合わせて出しておく(1文字あたり約0.12秒、4〜12秒)
    const ms = Math.min(12_000, Math.max(4_000, 2_500 + text.length * 120));
    layer.autoClose = setTimeout(() => corner === layer && dismissCorner(), ms);
  }

  // ---- めくった瞬間 ----------------------------------------------------------

  let shower = null;

  function endShower() {
    const s = shower;
    shower = null;
    unmount(s);
  }

  /**
   * ページをめくった瞬間に、クイズ正解と同じ花びら・ことば吹雪・星を上から降らせる。
   * 操作は素通しで読書を止めない。続けてめくれば同じ層に足していく。
   * 星は銀: 金・虹はレア・激レアの先触れの色なので、毎回のめくりで薄めない。
   */
  function pageShower({ intensity = 1, glyphs = [] } = {}) {
    const amp = ampOf(intensity);
    if (!shower) shower = mount('shower', amp, '<canvas class="paint"></canvas>');
    const layer = shower;
    layer.paint.motion = amp;
    layer.paint.shower(innerWidth, { count: 100, kinds: ['petal', 'glyph', 'star'], stars: 'silver', glyphs, depth: 0.8 });
    clearTimeout(layer.autoClose);
    layer.autoClose = setTimeout(() => shower === layer && endShower(), 5_000);
  }

  // ---- 画面全体 --------------------------------------------------------------

  /** 正解・読了の共通の祝い方。big は読了フィナーレ。 */
  function celebrate(layer, amp, { glyphs = [], big = false } = {}) {
    const p = layer.paint;
    p.motion = amp;
    const W = innerWidth;
    const H = innerHeight;
    p.bloom(W / 2, H * 0.46, { count: big ? 7 : 5, radius: Math.min(W, H) * 0.42, size: big ? 1.5 : 1.2 });
    p.scatter(W / 2, H * 0.46, { count: 34, kinds: ['star', 'petal', 'glyph'], speed: 620, stars: amp >= 0.7 ? 'rainbow' : 'gold', glyphs });
    p.scatter(0, H, { count: 26, kinds: ['petal', 'drop', 'glyph'], speed: 900, angle: -1.05, spread: 0.7, up: 120, glyphs });
    p.scatter(W, H, { count: 26, kinds: ['petal', 'drop', 'glyph'], speed: 900, angle: -Math.PI + 1.05, spread: 0.7, up: 120, glyphs });
    p.ribbons(W, H, big ? 6 : 4);
    p.fireworks(W, H, (big ? 3 : 2) + Math.round(3 * amp));
    p.shower(W, { count: big ? 90 : 60, kinds: ['petal', 'glyph', 'star'], stars: amp >= 0.7 ? 'rainbow' : 'gold', glyphs });
    const again = (delay, n) => layer.timers.push(setTimeout(() => modal === layer && p.fireworks(W, H, n, 0.08, 0.4), delay));
    if (amp > 0.5) again(800, 3);
    if (big && amp > 0.7) again(1_700, 4);
  }

  function showObi(layer, text) {
    const obi = layer.root.querySelector('.obi');
    layer.root.querySelector('.word').textContent = text;
    obi.classList.add('show');
  }

  /**
   * 突然クイズ。quiz = { question, choices[3], answer_index }
   * onFirstAnswer(correct, chosenIndex, latencyMs) は最初の回答だけ1回(記録用)。
   */
  function quiz(q, { intensity = 1, words = true, glyphs = [], onFirstAnswer, onCelebrate, onClose } = {}) {
    closeModal();
    dismissCorner();
    const prevFocus = document.activeElement;
    const amp = ampOf(intensity);
    const layer = mount(
      'modal',
      amp,
      `<div class="veil"></div><div class="rays"></div><canvas class="paint"></canvas>
       <div class="card" role="dialog" aria-modal="true" aria-label="クイズ">
         <div class="label">クイズ!</div>
         <button class="close" type="button" aria-label="閉じる">×</button>
         <p class="q"></p><div class="choices"></div>
       </div>
       <div class="obi"><span class="word"></span></div>
       <div class="bear">${bearSVG('cheer')}</div>`,
    );
    layer.wrap.style.pointerEvents = 'auto';
    layer.onClose = onClose;
    layer.prevFocus = prevFocus;
    modal = layer;
    const { root, wrap, paint } = layer;
    root.querySelector('.q').textContent = q.question;
    const list = root.querySelector('.choices');
    const buttons = q.choices.slice(0, 3).map((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = MARKS[i];
      const label = document.createElement('span');
      label.textContent = text;
      b.append(mark, label);
      list.append(b);
      return b;
    });

    // 登場: 左右の上からひらひら
    const W = innerWidth;
    const H = innerHeight;
    paint.scatter(W * 0.12, H * 0.1, { count: 10, kinds: ['petal', 'star'], speed: 340, angle: 0.6, spread: 1.2 });
    paint.scatter(W * 0.88, H * 0.1, { count: 10, kinds: ['petal', 'star'], speed: 340, angle: Math.PI - 0.6, spread: 1.2 });

    const openedAt = performance.now();
    let answered = false;
    let won = false;

    function choose(i) {
      if (won) return;
      const b = buttons[i];
      if (!b || b.classList.contains('wrong')) return;
      const correct = i === q.answer_index;
      if (!answered) {
        answered = true;
        onFirstAnswer?.(correct, i, Math.round(performance.now() - openedAt));
      }
      if (correct) {
        won = true;
        b.classList.add('right');
        const a = amp * (buttons.some((x) => x.classList.contains('wrong')) ? 0.6 : 1);
        wrap.classList.add('win');
        celebrate(layer, a, { glyphs });
        if (a >= 0.3) showObi(layer, words ? (a >= 0.7 ? '大当たり!!' : '正解!') : '');
        root.querySelector('.bear').classList.add('show');
        onCelebrate?.();
        layer.autoClose = setTimeout(() => modal === layer && closeModal(), a >= 0.7 ? 3_900 : 3_100);
      } else {
        // 責めない: 選び直せる。罰も記録の上書きもしない
        b.classList.add('wrong');
        b.setAttribute('aria-disabled', 'true');
        const r = b.getBoundingClientRect();
        const oops = document.createElement('div');
        oops.className = 'oops';
        oops.textContent = 'おしい!';
        oops.style.left = `${r.left + r.width / 2}px`;
        oops.style.top = `${r.top - 6}px`;
        wrap.append(oops);
        setTimeout(() => oops.remove(), 1_000);
        paint.bloom(r.left + r.width / 2, r.top + r.height / 2, { count: 1, radius: 4, colors: ['#d8cfc4'], size: 0.6 });
      }
    }

    buttons.forEach((b, i) => b.addEventListener('click', () => choose(i)));
    const closeButton = root.querySelector('.close');
    closeButton.addEventListener('click', closeModal);
    // 開いたら最初の選択肢にフォーカスを移す(キーボードだけでも答えられる)。本文のフレームに
    // フォーカスが無いと移せないことがあるが、そのときもクリックと数字キーで答えられる
    requestAnimationFrame(() => modal === layer && buttons[0]?.focus({ preventScroll: true }));
    // モーダル: 数字キーで回答、Esc で閉じる、Tab はカードの中だけを回る。下のページを矢印でめくらない
    layer.onKey = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      } else if (['1', '2', '3', 'a', 'b', 'c'].includes(e.key.toLowerCase())) {
        choose('123'.includes(e.key) ? Number(e.key) - 1 : 'abc'.indexOf(e.key.toLowerCase()));
      } else if (e.key === 'Tab') {
        const items = [closeButton, ...buttons.filter((b) => !b.classList.contains('wrong'))];
        const i = items.indexOf(root.activeElement);
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus({ preventScroll: true });
      } else if (e.key === ' ' || e.key === 'Enter') {
        // 下のページへは渡さず、フォーカスのあるボタンだけを押す
        if (root.activeElement?.tagName === 'BUTTON') root.activeElement.click();
      } else if (!e.key.startsWith('Arrow') && e.key !== 'PageDown' && e.key !== 'PageUp') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('keydown', layer.onKey, true);
  }

  /** 読了フィナーレ: 水彩の虹が描かれ、本の帯の「読了!!」、花火とことば吹雪、旗を振るくま。 */
  function finale({ intensity = 1, words = true, glyphs = [], onClose } = {}) {
    closeModal();
    dismissCorner();
    const amp = ampOf(intensity);
    const layer = mount(
      'modal finale win',
      amp,
      `<div class="veil"></div><div class="rays"></div>
       <svg class="rainbow" viewBox="0 0 300 160" aria-hidden="true">
         <defs><filter id="rb" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="4" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
         <g fill="none" stroke-linecap="round" stroke-width="15" filter="url(#rb)" opacity=".9">
           <path pathLength="1" d="M12 156 A138 138 0 0 1 288 156" stroke="#f26b8a"/>
           <path pathLength="1" d="M30 156 A120 120 0 0 1 270 156" stroke="#ffb347"/>
           <path pathLength="1" d="M48 156 A102 102 0 0 1 252 156" stroke="#ffd23f"/>
           <path pathLength="1" d="M66 156 A84 84 0 0 1 234 156" stroke="#4cc9a3"/>
           <path pathLength="1" d="M84 156 A66 66 0 0 1 216 156" stroke="#4fa3e3"/>
         </g>
       </svg>
       <canvas class="paint"></canvas>
       <div class="obi"><span class="word"></span></div>
       <div class="bear" role="status" aria-label="読了">${bearSVG('cheer', { flag: true })}</div>`,
    );
    layer.wrap.style.pointerEvents = 'auto';
    layer.onClose = onClose;
    modal = layer;
    celebrate(layer, amp, { glyphs, big: true });
    if (amp >= 0.3) showObi(layer, words ? '読了!!' : '');
    requestAnimationFrame(() => layer.root.querySelector('.bear').classList.add('show'));
    layer.wrap.addEventListener('click', closeModal);
    layer.onKey = (e) => {
      if (e.key !== 'Escape') return;
      closeModal();
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('keydown', layer.onKey, true);
    layer.autoClose = setTimeout(() => modal === layer && closeModal(), amp >= 0.7 ? 5_600 : 4_400);
  }

  return {
    peek,
    trivia,
    quiz,
    finale,
    pageShower,
    dismissCorner,
    close() {
      closeModal();
      dismissCorner();
      endShower();
    },
    get modalOpen() {
      return modal !== null;
    },
    get busy() {
      return modal !== null || corner !== null;
    },
  };
}
