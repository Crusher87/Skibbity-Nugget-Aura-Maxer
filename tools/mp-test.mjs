// tools/mp-test.mjs: two-player test of Play with a Buddy over the tab-to-tab link (?mp=local).
// Needs Playwright; three.js is read from tools/.cache/three (run smoke-test.mjs once to fetch it).
// Usage: NODE_PATH=$(npm root -g) node tools/mp-test.mjs   (PHONE=1 runs only the phone part)
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
import path from 'path';
const require = createRequire(import.meta.url);
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const THREE = path.join(ROOT, 'tools/.cache/three');
const port = 8765;
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const BASE = `http://127.0.0.1:${port}`;
const OUT = process.env.OUT || path.join(ROOT, 'tools', '.cache');
const browser = await chromium.launch();
let fails = 0;
const check = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
async function mkctx(vp) {
  const ctx = await browser.newContext(vp);
  await ctx.route(/three\.js\/r128\/three\.min\.js|three@0\.128\.0\/build\/three\.min\.js/, r => r.fulfill({ path: path.join(THREE, 'build/three.min.js'), contentType: 'application/javascript' }));
  await ctx.route(/fonts\.googleapis|fonts\.gstatic/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route(/GLTFLoader\.js$/, r => r.fulfill({ path: path.join(THREE, 'examples/js/loaders/GLTFLoader.js'), contentType: 'application/javascript' }));
  return ctx;
}
async function open(ctx, q) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/TUNNEL|ERR_PROXY|ERR_CONNECTION/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await page.goto(BASE + '/index.html' + q, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof G !== 'undefined' && window.MP, null, { timeout: 20000 });
  await page.evaluate(() => { renderer.render = () => { }; });
  page.errs = errs;
  return page;
}
if (!process.env.PHONE) {
const ctx = await mkctx({ viewport: { width: 1280, height: 800 } });
const a = await open(ctx, '?mp=local');
// No config + no room: button opens setup
await a.click('#mp-btn');
await a.fill('#mp-name', 'Dad');
await a.click('.mp-emoji >> nth=4');
await a.click('text=Make a room');
await a.waitForFunction(() => MP.room);
const code = await a.evaluate(() => MP.room);
check('room created', /^[A-Z]{4}$/.test(code), code);
await a.waitForTimeout(800);
await a.screenshot({ path: OUT + '/1-host-modal.png' });
await a.click('#mp-modal-body .mp-btn-ghost');
check('split mode on', await a.evaluate(() => document.body.classList.contains('mp-split')));
// second player in another tab (same browser so BroadcastChannel reaches)
const b = await open(ctx, '?mp=local');
await b.evaluate(() => { MP.leave(); localStorage.removeItem('nugget_mp_profile'); });
await b.click('#mp-btn');
await b.fill('#mp-name', 'Kiddo');
await b.fill('#mp-code', code.toLowerCase());
await b.click('#mp-modal-body button:has-text("Join")');
await b.waitForFunction(() => MP.room);
await b.evaluate(() => { G.aura = 123456; G.auraPerSecond = 50; G.kekCoins = 42; G.totalClicks += 30; });
await a.waitForFunction(() => MP.buddy && MP.buddy.name === 'Kiddo', null, { timeout: 5000 });
check('A sees B', true);
await b.waitForFunction(() => MP.buddy && MP.buddy.name, null, { timeout: 5000 });
check('B sees A', true);
await a.waitForTimeout(800);
const auraTxt = await a.textContent('#mp-aura');
check('A shows B aura', /123|12[34]/.test(auraTxt.replace(/,/g, '')), auraTxt);
// events: pack + nyan + boss
await b.evaluate(() => { G.kekCoins = 999; G.cardShopUnlocked = true; buyPack(); });
await b.evaluate(() => { spawnNyanCat(); startBossFight(); });
await a.waitForTimeout(900);
const feed = await a.textContent('#mp-feed');
check('feed has pack', /pulled/.test(feed), feed.slice(0, 200));
check('feed has boss', /Skibidi/.test(feed));
check('A shows boss badge', /BOSS/.test(await a.textContent('#mp-badges')));
await a.screenshot({ path: OUT + '/2-host-split.png' });
// B leaves -> A shows away
await b.close();
await a.waitForTimeout(600);
check('A shows away', await a.evaluate(() => document.getElementById('mp-panel').classList.contains('mp-away')));
// reload A -> auto rejoin
await a.reload();
await a.waitForFunction(() => window.MP && MP.room, null, { timeout: 10000 });
check('A rejoins after reload', true, await a.evaluate(() => MP.room));
check('no page errors A', a.errs.length === 0, a.errs.join(' | '));
check('no page errors B', b.errs.length === 0, b.errs.join(' | '));
await ctx.close();
}
// Phone portrait
const pctx = await mkctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const p1 = await open(pctx, '?mp=local');
await p1.evaluate(() => { localStorage.setItem('nugget_mp_profile', JSON.stringify({ name: 'Phone', emoji: '🐸' })); });
const p2 = await open(pctx, '?mp=local');
await p1.evaluate(c => { localStorage.setItem('nugget_mp_room', c); }, 'QZXK');
await p1.reload(); await p1.waitForFunction(() => window.MP && MP.room);
await p2.evaluate(() => { location.search = '?mp=local&room=QZXK'; });
await p2.waitForFunction(() => window.MP && MP.room, null, { timeout: 10000 });
await p1.waitForFunction(() => MP.buddy, null, { timeout: 5000 });
await p1.waitForTimeout(500);
await p1.screenshot({ path: OUT + '/3-phone-strip.png' });
await p1.tap('#mp-strip');
await p1.waitForTimeout(500);
await p1.screenshot({ path: OUT + '/4-phone-open.png' });
// Not configured (no mp=local)
const nctx = await mkctx({ viewport: { width: 1280, height: 800 } });
const n = await open(nctx, '');
await n.click('#mp-btn');
check('pairing form without ?mp (Firebase configured)', /Make a room|isn't set up/.test(await n.textContent('#mp-modal-body')));
check('no errors unconfigured', n.errs.length === 0, n.errs.join(' | '));
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
