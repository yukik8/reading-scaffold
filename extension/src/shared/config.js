// タペリング制御器とセッションの設定。ドッグフーディング中は手で触る前提で1ファイルに集める。

// θ = ヒント・演出の頻度(本文1,000語あたりの表示回数)。[0, THETA_MAX]の連続値。
// 2026-08-16改訂: Level 5段階は廃止。段差は本人が気づく。
// Weber-Fechnerの法則(気づける最小変化=現在量の約10〜20%)に基づき、
// JND未満の乗算的漸減にする。目標値は常に0で、これは変えない。
export const THETA_MAX = 8;

export const CONTROLLER = {
  // W1-W2は計測と演出だけ。自動漸減はW3で有効にする。
  enabled: false,

  // 成功セッションごとに θ ← θ×(1−alpha)。10%はJND未満(本人に通知しない)
  alpha: 0.1,
  // 失敗がこれだけ続いたら θ ← θ×(1+beta)。戻すときは大きめ(ヒステリシス)
  failStreakToRaise: 2,
  beta: 0.3,
  // 不変条件: 1日の総変化は±この率まで(急激な変化の禁止)
  maxDailyChangeRatio: 0.15,
  // 乗算は0に到達しないため、これ未満で0へスナップ(卒業)
  graduateBelow: 0.3,
  // ホメオスタットモード: 卒業後、補助なし読書時間の4週移動平均が
  // このしきい値を超えて落ちたときだけ一時的にθを再展開する。
  homeostatDropRatio: 0.5,
  homeostatWindowWeeks: 4,
};

// セッションごとの実効θ = θ × (1±この幅の乱数)。
// 日々±10%揺れる中を成功あたり10%下るので、下降トレンドがノイズに埋もれる(迷彩)。
export const THETA_NOISE = 0.1;

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
  // 1 tickあたりの「キラッ」発生確率 = (θ/θmax)² × maxClusterChance。
  // 均等に湧かせず、余白の一点に星が固まって瞬く(1回3〜7粒)。
  // 2乗カーブ: Level 0で約4.3秒に1回、中間は稀に、卒業間際はほぼ無音。
  maxClusterChance: 0.35,
};

// 演出のレア度。ヒント発火時にロールする(=頻度はθ配下のまま、大きさだけ可変)。
// ドーパミンは報酬の予測誤差で出るので、頻度の乱数に加えて大きさも予測不能にする。
// ルール: 予告(foreshadow)はレア以上が確定したときだけ出す。
// ニアミス(予告→ハズレ)は悔しさ駆動の技法なので構造的に作らない。
export const EFFECT_TIERS = {
  epic: { p: 0.025 }, // 激レア: 金の雨(濃)+縁光。約1/40
  rare: { p: 0.12 }, // レア: 金の雨。約1/8
};

// クイズ(理解連動Micro Content)。ローカルのFastAPIサーバ経由でLLMが出題する。
// ヒント枠の一部がクイズに化ける形なので頻度はθ配下のまま。1セッション1問まで。
// サーバが落ちていれば静かに何も出さない(読書を壊さない)。
export const QUIZ = {
  enabled: true,
  // ヒント枠がクイズに化ける確率
  p: 0.3,
  // 読了済み段落がこれ未満なら出さない(素材不足)
  minParagraphsRead: 3,
  endpoint: 'http://127.0.0.1:8787/quiz',
  timeoutMs: 12_000,
  // 正解時の演出の強さはθに連動(低Levelほど盛大に、卒業に向けて漸減):
  //   θ >= jackpotMinTheta → 大当たり(予告→縁光→特濃の雨+三波)
  //   θ >= rainMinTheta   → 金の雨
  //   それ未満            → 星の二波のみ
  jackpotMinTheta: 5, // Level 0-1
  rainMinTheta: 3, // Level 2
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
