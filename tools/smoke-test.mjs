#!/usr/bin/env node
// ============================================================
// tools/smoke-test.mjs — browser smoke test for the balance batches (Playwright + Chromium)
//
//   node tools/smoke-test.mjs                # common checks + every batch's checks
//   node tools/smoke-test.mjs --batch B1     # common checks + only B1's checks
//   node tools/smoke-test.mjs --only B2      # only B2's checks (skip the common pass)
//
// Needs Playwright (global npm install is fine) and a Chromium build
// (PLAYWRIGHT_BROWSERS_PATH, default /opt/pw-browsers). The page loads three.js r128
// and GLTFLoader from CDNs; those requests are routed to an npm copy of three@0.128.0
// (THREE_DIR, default tools/.cache/three, fetched with `npm pack` on first run) so the
// test works offline / behind a proxy. The repo is served by `python3 -m http.server`
// on a free port.
//
// SwiftShader renders this page at ~1 fps, which starves timers and breaks every
// timing check. So after a short rendered phase (boot + a few burns with WebGL on),
// pages swap renderer.render for a matrix update only: game logic, DOM effects and
// Kek-coin raycasts all still run, only the WebGL draw is skipped.
//
// Common pass: boot, grant + activate every Burn (incl. "Use All"), cycle every Field,
// slot every Binder, save + reload. Then each batch's specific fixes (BATCH_TESTS).
// Exits non-zero on any failed check or any page / console error.
// ============================================================
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  try { tries.push(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (_) { }
  for (const t of tries) { try { return require(t); } catch (_) { } }
  throw new Error('Playwright not found: npm i -g playwright');
}
const { chromium } = loadPlaywright();

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = arg('--only');
const BATCH = ONLY || arg('--batch');

// ---------- three.js copy ----------
function threeDir() {
  const dir = process.env.THREE_DIR || path.join(ROOT, 'tools', '.cache', 'three');
  if (fs.existsSync(path.join(dir, 'build', 'three.min.js'))) return dir;
  const cache = path.dirname(dir);
  fs.mkdirSync(cache, { recursive: true });
  const tgz = execSync('npm pack three@0.128.0 --silent', { cwd: cache }).toString().trim().split('\n').pop();
  fs.mkdirSync(dir, { recursive: true });
  execSync(`tar -xzf ${JSON.stringify(tgz)} -C ${JSON.stringify(dir)} --strip-components=1`, { cwd: cache });
  fs.unlinkSync(path.join(cache, tgz));
  return dir;
}

// ---------- static server ----------
function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}
async function startServer() {
  const port = await freePort();
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base + '/index.html'); if (r.ok) return { proc, base }; } catch (_) { }
    await new Promise(r => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('http.server did not start');
}

// ---------- page helpers ----------
const THREE = threeDir();
let BASE;
const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function openPage(browser, { keepStorage = null, render = false } = {}) {
  const ctx = keepStorage || await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (!keepStorage) {
    await ctx.route(/three\.js\/r128\/three\.min\.js|three@0\.128\.0\/build\/three\.min\.js/, r => r.fulfill({ path: path.join(THREE, 'build/three.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/GLTFLoader\.js$/, r => r.fulfill({ path: path.join(THREE, 'examples/js/loaders/GLTFLoader.js'), contentType: 'application/javascript' }));
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errs.push(`http ${r.status()} ${decodeURIComponent(r.url().replace(BASE, ''))}`); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof G !== 'undefined' && typeof activateBurn === 'function', null, { timeout: 20000 });
  await page.waitForFunction(() => nuggetModel && kekCoinTemplate, null, { timeout: 60000 }).catch(() => errs.push('models did not load'));
  if (!render) await skipWebGL(page);
  return { ctx, page, errs };
}
// See header: keep logic + raycasts, skip the (very slow under SwiftShader) WebGL draw.
async function skipWebGL(page) {
  await page.evaluate(() => { renderer.render = () => { scene.updateMatrixWorld(); camera.updateMatrixWorld(); }; });
}

// Mid reference state (docs/review: APS 740, APC 51), shop unlocked, dev cheats on.
async function midState(page) {
  await page.evaluate(() => {
    G.owned = { ketchup: 40, ranch: 20, szechuan: 5, grimace: 2, sigma: 0 };
    G.auraPerSecond = 740; G.auraPerClick = 51; G.allAuraMult = 1;
    G.cardShopUnlocked = true; G.aura = 0; G.kekCoins = 0;
    eventCooldown = 1e9;          // no random events during the test
    document.getElementById('dev-menu-btn').style.display = 'inline-block';
    updateCardShopUI(); renderBurnBar();
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nuggetCentre = (page) => page.evaluate(() => { const r = $nuggetContainer.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });

// Bot: clicks every burn coin / target / rhythm prompt and the nugget, for ms.
async function bot(page, ms) {
  const t0 = Date.now();
  const c = await nuggetCentre(page);
  while (Date.now() - t0 < ms) {
    await page.evaluate(() => {
      document.querySelectorAll('#burn-fx .burn-coin:not(.collected), #burn-fx .burn-target').forEach(el => el.click());
      document.querySelectorAll('.burn-coin').forEach(el => el.dispatchEvent(new MouseEvent('mouseenter')));
      document.querySelectorAll('.rhythm-zone').forEach(z => z.click());
      [...document.querySelectorAll('div')].filter(d => (d.textContent === '🎵' || d.textContent === '💥') && d.style.zIndex === '600').forEach(d => d.click());
    });
    const side = await page.evaluate(() => { const a = [...document.querySelectorAll('div')].find(d => (d.textContent === '⬅️' || d.textContent === '➡️') && d.style.zIndex === '600'); return a ? a.textContent : null; });
    if (side) await page.mouse.click(side === '⬅️' ? 100 : 1180, 400);
    else await page.mouse.click(c.x, c.y);
    await sleep(150);
  }
}

// ---------- common pass ----------
async function commonPass(browser) {
  const { ctx, page, errs } = await openPage(browser, { render: true });
  check('boot: no page/console errors', errs.length === 0, errs.join(' | '));
  await midState(page);
  // Rendered phase: a few burns that touch the 3D scene / nugget with WebGL on
  await page.evaluate(() => { for (const id of ['bu_c6', 'bu_u6', 'bu_c16']) { devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); } });
  await sleep(6000);
  check('rendered phase: no page/console errors', errs.length === 0, errs.join(' | '));
  await skipWebGL(page);
  const burns = await page.evaluate(() => CARD_LIBRARY.filter(c => c.type === 'Burn').map(c => c.id));
  // Grant and activate every Burn, one after another (cooldown reset between)
  const used = [];
  for (const id of burns) {
    const ok = await page.evaluate((id) => {
      devGiveCard(id); G.burnCooldownUntil = 0;
      const before = G.collection[id];
      activateBurn(id);
      return G.collection[id] === before - 1;
    }, id);
    if (!ok) used.push(id);
    await bot(page, 300);
  }
  check('every Burn activates and is consumed', used.length === 0, used.length ? 'not consumed: ' + used.join(', ') : `${burns.length} burns`);
  await bot(page, 16000);   // let every window / timer finish
  // Multi-burn: 5 copies of each multi-copy card
  const multi = await page.evaluate(() => CARD_LIBRARY.filter(c => c.params && c.params.multiKekBonus).map(c => c.id));
  for (const id of multi) {
    await page.evaluate((id) => { for (let i = 0; i < 5; i++) devGiveCard(id); G.burnCooldownUntil = 0; activateBurnMulti(id); }, id);
    await bot(page, 300);
  }
  const left = await page.evaluate((ids) => ids.map(id => G.collection[id]), multi);
  check('"Use All" consumes at most MULTI_COPY_CAP', left.every(n => n === 2), `left after 5 copies: ${left.join(',')}`);
  await bot(page, 21000);   // Gabe's bone wave
  // Cycle every Field
  const fields = await page.evaluate(() => CARD_LIBRARY.filter(c => c.type === 'Field').map(c => c.id));
  for (const id of fields) {
    await page.evaluate((id) => { devGiveCard(id); _binderSelectedSlot = 'field'; equipCard(id); }, id);
    await bot(page, 1200);
  }
  await page.evaluate(() => unequipFieldSlot());
  // Slot every Binder (three rounds of 5)
  const binders = await page.evaluate(() => CARD_LIBRARY.filter(c => c.type === 'Binder').map(c => c.id));
  for (let i = 0; i < binders.length; i++) {
    await page.evaluate(([id, slot]) => { devGiveCard(id); _binderSelectedSlot = slot; equipCard(id); }, [binders[i], i % 5]);
    if (i % 5 === 4) await bot(page, 1500);
  }
  const slotted = await page.evaluate(() => G.binderSlots.slice());
  check('binders slot', slotted.every(Boolean), slotted.join(','));
  // Save + reload
  const saved = await page.evaluate(() => { saveGame(); return { coll: JSON.stringify(G.collection), slots: G.binderSlots.join(','), kek: G.kekCoins }; });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof G !== 'undefined' && typeof activateBurn === 'function');
  const loaded = await page.evaluate(() => ({ coll: JSON.stringify(G.collection), slots: G.binderSlots.join(','), kek: G.kekCoins }));
  check('save + reload restores collection, binder and Kek', loaded.coll === saved.coll && loaded.slots === saved.slots && loaded.kek === saved.kek);
  await sleep(1500);
  check('common pass: no page/console errors', errs.length === 0, errs.slice(0, 8).join(' | '));
  await ctx.close();
}

// ---------- per-batch checks ----------
const BATCH_TESTS = {
  async B1(browser) {
    const { ctx, page, errs } = await openPage(browser);
    await midState(page);
    const c = await nuggetCentre(page);
    const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

    // SWK -> Chipmunk: additive, own timers, Chipmunk can't extend SWK
    let r = await page.evaluate(() => {
      for (const id of ['bu_c11', 'bu_c14']) { devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); }
      const out = { mult: clickBuffMult(true), t: G.clickBuffs.map(b => [b.src, +b.t.toFixed(1)]) };
      G.clickBuffs.find(b => b.src === 'bu_c14').t = 0.01;
      return out;
    });
    await sleep(400);
    let r2 = await page.evaluate(() => ({ mult: clickBuffMult(true), swk: G.clickBuffs.find(b => b.src === 'bu_c11')?.t }));
    check('B1 SWK → Chipmunk stack additively (6×), Chipmunk ends alone (2×), SWK timer untouched', r.mult === 6 && r2.mult === 2 && r2.swk > 12 && r2.swk < 15, JSON.stringify({ r, r2 }));
    await page.evaluate(() => { G.clickBuffs = []; });

    // Charlie during Rickroll: 1 + 2 + 0.5, then Rickroll alone
    r = await page.evaluate(() => {
      for (const id of ['bu_u12', 'bu_c8']) { devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); }
      const m = apsBuffMult();
      G.apsBuffs.find(b => b.src === 'bu_c8').t = 0.01;
      return m;
    });
    await sleep(400);
    r2 = await page.evaluate(() => ({ m: apsBuffMult(), rick: G.apsBuffs.find(b => b.src === 'bu_u12')?.t }));
    check('B1 Charlie during Rickroll: 3.5× then back to 3× (no downgrade)', r === 3.5 && r2.m === 3 && r2.rick > 55, JSON.stringify({ r, r2 }));

    // Rickroll then Leroy pays 900 base EAS (Rickroll still active from above)
    await page.evaluate(() => { devGiveCard('bu_r3'); G.burnCooldownUntil = 0; activateBurn('bu_r3'); });
    r = await page.evaluate(() => {
      const t = document.querySelector('#burn-fx .burn-target');
      const base = computeBaseEAS(), a0 = G.aura;
      t.click();
      return { eas: (G.aura - a0) / base, rick: apsBuffMult() };
    });
    check('B1 Rickroll then Leroy pays 900 EAS (base, not ×3)', near(r.eas, 900) && r.rick === 3, JSON.stringify(r));
    // Combo 1: Rickroll + El Risitas pays 600 base EAS
    r = await page.evaluate(() => {
      devGiveCard('bu_r4'); G.burnCooldownUntil = 0;
      const base = computeBaseEAS(), a0 = G.aura;
      activateBurn('bu_r4');
      return (G.aura - a0) / base;
    });
    check('B1 combo 1 (Rickroll + El Risitas): 600 EAS', near(r, 600), r.toFixed(1));
    await page.evaluate(() => { G.apsBuffs = []; });

    // Combo 6: frenzy + SWK + Chipmunk + Chuck crit ≤ CLICK_TOTAL_CAP × frenzy
    r = await page.evaluate(([x, y]) => {
      for (const id of ['bu_c11', 'bu_c14']) { devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); }
      G.binderSlots = ['bi_r1', null, null, null, null]; G.critClickCounter = 9; G.frenzyActive = true;
      const bs = getBinderStats();
      const base = (G.auraPerClick + bs.addApc) * (G.allAuraMult + bs.addMult + getFieldMult());
      const a0 = G.aura; doClick(x, y);
      G.frenzyActive = false; G.binderSlots = [null, null, null, null, null]; G.clickBuffs = [];
      return (G.aura - a0) / base;
    }, [c.x, c.y]);
    check('B1 combo 6 (frenzy + SWK + Chipmunk + crit): 6× buffs × crit 10 = 60 (cap 100), × frenzy 10 = 600×', near(r, 600), r.toFixed(1));

    // Gyatt then SWK: Gyatt not extended; total click cap 100
    r = await page.evaluate(() => {
      EVENTS[1].reward(G);
      G.clickBuffs[0].t = 3;
      devGiveCard('bu_c11'); G.burnCooldownUntil = 0; activateBurn('bu_c11');
      return { mult: clickBuffMult(true), gy: G.clickBuffs.find(b => b.src === 'gyatt').t };
    });
    check('B1 Gyatt then SWK: Gyatt timer not extended, buffs 101×', r.mult === 101 && r.gy <= 3, JSON.stringify(r));
    r = await page.evaluate(([x, y]) => {
      const bs = getBinderStats();
      const base = (G.auraPerClick + bs.addApc) * (G.allAuraMult + bs.addMult + getFieldMult());
      const a0 = G.aura; G.frenzyActive = false; G.doubleNextClick = true;
      doClick(x, y);
      return (G.aura - a0) / base;
    }, [c.x, c.y]);
    check('B1 CLICK_TOTAL_CAP: Gyatt + SWK + Arthur click = 100× (not 202×)', near(r, 100), r.toFixed(2));
    await sleep(3500);
    r = await page.evaluate(() => G.clickBuffs.map(b => b.src));
    check('B1 Gyatt expires on its own timer, SWK keeps running', r.length === 1 && r[0] === 'bu_c11', r.join(','));
    await page.evaluate(() => { G.clickBuffs = []; });

    // OAG then Surgery: OAG's window survives, centre Kek every 5th, capped at 15, D6 capped at 90
    r = await page.evaluate(([x, y, w]) => {
      for (const id of ['bu_r6', 'bu_u6']) { devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); }
      const k0 = G.kekCoins;
      const bs = getBinderStats();
      const base = (G.auraPerClick + bs.addApc) * (G.allAuraMult + bs.addMult + getFieldMult());
      let a0 = G.aura; doClick(x + w * 0.3, y); const miss = (G.aura - a0) / base;
      a0 = G.aura; doClick(x, y); const hitEAS = G.aura - a0;
      for (let i = 0; i < 199; i++) doClick(x, y);
      const oag = G.clickBuffs.find(b => b.src === 'bu_r6');
      return { miss, hitEAS, kek: G.kekCoins - k0, paid: oag.paidEAS, srcs: G.clickBuffs.map(b => b.src).join(',') };
    }, [c.x, c.y, c.w]);
    check('B1 OAG then Surgery: both windows live; off-centre click loses only OAG share (5×)', r.srcs === 'bu_r6,bu_u6' && near(r.miss, 5), JSON.stringify(r));
    check('B1 OAG Kek capped at 15, D6 paid capped at 90 EAS', r.kek === 15 && r.paid === 90, JSON.stringify(r));
    await page.evaluate(() => { G.clickBuffs = []; });

    // Combo 7: OAG + SWK + frenzy — Kek still 15
    r = await page.evaluate(([x, y]) => {
      for (const id of ['bu_r6', 'bu_c11']) { devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); }
      G.frenzyActive = true; const k0 = G.kekCoins;
      for (let i = 0; i < 300; i++) doClick(x, y);
      G.frenzyActive = false;
      return G.kekCoins - k0;
    }, [c.x, c.y]);
    check('B1 combo 7 (OAG + SWK + frenzy): OAG Kek capped at 15', r === 15, `kek ${r}`);
    await page.evaluate(() => { G.clickBuffs = []; });

    // Brian ×5 uses 3, keeps 2, spawns 14 coins
    r = await page.evaluate(() => { activeKekCoins.length = 0; for (let i = 0; i < 5; i++) devGiveCard('bu_c6'); G.collection.bu_c6 = 5; G.burnCooldownUntil = 0; activateBurnMulti('bu_c6'); return G.collection.bu_c6; });
    await sleep(3000);
    r2 = await page.evaluate(() => activeKekCoins.length);
    check('B1 Brian ×5: uses 3, keeps 2, 14 coins', r === 2 && r2 === 14, `left ${r}, coins ${r2}`);

    // Gabe ×3 plays the bones once and pays per bone ×3
    await page.evaluate(() => {
      window._bones = 0;
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('motion-bones')) { window._bones++; setTimeout(() => n.click(), 50); } }))).observe($burnFx, { childList: true });
      G.collection.bu_u13 = 3; G.burnCooldownUntil = 0; window._k0 = G.kekCoins; activateBurnMulti('bu_u13');
    });
    await page.waitForFunction(() => /Gabe: \d+\/25/.test(document.getElementById('log-content').textContent), null, { timeout: 60000 }).catch(() => { });
    r = await page.evaluate(() => ({ bones: window._bones, kek: G.kekCoins - window._k0, left: G.collection.bu_u13, log: [...document.querySelectorAll('.log-entry')].map(e => e.textContent).find(t => t.includes('Gabe:')) }));
    check('B1 Gabe ×3: one 25-bone run, all copies used, 0.4 × 3 Kek per bone', r.bones === 25 && r.left === 0 && r.kek === 30, JSON.stringify(r));

    // Expanding Brain: capped at +30%, saved, old-save migration
    r = await page.evaluate(() => { G.binderSlots = ['bi_u6', null, null, null, null]; G.brainMinutes = 500; return getBinderStats().apcMultBonus; });
    check('B1 Brain capped at +30% APC', near(r, 0.30), String(r));
    await page.evaluate(() => { G.brainMinutes = 0; });
    await sleep(1500);
    r = await page.evaluate(() => G.brainMinutes);
    check('B1 Brain counts minutes while slotted', r > 0 && r < 0.1, String(r));
    await page.evaluate(() => {
      saveGame();
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      delete s.brainMinutes; s.scalingStartTime = Date.now() - 3 * 3600 * 1000;
      _wipingSave = true;
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof G !== 'undefined' && typeof activateBurn === 'function');
    r = await page.evaluate(() => G.brainMinutes);
    check('B1 Brain migration: old scalingStartTime → ≤ 30 min', r > 29.9 && r <= 30.5, String(r));
    await sleep(500);
    check('B1: no page/console errors', errs.length === 0, errs.slice(0, 8).join(' | '));
    await ctx.close();
  },
};

// ---------- main ----------
const { proc, base } = await startServer();
BASE = base;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  if (!ONLY) await commonPass(browser);
  for (const [name, fn] of Object.entries(BATCH_TESTS)) {
    if (BATCH && BATCH !== name) continue;
    await fn(browser);
  }
} catch (e) {
  check('smoke test crashed', false, e.stack);
} finally {
  await browser.close();
  proc.kill();
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
