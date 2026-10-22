#!/usr/bin/env node
// ============================================================
// tools/card-sim.js — card economy simulator (Node 22, no deps)
//
//   node tools/card-sim.js            # full markdown report
//   node tools/card-sim.js --seed 7   # different Monte Carlo seed
//   node tools/card-sim.js --trials 400  # set-completion trials
//
// Reads game.js as TEXT, pulls out the BAL, UPGRADES and CARD_LIBRARY
// literals, and evaluates only those literals in a vm sandbox (no DOM code
// runs). Everything else is a faithful re-implementation of the economy
// math in game.js. Each mirror function names the game.js function it copies;
// the "Source map" section of the output prints the CURRENT line numbers so
// citations stay valid after edits.
//
// Card params flow through automatically: change a number in CARD_LIBRARY and
// rerun. Behaviour (handler code) changes need the matching mirror below
// updated — they are grouped one function per archetype in BURN_MODELS and
// BINDER_MODELS.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLiterals } = require('./lib/extract');

// ---------- CLI ----------
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEED = Number(arg('--seed', 12345));
const TRIALS = Number(arg('--trials', 300));   // set-completion Monte Carlo trials
const PACKS_MC = 1000;                          // single 1,000-pack run (plan 5.1)
const GAME_JS = path.resolve(__dirname, '..', arg('--game', 'game.js'));

// ---------- 1. Extract literals from game.js ----------
const SRC = fs.readFileSync(GAME_JS, 'utf8');
const SRC_LINES = SRC.split('\n');

// Literal extraction lives in tools/lib/extract.js (shared with gen-cards-csv.js).
const { BAL, UPGRADES, CARD_LIBRARY } = loadLiterals(SRC, ['BAL', 'UPGRADES', 'CARD_LIBRARY']);
const CARD_BY_ID = new Map(CARD_LIBRARY.map(c => [c.id, c]));

// Line lookup so the report cites current game.js lines.
function lineOf(re) {
  const r = typeof re === 'string' ? new RegExp(re) : re;
  for (let i = 0; i < SRC_LINES.length; i++) if (r.test(SRC_LINES[i])) return i + 1;
  return '?';
}
const SRCMAP = {
  getBinderStats: lineOf(/^function getBinderStats\(/),
  getFieldMult: lineOf(/^function getFieldMult\(/),
  getKekPackCost: lineOf(/^function getKekPackCost\(/),
  pullCard: lineOf(/^function pullCard\(/),
  doClick: lineOf(/^function doClick\(/),
  gameLoop: lineOf(/^function gameLoop\(/),
  computeEAS: lineOf(/^function computeEAS\(/),
  computeBaseEAS: lineOf(/^function computeBaseEAS\(/),
  EFFECT_HANDLERS: lineOf(/^const EFFECT_HANDLERS/),
  activateBurnMulti: lineOf(/^function activateBurnMulti\(/),
  spawnBurnTarget: lineOf(/^function spawnBurnTarget\(/),
  spawnRhythmGame: lineOf(/^function spawnRhythmGame\(/),
  spawnKekCoin: lineOf(/^function spawnKekCoin\(/),
  spawnEvent: lineOf(/^function spawnEvent\(/),
  tickBoss: lineOf(/^function tickBoss\(/),
  endBossFight: lineOf(/^function endBossFight\(/),
};

// ---------- 2. Shared assumptions (CARD_REVIEW_PLAN §3) ----------
const CPS = 6;                                   // clicks/sec when a card asks for clicking
const HIT = { skilled: 0.9, casual: 0.5 };       // hit / success rate for skill cards
// Reference states (plan §3.1). uniqueOwned / brainMinutes are extra
// assumptions needed by Success Kid and Expanding Brain.
const REF_STATES = [
  { name: 'Early', owned: { ketchup: 10, ranch: 2, szechuan: 0, grimace: 0, sigma: 0 }, uniqueOwned: 10, brainMinutes: 10 },
  { name: 'Mid', owned: { ketchup: 40, ranch: 20, szechuan: 5, grimace: 2, sigma: 0 }, uniqueOwned: 30, brainMinutes: 40 },
  { name: 'Late', owned: { ketchup: 80, ranch: 50, szechuan: 20, grimace: 15, sigma: 3 }, uniqueOwned: 50, brainMinutes: 120 },
];
// Kek-cost reference packs (plan §3.3): the Nth pack bought.
const REF_PACKS = [10, 30];
// Proposed Rule 0.8 Kek budget (per single use), anchored on pack #10's cost.
// ¼ / ½ / 1 pack at pack #10. See docs/review/systems.md for the reasoning.
function kekBudget(rarity) {
  const p10 = packCost(10);
  return { common: Math.round(p10 / 4), uncommon: Math.round(p10 / 2), rare: p10 }[rarity];
}
// Aura budgets (BALANCE_PLAN Rule 0.5); +50% allowed for a real downside.
const EAS_BUDGET = { common: [30, 45], uncommon: [120, 180], rare: [600, 900] };

// ---------- 3. Economy mirrors ----------
// Mirrors buyUpgrade(): G.auraPerSecond / auraPerClick / allAuraMult from owned counts.
function baseG(state, extra = {}) {
  const G = { auraPerSecond: 0, auraPerClick: 1, allAuraMult: 1.0 };
  for (const u of UPGRADES) {
    const n = state.owned[u.id] || 0;
    if (u.effect === 'aps') G.auraPerSecond += u.value * n;
    if (u.effect === 'apc') G.auraPerClick += u.value * n;
    if (u.effect === 'mult') G.allAuraMult += u.value * n;
  }
  return Object.assign(G, {
    binderSlots: extra.binder || [],
    fieldSlot: extra.field || null,
    fireLevel: extra.fireLevel || 0,
    apsMultValue: extra.apsMult || 1,
    moodIndex: extra.moodIndex || 0,
    uniqueOwned: state.uniqueOwned,
    brainMinutes: extra.brainMinutes != null ? extra.brainMinutes : state.brainMinutes,
  });
}

// Mirrors getBinderStats() (game.js SRCMAP.getBinderStats). Same switch, same order.
function getBinderStats(G) {
  let addAps = 0, addApc = 0, addMult = 0, apcMultBonus = 0, apsMultBonus = 0, costReduce = 0, drainMult = 1, hitboxBonus = false;
  let kekIntervalReduce = 0, kekPackDiscount = 0, rareBonus = 0, mythicBonus = 0;
  for (const id of G.binderSlots) {
    const card = CARD_BY_ID.get(id); if (!card) continue;
    const p = card.params || {};
    switch (card.archetype) {
      case 'GLOBAL_MULT': addMult += p.mult || 0; drainMult *= (1 - (p.drainReduce || 0)); break;
      case 'PASSIVE_APS_PCT': apsMultBonus += p.pct || 0; break;
      case 'PASSIVE_APC_PCT': addApc += p.flatApc || 0; kekIntervalReduce += p.kekIntervalReduce || 0; break;
      case 'BIGGER_TARGET': apcMultBonus += p.apcBonus || 0; if (p.hitboxBonus) hitboxBonus = true; break;
      case 'COST_REDUCTION': costReduce = Math.max(costReduce, p.reduce || 0); addMult += p.globalMult || 0; kekPackDiscount += p.kekPackDiscount || 0; break;
      case 'EVENT_SOFTENER': drainMult *= (p.drainMult || 1); addMult += p.globalMult || 0; break;
      case 'SCALING_OVER_TIME': apcMultBonus += Math.min(p.capPct || 0, (p.apcPerMin || 0) * G.brainMinutes); break; // G.brainMinutes, capped
      case 'MOOD_SWING': {
        const mode = G.moodIndex % 3;
        if (mode === 0) apsMultBonus += p.moodAps || 0.15;
        else if (mode === 1) apcMultBonus += p.moodApc || 0.15;
        else addMult += p.moodGlobal || 0.10;
        break;
      }
      case 'PACK_LUCK':
        addMult += Math.min(p.capPct || 0.10, G.uniqueOwned * (p.multPerCardType || 0.01));
        rareBonus += p.rareBonus || BAL.PACK_LUCK_RARE_BONUS;
        mythicBonus += p.mythicBonus || BAL.PACK_LUCK_MYTHIC_BONUS;
        if (p.kekPackDiscountPerCard) kekPackDiscount += Math.min(p.kekPackDiscountCap || 5, G.uniqueOwned * p.kekPackDiscountPerCard);
        break;
    }
  }
  addAps += G.auraPerSecond * apsMultBonus;
  addApc += G.auraPerClick * apcMultBonus;
  return { addAps, addApc, addMult, costReduce, drainMult, apcMultBonus, apsMultBonus, hitboxBonus, kekIntervalReduce, kekPackDiscount, rareBonus, mythicBonus };
}

// Mirrors getFieldMult().
function getFieldMult(G) {
  if (!G.fieldSlot) return 0;
  const card = CARD_BY_ID.get(G.fieldSlot);
  if (!card || card.archetype !== 'FIELD_THEME') return 0;
  if (card.id === 'f5') return (card.params.mult || 0.25) + G.fireLevel * (card.params.fireAuraPer || 0.08);
  return card.params.mult || 0;
}
// Mirrors computeEAS() — includes the temporary APS mult (apsBuffMult(); Rickroll etc). Live ticker / UI only.
function computeEAS(G) {
  const bs = getBinderStats(G);
  const aps = (G.auraPerSecond + bs.addAps) * G.apsMultValue;
  return Math.max(1, aps * (G.allAuraMult + bs.addMult + getFieldMult(G)));
}
// Mirrors computeBaseEAS() — no temporary APS mult. Every one-shot payout reads this (B1.3).
function computeBaseEAS(G) {
  const bs = getBinderStats(G);
  return Math.max(1, (G.auraPerSecond + bs.addAps) * (G.allAuraMult + bs.addMult + getFieldMult(G)));
}
// Mirrors the `earned` line in doClick() with clickMult = 1, no crit, no frenzy.
function clickValue(G) {
  const bs = getBinderStats(G);
  return (G.auraPerClick + bs.addApc) * (G.allAuraMult + bs.addMult + getFieldMult(G));
}
// Mirrors the passive tick in gameLoop(): Aura/sec from APS (no frenzy).
function apsIncome(G) {
  const bs = getBinderStats(G);
  return (G.auraPerSecond + bs.addAps) * G.apsMultValue * (G.allAuraMult + bs.addMult + getFieldMult(G));
}

// ---------- 4. Kek Koin mirrors ----------
// Mirrors getKekPackCost(); n = the Nth pack bought (packsPurchased = n-1).
function packCost(n, discount = 0) {
  const base = BAL.KEK_PACK_COST_BASE + Math.floor((n - 1) * BAL.KEK_PACK_COST_SCALE);
  return Math.max(1, base - Math.floor(discount));
}
function cumPackKek(n, discount = 0) { let s = 0; for (let k = 1; k <= n; k++) s += packCost(k, discount); return s; }
// doClick(): a drop when clicksSinceLastKek >= interval OR rand < KEK_RNG_CHANCE.
// E[clicks per drop] = sum_{j=0}^{I-1} (1-q)^j  (pity at I, hazard q per click).
function clicksPerKek(intervalReduce = 0) {
  const I = Math.max(5, BAL.KEK_BASE_CLICK_INTERVAL - intervalReduce), q = BAL.KEK_RNG_CHANCE;
  let e = 0; for (let j = 0; j < I; j++) e += Math.pow(1 - q, j);
  return e;
}
// Kek per minute from clicking at CPS. doClick() adds PBJ's bonus Kek on every kekDropBonusEvery-th natural drop.
function kekPerMin({ harambe = false, pbj = false } = {}) {
  const red = harambe ? (CARD_BY_ID.get('bi_c2').params.kekIntervalReduce || 0) : 0;
  const every = CARD_BY_ID.get('f6').params.kekDropBonusEvery;
  const perDrop = 1 + (pbj && every ? 1 / every : 0);
  return CPS * 60 / clicksPerKek(red) * perDrop;
}
const KEK_MIN = kekPerMin();

// ---------- 5. Burn models (one per archetype) ----------
// Each returns { aura, kek, note } for a hit/success rate h. `aura` is extra
// Aura over just clicking normally; the table divides it by computeEAS().
// D6 per-click EAS bonus (doClick / AUTO_COLLECT loop): min(capEAS, easPerClick × qualifying clicks) × computeBaseEAS().
function d6(p, G, clicks) { return Math.min(p.capEAS || 0, (p.easPerClick || 0) * clicks) * computeBaseEAS(G); }
const BURN_MODELS = {
  // EFFECT_HANDLERS.INSTANT_BURST — pays computeBaseEAS() × seconds.
  INSTANT_BURST(card, p, G, h) {
    const base = computeBaseEAS(G);
    if (p.recentClicksAPC) {                         // All Your Base: counts clicks, clicksPerSecond clicks = 1 s
      const clicks = CPS * 30;                        // recentClickTimestamps trimmed to 30s
      const raw = clicks / (p.clicksPerSecond || 4);
      const secs = Math.max(p.floorApsSeconds || 30, Math.min(p.capApsSeconds || 60, raw));
      return { aura: base * secs, kek: 0, note: `${clicks} clicks / ${p.clicksPerSecond || 4} = ${f(raw, 1)}s → ${secs}s (floor ${p.floorApsSeconds || 30}, cap ${p.capApsSeconds || 60})` };
    }
    if (p.baseApsSeconds) {                          // Ermahgerd: mash in window
      const mashes = Math.floor(CPS * (p.mashWindow || 3) * h);
      const secs = Math.min(p.capApsSeconds || 60, p.baseApsSeconds + mashes * (p.mashBonusSeconds || 3));
      return { aura: base * secs, kek: 0, note: `${mashes} mashes → ${secs}s` };
    }
    return { aura: base * (p.apsSeconds || 0), kek: p.kekBonus || 0, note: p.doubleNext ? '+1 doubled click (tiny)' : '' };
  },
  // EFFECT_HANDLERS.TEMP_APS_MULT — extra = (mult-1) × duration seconds of income.
  TEMP_APS_MULT(card, p, G) {
    return { aura: computeEAS(G) * ((p.mult || 1) - 1) * (p.duration || 10), kek: 0, note: p.pauseBoss ? 'also freezes boss drain' : 'own apsBuffs entry; additive, APS_MULT_CAP ' + BAL.APS_MULT_CAP };
  },
  // EFFECT_HANDLERS.TEMP_CLICK_MULT — own clickBuffs entry, capped at CLICK_MULT_CAP, clicks at CPS, + D6.
  TEMP_CLICK_MULT(card, p, G) {
    const m = Math.min(BAL.CLICK_MULT_CAP, p.mult || 1), clicks = CPS * (p.duration || 10);
    return { aura: (m - 1) * clicks * clickValue(G) + d6(p, G, clicks), kek: 0, note: `${m}×${p.duration}s @${CPS}cps` };
  },
  // EFFECT_HANDLERS.PRECISION + doClick() center check (OAG).
  PRECISION(card, p, G, h) {
    const n = CPS * (p.duration || 10), m = Math.min(BAL.CLICK_MULT_CAP, p.mult || 1), cv = clickValue(G);
    const hits = n * h;
    const kek = p.kekEveryNHits ? Math.min(p.kekCap || 0, Math.floor(hits / p.kekEveryNHits)) : 0;
    if (p.deadCenterOnly) {   // every click lands; only center hits get the mult, D6 and Kek
      return { aura: hits * (m - 1) * cv + d6(p, G, hits), kek, note: `${Math.round(hits)} center hits` };
    }
    // invisible / small nugget: misses don't register at all (lose the base click too)
    return { aura: hits * m * cv - n * cv + d6(p, G, hits), kek, note: `${Math.round(hits)}/${n} hits` };
  },
  // EFFECT_HANDLERS.COIN_RAIN — coins pay computeEAS() × valueEASEach on click.
  COIN_RAIN(card, p, G, h) {
    const eas = computeBaseEAS(G), total = p.coins || 10;
    if (p.motion === 'bones') {                      // Gabe: kekPerBone per caught bone, per-bone hit rate = h
      return { aura: 0, kek: (p.kekPerBone || 0) * total * h, note: `${p.kekPerBone} Kek per bone × ${total}` };
    }
    const kekCoins = p.kekEveryNth ? Math.floor(total / p.kekEveryNth) : 0;   // spawnBurnKekCoin() = 1 Kek each
    const auraCoins = total - kekCoins;
    return { aura: eas * auraCoins * (p.valueEASEach || 0) * h, kek: kekCoins * h, note: `${auraCoins} coins × ${p.valueEASEach}${kekCoins ? ` + ${kekCoins} Kek coins` : ''}` };
  },
  // spawnBurnTarget() — reward fixed at activation, paid only if ALL targets die. Run success = h.
  // payPerTarget (End of Ze World): each kill pays rewardEAS / targets; h = per-item hit rate; kekBonus × h (sim convention).
  TARGET_CHASE(card, p, G, h) {
    if (p.kekReward) return { aura: 0, kek: p.kekReward * h, note: `${p.hp || 1} HP, Kek reward` };
    if (p.payPerTarget) return { aura: computeBaseEAS(G) * (p.rewardEAS || 60) * h, kek: (p.kekBonus || 0) * h, note: `${p.targets} targets/${p.timeout}s, ${f((p.rewardEAS || 60) / p.targets, 0)} EAS each, Kek bonus if all` };
    return { aura: computeBaseEAS(G) * (p.rewardEAS || 60) * h, kek: (p.kekBonus || 0) * h, note: `${p.targets} target(s)/${p.timeout}s, all-or-nothing${p.swarm ? ', all at once' : ''}` };
  },
  // EFFECT_HANDLERS.GAMBLE — EV.
  GAMBLE(card, p, G) {
    return { aura: computeBaseEAS(G) * (p.winEAS || 0) * (p.p || 0.5), kek: 0, note: `EV of ${p.winEAS} @ p=${p.p}` };
  },
  // EFFECT_HANDLERS.AUTO_COLLECT — auto clicks use p.mult only (no clickMult, crit, frenzy, Kek), + D6.
  AUTO_COLLECT(card, p, G) {
    if (p.echoClick) {   // doClick() echo: clickBase × min(clickMult, CLICK_MULT_CAP), no frenzy
      const clicks = CPS * (p.echoDuration || 8);
      return { aura: clicks * clickValue(G) + d6(p, G, clicks), kek: 0, note: `${clicks} echoed clicks` };
    }
    return { aura: (p.clicks || 10) * (p.mult || 1) * clickValue(G) + d6(p, G, p.clicks || 10), kek: 0, note: `${p.clicks}×${p.mult} click${p.piercesBoss ? `, ${p.clicks} boss hits in ${p.duration}s` : ''}` };
  },
  // EFFECT_HANDLERS.SCREEN_GAG — pity payout at end of gag.
  SCREEN_GAG(card, p, G) { return { aura: computeBaseEAS(G) * (p.pityEAS || 30), kek: 0, note: `${p.gagDuration || 3}s gag` }; },
  // spawnRhythmGame() — linear from 0: perfectEAS (else rarity budget) × score fraction; score fraction ≈ h.
  RHYTHM(card, p, G, h) {
    const perfect = p.perfectEAS ?? (card.rarity === 'rare' ? BAL.EAS_RARE : card.rarity === 'common' ? BAL.EAS_COMMON : BAL.EAS_UNCOMMON);
    return { aura: computeBaseEAS(G) * perfect * h, kek: 0, note: `perfect ${perfect} EAS${p.perfectEAS ? '' : ' (rarity default)'}, 0 hits pays 0` };
  },
  // EFFECT_HANDLERS.KEK_SPAWN — 3D coins via spawnKekCoin() (must be clicked).
  KEK_SPAWN(card, p) { return { aura: 0, kek: p.kekCoins || 2, note: 'coins must be clicked' }; },
  // EFFECT_HANDLERS.KEK_DOUBLE_BUFF — next N collected nugget coins worth 2×.
  KEK_DOUBLE_BUFF(card, p) {
    const n = p.doubleCount || 5;
    return { aura: 0, kek: n, note: `+${n} Kek over next ${(n / KEK_MIN).toFixed(1)} min of clicking` };
  },
};

// ---------- 6. Binder models ----------
// Returns { apsPct, apcPct, totalPct, note } — % change vs. empty binder at CPS clicking.
function withBinder(state, ids, extra = {}) { return baseG(state, Object.assign({ binder: ids }, extra)); }
function pct(a, b) { return b === 0 ? 0 : (a / b - 1) * 100; }
function binderEffect(card, state) {
  const G0 = baseG(state), G1 = withBinder(state, [card.id]);
  const aps0 = apsIncome(G0), cv0 = clickValue(G0), tot0 = aps0 + CPS * cv0;
  let aps1 = apsIncome(G1), cv1 = clickValue(G1), note = '';
  const p = card.params || {};
  switch (card.archetype) {
    case 'TIMED_DROP': {      // gameLoop TIMED_DROP block: EAS × valueEAS every interval (skilled collects all)
      if (p.kekValue) { note = `${(p.kekValue * 60 / p.interval).toFixed(1)} Kek/min (${(p.kekValue * 60 / p.interval / KEK_MIN * 100).toFixed(0)}% of click Kek)`; break; }
      let v = p.valueEAS || 30;
      const combo = p.comboWith ? ` (${(v * (p.comboMult || 2) / p.interval * 100).toFixed(0)}% with ${CARD_BY_ID.get(p.comboWith).name})` : '';
      aps1 = aps0 + computeEAS(G0) * v / p.interval;
      note = `${v} EAS / ${p.interval}s${p.autoCollect ? ' auto' : ' click'}${p.fluctuate ? ` ±${p.fluctuate * 100}%` : ''}${combo}`;
      break;
    }
    case 'IDLE_DRIP': note = `+${((p.idleApsMult - 1) * 100).toFixed(0)}% APS only after ${p.idleThreshold}s idle (0 while clicking)`; break;
    case 'CRIT_CHANCE': cv1 = cv0 * (1 + (p.mult - 1) / p.everyN); note = `avg over ${p.everyN} clicks`; break;
    case 'SCALING_OVER_TIME': note = `at ${state.brainMinutes} min played while slotted; cap +${(p.capPct * 100).toFixed(0)}% APC reached at ${(p.capPct / p.apcPerMin).toFixed(0)} min`; break;
    case 'MOOD_SWING': {
      const modes = [0, 1, 2].map(i => { const g = withBinder(state, [card.id], { moodIndex: i }); return apsIncome(g) + CPS * clickValue(g); });
      const avgAps = [0, 1, 2].map(i => apsIncome(withBinder(state, [card.id], { moodIndex: i }))).reduce((a, b) => a + b) / 3;
      const avgCv = [0, 1, 2].map(i => clickValue(withBinder(state, [card.id], { moodIndex: i }))).reduce((a, b) => a + b) / 3;
      aps1 = avgAps; cv1 = avgCv;
      note = 'avg of 3 modes; per mode total ' + modes.map(m => pct(m, tot0).toFixed(1) + '%').join(' / ');
      break;
    }
    case 'PACK_LUCK': { const bs = getBinderStats(G1); note = `${state.uniqueOwned} unique: −${Math.floor(bs.kekPackDiscount)} Kek/pack, +${(bs.rareBonus * 100).toFixed(0)}% rare, +${(bs.mythicBonus * 100).toFixed(0)}% field`; break; }
    case 'COST_REDUCTION': note = `−${p.reduce * 100}% SAUCE cost, −${p.kekPackDiscount} Kek/pack`; break;
    case 'EVENT_SOFTENER': note = `boss drain ×${p.drainMult}`; break;
    case 'GLOBAL_MULT': if (p.drainReduce) note = `boss drain ×${1 - p.drainReduce}`; break;
    case 'PASSIVE_APC_PCT': if (p.kekIntervalReduce) note = `Kek every ${BAL.KEK_BASE_CLICK_INTERVAL - p.kekIntervalReduce} clicks: ${kekPerMin({ harambe: true }).toFixed(1)} vs ${KEK_MIN.toFixed(1)} Kek/min`; break;
    case 'BIGGER_TARGET': note = 'bigger hitbox (Surgery on a Grape)'; break;
  }
  return { apsPct: pct(aps1, aps0), apcPct: pct(cv1, cv0), totalPct: pct(aps1 + CPS * cv1, tot0), note };
}

// ---------- 7. Pack pulls (Monte Carlo) ----------
// Seeded RNG (mulberry32) so runs are reproducible.
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var PULL_WARN = [];
const POOLS = {
  Field: CARD_LIBRARY.filter(c => c.type === 'Field'),
  common: CARD_LIBRARY.filter(c => (c.type === 'Burn' || c.type === 'Binder') && c.rarity === 'common'),
  uncommon: CARD_LIBRARY.filter(c => (c.type === 'Burn' || c.type === 'Binder') && c.rarity === 'uncommon'),
  rare: CARD_LIBRARY.filter(c => (c.type === 'Burn' || c.type === 'Binder') && c.rarity === 'rare'),
};
// pullCard() keeps its odds as literals (not in BAL), so read them from the function text.
// If the regexes stop matching (code was restructured), the defaults are used and the report says so.
const PULL = (() => {
  const start = SRC.indexOf('function pullCard(');
  const body = SRC.slice(start, SRC.indexOf('\n}\n', start));
  const num = (re, d) => { const m = re.exec(body); return m ? Number(m[1]) : (PULL_WARN.push(re.source), d); };
  return {
    field: num(/roll\s*<\s*([0-9.]+)\s*\+\s*bs\.mythicBonus/, 0.10),
    rareCut: num(/rareCut\s*=\s*([0-9.]+)\s*-\s*bs\.rareBonus/, 0.88),
    common: num(/Math\.min\(\s*([0-9.]+)\s*,\s*rareCut\)/, 0.60),
  };
})();
// Mirrors pullCard(): Field roll, then common / uncommon / rare cut points; rareBonus is taken from UNCOMMON.
function pullCard(rng, bs) {
  let pool;
  if (rng() < PULL.field + bs.mythicBonus) pool = POOLS.Field;
  else {
    const r2 = rng(), rareCut = PULL.rareCut - bs.rareBonus;
    const rarity = r2 < Math.min(PULL.common, rareCut) ? 'common' : r2 < rareCut ? 'uncommon' : 'rare';
    pool = POOLS[rarity];
  }
  return pool[Math.floor(rng() * pool.length)];
}
const NO_BS = { mythicBonus: 0, rareBonus: 0 };
function successKidBS() { return getBinderStats(withBinder(REF_STATES[1], ['bi_u2'])); }
// Exact per-pack odds of one specific card (analytic, from the same cut points).
function cardOdds(card, bs = NO_BS) {
  const pf = PULL.field + bs.mythicBonus, rareCut = PULL.rareCut - bs.rareBonus;
  const pr = { common: Math.min(PULL.common, rareCut), uncommon: rareCut - Math.min(0.60, rareCut), rare: 1 - rareCut };
  if (card.type === 'Field') return pf / POOLS.Field.length;
  return (1 - pf) * pr[card.rarity] / POOLS[card.rarity].length;
}

// ---------- 8. Markdown helpers ----------
const out = [];
const P = s => out.push(s);
const f = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const sg = (n, d = 1) => (n >= 0 ? '+' : '') + f(n, d) + '%';
function table(head, rows) { P('| ' + head.join(' | ') + ' |'); P('|' + head.map(() => '---').join('|') + '|'); rows.forEach(r => P('| ' + r.join(' | ') + ' |')); P(''); }
function budgetFlag(rarity, eas) {
  const [lo, hi] = EAS_BUDGET[rarity] || [0, Infinity];
  if (eas > hi * 1.5) return 'OVER';
  if (eas < lo * 0.67) return 'under';
  return 'ok';
}

// ============================================================
// REPORT
// ============================================================
P(`# Card sim report`);
P(`Generated by \`node tools/card-sim.js\` (seed ${SEED}) from \`${path.relative(process.cwd(), GAME_JS) || 'game.js'}\` — ${CARD_LIBRARY.length} cards (${CARD_LIBRARY.filter(c => c.type === 'Field').length} Field / ${CARD_LIBRARY.filter(c => c.type === 'Binder').length} Binder / ${CARD_LIBRARY.filter(c => c.type === 'Burn').length} Burn). Assumes ${CPS} clicks/sec, skilled ${HIT.skilled * 100}% / casual ${HIT.casual * 100}% hit rate, empty binder and no Field unless stated.`);
P('');
P('Source map (current game.js lines mirrored): ' + Object.entries(SRCMAP).map(([k, v]) => `\`${k}\`:${v}`).join(', '));
P('');

// (a) reference states
P('## (a) Reference states');
table(['State', 'SAUCE (k/r/s/g/σ)', 'APS', 'APC', 'Global mult', 'computeEAS', 'computeBaseEAS', `Click Aura/s @${CPS}cps`, 'Click share of income'],
  REF_STATES.map(s => {
    const G = baseG(s), cv = clickValue(G), eas = computeEAS(G);
    const o = s.owned;
    return [s.name, `${o.ketchup}/${o.ranch}/${o.szechuan}/${o.grimace}/${o.sigma}`, f(G.auraPerSecond), f(G.auraPerClick), f(G.allAuraMult, 2) + '×', f(eas), f(computeBaseEAS(G)), f(cv * CPS), f(cv * CPS / (cv * CPS + eas) * 100, 0) + '%'];
  }));

// (b) burns
P('## (b) Burn payouts');
P(`EAS-eq = extra Aura ÷ computeEAS() at that state (skilled / casual). Kek shown skilled / casual. "Kek min" = minutes of ${CPS}-cps click Kek income (${f(KEK_MIN, 1)}/min). Pack #${REF_PACKS[0]} costs ${packCost(REF_PACKS[0])}, pack #${REF_PACKS[1]} costs ${packCost(REF_PACKS[1])}. Flags: Aura budget vs Rule 0.5 (OVER = above budget +50%, under = below ⅔ of floor) using the Mid skilled value; **K** = skilled Kek above the proposed per-use budget (Common ${kekBudget('common')} / Uncommon ${kekBudget('uncommon')} / Rare ${kekBudget('rare')} Kek). "Budget use" = Mid EAS ÷ top of Aura budget + Kek ÷ Kek budget (Rule 0.8 split; 1.0 = one full budget, 1.5 = +50% downside allowance).`);
P('');
const burnRows = [];
for (const rarity of ['common', 'uncommon', 'rare']) {
  for (const card of CARD_LIBRARY.filter(c => c.type === 'Burn' && c.rarity === rarity)) {
    const model = BURN_MODELS[card.archetype];
    if (!model) { burnRows.push([card.name, card.id, rarity[0].toUpperCase(), card.archetype, '—', '—', '—', '—', '—', '—', '—', '—', 'NO MODEL']); continue; }
    const cells = REF_STATES.map(s => {
      const G = baseG(s), eas = computeEAS(G);
      const a = model(card, card.params || {}, G, HIT.skilled), b = model(card, card.params || {}, G, HIT.casual);
      return { sk: a.aura / eas, ca: b.aura / eas, kekS: a.kek, kekC: b.kek, note: a.note };
    });
    const mid = cells[1];
    const fmtCell = c => Math.abs(c.sk - c.ca) < 0.05 ? f(c.sk) : `${f(c.sk)} / ${f(c.ca)}`;
    const kek = mid.kekS;
    const flags = [];
    const bf = budgetFlag(rarity, mid.sk); if (bf !== 'ok') flags.push(bf);
    if (kek > kekBudget(rarity)) flags.push('**K**');
    burnRows.push([card.name, card.id, rarity[0].toUpperCase(), card.archetype, ...cells.map(fmtCell),
      kek ? (Math.abs(mid.kekS - mid.kekC) < 0.05 ? f(kek, 1) : `${f(mid.kekS, 1)} / ${f(mid.kekC, 1)}`) : '—',
      kek ? f(kek / KEK_MIN, 2) : '—',
      kek ? REF_PACKS.map(n => f(kek / packCost(n) * 100, 0) + '%').join(' / ') : '—',
      f(mid.sk / EAS_BUDGET[rarity][1] + kek / kekBudget(rarity), 2),
      (flags.join(' ') || 'ok') + (mid.note ? ` · ${mid.note}` : '')]);
  }
}
table(['Card', 'id', 'R', 'Archetype', 'Early EAS-eq', 'Mid EAS-eq', 'Late EAS-eq', 'Kek', 'Kek min', `% pack #${REF_PACKS[0]} / #${REF_PACKS[1]}`, 'Budget use', 'Flags · notes'], burnRows);

// (c) binders
P('## (c) Binder: % change when slotted (vs empty binder)');
P(`APS = passive Aura/sec, APC = Aura per click, Total = APS + ${CPS} cps clicking. TIMED_DROP counts every drop collected as extra Aura/sec.`);
P('');
const binderRows = [];
for (const card of CARD_LIBRARY.filter(c => c.type === 'Binder')) {
  const eff = REF_STATES.map(s => binderEffect(card, s));
  binderRows.push([card.name, card.id, card.rarity[0].toUpperCase(), card.archetype,
    ...eff.map(e => `${sg(e.apsPct, 0)} / ${sg(e.apcPct, 0)} / **${sg(e.totalPct, 0)}**`), eff[1].note]);
}
table(['Card', 'id', 'R', 'Archetype', 'Early APS/APC/Total', 'Mid APS/APC/Total', 'Late APS/APC/Total', 'Notes (Mid)'], binderRows);

// (d) field
P('## (d) Field cards');
P('Field mult is additive with the SAUCE global mult (getFieldMult + allAuraMult), so its relative value shrinks once Sigma Glaze is bought.');
P('');
// tickKekCoins(): resting nugget coins auto-collect after KEK_IDLE_TIMEOUT_S, except under Sigma Slam.
const KEK_IDLE_S = Number((/const KEK_IDLE_TIMEOUT_S\s*=\s*([0-9.]+)/.exec(SRC) || [])[1]) || 20;
// Mirrors spawnEvent(): forced-boss roll bossBias = (boost − 1) × 0.2 / 0.8, else 1 in 5 EVENTS.
function ohioBossChance(boost) { const b = boost > 1 ? (boost - 1) * 0.2 / 0.8 : 0; return b + (1 - b) / 5; }
function fieldTradeoff(p) {
  const t = [];
  if (p.disableAutoCollect) t.push('AUTO_COLLECT burns refused (card kept, Boyfriend echo allowed), no Doge auto-collect, Kek coins don\'t auto-collect after ' + KEK_IDLE_S + 's (they do on other Fields)');
  if (p.blackoutInterval) t.push(`blackout ${p.blackoutDuration}s every ${p.blackoutInterval}s (${f(p.blackoutDuration / p.blackoutInterval * 100, 0)}% of the time dark; the interval clock runs during the blackout)`);
  if (p.fireInterval) t.push(`ramps ${f(p.mult * 100)}%→${f((p.mult + p.fireMaxLevel * p.fireAuraPer) * 100)}% over ${p.fireInterval * p.fireMaxLevel}s, resets when unequipped`);
  if (p.bossSpawnMult) { const base = 1 / 5, ohio = ohioBossChance(p.bossSpawnMult); t.push(`boss chance per event ${f(base * 100)}%→${f(ohio * 100)}% (+${f((ohio / base - 1) * 100)}%, text says +${f((p.bossSpawnMult - 1) * 100)}%), +${p.kekBossReward} Kek per win`); }
  if (p.coinTrailInterval) t.push(`Nyan Cat every ${p.coinTrailInterval}s worth 3 Kek if clicked = ${f(3 * 60 / p.coinTrailInterval, 1)} Kek/min (${f(3 * 60 / p.coinTrailInterval / KEK_MIN * 100)}% of click Kek)`);
  if (p.kekDropBonusEvery) t.push(`+1 Kek every ${p.kekDropBonusEvery === 2 ? '2nd' : p.kekDropBonusEvery + 'th'} natural nugget drop = +${f(kekPerMin({ pbj: true }) - KEK_MIN, 1)} Kek/min (+${f(100 / p.kekDropBonusEvery)}% click Kek), only while clicking; Brian / Nyan coins excluded`);
  if (p.cardDropRate) t.push('cardDropRate: NOOP (no card drops exist)');
  return t.join('; ') || 'none';
}
table(['Field', 'id', 'mult', 'Early Δincome', 'Mid Δincome', 'Late Δincome', 'Tradeoff (from params)'],
  CARD_LIBRARY.filter(c => c.type === 'Field').map(card => {
    const d = REF_STATES.map(s => {
      const g0 = baseG(s), g1 = baseG(s, { field: card.id, fireLevel: card.id === 'f5' ? (card.params.fireMaxLevel || 5) : 0 });
      const g1lo = baseG(s, { field: card.id, fireLevel: 0 });
      const t0 = apsIncome(g0) + CPS * clickValue(g0);
      const hi = pct(apsIncome(g1) + CPS * clickValue(g1), t0), lo = pct(apsIncome(g1lo) + CPS * clickValue(g1lo), t0);
      return card.id === 'f5' ? `${sg(lo, 0)}→${sg(hi, 0)}` : sg(hi, 0);
    });
    const m = card.id === 'f5' ? `${f(card.params.mult * 100)}–${f((card.params.mult + card.params.fireMaxLevel * card.params.fireAuraPer) * 100)}%` : `${f(card.params.mult * 100)}%`;
    return [card.name, card.id, m, ...d, fieldTradeoff(card.params)];
  }));

// (e) packs
P('## (e) Pack pulls — Monte Carlo of pullCard()');
const skBS = successKidBS();
P(`pullCard() odds read from game.js: Field ${PULL.field * 100}%, then common < ${PULL.common}, uncommon < ${PULL.rareCut}, rare above.` + (PULL_WARN.length ? ` **WARNING: could not parse ${PULL_WARN.join(', ')} — defaults used; update the PULL parser.**` : ''));
P('');
P(`Pools: Field ${POOLS.Field.length}, Common ${POOLS.common.length}, Uncommon ${POOLS.uncommon.length}, Rare ${POOLS.rare.length} (Burn+Binder). Success Kid adds rareBonus ${skBS.rareBonus}, mythicBonus ${skBS.mythicBonus}.`);
P('');
function packRun(bs, seed) {
  const rng = mulberry32(seed), counts = {}, byGroup = { Field: 0, common: 0, uncommon: 0, rare: 0 };
  let dupes = { usable: 0, useless: 0 };
  for (let i = 0; i < PACKS_MC; i++) {
    const c = pullCard(rng, bs);
    byGroup[c.type === 'Field' ? 'Field' : c.rarity]++;
    if (counts[c.id]) (c.type === 'Burn' ? dupes.usable++ : dupes.useless++);
    counts[c.id] = (counts[c.id] || 0) + 1;
  }
  return { byGroup, dupes, unique: Object.keys(counts).length, counts };
}
function completion(bs, seed) {
  const rng = mulberry32(seed), res = [];
  for (let t = 0; t < TRIALS; t++) {
    const seen = new Set(); let n = 0;
    while (seen.size < CARD_LIBRARY.length && n < 1e5) { seen.add(pullCard(rng, bs).id); n++; }
    res.push(n);
  }
  res.sort((a, b) => a - b);
  return { mean: res.reduce((a, b) => a + b) / res.length, p50: res[Math.floor(res.length * 0.5)], p10: res[Math.floor(res.length * 0.1)], p90: res[Math.floor(res.length * 0.9)] };
}
const runs = [['No luck', NO_BS], ['Success Kid slotted', skBS]].map(([label, bs]) => ({ label, bs, mc: packRun(bs, SEED), comp: completion(bs, SEED + 1) }));
table(['Setup', 'Field', 'Common', 'Uncommon', 'Rare', 'Unique after 1,000', 'Burn dupes (usable)', 'Binder/Field dupes (useless)'],
  runs.map(r => [r.label, ...['Field', 'common', 'uncommon', 'rare'].map(k => f(r.mc.byGroup[k] / PACKS_MC * 100, 1) + '%'), r.mc.unique, r.mc.dupes.usable, r.mc.dupes.useless]));
P(`Per-card odds per pack (analytic): ` + [['Field', POOLS.Field[0]], ['Common', POOLS.common[0]], ['Uncommon', POOLS.uncommon[0]], ['Rare', POOLS.rare[0]]]
  .map(([l, c]) => `${l} ${f(cardOdds(c) * 100, 2)}% (SK ${f(cardOdds(c, skBS) * 100, 2)}%)`).join(' · '));
P('');
P(`Packs to complete all ${CARD_LIBRARY.length} cards (${TRIALS} trials):`);
P('');
table(['Setup', 'Mean packs', 'p10', 'Median', 'p90', 'Kek to buy median (+shop)', `Minutes @${f(KEK_MIN, 1)} Kek/min`],
  runs.map(r => {
    const disc = r.bs === NO_BS ? 0 : (CARD_BY_ID.get('bi_u2').params.kekPackDiscountCap || 0);   // SK discount at its cap
    const k = cumPackKek(r.comp.p50, disc) + BAL.KEK_SHOP_COST;
    return [r.label + (disc ? ` (−${disc} Kek/pack)` : ''), f(r.comp.mean), r.comp.p10, r.comp.p50, r.comp.p90, f(k), f(k / KEK_MIN)];
  }));

// Kek economy
P('## Kek Koin economy');
P(`Clicks per nugget Kek drop: ${f(clicksPerKek(), 2)} (pity ${BAL.KEK_BASE_CLICK_INTERVAL}, ${BAL.KEK_RNG_CHANCE * 100}% per click), Harambe ${f(clicksPerKek(CARD_BY_ID.get('bi_c2').params.kekIntervalReduce), 2)}.`);
P('');
table(['Income source @' + CPS + 'cps', 'Kek/min'], [
  ['Clicking only', f(KEK_MIN, 2)], ['+ Harambe', f(kekPerMin({ harambe: true }), 2)], ['+ PBJ field', f(kekPerMin({ pbj: true }), 2)], ['+ Harambe + PBJ', f(kekPerMin({ harambe: true, pbj: true }), 2)],
]);
const GRUMPY = CARD_BY_ID.get('bi_u1').params.kekPackDiscount || 0, SKCAP = CARD_BY_ID.get('bi_u2').params.kekPackDiscountCap || 0;
const milestones = [1, 5, 10, 20, 30, 59, 100, 150, 200];
table(['Pack #', 'Cost', 'Cost w/ Grumpy+SK(max)', 'Cumulative Kek (+shop)', 'Minutes (clicks only)', 'Minutes (Harambe+PBJ)'],
  milestones.map(n => { const c = cumPackKek(n) + BAL.KEK_SHOP_COST; return [n, packCost(n), packCost(n, GRUMPY + SKCAP), f(c), f(c / KEK_MIN, 1), f(c / kekPerMin({ harambe: true, pbj: true }), 1)]; }));

// (f) multi-copy
P('## (f) Multi-copy "Use All" (activateBurnMulti) N = 2..10');
P(`"Use All" consumes min(N, MULTI_COPY_CAP = ${BAL.MULTI_COPY_CAP}) copies; the rest stay in the hand. Multiplier is 2^n − 1 for KEK_SPAWN and INSTANT_BURST; KEK_DOUBLE_BUFF and Gabe (one bone run, every bone × n, skilled hit rate) are linear. "all vs n singles" compares the n copies used. "Packs to hold N" = N ÷ per-pack odds of that card (no luck), "Kek" = cumulative pack cost from a fresh save.`);
P('');
const multi = CARD_LIBRARY.filter(c => c.type === 'Burn' && c.params && c.params.multiKekBonus);
const midG = baseG(REF_STATES[1]);
function multiPayout(card, N) {   // mirrors activateBurnMulti()
  const p = card.params, n = Math.min(N, BAL.MULTI_COPY_CAP), mult = Math.pow(2, n) - 1;
  if (card.archetype === 'KEK_SPAWN') return { v: (p.kekCoins || 2) * mult, single: (p.kekCoins || 2) * n, unit: 'Kek' };
  if (card.archetype === 'KEK_DOUBLE_BUFF') return { v: (p.doubleCount || 5) * n, single: (p.doubleCount || 5) * n, unit: 'Kek' };
  if (card.archetype === 'COIN_RAIN') { const one = (p.kekPerBone || 0) * (p.coins || 25) * HIT.skilled; return { v: one * n, single: one * n, unit: 'Kek' }; }
  if (card.archetype === 'INSTANT_BURST') return { v: (p.apsSeconds || 600) * mult, single: (p.apsSeconds || 600) * n, unit: 'EAS' };
  return { v: 0, single: 0, unit: '?' };
}
const nRows = [];
for (let n = 2; n <= 10; n++) {
  nRows.push([n, Math.pow(2, Math.min(n, BAL.MULTI_COPY_CAP)) - 1, ...multi.map(c => { const m = multiPayout(c, n); return `${f(m.v)} vs ${f(m.single)}`; }),
    ...multi.map(c => { const packs = Math.ceil(n / cardOdds(c)); return `${f(packs)} (${f(cumPackKek(packs) / 1000, 1)}k)`; })]);
}
table(['N', '2^n−1 (n capped)', ...multi.map(c => `${c.name} (${multiPayout(c, 2).unit}): all vs n singles`), ...multi.map(c => `Packs to hold N ${c.name} (Kek)`)], nRows);
P(`El Risitas at Mid (computeBaseEAS ${f(computeBaseEAS(midG))}): N=3 → ${f(computeBaseEAS(midG) * 600 * 7)} Aura; N=10 → ${f(computeBaseEAS(midG) * 600 * (Math.pow(2, Math.min(10, BAL.MULTI_COPY_CAP)) - 1))} Aura (capped at ${BAL.MULTI_COPY_CAP} copies).`);
P('');

// (g) systems: frenzy, events, boss
P('## (g) Systems: frenzy, events, boss');
const FCPS = BAL.FRENZY_THRESHOLD_CPS, FDUR = 10, FCD = 30;   // activateFrenzy / endFrenzy constants (10s, 30s cooldown)
table(['State', `Frenzy extra (EAS) @${FCPS}cps`, 'of which APS ×10', 'of which clicks ×10', `Per minute if sustained (${FDUR}s on / ${FCD}s cd)`, 'Level 67 Gyatt (100× clicks 15s) EAS-eq', 'Boss win reward', 'Break-even bank (win @6cps)'],
  REF_STATES.map(s => {
    const G = baseG(s), eas = computeEAS(G), cv = clickValue(G);
    const fAps = 9 * apsIncome(G) * FDUR / eas, fClk = 9 * FCPS * FDUR * cv / eas;
    const gy = 99 * 15 * CPS * cv / eas;
    const winT = BAL.BOSS_CLICKS_TO_DEFEAT / CPS;                // seconds to land 20 boss clicks
    const drainFrac = BAL.BOSS_DRAIN_PCT_PER_SEC * winT;         // of bank (tickBoss)
    const breakEven = BAL.BOSS_REWARD_SECONDS / drainFrac;      // bank (in EAS) where drain = reward
    return [s.name, f(fAps + fClk), f(fAps), f(fClk), f((fAps + fClk) * 60 / (FDUR + FCD)), f(gy), `${BAL.BOSS_REWARD_SECONDS} EAS`, `${f(breakEven)} EAS (${f(breakEven / 60)} min of income)`];
  }));
{
  const evMean = (BAL.EVENT_SPAWN_MIN_S + BAL.EVENT_SPAWN_MAX_S) / 2, pBoss = 1 / 5;  // EVENTS has 5 entries, 1 boss
  const pOhio = ohioBossChance(CARD_BY_ID.get('f1').params.bossSpawnMult);
  P(`Events every ${BAL.EVENT_SPAWN_MIN_S}–${BAL.EVENT_SPAWN_MAX_S}s (mean ${evMean}s): boss ${f(pBoss * 100)}% (one per ${f(evMean / pBoss / 60, 1)} min), Ohio ${f(pOhio * 100)}% (one per ${f(evMean / pOhio / 60, 1)} min → ${f(CARD_BY_ID.get('f1').params.kekBossReward * 60 / (evMean / pOhio), 2)} Kek/min if every boss is won), Gyatt 20%, Fanum Tax 60% (−10% bank if not clicked within 3s). Boss: ${BAL.BOSS_DRAIN_PCT_PER_SEC * 100}%/s drain, cap ${BAL.BOSS_DRAIN_CAP * 100}%, AFK auto-resolve after ${BAL.BOSS_AUTO_RESOLVE_IDLE_S}s (= ${f(BAL.BOSS_DRAIN_PCT_PER_SEC * BAL.BOSS_AUTO_RESOLVE_IDLE_S * 100)}% lost), win needs ${BAL.BOSS_CLICKS_TO_DEFEAT} clicks in ${BAL.BOSS_DEFEAT_WINDOW_S}s.`);
  P('');
}

process.stdout.write(out.join('\n') + '\n');
