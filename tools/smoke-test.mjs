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
  await waitModels(page, errs);
  if (!render) await skipWebGL(page);
  return { ctx, page, errs };
}
// All three GLBs, so a later reload can't abort a model fetch mid-flight (a false console error)
async function waitModels(page, errs) {
  await page.waitForFunction(() => nuggetModel && kekCoinTemplate && packModel, null, { timeout: 60000 }).catch(() => errs.push('models did not load'));
}
async function reloadPage(page, errs) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof G !== 'undefined' && typeof activateBurn === 'function');
  await waitModels(page, errs);
  await skipWebGL(page);
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
// No passive income while measuring a payout (gameLoop reads apsBuffMult), no frenzy from synthetic clicks.
async function noPassive(page) {
  await page.evaluate(() => {
    window._realApsBuffMult = window._realApsBuffMult || apsBuffMult; apsBuffMult = () => 0; G.frenzyCooldown = 1e9;
    window._cv = () => { const bs = getBinderStats(); return (G.auraPerClick + bs.addApc) * (G.allAuraMult + bs.addMult + getFieldMult()); };
  });
}
// Activates a burn and plays it with a MutationObserver: 'hit' answers every prompt / clicks every
// coin, target and pulse; 'miss' answers every arrow wrong and ignores the rest. Returns EAS + Kek gained.
async function playBurn(page, id, mode, ms) {
  await page.evaluate(([id, mode]) => {
    window._a0 = G.aura; window._k0 = G.kekCoins;
    window._obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (!(n instanceof HTMLElement)) return;
      const t = n.textContent;
      if (n.style.zIndex === '600' && (t === '⬅️' || t === '➡️')) {
        const left = (t === '⬅️') === (mode === 'hit');
        setTimeout(() => document.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: left ? 100 : window.innerWidth - 100 })), 40);
      } else if (mode === 'hit' && (n.classList.contains('rhythm-zone') || n.classList.contains('burn-coin') || n.classList.contains('burn-target') || (n.style.zIndex === '600' && (t === '🎵' || t === '💥')))) {
        // targets: hit until dead (a removed node can't be clicked in the real UI)
        setTimeout(() => { for (let i = 0; i < 20; i++) { n.click(); if (!n.isConnected || !n.classList.contains('burn-target')) break; } }, 40);
      }
    })));
    window._obs.observe(document.body, { childList: true, subtree: true });
    devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id);
  }, [id, mode]);
  await sleep(ms);
  return page.evaluate(() => { window._obs.disconnect(); return { eas: +((G.aura - window._a0) / computeBaseEAS()).toFixed(2), kek: G.kekCoins - window._k0 }; });
}
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
  await reloadPage(page, errs);
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
    const charlie = await page.evaluate(() => CARD_BY_ID.get('bu_c8').params.mult);   // 3 since B4
    check(`B1 Charlie during Rickroll: ${2 + charlie}× then back to 3× (no downgrade)`, r === 2 + charlie && r2.m === 3 && r2.rick > 55, JSON.stringify({ r, r2 }));

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
      G.clickBuffs.forEach(b => { b.easPerClick = 0; });   // multiplier check only (B4 D6 bonus is flat, B4 checks it)
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
      G.clickBuffs.forEach(b => { b.easPerClick = 0; });   // multiplier check only
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
      G.clickBuffs.find(b => b.src === 'bu_u6').easPerClick = 0;   // multiplier check only (Surgery's D6 is checked in B5)
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
      activeKekCoins.forEach(c => { c.collected = true; });   // Brian's coins would auto-collect (B3) mid-test
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
    await reloadPage(page, errs);
    r = await page.evaluate(() => G.brainMinutes);
    check('B1 Brain migration: old scalingStartTime → ≤ 30 min', r > 29.9 && r <= 30.5, String(r));
    await sleep(500);
    check('B1: no page/console errors', errs.length === 0, errs.slice(0, 8).join(' | '));
    await ctx.close();
  },

  async B2(browser) {
    let { ctx, page, errs } = await openPage(browser);
    await midState(page);
    const use = (ids) => page.evaluate((ids) => { for (const id of ids) { devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); } }, ids);
    const nug = () => page.evaluate(() => ({ t: $nuggetContainer.style.transform, o: $nuggetContainer.style.opacity, fx: JSON.stringify(G.nuggetFx), cls: document.body.className, filter: getComputedStyle(document.body).filter }));

    let r = await nug();
    check('B2 idle: body has no filter', r.filter === 'none', r.filter);

    // Dentist ×2 within 6 s: first ending doesn't shrink the nugget / clear the blur early
    await use(['bu_c16']);
    await sleep(2000);
    await use(['bu_c16']);
    await sleep(4600);
    r = await nug();
    check('B2 Dentist ×2: after the first ends, nugget still big + blurred', r.t.includes('scale(1.4)') && r.cls.includes('fx-blur'), JSON.stringify(r));
    await sleep(2200);
    r = await nug();
    check('B2 Dentist ×2: both ended → nugget normal, no blur', r.t.includes('scale(1)') && !r.cls.includes('fx-blur') && r.filter === 'none', JSON.stringify(r));

    // Surgery → Cena → Dentist, then all end
    await use(['bu_u6']);
    await sleep(300);
    await use(['bu_r1']);
    await sleep(300);
    await use(['bu_c16']);
    r = await nug();
    const during = r;
    await sleep(15800);
    r = await nug();
    check('B2 Surgery → Cena → Dentist: shrunk + invisible during, restored after all end', during.t.includes('scale(0.35)') && during.o === '0.05' && r.t.includes('scale(1)') && r.o === '', JSON.stringify({ during, after: r }));
    await page.evaluate(() => { G.clickBuffs = []; });

    // Big Chungus scale (+ hitbox during Surgery)
    r = await page.evaluate(() => { _binderSelectedSlot = 0; devGiveCard('bi_u3'); equipCard('bi_u3'); const a = $nuggetContainer.style.transform; unequipSlot(0); return [a, $nuggetContainer.style.transform]; });
    check('B2 Big Chungus: nugget 1.5× while slotted, 1× after', r[0].includes('scale(1.5)') && r[1].includes('scale(1)'), r.join(' → '));

    // Leroy + Ugandan together: Leroy's timeout doesn't remove Ugandan's targets
    await use(['bu_u3']);
    await sleep(200);
    await use(['bu_r3']);
    await sleep(3400);
    r = await page.evaluate(() => [...document.querySelectorAll('#burn-fx .burn-target')].map(t => t.textContent));
    check('B2 Leroy + Ugandan: Ugandan targets survive Leroy\'s timeout', r.includes('🔴') && !r.includes('🛡️'), r.join(''));
    r = await page.evaluate(async () => {
      const a0 = G.aura, base = computeBaseEAS();
      for (let i = 0; i < 12; i++) { document.querySelectorAll('#burn-fx .burn-target').forEach(t => t.click()); await new Promise(res => setTimeout(res, 30)); }
      return (G.aura - a0) / base;
    });
    check('B2 Ugandan still pays after Leroy timed out', r > 170, r.toFixed(1));

    // Moth: swap fields mid-blackout
    r = await page.evaluate(() => {
      _binderSelectedSlot = 'field'; devGiveCard('f4'); devGiveCard('f1'); equipCard('f4');
      _mothBlackoutStart(5);
      equipCard('f1');
      return { active: _mothBlackoutActive, op: document.getElementById('moth-blackout').style.opacity, acc: _mothBlackoutAccum };
    });
    check('B2 Moth: swapping fields mid-blackout clears it', !r.active && r.op === '0' && r.acc === 0, JSON.stringify(r));

    // Sigma Slam + Spiderman: card kept; Boyfriend echo still allowed
    r = await page.evaluate(() => {
      _binderSelectedSlot = 'field'; devGiveCard('f2'); equipCard('f2');
      devGiveCard('bu_c3'); const n0 = G.collection.bu_c3; G.burnCooldownUntil = 0; activateBurn('bu_c3');
      devGiveCard('bu_c4'); const b0 = G.collection.bu_c4; G.burnCooldownUntil = 0; activateBurn('bu_c4');
      const out = { spider: G.collection.bu_c3 === n0, boyfriend: G.collection.bu_c4 === b0 - 1, echo: hasEcho(), blockedCls: !!document.querySelector('.burn-card-wrap.blocked') };
      unequipFieldSlot(); G.clickBuffs = [];
      return out;
    });
    check('B2 Sigma + Spiderman: card kept (shown blocked); Boyfriend echo allowed', r.spider && r.boyfriend && r.echo && r.blockedCls, JSON.stringify(r));

    // 38 Burn types: sorted by rarity, paged, every card reachable
    r = await page.evaluate(() => {
      CARD_LIBRARY.filter(c => c.type === 'Burn').forEach(c => { G.collection[c.id] = 2; });
      G.burnBarPage = 0; renderBurnBar();
      const seen = [], firstPage = [];
      for (let pg = 0; pg < 10; pg++) {
        const names = [...$burnBarItems.querySelectorAll('.burn-card-wrap')].map(w => w.title.split(' — ')[0]);
        if (pg === 0) firstPage.push(...names);
        seen.push(...names);
        const next = [...$burnBarItems.querySelectorAll('.burn-page-btn')].pop();
        if (!next || next.disabled) break;
        next.click();
      }
      const rares = CARD_LIBRARY.filter(c => c.type === 'Burn' && c.rarity === 'rare').map(c => c.name);
      return { n: new Set(seen).size, page: G.burnBarPage, rareFirst: rares.every((nm, i) => firstPage[i] === nm), last: seen[seen.length - 1] };
    });
    check('B2 burn bar: 38 types reachable over pages, rares first', r.n === 38 && r.page === 3 && r.rareFirst && r.last === 'All Your Base', JSON.stringify(r));

    // Boss: burn bar sits above the overlay; Dream and Vitas castable by a real click; SWK blocked
    await page.evaluate(() => { G.burnBarPage = 0; for (const id of Object.keys(G.collection)) if (CARD_BY_ID.get(id).type === 'Burn') G.collection[id] = 0; G.collection.bu_c9 = 1; G.collection.bu_c12 = 1; G.collection.bu_c11 = 1; G.burnCooldownUntil = 0; startBossFight(); });
    // A point where this card (not an overlapping neighbour) is the top element
    const box = async (name) => page.evaluate((name) => {
      const w = [...document.querySelectorAll('.burn-card-wrap')].find(w => w.title.startsWith(name)); const r = w.getBoundingClientRect();
      for (let fy = 0.1; fy < 0.9; fy += 0.1) for (let fx = 0.1; fx < 0.9; fx += 0.1) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y)?.closest('.burn-card-wrap') === w) return { x, y };
      }
      return { x: r.left + 5, y: r.top + 5 };
    }, name);
    r = await page.evaluate(async () => { const w = [...document.querySelectorAll('.burn-card-wrap')][0]; const b = w.getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + 10); return !!el.closest('#burn-bar'); });
    check('B2 boss: burn bar is on top of the boss overlay', r);
    let b = await box('Have You Ever Had A Dream');
    await page.mouse.move(b.x, b.y); await page.mouse.click(b.x, b.y);
    await page.evaluate(() => { G.burnCooldownUntil = 0; });
    b = await box('Vitas');
    await page.mouse.move(b.x, b.y); await page.mouse.click(b.x, b.y);
    await page.evaluate(() => { G.burnCooldownUntil = 0; });
    b = await box('Star Wars Kid');
    await page.mouse.move(b.x, b.y); await page.mouse.click(b.x, b.y);
    await sleep(800);
    r = await page.evaluate(() => ({ dream: G.collection.bu_c9, vitas: G.collection.bu_c12, swk: G.collection.bu_c11, frozen: G.bossPauseTimer > 0, hits: G.boss ? G.boss.defeatClicks.length : -1 }));
    check('B2 boss: Dream and Vitas cast from the bar (freeze + pierce), SWK kept', r.dream === 0 && r.vitas === 0 && r.swk === 1 && r.frozen && r.hits > 0, JSON.stringify(r));
    await page.evaluate(() => { if (G.boss) endBossFight(false); });

    // GigaChad + Ohio is grey; AYB + Dentist overlap
    r = await page.evaluate(() => {
      _binderSelectedSlot = 0; devGiveCard('bi_r3'); equipCard('bi_r3'); updateBinderSlotsUI();
      _binderSelectedSlot = 'field'; equipCard('f1');
      return getComputedStyle(document.body).filter;
    });
    check('B2 GigaChad + Ohio: grayscale kept with the Field filter', r.includes('grayscale(1)') && r.includes('saturate'), r);
    await use(['bu_c18']);
    await sleep(2000);
    await use(['bu_c16']);
    await sleep(500);
    const both = await page.evaluate(() => getComputedStyle(document.body).filter);
    await sleep(3000);
    r = await page.evaluate(() => getComputedStyle(document.body).filter);
    check('B2 AYB + Dentist: both filters at once, AYB ends without clearing the blur', both.includes('sepia') && both.includes('blur') && !r.includes('sepia') && r.includes('blur') && r.includes('grayscale(1)'), `${both} → ${r}`);
    await sleep(4000);
    await page.evaluate(() => { unequipFieldSlot(); unequipSlot(0); updateBinderSlotsUI(); });

    // awardKek fallback: models missing → Brian still pays 2
    r = await page.evaluate(() => { const t = kekCoinTemplate; kekCoinTemplate = null; const k0 = G.kekCoins; devGiveCard('bu_c6'); G.burnCooldownUntil = 0; activateBurn('bu_c6'); return new Promise(res => setTimeout(() => { kekCoinTemplate = t; res(G.kekCoins - k0); }, 600)); });
    check('B2 Kek coin fallback: Brian pays 2 without models', r === 2, String(r));

    // Reload during the pack animation keeps the card
    r = await page.evaluate(() => { G.kekCoins = 500; for (const k of Object.keys(G.collection)) G.collection[k] = 0; buyPack(); return { id: _pendingCard.id, n: G.collection[_pendingCard.id] }; });
    await reloadPage(page, errs);
    const after = await page.evaluate((id) => G.collection[id], r.id);
    check('B2 reload mid-pack: card kept', r.n === 1 && after === 1, `${r.id}: ${r.n} → ${after}`);

    // FWP after reload: idle bonus starts 5 s after load without a click
    await page.evaluate(() => { _binderSelectedSlot = 0; devGiveCard('bi_c6'); equipCard('bi_c6'); G.auraPerSecond = 740; saveGame(); });
    await reloadPage(page, errs);
    r = await page.evaluate(() => (Date.now() - G.lastIdleClickTime) / 1000);
    await sleep(6000);
    const rate = await page.evaluate(() => new Promise(res => { eventCooldown = 1e9; const a0 = G.aura, t0 = performance.now(); setTimeout(() => res((G.aura - a0) / ((performance.now() - t0) / 1000) / computeBaseEAS()), 1000); }));
    check('B2 FWP after reload: idle clock starts at load, 1.5× APS after 5 s', r < 5 && rate > 1.4 && rate < 1.6, `since load ${r.toFixed(1)}s, rate ${rate.toFixed(2)}× APS`);

    await sleep(300);
    check('B2: no page/console errors', errs.length === 0, errs.slice(0, 8).join(' | '));
    await ctx.close();
  },

  async B3(browser) {
    const { ctx, page, errs } = await openPage(browser);
    await midState(page);
    const use = (ids) => page.evaluate((ids) => { for (const id of ids) { devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); } }, ids);
    let r;

    // Rickroll fake crash overlay, gone after 1.5 s; buff already running
    await use(['bu_u12']);
    r = await page.evaluate(() => ({ crash: !!document.querySelector('.fake-crash'), pe: document.querySelector('.fake-crash')?.style.pointerEvents, aps: apsBuffMult() }));
    await sleep(1900);
    const gone = await page.evaluate(() => !document.querySelector('.fake-crash'));
    check('B3 Rickroll: fake crash shown (click-through), gone after 1.5 s, buff live', r.crash && r.pe === 'none' && r.aps === 3 && gone, JSON.stringify({ ...r, gone }));
    await page.evaluate(() => { G.apsBuffs = []; });

    // Kek coin auto-collects after 20 s idle, but not under Sigma Slam
    const idleCoin = (sigma) => page.evaluate(async (sigma) => {
      _binderSelectedSlot = 'field';
      if (sigma) { devGiveCard('f2'); equipCard('f2'); } else unequipFieldSlot();
      activeKekCoins.forEach(c => { c.collected = true; });
      await new Promise(res => setTimeout(res, 100));
      const k0 = G.kekCoins;
      spawnKekCoin();
      const coin = activeKekCoins[activeKekCoins.length - 1];
      while (coin.phase !== 'idle') await new Promise(res => setTimeout(res, 50));
      coin.idleAge = KEK_IDLE_TIMEOUT_S - 0.3;   // skip most of the 20 s wait
      await new Promise(res => setTimeout(res, 800));
      const out = { collected: coin.collected, kek: G.kekCoins - k0 };
      if (sigma) unequipFieldSlot();
      return out;
    }, sigma);
    r = await idleCoin(false);
    const rs = await idleCoin(true);
    check('B3 Kek coin auto-collects after 20 s idle; never under Sigma Slam', r.collected && r.kek === 1 && !rs.collected && rs.kek === 0, JSON.stringify({ normal: r, sigma: rs }));

    // Pepe: label shows the mode + seconds, changes with the mood, logs; timer only runs while slotted
    r = await page.evaluate(async () => {
      G.moodIndex = 0; G.moodTimer = 5;
      await new Promise(res => setTimeout(res, 300));
      const frozen = G.moodTimer === 5;
      _binderSelectedSlot = 0; devGiveCard('bi_r2'); equipCard('bi_r2');
      await new Promise(res => setTimeout(res, 300));
      const label = () => _slotRefs.binder[0].thumb.querySelector('.slot-card-fx').textContent;
      const a = label();
      G.moodTimer = 29.8;
      await new Promise(res => setTimeout(res, 600));
      const b = label();
      saveGame();
      return { frozen, a, b, idx: G.moodIndex, logged: document.getElementById('log-content').textContent.includes("Pepe's mood") };
    });
    check('B3 Pepe: label "Mood: +20% APS (Ns)" → next mode, logged; frozen while unslotted', r.frozen && /^Mood: \+20% APS \(\d+s\)$/.test(r.a) && /^Mood: \+20% APC \(\d+s\)$/.test(r.b) && r.idx === 1 && r.logged, JSON.stringify(r));
    await reloadPage(page, errs);
    await midState(page);
    r = await page.evaluate(() => ({ idx: G.moodIndex, t: G.moodTimer }));
    check('B3 Pepe: moodIndex / moodTimer saved and loaded', r.idx === 1 && r.t >= 0 && r.t < 5, JSON.stringify(r));
    await page.evaluate(() => unequipSlot(0));

    // Ugandan spawns all 8 at once
    await use(['bu_u3']);
    r = await page.evaluate(() => document.querySelectorAll('#burn-fx .burn-target').length);
    check('B3 Ugandan: 8 knuckles at once', r === 8, String(r));
    await page.evaluate(() => document.querySelectorAll('#burn-fx .burn-target').forEach(t => t.click()));

    // End of Ze World pays per kill, Kek bonus only for all 25
    await use(['bu_r5']);
    r = await page.evaluate(async () => {
      const base = computeBaseEAS(), k0 = G.kekCoins;
      let a0 = G.aura; document.querySelector('#burn-fx .burn-target').click();
      const first = (G.aura - a0) / base, kekAfterOne = G.kekCoins - k0;
      for (let i = 0; i < 24; i++) { await new Promise(res => setTimeout(res, 20)); document.querySelector('#burn-fx .burn-target')?.click(); }
      return { first, kekAfterOne, kek: G.kekCoins - k0, total: (G.aura - a0) / base };
    });
    check('B3 End of Ze World: 36 EAS per missile, +10 Kek only when all 25 die', Math.abs(r.first - 36) < 0.5 && r.kekAfterOne === 0 && r.kek === 10 && r.total > 899, JSON.stringify(r));

    // Numa: pulses away from the centre, gone after the 0.6 s hit window
    await use(['bu_u10']);
    await sleep(150);
    r = await page.evaluate(async () => {
      const find = () => [...document.querySelectorAll('div')].find(d => d.textContent === '🎵' && d.style.zIndex === '600');
      const el = find();
      const pos = el ? [el.style.left, el.style.top] : null;
      await new Promise(res => setTimeout(res, 750));
      return { pos, goneAfterWindow: !el || !el.parentNode };
    });
    const [lx, ty] = r.pos ? r.pos.map(parseFloat) : [NaN, NaN];
    check('B3 Numa: pulse at a random 25–75vw / 25–70vh spot, removed after 0.6 s', r.pos && r.pos[0].endsWith('vw') && lx >= 25 && lx <= 75 && ty >= 25 && ty <= 70 && r.goneAfterWindow, JSON.stringify(r));
    await sleep(10500);

    // Keyboard Cat zones leave the nugget clickable
    await use(['bu_u9']);
    r = await page.evaluate(() => { const z = document.querySelector('.rhythm-zone'); const c = $nuggetContainer.getBoundingClientRect(); const zr = z.getBoundingClientRect(); return { left: z.style.left, clear: zr.left > c.left + c.width / 2 }; });
    check('B3 Keyboard Cat: zones start at 60% (nugget centre clear)', r.left === '60%' && r.clear, JSON.stringify(r));
    await page.evaluate(() => document.querySelectorAll('.rhythm-zone').forEach(z => z.click()));
    await sleep(500);

    // Pigeon: zigzag stays on screen and wiggles
    await use(['bu_c2']);
    r = await page.evaluate(async () => {
      const el = await new Promise(res => { const t = setInterval(() => { const e = [...$burnFx.querySelectorAll('.burn-coin')].find(e => e.textContent === '🦋'); if (e) { clearInterval(t); res(e); } }, 20); });
      const xs = [];
      for (let i = 0; i < 12; i++) { xs.push(parseFloat(el.style.left)); await new Promise(res => setTimeout(res, 100)); }
      let turns = 0; for (let i = 2; i < xs.length; i++) if ((xs[i] - xs[i - 1]) * (xs[i - 1] - xs[i - 2]) < 0) turns++;
      return { min: Math.min(...xs), max: Math.max(...xs), turns };
    });
    check('B3 Pigeon: sine zigzag (direction changes), kept within 2–95vw', r.turns >= 1 && r.min >= 2 && r.max <= 95, JSON.stringify(r));

    // El Risitas violent shake; Ermahgerd particle; AYB trims old clicks
    await use(['bu_r4']);
    r = await page.evaluate(() => document.body.style.animation);
    check('B3 El Risitas: violent shake (12 iterations)', r.includes('12'), r);
    await use(['bu_c17']);
    r = await page.evaluate(() => { document.body.click(); return [...document.querySelectorAll('.click-particle')].some(p => p.textContent === '+3s!'); });
    check('B3 Ermahgerd: mash particle reads "+3s!"', r);
    r = await page.evaluate(() => { G.recentClickTimestamps = [Date.now() - 60000, Date.now() - 45000, Date.now() - 1000]; G.burnCooldownUntil = 0; devGiveCard('bu_c18'); activateBurn('bu_c18'); return G.recentClickTimestamps.length; });
    check('B3 All Your Base: reads only the last 30 s of clicks', r === 1, String(r));

    // Ohio: 30% boss chance; This is Fine reads its mult; Moth vignette follows the cursor; Philosoraptor ❓
    r = await page.evaluate(() => {
      _binderSelectedSlot = 'field'; devGiveCard('f1'); equipCard('f1');
      const realBoss = startBossFight; let bosses = 0; startBossFight = () => { bosses++; };
      const N = 4000;
      for (let i = 0; i < N; i++) { activeEvent = null; spawnEvent(); }
      startBossFight = realBoss; activeEvent = null;
      document.querySelectorAll('.event-entity').forEach(e => e.remove());
      unequipFieldSlot();
      return bosses / N;
    });
    check('B3 Ohio: boss chance per event ≈ 30%', r > 0.28 && r < 0.32, (r * 100).toFixed(1) + '%');
    r = await page.evaluate(() => { _binderSelectedSlot = 'field'; devGiveCard('f5'); equipCard('f5'); const p = CARD_BY_ID.get('f5').params; const m0 = p.mult; p.mult = 0.3; const v = getFieldMult(); p.mult = m0; unequipFieldSlot(); return v; });
    check('B3 This is Fine: base reads params.mult', Math.abs(r - 0.3) < 1e-9, String(r));
    await page.mouse.move(321, 234);
    r = await page.evaluate(() => [document.body.style.getPropertyValue('--mx'), document.body.style.getPropertyValue('--my')]);
    check('B3 Moth: vignette variables follow the cursor', r[0] === '321px' && r[1] === '234px', r.join(','));
    r = await page.evaluate(async () => {
      _binderSelectedSlot = 0; devGiveCard('bi_c4'); equipCard('bi_c4');
      CARD_BY_ID.get('bi_c4')._lastDrop = 1;
      await new Promise(res => setTimeout(res, 300));
      const drop = [...$burnFx.querySelectorAll('.burn-coin')].find(e => e.textContent === '❓');
      unequipSlot(0);
      return !!drop;
    });
    check('B3 Philosoraptor: drop is ❓', r);

    await sleep(1000);
    check('B3: no page/console errors', errs.length === 0, errs.slice(0, 8).join(' | '));
    await ctx.close();
  },

  async B4(browser) {
    const { ctx, page, errs } = await openPage(browser);
    await midState(page);
    const c = await nuggetCentre(page);
    const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    await noPassive(page);
    // Auto-click cards: D6 cap + clicks × mult × click value, in EAS
    for (const id of ['bu_c3', 'bu_c15', 'bu_c12']) {
      const w = await page.evaluate((id) => { window._a0 = G.aura; devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); return CARD_BY_ID.get(id).params.duration; }, id);
      await sleep(w * 1000 + 600);
      const r = await page.evaluate((id) => {
        const p = CARD_BY_ID.get(id).params, base = computeBaseEAS();
        return { eas: (G.aura - window._a0) / base, want: p.capEAS + p.clicks * p.mult * window._cv() / base, d6: p.capEAS };
      }, id);
      check(`B4 ${id}: auto-clicks pay ${r.d6} EAS D6 + click value`, near(r.eas, r.want), JSON.stringify(r));
    }
    // Manual-click buffs: D6 per click up to the cap
    const clickBuff = (id, n) => page.evaluate(([id, n, x, y]) => {
      G.clickBuffs = []; devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id);
      const p = CARD_BY_ID.get(id).params, base = computeBaseEAS(), cv = window._cv();
      const a0 = G.aura; for (let i = 0; i < n; i++) doClick(x, y);
      const clicks = p.echoClick ? 2 * n * cv : n * p.mult * cv;
      const out = { d6: (G.aura - a0 - clicks) / base, cap: p.capEAS };
      G.clickBuffs = [];
      return out;
    }, [id, n, c.x, c.y]);
    for (const [id, n] of [['bu_c4', 50], ['bu_c4', 80], ['bu_c11', 90], ['bu_c14', 30], ['bu_c14', 60]]) {
      const r = await clickBuff(id, n);
      check(`B4 ${id}: ${n} clicks bank ${r.cap} EAS (cap)`, near(r.d6, r.cap), JSON.stringify(r));
    }
    // Charlie / Dream: APS buff value + duration (+ Dream's freeze)
    let r = await page.evaluate(() => {
      apsBuffMult = window._realApsBuffMult;
      const out = {};
      for (const id of ['bu_c8', 'bu_c9']) { G.apsBuffs = []; devGiveCard(id); G.burnCooldownUntil = 0; activateBurn(id); out[id] = [apsBuffMult(), Math.round(G.apsBuffs[0].t)]; }
      out.freeze = Math.round(G.bossPauseTimer);
      G.apsBuffs = []; G.bossPauseTimer = 0; apsBuffMult = () => 0;
      return out;
    });
    check('B4 Charlie 3×/20 s, Dream 2×/30 s + 30 s boss freeze', r.bu_c8[0] === 3 && r.bu_c8[1] === 20 && r.bu_c9[0] === 2 && r.bu_c9[1] === 30 && r.freeze === 30, JSON.stringify(r));
    // Ravioli: 8 × 7.5 EAS
    await page.evaluate(() => { window._a0 = G.aura; devGiveCard('bu_c13'); G.burnCooldownUntil = 0; activateBurn('bu_c13'); document.querySelectorAll('#burn-fx .burn-coin.motion-fade').forEach(el => el.click()); });
    r = await page.evaluate(() => (G.aura - window._a0) / computeBaseEAS());
    check('B4 Ravioli: 8 pieces × 7.5 = 60 EAS', near(r, 60), r.toFixed(2));
    // Dentist: 45 EAS after the 6 s gag
    await page.evaluate(() => { window._a0 = G.aura; devGiveCard('bu_c16'); G.burnCooldownUntil = 0; activateBurn('bu_c16'); });
    await sleep(6400);
    r = await page.evaluate(() => (G.aura - window._a0) / computeBaseEAS());
    check('B4 Dentist: 45 EAS', near(r, 45), r.toFixed(2));
    // All Your Base counts clicks: 100 → floor 30, 180 → 45, 300 → cap 60
    r = await page.evaluate(() => [100, 180, 300].map(n => {
      const now = Date.now(); G.recentClickTimestamps = Array.from({ length: n }, (_, i) => now - i * 100);
      const a0 = G.aura; devGiveCard('bu_c18'); G.burnCooldownUntil = 0; activateBurn('bu_c18');
      return +((G.aura - a0) / computeBaseEAS()).toFixed(2);
    }));
    check('B4 All Your Base: 100 / 180 / 300 clicks → 30 / 45 / 60 EAS', near(r[0], 30) && near(r[1], 45) && near(r[2], 60), r.join(' / '));
    // Vitas alone wins a boss fight in 3 s
    await page.evaluate(() => { apsBuffMult = window._realApsBuffMult; startBossFight(); window._t0 = Date.now(); devGiveCard('bu_c12'); G.burnCooldownUntil = 0; activateBurn('bu_c12'); });
    await page.waitForFunction(() => !G.boss, null, { timeout: 8000 }).catch(() => { });
    r = await page.evaluate(() => ({ s: (Date.now() - window._t0) / 1000, won: document.getElementById('log-content').textContent.includes('Skibidi defeated') }));
    check('B4 Vitas: 20 piercing hits win the boss within ~3 s', r.won && r.s < 3.6, JSON.stringify(r));
    await sleep(500);
    check('B4: no page/console errors', errs.length === 0, errs.slice(0, 8).join(' | '));
    await ctx.close();
  },

  async B5(browser) {
    const { ctx, page, errs } = await openPage(browser);
    await midState(page);
    const c = await nuggetCentre(page);
    const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    await noPassive(page);
    let r;
    // Instant: MLG 160
    r = await page.evaluate(() => { const a0 = G.aura; devGiveCard('bu_u1'); G.burnCooldownUntil = 0; activateBurn('bu_u1'); return (G.aura - a0) / computeBaseEAS(); });
    check('B5 MLG Airhorn: 160 EAS', near(r, 160), r.toFixed(2));
    // Rhythm cards, perfect and 0-hit runs (linear from 0)
    for (const [id, want, ms] of [['bu_u4', 150, 11500], ['bu_u9', 120, 1500], ['bu_u10', 170, 11000]]) {
      for (const mode of ['hit', 'miss']) {
        r = await playBurn(page, id, mode, ms);
        check(`B5 ${id} ${mode === 'hit' ? 'perfect run' : '0 hits'}: ${mode === 'hit' ? want : 0} EAS`, near(r.eas, mode === 'hit' ? want : 0), JSON.stringify(r));
      }
    }
    // Britney: 8 hits → 240
    r = await playBurn(page, 'bu_u5', 'hit', 1500);
    check('B5 Leave Britney Alone: 8 hits → 240 EAS', near(r.eas, 240), JSON.stringify(r));
    // Surgery: every landed click banks 2.5 EAS up to 150 (on top of 5× clicks)
    r = await page.evaluate(([x, y]) => {
      G.clickBuffs = []; devGiveCard('bu_u6'); G.burnCooldownUntil = 0; activateBurn('bu_u6');
      const base = computeBaseEAS(), cv = window._cv(), out = [];
      for (const n of [40, 20, 20]) { const a0 = G.aura; for (let i = 0; i < n; i++) doClick(x, y); out.push(+((G.aura - a0 - n * 5 * cv) / base).toFixed(2)); }
      G.clickBuffs = [];
      return out;
    }, [c.x, c.y]);
    check('B5 Surgery: 40 / 20 / 20 clicks bank 100 / 50 / 0 EAS (cap 150)', near(r[0], 100) && near(r[1], 50) && near(r[2], 0), r.join(' / '));
    // Chocolate Rain: 15 drops × 6 + 5 Kek
    r = await playBurn(page, 'bu_u7', 'hit', 9500);
    check('B5 Chocolate Rain: 15 × 6 = 90 EAS + 5 Kek', near(r.eas, 90) && r.kek === 5, JSON.stringify(r));
    await sleep(500);
    check('B5: no page/console errors', errs.length === 0, errs.slice(0, 8).join(' | '));
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
