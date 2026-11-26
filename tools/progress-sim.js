#!/usr/bin/env node
// ============================================================
// tools/progress-sim.js — full-run progression simulator for the SAUCE upgrades (Node 22, no deps)
//
//   node tools/progress-sim.js                    # report for the UPGRADES in game.js
//   node tools/progress-sim.js --upgrades f.json  # try another UPGRADES array without editing game.js
//   node tools/progress-sim.js --hours 8 --seed 3
//
// Plays a whole run second by second for three player profiles and every income source:
//   • SAUCE upgrades, bought greedily (best "time to afford + payback" first)
//   • clicks, the Sigma Rizz Frenzy meter (≥ FRENZY_THRESHOLD_CPS for 3 s → 10× for 10 s, 30 s cooldown)
//   • random events (Skibidi boss reward, Level 67 Gyatt 100× clicks, Fanum Tax)
//   • Kek Koins → card shop → packs (real odds, dupe refunds, pity) → Binder (best 5 slotted),
//     Field (best mult) and Burns (average Mid payout per rarity from tools/card-sim.js, used on pull)
// Reads BAL, UPGRADES and CARD_LIBRARY from game.js as text (tools/lib/extract.js); no DOM code runs.
// It is a model, not the game: burn payouts are rarity averages, binder timing cards are folded in
// as Aura/s, and the player never idles. Use it to compare curves, not to predict exact minutes.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLiterals } = require('./lib/extract');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEED = Number(arg('--seed', 12345));
const HOURS = Number(arg('--hours', 6));
const RUNS = Number(arg('--runs', 5));
const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'game.js'), 'utf8');
const L = loadLiterals(SRC, ['BAL', 'UPGRADES', 'CARD_LIBRARY']);
const BAL = L.BAL, CARDS = L.CARD_LIBRARY;
const UPGRADES = arg('--upgrades') ? JSON.parse(fs.readFileSync(arg('--upgrades'), 'utf8')) : L.UPGRADES;

// Average Mid-state burn payout in EAS per rarity (tools/card-sim.js "Mid EAS-eq", skilled).
const BURN_EAS = { common: 28, uncommon: 85, rare: 400 };

const PROFILES = [
  { name: 'Casual', cps: 4, catchRate: 0.6, burnSkill: 0.65 },
  { name: 'Active', cps: 6, catchRate: 0.9, burnSkill: 1.0 },
  { name: 'Frenzy', cps: 8, catchRate: 0.95, burnSkill: 1.0 },
];

function rngFrom(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const POOLS = {};
for (const c of CARDS) { const g = c.type === 'Field' ? 'Field' : c.rarity; (POOLS[g] = POOLS[g] || []).push(c); }
const BINDERS = CARDS.filter(c => c.type === 'Binder');

// Binder effects folded into one stat block (mirrors getBinderStats + the per-click / timed parts).
function binderStats(slots, st) {
  const o = { addMult: 0, apsPct: 0, apcPct: 0, flatApc: 0, critMult: 1, costReduce: 0, easPerSec: 0, kekPerSec: 0, kekInterval: BAL.KEK_BASE_CLICK_INTERVAL, packDiscount: 0, rareBonus: 0, mythicBonus: 0 };
  for (const c of slots) {
    const p = c.params || {};
    switch (c.archetype) {
      case 'GLOBAL_MULT': o.addMult += p.mult || 0; break;
      case 'PASSIVE_APS_PCT': o.apsPct += p.pct || 0; break;
      case 'PASSIVE_APC_PCT': o.flatApc += p.flatApc || 0; o.kekInterval -= p.kekIntervalReduce || 0; break;
      case 'BIGGER_TARGET': o.apcPct += p.apcBonus || 0; break;
      case 'COST_REDUCTION': o.costReduce = Math.max(o.costReduce, p.reduce || 0); o.addMult += p.globalMult || 0; o.packDiscount += p.kekPackDiscount || 0; break;
      case 'EVENT_SOFTENER': o.addMult += p.globalMult || 0; break;
      case 'SCALING_OVER_TIME': o.apcPct += Math.min(p.capPct || 0, (p.apcPerMin || 0) * st.brainMin); break;
      case 'MOOD_SWING': o.apsPct += (p.moodAps || 0) / 3; o.apcPct += (p.moodApc || 0) / 3; o.addMult += (p.moodGlobal || 0) / 3; break;
      case 'PACK_LUCK': {
        o.addMult += Math.min(p.capPct || 0.1, st.unique * (p.multPerCardType || 0.01));
        o.rareBonus += p.rareBonus || BAL.PACK_LUCK_RARE_BONUS; o.mythicBonus += p.mythicBonus || BAL.PACK_LUCK_MYTHIC_BONUS;
        o.packDiscount += Math.min(p.kekPackDiscountCap || 5, st.unique * (p.kekPackDiscountPerCard || 0)); break;
      }
      case 'CRIT_CHANCE': o.critMult += (p.mult - 1) / p.everyN; break;
      case 'TIMED_DROP': {
        if (p.kekValue) { o.kekPerSec += p.kekValue / p.interval; break; }
        let v = p.valueEAS || 0;
        if (p.comboWith && slots.some(s => s.id === p.comboWith)) v *= p.comboMult || 2;
        o.easPerSec += v / p.interval; break;
      }
      // IDLE_DRIP (First World Problems) pays only while idle: worth 0 to a player who keeps clicking.
    }
  }
  o.kekInterval = Math.max(5, o.kekInterval);
  return o;
}

function simulate(prof, seed, upgrades, hours) {
  const rng = rngFrom(seed);
  const st = { aura: 0, aps: 0, apc: 1, mult: 1, owned: {}, kek: 0, shop: false, packs: 0, coll: {}, unique: 0, dupeStreak: 0, brainMin: 0, slots: [], field: 0 };
  for (const u of upgrades) st.owned[u.id] = 0;
  const firstBuy = {}, snaps = [], log = { burn: 0, boss: 0, gyatt: 0, click: 0, aps: 0 };
  let bs = binderStats([], st);
  const pityE = n => (1 - Math.pow(1 - BAL.KEK_RNG_CHANCE, n)) / BAL.KEK_RNG_CHANCE;   // expected clicks per natural Kek drop
  const cost = u => Math.floor(u.baseCost * Math.pow(u.scale, st.owned[u.id]) * (1 - bs.costReduce));
  // Like the game: Sigma's global mult multiplies the card bonus (allAuraMult × (1 + binder addMult + field)).
  // --sigma-add models the old additive formula for comparison.
  const totMult = () => argv.includes('--sigma-add') ? st.mult + bs.addMult + st.field : st.mult * (1 + bs.addMult + st.field);
  const apsEff = () => st.aps * (1 + bs.apsPct);
  const apcRaw = () => st.apc + bs.flatApc + st.apc * bs.apcPct;
  const apcEff = () => apcRaw() * bs.critMult;
  // Level 67 Gyatt: 100x clicks; crits add nothing on top (CLICK_TOTAL_CAP 100)
  const gyattApc = () => apcRaw() * Math.min(BAL.CLICK_TOTAL_CAP, 100);
  const baseEAS = () => Math.max(1, apsEff() * totMult());
  // Average income/s including the expected value of frenzy, events and timed drops (used to rank purchases).
  const frenzyAvg = prof.cps >= BAL.FRENZY_THRESHOLD_CPS ? 1 + 9 * 10 / (10 + 30 + 3) : 1;
  const evMean = (BAL.EVENT_SPAWN_MIN_S + BAL.EVENT_SPAWN_MAX_S) / 2;
  function avgIncome() {
    const click = apcEff() * prof.cps * totMult();
    const gy = 0.2 / evMean * prof.catchRate * 15 * prof.cps * (gyattApc() - apcEff()) * totMult() * frenzyAvg;
    const boss = 0.2 / evMean * prof.catchRate * BAL.BOSS_REWARD_SECONDS * baseEAS();
    return (apsEff() * totMult() + click) * frenzyAvg + gy + boss + bs.easPerSec * baseEAS();
  }
  function gainOf(u) {
    const before = avgIncome();
    const k = u.effect === 'aps' ? 'aps' : u.effect === 'apc' ? 'apc' : 'mult';
    st[k] += u.value; const after = avgIncome(); st[k] -= u.value;
    return after - before;
  }
  function packOdds() {
    const field = BAL.PACK_FIELD_CHANCE + bs.mythicBonus;
    const cc = BAL.PACK_COMMON_CUT - bs.rareBonus, rc = BAL.PACK_RARE_CUT - bs.rareBonus;
    return { Field: field, common: (1 - field) * cc, uncommon: (1 - field) * (rc - cc), rare: (1 - field) * (1 - rc) };
  }
  function pull() {
    const o = packOdds(); let r = rng(), g = 'rare';
    for (const k of ['Field', 'common', 'uncommon', 'rare']) { if ((r -= o[k]) < 0) { g = k; break; } }
    let c = POOLS[g][Math.floor(rng() * POOLS[g].length)];
    if (st.coll[c.id] && st.dupeStreak >= BAL.PACK_PITY_DUPES) {
      const miss = CARDS.filter(x => !st.coll[x.id]);
      if (miss.length) c = miss[Math.floor(rng() * miss.length)];
    }
    return c;
  }
  function reslot() {
    const owned = BINDERS.filter(c => st.coll[c.id]);
    // Value a binder set by average income; try every 5-card subset (≤ 3003 for 15 cards).
    let best = [], bestV = -1;
    const pick = (i, cur) => {
      if (cur.length === Math.min(BAL.BINDER_SLOTS, owned.length)) {
        bs = binderStats(cur, st); const v = avgIncome() + bs.kekPerSec * 1e-9;
        if (v > bestV) { bestV = v; best = cur.slice(); } return;
      }
      for (let j = i; j < owned.length; j++) { cur.push(owned[j]); pick(j + 1, cur); cur.pop(); }
    };
    pick(0, []);
    st.slots = best; bs = binderStats(best, st);
    const fields = CARDS.filter(c => c.type === 'Field' && st.coll[c.id]);
    st.field = Math.max(0, ...fields.map(c => c.id === 'f5' ? c.params.mult + 5 * c.params.fireAuraPer * 0.85 : c.params.mult));
  }

  let nextEvent = BAL.EVENT_SPAWN_MIN_S + rng() * (BAL.EVENT_SPAWN_MAX_S - BAL.EVENT_SPAWN_MIN_S);
  let frenzyT = 0, frenzyCd = 0, frenzyFill = 0, gyattT = 0, kekAcc = 0, lastReslot = 0;
  const T = hours * 3600;
  const snapAt = new Set([60, 300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800, 14400, 18000, 21600, 28800, 36000, 43200].filter(s => s <= T));
  let target = null;
  for (let t = 1; t <= T; t++) {
    // Frenzy meter
    let fx = 1;
    if (prof.cps >= BAL.FRENZY_THRESHOLD_CPS) {
      if (frenzyT > 0) { fx = 10; frenzyT--; if (frenzyT === 0) frenzyCd = 30; }
      else if (frenzyCd > 0) frenzyCd--;
      else if (++frenzyFill >= 3) { frenzyFill = 0; frenzyT = 10; }
    }
    const m = totMult();
    const clickMult = 1 + (gyattT > 0 ? 99 : 0);
    if (gyattT > 0) gyattT--;
    const clickInc = apcEff() * prof.cps * m * fx, gyInc = clickMult > 1 ? gyattApc() * prof.cps * m * fx - clickInc : 0;
    const apsInc = apsEff() * m * fx + bs.easPerSec * baseEAS();
    st.aura += clickInc + gyInc + apsInc; log.click += clickInc; log.gyatt += gyInc; log.aps += apsInc;
    st.brainMin += 1 / 60;
    // Kek Koins
    kekAcc += prof.cps / pityE(bs.kekInterval) + bs.kekPerSec;
    while (kekAcc >= 1) { kekAcc--; st.kek++; }
    // Events
    if (t >= nextEvent) {
      nextEvent = t + BAL.EVENT_SPAWN_MIN_S + rng() * (BAL.EVENT_SPAWN_MAX_S - BAL.EVENT_SPAWN_MIN_S);
      const r = rng(), caught = rng() < prof.catchRate;
      if (r < 0.2) {          // Skibidi boss
        if (caught) { const rw = BAL.BOSS_REWARD_SECONDS * baseEAS(); st.aura = st.aura * 0.94 + rw; log.boss += rw; }
        else st.aura *= 1 - BAL.BOSS_DRAIN_PCT_PER_SEC * BAL.BOSS_AUTO_RESOLVE_IDLE_S;
      } else if (r < 0.4) { if (caught) gyattT = 15; }
      else if (!caught) st.aura *= 0.9;   // Fanum Tax
    }
    // Card shop and packs
    if (!st.shop && st.kek >= BAL.KEK_SHOP_COST) { st.kek -= BAL.KEK_SHOP_COST; st.shop = true; }
    let newBinder = false;
    while (st.shop) {
      const pc = Math.max(1, Math.min(BAL.KEK_PACK_COST_CAP, BAL.KEK_PACK_COST_BASE + Math.floor(st.packs * BAL.KEK_PACK_COST_SCALE)) - Math.floor(bs.packDiscount));
      if (st.kek < pc) break;
      st.kek -= pc; st.packs++;
      const c = pull(), isNew = !st.coll[c.id];
      st.dupeStreak = isNew ? 0 : st.dupeStreak + 1;
      st.coll[c.id] = (st.coll[c.id] || 0) + 1;
      if (isNew) st.unique++;
      if (c.type === 'Burn') { const rw = BURN_EAS[c.rarity] * prof.burnSkill * baseEAS(); st.aura += rw; log.burn += rw; }
      else if (isNew) newBinder = true;
      else st.kek += BAL.DUPE_KEK[c.rarity] || 0;
    }
    if (newBinder || t - lastReslot >= 300) { reslot(); lastReslot = t; }
    // Upgrades: pick the best target ("seconds to afford + payback"), buy it when affordable.
    for (let guard = 0; guard < 50; guard++) {
      const inc = avgIncome();
      let best = null, bestS = Infinity;
      for (const u of upgrades) {
        const c = cost(u), g = gainOf(u);
        if (g <= 0) continue;
        const s = Math.max(0, (c - st.aura) / inc) + c / g;
        if (s < bestS) { bestS = s; best = u; }
      }
      target = best;
      if (!best || st.aura < cost(best)) break;
      st.aura -= cost(best); st.owned[best.id]++;
      if (best.effect === 'aps') st.aps += best.value; else if (best.effect === 'apc') st.apc += best.value; else st.mult += best.value;
      if (firstBuy[best.id] === undefined) firstBuy[best.id] = t;
    }
    if (snapAt.has(t)) {
      const inc = avgIncome();
      const click = apcEff() * prof.cps * totMult() * frenzyAvg;
      snaps.push({ t, inc, clickShare: click / inc, owned: { ...st.owned }, unique: st.unique, packs: st.packs, cardMult: bs.addMult + st.field, aps: st.aps, apc: st.apc, mult: st.mult });
    }
  }
  return { firstBuy, snaps, log };
}

// ---------- report ----------
const fmt = n => { if (n < 1000) return n.toFixed(n < 10 ? 1 : 0); const S = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx']; let i = 0; while (n >= 1000 && i < S.length - 1) { n /= 1000; i++; } return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + S[i]; };
const mm = s => s === undefined ? '—' : s < 3600 ? (s / 60).toFixed(1) + ' min' : (s / 3600).toFixed(2) + ' h';
const median = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const P = s => process.stdout.write(s + '\n');
const table = (h, rows) => { P('| ' + h.join(' | ') + ' |'); P('|' + h.map(() => '---').join('|') + '|'); rows.forEach(r => P('| ' + r.join(' | ') + ' |')); P(''); };

P(`# SAUCE progression sim (${HOURS} h, ${RUNS} runs per profile, seed ${SEED})\n`);
table(['Upgrade', 'Effect', 'Base cost', 'Scale', 'First-copy payback (no cards, 6 cps)'], UPGRADES.map(u => {
  const gain = u.effect === 'aps' ? u.value : u.effect === 'apc' ? u.value * 6 : NaN;
  return [u.name, u.desc, fmt(u.baseCost), u.scale, isNaN(gain) ? '(multiplier)' : mm(u.baseCost / gain)];
}));
if (argv.includes('--brief')) {
  for (const prof of PROFILES) {
    const runs = Array.from({ length: RUNS }, (_, i) => simulate(prof, SEED + i, UPGRADES, HOURS));
    const fb = UPGRADES.map(u => mm(median(runs.map(r => r.firstBuy[u.id] ?? Infinity)))).join(', ');
    const inc = runs[0].snaps.filter(s => [1800, 3600, 10800, 21600].includes(s.t)).map((s, i0) => { const i = runs[0].snaps.indexOf(s); return mm(s.t) + ' ' + fmt(median(runs.map(r => r.snaps[i].inc))) + ' [' + UPGRADES.map(u => s.owned[u.id]).join('/') + ']'; }).join(' · ');
    const lg = runs[0].log, tot = lg.click + lg.aps + lg.boss + lg.gyatt + lg.burn;
    P(`${prof.name.padEnd(7)} first: ${fb}
        ${inc}
        clicks ${(lg.click / tot * 100).toFixed(0)}% gyatt ${(lg.gyatt / tot * 100).toFixed(0)}% passive ${(lg.aps / tot * 100).toFixed(0)}% boss ${(lg.boss / tot * 100).toFixed(0)}% burns ${(lg.burn / tot * 100).toFixed(0)}%`);
  }
  process.exit(0);
}
for (const prof of PROFILES) {
  const runs = Array.from({ length: RUNS }, (_, i) => simulate(prof, SEED + i, UPGRADES, HOURS));
  P(`## ${prof.name}: ${prof.cps} clicks/s${prof.cps >= BAL.FRENZY_THRESHOLD_CPS ? ' (triggers frenzy)' : ''}, catches ${prof.catchRate * 100}% of events\n`);
  table(['Upgrade', 'First buy (median)'], UPGRADES.map(u => [u.name, mm(median(runs.map(r => r.firstBuy[u.id] ?? Infinity)))]));
  const snaps = runs[0].snaps.map((s, i) => {
    const inc = median(runs.map(r => r.snaps[i].inc));
    return [mm(s.t), fmt(inc) + '/s', (median(runs.map(r => r.snaps[i].clickShare)) * 100).toFixed(0) + '%',
      UPGRADES.map(u => s.owned[u.id]).join(' / '), s.unique + ' (' + s.packs + ' packs)', '+' + (s.cardMult * 100).toFixed(0) + '%'];
  });
  table(['Time', 'Avg income', 'From clicks', 'Owned (' + UPGRADES.map(u => u.id).join('/') + ')', 'Unique cards', 'Card mult'], snaps);
  const lg = runs[0].log, tot = lg.click + lg.aps + lg.boss + lg.gyatt + lg.burn;
  P(`Income split over the run (run 1): clicks ${(lg.click / tot * 100).toFixed(0)}% · passive ${(lg.aps / tot * 100).toFixed(0)}% · boss ${(lg.boss / tot * 100).toFixed(0)}% · Gyatt ${(lg.gyatt / tot * 100).toFixed(0)}% · burns ${(lg.burn / tot * 100).toFixed(0)}%\n`);
}
