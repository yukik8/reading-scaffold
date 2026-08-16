// タペリング制御器とセッションの設定。ドッグフーディング中は手で触る前提で1ファイルに集める。

// θ = ヒント・演出の頻度(本文1,000語あたりの表示回数)。
// 離散段階がそのままLevel 0〜5。目標値は常に配列の末尾(0)であり、これは変えない。
export const THETA_BY_LEVEL = [8, 5, 3, 1.5, 0.5, 0];

export const MAX_LEVEL = THETA_BY_LEVEL.length - 1;

export const CONTROLLER = {
  // W1は計測だけ。自動昇降はW3で有効にする。
  // W1でLevelを動かすと、ヒントを一度も出していないのにLevelだけ上がり、
  // 「補助が減った」という記録が実態と合わなくなる。
  enabled: false,

  // 成功がK回続いたらLevelを1段上げる(θを下げる)。本人には通知しない。
  successStreakToPromote: 3,
  // 失敗がL回続いたらLevelを1段下げる(θを上げる)。本人には通知しない。
  failStreakToDemote: 2,
  // 不変条件: 1日に動かせるのは1段まで。
  maxLevelStepsPerDay: 1,
  // ホメオスタットモード: Level 5到達後、補助なし読書時間の4週移動平均が
  // このしきい値を超えて落ちたときだけ一時的にθを再展開する。
  homeostatDropRatio: 0.5,
  homeostatWindowWeeks: 4,
};

export const SESSION = {
  // 読書時間の操作的定義: 本文段落が可視、かつ直近このミリ秒以内に
  // スクロールまたは操作がある時間。
  activityWindowMs: 30_000,

  // dwellの積算粒度。設計ドキュメントは30秒だが20秒に落としている。
  // MV3のService Workerはメッセージが30秒途切れると停止しうるため、
  // 30秒ちょうどの間隔だと停止と再起動の境界に当たる。20秒なら鼓動が絶えない。
  dwellTickMs: 20_000,

  // 無操作・未復帰でセッションを自動終了するまでの時間。
  idleTimeoutMs: 3 * 60_000,

  // 本文検出の合格ライン。これを下回るページは「計測のみ」モードにする。
  minParagraphs: 3,
  minWords: 200,
};

// 常時演出(ambient): 読んでいる間、θに比例した密度で小さな星を漂わせる。
// ヒント(離散的な報酬)と別系統の「地」の演出。θに比例するので、
// Level 0で最も濃く、Levelが上がると自然に薄まり、Level 5(θ=0)で消える。
export const AMBIENT = {
  enabled: true,
  tickMs: 1_500,
  // 1 tickあたりの星の期待数 = (θ/θmax)² × maxStarsPerTick
  // 2乗カーブにしているのは、Level 0では惜しみなく(約4粒/1.5秒)、
  // 中間Levelでは控えめに、卒業間際ではほぼ無音にするため。
  // 線形だとLevel 4(θ=0.5)でもまだ目についてしまう。
  maxStarsPerTick: 4,
};

// success := read_ms >= 5分 かつ escapes <= 1
export const SUCCESS = {
  minReadMs: 5 * 60_000,
  maxEscapes: 1,
};

export const MIRROR = {
  // 週次グラフに出す週数。
  weeks: 8,
  // 補助なし読書時間の定義: ヒントも演出も1回も出さなかったセッションのread_msの合計。
  // 設計ドキュメントは「Level 4以上のセッション」としているが、これは代理指標で、
  // Level 4(θ=0.5)でもヒントは出る。実際の表示回数で数えるほうが定義として正確で、
  // ヒントが未実装のW1でも意味のある数字になる。
  unassistedRequiresZeroHints: true,
};
