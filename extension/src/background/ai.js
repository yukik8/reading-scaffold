// Chrome内蔵AI(Gemini Nano / Prompt API)のラッパー。
//
// 本文がデバイスの外に出ない生成基盤(docs/ask-and-nano-design.md §4)。
// 利用できなければnullを返し、呼び手がフォールバック(ローカルサーバ or 出さない)を選ぶ。
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
 * 段落から3択クイズを1問。生成できなければnull(呼び手がサーバへフォールバック)。
 * 言葉の原則: 出題のみ。解説・褒め・アドバイスは書かせない。
 */
export async function nanoQuiz(paragraphText) {
  const sys =
    'あなたは読解クイズの出題者。渡された段落の内容だけから、理解を確かめる3択クイズを1問作る。' +
    '本文と同じ言語で出題する。解説・褒め言葉・アドバイスは一切書かない。';
  const user = `次の段落から3択クイズを1問。正解は段落を読んでいれば分かるものにする。\n---\n${paragraphText}`;
  const out = await promptJson(sys, user, QUIZ_SCHEMA);
  if (!out || typeof out.question !== 'string' || !Array.isArray(out.choices)) return null;
  if (out.choices.length !== 3) return null;
  const idx = Number(out.answer_index);
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) return null;
  return { question: out.question, choices: out.choices.map(String), answer_index: idx };
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
 * くまのうんちくの指示(Nano とサーバで同じ内容。サーバの main.py も一緒に直す)。
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
