// FSRS-5(Free Spaced Repetition Scheduler)。記憶の層の間隔を決める。
//
// Anki が 2023 年から採用している、個人の忘却曲線を復習の記録から当てはめるスケジューラ。
// カードごとに 難しさ D(1〜10)と 安定度 S(記憶が 90% 残る日数)を持ち、
// 想起の成否で更新する。思い出せる確率 R は S と経過日数から決まる。
//
//   R(t, S) = (1 + FACTOR·t/S)^DECAY          FACTOR = 19/81, DECAY = −0.5
//   次の復習は R が desiredRetention まで落ちる日: interval = S/FACTOR · (r^(1/DECAY) − 1)
//   (r = 0.9 のとき interval = S。S は「90% 残る日数」そのもの)
//
// 重み w は FSRS-5 の既定値(2万人超の復習記録で最適化されたもの)。本人の記録で最適化する
// ことは数百回の想起がたまってから(最適化器は入れていない。recalls が材料になる)。
// 参照: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
//
// 評価 G: 1=思い出せなかった(Again) 2=おぼろげ(Hard) 3=はっきり(Good) 4=簡単(Easy)。
// この製品は 1〜3 しか使わない(4 は間隔を伸ばしすぎる。言葉で褒めないので「簡単」も聞かない)。

export const FSRS_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY = 86_400_000;

export const Grade = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 経過日数 t・安定度 S のとき思い出せる確率。 */
export function retrievability(elapsedDays, S) {
  if (!(S > 0)) return 0;
  return (1 + (FACTOR * Math.max(0, elapsedDays)) / S) ** DECAY;
}

/** 保持率 r まで落ちるまでの日数(1 日以上・整数)。 */
export function intervalDays(S, desiredRetention = 0.9, maxDays = 365) {
  const days = (S / FACTOR) * (desiredRetention ** (1 / DECAY) - 1);
  return clamp(Math.round(days), 1, maxDays);
}

function initStability(G, w = FSRS_W) {
  return Math.max(w[G - 1], 0.1);
}

function initDifficulty(G, w = FSRS_W) {
  return clamp(w[4] - Math.exp(w[5] * (G - 1)) + 1, 1, 10);
}

function nextDifficulty(D, G, w = FSRS_W) {
  const delta = -w[6] * (G - 3);
  const damped = D + (delta * (10 - D)) / 9; // 線形の減衰: 10 に近いほど動きにくい
  const reverted = w[7] * initDifficulty(4, w) + (1 - w[7]) * damped; // 平均への回帰
  return clamp(reverted, 1, 10);
}

function nextRecallStability(D, S, R, G, w = FSRS_W) {
  const hard = G === Grade.HARD ? w[15] : 1;
  const easy = G === Grade.EASY ? w[16] : 1;
  return S * (1 + Math.exp(w[8]) * (11 - D) * S ** -w[9] * (Math.exp(w[10] * (1 - R)) - 1) * hard * easy);
}

function nextForgetStability(D, S, R, w = FSRS_W) {
  const s = w[11] * D ** -w[12] * ((S + 1) ** w[13] - 1) * Math.exp(w[14] * (1 - R));
  return Math.min(s, S); // 忘れて安定度が上がることはない
}

function nextShortTermStability(S, G, w = FSRS_W) {
  return S * Math.exp(w[17] * (G - 3 + w[18]));
}

/**
 * 新しいカード。最初の評価(読んだ直後に残した = GOOD、クイズは正誤)から D・S を置く。
 * @returns {{ D, S, reps, lapses, last_review, due }}
 */
export function initCard(G, now = Date.now(), { desiredRetention = 0.9, w = FSRS_W } = {}) {
  const S = initStability(G, w);
  const D = initDifficulty(G, w);
  return {
    D: round(D),
    S: round(S),
    reps: 1,
    lapses: G === Grade.AGAIN ? 1 : 0,
    last_review: now,
    due: now + intervalDays(S, desiredRetention) * DAY,
  };
}

/**
 * 復習。経過が 1 日未満なら同日の復習(短期の式)、それ以上なら忘却曲線で更新する。
 * @returns {{ card, elapsed_days, R }} 更新後のカードと、復習時点の経過日数・思い出せる確率
 */
export function reviewCard(card, G, now = Date.now(), { desiredRetention = 0.9, w = FSRS_W } = {}) {
  const elapsed = Math.max(0, (now - card.last_review) / DAY);
  const R = retrievability(elapsed, card.S);
  const D = nextDifficulty(card.D, G, w);
  let S;
  if (elapsed < 1) S = nextShortTermStability(card.S, G, w);
  else if (G === Grade.AGAIN) S = nextForgetStability(card.D, card.S, R, w);
  else S = nextRecallStability(card.D, card.S, R, G, w);
  S = Math.max(S, 0.1);
  return {
    card: {
      D: round(D),
      S: round(S),
      reps: (card.reps ?? 0) + 1,
      lapses: (card.lapses ?? 0) + (G === Grade.AGAIN ? 1 : 0),
      last_review: now,
      due: now + intervalDays(S, desiredRetention) * DAY,
    },
    elapsed_days: round(elapsed),
    R: round(R),
  };
}

const round = (v) => Math.round(v * 10_000) / 10_000;
