// セッション状態機械。
//
//   IDLE   --[読むボタン押下]--> ACTIVE
//   ACTIVE --[タブ切替/ウィンドウ非フォーカス]--> ESCAPED
//   ESCAPED--[復帰]--> ACTIVE
//   ACTIVE --[終了ボタン / タブclose]--> ENDED
//   ACTIVE --[無操作 3分]--> ENDED(auto)
//   ESCAPED--[復帰なし 3分]--> ENDED(auto)
//
// 離脱はセッションを終わらせない。離脱→復帰のパターンが制御器の主要シグナルであるため。
//
// 「計測はセッション中のみ」の守り方(設計ドキュメントからの変更):
// 設計ではtabs系リスナーを開始時に登録・終了時に解除する方式だったが、MV3のService
// Workerは停止・再起動があり、動的に登録したリスナーは再起動で消えて復帰を取り逃がす。
// そのため登録はservice-worker.jsのトップレベル(常設)とし、代わりに全ハンドラが
// このファイルを通り、最初にセッションの存在を確認してから動く。セッションが無ければ
// 何も読まず何も書かずに戻る。観測コードパスがセッション中しか走らないことは変わらない。
//
// セッションの現在値はchrome.storage.sessionに置く(SW再起動を跨いで生き、
// ブラウザ終了で消える — セッションという意味に合う)。

import { EventType, EndReason, SessionState } from '../shared/events.js';
import { SESSION, SUCCESS, THETA_MAX, CONTROLLER, DEMO } from '../shared/config.js';
import { dateKey } from '../shared/time.js';
import {
  appendEvent,
  putSession,
  getState,
  putState,
  getPage,
  putPage,
  addQuizAttempt,
  getAllSessions,
  sha256Hex,
} from './store.js';
import { effectiveTheta, nextState, applyHomeostat, isSuccess } from './controller.js';

const CURRENT_KEY = 'currentSession';
export const WATCHDOG_ALARM = 'rs-watchdog';

export async function getCurrent() {
  const got = await chrome.storage.session.get(CURRENT_KEY);
  return got[CURRENT_KEY] ?? null;
}

function setCurrent(session) {
  if (session === null) return chrome.storage.session.remove(CURRENT_KEY);
  return chrome.storage.session.set({ [CURRENT_KEY]: session });
}

function domainOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** ユーザージェスチャー起点(popup)でのみ呼ばれる。activeTab権限の発動条件を兼ねる。 */
export async function startSession(tabId) {
  const existing = await getCurrent();
  if (existing) await endSession(EndReason.MANUAL);

  const tab = await chrome.tabs.get(tabId);
  const domain = domainOf(tab.url);
  if (!domain) throw new Error('このページでは計測できません');

  const state = await getState();
  const now = Date.now();

  // 記録層: URL正規化(クエリ・フラグメント除去)→ page_id
  const u = new URL(tab.url);
  const normalizedUrl = u.origin + u.pathname;
  const pageId = await sha256Hex(normalizedUrl);

  const session = {
    session_id: crypto.randomUUID(),
    tab_id: tabId,
    window_id: tab.windowId,
    // タブ内遷移の判定にだけ使う。storage.session限りで、IndexedDBには書かない。
    page_url: tab.url.split('#')[0],
    page_id: pageId,
    state: SessionState.ACTIVE,
    started_at: now,
    last_event_at: now,
    escaped_at: null,
    domain,
    theta_base: state.theta, // 制御器が持つ基準θ
    theta: effectiveTheta(state.theta), // このセッションの実効θ(±ノイズ=迷彩)
    article_len_words: null,
    mode: null, // 'full' | 'measure-only'(本文検出失敗)
    read_ms: 0,
    escapes: 0,
    completion_pct: 0,
    hints_shown: 0,
    effects_shown: 0,
  };
  await setCurrent(session);
  await appendEvent(session.session_id, EventType.SESSION_START, {
    url_domain: domain,
    article_len_words: null,
    theta: session.theta,
    theta_base: session.theta_base,
  });

  // 記録層: pagesをupsert(読書メモリの台帳。ローカルのみ)
  const page = (await getPage(pageId)) ?? {
    page_id: pageId,
    url: normalizedUrl,
    title: null,
    domain,
    lang: null,
    word_count: null,
    summary: null,
    first_read_at: now,
    last_read_at: now,
    read_count: 0,
    total_read_ms: 0,
    best_completion_pct: 0,
  };
  if (tab.title) page.title = tab.title;
  page.last_read_at = now;
  await putPage(page);

  // content script注入はセッション保存の後。注入されたスクリプトは起動直後に
  // GET_STATUSでθを取りに来るため、先に注入するとセッション未保存の瞬間に
  // 問い合わせが届いて θ=0 になる(ヒントが一枚も出なくなる)。
  // モジュールを直接注入できないためローダーを挟む。
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/loader.js'],
    });
  } catch (err) {
    await setCurrent(null); // 注入できないページ(chrome://等)。セッションを残さない
    throw err;
  }

  // 無操作・未復帰の監視。SWが止まってもalarmで起こされる。
  await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 0.5 });
  await chrome.action.setBadgeText({ text: '●' });
  return session;
}

export async function endSession(reason) {
  const session = await getCurrent();
  if (!session || session.state === SessionState.ENDED) return null;

  await chrome.alarms.clear(WATCHDOG_ALARM);
  await chrome.action.setBadgeText({ text: '' });

  const success =
    session.read_ms >= SUCCESS.minReadMs && session.escapes <= SUCCESS.maxEscapes;

  // 読了お祝いは「セッション成功、かつθ>0」のときだけ。演出もθの配下にあり、
  // θ=0では何も出さない — 補助なし読書時間の定義を汚さないため。
  // デモ中だけは成功条件を待たず必ず出す(見せるためのモード)。
  const celebrate = (success || DEMO.enabled) && session.theta > 0;
  if (celebrate) {
    session.effects_shown += 1;
    await appendEvent(session.session_id, EventType.EFFECT_SHOWN, {
      effect_id: 'session_success',
    });
  }

  await appendEvent(session.session_id, EventType.SESSION_END, {
    reason,
    read_ms: session.read_ms,
    completion_pct: session.completion_pct,
  });
  await putSession({
    session_id: session.session_id,
    date: dateKey(session.started_at),
    started_at: session.started_at,
    domain: session.domain,
    page_id: session.page_id ?? null, // 記録層への橋(ローカル内のみ)
    theta: session.theta, // このセッションの実効θ
    theta_base: session.theta_base, // 制御器の基準θ
    read_ms: session.read_ms,
    escapes: session.escapes,
    completion_pct: session.completion_pct,
    success,
    // 補助なし判定に使う。
    hints_shown: session.hints_shown,
    effects_shown: session.effects_shown,
  });

  // 記録層: pagesへ累計を積む
  if (session.page_id) {
    try {
      const page = await getPage(session.page_id);
      if (page) {
        page.read_count += 1;
        page.total_read_ms += session.read_ms;
        page.best_completion_pct = Math.max(page.best_completion_pct, session.completion_pct);
        page.last_read_at = Date.now();
        await putPage(page);
      }
    } catch {
      /* 記録失敗は終了処理を妨げない */
    }
  }

  // W3: タペリング制御器。セッションの成否で基準θを乗算的に動かす。
  // 本人には通知しない(気づかれない速度で減らす)。変化はtheta_updateとして記録。
  if (CONTROLLER.enabled) {
    try {
      const st = await getState();
      let next;
      let reason = null;
      if (st.homeostat?.active) {
        next = { ...st }; // 再展開中は漸減しない。回復判定はホメオスタットが行う
      } else {
        next = nextState(st, session, dateKey(Date.now()));
        if (next.theta !== st.theta) reason = isSuccess(session) ? 'success' : 'fail';
        if (st.theta > 0 && next.theta === 0) {
          // 卒業の瞬間: 見守りのベースライン(直近4週の補助なし読書時間の週平均)を記録
          reason = 'graduate';
          next.homeostat = {
            baseline: await unassistedWeeklyAvgMin(),
            active: false,
            graduated_at: Date.now(),
          };
        }
      }
      // 卒業後(と再展開中)の見守り
      if (next.theta === 0 || next.homeostat?.active) {
        const avg = await unassistedWeeklyAvgMin();
        const after = applyHomeostat(next, avg);
        if (after.theta !== next.theta) {
          reason = after.homeostat.active ? 'homeostat_redeploy' : 'homeostat_recover';
        }
        next = after;
      }
      if (next.theta !== st.theta) {
        await appendEvent(session.session_id, EventType.THETA_UPDATE, {
          from: st.theta,
          to: next.theta,
          reason,
        });
      }
      await putState(next);
    } catch {
      /* 制御の失敗は終了処理を妨げない */
    }
  }

  // content scriptに片付けを頼む。タブが既に無ければそれでよい。
  try {
    await chrome.tabs.sendMessage(session.tab_id, {
      type: 'rs_stop',
      celebrate,
      read_min: Math.round(session.read_ms / 60_000),
    });
  } catch {
    /* タブclose済み */
  }

  await setCurrent(null);
  return { ...session, state: SessionState.ENDED, success, reason };
}

/** content scriptからの計測報告。送信元がセッションのタブであることを必ず確認する。 */
export async function onReport(event, payload, sender) {
  const session = await getCurrent();
  if (!session || sender.tab?.id !== session.tab_id) return;

  const now = Date.now();
  session.last_event_at = now;

  switch (event) {
    case 'content_ready':
      session.article_len_words = payload.article_len_words;
      session.mode = payload.mode;
      // 記録層: 本文の言語と語数をページに反映
      if (session.page_id) {
        try {
          const page = await getPage(session.page_id);
          if (page) {
            page.word_count = payload.article_len_words ?? page.word_count;
            page.lang = payload.lang ?? page.lang;
            await putPage(page);
          }
        } catch {
          /* 記録失敗は計測を妨げない */
        }
      }
      break;

    case EventType.DWELL_TICK:
      // 読書時間の操作的定義に合致した鼓動だけがread_msに積まれる。
      if (session.state === SessionState.ACTIVE) {
        session.read_ms += SESSION.dwellTickMs;
        await appendEvent(session.session_id, EventType.DWELL_TICK, {
          visible_paragraph_range: payload.visible_paragraph_range ?? null,
        });
      }
      break;

    case EventType.SCROLL:
      session.completion_pct = Math.max(session.completion_pct, payload.completion_pct ?? 0);
      await appendEvent(session.session_id, EventType.SCROLL, {
        depth_pct: payload.depth_pct ?? 0,
      });
      break;

    case EventType.HINT_SHOWN:
      session.hints_shown += 1;
      await appendEvent(session.session_id, EventType.HINT_SHOWN, {
        hint_id: payload.hint_id,
        kind: payload.kind ?? 'canned',
      });
      break;

    case EventType.HINT_CLICKED:
      await appendEvent(session.session_id, EventType.HINT_CLICKED, {
        hint_id: payload.hint_id,
      });
      break;

    case EventType.QUIZ_ANSWERED:
      await appendEvent(session.session_id, EventType.QUIZ_ANSWERED, {
        quiz_id: payload.quiz_id ?? null,
        correct: payload.correct === true,
      });
      // 記録層: 回答の記録
      try {
        await addQuizAttempt({
          quiz_id: payload.quiz_id ?? null,
          page_id: session.page_id ?? null,
          session_id: session.session_id,
          answered_at: now,
          chosen_index: payload.chosen_index ?? null,
          correct: payload.correct === true,
          latency_ms: payload.latency_ms ?? null,
        });
      } catch {
        /* 記録失敗は計測を妨げない */
      }
      break;

    case EventType.EFFECT_SHOWN: // レア演出(金の雨)。補助の一種として数える
      session.effects_shown += 1;
      await appendEvent(session.session_id, EventType.EFFECT_SHOWN, {
        effect_id: payload.effect_id,
      });
      break;

    default:
      return; // 未知の報告は捨てる
  }
  await setCurrent(session);
}

/** タブ切替。セッションタブへ戻れば復帰、別タブへ移れば離脱。 */
export async function onTabActivated(activeInfo) {
  const session = await getCurrent();
  if (!session) return;

  if (activeInfo.tabId === session.tab_id) {
    await returnFromEscape(session);
  } else {
    let toDomain = null;
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      toDomain = domainOf(tab.url); // ドメインのみ。URL全体・タイトルは見ない・保存しない
    } catch {
      /* 取得できなければ行き先なしで記録 */
    }
    await escape(session, toDomain);
  }
}

/** ウィンドウのフォーカス移動。全ウィンドウ非フォーカス=OSの別アプリへの離脱。 */
export async function onWindowFocusChanged(windowId) {
  const session = await getCurrent();
  if (!session) return;

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await escape(session, null);
    return;
  }
  try {
    const [active] = await chrome.tabs.query({ active: true, windowId });
    if (active?.id === session.tab_id) {
      await returnFromEscape(session);
    } else {
      await escape(session, domainOf(active?.url));
    }
  } catch {
    /* ウィンドウが消えた等は次のイベントに任せる */
  }
}

export async function onTabRemoved(tabId) {
  const session = await getCurrent();
  if (!session || tabId !== session.tab_id) return;
  await endSession(EndReason.CLOSE);
}

/**
 * セッションタブ内の別ページへの遷移。v0は1セッション=1記事なので終了扱い。
 * ハッシュだけの変化(記事内の脚注・目次ジャンプ)は遷移とみなさない。
 */
export async function onTabUpdated(tabId, changeInfo) {
  const session = await getCurrent();
  if (!session || tabId !== session.tab_id || !changeInfo.url) return;
  if (changeInfo.url.split('#')[0] === session.page_url) return;
  await endSession(EndReason.CLOSE);
}

/** 30秒ごとの見回り。無操作3分/復帰なし3分の自動終了はここで判定する。 */
export async function onWatchdog() {
  const session = await getCurrent();
  if (!session) {
    await chrome.alarms.clear(WATCHDOG_ALARM); // 迷子のalarmを掃除
    return;
  }
  if (Date.now() - session.last_event_at > SESSION.idleTimeoutMs) {
    await endSession(EndReason.IDLE);
  }
}

/**
 * θ手動ダイヤル(ドッグフーディング用、W3で自動化)。連続値[0, THETA_MAX]。
 * 進行中のセッションがあれば即時反映する — 「θを変えると読書体験が変わる」の確認用。
 */
export async function setTheta(value) {
  const clamped = Math.min(Math.max(Number(value) || 0, 0), THETA_MAX);
  const state = await getState();
  state.theta = clamped;
  state.day_start_theta = clamped; // 手動設定は1日上限の基準もリセット
  await putState(state);

  const session = await getCurrent();
  if (session) {
    session.theta_base = clamped;
    session.theta = clamped; // 手動時はノイズなしの直値(ダイヤルの体感確認用)
    await setCurrent(session);
    try {
      await chrome.tabs.sendMessage(session.tab_id, { type: 'rs_theta', theta: clamped });
    } catch {
      /* タブが応答しなければ次のセッションから効く */
    }
  }
  return { theta: clamped };
}

/** 補助なし読書時間の週平均(直近4週・分)。ホメオスタットの入力。 */
async function unassistedWeeklyAvgMin() {
  const sessions = await getAllSessions();
  const cutoff = Date.now() - CONTROLLER.homeostatWindowWeeks * 7 * 86_400_000;
  let ms = 0;
  for (const s of sessions) {
    if ((s.started_at ?? 0) < cutoff) continue;
    if ((s.hints_shown ?? 0) === 0 && (s.effects_shown ?? 0) === 0) ms += s.read_ms ?? 0;
  }
  return ms / 60_000 / CONTROLLER.homeostatWindowWeeks;
}

async function escape(session, toDomain) {
  if (session.state !== SessionState.ACTIVE) return;
  session.state = SessionState.ESCAPED;
  session.escaped_at = Date.now();
  session.last_event_at = session.escaped_at;
  session.escapes += 1;
  await appendEvent(session.session_id, EventType.TAB_ESCAPE, { to_domain: toDomain });
  await setCurrent(session);
}

async function returnFromEscape(session) {
  if (session.state !== SessionState.ESCAPED) return;
  const now = Date.now();
  await appendEvent(session.session_id, EventType.TAB_RETURN, {
    away_ms: now - session.escaped_at,
  });
  session.state = SessionState.ACTIVE;
  session.escaped_at = null;
  session.last_event_at = now;
  await setCurrent(session);
}
