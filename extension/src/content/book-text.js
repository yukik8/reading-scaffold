// Play ブックスの本文の段落を見つけて読む(読むだけ)。loader.js と main.js が同じ判定を使う。
//
// Play ブックスは EPUB の body を div.gb-segment に置き換え、ページ(reader-rendered-page)の中に描く。
// その中の要素とクラス名は本ごとに違う — 青空文庫は .main_text > div、出版社の本は p.para2 や
// div.c292 > div.c293 > p.c320 など。だからクラス名には頼らず、「文字をじかに持つブロック要素」を
// 段落とみなす。入れ子のブロックは、文字を持つ内側の要素が段落になる。
// (2026-10-09: .main_text > div 決め打ちで、青空文庫以外の本は日本語も英語も本文が見つからなかった)

const ROOT = ':is(reader-rendered-page, .gb-segment)';
const BLOCK_TAGS = [
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'dt', 'dd', 'blockquote', 'pre',
  'figcaption', 'caption', 'td', 'th', 'section', 'article', 'aside', 'header', 'footer',
  'figure', 'address', 'table', 'ul', 'ol', 'dl',
];
const BLOCK = new Set(BLOCK_TAGS);
const CANDIDATES = `${ROOT} :is(${BLOCK_TAGS.join(', ')})`;
// 本文の文字として数えないもの(ルビの振り仮名・スクリプトなど)
const NOT_TEXT = new Set(['rt', 'rp', 'script', 'style', 'template', 'noscript']);
const DROP = [...NOT_TEXT, ...BLOCK_TAGS].join(', ');

/** 語数の見積もり: ラテン文字は単語、CJK は文字で数える。 */
export function countParts(text) {
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0; // don't・couldn’t は1語
  const cjk = text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  return { latin, cjk };
}

export function countWords(text) {
  const { latin, cjk } = countParts(text);
  return latin + cjk;
}

/** 文字(テキストか、文字を含むインラインの要素)をじかに持つか。 */
function hasOwnText(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.data.trim()) return true;
    } else if (n.nodeType === Node.ELEMENT_NODE && !BLOCK.has(n.localName) && !NOT_TEXT.has(n.localName)) {
      if (n.textContent.trim()) return true;
    }
  }
  return false;
}

/** 本文の段落の要素(文書順)。同じ段落がページの作り直しで重なっていても、そのまま返す。 */
export function bookParagraphs(doc = document) {
  return [...doc.querySelectorAll(CANDIDATES)].filter(hasOwnText);
}

/**
 * 段落の本文。ルビの振り仮名(rt)を除く — 除かないとクイズや問いに「馬車屋ばしゃや」のような文が渡る。
 * 中に入れ子の段落があれば、それは別の段落として数えるので除く。改行(br)は空白にする。
 */
export function bookTextOf(el) {
  const clone = el.cloneNode(true);
  for (const n of clone.querySelectorAll(DROP)) n.remove();
  for (const br of clone.querySelectorAll('br')) br.replaceWith(' ');
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** 本文が十分あるか(段落 minParagraphs・語 minWords 以上)。表紙・挿絵・章の扉では false。 */
export function enoughBookText({ minParagraphs, minWords }, doc = document) {
  let n = 0;
  let words = 0;
  for (const p of bookParagraphs(doc)) {
    const w = countWords(bookTextOf(p));
    if (w === 0) continue;
    n += 1;
    words += w;
    if (n >= minParagraphs && words >= minWords) return true;
  }
  return false;
}
