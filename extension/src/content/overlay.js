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

  /* きらきら。カードの周囲に小さな粒が散る */
  .sparkle {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    pointer-events: none;
    opacity: 0;
    animation: sparkle 0.9s ease-out forwards;
  }
  @keyframes sparkle {
    0%   { opacity: 0; transform: translate(0, 0) scale(0.4); }
    25%  { opacity: 0.9; }
    100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0); }
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

function burst(parent, count) {
  for (let i = 0; i < count; i += 1) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    const angle = Math.random() * Math.PI * 2;
    const dist = 24 + Math.random() * 36;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    s.style.left = `${20 + Math.random() * 60}%`;
    s.style.top = `${20 + Math.random() * 60}%`;
    s.style.animationDelay = `${Math.random() * 0.25}s`;
    parent.append(s);
    setTimeout(() => s.remove(), 1400);
  }
}

export function createOverlay() {
  const host = document.createElement('div');
  host.setAttribute('data-rs-overlay', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.append(style);
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
      burst(el, 7);
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
      burst(card, 14);
      setTimeout(() => wrap.classList.remove('show'), 2_100);
      setTimeout(() => wrap.remove(), 2_700);
    },

    destroy() {
      dismissHint();
      host.remove();
    },
  };
}
