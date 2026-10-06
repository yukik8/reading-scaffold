// 紙のめくれ(常時演出): 読んでいる間、ときどき風で左下の角がペラっとめくれて戻る。
// 本文には重ねない(角の余白だけ)。縦書きの本は左へめくるので、次にめくる角が風に煽られる形になる。
// 描くのはめくれている約1.5秒だけで、それ以外は層ごと隠す。
// 「視差効果を減らす」設定の端末では何もしない。

const BOX = 200; // 描く範囲(左下の正方形、CSS px)
const DURATION_MS = 1_500;

// 色を白(d>0)か黒(d<0)へ寄せる
function tone([r, g, b], d) {
  const f = (c) => Math.round(d >= 0 ? c + (255 - c) * d : c * (1 + d));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

/**
 * @param {{ canvas: HTMLCanvasElement, color: number[], light: boolean }} layer overlay.curlLayer() の戻り値
 */
export function createPageCurl({ canvas, color, light }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  // めくれた紙(裏面)は 折り目の陰→つや→先端 の順に塗る。下の紙はめくれて見えた次のページ
  const pal = light
    ? { under: tone(color, -0.06), fold: tone(color, -0.16), mid: tone(color, 0.5), tip: tone(color, -0.05) }
    : { under: tone(color, -0.35), fold: tone(color, 0.06), mid: tone(color, 0.2), tip: tone(color, 0.1) };
  let raf = 0;
  let dpr = 1;

  function tri(p, q, r) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.lineTo(r[0], r[1]);
    ctx.closePath();
  }

  // 角から右へ a、上へ b の点を結ぶ線で折る
  function draw(a, b) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (a < 0.5 || b < 0.5) return;
    ctx.setTransform(dpr, 0, 0, -dpr, 0, canvas.height); // 原点を左下に、y を上向きに
    const k = (a * b) / (a * a + b * b);
    const foot = [k * b, k * a]; // 角から折り目へ下ろした垂線の足
    const tip = [2 * foot[0], 2 * foot[1]]; // 角を折り目で折り返した先

    // めくれて見えた下の紙。折り目ぎわは、めくれた紙の陰で暗い
    tri([0, 0], [a, 0], [0, b]);
    ctx.fillStyle = pal.under;
    ctx.fill();
    const dim = ctx.createLinearGradient(0, 0, foot[0], foot[1]);
    dim.addColorStop(0, 'rgba(0, 0, 0, 0)');
    dim.addColorStop(1, light ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = dim;
    ctx.fill();

    // めくれた紙。ページへ落ちる影を付ける
    tri([a, 0], tip, [0, b]);
    ctx.save();
    ctx.shadowColor = light ? 'rgba(0, 0, 0, 0.22)' : 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 8 * dpr;
    ctx.shadowOffsetX = 2 * dpr;
    ctx.shadowOffsetY = 2 * dpr;
    const back = ctx.createLinearGradient(foot[0], foot[1], tip[0], tip[1]);
    back.addColorStop(0, pal.fold);
    back.addColorStop(0.4, pal.mid);
    back.addColorStop(1, pal.tip);
    ctx.fillStyle = back;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = light ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  return {
    /** 角を1回めくる。size はめくれの大きさ(角からの px)。めくれている最中なら何もしない。 */
    flip(size) {
      if (reduced || raf) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.height = Math.round(BOX * dpr);
      canvas.style.visibility = 'visible';
      const phase = Math.random() * Math.PI * 2;
      const start = performance.now();
      const loop = (now) => {
        const u = Math.min(1, (now - start) / DURATION_MS);
        // 素早くめくれ、風でぱたぱた揺れてから、ゆっくり戻る
        const env = easeOut(Math.min(1, u / 0.2)) * (u < 0.6 ? 1 : 1 - easeInOut((u - 0.6) / 0.4));
        const flutter = 1 + 0.18 * Math.sin(u * Math.PI * 7) * (1 - u);
        const skew = 0.25 * Math.sin(u * Math.PI * 4.6 + phase); // 折り目の向きも揺れる
        const s = size * env * flutter;
        draw(s * (1 + skew), s * (1 - skew));
        if (u < 1) {
          raf = requestAnimationFrame(loop);
        } else {
          raf = 0;
          canvas.style.visibility = 'hidden';
        }
      };
      raf = requestAnimationFrame(loop);
    },

    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
