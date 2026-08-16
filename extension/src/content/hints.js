// ヒントの文言。
//
// 言葉の原則(2026-08-16確定):
//   - 言葉で褒めない・言葉で教えない。教訓の言語化は禁止
//   - 出してよい言葉は「事実」だけ(進捗%・経過分)
//   - 報酬・嬉しさは言葉ではなく雰囲気(きらきら・間)で伝える
//   - 「照らす、答えない」の演出版
//
// ctx: { pct: 読了率%, min: このセッションの読書分数, cjk: 本文がCJK主体か }

export const CANNED_HINTS = [
  { id: 'fact-pct', text: (ctx) => `${ctx.pct}%` },
  { id: 'fact-min', text: (ctx) => (ctx.cjk ? `${ctx.min}分` : `${ctx.min} min`) },
];

export function pickHint(ctx) {
  const t = CANNED_HINTS[Math.floor(Math.random() * CANNED_HINTS.length)];
  return { hint_id: t.id, text: t.text(ctx) };
}
