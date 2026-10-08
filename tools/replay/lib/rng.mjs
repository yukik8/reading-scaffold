// 再現できる乱数(mulberry32)。同じ seed なら同じ読者・同じ軌跡になる。

export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** [lo, hi) の一様乱数 */
    uniform: (lo = 0, hi = 1) => lo + (hi - lo) * next(),
    /** 標準正規乱数(Box–Muller) */
    normal: () => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    bernoulli: (p) => next() < p,
  };
}
