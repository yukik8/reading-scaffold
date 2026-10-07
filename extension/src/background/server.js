// うんちくサーバ(Vercel)との通信。送るのは pickTerms で選んだ単語の候補と、インストールごとの
// ランダムな ID(回数制限のため)だけ。本の本文・書名・URL は送らない。本人の同意が無ければ呼ばない。

import { SERVER } from '../shared/config.js';
import { acceptTrivia } from './ai.js';

const INSTALL_KEY = 'install_id';

/** インストールごとのランダムな ID(サーバの回数制限にだけ使う。個人とは結びつかない)。 */
async function installId() {
  const got = await chrome.storage.local.get(INSTALL_KEY);
  if (typeof got[INSTALL_KEY] === 'string') return got[INSTALL_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_KEY]: id });
  return id;
}

/** 全消去のときに ID も作り直す(以前の利用と結びつかないように)。 */
export async function resetInstallId() {
  await chrome.storage.local.remove(INSTALL_KEY);
}

/**
 * 単語の候補からうんちくを1つ。話せることが無い・サーバに届かないときは null。
 * サーバが選んだ言葉が候補に無い・擬音らしい・言い切れないものは捨てる。
 */
export async function serverTrivia(terms) {
  const list = (terms ?? [])
    .map((t) => String(t).trim())
    .filter((t) => t && t.length <= SERVER.maxTermChars)
    .slice(0, SERVER.maxTerms);
  if (list.length === 0) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SERVER.timeoutMs);
  try {
    const r = await fetch(`${SERVER.base}/trivia`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rs-install': await installId() },
      body: JSON.stringify({ terms: list }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const data = await r.json(); // 本文の受信もタイムアウトの内側で待つ
    if (!data?.ok) return null;
    const trivia = acceptTrivia(data.trivia);
    return trivia && list.includes(trivia.term) ? trivia : null;
  } catch {
    return null; // 届かない・タイムアウト。うんちくは出さないだけ
  } finally {
    clearTimeout(timer);
  }
}
