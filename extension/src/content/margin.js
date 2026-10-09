// 余白の小さな演出(Play ブックス): 地のきらきら・ヒント・金/虹のレア。
//
// 本文の枠の外(余白)にだけ描く — 読んでいる文字の上には何も重ねない。描く場所は
// 本文の枠の外の帯(縦書きは上下、横書きは左右)から選び、描画のたびに本文の枠を切り抜く。
// 余白がほとんど無いページでは画面の端に寄せる(それでも本文の枠の中には描かない)。
//
// 画風は絵本・水彩(paint.js)。文字のカードは出さない — 報酬は言葉でなく雰囲気で伝える。
// 大きく出すのは突然クイズ・読了フィナーレ(stage.js)の決まった瞬間だけ。

const PAD = 8; // 本文の枠からこれだけ離す
const MIN_BAND = 26; // これより細い余白の帯は使わない
const GOLD = ['#ffd23f', '#ffb347', '#ffe17a'];

export function createMargin(Paint, { bearURL } = {}) {
  const host = document.createElement('div');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<canvas style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none"></canvas>';
  document.documentElement.append(host);
  const paint = new Paint(root.querySelector('canvas'), 320);
  paint.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let text = null; // 本文の枠 { left, right, top, bottom, vertical }
  let raf = 0;
  let last = 0;

  // 描くものがある間だけ回す(何も無いときは描画を止めて CPU を使わない)
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    paint.update(dt);
    paint.draw();
    raf = paint.busy ? requestAnimationFrame(loop) : 0;
  }
  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  /** 本文の枠の外の帯。{ x0, y0, x1, y1, along } の配列(太さ MIN_BAND 未満は除く)。 */
  function bands() {
    if (!text) return [];
    const W = innerWidth;
    const H = innerHeight;
    const out = [];
    const add = (x0, y0, x1, y1, along) => {
      if (x1 - x0 >= MIN_BAND && y1 - y0 >= MIN_BAND) out.push({ x0, y0, x1, y1, along });
    };
    add(0, 0, W, text.top - PAD, 'x'); // 上
    add(0, text.bottom + PAD, W, H, 'x'); // 下
    add(0, 0, text.left - PAD, H, 'y'); // 左
    add(text.right + PAD, 0, W, H, 'y'); // 右
    return out;
  }

  /** 描く場所を1つ。余白の帯から面積に比例して選び、帯が無ければ画面の端に寄せる。 */
  function spot() {
    const list = bands();
    if (list.length === 0) {
      const W = innerWidth;
      const H = innerHeight;
      const edge = Math.floor(Math.random() * 4);
      const r = Math.random();
      if (edge === 0) return { x: W * r, y: 14, along: 'x', band: null };
      if (edge === 1) return { x: W * r, y: H - 14, along: 'x', band: null };
      if (edge === 2) return { x: 14, y: H * r, along: 'y', band: null };
      return { x: W - 14, y: H * r, along: 'y', band: null };
    }
    const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
    let pickAt = Math.random() * list.reduce((sum, b) => sum + area(b), 0);
    let band = list[0];
    for (const b of list) {
      pickAt -= area(b);
      if (pickAt < 0) {
        band = b;
        break;
      }
    }
    const x = band.x0 + (band.x1 - band.x0) * (0.12 + Math.random() * 0.76);
    const y = band.y0 + (band.y1 - band.y0) * (0.2 + Math.random() * 0.6);
    return { x, y, along: band.along, band };
  }

  return {
    /** 本文の枠(見えている段落の外接矩形)。null なら本文の位置が分からない=端だけに描く。 */
    setText(rect) {
      text = rect;
      paint.avoid = rect
        ? { x: rect.left - PAD / 2, y: rect.top - PAD / 2, w: rect.right - rect.left + PAD, h: rect.bottom - rect.top + PAD }
        : null;
    },

    /** 地のきらきら: 余白の一点で小さな星がふっと瞬く。stars は 銀/金/虹(先触れ)。 */
    ambient(stars = 'silver', count = 3) {
      const s = spot();
      paint.motion = 1;
      paint.twinkle(s.x, s.y, { count, stars, radius: 14 });
      kick();
    },

    /**
     * ヒント(θの枠)。normal: 小さな花が咲いて花びらが帯に沿って流れる。
     * rare: 金の花がいくつも咲く。epic: 星が二度瞬いてから、水彩の虹の帯が引かれる。
     */
    hint(tier = 'normal', intensity = 1) {
      const s = spot();
      paint.motion = Math.min(1, Math.max(0.3, intensity));
      if (tier === 'normal') {
        paint.bloom(s.x, s.y, { count: 1, radius: 0, size: 0.42 });
        paint.drift(s.x, s.y, { count: 5, along: s.along });
        paint.twinkle(s.x, s.y, { count: 2, stars: 'silver', radius: 20 });
      } else if (tier === 'rare') {
        for (let i = 0; i < 3; i += 1) {
          const k = (i - 1) * 46;
          const x = s.along === 'x' ? s.x + k : s.x;
          const y = s.along === 'x' ? s.y : s.y + k;
          paint.bloom(x, y, { count: 1, radius: 0, size: 0.5, colors: GOLD });
        }
        paint.twinkle(s.x, s.y, { count: 6, stars: 'gold', radius: 50 });
        paint.drift(s.x, s.y, { count: 8, along: s.along });
      } else {
        paint.twinkle(s.x, s.y, { count: 5, stars: 'rainbow', radius: 40 });
        setTimeout(() => {
          paint.twinkle(s.x, s.y, { count: 5, stars: 'rainbow', radius: 40 });
          kick();
        }, 450);
        setTimeout(() => {
          const b = s.band;
          if (b && s.along === 'x') {
            const y = (b.y0 + b.y1) / 2;
            paint.stripe({ x0: b.x0 + 18, y0: y, x1: b.x1 - 18, y1: y, width: Math.min(22, b.y1 - b.y0 - 6) });
          } else if (b) {
            const x = (b.x0 + b.x1) / 2;
            paint.stripe({ x0: x, y0: b.y0 + 18, x1: x, y1: b.y1 - 18, width: Math.min(22, b.x1 - b.x0 - 6) });
          }
          paint.drift(s.x, s.y, { count: 10, along: s.along });
          paint.twinkle(s.x, s.y, { count: 6, stars: 'rainbow', radius: 60 });
          kick();
        }, 900);
      }
      kick();
    },

    /**
     * 激レアの先触れ: くまのシルエットが余白にふっと現れて、虹の星をまとって消える(約2.4秒・1回だけ)。
     * 余白の帯が細くてシルエットが入らなければ出さない(星の色替わりだけで予告する)。
     */
    herald() {
      const s = spot();
      const b = s.band;
      if (!b || !bearURL) return;
      const size = Math.min(72, b.x1 - b.x0 - 12, b.y1 - b.y0 - 12);
      if (size < 40) return;
      const x = Math.min(Math.max(s.x, b.x0 + size / 2), b.x1 - size / 2);
      const y = Math.min(Math.max(s.y, b.y0 + size / 2), b.y1 - size / 2);
      const img = document.createElement('img');
      img.src = bearURL(['sil-front', 'sil-sit', 'sil-lie'][Math.floor(Math.random() * 3)]);
      img.alt = '';
      img.style.cssText = `position:fixed; left:${x - size / 2}px; top:${y - size / 2}px; width:${size}px; height:auto; opacity:0; pointer-events:none;`;
      root.append(img);
      img.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 0.5, transform: 'none', offset: 0.3 },
          { opacity: 0.5, offset: 0.7 },
          { opacity: 0 },
        ],
        { duration: paint.reduced ? 1_200 : 2_400, easing: 'ease-in-out' },
      ).onfinish = () => img.remove();
      paint.motion = 1;
      paint.twinkle(x, y, { count: 4, stars: 'rainbow', radius: size * 0.7 });
      kick();
    },

    destroy() {
      cancelAnimationFrame(raf);
      host.remove();
    },
  };
}
