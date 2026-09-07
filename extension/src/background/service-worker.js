// MV3 Service Worker。
// リスナー登録はすべてこのファイルのトップレベルで同期的に行う(MV3の再起動要件)。
// tabs系のハンドラはsession.jsの中で必ずセッションの存在を確認し、
// セッションが無いときは何も読まず何も書かずに戻る — 「計測はセッション中のみ」。

import { Msg, EventType } from '../shared/events.js';
import { QUIZ, GOALS, DIAGNOSIS } from '../shared/config.js';
import { nanoQuiz, nanoAnswer } from './ai.js';
import {
  startSession,
  endSession,
  getCurrent,
  onReport,
  onTabActivated,
  onWindowFocusChanged,
  onTabRemoved,
  onTabUpdated,
  onWatchdog,
  setTheta,
  WATCHDOG_ALARM,
} from './session.js';
import { buildMirror } from './mirror.js';
import { buildLibrary } from './library.js';
import {
  wipeAll,
  getState,
  putState,
  getAllSessions,
  sha256Hex,
  getQuizByHash,
  addQuiz,
  addQuestion,
  appendEvent,
} from './store.js';
import { getCurrent as getCurrentSession } from './session.js';

// 新規インストール時だけオンボーディング(診断+目標選択)を開く。更新では開かない。
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  onTabActivated(activeInfo);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  onWindowFocusChanged(windowId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  onTabRemoved(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  onTabUpdated(tabId, changeInfo);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) onWatchdog();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case Msg.START_SESSION: {
        const session = await startSession(msg.tabId ?? sender.tab?.id);
        sendResponse({ ok: true, session });
        break;
      }
      case Msg.END_SESSION: {
        const ended = await endSession(msg.reason);
        sendResponse({ ok: true, session: ended });
        break;
      }
      case Msg.REPORT:
        await onReport(msg.event, msg.payload ?? {}, sender);
        sendResponse({ ok: true });
        break;

      case Msg.GET_STATUS:
        sendResponse({ ok: true, session: await getCurrent(), state: await getState() });
        break;

      case Msg.GET_LIBRARY:
        sendResponse({ ok: true, library: await buildLibrary() });
        break;

      case Msg.SET_THETA:
        sendResponse({ ok: true, ...(await setTheta(msg.theta)) });
        break;

      case Msg.COMPLETE_ONBOARDING: {
        // 診断スコア→初期θのルックアップと保存。
        // 既にセッション実績かオンボーディング完了があるプロファイルでは、θを上書き
        // しない(進行中の漸減を診断のやり直しで壊さない)。目標と回答は常に更新する。
        const answers = Array.isArray(msg.answers) ? msg.answers.map((v) => Number(v) || 0) : [];
        const score = answers.reduce((a, v) => a + v, 0);
        const state = await getState();
        const sessions = await getAllSessions();
        const fresh = sessions.length === 0 && !state.onboarded_at;
        if (fresh) {
          const table = DIAGNOSIS.thetaByScore;
          state.theta = table[Math.min(Math.max(score, 0), table.length - 1)];
          state.day_start_theta = state.theta;
        }
        state.diag_answers = answers;
        if (typeof msg.goal === 'string' && msg.goal in GOALS) state.goal = msg.goal;
        state.onboarded_at = state.onboarded_at ?? Date.now();
        await putState(state);
        sendResponse({ ok: true, theta_applied: fresh });
        break;
      }

      case Msg.SET_GOAL: {
        // 週次目標(評価レイヤー)。stateへの書き込みはSW経由に揃える(制御器との競合回避)。
        // 制御器はgoalを読まないので、θの力学には一切影響しない。
        const goal = typeof msg.goal === 'string' && msg.goal in GOALS ? msg.goal : null;
        const state = await getState();
        state.goal = goal;
        await putState(state);
        sendResponse({ ok: true, goal });
        break;
      }

      case Msg.GET_MIRROR:
        sendResponse({ ok: true, mirror: await buildMirror() });
        break;

      case Msg.QUIZ_REQUEST: {
        // クイズ生成。第一候補はChrome内蔵AI(Gemini Nano) — 本文がデバイスの外に
        // 出ない。使えなければローカルサーバへフォールバック(これが本文がページの
        // 外に出る唯一の経路。サーバは保存もログもしない)。両方失敗なら静かに
        // 諦め、content側は通常ヒントに戻る — クイズの都合で読書を壊さない。
        const text = (msg.paragraph_text ?? '').trim().slice(0, 2000);
        let data = null;
        const quiz = await nanoQuiz(text);
        if (quiz) data = { ok: true, quiz, source: 'nano' };
        if (!data) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), QUIZ.timeoutMs);
            const r = await fetch(QUIZ.endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ paragraph_text: text }),
              signal: ctrl.signal,
            });
            clearTimeout(timer);
            data = await r.json();
            if (data) data.source = 'server';
          } catch {
            data = { ok: false, error: 'unreachable' };
          }
        }
        // 記録層: 出題されたクイズを保存(同一段落は再利用)。失敗しても表示は妨げない
        if (data?.ok && data.quiz) {
          try {
            const hash = await sha256Hex(text);
            const existing = await getQuizByHash(hash);
            if (existing) {
              data.quiz_id = existing.quiz_id;
            } else {
              const current = await getCurrentSession();
              data.quiz_id = await addQuiz({
                page_id: current?.page_id ?? null,
                paragraph_hash: hash,
                paragraph_excerpt: text.slice(0, 80),
                question: data.quiz.question,
                choices: data.quiz.choices,
                answer_index: data.quiz.answer_index,
                created_at: Date.now(),
              });
            }
          } catch {
            /* 記録失敗は無視 */
          }
        }
        sendResponse(data);
        break;
      }

      case Msg.ASK_REQUEST: {
        // 自分からの問い(道具カテゴリ・1問1答)。Nanoのみ — 本文と質問を外に出さない。
        // 回答に演出はつけない(質問をレバーにしない)。制御器にも一切入れない。
        const current = await getCurrentSession();
        if (!current) {
          sendResponse({ ok: false, error: 'no-session' });
          break;
        }
        const question = String(msg.question ?? '').slice(0, 300);
        const selection = String(msg.selection ?? '').slice(0, 500);
        const context = Array.isArray(msg.context)
          ? msg.context
              .slice(0, 8)
              .map((c) => ({ i: Number(c?.i) || 0, text: String(c?.text ?? '').slice(0, 800) }))
          : [];
        if (!question.trim()) {
          sendResponse({ ok: false, error: 'empty' });
          break;
        }
        // Nano優先(本文がデバイス外に出ない)。使えなければローカルサーバへ
        // フォールバック。ただしサーバはAnthropic APIへ本文を転送する — この経路は
        // ドッグフーディング用。βでは同意事項(docs/ask-and-nano-design.md §4)。
        let res = await nanoAnswer({ question, selection, context });
        if (!res) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), QUIZ.timeoutMs);
            const r = await fetch(QUIZ.askEndpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ question, selection, context }),
              signal: ctrl.signal,
            });
            clearTimeout(timer);
            const data = await r.json();
            if (data?.ok) res = { answer: data.answer, source_index: data.source_index };
          } catch {
            /* サーバ不在。下でunavailableを返す */
          }
        }
        if (!res) {
          sendResponse({ ok: false, error: 'unavailable' });
          break;
        }
        // 計測層には文字数だけ(層の分離: 文面は記録層のquestionsにのみ置く)
        try {
          await appendEvent(current.session_id, EventType.QUESTION_ASKED, {
            chars: question.length,
          });
          await addQuestion({
            page_id: current.page_id ?? null,
            session_id: current.session_id,
            question,
            answer: res.answer,
            created_at: Date.now(),
          });
        } catch {
          /* 記録失敗は回答を妨げない */
        }
        sendResponse({ ok: true, answer: res.answer, source_index: res.source_index });
        break;
      }

      case Msg.WIPE_ALL:
        await endSession('manual');
        await wipeAll();
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })().catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true; // 非同期応答
});
