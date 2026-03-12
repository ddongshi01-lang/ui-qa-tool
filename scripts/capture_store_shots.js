const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const targetUrl = 'https://500px.com/';
const outDir = path.resolve('D:/Codex_Projects/Zoucha_Shijue/store-listing/screenshots');
const scriptPath = path.resolve('D:/Codex_Projects/Zoucha_Shijue/visual-qa.js');

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

(async () => {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'
  });
  const page = await context.newPage();

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);

  const selectors = [
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("同意")',
    'button:has-text("接受")',
    'button:has-text("同意并继续")'
  ];
  for (const s of selectors) {
    const btn = await page.$(s).catch(() => null);
    if (btn) { try { await btn.click(); } catch (e) {} }
  }
  await sleep(1000);

  const js = fs.readFileSync(scriptPath, 'utf8');
  await page.addScriptTag({ content: js });
  await sleep(1000);

  const hoverTarget = await page.$('img') || await page.$('a') || await page.$('body');
  if (hoverTarget) {
    const box = await hoverTarget.boundingBox();
    if (box) await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  }
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, 'shot-1-hover.png') });

  if (hoverTarget) {
    const box = await hoverTarget.boundingBox();
    if (box) await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
  }
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, 'shot-2-freeze.png') });

  await page.click('#vqa-measure');
  const imgs = await page.$$('img');
  let a = null, b = null;
  for (const el of imgs) {
    const box = await el.boundingBox();
    if (!box) continue;
    if (!a) { a = { el, box }; continue; }
    if (!b && Math.abs(box.y - a.box.y) > 20) { b = { el, box }; break; }
  }
  if (!a) {
    const el = await page.$('a') || await page.$('body');
    const box = el ? await el.boundingBox() : null;
    if (box) a = { el, box };
  }
  if (!b) {
    const el2 = await page.$('h1') || await page.$('header') || await page.$('body');
    const box2 = el2 ? await el2.boundingBox() : null;
    if (box2) b = { el: el2, box: box2 };
  }
  if (a && a.box) await page.mouse.click(a.box.x + a.box.width/2, a.box.y + a.box.height/2);
  if (b && b.box) await page.mouse.click(b.box.x + b.box.width/2, b.box.y + b.box.height/2);
  await sleep(600);
  await page.screenshot({ path: path.join(outDir, 'shot-3-measure.png') });

  await page.click('#vqa-pin');
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, 'shot-4-pinned.png') });

  await browser.close();
})();
