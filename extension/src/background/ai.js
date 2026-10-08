// Chrome内蔵AI(Gemini Nano / Prompt API)のラッパー。
//
// 本文がデバイスの外に出ない生成基盤。Play ブックスの本文を扱うのはここだけ
// (Google Play の規約で、購入した本の送信・再配布は禁止)。
// 利用できなければnullを返し、呼び手は何も出さない(うんちくだけは、同意があれば
// pickTerms で選んだ単語だけをサーバへ送る — background/server.js)。
// API: グローバルの LanguageModel。availability() → 'unavailable' | 'downloadable' |
// 'downloading' | 'available'。構造化出力は responseConstraint(JSON Schema)。

const TIMEOUT_MS = 20_000;

// Prompt APIは出力品質と安全性の担保のため入出力言語の宣言を求める(未指定だと警告)。
// 読者が触れるのは日本語と英語の本文なので両方を宣言する(対応: de,en,es,fr,ja)。
const LANGS = ['ja', 'en'];
const CREATE_OPTS = {
  expectedInputs: [{ type: 'text', languages: LANGS }],
  expectedOutputs: [{ type: 'text', languages: LANGS }],
};

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('nano timeout')), ms)),
  ]);
}

/** 'no-api'(古いChrome等) または LanguageModel.availability() の値。 */
export async function nanoAvailability() {
  try {
    if (typeof LanguageModel === 'undefined') return 'no-api';
    return await LanguageModel.availability(CREATE_OPTS);
  } catch {
    return 'no-api';
  }
}

// モデルDLは数GB。'downloadable'のときは裏で1度だけDLを起こし、完了(=available)
// までは静かにnullを返す。DLの起動には初回ユーザージェスチャーが要ることがあるため、
// 確実な起動はダッシュボードの「内蔵AIを準備」ボタン(ページ文脈)から行う。
let downloadKicked = false;
function kickDownload() {
  if (downloadKicked) return;
  downloadKicked = true;
  (async () => {
    try {
      const s = await LanguageModel.create({
        ...CREATE_OPTS,
        monitor(m) {
          m.addEventListener('downloadprogress', () => {});
        },
      });
      s.destroy();
    } catch {
      downloadKicked = false; // 失敗したら次回また試せるように
    }
  })();
}

async function promptJson(systemPrompt, userPrompt, schema) {
  const availability = await nanoAvailability();
  if (availability === 'no-api' || availability === 'unavailable') return null;
  if (availability !== 'available') {
    // まだ使えない(downloadable/downloading)。DLを起こしておき、今回は諦める。
    kickDownload();
    return null;
  }
  let session = null;
  try {
    session = await withTimeout(LanguageModel.create(CREATE_OPTS));
    const raw = await withTimeout(
      session.prompt(`${systemPrompt}\n\n${userPrompt}`, { responseConstraint: schema }),
    );
    return JSON.parse(raw);
  } catch {
    return null;
  } finally {
    try {
      session?.destroy();
    } catch {
      /* 破棄失敗は無視 */
    }
  }
}

/**
 * 診断: 実機で内蔵AIがどの状態か。ダッシュボードのdev欄から呼ぶ(ページ文脈で
 * 実行するとユーザージェスチャーが保たれ、DL起動が確実になる)。
 * create()も試み、進捗・エラーメッセージまで返す。
 */
/**
 * 診断の結果を、本人に見せる一文にする(ダッシュボードとオンボーディングで同じ言葉を使う)。
 * 2026-10-08 に分かったこと: 'unavailable' のいちばん多い原因は空きディスク不足(22GB 未満)で、
 * モデルが端末にあっても Chrome は登録を外す。空けて再起動すれば戻る。
 */
export function describeNano(d) {
  if (!d.hasApi) {
    return (
      'このChromeには内蔵AI(Prompt API)がありません。Chrome 138以降に更新してください。' +
      '内蔵AIが無いとクイズと問いへの答えは出ません(演出と計測は動きます)。'
    );
  }
  if (d.availability === 'unavailable') {
    return (
      'この端末ではいま内蔵AIを使えません。いちばん多い原因は空きディスク不足です(22GB以上が必要)。' +
      '空きを作ってから Chrome を完全に終了して開き直し、もう一度押してください。' +
      'それでも使えなければ、対応するGPUかメモリが足りない端末です。くまのうんちくは「言葉を調べるサーバ」をオンにすると出ます。'
    );
  }
  if (d.created && d.sample) {
    return '内蔵AIの準備ができました。クイズと問いへの答えは、この端末の中で作られます。';
  }
  if (/space|disk|storage/i.test(d.createError ?? '')) {
    return (
      'モデルのダウンロードに空き容量が足りません(22GB以上必要)。空きを作ってから、もう一度押してください。' +
      'それまではクイズと問いへの答えは出ません。'
    );
  }
  if (d.createError || d.promptError) {
    return `準備中に問題: ${d.createError ?? d.promptError}` + (d.downloadProgress >= 0 ? `(DL ${d.downloadProgress}%)` : '');
  }
  return (
    `状態: ${d.availability}` +
    (d.downloadProgress >= 0 ? `・DL ${d.downloadProgress}%` : '') +
    '。ダウンロード中の場合は、終わってからもう一度押してください。'
  );
}

export async function nanoDiagnostics() {
  const out = { hasApi: typeof LanguageModel !== 'undefined' };
  if (!out.hasApi) return out;
  try {
    out.availability = await LanguageModel.availability(CREATE_OPTS);
  } catch (e) {
    out.availability = 'error';
    out.availabilityError = String(e?.message ?? e);
    return out;
  }
  if (out.availability === 'unavailable') return out;
  let progress = -1;
  try {
    const session = await withTimeout(
      LanguageModel.create({
        ...CREATE_OPTS,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            progress = Math.round((e.loaded ?? 0) * 100);
          });
        },
      }),
      120_000, // DLは長い。診断は待つ
    );
    out.downloadProgress = progress;
    try {
      out.sample = String(
        await withTimeout(session.prompt('日本語で「準備完了」とだけ返して'), 15_000),
      ).slice(0, 60);
      out.created = true;
    } catch (e) {
      out.promptError = String(e?.message ?? e);
    }
    session.destroy();
  } catch (e) {
    out.downloadProgress = progress;
    out.createError = String(e?.message ?? e);
  }
  return out;
}

const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    answer_index: { type: 'integer', minimum: 0, maximum: 2 },
  },
  required: ['question', 'choices', 'answer_index'],
  additionalProperties: false,
};

/**
 * 段落から3択クイズを1問。生成できなければnull(呼び手は何も出さない)。
 * 言葉の原則: 出題のみ。解説・褒め・アドバイスは書かせない。
 */
export async function nanoQuiz(paragraphText, focusText = '') {
  const sys =
    'あなたは読解クイズの出題者。渡された段落の内容だけから、理解を確かめる3択クイズを1問作る。' +
    '本文と同じ言語で出題する。解説・褒め言葉・アドバイスは一切書かない。';
  // 焦点(ページで最も難しい段落)があれば、そこの理解を確かめる問いにする
  const focus = focusText && paragraphText.includes(focusText) ? `\n特に次の箇所の理解を確かめる問いにする:\n${focusText}\n` : '';
  const user = `次の段落から3択クイズを1問。正解は段落を読んでいれば分かるものにする。${focus}\n---\n${paragraphText}`;
  return acceptQuiz(await promptJson(sys, user, QUIZ_SCHEMA));
}

/** クイズの形を確かめて整える(問題文・選択肢3つ・正解の添字 0〜2)。合わなければ null。 */
export function acceptQuiz(out) {
  if (!out || typeof out.question !== 'string' || !out.question.trim()) return null;
  if (!Array.isArray(out.choices) || out.choices.length !== 3) return null;
  const choices = out.choices.map((c) => String(c ?? '').trim());
  if (choices.some((c) => !c)) return null;
  const idx = Number(out.answer_index);
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) return null;
  return {
    question: out.question.trim().slice(0, 300),
    choices: choices.map((c) => c.slice(0, 120)),
    answer_index: idx,
  };
}

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    source_index: { type: 'integer' },
  },
  required: ['answer', 'source_index'],
  additionalProperties: false,
};

/**
 * 読書中の質問への短い回答。「照らす、答えない」:
 * 2〜3文まで・先回りの要約をしない・根拠段落の番号を返させて光で指す。
 * context = [{ i, text }](読了済み段落のみ。未読は渡さない=ネタバレ禁止は呼び手が守る)
 */
export async function nanoAnswer({ question, selection, context }) {
  const sys =
    '読書中の質問に答えるアシスタント。必ず2〜3文で短く答える。本文の要約や先の内容の紹介はしない。' +
    '根拠が渡された段落にあれば、その番号をsource_indexで返す(なければ-1)。本文と同じ言語で答える。';
  const ctx = context.map((c) => `[${c.i}] ${c.text}`).join('\n\n');
  const user = `${selection ? `読者が選択している本文: ${selection}\n\n` : ''}質問: ${question}\n\n読了済みの段落:\n${ctx}`;
  const out = await promptJson(sys, user, ANSWER_SCHEMA);
  if (!out || typeof out.answer !== 'string' || !out.answer.trim()) return null;
  return {
    answer: out.answer.trim(),
    source_index: Number.isInteger(out.source_index) ? out.source_index : -1,
  };
}

const TRIVIA_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    term: { type: 'string' },
    kind: { type: 'string', enum: ['word', 'reading', 'fact'] },
    sure: { type: 'boolean' },
  },
  required: ['text', 'term', 'kind', 'sure'],
  additionalProperties: false,
};

/**
 * くまのうんちくの指示(端末内の Nano 用。本文から話す)。
 * サーバ(main.py)は本文を受け取らず単語の候補だけから話すので、指示は別だが禁止事項は揃えておく。
 * 2026-10-07: 楽長の口ずさみ「トォテテ テテテイ」に意味をでっち上げたので、擬音・口ずさみ・名前・造語を禁止し、
 * 辞書・事典で確かめられることだけに絞った。
 */
export const TRIVIA_SYSTEM =
  'あなたは読書アプリのマスコット「くま」。読者がさっき読んだ本文から、「へぇ」となるうんちくを1つだけ話す。' +
  '話題にしてよいのは次のどちらかだけ: (1)本文に出てきた、国語辞典に載っている言葉のうち、今では見慣れない言葉・古い言い回し・難しい漢字の意味や読み、' +
  '(2)本文に出てきた実在の物・場所・習慣について、百科事典で確かめられる事実。' +
  '次のものは絶対に話題にしない: 擬音語・擬態語・鳴き声、歌やメロディーの口ずさみ(カタカナの音の並びなど)、人や動物の名前、作者の造語、' +
  '本文の文脈から推測しないと意味が分からない言葉。辞書や事典で確かめられる意味でなければ、推測で意味を言わない。' +
  '少しでも自信がなければ sure を false にし、text を空文字にする。黙るのは失敗ではない。' +
  '本文の先の展開・結末・登場人物のその後には触れない。本文の要約・感想・教訓・読者を褒める言葉・アドバイスは書かない。' +
  'くまの口調でやさしく短く、1〜2文・全体で60字以内(例:「〜なんだって!」「〜らしいよ」)。' +
  'term には話題にした本文中の言葉をそのまま入れる(なければ空文字)。' +
  'kind は word(言葉の意味)・reading(漢字の読み)・fact(事実)のどれか。sure は辞書・事典で確かめられると言い切れるときだけ true。';

/**
 * 擬音や口ずさみらしい言葉(カタカナ/ひらがなだけで、同じ音や2音の繰り返し・空白を含むか、「っ」で終わる)。
 * 「トォテテ テテテイ」「ボーボー」「がぶがぶ」「ぱたっ」ははじき、「セロ」「ヴァイオリン」「キャベツ」は通す。
 */
export function looksLikeSound(term) {
  const t = String(term ?? '').trim();
  if (!t || !/^[\u3040-\u30ff\u30fc\s\u3000・]+$/.test(t)) return false;
  return /(.)\1/.test(t) || /(..)\1/.test(t) || /\s/.test(t) || /[っッ]$/.test(t);
}

/** うんちくの出力を検める。言い切れないもの・擬音らしいもの・長すぎるものは捨てる(null)。 */
export function acceptTrivia(out) {
  const text = typeof out?.text === 'string' ? out.text.trim() : '';
  const term = typeof out?.term === 'string' ? out.term.trim() : '';
  if (!text || text.length > 90 || out?.sure !== true) return null;
  if (looksLikeSound(term)) return null;
  return { text, term: term.slice(0, 20) };
}

/** 読み終えたページの本文から、くまのうんちくを1つ。話せることが無ければ null。 */
export async function nanoTrivia(text) {
  return acceptTrivia(await promptJson(TRIVIA_SYSTEM, `さっき読んだ本文:\n---\n${text}`, TRIVIA_SCHEMA));
}

// ---- うんちくの単語の候補(サーバへ送るのはこれだけ) ---------------------------------

// ありふれていて、うんちくにならない熟語(候補から外す)
const COMMON = new Set(
  (
    '自分 今日 明日 昨日 時間 一人 二人 本当 先生 気持 一緒 仕事 人間 世界 言葉 何度 毎日 今度 大丈夫 ' +
    '女性 男性 子供 部屋 場所 最後 最初 結局 少年 少女 自然 必要 問題 大事 一番 一度 全部 以上 以外 ' +
    '無理 意味 存在 状態 理由 様子 相手 会社 学校 電話 家族 友達 両親 母親 父親 今夜 今朝 午前 午後 ' +
    '一日 毎晩 何事 何人 一方 他人 手紙 時代 生活 自身 感情 気分 気配 表情 返事 途中 前後 左右 上下 ' +
    '大人 東京 日本 外国 世間 自宅 本人 誰か 一体 全然 実際 普通 他人事 心配 安心 失礼 用事 準備'
  ).split(' '),
);
const NUMERAL_ONLY = /^[一二三四五六七八九十百千万億兆〇零半数]+$/;

/**
 * 読み終えたページの本文から、うんちくの種になりそうな単語を数語だけ選ぶ(端末内で完結)。
 * サーバへ送るのはこの単語の並びだけ — 文として読めず、本の中身の写しにならない量に留める。
 * 候補: 漢字の熟語(2〜6字)・カタカナ語(3字以上。擬音らしいものは除く)・長めの英単語(小文字始まり)。
 * 見慣れなさそうなもの(字数が多い・この範囲に1回だけ出る)を優先する。名前かどうかは
 * 端末では分からないので、サーバ側の指示で避ける。
 */
export function pickTerms(text, { max = 8, maxChars = 16 } = {}) {
  const src = String(text ?? '');
  const count = new Map();
  const add = (w, kind) => {
    if (!w || w.length > maxChars) return;
    const c = count.get(w);
    if (c) c.n += 1;
    else count.set(w, { w, kind, n: 1 });
  };
  for (const m of src.matchAll(/[\u4e00-\u9fff々〆]+/g)) {
    const w = m[0].replace(/^第[一二三四五六七八九十百千]+/, ''); // 「第六交響曲」→「交響曲」
    if (w.length >= 2 && w.length <= 6 && !COMMON.has(w) && !NUMERAL_ONLY.test(w)) add(w, 'kanji');
  }
  for (const m of src.matchAll(/[\u30a1-\u30faー]+/g)) {
    const w = m[0];
    if (w.length >= 3 && !looksLikeSound(w)) add(w, 'kana');
  }
  for (const m of src.matchAll(/(?<![A-Za-z])[a-z][a-z'-]{7,}(?![A-Za-z])/g)) add(m[0], 'latin');

  const score = (c) => c.w.length * 2 + (c.n === 1 ? 2 : 0) - (c.n > 3 ? 3 : 0);
  const ranked = [...count.values()].sort((a, b) => score(b) - score(a));
  // 漢字・カタカナ・英語が偏らないように、種類ごとの上限をかけて取る
  const cap = { kanji: 5, kana: 3, latin: 3 };
  const out = [];
  for (const c of ranked) {
    if (out.length >= max) break;
    if (cap[c.kind] <= 0) continue;
    cap[c.kind] -= 1;
    out.push(c.w);
  }
  return out;
}
