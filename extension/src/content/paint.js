// 絵本・水彩の演出(Canvas 2D)。お祝いの部品はすべてここで描く。
//
//   しぶき(splat) … ぱっと咲いて、ゆっくり薄れる絵の具のしみ
//   粒(drop)       … 飛び散る絵の具の粒
//   花びら(petal) … 左右に揺れながら舞い落ちる
//   星(star)       … 色の語彙そのまま: 銀=通常 / 金=レア / 虹=激レア
//   文字(glyph)    … ことば吹雪。読んでいた本の文字が舞う
//   リボン(ribbon) … しおりのリボンがはためきながら飛ぶ
//   花火(burst)    … 放射状の筆あとが開いて消える
//
// 線はセピア、塗りは鮮やかな水彩(縁が少し濃く、中に明るいムラ)。形はスプライトに一度だけ焼き、
// 毎フレームは位置・回転・透明度だけを変える。量は motion(0〜1、θに比例)で決まり、
// 「視差効果を減らす」設定では reduced=true で数個だけにする。

export const INK = '#4a2f24';
export const WATER = ['#f26b8a', '#ffb347', '#ffd23f', '#4cc9a3', '#4fa3e3', '#a78bfa'];
const STAR_TONES = {
  silver: ['#eef1f6', '#d5dbe6', '#c3cad8'],
  gold: ['#ffd23f', '#ffc23a', '#ffe17a'],
  rainbow: WATER,
};
const GLYPH_FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

const rnd = (a, b) => a + Math.random() * (b - a);
const any = (xs) => xs[Math.floor(Math.random() * xs.length)];

// ---- スプライト(形を一度だけ焼く) ------------------------------------------

// 焼いた形の置き場。上限を超えたら一番長く使っていないものから捨てる(ことば吹雪の文字は本の字の
// 種類だけ増えるので、上限が無いと長く読むほど膨らむ)。舞っている途中の部品は自分で形を持っている
const cache = new Map();
const CACHE_MAX = 240;
// しぶきの形の種類。色ごとに焼くので、種類を増やすと焼く数がその分増える
const SPLAT_SHAPES = 8;

function bake(key, size, draw) {
  let s = cache.get(key);
  if (s) {
    cache.delete(key); // 使ったものを最新に回す
    cache.set(key, s);
    return s;
  }
  const k = 2; // 高精細端末でもにじまないよう2倍で焼く
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(size * k);
  const g = cv.getContext('2d');
  g.scale(k, k);
  g.translate(size / 2, size / 2);
  draw(g, size);
  s = { cv, size };
  cache.set(key, s);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return s;
}

/** 焼いた形を全部捨てる(セッションの終わりに。ページに残るモジュールが画像を抱えたままにしない)。 */
export function clearSprites() {
  cache.clear();
}

/** 水彩の塗り: 地の色 → 中の明るいムラ → 縁の少し濃い色。path はその都度描く関数。 */
function wash(g, path, color, r) {
  g.save();
  path(g);
  g.clip();
  g.fillStyle = color;
  g.globalAlpha = 0.86;
  g.fillRect(-r, -r, r * 2, r * 2);
  const hi = g.createRadialGradient(-r * 0.25, -r * 0.3, 0, -r * 0.25, -r * 0.3, r * 0.9);
  hi.addColorStop(0, 'rgba(255,255,255,.55)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = 1;
  g.fillStyle = hi;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
  g.save();
  path(g);
  g.globalAlpha = 0.5;
  g.lineWidth = r * 0.16;
  g.strokeStyle = color;
  g.stroke();
  g.restore();
}

function petalPath(r) {
  return (g) => {
    g.beginPath();
    g.moveTo(0, -r);
    g.bezierCurveTo(r * 0.85, -r * 0.7, r * 0.75, r * 0.55, 0, r);
    g.bezierCurveTo(-r * 0.75, r * 0.55, -r * 0.85, -r * 0.7, 0, -r);
    g.closePath();
  };
}

function starPath(r) {
  return (g) => {
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.46 : r;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  };
}

/** しぶき: でこぼこの丸と、周りの小さな粒。seed ごとに形が変わる。 */
function splatPath(r, seed) {
  const bumps = 9;
  const amp = [];
  for (let i = 0; i < bumps; i += 1) amp.push(0.78 + (((seed * 9301 + i * 49297) % 233) / 233) * 0.3);
  return (g) => {
    g.beginPath();
    for (let i = 0; i <= 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      const t = (a / (Math.PI * 2)) * bumps;
      const i0 = Math.floor(t) % bumps;
      const i1 = (i0 + 1) % bumps;
      const f = t - Math.floor(t);
      const rr = r * 0.62 * (amp[i0] * (1 - f) + amp[i1] * f);
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    for (let i = 0; i < 4; i += 1) {
      const a = seed * 1.7 + i * 1.9;
      const d = r * (0.72 + (i % 2) * 0.12);
      const rr = r * (0.07 + (i % 3) * 0.025);
      g.moveTo(Math.cos(a) * d + rr, Math.sin(a) * d);
      g.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, Math.PI * 2);
    }
  };
}

const sprites = {
  petal: (color) =>
    bake(`petal${color}`, 26, (g) => {
      const path = petalPath(10);
      wash(g, path, color, 11);
      path(g);
      g.lineWidth = 1.3;
      g.strokeStyle = INK;
      g.globalAlpha = 0.75;
      g.stroke();
    }),
  drop: (color) =>
    bake(`drop${color}`, 16, (g) => {
      wash(g, (c) => { c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); }, color, 6);
    }),
  star: (color) =>
    bake(`star${color}`, 30, (g) => {
      const path = starPath(12);
      wash(g, path, color, 13);
      path(g);
      g.lineJoin = 'round';
      g.lineWidth = 1.8;
      g.strokeStyle = INK;
      g.stroke();
    }),
  splat: (color, seed) =>
    bake(`splat${color}${seed}`, 120, (g) => {
      wash(g, splatPath(56, seed), color, 60);
    }),
  glyph: (ch, color) =>
    bake(`glyph${ch}${color}`, 44, (g) => {
      g.font = `700 30px ${GLYPH_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 5;
      g.strokeStyle = '#fffaf0';
      g.strokeText(ch, 0, 1);
      g.lineWidth = 1.6;
      g.strokeStyle = INK;
      g.strokeText(ch, 0, 1);
      g.fillStyle = color;
      g.fillText(ch, 0, 1);
    }),
};

// ---- 本体 -------------------------------------------------------------------

export class Paint {
  constructor(canvas, limit = 700) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.limit = limit;
    this.items = [];
    this.motion = 1;
    this.reduced = false;
    // 描かない四角(本文の枠)。{ x, y, w, h } を入れると、その中には何も描かない
    this.avoid = null;
    // 部品が足されたときに呼ぶ(描画ループが止まっていれば回し直してもらう)
    this.onWake = null;
  }

  /** 量の調整: θに比例(motion)、動きを減らす設定なら数個だけ。 */
  n(count) {
    if (this.reduced) return Math.min(3, Math.ceil(count * 0.08));
    return Math.max(1, Math.round(count * (0.2 + 0.8 * this.motion)));
  }

  get busy() {
    return this.items.length > 0;
  }

  push(item) {
    if (this.items.length >= this.limit) this.items.shift();
    item.age = -(item.delay ?? 0);
    this.items.push(item);
    this.onWake?.();
  }

  /** 絵の具のしぶきを、点の周りにいくつか咲かせる。 */
  bloom(x, y, { count = 4, radius = 90, colors = WATER, size = 1 } = {}) {
    for (let i = 0; i < this.n(count); i += 1) {
      const a = rnd(0, Math.PI * 2);
      const d = rnd(0, radius);
      this.push({
        kind: 'splat', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
        sprite: sprites.splat(any(colors), (Math.random() * SPLAT_SHAPES) | 0),
        scale: size * rnd(0.6, 1.25), angle: rnd(0, Math.PI * 2), life: rnd(1.6, 2.4), delay: i * 0.05,
      });
    }
  }

  /** 一点から部品を散らす。kinds: petal / drop / star / glyph。 */
  scatter(x, y, { count = 24, kinds = ['petal', 'drop'], speed = 520, angle = -Math.PI / 2, spread = Math.PI * 2, stars = 'gold', glyphs = [], up = 0 } = {}) {
    for (let i = 0; i < this.n(count); i += 1) {
      const kind = this.pickKind(kinds, glyphs);
      const a = angle + rnd(-spread / 2, spread / 2);
      const v = speed * rnd(0.35, 1);
      this.push(this.make(kind, x, y, Math.cos(a) * v, Math.sin(a) * v - up, stars, glyphs));
    }
  }

  /** 小さな星をいくつか、点の周りで瞬かせる(余白の地のきらきら)。stars は 銀/金/虹。 */
  twinkle(x, y, { count = 3, radius = 16, stars = 'silver' } = {}) {
    for (let i = 0; i < this.n(count); i += 1) {
      const p = this.make('twinkle', x + rnd(-radius, radius), y + rnd(-radius, radius), rnd(-6, 6), rnd(-6, 6), stars, []);
      p.delay = i * 0.09;
      this.push(p);
    }
  }

  /** 花びらを、余白の帯に沿ってふわっと流す。along は帯の向き('x' 横長 / 'y' 縦長)。 */
  drift(x, y, { count = 4, along = 'x' } = {}) {
    for (let i = 0; i < this.n(count); i += 1) {
      const v = rnd(30, 80) * (Math.random() < 0.5 ? -1 : 1);
      const vx = along === 'x' ? v : rnd(-8, 8);
      const vy = along === 'x' ? rnd(-8, 8) : v;
      const p = this.make('float', x, y, vx, vy, 'gold', []);
      p.delay = i * 0.07;
      this.push(p);
    }
  }

  /** 水彩の虹の帯を、余白の帯に沿って筆で引くように描く(x0→x1 の横向き、または y0→y1 の縦向き)。 */
  stripe({ x0, y0, x1, y1, width = 20 }) {
    this.push({ kind: 'stripe', x0, y0, x1, y1, width, life: 2.2 });
  }

  /**
   * 画面の上から降らせる。depth(0〜1)を渡すと、画面の上から高さ depth までに散らして始める —
   * 画面全体にふわっと現れて舞い落ちる(上から入るだけだと数秒では上の方しか降りない)。
   */
  shower(W, { count = 60, kinds = ['petal', 'glyph', 'star'], stars = 'gold', glyphs = [], depth = 0 } = {}) {
    for (let i = 0; i < this.n(count); i += 1) {
      const kind = this.pickKind(kinds, glyphs);
      const y = depth > 0 ? rnd(-120, innerHeight * depth) : rnd(-120, -10);
      const p = this.make(kind, rnd(0, W), y, rnd(-40, 40), rnd(40, 160), stars, glyphs);
      p.delay = rnd(0, 0.8);
      if (y > 0) p.fadeIn = 0.45; // 画面の中で生まれるものは、ぱっと出さずに溶け出させる
      this.push(p);
    }
  }

  /** しおりのリボンを左右の端から投げ入れる。 */
  ribbons(W, H, count = 4) {
    for (let i = 0; i < this.n(count); i += 1) {
      const left = i % 2 === 0;
      const a = left ? rnd(-1.15, -0.55) : Math.PI - rnd(-1.15, -0.55);
      const v = rnd(620, 900);
      this.push({
        kind: 'ribbon', x: left ? -6 : W + 6, y: rnd(H * 0.35, H * 0.75),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravity: 620, air: 1.2,
        color: any(WATER), width: rnd(7, 10), trail: [], phase: rnd(0, 6), life: rnd(2, 2.8), delay: i * 0.08,
      });
    }
  }

  /** 水彩の花火を画面の上半分にいくつか開く。 */
  fireworks(W, H, count = 3, top = 0.1, bottom = 0.5) {
    if (this.reduced) return;
    for (let i = 0; i < this.n(count); i += 1) {
      this.push({
        kind: 'burst', x: rnd(W * 0.15, W * 0.85), y: rnd(H * top, H * bottom),
        color: any(WATER), rays: 14 + ((Math.random() * 6) | 0), radius: rnd(52, 86),
        life: 1.1, delay: i * 0.22,
      });
    }
  }

  pickKind(kinds, glyphs) {
    const k = any(kinds);
    return k === 'glyph' && glyphs.length === 0 ? 'petal' : k;
  }

  make(kind, x, y, vx, vy, stars, glyphs) {
    const base = { kind, x, y, vx, vy, angle: rnd(0, Math.PI * 2), spin: rnd(-4, 4), sway: rnd(1.5, 3.2), phase: rnd(0, 6), scale: rnd(0.75, 1.25) };
    switch (kind) {
      case 'petal':
        return { ...base, sprite: sprites.petal(any(WATER)), gravity: 140, air: 1.6, flutter: 60, life: rnd(2.2, 3.4) };
      case 'drop':
        return { ...base, sprite: sprites.drop(any(WATER)), gravity: 900, air: 0.6, flutter: 0, life: rnd(0.9, 1.5), spin: 0 };
      case 'star':
        return { ...base, sprite: sprites.star(any(STAR_TONES[stars] ?? STAR_TONES.gold)), gravity: 380, air: 1.4, flutter: 18, life: rnd(1.4, 2.2) };
      case 'twinkle':
        return { ...base, sprite: sprites.star(any(STAR_TONES[stars] ?? STAR_TONES.silver)), gravity: 0, air: 3, flutter: 0, life: rnd(1, 1.6), spin: rnd(-1, 1), scale: rnd(0.4, 0.75), pulse: true };
      case 'float':
        return { ...base, sprite: sprites.petal(any(WATER)), gravity: 10, air: 1.1, flutter: 18, life: rnd(2.4, 3.4), scale: rnd(0.55, 0.85) };
      case 'glyph':
        return { ...base, sprite: sprites.glyph(any(glyphs), any(WATER)), gravity: 120, air: 1.7, flutter: 40, life: rnd(2.4, 3.6), spin: rnd(-2, 2), scale: rnd(0.7, 1.1) };
      default:
        return { ...base, sprite: sprites.petal(any(WATER)), gravity: 140, air: 1.6, flutter: 60, life: 2.5 };
    }
  }

  update(dt) {
    const floor = innerHeight + 140;
    for (const p of this.items) {
      p.age += dt;
      if (p.age < 0 || p.kind === 'splat' || p.kind === 'burst' || p.kind === 'stripe') continue;
      const keep = Math.exp(-p.air * dt);
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * dt;
      p.x += p.vx * dt + (p.flutter ? Math.sin(p.age * p.sway + p.phase) * p.flutter * dt : 0);
      p.y += p.vy * dt;
      if (p.spin) p.angle += p.spin * dt;
      if (p.trail) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 16) p.trail.shift();
      }
      if (p.y > floor) p.age = p.life;
    }
    this.items = this.items.filter((p) => p.age < p.life);
  }

  draw() {
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(innerWidth * dpr);
    const h = Math.round(innerHeight * dpr);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.save();
    if (this.avoid) {
      // 本文の枠の中には描かない(外側だけを描ける領域にする)
      const a = this.avoid;
      g.beginPath();
      g.rect(0, 0, w, h);
      g.rect(a.x * dpr, a.y * dpr, a.w * dpr, a.h * dpr);
      g.clip('evenodd');
    }
    for (const p of this.items) {
      if (p.age < 0) continue;
      const t = p.age / p.life;
      const alpha = Math.min(1, p.age / (p.fadeIn ?? 0.12)) * (t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
      if (p.kind === 'burst') {
        this.drawBurst(g, p, t, dpr);
        continue;
      }
      if (p.kind === 'ribbon') {
        this.drawRibbon(g, p, alpha, dpr);
        continue;
      }
      if (p.kind === 'stripe') {
        this.drawStripe(g, p, t, dpr);
        continue;
      }
      let s = p.scale;
      if (p.pulse) s *= Math.min(1, p.age / 0.2) * (0.78 + 0.22 * Math.sin(p.age * 11 + p.phase));
      if (p.kind === 'splat') s *= 1 - (1 - Math.min(1, p.age / 0.22)) ** 3; // ぱっと咲く
      const half = p.sprite.size / 2;
      const c = Math.cos(p.angle) * s * dpr;
      const si = Math.sin(p.angle) * s * dpr;
      g.globalAlpha = p.kind === 'splat' ? alpha * 0.8 : alpha;
      g.setTransform(c, si, -si, c, p.x * dpr, p.y * dpr);
      g.drawImage(p.sprite.cv, -half, -half, p.sprite.size, p.sprite.size);
    }
    g.restore();
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawStripe(g, p, t, dpr) {
    const reveal = Math.min(1, t / 0.3);
    const fade = t < 0.6 ? 0.85 : 0.85 * (1 - (t - 0.6) / 0.4);
    const horizontal = Math.abs(p.x1 - p.x0) >= Math.abs(p.y1 - p.y0);
    const band = p.width / WATER.length;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = fade;
    g.lineCap = 'round';
    WATER.forEach((color, i) => {
      const off = (i - (WATER.length - 1) / 2) * band;
      const ox = horizontal ? 0 : off;
      const oy = horizontal ? off : 0;
      g.strokeStyle = color;
      g.lineWidth = band + 0.8;
      g.beginPath();
      g.moveTo(p.x0 + ox, p.y0 + oy);
      g.lineTo(p.x0 + (p.x1 - p.x0) * reveal + ox, p.y0 + (p.y1 - p.y0) * reveal + oy);
      g.stroke();
    });
  }

  drawBurst(g, p, t, dpr) {
    const open = 1 - (1 - Math.min(1, t / 0.45)) ** 3;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = t < 0.6 ? 0.9 : 0.9 * (1 - (t - 0.6) / 0.4);
    g.lineCap = 'round';
    for (let i = 0; i < p.rays; i += 1) {
      const a = (i / p.rays) * Math.PI * 2 + p.x * 0.01;
      const r0 = p.radius * (0.25 + 0.55 * open);
      const r1 = p.radius * (0.45 + 0.6 * open);
      g.strokeStyle = i % 3 === 0 ? '#fff7d6' : p.color;
      g.lineWidth = 5 * (1 - t * 0.6);
      g.beginPath();
      g.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0);
      g.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1);
      g.stroke();
      if (open > 0.8) {
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x + Math.cos(a) * (r1 + 7), p.y + Math.sin(a) * (r1 + 7), 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  drawRibbon(g, p, alpha, dpr) {
    if (p.trail.length < 3) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = alpha;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const wave = (q, i) => Math.sin(i * 0.9 + p.age * 10 + p.phase) * 4;
    g.beginPath();
    p.trail.forEach((q, i) => (i ? g.lineTo(q.x, q.y + wave(q, i)) : g.moveTo(q.x, q.y + wave(q, i))));
    g.strokeStyle = INK;
    g.lineWidth = p.width + 2.6;
    g.stroke();
    g.strokeStyle = p.color;
    g.lineWidth = p.width;
    g.stroke();
  }
}
