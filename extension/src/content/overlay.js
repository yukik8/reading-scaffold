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
    background: var(--c, #ffd76a);
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 5px var(--c, #ffd76a));
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

  /* クイズカード。ヒントより一回り大きいが、無視すれば消える(操作の強制はしない) */
  .quiz {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483646;
    width: 300px;
    padding: 14px;
    border-radius: 12px;
    background: rgba(28, 28, 30, 0.94);
    color: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.18);
    font-size: 13px;
    line-height: 1.6;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.4s ease, transform 0.4s ease;
  }
  @media (prefers-color-scheme: light) {
    .quiz {
      background: rgba(255, 255, 255, 0.97);
      color: rgba(0, 0, 0, 0.82);
      border-color: rgba(0, 0, 0, 0.12);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    }
  }
  .quiz.show {
    opacity: 1;
    transform: translateY(0);
  }
  .quiz .q {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  .quiz .q .ring {
    margin-top: 3px;
  }
  .quiz button.choice {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 12.5px;
    padding: 7px 10px;
    margin-top: 6px;
    border-radius: 8px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .quiz button.choice:hover {
    border-color: currentColor;
  }
  .quiz button.choice.correct {
    border-color: #e6a817;
    box-shadow: 0 0 0 1px #e6a817 inset;
  }
  .quiz button.choice:disabled {
    cursor: default;
    opacity: 0.75;
  }

  /* 出題元の段落を指す光の枠。ページDOMは触らず、オーバーレイ側で重ねるだけ */
  .source-glow {
    position: absolute;
    border-radius: 8px;
    box-shadow:
      0 0 0 2px rgba(230, 168, 23, 0.55),
      0 0 24px rgba(230, 168, 23, 0.3);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.5s ease;
  }
  .source-glow.show {
    opacity: 1;
  }

  /* 予告: 画面を斜めに走る金の光。この後に必ず本演出が来る(ニアミス禁止) */
  .foreshadow {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 40%,
      var(--fs, rgba(255, 215, 106, 0.22)) 50%,
      transparent 60%
    );
    transform: translateX(-100%);
    animation: sweep 0.9s ease-in-out forwards;
  }
  @keyframes sweep {
    to { transform: translateX(100%); }
  }

  /* 金の雨(レア演出)。上から星が降る */
  .rainstar {
    position: absolute;
    top: -24px;
    width: var(--size, 8px);
    height: var(--size, 8px);
    background: var(--c, #ffd76a);
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 5px var(--c, #ffd76a));
    pointer-events: none;
    opacity: 0;
    animation: fall var(--dur, 2.2s) linear var(--delay, 0s) forwards;
  }
  @keyframes fall {
    0%   { opacity: 0; transform: translateY(0) rotate(0deg); }
    8%   { opacity: 1; }
    88%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(105vh) rotate(300deg); }
  }

  /* 激レア用: 画面の縁がふわっと金色に光る */
  .vignette {
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 140px rgba(255, 200, 80, 0.45);
    opacity: 0;
    animation: vig 1.8s ease-out forwards;
  }
  @keyframes vig {
    20%  { opacity: 1; }
    100% { opacity: 0; }
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

// 星の色はページの背景の明暗で切り替える。淡い金は白背景に溶けて見えない。
import { DEMO } from '../shared/config.js';

// デモモード: 星の数・大きさだけを増幅する(発火条件・記録は不変)
const BOOST = DEMO.enabled ? DEMO.boost : 1;
const SIZE_BOOST = DEMO.enabled ? 1.25 : 1;

const STAR_COLORS_DARK_BG = ['#ffd76a', '#ffe9a8', '#fff3c4', '#ffc94d'];
const STAR_COLORS_LIGHT_BG = ['#d98f00', '#e6a817', '#c77f00', '#f0a92e'];

let starColors = STAR_COLORS_DARK_BG;

function pageIsLight() {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg?.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?\)/);
    if (!m) continue;
    const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (alpha < 0.5) continue; // 透明なら下のレイヤーを見る
    const lum = 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3];
    return lum > 140;
  }
  return true; // どちらも透明ならブラウザ既定(白)とみなす
}

// 本文カラムの位置(main.jsが設定)。日常の星はこの外側=余白にだけ出す。
// 「ドーパミンは出すが邪魔はしない」: 文字に重なる全画面演出は
// 大当たり・読了などのピーク時(fullField: true)に限る。
let textColumn = null;

export function setTextColumn(col) {
  textColumn = col; // { left, right } in viewport px、無ければnull
}

const MARGIN_PAD = 24; // 本文からこれだけ離す
const MIN_ZONE = 56; // これより狭い余白は使わない

function marginZones() {
  if (!textColumn) return null;
  const vw = innerWidth;
  const zones = [];
  if (textColumn.left - MARGIN_PAD >= MIN_ZONE) zones.push([4, textColumn.left - MARGIN_PAD]);
  if (vw - textColumn.right - MARGIN_PAD >= MIN_ZONE) {
    zones.push([textColumn.right + MARGIN_PAD, vw - 4]);
  }
  return zones.length ? zones : null;
}

// 星の出現位置。日常(fullField=false)は余白から。余白が無いページでは
// 全幅に出すが小さく控えめにする(scale)。
function spawnPos(fullField) {
  if (fullField) return { xPct: Math.random() * 100, scale: 1 };
  const zones = marginZones();
  if (!zones) return { xPct: Math.random() * 100, scale: 0.55 };
  const z = zones[Math.floor(Math.random() * zones.length)];
  const x = z[0] + Math.random() * (z[1] - z[0]);
  return { xPct: (x / innerWidth) * 100, scale: 1 };
}

function makeStar({ sizeMin, sizeMax, scale, delaySpread }) {
  const s = document.createElement('span');
  s.className = 'sparkle';
  // 外向き+すこし上へ舞う
  const angle = Math.random() * Math.PI * 2;
  const dist = 30 + Math.random() * 70;
  s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
  s.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.6 - 24}px`);
  s.style.setProperty('--size', `${(sizeMin + Math.random() * (sizeMax - sizeMin)) * scale}px`);
  s.style.setProperty('--delay', `${Math.random() * delaySpread}s`);
  s.style.setProperty('--c', starColors[Math.floor(Math.random() * starColors.length)]);
  return s;
}

function burst(parent, count, { delaySpread = 0.8, sizeMin = 5, sizeMax = 18, fullField = false } = {}) {
  count = Math.round(count * BOOST);
  sizeMax *= SIZE_BOOST;
  for (let i = 0; i < count; i += 1) {
    const pos = spawnPos(fullField);
    const s = makeStar({ sizeMin, sizeMax, scale: pos.scale, delaySpread });
    s.style.left = `${pos.xPct}%`;
    s.style.top = `${Math.random() * 100}%`;
    parent.append(s);
    setTimeout(() => s.remove(), (2 + delaySpread) * 1000 + 200);
  }
}

/** 波を重ねて「きらきらしている時間」を作る。counts = 各波の星の数。 */
function shower(parent, counts, { interval = 1_200, fullField = false } = {}) {
  counts.forEach((count, i) => {
    setTimeout(() => {
      if (parent.isConnected) burst(parent, count, { delaySpread: 1.2, fullField });
    }, i * interval);
  });
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
  starColors = pageIsLight() ? STAR_COLORS_LIGHT_BG : STAR_COLORS_DARK_BG;

  let hintEl = null;
  let hintTimer = null;

  // ---- 内部の演出部品(公開メソッドとクイズ正解処理の両方から使う) ----

  function fireForeshadow() {
    const f = document.createElement('div');
    f.className = 'foreshadow';
    if (starColors === STAR_COLORS_LIGHT_BG) {
      f.style.setProperty('--fs', 'rgba(217, 143, 0, 0.18)');
    }
    field.append(f);
    setTimeout(() => f.remove(), 1_000);
  }

  function fireVignette() {
    const vg = document.createElement('div');
    vg.className = 'vignette';
    field.append(vg);
    setTimeout(() => vg.remove(), 2_000);
  }

  function fireRain(tier) {
    if (tier !== 'rare') fireVignette();
    const count = Math.round((tier === 'jackpot' ? 130 : tier === 'epic' ? 90 : 45) * BOOST);
    const sizeSpread = (tier === 'jackpot' ? 18 : tier === 'epic' ? 14 : 10) * SIZE_BOOST;
    for (let i = 0; i < count; i += 1) {
      const s = document.createElement('span');
      s.className = 'rainstar';
      s.style.setProperty('--c', starColors[Math.floor(Math.random() * starColors.length)]);
      s.style.setProperty('--size', `${6 + Math.random() * sizeSpread}px`);
      s.style.setProperty('--dur', `${1.6 + Math.random() * 1.4}s`);
      s.style.setProperty('--delay', `${Math.random() * (tier === 'jackpot' ? 1.8 : 1.2)}s`);
      s.style.left = `${Math.random() * 100}%`;
      field.append(s);
      setTimeout(() => s.remove(), 5_400);
    }
  }

  /** 出題元の段落に光の枠を重ねる。スクロールに追従し、解除関数を返す。 */
  function attachSourceGlow(el) {
    const g = document.createElement('div');
    g.className = 'source-glow';
    field.append(g);
    let raf = null;
    const update = () => {
      const r = el.getBoundingClientRect();
      g.style.left = `${r.left - 6}px`;
      g.style.top = `${r.top - 6}px`;
      g.style.width = `${r.width + 12}px`;
      g.style.height = `${r.height + 12}px`;
    };
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        update();
      });
    };
    update();
    requestAnimationFrame(() => g.classList.add('show'));
    addEventListener('scroll', onMove, { passive: true });
    addEventListener('resize', onMove, { passive: true });
    return () => {
      removeEventListener('scroll', onMove);
      removeEventListener('resize', onMove);
      g.classList.remove('show');
      setTimeout(() => g.remove(), 550);
    };
  }

  /** 大当たり。予告→縁光二連→特濃の雨+星の三波。約5秒のウォーー。 */
  function fireJackpot() {
    fireForeshadow();
    setTimeout(() => {
      fireRain('jackpot');
      shower(field, [60, 40, 20], { fullField: true }); // ピーク時だけ全画面
      setTimeout(fireVignette, 1_200); // 縁光の二拍目
      if (DEMO.enabled) {
        // デモ: 二の矢・三の矢まで撃つ(計約9秒)
        setTimeout(() => {
          fireForeshadow();
          fireRain('epic');
        }, 2_600);
        setTimeout(() => {
          fireRain('jackpot');
          shower(field, [60, 40], { fullField: true });
        }, 4_400);
      }
    }, 950);
  }

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

    /** 予告の光。呼んだ側は必ず続けて本演出(rain)を出すこと。 */
    foreshadow: fireForeshadow,

    /** 金の雨。tier: 'rare' | 'epic' | 'jackpot'(rare以外は縁光つき)。 */
    rain: fireRain,

    /** 大当たり(クイズ正解・低Level用)。 */
    jackpot: fireJackpot,

    /** ヒントカードを1枚表示。前のカードが残っていれば置き換える。 */
    showHint(text, { onClick, quiet = false } = {}) {
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
      // 画面全体に星が舞う(三波・計約4.5秒)。quiet時は呼び手が別演出を重ねる
      if (!quiet) shower(field, [44, 28, 14]);
      hintEl = el;
      hintTimer = setTimeout(dismissHint, 7_000);
    },

    /** 地の演出: 読んでいる間に漂う小さな星。ヒントの波より小粒で静か。 */
    /**
     * 地の演出「キラッ」: 余白のランダムな一点に、星が固まって瞬く。
     * 一定間隔で均等に湧く単調さをやめて、突発的な一瞬のきらめきにする。
     */
    glint(count) {
      count = Math.round(count * BOOST);
      const pos = spawnPos(false);
      const baseX = (pos.xPct / 100) * innerWidth;
      const baseY = (10 + Math.random() * 80) * (innerHeight / 100);
      for (let i = 0; i < count; i += 1) {
        const s = makeStar({ sizeMin: 5, sizeMax: 13, scale: pos.scale, delaySpread: 0.35 });
        s.style.left = `${baseX + (Math.random() - 0.5) * 44}px`;
        s.style.top = `${baseY + (Math.random() - 0.5) * 80}px`;
        field.append(s);
        setTimeout(() => s.remove(), 2_600);
      }
    },

    /**
     * クイズカード。quiz = { question, choices[3], answer_index }。
     * 責めない: 不正解を罰しない・採点を残さない・無視したら黙って消える。
     * 教えない: 正誤も解説も言葉にしない。正解の選択肢が光る+星だけ。
     */
    showQuiz(quiz, { onAnswer, rewardTier = 'shower', sourceEl = null } = {}) {
      dismissHint(); // ヒントカードと同じ場所に出すので置き換える
      const detachGlow = sourceEl ? attachSourceGlow(sourceEl) : null;
      const el = document.createElement('div');
      el.className = 'quiz';
      const q = document.createElement('div');
      q.className = 'q';
      const ring = document.createElement('span');
      ring.className = 'ring';
      const qText = document.createElement('span');
      qText.textContent = quiz.question;
      q.append(ring, qText);
      el.append(q);

      let answered = false;
      const shownAt = Date.now(); // 回答までの迷い時間(latency)計測用
      let ignoreTimer = setTimeout(() => {
        if (!answered) removeCard();
      }, 25_000);

      function removeCard() {
        clearTimeout(ignoreTimer);
        detachGlow?.();
        el.classList.remove('show');
        setTimeout(() => el.remove(), 450);
      }

      const buttons = quiz.choices.map((text, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const correct = i === quiz.answer_index;
          for (const btn of buttons) btn.disabled = true;
          // 言葉の原則: 正誤を言葉で言わない・解説しない。
          // 正解の選択肢が光る(事実)+ 星(雰囲気)だけで伝える
          buttons[quiz.answer_index].classList.add('correct');
          if (correct) {
            // 理解への報酬は最大瞬間風速。強さはθ連動(呼び手が決める)
            if (rewardTier === 'jackpot') fireJackpot();
            else if (rewardTier === 'rain') {
              fireForeshadow();
              setTimeout(() => fireRain('rare'), 950);
            } else shower(field, [36, 20]);
          } else {
            burst(field, 8, { delaySpread: 0.6 }); // 参加への小さなきらめき(責めない)
          }
          onAnswer?.(correct, i, Date.now() - shownAt);
          setTimeout(removeCard, correct ? (rewardTier === 'shower' ? 3_000 : 5_500) : 5_000);
        });
        el.append(b);
        return b;
      });

      shadow.append(el);
      requestAnimationFrame(() => el.classList.add('show'));
    },

    /** 読了お祝い。セッション成功時のみ呼ばれる。 */
    celebrate(readMin) {
      const wrap = document.createElement('div');
      wrap.className = 'celebrate';
      const card = document.createElement('div');
      card.className = 'card';
      // 言葉の原則: 労いも達成宣言も言葉にしない。リングと星と、事実(分数)だけ
      const ring = document.createElement('div');
      ring.className = 'big-ring';
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = `${readMin}分`;
      card.append(ring, text);
      wrap.append(card);
      shadow.append(wrap);
      requestAnimationFrame(() => wrap.classList.add('show'));
      // お祝いはさらに濃く、画面全体で
      shower(field, [80, 56, 32], { fullField: true }); // 読了はピーク: 全画面
      if (DEMO.enabled) {
        // デモ: 金の雨+予告+縁光を重ねた大祝祭(約8秒)
        fireVignette();
        setTimeout(() => {
          fireForeshadow();
          fireRain('jackpot');
        }, 800);
        setTimeout(() => {
          fireRain('epic');
          shower(field, [80, 56], { fullField: true });
        }, 3_200);
        setTimeout(fireVignette, 4_800);
      }
      const showMs = DEMO.enabled ? 6_500 : 2_100;
      setTimeout(() => wrap.classList.remove('show'), showMs);
      setTimeout(() => wrap.remove(), showMs + 600);
    },

    destroy() {
      dismissHint();
      host.remove();
    },
  };
}
