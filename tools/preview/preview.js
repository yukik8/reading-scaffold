// 演出の試写室: 拡張の stage.js をそのまま読み、θ を変えながら呼ぶ。
import { createStage, tierOf } from '../../extension/src/content/stage.js';
import { Paint } from '../../extension/src/content/paint.js';
import { bearImg, bearURL } from '../../extension/src/content/bear.js';
import { createMargin } from '../../extension/src/content/margin.js';

const $ = (id) => document.getElementById(id);
const stage = createStage({ Paint, bearImg });
const THETA_MAX = 8;
const TIERS = { 4: '打ち上げ / つむじ風', 3: '大ジャンプ', 2: 'ぴょんぴょん', 1: '寝そべって読む' };

const theta = () => Number($('theta').value);
const intensity = () => theta() / THETA_MAX;
// ことば吹雪: 読んでいる本の字(main.js の glyphsFromReading の代わり)
const glyphs = [...new Set($('book').textContent.replace(/[\s、。「」]/g, ''))].slice(0, 60);

function showTheta() {
  $('theta-out').textContent = theta().toFixed(1);
  const a = Math.min(1, Math.max(0.15, intensity()));
  $('tier').textContent = theta() <= 0 ? '何も出ない' : `段${tierOf(a)}: ${TIERS[tierOf(a)]}`;
}
$('theta').addEventListener('input', showTheta);
showTheta();

// コマ止め: 押してから指定のミリ秒で、Shadow DOM の中の動き・予定されていた切り替え・粒の描画を全部止める。
// 解除はページを読み直す(θ とコマ止めの値は URL に残す)
const realSetTimeout = window.setTimeout.bind(window);
const realClearTimeout = window.clearTimeout.bind(window);
const realRaf = window.requestAnimationFrame.bind(window);
const pending = new Set();
let frozen = false;
window.setTimeout = (fn, ms = 0, ...args) => {
  const id = realSetTimeout(() => {
    pending.delete(id);
    if (!frozen) fn(...args);
  }, ms);
  pending.add(id);
  return id;
};
window.clearTimeout = (id) => {
  pending.delete(id);
  realClearTimeout(id);
};
window.requestAnimationFrame = (fn) => realRaf((t) => !frozen && fn(t));
function freeze() {
  frozen = true;
  for (const id of pending) realClearTimeout(id);
  pending.clear();
  for (const el of document.documentElement.children) {
    for (const a of el.shadowRoot?.getAnimations() ?? []) {
      a.pause();
      a.currentTime = a.currentTime; // 合成側で先に進んでいた分を、止めた時刻に戻す
    }
  }
  realRaf(() => document.body.offsetWidth);
  // 止まった画面のどこかを押したら解除(演出の層が画面を覆っていて、パネルを押せないことがある)
  realSetTimeout(() => addEventListener('click', thaw, { capture: true, once: true }), 0);
}
function thaw() {
  const q = new URLSearchParams({ theta: $('theta').value });
  if ($('freeze').value) q.set('freeze', $('freeze').value);
  location.search = q.toString();
}
const params = new URLSearchParams(location.search);
if (params.has('theta')) $('theta').value = params.get('theta');
if (params.has('freeze')) $('freeze').value = params.get('freeze');
showTheta();
$('thaw').addEventListener('click', thaw);

function armFreeze() {
  const ms = Number($('freeze').value);
  if ($('freeze').value !== '' && ms >= 0) realSetTimeout(freeze, ms);
}

// θ=0 では何も出さない(main.js と同じ)
const when = (fn) => () => {
  if (theta() <= 0 || frozen) return;
  fn();
  armFreeze();
};

for (const [id, rarity] of [['peek', 'normal'], ['peek-rare', 'rare'], ['peek-epic', 'epic']]) {
  $(id).addEventListener('click', when(() => stage.peek({ intensity: intensity(), rarity })));
}
// 余白(本文の枠の外)。先触れのシルエットはここに出る
const margin = createMargin(Paint, { bearURL });
$('herald').addEventListener(
  'click',
  when(() => {
    const r = $('book').getBoundingClientRect();
    margin.setText({ left: r.left + 40, right: r.right - 40, top: Math.max(0, r.top) + 60, bottom: Math.min(innerHeight, r.bottom) - 20 });
    margin.herald();
  }),
);
$('trivia').addEventListener(
  'click',
  when(() =>
    stage.trivia(
      { text: '「甘藍(かんらん)」はキャベツのことなんだって!', term: '甘藍' },
      { intensity: intensity(), side: Math.random() < 0.5 ? 'left' : 'right' },
    ),
  ),
);
const QUIZ = { question: 'ゴーシュが町の活動写真館で弾いていた楽器は?', choices: ['セロ', 'トランペット', 'クラリネット'], answer_index: 0 };
// クイズはコマ止めを答えた瞬間から数える
$('quiz').addEventListener('click', () => {
  if (theta() <= 0 || frozen) return;
  const variant = params.get('variant') ?? ($('variant').value || undefined);
  stage.quiz(QUIZ, { intensity: intensity(), glyphs, variant, onFirstAnswer: armFreeze });
});
$('finale').addEventListener('click', when(() => stage.finale({ intensity: intensity(), glyphs, variant: 'launch' })));
$('tornado').addEventListener('click', when(() => stage.finale({ intensity: intensity(), glyphs, variant: 'tornado' })));
$('shower').addEventListener('click', when(() => stage.pageShower({ intensity: intensity(), glyphs })));

// ?auto=finale のように渡すと、読み込んだらすぐその演出を出す(コマ止めと合わせて、決まった瞬間を見る)
// ?auto=quiz-win はクイズを出して、0.5秒後に正解を押す
if (params.get('auto') === 'quiz-win') {
  realSetTimeout(() => {
    $('quiz').click();
    realSetTimeout(() => {
      const root = [...document.documentElement.children].map((e) => e.shadowRoot).find((r) => r?.querySelector('.choice'));
      root?.querySelector('.choice').click();
    }, 500);
  }, 300);
} else if (params.has('auto')) {
  realSetTimeout(() => $(params.get('auto'))?.click(), 300);
}
