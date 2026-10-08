// 拡張のアイコンを出力: 128/48 はくま(peek・本から顔を出す)、32/16 は顔だけ
const puppeteer = require(process.env.S + '/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const EXT = require('path').resolve(__dirname, '../../../extension');
const OUT = process.env.OUT || require('path').resolve(EXT, 'icons');
const face = require('./face.svg.js');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/') return r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent"></body>' });
    const f = path.join(EXT, u.pathname);
    if (!fs.existsSync(f)) return r.respond({ status: 404, body: '' });
    return r.respond({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) });
  });
  await page.goto('https://icon.test/');
  // 描画の範囲(本 x6..234 / リボン y28 .. 本の底 y256)に寄せた正方形の viewBox
  const peek = (await page.evaluate(async () => (await import('/src/content/bear.js')).bearSVG('peek'))).replace(/viewBox="[^"]*"/, 'viewBox="0 22 240 240"');
  const render = async (svg, size, pad, out) => {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.evaluate((svg, size, pad) => {
      document.body.innerHTML = `<div style="width:${size}px;height:${size}px;display:grid;place-items:center"><div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg}</div></div>`;
      const s = document.querySelector('svg'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
    }, svg, size, pad);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  // ストアの 128px は「96px の絵 + 16px の余白」が推奨
  await render(peek, 128, 16, `${OUT}/icon-128.png`);
  await render(peek, 48, 3, `${OUT}/icon-48.png`);
  await render(face(7), 32, 1, `${OUT}/icon-32.png`);
  await render(face(9), 16, 0, `${OUT}/icon-16.png`);
  fs.writeFileSync(`${OUT}/icon.svg`, peek);
  // 見比べ用のシート(明・暗の地に、原寸と 4 倍)
  await page.setViewport({ width: 1100, height: 420, deviceScaleFactor: 1 });
  const img = (n) => `data:image/png;base64,${fs.readFileSync(`${OUT}/icon-${n}.png`).toString('base64')}`;
  await page.evaluate((imgs) => {
    const row = (bg) => `<div style="display:flex;gap:40px;align-items:center;background:${bg};padding:20px 30px;height:200px">${[128, 48, 32, 16].map((n) => `<div style="text-align:center"><img src="${imgs[n]}" width="${n}" height="${n}" style="image-rendering:pixelated;display:block;margin:0 auto 10px"><img src="${imgs[n]}" width="${n * 3}" height="${n * 3}" style="image-rendering:pixelated;display:block"></div>`).join('')}</div>`;
    document.body.innerHTML = row('#fff') + row('#202124');
  }, { 128: img(128), 48: img(48), 32: img(32), 16: img(16) });
  await page.screenshot({ path: `${OUT}/sheet.png`, clip: { x: 0, y: 0, width: 1100, height: 420 } });
  await browser.close();
})();
