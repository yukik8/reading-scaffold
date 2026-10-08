// 小さいプロモーション タイル 440×280(docs/style.md の紙・水彩・丸ゴシック)
const puppeteer = require(process.env.S + '/node_modules/puppeteer');
const fs = require('fs');
const OUT = process.env.OUT || __dirname;
const bear = fs.readFileSync(`${OUT}/icon.svg`, 'utf8').replace('<svg ', '<svg width="100%" height="100%" ');
const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0}
  body{width:440px;height:280px;overflow:hidden;position:relative;background:#fbf3e4;color:#4a2f24;
    font-family:'Hiragino Maru Gothic ProN','Zen Maru Gothic','M PLUS Rounded 1c','Hiragino Sans',sans-serif}
  .wash{position:absolute;border-radius:50%;filter:url(#wash);opacity:.16}
  .noise{position:absolute;inset:0;opacity:.07;pointer-events:none}
  .bear{position:absolute;left:18px;top:36px;width:190px;height:190px;transform:rotate(-3deg)}
  .text{position:absolute;left:224px;top:0;height:280px;display:flex;flex-direction:column;justify-content:center;gap:14px}
  h1{margin:0;font-size:46px;font-weight:900;letter-spacing:.05em;line-height:1;
    background:linear-gradient(transparent 62%,rgba(255,210,63,.65) 62%,rgba(255,210,63,.65) 92%,transparent 92%);padding:0 2px;display:inline-block;width:max-content}
  p{margin:0;font-size:15px;font-weight:800;line-height:1.6;letter-spacing:.04em}
  .tag{display:inline-block;width:max-content;margin-top:2px;padding:3px 12px;border-radius:999px;background:rgba(76,201,163,.22);font-size:11px;font-weight:900;letter-spacing:.14em}
</style>
<svg width="0" height="0" style="position:absolute"><filter id="wash" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="2" seed="7" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="70" xChannelSelector="R" yChannelSelector="G"/></filter></svg>
<div class="wash" style="left:-90px;top:-100px;width:220px;height:220px;background:#f26b8a"></div>
<div class="wash" style="right:-80px;bottom:-110px;width:260px;height:260px;background:#4fa3e3"></div>
<div class="wash" style="right:60px;top:-120px;width:200px;height:200px;background:#ffd23f;opacity:.14"></div>
<svg class="noise" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
<div class="bear">${bear}</div>
<div class="text">
  <span class="tag">GOOGLE PLAY ブックス</span>
  <h1>よみりん</h1>
  <p>読む時間に、<br>そっと補助輪を。</p>
</div>`;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
  await p.setContent(html);
  await new Promise((r) => setTimeout(r, 400));
  await p.screenshot({ path: `${OUT}/promo-440x280.png`, clip: { x: 0, y: 0, width: 440, height: 280 } });
  await p.setViewport({ width: 440, height: 280, deviceScaleFactor: 3 });
  await p.screenshot({ path: `${OUT}/promo-preview.png`, clip: { x: 0, y: 0, width: 440, height: 280 } });
  await b.close();
})();
