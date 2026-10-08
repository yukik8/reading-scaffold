#!/usr/bin/env node
// 記録を別の制御器に通して、θ の動きを比べる(オフライン評価)。
//
//   node tools/replay/replay.mjs --simulate [--preset typical] [--readers 200] [--seed 1] [--weeks 16]
//   node tools/replay/replay.mjs --export reading-scaffold-YYYYMMDD.json
//
// --simulate: 模擬の読者(lib/reader.mjs)に制御器を当てる。成否は θ に応じて変わるので、
//             制御器どうしの比較ができる(ただし読者モデルの仮定の範囲で)。
// --export:   ダッシュボードの「JSONでエクスポート」を読み、記録されたセッションの成否を順に
//             制御器へ流す。成否は記録された θ のもとで起きたものなので、別の制御器に流しても
//             「その θ ならどう読んだか」は分からない。見られるのは θ の軌跡の違いと、
//             fixed が記録どおりの θ を再現するか(ハーネスの検算)。

import { readFileSync, writeFileSync } from 'node:fs';
import { makeRng } from './lib/rng.mjs';
import { makeReader, READER_PRESETS } from './lib/reader.mjs';
import { pickControllers } from './lib/controllers.mjs';
import { isNeutral, isSuccess } from '../../extension/src/background/controller.js';
import { THETA_MAX, THETA_NOISE, PASS, DIAGNOSIS, STAIRCASE, CONTROLLER } from '../../extension/src/shared/config.js';
import { dateKey } from '../../extension/src/shared/time.js';

const DAY = 86_400_000;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = key === 'set' ? [].concat(out.set ?? [], next) : next;
      i += 1;
    }
  }
  return out;
}

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));

// ---- 模擬 ------------------------------------------------------------------

function simulateOne(controller, reader, theta0, rng) {
  let st = controller.init(theta0);
  const t0 = reader.times[0];
  const log = [];
  let graduatedAt = null;
  let raises = 0;
  for (const t of reader.times) {
    const base = controller.theta(st);
    if (base === 0 && graduatedAt === null) graduatedAt = t;
    // 実効 θ: 拡張と同じく ±THETA_NOISE の揺らぎ(乱数は seed 付き)
    const effective = base <= 0 ? 0 : Math.min(THETA_MAX, base * (1 + rng.uniform(-1, 1) * THETA_NOISE));
    const session = { ...reader.read(effective), theta: effective };
    const before = base;
    st = controller.step(st, session, dateKey(t + session.read_ms));
    const after = controller.theta(st);
    if (after > before) raises += 1;
    log.push({ t, base, effective, p: reader.pSuccess(effective), success: session.success, after });
    if (controller.theta(st) === 0 && graduatedAt === null) graduatedAt = t;
  }
  const taper = log.filter((r) => r.base > 0);
  const weeksToGraduate = graduatedAt === null ? null : (graduatedAt - t0) / (7 * DAY);
  return {
    graduated: graduatedAt !== null,
    weeksToGraduate,
    sessionsToGraduate: graduatedAt === null ? null : taper.length,
    successRateDuringTaper: mean(taper.map((r) => (r.success ? 1 : 0))),
    // 制御器が読者を「どのくらい読めない θ」まで追い込んだか: タペリング後半の P(成功)
    pSuccessLateTaper: mean(taper.slice(Math.floor(taper.length / 2)).map((r) => r.p)),
    raises,
    finalTheta: controller.theta(st),
    log,
  };
}

function simulate(args) {
  const presets = args.preset ? String(args.preset).split(',') : Object.keys(READER_PRESETS);
  const readers = Number(args.readers ?? 200);
  const weeks = Number(args.weeks ?? 16);
  const sessionsPerWeek = Number(args.spw ?? 4);
  const seed = Number(args.seed ?? 1);
  const controllers = pickControllers(args.controllers);
  const theta0 = Number(args.theta0 ?? THETA_MAX);
  const out = {};

  for (const preset of presets) {
    console.log(`\n== 読者: ${preset}  (n=${readers}, ${sessionsPerWeek}回/週, ${weeks}週, θ0=${theta0}, seed=${seed})`);
    console.log(
      '制御器'.padEnd(12) +
        '卒業率@12w'.padStart(10) +
        '卒業までの週(中央値)'.padStart(14) +
        '卒業までの回数'.padStart(10) +
        '成功率(漸減中)'.padStart(12) +
        'P(成功)後半'.padStart(10) +
        '上げた回数'.padStart(8),
    );
    for (const c of controllers) {
      const results = [];
      for (let i = 0; i < readers; i += 1) {
        // 読者と制御器の組ごとに同じ seed → 同じ読者に別の制御器を当てる
        const rng = makeRng(seed * 100_003 + i);
        const reader = makeReader({ preset, sessionsPerWeek, weeks }, rng);
        results.push(simulateOne(c, reader, theta0, rng));
      }
      const gradIn12 = results.filter((r) => r.graduated && r.weeksToGraduate <= PASS.graduateWithinWeeks).length / results.length;
      const row = {
        gradIn12,
        weeks: median(results.filter((r) => r.graduated).map((r) => r.weeksToGraduate)),
        sessions: median(results.filter((r) => r.graduated).map((r) => r.sessionsToGraduate)),
        successRate: mean(results.map((r) => r.successRateDuringTaper).filter((v) => v !== null)),
        pLate: mean(results.map((r) => r.pSuccessLateTaper).filter((v) => v !== null)),
        raises: mean(results.map((r) => r.raises)),
      };
      out[`${preset}/${c.name}`] = row;
      console.log(
        c.name.padEnd(12) +
          fmt(row.gradIn12 * 100, 0).padStart(9) +
          '%' +
          fmt(row.weeks, 1).padStart(14) +
          fmt(row.sessions, 0).padStart(10) +
          fmt(row.successRate * 100, 0).padStart(11) +
          '%' +
          fmt(row.pLate * 100, 0).padStart(9) +
          '%' +
          fmt(row.raises, 1).padStart(8),
      );
    }
  }
  return out;
}

// ---- 記録の再生 --------------------------------------------------------------

function replayExport(args) {
  const data = JSON.parse(readFileSync(String(args.export), 'utf8'));
  if (data.format !== 'reading-scaffold-export') throw new Error('not a reading-scaffold export');
  const sessions = [...(data.sessions ?? [])].sort((a, b) => a.started_at - b.started_at);
  if (sessions.length === 0) {
    console.log('セッションの記録がありません');
    return {};
  }
  const controllers = pickControllers(args.controllers);
  const theta0 = Number(args.theta0 ?? sessions[0].theta_base ?? THETA_MAX);
  const states = new Map(controllers.map((c) => [c.name, c.init(theta0)]));
  const manual = new Set(
    (data.events ?? [])
      .filter((e) => e.type === 'theta_update' && !['success', 'fail', 'graduate'].includes(e.payload?.reason))
      .map((e) => e.session_id),
  );

  console.log(`記録: ${sessions.length} セッション  ${sessions[0].date} 〜 ${sessions.at(-1).date}  θ0=${theta0}`);
  console.log(
    '日付'.padEnd(11) +
      '成否'.padEnd(6) +
      '記録θ'.padStart(7) +
      controllers.map((c) => c.name.padStart(10)).join('') +
      '  備考',
  );
  let mismatches = 0;
  const rows = [];
  for (let i = 0; i < sessions.length; i += 1) {
    const s = sessions[i];
    const outcome = isNeutral(s) ? 'neutral' : isSuccess(s) ? 'ok' : 'fail';
    const row = { date: s.date, outcome, recorded: s.theta_base };
    const notes = [];
    for (const c of controllers) {
      const st = c.step(states.get(c.name), s, dateKey(s.started_at + (s.read_ms ?? 0)));
      states.set(c.name, st);
      row[c.name] = c.theta(st);
    }
    // 検算: fixed の出力は次のセッションの記録 θ_base と一致するはず
    const next = sessions[i + 1];
    if (next && row.fixed !== undefined) {
      const diff = Math.abs(row.fixed - next.theta_base);
      if (diff > 1e-9) {
        mismatches += 1;
        notes.push(manual.has(s.session_id) || manual.has(next.session_id) ? '手動/再展開あり' : `不一致 (次の記録 ${fmt(next.theta_base, 3)})`);
      }
    }
    rows.push(row);
    console.log(
      s.date.padEnd(11) +
        outcome.padEnd(6) +
        fmt(s.theta_base, 3).padStart(7) +
        controllers.map((c) => fmt(row[c.name], 3).padStart(10)).join('') +
        (notes.length ? '  ' + notes.join('; ') : ''),
    );
  }
  console.log(`\nfixed と記録の不一致: ${mismatches} 件(手動の上書き・ホメオスタット・終了時刻のずれは不一致に数える)`);
  return rows;
}

// ---- main --------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
// --set STAIRCASE.target=0.7 --set CONTROLLER.alpha=0.08 : 設定を上書きして感度を見る(複数可)
for (const kv of [].concat(args.set ?? [])) {
  const m = String(kv).match(/^(STAIRCASE|CONTROLLER)\.(\w+)=(.+)$/);
  if (!m) throw new Error(`--set は STAIRCASE.key=value か CONTROLLER.key=value: ${kv}`);
  const target = m[1] === 'STAIRCASE' ? STAIRCASE : CONTROLLER;
  if (!(m[2] in target)) throw new Error(`unknown key: ${m[1]}.${m[2]}`);
  target[m[2]] = Number.isNaN(Number(m[3])) ? m[3] : Number(m[3]);
  console.log(`set ${m[1]}.${m[2]} = ${target[m[2]]}`);
}
let result;
if (args.simulate) result = simulate(args);
else if (args.export) result = replayExport(args);
else {
  console.log('usage: replay.mjs --simulate [--preset p] [--readers n] [--seed s] [--weeks w] [--spw k] [--controllers a,b]');
  console.log('       replay.mjs --export file.json [--controllers a,b] [--theta0 t]');
  console.log(`presets: ${Object.keys(READER_PRESETS).join(', ')}   診断→θ0: ${DIAGNOSIS.thetaByScore.join(',')}`);
  process.exit(1);
}
if (args.json) writeFileSync(String(args.json), JSON.stringify(result, null, 2));
