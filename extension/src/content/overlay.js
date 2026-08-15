// オーバーレイ。Shadow DOM内に閉じ、ページのCSSと相互汚染しない。
// ページDOMへの変更はホスト要素1個の追加のみ。
// 「連れ出さない刺激」だけが許される: リンクなし、音なし、画面中央を長時間塞がない。

const CSS = `
  :host {
    all: initial;
  }
  * {
    box-sizing: border-box;
    font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif;
  }

  /* ヒントカード(右下・小さく) */
  .hint {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483646;
    max-width: 260px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(28, 28, 30, 0.92);
    color: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.18); /* 同系色の背景に溶けないための縁 */
    font-size: 13px;
    line-height: 1.5;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    cursor: default;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.4s ease, transform 0.4s ease;
  }
  @media (prefers-color-scheme: light) {
    .hint {
      background: rgba(255, 255, 255, 0.95);
      color: rgba(0, 0, 0, 0.82);
      border-color: rgba(0, 0, 0, 0.12);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    }
  }
  .hint.show {
    opacity: 1;
    transform: translateY(0);
  }

  /* 署名要素: 細いリング */
  .ring {
    flex: none;
    width: 14px;
    height: 14px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    opacity: 0.7;
  }

  /* きらきらの舞台。画面全体を覆う不可侵レイヤー(クリックは素通し) */
  .field {
    position: fixed;
    inset: 0;
    z-index: 2147483645;
    pointer-events: none;
  }

  /* きらきら。金色の四芒星が舞い上がって瞬く */
  .sparkle {
    position: absolute;
    width: var(--size, 8px);
    height: var(--size, 8px);
    background: #ffd76a;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 4px rgba(255, 200, 80, 0.95));
    pointer-events: none;
    opacity: 0;
    animation: sparkle 2s ease-out var(--delay, 0s) forwards;
  }
  @keyframes sparkle {
    0%   { opacity: 0; transform: translate(0, 0) rotate(0deg) scale(0.2); }
    15%  { opacity: 1; transform: translate(calc(var(--dx) * 0.3), calc(var(--dy) * 0.3)) rotate(60deg) scale(1.1); }
    35%  { opacity: 0.5; }
    55%  { opacity: 1; transform: translate(calc(var(--dx) * 0.7), calc(var(--dy) * 0.7)) rotate(150deg) scale(0.9); }
    75%  { opacity: 0.4; }
    100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(220deg) scale(0.1); }
  }

  /* 読了お祝い(セッション成功時のみ・数秒で消える) */
  .celebrate {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: grid;
    place-items: center;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.5s ease;
  }
  .celebrate.show { opacity: 1; }
  .celebrate .card {
    position: relative;
    display: grid;
    place-items: center;
    gap: 12px;
    padding: 28px 40px;
    border-radius: 16px;
    background: rgba(28, 28, 30, 0.88);
    color: rgba(255, 255, 255, 0.94);
  }
  @media (prefers-color-scheme: light) {
    .celebrate .card {
      background: rgba(255, 255, 255, 0.94);
      color: rgba(0, 0, 0, 0.85);
    }
  }
  .celebrate .big-ring {
    width: 44px;
    height: 44px;
    border: 2px solid currentColor;
    border-radius: 50%;
    animation: ring-in 0.8s ease-out;
  }
  @keyframes ring-in {
    0% { transform: scale(0.5); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  .celebrate .text {
    font-size: 15px;
  }
  .celebrate .sub {
    font-size: 12px;
    opacity: 0.65;
  }
`;

function burst(parent, count, { delaySpread = 0.8 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    // ランダムな点から、外向き+すこし上へ舞う
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 50;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.6 - 18}px`);
    s.style.setProperty('--size', `${5 + Math.random() * 9}px`);
    s.style.setProperty('--delay', `${Math.random() * delaySpread}s`);
    s.style.left = `${Math.random() * 100}%`;
    s.style.top = `${Math.random() * 100}%`;
    parent.append(s);
    setTimeout(() => s.remove(), (2 + delaySpread) * 1000 + 200);
  }
}

/** 一拍おいて余韻の二波目。「きらきらしている時間」を作る。 */
function twinkle(parent, count, opts) {
  burst(parent, count, opts);
  setTimeout(() => {
    if (parent.isConnected) burst(parent, Math.ceil(count / 2), opts);
  }, 1_500);
}

export function createOverlay() {
  const host = document.createElement('div');
  host.setAttribute('data-rs-overlay', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.append(style);
  // きらきら用の全画面レイヤー。クリック・スクロールは素通し。
  const field = document.createElement('div');
  field.className = 'field';
  shadow.append(field);
  document.documentElement.append(host);

  let hintEl = null;
  let hintTimer = null;

  function dismissHint() {
    if (!hintEl) return;
    const el = hintEl;
    hintEl = null;
    clearTimeout(hintTimer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 450);
  }

  return {
    /** 状態通知(計測開始・計測のみモード等)。きらきらなしで静かに出て消える。 */
    showNotice(text, ms = 3_000) {
      const el = document.createElement('div');
      el.className = 'hint';
      const ring = document.createElement('span');
      ring.className = 'ring';
      const body = document.createElement('span');
      body.textContent = text;
      el.append(ring, body);
      shadow.append(el);
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => el.classList.remove('show'), ms);
      setTimeout(() => el.remove(), ms + 500);
    },

    /** ヒントカードを1枚表示。前のカードが残っていれば置き換える。 */
    showHint(text, { onClick } = {}) {
      dismissHint();
      const el = document.createElement('div');
      el.className = 'hint';
      const ring = document.createElement('span');
      ring.className = 'ring';
      const body = document.createElement('span');
      body.textContent = text;
      el.append(ring, body);
      el.addEventListener('click', () => {
        onClick?.();
        dismissHint();
      });
      shadow.append(el);
      requestAnimationFrame(() => el.classList.add('show'));
      // 画面全体に星が舞う
      twinkle(field, 26, { delaySpread: 1.2 });
      hintEl = el;
      hintTimer = setTimeout(dismissHint, 7_000);
    },

    /** 読了お祝い。セッション成功時のみ呼ばれる。 */
    celebrate(readMin) {
      const wrap = document.createElement('div');
      wrap.className = 'celebrate';
      const card = document.createElement('div');
      card.className = 'card';
      const ring = document.createElement('div');
      ring.className = 'big-ring';
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = '読めた。';
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = `今日の読書 ${readMin}分`;
      card.append(ring, text, sub);
      wrap.append(card);
      shadow.append(wrap);
      requestAnimationFrame(() => wrap.classList.add('show'));
      // お祝いはさらに濃く、画面全体で
      twinkle(field, 44, { delaySpread: 1.2 });
      setTimeout(() => wrap.classList.remove('show'), 2_100);
      setTimeout(() => wrap.remove(), 2_700);
    },

    destroy() {
      dismissHint();
      host.remove();
    },
  };
}
