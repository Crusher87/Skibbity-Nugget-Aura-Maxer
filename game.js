// ============================================================
// SKIBIDI NUGGET AURA MAXXER - Game Logic
// ============================================================

// --- Number Formatting ---
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  let i = 0; let v = n;
  while (v >= 1000 && i < SUFFIXES.length - 1) { v /= 1000; i++; }
  const tenths = Math.floor(v * 10) / 10;
  const str = tenths % 1 === 0 ? Math.floor(tenths).toString() : tenths.toFixed(1);
  return str + SUFFIXES[i];
}

// --- Balance Constants (tunable) ---
const BAL = {
  BINDER_SLOTS: 5,
  BURN_INVENTORY_CAP: 10,
  BURN_GLOBAL_COOLDOWN_MS: 1500,
  CLICK_MULT_CAP: 10,                  // cap on the summed card click buffs (Gyatt rides on top)
  CLICK_TOTAL_CAP: 100,                // cap on buffs × crit × Arthur for one click, before frenzy
  APS_MULT_CAP: 5,                     // cap on the summed temp APS buffs (Rickroll, Charlie, Dream)
  MULTI_COPY_CAP: 3,                   // "Use All" consumes at most this many copies
  EAS_COMMON: 30,                      // base EAS budget per Burn rarity
  EAS_UNCOMMON: 120,
  EAS_RARE: 600,
  BOSS_DRAIN_PCT_PER_SEC: 0.02,
  BOSS_DRAIN_CAP: 0.20,
  BOSS_CLICKS_TO_DEFEAT: 20,
  BOSS_DEFEAT_WINDOW_S: 8,
  BOSS_REWARD_SECONDS: 300,            // 5 min of EAS on defeat
  BOSS_AUTO_RESOLVE_IDLE_S: 5,
  EVENT_SPAWN_MIN_S: 90,
  EVENT_SPAWN_MAX_S: 180,
  FRENZY_THRESHOLD_CPS: 7,
  PACK_LUCK_RARE_BONUS: 0.05,
  PACK_LUCK_MYTHIC_BONUS: 0.02,
  KEK_BASE_CLICK_INTERVAL: 30,   // guaranteed Kek Koin drop every N clicks
  KEK_RNG_CHANCE: 0.01,          // per-click random chance otherwise
  KEK_SHOP_COST: 50,             // Kek Koins to unlock card shop
  KEK_PACK_COST_BASE: 5,
  KEK_PACK_COST_SCALE: 1.5,      // pack N cost = BASE + floor(N * SCALE)
};

// --- Game State ---
const G = {
  aura: 0,
  totalClicks: 0,
  auraPerClick: 1,
  auraPerSecond: 0,
  allAuraMult: 1.0,
  frenzyActive: false,
  frenzyTimer: 0,
  frenzyCooldown: 0,
  clickTimestamps: [],
  recentClickTimestamps: [],       // last 30s of clicks — used by All Your Base
  frenzyMeter: 0,
  // Active click buffs, each with its own timer; they stack additively (see clickBuffMult).
  // { src, mult, t, uncapped, centerOnly, echo, easPerClick, capEAS, paidEAS, kekEveryNHits, kekCap, kekPaid, hits }
  clickBuffs: [],
  // Active temp APS buffs (TEMP_APS_MULT burns): { src, mult, t }
  apsBuffs: [],
  doubleNextClick: false,     // Arthur Fist: next nugget click counts double
  bossPauseTimer: 0,   // Have You Ever Had A Dream: Skibidi drain frozen while > 0
  echoOffset: 150,   // px offset of the Distracted Boyfriend echo click
  owned: { ketchup: 0, ranch: 0, szechuan: 0, grimace: 0, sigma: 0 },
  // Card system
  cardShopUnlocked: false,
  packsPurchased: 0,
  collection: {},
  binderSlots: [null, null, null, null, null],
  fieldSlot: null,                     // single active Field card id
  burnCooldownUntil: 0,                // timestamp of next allowed burn activation
  critClickCounter: 0,                 // for Chuck Norris CRIT_CHANCE
  brainMinutes: 0,                     // Expanding Brain: minutes played with it slotted (saved)
  moodIndex: 0,                        // for Pepe MOOD_SWING
  moodTimer: 0,
  lastIdleClickTime: Date.now(),       // for IDLE_DRIP (reset on load so idle time counts from load)
  burnBarPage: 0,                      // burn bar page (not saved; clamped in renderBurnBar)
  nuggetFx: { shrink: 0, grow: 0, invisible: 0 },  // active nugget size/visibility effects (counters, not saved)
  // Boss state
  boss: null,                          // {active, hp, drainAccumPct, defeatClicks:[], spawnedAt}
  gameState: 'main',
  // Kek Koin currency (separate from Aura; gates card shop + packs)
  kekCoins: 0,
  clicksSinceLastKek: 0,
  totalKekEarned: 0,
  kekDoubleCount: 0,   // remaining Kek Koins that are worth 2× (from KEK_DOUBLE_BUFF)
  // This is Fine fire level
  fireLevel: 0,        // current fire level 0–5 (escalates every 30s while f5 is equipped)
  fireAccum: 0,        // seconds accumulated toward next fire level tick
};

// --- Upgrades ---
const UPGRADES = [
  { id: 'ketchup', name: '🍅 Ketchup', rarity: 'common', type: 'passive', desc: '+1 Aura/sec', effect: 'aps', value: 1, baseCost: 150, scale: 1.15 },
  { id: 'ranch', name: '🥗 Sus Ranch', rarity: 'uncommon', type: 'passive', desc: '+15 Aura/sec', effect: 'aps', value: 15, baseCost: 3000, scale: 1.18 },
  { id: 'szechuan', name: '🌶️ Szechuan Synergy', rarity: 'rare', type: 'active', desc: '+10 Aura/click', effect: 'apc', value: 10, baseCost: 75000, scale: 1.20 },
  { id: 'grimace', name: '👿 Grimace Extract', rarity: 'epic', type: 'passive', desc: '+200 Aura/sec', effect: 'aps', value: 200, baseCost: 3000000, scale: 1.25 },
  { id: 'sigma', name: '💎 Sigma Ohio Rizz Glaze', rarity: 'legendary', type: 'mult', desc: '+0.5x Global Multiplier', effect: 'mult', value: 0.5, baseCost: 100000000, scale: 1.50 },
];

function getCost(u) {
  let cost = u.baseCost * Math.pow(u.scale, G.owned[u.id]);
  const bs = getBinderStats();
  if (bs.costReduce) cost *= (1 - bs.costReduce);
  return Math.floor(cost);
}

// --- 60-Card Library (59 collectibles + 1 boss event) ---
// Schema: {id, name, emoji, type, rarity, desc, archetype, params}
// archetype drives EFFECT_HANDLERS dispatch; params are archetype-specific.
const CARD_LIBRARY = [
  // ============ FIELD cards (6) — single active slot, global mult + theme ============
  { id: 'f1', name: 'Ohio Boss', emoji: '🌽', type: 'Field', rarity: 'mythic-rare', desc: '+50% Aura on everything! Boss spawns 50% more often — but every time you defeat the Skibidi Toilet while in Ohio, it drops 5 Kek Koins!', flavor: 'Only in Ohio...', archetype: 'FIELD_THEME', params: { mult: 0.50, theme: 'ohio', bossSpawnMult: 1.5, kekBossReward: 5 } },
  { id: 'f2', name: 'Sigma Slam', emoji: '🗿', type: 'Field', rarity: 'mythic-rare', desc: 'Huge +80% Aura boost! But nothing collects itself — you have to click everything. Only for real pros!', flavor: 'No talking. Just grinding.', archetype: 'FIELD_THEME', params: { mult: 0.80, theme: 'sigma', disableAutoCollect: true } },
  { id: 'f3', name: 'Nyan Cat', emoji: '🌈', type: 'Field', rarity: 'mythic-rare', desc: '+30% Aura boost. Every 20s Nyan Cat flies across the screen — click it to grab 3 Kek Koins! Lower multiplier than other fields, but free Kek Koins forever!', flavor: 'Pop tart. Cat. Rainbow. Perfect.', archetype: 'FIELD_THEME', params: { mult: 0.30, theme: 'nyan', coinTrailInterval: 20 } },
  { id: 'f4', name: 'Moth and Lamp', emoji: '🪔', type: 'Field', rarity: 'mythic-rare', desc: '+65% Aura boost! But every 30s the screen plunges into darkness for 5 seconds — you can barely see anything. Kek Koins, burn cards, events — all hidden in the dark. The lamp giveth, the lamp taketh.', flavor: 'LAMP. Beautiful, glowing LAMP.', archetype: 'FIELD_THEME', params: { mult: 0.65, theme: 'dark', blackoutInterval: 30, blackoutDuration: 5 } },
  { id: 'f5', name: 'This is Fine', emoji: '🔥', type: 'Field', rarity: 'mythic-rare', desc: 'Starts at +25% Aura — but every 30s the fire spreads one level (up to 5). Each level adds +8% more Aura and thickens the smoke. At max you\'re at +65% Aura. This is fine.', flavor: 'Everything is totally fine.', archetype: 'FIELD_THEME', params: { mult: 0.25, theme: 'fire', fireInterval: 30, fireMaxLevel: 5, fireAuraPer: 0.08 } },
  { id: 'f6', name: 'Peanut Butter Jelly', emoji: '🍌', type: 'Field', rarity: 'mythic-rare', desc: '+40% Aura! AND every Kek Koin that pops out of the nugget comes with a free bonus Kek Koin! It\'s peanut butter jelly time!', flavor: 'It\'s peanut butter jelly time!', archetype: 'FIELD_THEME', params: { mult: 0.40, theme: 'banana', kekDropBonus: 1 } },

  // ============ BINDER cards (15) — passive while slotted ============
  // Common (×6) — +5% global or unique passive
  { id: 'bi_c1', name: 'Shrek', emoji: '🧅', type: 'Binder', rarity: 'common', desc: '+5% Aura on everything! Plus the Skibidi Toilet drains you 10% less. Get out of my swamp!', flavor: 'This is MY swamp.', archetype: 'GLOBAL_MULT', params: { mult: 0.05, drainReduce: 0.10 } },
  { id: 'bi_c2', name: 'Harambe', emoji: '🦍', type: 'Binder', rarity: 'common', desc: 'Dicks out for Harambe! Kek Koins appear every 22 clicks instead of 30 — AND every click earns +0.5 flat Aura. RIP.', flavor: 'Gone too soon. Never forgotten.', archetype: 'PASSIVE_APC_PCT', params: { flatApc: 0.5, kekIntervalReduce: 8 } },
  { id: 'bi_c3', name: 'Stonks', emoji: '📈', type: 'Binder', rarity: 'common', desc: 'A bonus item falls every 90s — click it to grab 75 Aura! Stonks going up!', flavor: 'Number go up. Very stonks.', archetype: 'TIMED_DROP', params: { interval: 90, valueEAS: 75, fluctuate: 0.3, autoCollect: false } },
  { id: 'bi_c4', name: 'Philosoraptor', emoji: '🦖', type: 'Binder', rarity: 'common', desc: 'Every 90s a floating question mark floats down the screen. Hover over it to grab 3 Kek Koins — not Aura, actual Kek Koins for packs!', flavor: 'If a nugget spins and no one clicks it, does it make Aura?', archetype: 'TIMED_DROP', params: { interval: 90, kekValue: 3, requireHover: true, dropEmoji: '❓' } },
  { id: 'bi_c5', name: 'Doge', emoji: '🐕', type: 'Binder', rarity: 'common', desc: 'Such bonus! Much Aura! Every 60s you automatically get 30 free Aura. Wow.', flavor: 'wow. such aura. very click. much wow.', archetype: 'TIMED_DROP', params: { interval: 60, valueEAS: 30, autoCollect: true } },
  { id: 'bi_c6', name: 'First World Problems', emoji: '😢', type: 'Binder', rarity: 'common', desc: 'Stop clicking for 5 seconds and earn 1.5× Aura per second until you click again. Great for going AFK!', flavor: 'My Wi-Fi is too fast to go AFK.', archetype: 'IDLE_DRIP', params: { idleThreshold: 5, idleApsMult: 1.5 } },
  // Uncommon (×6)
  { id: 'bi_u1', name: 'Grumpy Cat', emoji: '😾', type: 'Binder', rarity: 'uncommon', desc: '+3% Aura boost always, upgrades cost 10% less, AND every booster pack costs 2 fewer Kek Koins. Even after you own everything, that discount stays. No.', flavor: 'No. — Tardar Sauce', archetype: 'COST_REDUCTION', params: { reduce: 0.10, globalMult: 0.03, kekPackDiscount: 2 } },
  { id: 'bi_u2', name: 'Success Kid', emoji: '👶', type: 'Binder', rarity: 'uncommon', desc: '+1% Aura per different card in your collection right now (up to +10%), luckier pack pulls, PLUS the more unique cards you own the cheaper packs get — up to 5 Kek Koins off each pack!', flavor: 'Nailed it.', archetype: 'PACK_LUCK', params: { rareBonus: 0.05, mythicBonus: 0.02, multPerCardType: 0.01, capPct: 0.10, kekPackDiscountPerCard: 0.2, kekPackDiscountCap: 5 } },
  { id: 'bi_u3', name: 'Big Chungus', emoji: '🐰', type: 'Binder', rarity: 'uncommon', desc: 'Makes the nugget 1.5× bigger and gives +5% click Aura. Easier to click and easier to catch chase events!', flavor: 'Chonky. Unstoppable. Iconic.', archetype: 'BIGGER_TARGET', params: { scale: 1.5, apcBonus: 0.05, hitboxBonus: true } },
  { id: 'bi_u4', name: 'Hide the Pain Harold', emoji: '🙂', type: 'Binder', rarity: 'uncommon', desc: '+3% Aura boost always, plus Skibidi Toilet drains you 20% less. I\'m fine.', flavor: 'Everything is wonderful. Please send help.', archetype: 'EVENT_SOFTENER', params: { drainMult: 0.8, globalMult: 0.03 } },
  { id: 'bi_u5', name: 'I Can Has Cheezburger', emoji: '🍔', type: 'Binder', rarity: 'uncommon', desc: 'A burger floats by every 60s — click it to grab 120 Aura! Got Doge in another slot too? The burger doubles to 240 Aura!', flavor: 'O hai. Can I also has Aura?', archetype: 'TIMED_DROP', params: { interval: 60, valueEAS: 120, autoCollect: false, comboWith: 'bi_c5', comboMult: 2 } },
  { id: 'bi_u6', name: 'Expanding Brain', emoji: '🧠', type: 'Binder', rarity: 'uncommon', desc: '+1% click Aura for every minute you play with it slotted — up to +30%. The longer you play, the better it gets.', flavor: 'Big brain time has arrived.', archetype: 'SCALING_OVER_TIME', params: { apcPerMin: 0.01, capPct: 0.30 } },
  // Rare (×3)
  { id: 'bi_r1', name: 'Chuck Norris', emoji: '🥋', type: 'Binder', rarity: 'rare', desc: 'Every 10th click is a super crit hit for 10× Aura! ROUNDHOUSE!', flavor: 'Chuck Norris doesn\'t click the nugget. The nugget clicks itself.', archetype: 'CRIT_CHANCE', params: { everyN: 10, mult: 10 } },
  { id: 'bi_r2', name: 'Pepe (Mood Swing)', emoji: '🐸', type: 'Binder', rarity: 'rare', desc: 'Switches modes every 30s: +20% Aura/sec, then +20% click Aura, then +10% on everything — then repeats!', flavor: 'Feels good man. Feels bad man. Feels good again.', archetype: 'MOOD_SWING', params: { cycleSec: 30, moodAps: 0.20, moodApc: 0.20, moodGlobal: 0.10 } },
  { id: 'bi_r3', name: 'GigaChad', emoji: '🗿', type: 'Binder', rarity: 'rare', desc: '+20% Aura per second. The whole screen goes black and white. Just vibes.', flavor: 'He said nothing. He did everything.', archetype: 'PASSIVE_APS_PCT', params: { pct: 0.20, filter: 'grayscale' } },

  // ============ BURN cards (38) — single-use consumables ============
  // Common (×18) — base budget 30 EAS
  { id: 'bu_c1', name: 'Troll Face', emoji: '😈', type: 'Burn', rarity: 'common', desc: 'A troll face drifts around the screen — click it within 5s for 45 seconds of Aura. Problem?', flavor: 'Problem?', archetype: 'TARGET_CHASE', params: { targets: 1, timeout: 5, rewardEAS: 45 } },
  { id: 'bu_c2', name: 'Is This a Pigeon?', emoji: '🦋', type: 'Burn', rarity: 'common', desc: '6 butterflies zigzag down the screen! Click them for 7.5 seconds of Aura each.', flavor: 'Is this... Aura?', archetype: 'COIN_RAIN', params: { coins: 6, valueEASEach: 7.5, duration: 4, motion: 'sine' } },
  { id: 'bu_c3', name: 'Spiderman Pointing', emoji: '🕷️', type: 'Burn', rarity: 'common', desc: 'Spiderman points at every Kek Koin on screen and scoops them up, then auto-clicks the nugget 10 times — each click banks 3.5 seconds of Aura!', flavor: 'That Spiderman is clicking MY nugget!', archetype: 'AUTO_COLLECT', params: { clicks: 10, mult: 1.5, duration: 5, autoCollectKekCoins: true, easPerClick: 3.5, capEAS: 35 } },
  { id: 'bu_c4', name: 'Distracted Boyfriend', emoji: '👀', type: 'Burn', rarity: 'common', desc: 'For 8s every nugget click counts twice — a ghost click pops up beside it — and also banks 0.6 seconds of Aura (max 30s).', flavor: 'One click becomes two. Somehow.', archetype: 'AUTO_COLLECT', params: { echoClick: true, echoDuration: 8, echoOffset: 150, easPerClick: 0.6, capEAS: 30 } },
  { id: 'bu_c5', name: 'Mocking SpongeBob', emoji: '🧽', type: 'Burn', rarity: 'common', desc: 'AlTeRnAtInG cAsE engaged! Your next 5 nugget Kek Koins are worth DOUBLE. Use up to 3 copies at once for 15 doubles!', flavor: 'yOu CaNt StOp ReAdInG tHiS', archetype: 'KEK_DOUBLE_BUFF', params: { doubleCount: 5, multiKekBonus: true } },
  { id: 'bu_c6', name: 'Bad Luck Brian', emoji: '😬', type: 'Burn', rarity: 'common', desc: 'Typical Bad Luck Brian — but this time he drops 2 Kek Koins! Use up to 3 copies at once: 2 → 6 → 14 coins!', flavor: 'Got a card. It was this one.', archetype: 'KEK_SPAWN', params: { kekCoins: 2, multiKekBonus: true } },
  { id: 'bu_c7', name: 'Epic Fail Guy', emoji: '🤡', type: 'Burn', rarity: 'common', desc: 'He faceplanted so you get a sympathy gift — 30 seconds worth of Aura right now!', flavor: 'FAIL. But like, a productive one.', archetype: 'INSTANT_BURST', params: { apsSeconds: 30 } },
  { id: 'bu_c8', name: 'Charlie Bit My Finger', emoji: '👶', type: 'Burn', rarity: 'common', desc: 'Ouch! That hurt! Get 3× Aura per second for 20s.', flavor: 'And it really hurt!', archetype: 'TEMP_APS_MULT', params: { mult: 3, duration: 20 } },
  { id: 'bu_c9', name: 'Have You Ever Had A Dream', emoji: '💭', type: 'Burn', rarity: 'common', desc: 'Whoa dude... 2× Aura per second for 30s AND the Skibidi Toilet freezes — no drain! Cast it mid-fight.', flavor: 'That you, um, you had, um, you would, um...', archetype: 'TEMP_APS_MULT', params: { mult: 2, duration: 30, pauseBoss: true } },
  { id: 'bu_c10', name: 'Kazoo Kid', emoji: '🎺', type: 'Burn', rarity: 'common', desc: '10 Aura drops fall from the top with heavy gravity — they speed up fast! Catch them before they hit the floor for 4.5 seconds of Aura each.', flavor: 'Wait for it.', archetype: 'COIN_RAIN', params: { coins: 10, valueEASEach: 4.5, duration: 8, motion: 'gravity' } },
  { id: 'bu_c11', name: 'Star Wars Kid', emoji: '⚔️', type: 'Burn', rarity: 'common', desc: 'Swinging that lightsaber! 2× click Aura for 15s, and every click banks 0.4 seconds of Aura (max 36s).', flavor: 'He trained his whole life for this moment.', archetype: 'TEMP_CLICK_MULT', params: { mult: 2, duration: 15, easPerClick: 0.4, capEAS: 36 } },
  { id: 'bu_c12', name: 'Vitas (Chum Drum)', emoji: '🎤', type: 'Burn', rarity: 'common', desc: '20 ghost clicks in 3s, each worth 1.5 seconds of Aura — and every one also hits the Skibidi Toilet. Cast it mid-fight for an instant win!', flavor: '♪ Iiiii-ii-ii ♪', archetype: 'AUTO_COLLECT', params: { clicks: 20, mult: 1.5, duration: 3, piercesBoss: true, easPerClick: 1.5, capEAS: 30 } },
  { id: 'bu_c13', name: 'Pink Guy Ravioli', emoji: '🍝', type: 'Burn', rarity: 'common', desc: '8 pieces of ravioli splat on screen and fade away in 1.5s — click them fast for 7.5 seconds of Aura each!', flavor: 'RAAAVIOLI RAAAVIOLI GIVE ME THE FORMUOLI', archetype: 'COIN_RAIN', params: { coins: 8, valueEASEach: 7.5, motion: 'fade', fadeDuration: 1.5 } },
  { id: 'bu_c14', name: 'Dramatic Chipmunk', emoji: '🐹', type: 'Burn', rarity: 'common', desc: 'DUN DUN DUUUN! 5× click Aura for 5 epic seconds, and every click banks 1.2 seconds of Aura (max 36s)!', flavor: 'Dun dun DUUUUN.', archetype: 'TEMP_CLICK_MULT', params: { mult: 5, duration: 5, easPerClick: 1.2, capEAS: 36 } },
  { id: 'bu_c15', name: 'Disaster Girl', emoji: '🔥', type: 'Burn', rarity: 'common', desc: 'Fire sweeps across the screen for 4s, auto-clicking the nugget 10 times (3 seconds of Aura each) and collecting any falling Aura drops in its path!', flavor: 'She didn\'t start the fire. Probably.', archetype: 'AUTO_COLLECT', params: { clicks: 10, mult: 3, duration: 4, sweep: true, sweepRadius: 150, easPerClick: 3, capEAS: 30 } },
  { id: 'bu_c16', name: 'David After Dentist', emoji: '😵', type: 'Burn', rarity: 'common', desc: 'Is this real life?! Screen goes blurry for 6s and the nugget gets huge — sit through it for 45 seconds of Aura!', flavor: 'Is this real life?', archetype: 'SCREEN_GAG', params: { pityEAS: 45, blur: 8, biggerNugget: true, gagDuration: 6 } },
  { id: 'bu_c17', name: 'Ermahgerd', emoji: '📚', type: 'Burn', rarity: 'common', desc: 'MASH to power it up! Starts at 15s of Aura. Every click anywhere within 3s adds +3s more, up to 60s max!', flavor: 'ERMAHGERD! BERKS!', archetype: 'INSTANT_BURST', params: { baseApsSeconds: 15, mashWindow: 3, mashBonusSeconds: 3, capApsSeconds: 60 } },
  { id: 'bu_c18', name: 'All Your Base', emoji: '👾', type: 'Burn', rarity: 'common', desc: 'Rewards how much you clicked in the last 30s: every 4 clicks = 1 second of Aura. At least 30s, max 60s!', flavor: 'All your Aura are belong to us.', archetype: 'INSTANT_BURST', params: { recentClicksAPC: true, clicksPerSecond: 4, floorApsSeconds: 30, capApsSeconds: 60, retroOverlay: 5 } },
  // Uncommon (×13) — base budget 120 EAS
  { id: 'bu_u1', name: 'MLG Airhorn', emoji: '📯', type: 'Burn', rarity: 'uncommon', desc: '360 NO-SCOPE! BOOM! The screen shakes and you get 160 seconds of Aura all at once!', flavor: 'GET REKT SON', archetype: 'INSTANT_BURST', params: { apsSeconds: 160, shake: true } },
  { id: 'bu_u2', name: 'Arthur Fist', emoji: '👊', type: 'Burn', rarity: 'uncommon', desc: 'SLAM! Get 120 seconds of Aura right now, your very next click counts double, PLUS the fist pounds out 2 Kek Koins every time!', flavor: 'When you\'re mad but stay calm. For now.', archetype: 'INSTANT_BURST', params: { apsSeconds: 120, doubleNext: true, kekBonus: 2 } },
  { id: 'bu_u3', name: 'Ugandan Knuckles', emoji: '🔴', type: 'Burn', rarity: 'uncommon', desc: 'Do you know de wey? Click all 8 Knuckles swarming the screen within 10s — 180 seconds of Aura total!', flavor: 'Do you know de wey to da Aura?', archetype: 'TARGET_CHASE', params: { targets: 8, timeout: 10, rewardEAS: 180, swarm: true } },
  { id: 'bu_u4', name: 'Woman Yelling at Cat', emoji: '😾', type: 'Burn', rarity: 'uncommon', desc: 'An arrow points left or right — click that side of the screen! 4 arrows in 10s, each correct side is worth 37.5 seconds of Aura (150 total).', flavor: 'The cat is NOT sorry.', archetype: 'RHYTHM', params: { spatial: true, sides: 4, duration: 10, perfectEAS: 150 } },
  { id: 'bu_u5', name: 'Leave Britney Alone', emoji: '😭', type: 'Burn', rarity: 'uncommon', desc: 'LEAVE HER ALONE! She runs around the screen with 8 HP. Hit her 8 times in 6s for 240 seconds of Aura!', flavor: 'She has been through ENOUGH.', archetype: 'TARGET_CHASE', params: { targets: 1, hp: 8, timeout: 6, rewardEAS: 240, moving: true } },
  { id: 'bu_u6', name: 'Surgery on a Grape', emoji: '🍇', type: 'Burn', rarity: 'uncommon', desc: 'The nugget shrinks super tiny! For 10s every click that lands gets 5× Aura AND banks 2.5 seconds of Aura (max 150s). Steady hands!', flavor: 'Extremely delicate. Do not sneeze.', archetype: 'PRECISION', params: { duration: 10, mult: 5, smallNugget: true, easPerClick: 2.5, capEAS: 150 } },
  { id: 'bu_u7', name: 'Chocolate Rain', emoji: '🍫', type: 'Burn', rarity: 'uncommon', desc: 'It\'s raining chocolate! 20 drops fall for 8s — every 4th is a golden Kek Koin, the rest give 6 seconds of Aura each. Click fast, you want both!', flavor: 'Some stay dry and others feel the pain.', archetype: 'COIN_RAIN', params: { coins: 20, valueEASEach: 6, duration: 8, motion: 'fall', kekEveryNth: 4 } },
  { id: 'bu_u8', name: 'Zombie Kid Turtle', emoji: '🐢', type: 'Burn', rarity: 'uncommon', desc: 'I like turtles! Click this turtle 5 times within 5s to earn 8 Kek Koins. But if you pause 1.5s, it regains 1 HP — don\'t let it regen!', flavor: 'I like turtles. — Jonathon, age 7', archetype: 'TARGET_CHASE', params: { targets: 1, hp: 5, timeout: 5, kekReward: 8, regenDelay: 1.5, regenHp: 1 } },
  { id: 'bu_u9', name: 'Keyboard Cat', emoji: '🎹', type: 'Burn', rarity: 'uncommon', desc: 'Play it off! Click 5 zones on the right, each one higher than the last, within 8s — 24 seconds of Aura per zone (120 total).', flavor: 'Play him off, keyboard cat.', archetype: 'RHYTHM', params: { ascending: true, zones: 5, duration: 8 } },
  { id: 'bu_u10', name: 'Numa Numa Dance', emoji: '💃', type: 'Burn', rarity: 'uncommon', desc: 'MA-IA-HI! A beat pops up somewhere on screen 6 times in 10s — click each one before it vanishes (0.6s) for 28 seconds of Aura (170 total)!', flavor: 'MA-IA-HI, MA-IA-HU, MA-IA-HO!', archetype: 'RHYTHM', params: { bpm: true, beats: 6, duration: 10, hitWindow: 0.6, randomPos: true, perfectEAS: 170 } },
  { id: 'bu_u11', name: 'Shooting Stars', emoji: '🌠', type: 'Burn', rarity: 'uncommon', desc: 'Woah — 15 neon stars shoot across the screen from left to right! Click them fast in 8s for 12 seconds of Aura each!', flavor: '♪ And in the night you hear me scream ♪', archetype: 'COIN_RAIN', params: { coins: 15, valueEASEach: 12, duration: 8, neon: true, motion: 'streak' } },
  { id: 'bu_u12', name: 'Rickroll', emoji: '🕺', type: 'Burn', rarity: 'uncommon', desc: 'We\'re no strangers to Aura! You\'ve been rickrolled — but in a good way! Get 3× Aura per second for 60s! (It pretends to crash first.)', flavor: 'You know the rules. And so do I.', archetype: 'TEMP_APS_MULT', params: { mult: 3, duration: 60, fakeCrash: true } },
  { id: 'bu_u13', name: 'Gabe the Dog', emoji: '🐕', type: 'Burn', rarity: 'uncommon', desc: 'Bork bork! 25 bones fly across the screen — every bone you catch is worth 0.4 Kek Koins (10 for all 25). Use up to 3 copies at once to multiply every bone!', flavor: 'bork bork bork bork bork', archetype: 'COIN_RAIN', params: { coins: 25, duration: 10, motion: 'bones', kekPerBone: 0.4, multiKekBonus: true } },
  // Rare (×7) — base budget 600 EAS
  { id: 'bu_r1', name: 'John Cena', emoji: '💪', type: 'Burn', rarity: 'rare', desc: 'AND HIS NAME IS... THE NUGGET IS INVISIBLE! For 15s every click that finds it gets 7× Aura AND banks 8 seconds of Aura (max 750s).', flavor: 'AND HIS NAME IS...', archetype: 'PRECISION', params: { duration: 15, mult: 7, invisibleNugget: true, easPerClick: 8, capEAS: 750 } },
  { id: 'bu_r2', name: 'Just Do It (Shia)', emoji: '🎯', type: 'Burn', rarity: 'rare', desc: 'JUST DO IT! 8 beats pop up around the screen, faster and faster over 12s — hit each one for 100 seconds of Aura (800 for all 8)!', flavor: 'Yesterday you said tomorrow!', archetype: 'RHYTHM', params: { accelerating: true, beats: 8, duration: 12, perfectEAS: 800, randomPos: true } },
  { id: 'bu_r3', name: 'Leroy Jenkins', emoji: '🛡️', type: 'Burn', rarity: 'rare', desc: 'LEEEEEROYYY JENKINSSSS! He pops up for just 3s — click him to grab 700 seconds of Aura! He just ran in!', flavor: '...at least he has chicken.', archetype: 'TARGET_CHASE', params: { targets: 1, timeout: 3, rewardEAS: 700 } },
  { id: 'bu_r4', name: 'El Risitas', emoji: '😂', type: 'Burn', rarity: 'rare', desc: 'JA JA JA! Normally banks 600 seconds of income — but hold 2 copies and burn both at once for 1800s, or 3 copies for 4200s. The laughs scale up! (max 3 copies)', flavor: 'jajajajajajajajaja', archetype: 'INSTANT_BURST', params: { apsSeconds: 600, shake: 'violent', multiKekBonus: true } },
  { id: 'bu_r5', name: 'End of Ze World', emoji: '☄️', type: 'Burn', rarity: 'rare', desc: 'AMERICA!! Click 25 missiles one after another in 15s — each is worth 30 seconds of Aura (750 total). Get EVERY SINGLE ONE for a 10 Kek Koin bonus!', flavor: 'WHAT DOES THAT MEAN?!', archetype: 'TARGET_CHASE', params: { targets: 25, timeout: 15, rewardEAS: 750, kekBonus: 10, payPerTarget: true } },
  { id: 'bu_r6', name: 'Overly Attached GF', emoji: '😍', type: 'Burn', rarity: 'rare', desc: 'She\'s watching. Click ONLY the very center of the nugget for 15s — center clicks get 6× Aura, and every 5th center click drops a Kek Koin (max 15). No wandering!', flavor: 'I turned off your auto-save. For us.', archetype: 'PRECISION', params: { duration: 15, mult: 6, deadCenterOnly: true, kekEveryNHits: 5, kekCap: 15, easPerClick: 1, capEAS: 90 } },
  { id: 'bu_r7', name: 'Evil Kermit', emoji: '🐸', type: 'Burn', rarity: 'rare', desc: 'Do it... it\'s a 50/50 gamble! Win and get 1800 seconds of Aura — 3× a single El Risitas. Lose and get nothing.', flavor: 'But that\'s none of my business.', archetype: 'GAMBLE', params: { winEAS: 1800, p: 0.5 } },
];

// O(1) lookup by id — replaces CARD_LIBRARY.find() in hot paths.
const CARD_BY_ID = new Map(CARD_LIBRARY.map(c => [c.id, c]));

// Image art for each card — keyed by card id. Cards without an entry show emoji fallback.
const CARD_IMAGES = {
  // Field
  'f3': 'Images/Cards/Nyan Cat.jpg',
  'f4': 'Images/Cards/Moth and lamp.jpg',
  'f5': 'Images/Cards/This is fine.png',
  'f6': 'Images/Cards/Its peanut butter jelly time.jpg',
  // Binder common
  'bi_c1': 'Images/Cards/Shrek.jpg',
  'bi_c2': 'Images/Cards/Harambe.jpg',
  'bi_c3': 'Images/Cards/Stonks.png',
  'bi_c4': 'Images/Cards/philosoraprot.png',
  'bi_c5': 'Images/Cards/Doge.jpg',
  'bi_c6': 'Images/Cards/First world problems.png',
  // Binder uncommon
  'bi_u1': 'Images/Cards/Grumpy Cat.jpg',
  'bi_u2': 'Images/Cards/SuccessKid.jpg',
  'bi_u3': 'Images/Cards/Big_Chungus.png',
  'bi_u4': 'Images/Cards/Hide the pain.png',
  'bi_u5': 'Images/Cards/i-can-has-cheezburger-cat.jpg',
  'bi_u6': 'Images/Cards/Expanding Brain.png',
  // Binder rare
  'bi_r1': 'Images/Cards/Chuck Norris.png',
  'bi_r2': 'Images/Cards/Pepe.jpg',
  'bi_r3': 'Images/Cards/Gigachad.jpg',
  // Burn common
  'bu_c1': 'Images/Cards/Trollface.png',
  'bu_c2': 'Images/Cards/Is_this_a_pigeon.jpg',
  'bu_c3': 'Images/Cards/spiderman pointing.jpg',
  'bu_c4': 'Images/Cards/distracted-boyfriend.jpg',
  'bu_c5': 'Images/Cards/Mocking-Spongebob.jpg',
  'bu_c6': 'Images/Cards/Bad_Luck_Brian.jpg',
  'bu_c7': 'Images/Cards/Epic Fail Guy.jpg',
  'bu_c8': 'Images/Cards/Charlie_Bit_My_Finger_screenshot.png',
  'bu_c9': 'Images/Cards/Have you ever had a dream.jpg',
  'bu_c10': 'Images/Cards/Kazoo kid.jpg',
  'bu_c11': 'Images/Cards/Star_Wars_Kid.jpg',
  'bu_c12': 'Images/Cards/Vitas.jpg',
  'bu_c13': 'Images/Cards/Pink guy harlem shake.jpg',
  'bu_c14': 'Images/Cards/Dramatic_Chipmunk.png',
  'bu_c15': 'Images/Cards/disaster-girl.jpg',
  'bu_c16': 'Images/Cards/David_After_Dentist_screenshot.jpg',
  'bu_c17': 'Images/Cards/Ermahgerd.jpg',
  'bu_c18': 'Images/Cards/All Your Base Are Belong to Us.png',
  // Burn uncommon
  'bu_u1': 'Images/Cards/mlg-air-horn.jpg',
  'bu_u2': 'Images/Cards/arthur-fist.png',
  'bu_u3': 'Images/Cards/uganda-knuckles.png',
  'bu_u4': 'Images/Cards/WomanYellingAtACat_meme.jpg',
  'bu_u5': 'Images/Cards/Leave Britney Alone.jpg',
  'bu_u6': 'Images/Cards/surgury-on-grape.jpg',
  'bu_u7': 'Images/Cards/chocolate-rain.png',
  'bu_u8': 'Images/Cards/Zombie Kid Likes Turtles.jpg',
  'bu_u9': 'Images/Cards/Keyboard_cat.jpg',
  'bu_u10': 'Images/Cards/Numa.jpg',
  'bu_u11': 'Images/Cards/shooting star.png',
  'bu_u12': 'Images/Cards/Rickroll.jpg',
  'bu_u13': 'Images/Cards/gabe-the-dog-image.jpg',
  // Burn rare
  'bu_r1': 'Images/Cards/John Cena.jpg',
  'bu_r2': 'Images/Cards/Just do it.jpg',
  'bu_r3': 'Images/Cards/Leeroy.jpg',
  'bu_r4': 'Images/Cards/El Ristas.jpg',
  'bu_r5': 'Images/Cards/ZeEnd.jpg',
  'bu_r6': 'Images/Cards/overly-attached-girlfriend.jpg',
  'bu_r7': 'Images/Cards/evil-kermit.jpg',
};

// Per-card transform overrides — x,y are % of art window, scale ≥ 1.0 (1.0 = full image visible)
const CARD_IMAGE_TRANSFORM = {
  'f3': { x: 0, y: -3, scale: 1.56 },
  'f4': { x: 26, y: 0, scale: 1.48 },
  'f5': { x: 6.2, y: -13.7, scale: 1.32 },
  'f6': { x: 3.6, y: -3.6, scale: 1.32 },
  'bi_c1': { x: -0.3, y: -17, scale: 1.16 },
  'bi_c2': { x: -5.1, y: 25.3, scale: 1.48 },
  'bi_c4': { x: -3.8, y: -6.9, scale: 1.24 },
  'bi_c6': { x: 10, y: 3.3, scale: 1.24 },
  'bi_u1': { x: 0.6, y: -8.2, scale: 1.24 },
  'bi_u2': { x: 9.5, y: -2, scale: 1.16 },
  'bi_u3': { x: 7, y: -3.3, scale: 1.08 },
  'bi_u4': { x: -9.2, y: 0, scale: 1.16 },
  'bi_u5': { x: 17, y: 31.6, scale: 2.28 },
  'bi_r1': { x: 3, y: -2.3, scale: 1.4 },
  'bi_r3': { x: 0.5, y: 9.8, scale: 1.24 },
  'bu_c2': { x: -4.9, y: -1, scale: 1.24 },
  'bu_c4': { x: -2.4, y: -0.3, scale: 1.24 },
  'bu_c5': { x: -3.3, y: -7.5, scale: 1.08 },
  'bu_c6': { x: 1.1, y: 11.8, scale: 1.4 },
  'bu_c7': { x: 0, y: 0, scale: 1.16 },
  'bu_c9': { x: 0, y: 0, scale: 1.08 },
  'bu_c10': { x: 0.3, y: -1.3, scale: 1.32 },
  'bu_c11': { x: 0, y: 0, scale: 1.24 },
  'bu_c12': { x: 5.7, y: -0.7, scale: 1.32 },
  'bu_c13': { x: 2.2, y: 3.3, scale: 1.16 },
  'bu_c15': { x: -0.5, y: -14.8, scale: 1.16 },
  'bu_c16': { x: 5.4, y: 1, scale: 1.08 },
  'bu_c17': { x: -3, y: -1, scale: 1.32 },
  'bu_c18': { x: 0, y: 0, scale: 1.08 },
  'bu_u1': { x: -2.4, y: -4.3, scale: 1.48 },
  'bu_u2': { x: 3.2, y: -4.6, scale: 1.08 },
  'bu_u3': { x: -0.6, y: 4.3, scale: 1 },
  'bu_u4': { x: 1.1, y: -4, scale: 1.4 },
  'bu_u5': { x: 11.9, y: 2.3, scale: 1.4 },
  'bu_u6': { x: 10, y: -5.3, scale: 1.32 },
  'bu_u7': { x: 8.1, y: 0.4, scale: 1.16 },
  'bu_u8': { x: 1.1, y: -3.6, scale: 1.24 },
  'bu_u10': { x: -2.7, y: -9.2, scale: 1.08 },
  'bu_u12': { x: -11.3, y: -0.4, scale: 1.16 },
  'bu_u13': { x: 0, y: 10.5, scale: 1.16 },
  'bu_r1': { x: 0.6, y: 4, scale: 1.24 },
  'bu_r2': { x: 0, y: -3.2, scale: 1.24 },
  'bu_r3': { x: -0.5, y: -40.7, scale: 1.56 },
  'bu_r4': { x: 3, y: -1.3, scale: 1.32 },
  'bu_r5': { x: -6.3, y: -4.6, scale: 1.24 },
  'bu_r6': { x: 0, y: 0, scale: 1.16 },
  'bu_r7': { x: -4.6, y: -4.3, scale: 1.32 },
};

// --- DOM Refs ---
const $auraAmt = document.getElementById('aura-amount');
const $auraStats = document.getElementById('aura-stats');
const $kekAmt = document.getElementById('kek-amount');
const $kekCoinOverlay = document.getElementById('kek-coin-overlay');
const $frenzyOverlay = document.getElementById('frenzy-overlay');
const $frenzyText = document.getElementById('frenzy-text');
const $frenzyFill = document.getElementById('frenzy-fill');
const $frenzyMeterWrap = document.getElementById('frenzy-meter-wrap');
const $upgradesList = document.getElementById('upgrades-list');
const $eventLog = document.getElementById('log-content');
const $nuggetContainer = document.getElementById('nugget-container');
const $packOverlay = document.getElementById('pack-overlay');
const $packHint = document.getElementById('pack-hint');
const $boosterContainer = document.getElementById('booster-pack-container');
const $packTopEl = document.getElementById('pack-top');
const $packBotEl = document.getElementById('pack-bottom');
const $packCardFace = document.getElementById('pack-card-face');
const $screenFlash = document.getElementById('screen-flash');
const $binderOverlay = document.getElementById('binder-overlay');
const $binderGrid = document.getElementById('binder-grid');
const $cardsLocked = document.getElementById('cards-locked');
const $cardsUnlocked = document.getElementById('cards-unlocked');
const $packCostDisplay = document.getElementById('pack-cost-display');
const $packsOpenedDisplay = document.getElementById('packs-opened-display');
const $buyPackBtn = document.getElementById('buy-pack-btn');
const $cardCollectionCount = document.getElementById('card-collection-count');
const $fieldFlash = document.getElementById('field-flash');

// --- Sound System ---
const S = {
  fanumDodge: ['2to-be-continued', 'get-outtttttttt', 'oh-my-god-bro-oh-hell-nah-man', 'sticking-out-ur-gyat-for-the-rizzler'],
  fanumHit: ['baby-laughing-meme', 'chicken-on-tree-screaming', 'downer_noise', 'oh-no_7', 'rizzbot-laugh',
    'undertakers-bell_2UwFCIe', 'a-few-moments-later-sponge-bob-sfx-fun'],
  toilet: ['67-on-a-merry-rizzmas', 'brain-rot-67', 'dry-fart', 'fartmeme', 'fart-with-reverb',
    'i-farted-and-a-poopy-almost-slipped-out', 'perfect-fart'],
  gyatt: ['chicken-on-tree-screaming'],
  upgradeSfx: {
    ketchup: ['gotta-eat-my-ketchup'],
    ranch: ['eric-andre-legalize-ranch', 'eric-andre-time-to-ranch-it-up'],
    szechuan: ['szechuan-sauce', 'szechuan-sauce-is-delicious-szechuan-sauce-is-delicious-szechuan-sauce-rick-and-morty-rick-sanchez'],
    grimace: ['ack', 'can-i-get-a-grimace-shake', 'i-just-got-the-grimace-shake_u0Hwmog'],
    sigma: ['swag-like-ohio'],
    cardshop: ['frout'],
  },
  frenzyStart: ['frout', 'level-5-gyatt-rizz', 'long-brain-fart', 'muda_muda_muda_sound_effect', 'sexy-and-i-know-it_crWNUGY',
    '225473-fe558597-6fe3-4f38-9c59-4e0f49cd6839',
    'stereo-sayan-3d-lezbeepic-remix-hd-audiotrimmer_qvUxYEt', 'dbz-rapid-punches-sfx'],
  frenzyLoop: ['fahhh_KcgAXfs'],
  shopUnlock: ['nsync-its-tearing-up-my-heart-audiotrimmer', 'pawn-stars-intro'],
  shopTab: ['50-cent-candy-shop-ft', '02_shop-channel-audiotrimmer', 'tcg-easy-as-123_6Vz9qtk'],
  packBuy: ['buyskyrim2', 'pokemon-tcg-pocket-you-have-a-booster', 'stream-booster', 'shopify-sales'],
  packOpen: ['chrome-2013-11-10-17-01-09-87', 'tearingmeapart', 'i-can-see-the-futuuuurree',
    'dbz-abridged-piccolo-nerd', 'gc8drw1', 'i-summon-pot-of-greed-vr-chat-audiotrimmer',
    'its-time-to-duel-hq_plLYPEG', 'lightning-helix-mtg', 'pot-of-greed'],
  fieldPull: ['muda_muda_muda_sound_effect', 'sexy-and-i-know-it_crWNUGY', 'swag-like-ohio'],
  bgMusic: ['giornos-theme-but-only-the-best-part-is-in_vwd15lya_lyb0-online-audio-converter',
    'indian-song', 'jojos-bizarre-adventure-ay-ay-ay-ay-_-sound-effect',
    'last-rizzmas-i-gave-u-my-gyatt', 'rizz-sound-effect', 'spiderman-meme-song',
    'starplatinum_BmJAGXC', 'sticking-out-your-gyatt-for-the-rizzler', 'za-warudo-stop-time-sound',
    'spongebob-closing-theme-song', 'ohio-ahh-sound-effect', 'sigama-meaal',
    'minecraft-explosion-green-screen', 'bob-esponja-fail-sound', 'videoleap-explosion-sound',
    'fbi-open-up_dwlhiff_ltt610D', 'your-dad-sleeping-sound', 'sponge-bob-fail',
    'relaxing-sounds-for-sleeping', 'sponge-bob-disgusting', 'sponge-bob-womp', 'vine-boom-sound-meme'],
};

// Reuse a single Audio per filename. The first call lazily creates and caches it;
// subsequent calls rewind it to 0 so the same clip can re-fire without spawning
// throwaway DOM Audio elements (which the GC otherwise has to chase).
const _sfxCache = new Map();
function sfx(name, vol = 0.7) {
  let a = _sfxCache.get(name);
  if (!a) {
    a = new Audio(`Sounds/${name}.mp3`);
    _sfxCache.set(name, a);
  } else {
    try { a.currentTime = 0; } catch (_) { }
  }
  a.volume = vol;
  a.play().catch(() => { });
  return a;
}
function sfxRand(arr, vol = 0.7) { return sfx(arr[Math.floor(Math.random() * arr.length)], vol); }

let _bgAudio = null;
function _scheduleBg() {
  const gap = (5 + Math.random() * 10) * 1000;
  setTimeout(_playBg, gap);
}
function _playBg() {
  if (_bgAudio) { _bgAudio.pause(); _bgAudio = null; }
  _bgAudio = sfxRand(S.bgMusic, 0.3);
  _bgAudio.onended = _scheduleBg;
}
let _bgStarted = false;
function _initBg() {
  if (_bgStarted) return;
  _bgStarted = true;
  _playBg();
}

let _frenzyLoopId = null;
function startFrenzyAudio() {
  sfxRand(S.frenzyStart, 0.75);
  _frenzyLoopId = setInterval(() => {
    if (!G.frenzyActive) { clearInterval(_frenzyLoopId); _frenzyLoopId = null; return; }
    sfxRand(S.frenzyLoop, 0.65);
  }, 2500);
}
function stopFrenzyAudio() {
  clearInterval(_frenzyLoopId);
  _frenzyLoopId = null;
}

// --- Panel collapse ---
function togglePanel(id) {
  const el = document.getElementById(id);
  el.classList.toggle('collapsed');
  el.querySelector('.panel-toggle').textContent = el.classList.contains('collapsed') ? '▶' : '▼';
}

// --- Event Log ---
function log(msg) {
  const d = document.createElement('div');
  d.className = 'log-entry'; d.innerHTML = msg;
  $eventLog.prepend(d);
  if ($eventLog.children.length > 50) $eventLog.removeChild($eventLog.lastChild);
}

// --- Click Particles ---
function spawnParticle(x, y, text) {
  const p = document.createElement('div');
  p.className = 'click-particle';
  p.textContent = text;
  p.style.left = (x - 30) + 'px'; p.style.top = (y - 20) + 'px';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1200);
}

// --- 3D Scene ---
let nuggetModel = null, packModel = null, nuggetScale = 1;
let activeTab = 'sauces';
const canvas = document.getElementById('nugget-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(0, 0.5, 4.5);   // z=4.5 matches the 1.5× canvas expansion — nugget same screen size
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

function resizeRenderer() {
  const sz = canvas.clientWidth;   // canvas is 150% of container; use its own size
  renderer.setSize(sz, sz);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
}
resizeRenderer();
window.addEventListener('resize', resizeRenderer);
if (screen.orientation) {
  screen.orientation.addEventListener('change', () => setTimeout(resizeRenderer, 100));
}
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffd700, 1.2);
dirLight.position.set(3, 5, 4); scene.add(dirLight);
const rimLight = new THREE.DirectionalLight(0xff8c00, 0.5);
rimLight.position.set(-3, -2, -3); scene.add(rimLight);

const loader = new THREE.GLTFLoader();

function autoFitModel(m, targetSize) {
  const box = new THREE.Box3().setFromObject(m);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const s = targetSize / Math.max(size.x, size.y, size.z);
  m.scale.set(s, s, s);
  m.position.sub(center.multiplyScalar(s));
}

loader.load('nugget.glb', (gltf) => {
  nuggetModel = gltf.scene;
  autoFitModel(nuggetModel, 1.8);
  nuggetModel.rotation.x = 0.3;
  nuggetModel.rotation.z = 0.15;
  scene.add(nuggetModel);
}, undefined, (e) => console.error('Nugget load error:', e));

loader.load('Models/meme+card+pack+3d+model.glb', (gltf) => {
  packModel = gltf.scene;
  autoFitModel(packModel, 2.7);
  packModel.visible = false;
  scene.add(packModel);
}, undefined, (e) => console.error('Pack model load error:', e));

// Kek Koin template — loaded once, cloned per spawn (see spawnKekCoin).
let kekCoinTemplate = null;
loader.load('Models/Meshy_AI_Kek_Coin_In_Kek_We_T_0524175010_texture.glb', (gltf) => {
  kekCoinTemplate = gltf.scene;
  autoFitModel(kekCoinTemplate, 0.4);
  // Keep original PBR materials for shading detail; just enable DoubleSide.
  kekCoinTemplate.traverse(o => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.side = THREE.DoubleSide;
        m.emissive = new THREE.Color(0xffffff);
        if (m.map) m.emissiveMap = m.map;
        m.emissiveIntensity = 0.55;
        m.needsUpdate = true;
      }
    }
  });
}, undefined, (e) => console.error('Kek Koin load error:', e));

// --- Shop tab sound (one at a time, no spam) ---
let _shopAudio = null;
function _playShopSound() {
  if (_shopAudio && !_shopAudio.ended) return;
  _shopAudio = sfxRand(S.shopTab, 0.7);
}

// --- Tab Switching ---
let _cardsTabClicks = 0, _cardsTabClickTimer = null;
function switchTab(tab) {
  if (tab === 'cards' && devCheatsEnabled()) {
    _cardsTabClicks++;
    clearTimeout(_cardsTabClickTimer);
    _cardsTabClickTimer = setTimeout(() => { _cardsTabClicks = 0; }, 1500);
    if (_cardsTabClicks >= 5) {
      _cardsTabClicks = 0;
      G.kekCoins += 50;
      log('🪙 <span>+50 Kek Koins (debug)</span>');
      updateUI(); updateCardShopUI();
    }
  }
  activeTab = tab;
  document.getElementById('tab-sauces').classList.toggle('active', tab === 'sauces');
  document.getElementById('tab-cards').classList.toggle('active', tab === 'cards');
  document.getElementById('sauces-view').style.display = tab === 'sauces' ? 'flex' : 'none';
  document.getElementById('cards-view').style.display = tab === 'cards' ? 'flex' : 'none';
  if (nuggetModel) nuggetModel.visible = (tab === 'sauces');
  if (packModel) packModel.visible = (tab === 'cards');
  // Same square container always — only camera changes per tab.
  // Cards: wider FOV (60°) so 2.7-unit pack fits without clipping; y=0 keeps frustum symmetric.
  // Sauces: standard FOV (45°), slight y lift for nugget framing.
  if (tab === 'cards') {
    camera.fov = 60;
    camera.position.set(0, 0, 4.5);   // 1.5× canvas → 1.5× camera distance keeps pack same screen size
  } else {
    camera.fov = 45;
    camera.position.set(0, 0.3, 4.5);
  }
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  if (tab === 'cards') _playShopSound();
  renderBurnBar();   // nugget-only burns are blocked off the sauces tab
}

// --- Card helpers (new schema) ---
function cardEffectLabel(card) {
  if (!card || !card.archetype) return '';
  const p = card.params || {};
  switch (card.archetype) {
    case 'GLOBAL_MULT': return `+${(p.mult * 100).toFixed(0)}% mult`;
    case 'PASSIVE_APS_PCT': return `+${(p.pct * 100).toFixed(0)}% APS`;
    case 'PASSIVE_APC_PCT': return `+${p.flatApc || 0} flat APC`;
    case 'COST_REDUCTION': return `-${(p.reduce * 100).toFixed(0)}% costs`;
    case 'PACK_LUCK': return `Better pulls`;
    case 'BIGGER_TARGET': return `Big nugget +${(p.apcBonus * 100).toFixed(0)}%`;
    case 'EVENT_SOFTENER': return `-${((1 - p.drainMult) * 100).toFixed(0)}% boss drain`;
    case 'TIMED_DROP': return `Drop every ${p.interval}s`;
    case 'IDLE_DRIP': return `${p.idleApsMult || 1}× APS while idle`;
    case 'CRIT_CHANCE': return `Every ${p.everyN} clicks ×${p.mult}`;
    case 'MOOD_SWING': return `Mood: ${moodLabel(p)} (${Math.ceil((p.cycleSec || 30) - G.moodTimer)}s)`;
    case 'SCALING_OVER_TIME': return `+${(p.apcPerMin * 100).toFixed(0)}%/min APC (max ${(p.capPct * 100).toFixed(0)}%)`;
    case 'FIELD_THEME': return `+${(p.mult * 100).toFixed(0)}% mult (Field)`;
    case 'INSTANT_BURST': return `Burst: ${fmt(p.apsSeconds)}s of APS`;
    case 'TEMP_CLICK_MULT': return `${p.mult}× clicks · ${p.duration}s`;
    case 'TEMP_APS_MULT': return `${p.mult}× APS · ${p.duration}s`;
    case 'COIN_RAIN': return `Coin rain · ${p.coins}`;
    case 'TARGET_CHASE': return `Chase target · ${p.timeout}s`;
    case 'GAMBLE': return `50/50 — ${fmt(p.winEAS)} EAS`;
    case 'AUTO_COLLECT': return `Auto-click ×${p.mult} · ${p.duration}s`;
    case 'PRECISION': return `${p.mult}× precise · ${p.duration}s`;
    case 'SCREEN_GAG': return `Pity ${fmt(p.pityEAS)} EAS`;
    case 'RHYTHM': return `Rhythm · perfect ${fmt(rhythmPerfectEAS(card))}s`;
    default: return card.archetype;
  }
}

// Pepe's current mode, e.g. "+20% APS" (same order as getBinderStats MOOD_SWING)
function moodLabel(p) {
  const mode = G.moodIndex % 3;
  if (mode === 0) return `+${Math.round((p.moodAps || 0.15) * 100)}% APS`;
  if (mode === 1) return `+${Math.round((p.moodApc || 0.15) * 100)}% APC`;
  return `+${Math.round((p.moodGlobal || 0.10) * 100)}% all`;
}

// --- Binder Stats ---
// Reads slotted binder cards and computes additive stat bonuses.
// Returns the *additions* to base APS/APC/Mult; caller applies on top of G base values.
function getBinderStats() {
  let addAps = 0, addApc = 0, addMult = 0, apcMultBonus = 0, apsMultBonus = 0, costReduce = 0, drainMult = 1, hitboxBonus = false;
  let kekIntervalReduce = 0, kekPackDiscount = 0, rareBonus = 0, mythicBonus = 0, bigNugget = 0;
  for (const cardId of G.binderSlots) {
    if (!cardId) continue;
    const card = CARD_BY_ID.get(cardId);
    if (!card || !card.archetype) continue;
    const p = card.params || {};
    switch (card.archetype) {
      case 'GLOBAL_MULT':
        addMult += p.mult || 0;
        drainMult *= (1 - (p.drainReduce || 0));  // Shrek multiplicative drain reduction
        break;
      case 'PASSIVE_APS_PCT': apsMultBonus += p.pct || 0; break;
      case 'PASSIVE_APC_PCT':
        addApc += p.flatApc || 0;                      // Harambe: flat APC
        kekIntervalReduce += p.kekIntervalReduce || 0; // Harambe: faster Kek Koin drops
        break;
      case 'BIGGER_TARGET':
        apcMultBonus += p.apcBonus || 0;
        if (p.hitboxBonus) hitboxBonus = true;
        bigNugget = p.scale || 1;   // Big Chungus: nugget scale (applyNuggetTransform)
        break;
      case 'COST_REDUCTION':
        costReduce = Math.max(costReduce, p.reduce || 0);
        addMult += p.globalMult || 0;            // Grumpy Cat baseline +3%
        kekPackDiscount += p.kekPackDiscount || 0; // Grumpy Cat pack discount
        break;
      case 'EVENT_SOFTENER':
        drainMult *= (p.drainMult || 1);   // multiplicative so Shrek+Harold stack correctly
        addMult += p.globalMult || 0;      // Harold baseline +3%
        break;
      // CRIT_CHANCE is applied per click in doClick, so it adds nothing here.
      case 'SCALING_OVER_TIME':
        // Expanding Brain: grows with minutes played while slotted (G.brainMinutes), capped
        apcMultBonus += Math.min(p.capPct || 0, (p.apcPerMin || 0) * G.brainMinutes);
        break;
      case 'MOOD_SWING': {
        const mode = G.moodIndex % 3;
        if (mode === 0) apsMultBonus += p.moodAps || 0.15;
        else if (mode === 1) apcMultBonus += p.moodApc || 0.15;
        else addMult += p.moodGlobal || 0.10;
        break;
      }
      case 'PACK_LUCK': {
        const uniqueOwned = Object.keys(G.collection).filter(k => G.collection[k] > 0).length;
        addMult += Math.min(p.capPct || 0.10, uniqueOwned * (p.multPerCardType || 0.01));
        rareBonus += p.rareBonus || BAL.PACK_LUCK_RARE_BONUS;
        mythicBonus += p.mythicBonus || BAL.PACK_LUCK_MYTHIC_BONUS;
        // Success Kid: pack discount scales with unique cards owned
        if (p.kekPackDiscountPerCard) {
          kekPackDiscount += Math.min(p.kekPackDiscountCap || 5, uniqueOwned * p.kekPackDiscountPerCard);
        }
        break;
      }
      // TIMED_DROP, IDLE_DRIP handled in game loop / specific systems
    }
  }
  // Add percentage bonuses on top of base stats
  addAps += G.auraPerSecond * apsMultBonus;
  addApc += G.auraPerClick * apcMultBonus;
  return { addAps, addApc, addMult, costReduce, drainMult, apcMultBonus, apsMultBonus, hitboxBonus, kekIntervalReduce, kekPackDiscount, rareBonus, mythicBonus, bigNugget };
}

// Nugget size / visibility from Big Chungus and the active burn effects (G.nuggetFx counters),
// so overlapping effects (double Dentist, Surgery + Cena) always restore the right state.
function applyNuggetTransform() {
  const bs = getBinderStats();
  const fx = G.nuggetFx;
  const base = bs.bigNugget || 1;
  const scale = fx.shrink > 0 ? (bs.hitboxBonus ? 0.55 : 0.35) : fx.grow > 0 ? base * 1.4 : base;
  $nuggetContainer.style.transition = 'transform 0.3s, opacity 0.3s';
  $nuggetContainer.style.transform = `translate(-50%,-50%) scale(${scale})`;
  $nuggetContainer.style.opacity = fx.invisible > 0 ? '0.05' : '';
}
// Runs a nugget effect (G.nuggetFx[kind]) for ms.
function nuggetFxFor(kind, ms) {
  G.nuggetFx[kind]++;
  applyNuggetTransform();
  setTimeout(() => { G.nuggetFx[kind]--; applyNuggetTransform(); }, ms);
}

// Screen filters from burns (All Your Base retro, Dentist blur): body classes with counters,
// so overlapping effects don't cut each other short. index.html composes body's filter
// from per-source CSS variables (theme, GigaChad, burns).
const _bodyFxCount = {};
function bodyFxFor(cls, ms) {
  _bodyFxCount[cls] = (_bodyFxCount[cls] || 0) + 1;
  document.body.classList.add(cls);
  setTimeout(() => {
    if (--_bodyFxCount[cls] <= 0) document.body.classList.remove(cls);
  }, ms);
}

// --- Field Slot Stats ---
function getFieldMult() {
  if (!G.fieldSlot) return 0;
  const card = CARD_BY_ID.get(G.fieldSlot);
  if (!card || card.archetype !== 'FIELD_THEME') return 0;
  if (card.id === 'f5') return (card.params.mult || 0.25) + G.fireLevel * (card.params.fireAuraPer || 0.08);
  return card.params.mult || 0;
}

// --- Pack System ---
// Pack and shop costs are paid in Kek Koins. Linear scaling — Koin income is
// linear in clicks (no compounding), so exponential cost would choke supply.
function getKekShopCost() { return BAL.KEK_SHOP_COST; }
function getKekPackCost() {
  const base = BAL.KEK_PACK_COST_BASE + Math.floor(G.packsPurchased * BAL.KEK_PACK_COST_SCALE);
  const bs = getBinderStats();
  return Math.max(1, base - Math.floor(bs.kekPackDiscount));
}

function pullCard() {
  // Success Kid (PACK_LUCK) shifts odds toward Field (mythic) and Rare pulls.
  const bs = getBinderStats();
  const roll = Math.random();
  let pool;
  if (roll < 0.10 + bs.mythicBonus) {
    pool = CARD_LIBRARY.filter(c => c.type === 'Field');
  } else {
    const r2 = Math.random();
    const rareCut = 0.88 - bs.rareBonus;
    const rarity = r2 < Math.min(0.60, rareCut) ? 'common' : r2 < rareCut ? 'uncommon' : 'rare';
    pool = CARD_LIBRARY.filter(c => (c.type === 'Burn' || c.type === 'Binder') && c.rarity === rarity);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

let _packCanDismiss = false;
let _pendingCard = null;
let _pendingIsNew = false;

function buyPack() {
  if (G.gameState === 'pack_opening') return;
  const cost = getKekPackCost();
  if (G.kekCoins < cost) return;
  G.kekCoins -= cost;
  G.packsPurchased++;
  _pendingCard = pullCard();
  // Add the card now (not on dismiss) so closing the tab mid-animation can't lose it
  const id = _pendingCard.id;
  _pendingIsNew = !(G.collection[id] > 0);
  G.collection[id] = (G.collection[id] || 0) + 1;
  saveGame();
  openPackAnim(_pendingCard);
  updateUI();
}

// Builds the inner HTML for a full card face — reused by pack reveal and burn bar.
function buildCardFaceHTML(card) {
  const rarityColor = card.rarity === 'mythic-rare' ? '#ffd700' : card.rarity === 'rare' ? '#9c27b0' : card.rarity === 'uncommon' ? '#03a9f4' : '#8bc34a';
  const rarityIcon = card.rarity === 'mythic-rare' ? 'Images/Cards/Glitched Genesis - Mythic.png' : card.rarity === 'rare' ? 'Images/Cards/Glitched Genesis - Rare.png' : card.rarity === 'uncommon' ? 'Images/Cards/Glitched Genesis - Uncommon.png' : 'Images/Cards/Glitched Genesis - Common.png';
  const iconBadgeHTML = `<div class="cf-set-symbol-wrap" style="border-color:${rarityColor}"><img class="cf-set-symbol" src="${rarityIcon}" alt="${card.rarity}"></div>`;
  const typeLabel = card.type === 'Field' ? '⭐ FIELD' : card.type === 'Binder' ? '📂 BINDER' : '🔥 BURN';
  const artImg = CARD_IMAGES[card.id];
  const artT = CARD_IMAGE_TRANSFORM[card.id] || { x: 0, y: 0, scale: 1 };
  const bgHTML = artImg
    ? `<div class="cf-art-window"><img class="cf-bg-img" src="${artImg}" alt="${card.name}" style="transform:translate(${artT.x}%,${artT.y}%) scale(${artT.scale})"></div>`
    : `<div class="cf-art">${card.emoji}</div>`;
  return `<div class="card-face rarity-${card.rarity}">
    ${bgHTML}
    <img class="cf-template" src="Images/Cards/card-template.png" alt="">
    <div class="cf-banner-name">${card.name}</div>
    <div class="cf-banner-type" style="color:${rarityColor}">${typeLabel}</div>
    ${iconBadgeHTML}
    <div class="cf-rules-area">
      <div class="cf-desc">${card.desc}</div>
      ${card.flavor ? `<hr class="cf-flavor-sep"><div class="cf-flavor">${card.flavor}</div>` : ''}
    </div>
  </div>`;
}

function openPackAnim(card) {
  G.gameState = 'pack_opening';
  _packCanDismiss = false;

  // Full reset
  $boosterContainer.className = '';
  $boosterContainer.onclick = null;
  $boosterContainer.style.cssText = '';
  $packTopEl.className = '';
  $packBotEl.className = '';
  $packCardFace.className = '';
  $packCardFace.innerHTML = '';
  $packCardFace.style.cssText = '';
  $screenFlash.className = '';
  $packHint.className = '';

  const rarityGlow = card.rarity === 'mythic-rare' ? 'rgba(255,215,0,0.9)' : card.rarity === 'rare' ? 'rgba(156,39,176,0.75)' : card.rarity === 'uncommon' ? 'rgba(3,169,244,0.65)' : 'rgba(139,195,74,0.55)';
  $packCardFace.innerHTML = buildCardFaceHTML(card);
  $packCardFace.style.setProperty('--rarity-glow', rarityGlow);

  $packOverlay.style.display = 'flex';
  void $packOverlay.offsetHeight;
  $packOverlay.classList.add('active');

  // Purchase sound — plays the moment you buy the pack
  sfxRand(S.packBuy, 0.8);

  // Pack floats and waits for player click
  setTimeout(() => {
    $boosterContainer.classList.add('float-idle');
    $packHint.textContent = 'Click the pack to open!';
    $packHint.classList.add('visible');
    $boosterContainer.onclick = (e) => { e.stopPropagation(); burstPack(); };
  }, 80);
}

function burstPack() {
  $boosterContainer.onclick = null;
  $boosterContainer.classList.remove('float-idle');
  $boosterContainer.classList.add('shaking');
  $packHint.classList.remove('visible');

  // Must be called here — inside the click handler — so the browser allows audio
  sfxRand(S.packOpen, 0.8);

  setTimeout(() => {
    // Promote card above pack wrapper before burst
    $packCardFace.style.zIndex = '5';

    // Simultaneous burst: flash + top rip + card spring + wrapper drop
    $screenFlash.classList.add('burst');
    $packTopEl.classList.add('ripping');
    $packCardFace.classList.add('springing');
    $packBotEl.classList.add('dropping');

    // Card settles — enable dismiss
    setTimeout(() => {
      $packCardFace.classList.remove('springing');
      $packCardFace.classList.add('settled');
      $packHint.textContent = 'Click anywhere to collect';
      $packHint.classList.add('visible');
      _packCanDismiss = true;
    }, 600);
  }, 450);
}

function dismissPack() {
  if (!_packCanDismiss || !_pendingCard) return;
  _packCanDismiss = false;

  $packCardFace.classList.remove('settled');
  $packCardFace.classList.add('dismissing');
  $packHint.classList.remove('visible');

  log(`🃏 Pulled <span>${_pendingCard.name}</span> (${_pendingCard.type}${_pendingIsNew ? ' — NEW!' : ''})`);

  setTimeout(() => {
    $packOverlay.classList.remove('active');
    setTimeout(() => {
      $packOverlay.style.display = 'none';
      $boosterContainer.className = '';
      $boosterContainer.style.cssText = '';
      $packTopEl.className = '';
      $packBotEl.className = '';
      $packCardFace.className = '';
      $packCardFace.innerHTML = '';
      $packCardFace.style.cssText = '';
      $screenFlash.className = '';
      $packHint.className = '';
    }, 400);
    G.gameState = 'main';
    _pendingCard = null;
    updateCardShopUI();
    renderBurnBar();
  }, 420);
}

$packOverlay.addEventListener('click', () => { if (_packCanDismiss) dismissPack(); });

// --- Binder Overlay ---
let _binderSelectedSlot = 0;
let _binderFilter = 'all';

function openBinder(slotIndex) {
  // slotIndex can be a number 0..4 or the string 'field'.
  _binderSelectedSlot = (slotIndex === 'field' || typeof slotIndex === 'number') ? slotIndex : 0;
  // Auto-filter to the relevant card type for the clicked slot.
  if (slotIndex === 'field') _binderFilter = 'Field';
  else if (typeof slotIndex === 'number') _binderFilter = 'Binder';
  updateBinderSlotBtns();
  document.querySelectorAll('.binder-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === _binderFilter);
  });
  renderBinderGrid();
  $binderOverlay.style.display = 'flex';
}

function closeBinder() { $binderOverlay.style.display = 'none'; }

// --- Dev Card Menu ---
// Click the ACTIVE BINDER label 5 times to reveal the 🛠️ button.
let _binderLabelClicks = 0;
let _binderLabelClickTimer = null;

function binderLabelClick() {
  _binderLabelClicks++;
  clearTimeout(_binderLabelClickTimer);
  _binderLabelClickTimer = setTimeout(() => { _binderLabelClicks = 0; }, 2000);
  if (_binderLabelClicks >= 5) {
    _binderLabelClicks = 0;
    const btn = document.getElementById('dev-menu-btn');
    btn.style.display = btn.style.display === 'none' ? 'inline-block' : 'none';
    log(btn.style.display !== 'none' ? '🛠️ <span>Dev menu unlocked!</span>' : '🛠️ <span>Dev menu hidden.</span>');
  }
}

let _devFilter = 'all';

function openDevMenu() {
  // Ensure card shop is active so cards work when added
  if (!G.cardShopUnlocked) {
    G.cardShopUnlocked = true;
    updateCardShopUI();
    renderBurnBar();
  }
  renderDevGrid();
  document.getElementById('dev-menu-overlay').style.display = 'flex';
}

function closeDevMenu() {
  document.getElementById('dev-menu-overlay').style.display = 'none';
}

function setDevFilter(filter) {
  _devFilter = filter;
  document.querySelectorAll('.dev-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderDevGrid();
}

function devGiveCard(cardId) {
  G.collection[cardId] = (G.collection[cardId] || 0) + 1;
  renderDevGrid();
  renderBurnBar();
  updateCardShopUI();
  updateBinderSlotsUI();
  const card = CARD_BY_ID.get(cardId);
  log(`🛠️ <span>[DEV] Added ${card.emoji} ${card.name}</span> (×${G.collection[cardId]})`);
}

function renderDevGrid() {
  const grid = document.getElementById('dev-menu-grid');
  grid.innerHTML = '';
  const cards = _devFilter === 'all'
    ? CARD_LIBRARY
    : CARD_LIBRARY.filter(c => c.type === _devFilter);

  cards.forEach(card => {
    const count = G.collection[card.id] || 0;
    const div = document.createElement('div');
    div.className = 'dev-card';
    div.title = `${card.name} — ${card.desc}`;
    div.onclick = () => devGiveCard(card.id);
    div.innerHTML = buildCardFaceHTML(card)
      + (count > 0 ? `<span class="bc-count">×${count}</span>` : '')
      + `<div class="dev-add-label">+ ADD TO COLLECTION</div>`;
    grid.appendChild(div);
  });
}

function selectBinderSlot(idx) {
  _binderSelectedSlot = idx;
  if (idx === 'field') _binderFilter = 'Field';
  else if (typeof idx === 'number') _binderFilter = 'Binder';
  document.querySelectorAll('.binder-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === _binderFilter);
  });
  updateBinderSlotBtns();
  renderBinderGrid();
}

function updateBinderSlotBtns() {
  document.querySelectorAll('.binder-slot-btn').forEach(btn => {
    const slot = btn.dataset.slot;
    const match = (slot === 'field' && _binderSelectedSlot === 'field')
      || (slot !== undefined && slot !== 'field' && Number(slot) === _binderSelectedSlot);
    btn.classList.toggle('selected', !!match);
  });
}

function setBinderFilter(filter) {
  _binderFilter = filter;
  document.querySelectorAll('.binder-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderBinderGrid();
}

function renderBinderGrid() {
  $binderGrid.innerHTML = '';
  const owned = CARD_LIBRARY.filter(c => (G.collection[c.id] || 0) > 0);
  const filtered = _binderFilter === 'all'
    ? owned
    : _binderFilter === 'equippable'
      ? owned.filter(c => c.type !== 'Burn')
      : owned.filter(c => c.type === _binderFilter);

  if (filtered.length === 0) {
    $binderGrid.innerHTML = '<div id="binder-empty">No cards here yet!<br>Buy packs to grow your collection.</div>';
    return;
  }

  filtered.forEach(card => {
    const count = G.collection[card.id] || 0;
    const binderSlotIdx = G.binderSlots.indexOf(card.id);
    const isField = G.fieldSlot === card.id;
    const isEquipped = binderSlotIdx !== -1 || isField;
    const equippedLabel = isField ? '✓ FIELD' : `✓ SLOT ${binderSlotIdx + 1}`;

    const div = document.createElement('div');
    div.className = `binder-card${isEquipped ? ' is-equipped' : ' equippable'}`;
    if (!isEquipped) div.onclick = () => equipCard(card.id);
    const equipRow = isEquipped
      ? `<div class="bc-equipped-tag">${equippedLabel}</div>`
      : `<button class="bc-equip-btn" onclick="equipCard('${card.id}')">EQUIP → ${_binderSelectedSlot === 'field' ? 'FIELD' : 'SLOT ' + (_binderSelectedSlot + 1)}</button>`;
    div.innerHTML = buildCardFaceHTML(card)
      + `<span class="bc-count">×${count}</span>`
      + equipRow;
    $binderGrid.appendChild(div);
  });
}

function equipCard(cardId) {
  const card = CARD_BY_ID.get(cardId);
  if (!card) return;
  if (_binderSelectedSlot === 'field') {
    if (card.type !== 'Field') { log(`⚠️ Field slot only accepts Field cards.`); return; }
    G.fieldSlot = cardId;
    applyFieldTheme();
    log(`⭐ Equipped <span>${card.name}</span> as Field`);
  } else {
    if (card.type !== 'Binder') { log(`⚠️ Binder slots only accept Binder cards.`); return; }
    G.binderSlots[_binderSelectedSlot] = cardId;
    // Restart TIMED_DROP timers so re-equipping can't trigger an instant drop
    card._lastDrop = Date.now();
    applyNuggetTransform();   // Big Chungus
    log(`🃏 Equipped <span>${card.name}</span> to Slot ${_binderSelectedSlot + 1}`);
  }
  updateBinderSlotsUI();
  renderBinderGrid();
}

function unequipSlot(slotIdx, event) {
  if (event) event.stopPropagation();
  const cardId = G.binderSlots[slotIdx];
  G.binderSlots[slotIdx] = null;
  applyNuggetTransform();   // Big Chungus
  updateBinderSlotsUI();
  if (cardId) {
    const card = CARD_BY_ID.get(cardId);
    if (card) log(`🃏 Unequipped <span>${card.name}</span> from Slot ${slotIdx + 1}`);
  }
}

function unequipFieldSlot(event) {
  if (event) event.stopPropagation();
  const cardId = G.fieldSlot;
  G.fieldSlot = null;
  applyFieldTheme();
  updateBinderSlotsUI();
  if (cardId) {
    const card = CARD_BY_ID.get(cardId);
    if (card) log(`⭐ Unequipped <span>${card.name}</span> from Field`);
  }
}

// Apply CSS body class for the current Field theme (visual override).
function _updateFireVisuals(level) {
  const overlay = document.getElementById('fire-smoke-overlay');
  const dog = document.getElementById('this-is-fine-dog');
  const indicator = document.getElementById('fire-level-indicator');
  if (!overlay) return;

  if (level === 0) {
    overlay.style.opacity = '0';
    if (dog) dog.style.opacity = '0';
    if (indicator) { indicator.style.opacity = '0'; indicator.textContent = ''; }
    return;
  }

  // Smoke: radial vignette from transparent center to dark smoky edges, grows each level
  const smokeDark = Math.min(0.82, level * 0.17);
  overlay.style.background =
    `radial-gradient(ellipse 60% 55% at 50% 50%, transparent 20%, rgba(30,15,5,${smokeDark}) 100%)`;
  overlay.style.opacity = '1';

  if (dog) dog.style.opacity = Math.min(1, level * 0.22).toString();

  if (indicator) {
    indicator.style.opacity = '1';
    indicator.textContent = '🔥'.repeat(level);
  }
}

function applyFieldTheme() {
  const themes = ['theme-ohio', 'theme-sigma', 'theme-nyan', 'theme-dark', 'theme-fire', 'theme-banana'];
  themes.forEach(t => document.body.classList.remove(t));
  // Reset fire when switching away from This is Fine
  if (G.fieldSlot !== 'f5') {
    G.fireLevel = 0;
    G.fireAccum = 0;
    _updateFireVisuals(0);
  }
  // Moth and Lamp: a swap mid-blackout must not leave the screen black
  if (G.fieldSlot !== 'f4') {
    if (_mothBlackoutActive) _mothBlackoutEnd();
    _mothBlackoutAccum = 0;
  }
  if (G.fieldSlot !== 'f3') _coinTrailAccum = 0;
  renderBurnBar();   // Sigma Slam changes which burns are blocked
  if (!G.fieldSlot) return;
  const card = CARD_BY_ID.get(G.fieldSlot);
  if (card && card.archetype === 'FIELD_THEME' && card.params.theme) {
    document.body.classList.add('theme-' + card.params.theme);
  }
  // Restore fire visuals if reloading with f5 already equipped
  if (G.fieldSlot === 'f5') _updateFireVisuals(G.fireLevel);
}

// Slot DOM refs — resolved once at module load instead of re-queried each UI tick.
const _slotRefs = {
  field: {
    thumb: document.getElementById('slot-thumb-field'),
    fx: document.getElementById('slot-fx-field'),
    slot: document.getElementById('slot-field'),
  },
  binder: Array.from({ length: BAL.BINDER_SLOTS }, (_, i) => ({
    thumb: document.getElementById(`slot-thumb-${i}`),
    fx: document.getElementById(`slot-fx-${i}`),
    slot: document.getElementById(`slot-${i}`),
  })),
};

function slotCardHTML(card, nameColor) {
  const artImg = CARD_IMAGES[card.id];
  const artHTML = artImg
    ? `<img class="slot-art-img" src="${artImg}" alt="${card.name}">`
    : `<div class="slot-art-emoji">${card.emoji}</div>`;
  return artHTML +
    `<div class="slot-card-info">
      <span class="slot-card-name" style="color:${nameColor}">${card.name}</span>
      <span class="slot-card-fx">${cardEffectLabel(card)}</span>
    </div>`;
}

function updateBinderSlotsUI() {
  // Field slot
  const f = _slotRefs.field;
  if (f.thumb) {
    if (G.fieldSlot) {
      const card = CARD_BY_ID.get(G.fieldSlot);
      if (card) {
        f.thumb.innerHTML = slotCardHTML(card, '#ffd700');
        f.fx.textContent = '';
        f.slot && f.slot.classList.add('occupied');
        if (f.slot) f.slot.dataset.rarity = card.rarity;
      }
    } else {
      f.thumb.innerHTML = '<span style="color:#555">empty</span>';
      f.fx.textContent = '';
      f.slot && f.slot.classList.remove('occupied');
      if (f.slot) delete f.slot.dataset.rarity;
    }
  }
  // 5 Binder slots
  for (let i = 0; i < BAL.BINDER_SLOTS; i++) {
    const cardId = G.binderSlots[i];
    const r = _slotRefs.binder[i];
    if (!r || !r.thumb) continue;
    if (cardId) {
      const card = CARD_BY_ID.get(cardId);
      if (card) {
        r.thumb.innerHTML = slotCardHTML(card, '#ddd');
        r.fx.textContent = '';
        r.slot.classList.add('occupied');
        r.slot.dataset.rarity = card.rarity;
        continue;
      }
    }
    r.thumb.innerHTML = '<span style="color:#555">empty</span>';
    r.fx.textContent = '';
    if (r.slot) { r.slot.classList.remove('occupied'); delete r.slot.dataset.rarity; }
  }
  // GigaChad: black-and-white screen while slotted
  const grayscale = G.binderSlots.some(id => id && CARD_BY_ID.get(id)?.params?.filter === 'grayscale');
  document.body.classList.toggle('gigachad-mode', grayscale);
}

function buyCardShop() {
  if (G.cardShopUnlocked || G.kekCoins < BAL.KEK_SHOP_COST) return;
  G.kekCoins -= BAL.KEK_SHOP_COST;
  G.cardShopUnlocked = true;
  sfxRand(S.shopUnlock, 0.8);
  log('🃏 <span>Brain Rot TCG Unlocked!</span> Pull your first pack!');
  updateCardShopUI();
  renderBurnBar();
  updateUI();
}

const $binderSlotsPanel = document.getElementById('binder-slots');

// --- Card Shop UI ---
function updateCardShopUI() {
  if (!G.cardShopUnlocked) {
    $cardsLocked.style.display = 'flex';   // matches its CSS `display:flex` rule
    $cardsUnlocked.style.display = 'none';
    $binderSlotsPanel.style.display = 'none';
    const btn = document.getElementById('buy-shop-btn');
    if (btn) btn.disabled = G.kekCoins < BAL.KEK_SHOP_COST;
    const costEl = document.getElementById('shop-unlock-cost');
    if (costEl) costEl.innerHTML = `Cost: ${BAL.KEK_SHOP_COST} <img src="Images/Kek Koin.png" class="kek-inline-icon"> Kek Koins`;
    return;
  }
  $cardsLocked.style.display = 'none';
  $cardsUnlocked.style.display = 'flex';
  $binderSlotsPanel.style.display = 'block';

  const cost = getKekPackCost();
  $packCostDisplay.innerHTML = `Cost: ${cost} <img src="Images/Kek Koin.png" class="kek-inline-icon"> Kek Koins`;
  $packsOpenedDisplay.textContent = `Packs opened: ${G.packsPurchased}`;
  $buyPackBtn.disabled = (G.kekCoins < cost || G.gameState === 'pack_opening');

  const uniqueOwned = Object.keys(G.collection).filter(k => G.collection[k] > 0).length;
  const totalOwned = Object.values(G.collection).reduce((a, b) => a + b, 0);
  $cardCollectionCount.textContent = `${uniqueOwned} unique / ${totalOwned} total`;
}

// --- Click Handler ---
$nuggetContainer.addEventListener('click', (e) => {
  e.preventDefault();
  if (tryCollectKekCoin(e.clientX, e.clientY)) return;
  doClick(e.clientX, e.clientY);
});
$nuggetContainer.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  if (tryCollectKekCoin(t.clientX, t.clientY)) return;
  doClick(t.clientX, t.clientY);
}, { passive: false });

// Document-level capture: collect kek coins anywhere on screen.
// Capture phase fires before any element handler, so we can stop propagation
// when a coin is hit (preventing accidental UI clicks). No-ops when no coin hit.
document.addEventListener('click', (e) => {
  if (tryCollectKekCoin(e.clientX, e.clientY)) e.stopPropagation();
}, { capture: true });
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (tryCollectKekCoin(t.clientX, t.clientY)) e.stopPropagation();
}, { capture: true, passive: true });

function doClick(cx, cy) {
  if (G.gameState === 'pack_opening') return;
  if (activeTab !== 'sauces') return;
  _initBg();
  G.totalClicks++;
  const bs = getBinderStats();
  const fieldMult = getFieldMult();
  // Overly Attached GF: only dead-center clicks get a centerOnly buff's share
  let centreHit = false;
  if (G.clickBuffs.some(b => b.centerOnly)) {
    const r = $nuggetContainer.getBoundingClientRect();
    const dist = Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2));
    centreHit = dist <= r.width * 0.15;
    if (!centreHit) spawnParticle(cx, cy - 30, '😠 MISS');
  }
  let clickMult = clickBuffMult(centreHit);
  // CRIT_CHANCE: Chuck Norris — every Nth click multiplies value
  G.critClickCounter++;
  for (const cid of G.binderSlots) {
    if (!cid) continue;
    const c = CARD_BY_ID.get(cid);
    if (c && c.archetype === 'CRIT_CHANCE' && (G.critClickCounter % c.params.everyN === 0)) {
      clickMult *= c.params.mult;
      spawnParticle(cx, cy - 30, '💥 CRIT!');
    }
  }
  // Arthur Fist: next click counts double
  if (G.doubleNextClick) {
    G.doubleNextClick = false;
    clickMult *= 2;
    spawnParticle(cx, cy - 50, '👊 x2');
  }
  clickMult = Math.min(BAL.CLICK_TOTAL_CAP, clickMult);
  const clickBase = (G.auraPerClick + bs.addApc) * (G.allAuraMult + bs.addMult + fieldMult);
  let earned = clickBase * clickMult;
  if (G.frenzyActive) earned *= 10;
  G.aura += earned;
  // D6: buffs with easPerClick also pay a flat EAS bonus per click, up to capEAS per use
  // (not multiplied by frenzy, crit, Arthur or echo)
  let bonus = 0;
  for (const b of G.clickBuffs) {
    if (!(b.easPerClick > 0) || (b.centerOnly && !centreHit)) continue;
    const e = Math.min(b.easPerClick, b.capEAS - b.paidEAS);
    if (e > 0) { b.paidEAS += e; bonus += e * computeBaseEAS(); }
  }
  G.aura += bonus;
  spawnParticle(cx, cy, '+' + fmt(earned + bonus));
  // Overly Attached GF: every Nth center click drops a Kek Koin, up to kekCap per use
  if (centreHit) {
    for (const b of G.clickBuffs) {
      if (!b.centerOnly) continue;
      b.hits++;
      if (b.kekEveryNHits && b.hits % b.kekEveryNHits === 0 && b.kekPaid < b.kekCap) {
        b.kekPaid++;
        awardKek(1);
      }
    }
  }
  // Distracted Boyfriend echo: ghost click offset to the side (card cap, no frenzy)
  if (hasEcho()) {
    const echoEarned = clickBase * Math.min(clickMult, BAL.CLICK_MULT_CAP);
    spawnParticle(cx + G.echoOffset, cy, '+' + fmt(echoEarned));
    G.aura += echoEarned;
  }
  nuggetScale = 0.8;
  G.lastIdleClickTime = Date.now();
  const now = Date.now();
  if (G.frenzyCooldown <= 0) {
    G.clickTimestamps.push(now);
    G.clickTimestamps = G.clickTimestamps.filter(t => now - t < 3000);
  }
  G.recentClickTimestamps.push(now);
  G.recentClickTimestamps = G.recentClickTimestamps.filter(t => now - t < 30000);
  // Kek Koin drop: pity counter OR per-click RNG. Harambe reduces the interval.
  const effectiveKekInterval = Math.max(5, BAL.KEK_BASE_CLICK_INTERVAL - (bs.kekIntervalReduce || 0));
  G.clicksSinceLastKek++;
  if (G.clicksSinceLastKek >= effectiveKekInterval || Math.random() < BAL.KEK_RNG_CHANCE) {
    spawnKekCoin();
    G.clicksSinceLastKek = 0;
  }
  updateUI();
}

// --- Frenzy ---
function checkFrenzy() {
  if (G.frenzyActive) return;

  if (G.frenzyCooldown > 0) {
    const recovery = 1 - (G.frenzyCooldown / 30);
    $frenzyFill.style.height = (recovery * 100) + '%';
    const grey = Math.round((1 - recovery) * 100);
    const bright = 0.45 + recovery * 0.55;
    $frenzyMeterWrap.style.filter = `grayscale(${grey}%) brightness(${bright.toFixed(2)})`;
    return;
  }

  $frenzyMeterWrap.style.filter = '';
  const now = Date.now();
  const recent = G.clickTimestamps.filter(t => now - t < 3000);
  const cps = recent.length / 3;
  G.frenzyMeter = Math.min(cps / BAL.FRENZY_THRESHOLD_CPS, 1);
  $frenzyFill.style.height = (G.frenzyMeter * 100) + '%';
  if (cps >= BAL.FRENZY_THRESHOLD_CPS) activateFrenzy();
}

function activateFrenzy() {
  G.frenzyActive = true;
  G.frenzyTimer = 10;
  $frenzyOverlay.classList.add('active');
  $frenzyText.classList.add('active');
  startFrenzyAudio();
  log('⚡ <span>SIGMA RIZZ FRENZY ACTIVATED! 10x MULTIPLIER!</span>');
}

function endFrenzy() {
  G.frenzyActive = false;
  G.frenzyCooldown = 30;
  G.clickTimestamps = [];
  $frenzyOverlay.classList.remove('active');
  $frenzyText.classList.remove('active');
  G.frenzyMeter = 0;
  $frenzyFill.style.height = '0%';
  $frenzyMeterWrap.style.filter = 'grayscale(100%) brightness(0.45)';
  stopFrenzyAudio();
  log('💤 <span>Frenzy ended. Cooldown: 30s</span>');
}

// --- Shop ---
function buildShop() {
  $upgradesList.innerHTML = '';
  UPGRADES.forEach(u => {
    const div = document.createElement('div');
    div.className = `upgrade-btn rarity-${u.rarity}`;
    div.id = `upgrade-${u.id}`;
    div.innerHTML = `
      <div class="upgrade-name">${u.name}</div>
      <div class="upgrade-desc">${u.desc}</div>
      <div class="upgrade-cost">Cost: <span id="cost-${u.id}">${fmt(getCost(u))}</span> Aura</div>
      <div class="upgrade-owned" id="owned-${u.id}">${G.owned[u.id]}</div>
    `;
    div.addEventListener('click', () => buyUpgrade(u));
    $upgradesList.appendChild(div);
  });
}

function buyUpgrade(u) {
  if (u.oneTime && G.owned[u.id] > 0) return;
  const cost = getCost(u);
  if (G.aura < cost) return;
  G.aura -= cost;
  G.owned[u.id]++;
  if (u.effect === 'aps') G.auraPerSecond += u.value;
  if (u.effect === 'apc') G.auraPerClick += u.value;
  if (u.effect === 'mult') G.allAuraMult += u.value;
  if (S.upgradeSfx[u.id]) sfxRand(S.upgradeSfx[u.id]);
  const emoji = u.rarity === 'legendary' ? '🏆' : u.rarity === 'epic' ? '🔥' : '✅';
  log(`${emoji} Bought <span>${u.name}</span>${u.oneTime ? '!' : ' (x' + G.owned[u.id] + ')'}`);
  updateShopUI();
  updateUI();
}

function updateShopUI() {
  UPGRADES.forEach(u => {
    const btn = document.getElementById(`upgrade-${u.id}`);
    const costEl = document.getElementById(`cost-${u.id}`);
    const ownEl = document.getElementById(`owned-${u.id}`);
    if (!btn) return;
    const cost = getCost(u);
    costEl.textContent = fmt(cost);
    if (ownEl) ownEl.textContent = G.owned[u.id];
    btn.classList.remove('locked', 'affordable');
    btn.classList.add(G.aura >= cost ? 'affordable' : 'locked');
  });
  updateCardShopUI();
}

// --- Random Events ---
const _TAX = { name: 'Fanum Tax', emoji: '🤚', desc: 'Click to dodge! Or lose 10% Aura...', reward: null, isTax: true };
const EVENTS = [
  { name: 'Skibidi Toilet', emoji: '🚽', desc: 'Click to defeat!', isBoss: true },
  {
    name: 'Level 67 Gyatt', emoji: '😜', desc: '100x click power for 15s!',
    reward: () => { addClickBuff({ src: 'gyatt', mult: 100, t: 15, uncapped: true }); return 0; }
  },
  _TAX, _TAX, _TAX, // 3/5 = 60% chance Fanum Tax
];

let eventCooldown = randomBetween(BAL.EVENT_SPAWN_MIN_S, BAL.EVENT_SPAWN_MAX_S);
let activeEvent = null;

function randomBetween(a, b) { return a + Math.random() * (b - a); }

function getFieldParams() {
  if (!G.fieldSlot) return {};
  const c = CARD_BY_ID.get(G.fieldSlot);
  return (c && c.archetype === 'FIELD_THEME') ? (c.params || {}) : {};
}

function spawnEvent() {
  if (activeEvent) return;
  if (G.boss && G.boss.active) return;
  // Ohio Boss bossSpawnMult: inflate boss probability in the roll
  const fp = getFieldParams();
  const bossBoost = fp.bossSpawnMult || 1;
  // Base boss rate is 1/5 (EVENTS). A forced-boss roll of b gives P(boss) = b + (1 − b) × 0.2,
  // so b = (boost − 1) × 0.2 / 0.8 makes it exactly boost × 20% (Ohio 1.5 → 30%).
  const bossBias = bossBoost > 1 ? (bossBoost - 1) * 0.2 / 0.8 : 0;
  const evDef = (Math.random() < bossBias)
    ? EVENTS.find(e => e.isBoss)
    : EVENTS[Math.floor(Math.random() * EVENTS.length)];
  if (evDef.isBoss) {
    startBossFight();
    return;
  }
  const el = document.createElement('div');
  el.className = 'event-entity';
  el.textContent = evDef.emoji;
  el.style.left = '-100px';
  el.style.top = (20 + Math.random() * 50) + '%';
  document.body.appendChild(el);

  let clicked = false;
  activeEvent = { el, def: evDef };

  el.addEventListener('click', () => {
    if (clicked) return;
    clicked = true;
    el.classList.add('clicked');
    if (evDef.isTax) {
      sfxRand(S.fanumDodge);
      log('🛡️ <span>Fanum Tax DODGED!</span> Your Aura is safe!');
    } else {
      // Level 67 Gyatt (the boss never spawns as a flying event — see startBossFight)
      evDef.reward(G);
      sfxRand(S.gyatt);
      log('😜 <span>Level 67 Gyatt!</span> 100x click power for 15s!');
    }
    setTimeout(() => el.remove(), 400);
    activeEvent = null;
  });

  const screenW = window.innerWidth + 200;
  const animStart = Date.now();
  function moveEvent() {
    if (!el.parentNode) return;
    const progress = (Date.now() - animStart) / 5000;
    if (progress >= 1) {
      if (!clicked) {
        clicked = true;
        if (evDef.isTax) {
          const stolen = Math.floor(G.aura * 0.1);
          G.aura -= stolen;
          sfxRand(S.fanumHit);
          log(`🤚 <span>Fanum Tax collected!</span> Lost ${fmt(stolen)} Aura!`);
        } else {
          log(`❌ Missed the <span>${evDef.name}</span>!`);
        }
      }
      el.remove(); activeEvent = null; return;
    }
    el.style.left = (progress * screenW - 100) + 'px';
    requestAnimationFrame(moveEvent);
  }
  requestAnimationFrame(moveEvent);

  if (evDef.isTax) {
    setTimeout(() => {
      if (!clicked && el.parentNode) {
        clicked = true;
        const stolen = Math.floor(G.aura * 0.1);
        G.aura -= stolen;
        sfxRand(S.fanumHit);
        log(`🤚 <span>Fanum Tax collected!</span> Lost ${fmt(stolen)} Aura!`);
        el.classList.add('clicked');
        setTimeout(() => el.remove(), 400);
        activeEvent = null;
      }
    }, 3000);
  }
}

// --- Update UI ---
function updateUI() {
  const bs = getBinderStats();
  const fieldMult = getFieldMult();
  const apsMult = apsBuffMult();
  const effectiveMult = (G.allAuraMult + bs.addMult + fieldMult) * (G.frenzyActive ? 10 : 1);
  const effectiveApc = G.auraPerClick + bs.addApc;
  const effectiveAps = (G.auraPerSecond + bs.addAps) * apsMult;
  $auraAmt.textContent = fmt(G.aura);
  $auraStats.textContent = `+${fmt(effectiveApc * effectiveMult * clickBuffMult(true))}/click | +${fmt(effectiveAps * effectiveMult)}/sec | ${effectiveMult.toFixed(1)}x mult`;
  if ($kekAmt) $kekAmt.textContent = G.kekCoins;
}

// --- Background Skulls ---
function spawnSkulls() {
  const skulls = ['💀', '🗿', '☠️', '👽'];
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('div');
    s.className = 'bg-skull';
    s.textContent = skulls[Math.floor(Math.random() * skulls.length)];
    s.style.left = Math.random() * 100 + '%';
    s.style.animationDuration = (15 + Math.random() * 25) + 's';
    s.style.animationDelay = (-Math.random() * 30) + 's';
    s.style.fontSize = (1 + Math.random() * 2) + 'rem';
    document.body.appendChild(s);
  }
}

// --- Cursor tracking ---
let _cursorX = window.innerWidth / 2, _cursorY = window.innerHeight / 2;
document.addEventListener('mousemove', e => {
  _cursorX = e.clientX; _cursorY = e.clientY;
  // Moth and Lamp: the theme-dark vignette (index.html body.theme-dark::before) follows the cursor
  document.body.style.setProperty('--mx', e.clientX + 'px');
  document.body.style.setProperty('--my', e.clientY + 'px');
});

// --- Moth and Lamp blackout ---
let _mothBlackoutAccum = 0;
let _mothBlackoutActive = false;
let _mothBlackoutRemaining = 0;

function _mothBlackoutStart(duration) {
  _mothBlackoutActive = true;
  _mothBlackoutRemaining = duration;
  const $bo = document.getElementById('moth-blackout');
  if ($bo) {
    $bo.style.background = `radial-gradient(circle 90px at ${_cursorX}px ${_cursorY}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0.97) 100%)`;
    $bo.style.opacity = '1';
  }
  sfx('Hello Brother', 0.7);
  log('🪔 <span>Moth and Lamp: lights out!</span>');
}

function _mothBlackoutEnd() {
  _mothBlackoutActive = false;
  const $bo = document.getElementById('moth-blackout');
  if ($bo) {
    $bo.style.opacity = '0';
  }
}

// --- Game Loop ---
let lastTick = Date.now();
let _uiAccum = 0;                    // throttles updateUI / updateShopUI to ~10Hz instead of 60
const UI_TICK_INTERVAL = 0.1;        // seconds between UI refreshes
let _coinTrailAccum = 0;             // for Nyan Cat coinTrailInterval

// Reset clock when tab regains focus so dt doesn't spike after long idle.
document.addEventListener('visibilitychange', () => { if (!document.hidden) lastTick = Date.now(); });

function gameLoop() {
  // When the tab is hidden, skip simulation entirely — rAF is already throttled
  // by the browser, but this avoids running game logic on stale timestamps.
  if (document.hidden) { requestAnimationFrame(gameLoop); return; }

  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  const bs = getBinderStats();
  const fieldMult = getFieldMult();
  const apsMult = apsBuffMult();
  const effectiveMult = (G.allAuraMult + bs.addMult + fieldMult) * (G.frenzyActive ? 10 : 1);
  const effectiveAps = (G.auraPerSecond + bs.addAps) * apsMult;
  G.aura += effectiveAps * effectiveMult * dt;
  // Expanding Brain: only minutes played with it slotted count (hidden tabs are skipped above)
  if (G.binderSlots.includes('bi_u6')) G.brainMinutes += dt / 60;

  // MOOD_SWING timer: Pepe's mood only advances while he's slotted
  const pepe = CARD_BY_ID.get('bi_r2');
  const pepeSlot = G.binderSlots.indexOf('bi_r2');
  if (pepeSlot !== -1) {
    G.moodTimer += dt;
    if (G.moodTimer >= (pepe.params.cycleSec || 30)) {
      G.moodTimer = 0; G.moodIndex++;
      log(`🐸 <span>Pepe's mood: ${moodLabel(pepe.params)}</span>`);
    }
  }

  if (G.frenzyActive) {
    G.frenzyTimer -= dt;
    if (G.frenzyTimer <= 0) endFrenzy();
  }
  if (G.frenzyCooldown > 0) G.frenzyCooldown -= dt;
  checkFrenzy();

  // Click and APS buffs: each entry runs its own timer
  G.clickBuffs = G.clickBuffs.filter(b => {
    b.t -= dt;
    if (b.t > 0) return true;
    log(`⏱️ <span>${buffName(b.src)} click boost expired!</span>`);
    return false;
  });
  G.apsBuffs = G.apsBuffs.filter(b => {
    b.t -= dt;
    if (b.t > 0) return true;
    log(`⏱️ <span>${buffName(b.src)} APS boost expired!</span>`);
    return false;
  });
  if (G.bossPauseTimer > 0) G.bossPauseTimer -= dt;
  eventCooldown -= dt;
  if (eventCooldown <= 0) {
    spawnEvent();
    eventCooldown = randomBetween(BAL.EVENT_SPAWN_MIN_S, BAL.EVENT_SPAWN_MAX_S);
  }

  // Boss tick
  tickBoss(dt);

  // TIMED_DROP cards on binder
  if (G.cardShopUnlocked) {
    for (let i = 0; i < G.binderSlots.length; i++) {
      const id = G.binderSlots[i]; if (!id) continue;
      const card = CARD_BY_ID.get(id);
      if (!card || card.archetype !== 'TIMED_DROP') continue;
      if (!card._lastDrop) card._lastDrop = Date.now();
      if (Date.now() - card._lastDrop >= (card.params.interval || 60) * 1000) {
        card._lastDrop = Date.now();
        let valueEAS = card.params.valueEAS || 30;
        // Stonks: payout swings up or down by up to `fluctuate`
        if (card.params.fluctuate) valueEAS *= 1 + (Math.random() * 2 - 1) * card.params.fluctuate;
        // Cheezburger + Doge combo: double payout when both are slotted
        if (card.params.comboWith && G.binderSlots.includes(card.params.comboWith)) {
          valueEAS *= (card.params.comboMult || 2);
        }
        const sigmaActive = getFieldParams().disableAutoCollect;
        if (card.params.kekValue) {
          // Philosoraptor: hoverable drop that awards Kek Koins instead of Aura
          spawnBurnKekCoin(card.params.kekValue, card.params.dropEmoji || card.emoji, true);
        } else if (card.params.autoCollect && !sigmaActive) {
          const amt = computeBaseEAS() * valueEAS;
          G.aura += amt;
          spawnParticle(60 + Math.random() * 100, 60 + Math.random() * 60, '+' + fmt(amt));
        } else {
          spawnBurnCoin(valueEAS, card.emoji, card.params.requireHover);
        }
      }
    }
  }

  // IDLE_DRIP — First World Problems: multiply APS income while idle
  for (const id of G.binderSlots) {
    if (!id) continue;
    const card = CARD_BY_ID.get(id);
    if (!card || card.archetype !== 'IDLE_DRIP') continue;
    const idleThreshold = card.params.idleThreshold || 5;
    const idleSec = (Date.now() - (G.lastIdleClickTime || Date.now())) / 1000;
    if (idleSec > idleThreshold) {
      // Extra APS income on top of the base tick already applied above
      const idleMult = (card.params.idleApsMult || 1.5) - 1;  // additive bonus above the 1× already ticked
      const apsMult = apsBuffMult();
      const idleExtra = (G.auraPerSecond + bs.addAps) * apsMult * effectiveMult * idleMult * dt;
      G.aura += idleExtra;
    }
  }

  if (nuggetScale < 1) nuggetScale = Math.min(1, nuggetScale + dt * 4);

  if (nuggetModel && nuggetModel.visible) {
    nuggetModel.rotation.y += dt * 0.8;
    if (!nuggetModel.userData.baseScale) nuggetModel.userData.baseScale = nuggetModel.scale.x;
    const bs2 = nuggetModel.userData.baseScale;
    nuggetModel.scale.set(bs2 * nuggetScale, bs2 * nuggetScale, bs2 * nuggetScale);
  }
  if (packModel && packModel.visible) {
    packModel.rotation.y += dt * 0.5;
  }
  tickKekCoins(dt);
  renderer.render(scene, camera);

  // FIELD card per-frame effects
  if (G.fieldSlot) {
    const fc = CARD_BY_ID.get(G.fieldSlot);
    if (fc && fc.archetype === 'FIELD_THEME') {
      const fp = fc.params;
      // Moth and Lamp: periodic blackout
      if (fp.blackoutInterval) {
        _mothBlackoutAccum += dt;
        if (_mothBlackoutActive) {
          _mothBlackoutRemaining -= dt;
          // Update lamp glow position to follow cursor
          const $bo = document.getElementById('moth-blackout');
          if ($bo) $bo.style.background =
            `radial-gradient(circle 90px at ${_cursorX}px ${_cursorY}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0.97) 100%)`;
          if (_mothBlackoutRemaining <= 0) _mothBlackoutEnd();
        } else if (_mothBlackoutAccum >= fp.blackoutInterval) {
          _mothBlackoutAccum = 0;
          _mothBlackoutStart(fp.blackoutDuration || 5);
        }
      }
      // Nyan Cat: fly across the screen every coinTrailInterval seconds
      if (fp.coinTrailInterval) {
        _coinTrailAccum += dt;
        if (_coinTrailAccum >= fp.coinTrailInterval) {
          _coinTrailAccum = 0;
          spawnNyanCat();
        }
      }
      // This is Fine: escalating fire level every fireInterval seconds
      if (fp.fireInterval && G.fireLevel < (fp.fireMaxLevel || 5)) {
        G.fireAccum += dt;
        if (G.fireAccum >= fp.fireInterval) {
          G.fireAccum = 0;
          G.fireLevel++;
          _updateFireVisuals(G.fireLevel);
          const pct = Math.round(((fp.mult || 0.25) + G.fireLevel * (fp.fireAuraPer || 0.08)) * 100);
          log(`🔥 <span>The fire spreads! Level ${G.fireLevel}/5 — now +${pct}% Aura</span>`);
        }
      }
    } else {
      // Field card removed — clear any active effects
      if (_mothBlackoutActive) _mothBlackoutEnd();
      if (G.fireLevel > 0) { G.fireLevel = 0; G.fireAccum = 0; _updateFireVisuals(0); }
    }
  } else {
    if (_mothBlackoutActive) _mothBlackoutEnd();
    if (G.fireLevel > 0) { G.fireLevel = 0; G.fireAccum = 0; _updateFireVisuals(0); }
  }

  // DOM-touching UI updates are expensive; throttle to ~10Hz instead of every frame.
  _uiAccum += dt;
  if (_uiAccum >= UI_TICK_INTERVAL) {
    _uiAccum = 0;
    updateUI();
    updateShopUI();
    // Pepe: keep the slot label's mode + countdown current
    if (pepeSlot !== -1) {
      const fxEl = _slotRefs.binder[pepeSlot]?.thumb?.querySelector('.slot-card-fx');
      if (fxEl) fxEl.textContent = cardEffectLabel(pepe);
    }
  }

  requestAnimationFrame(gameLoop);
}

// ============================================================
// BURN INVENTORY + ACTIVATION SYSTEM
// ============================================================

const $burnBar = document.getElementById('burn-bar');
const $burnBarItems = document.getElementById('burn-bar-items');
const $burnPreview = document.getElementById('burn-preview');
const $burnFx = document.getElementById('burn-fx');

// Compute one "EAS" (Effective APS-Second) at the current moment.
// Only the passive tick may read temp APS mults (Rule 0.1): this is for the live ticker and UI.
function computeEAS() {
  const bs = getBinderStats();
  const fieldMult = getFieldMult();
  const aps = (G.auraPerSecond + bs.addAps) * apsBuffMult();
  const mult = (G.allAuraMult + bs.addMult + fieldMult);
  return Math.max(1, aps * mult);   // floor at 1 so early game still pays out
}

// Base EAS — excludes temporary APS multipliers (Rickroll etc).
// Every one-shot payout (bursts, coins, targets, gags, drops, boss reward) reads this one.
function computeBaseEAS() {
  const bs = getBinderStats();
  const fieldMult = getFieldMult();
  const aps = (G.auraPerSecond + bs.addAps);   // no temp APS buffs
  const mult = (G.allAuraMult + bs.addMult + fieldMult);
  return Math.max(1, aps * mult);
}

// --- Buff lists (G.clickBuffs / G.apsBuffs) ---
// Buffs stack additively (1 + Σ(mult − 1)), each with its own timer, so no card can
// extend or downgrade another and each pays its own value.
function addClickBuff(b) {
  G.clickBuffs.push(Object.assign({ mult: 1, t: 10, uncapped: false, centerOnly: false, echo: false,
    easPerClick: 0, capEAS: 0, paidEAS: 0, kekEveryNHits: 0, kekCap: 0, kekPaid: 0, hits: 0 }, b));
}
function addApsBuff(b) { G.apsBuffs.push({ src: b.src, mult: b.mult || 1, t: b.t || 10 }); }
// Card buffs are capped at CLICK_MULT_CAP; uncapped entries (Level 67 Gyatt) add on top.
// centerOnly entries (Overly Attached GF) only count on a dead-center hit.
function clickBuffMult(centreHit) {
  let card = 0, uncapped = 0;
  for (const b of G.clickBuffs) {
    if (b.centerOnly && !centreHit) continue;
    if (b.uncapped) uncapped += b.mult - 1;
    else card += b.mult - 1;
  }
  return 1 + Math.min(BAL.CLICK_MULT_CAP - 1, card) + uncapped;
}
function apsBuffMult() {
  let sum = 0;
  for (const b of G.apsBuffs) sum += b.mult - 1;
  return 1 + Math.min(BAL.APS_MULT_CAP - 1, sum);
}
function hasEcho() { return G.clickBuffs.some(b => b.echo); }
function buffName(src) { return src === 'gyatt' ? 'Level 67 Gyatt' : (CARD_BY_ID.get(src)?.name || 'Boost'); }

function showBurnToast(text) {
  const t = document.createElement('div');
  t.className = 'burn-toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2100);
}

const RARITY_ORDER = { rare: 0, uncommon: 1, common: 2 };
function renderBurnBar() {
  if (!G.cardShopUnlocked) { $burnBar.style.display = 'none'; return; }
  // Rare → uncommon → common, then library order; BURN_INVENTORY_CAP cards per page
  const owned = CARD_LIBRARY.filter(c => c.type === 'Burn' && (G.collection[c.id] || 0) > 0)
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
  if (owned.length === 0) { $burnBar.style.display = 'none'; return; }
  $burnBar.style.display = 'block';
  $burnBarItems.innerHTML = '';
  const pages = Math.ceil(owned.length / BAL.BURN_INVENTORY_CAP);
  G.burnBarPage = Math.max(0, Math.min(pages - 1, G.burnBarPage));
  const cards = owned.slice(G.burnBarPage * BAL.BURN_INVENTORY_CAP, (G.burnBarPage + 1) * BAL.BURN_INVENTORY_CAP);
  const n = cards.length;
  const pageBtn = (label, dir) => {
    const b = document.createElement('button');
    b.className = 'burn-page-btn';
    b.textContent = label;
    b.title = `Page ${G.burnBarPage + 1} / ${pages}`;
    b.disabled = (G.burnBarPage + dir < 0 || G.burnBarPage + dir >= pages);
    b.onclick = (e) => { e.stopPropagation(); G.burnBarPage += dir; renderBurnBar(); };
    return b;
  };
  if (pages > 1) $burnBarItems.appendChild(pageBtn('◀', -1));
  // Fan spread: wider arc like MTG Arena (up to ±18° across the hand)
  const maxSpread = n > 1 ? Math.min(18, (n - 1) * 2.5) : 0;
  const stepDeg = n > 1 ? (maxSpread * 2) / (n - 1) : 0;
  const startDeg = -maxSpread;
  cards.forEach((card, i) => {
    const cnt = G.collection[card.id] || 0;
    const rot = startDeg + stepDeg * i;
    const wrap = document.createElement('div');
    wrap.className = 'burn-card-wrap' + (burnBlockedReason(card) ? ' blocked' : '');
    // transform-origin below card creates natural fan arc; no extra arcY needed
    wrap.style.cssText = `transform:rotate(${rot}deg);transform-origin:50% 120%;`;
    const hasMulti = card.params && card.params.multiKekBonus && cnt > 1;
    const m = Math.min(cnt, BAL.MULTI_COPY_CAP);   // "Use All" consumes at most MULTI_COPY_CAP copies
    const multiTip = card.archetype === 'KEK_DOUBLE_BUFF' ? `+${(card.params.doubleCount || 5) * m} doubles`
      : card.archetype === 'COIN_RAIN' ? `${m}× Kek per bone`
      : `${Math.pow(2, m) - 1}× power`;
    const useAllBtn = hasMulti
      ? `<button class="burn-use-all-btn" title="Use ${m} copies at once: ${multiTip}!">🔥 ×${m}</button>`
      : '';
    wrap.innerHTML = `<div class="burn-card-vis">${buildCardFaceHTML(card)}<span class="bcnt">×${cnt}</span>${useAllBtn}</div>`;
    wrap.title = `${card.name} — ${card.desc}`;
    wrap.onclick = () => activateBurn(card.id);
    if (hasMulti) {
      const btn = wrap.querySelector('.burn-use-all-btn');
      btn.addEventListener('click', e => { e.stopPropagation(); activateBurnMulti(card.id); });
    }
    wrap.addEventListener('mouseenter', () => {
      // Position preview at this card's horizontal center so it appears to rise from the hand
      const rect = wrap.getBoundingClientRect();
      $burnPreview.style.left = `${rect.left + rect.width / 2}px`;
      $burnPreview.innerHTML = buildCardFaceHTML(card);
      $burnPreview.classList.add('visible');
    });
    wrap.addEventListener('mouseleave', () => {
      $burnPreview.classList.remove('visible');
    });
    $burnBarItems.appendChild(wrap);
  });
  if (pages > 1) $burnBarItems.appendChild(pageBtn('▶', 1));
}

// Why a burn can't be used right now (the card is kept), or null.
function burnBlockedReason(card) {
  const p = card.params || {};
  if (card.archetype === 'AUTO_COLLECT' && !p.echoClick && getFieldParams().disableAutoCollect) return 'Sigma Slam: no auto-collect!';
  // These only pay through nugget clicks, so their window would be wasted
  const nuggetOnly = card.archetype === 'PRECISION' || card.archetype === 'TEMP_CLICK_MULT' || p.echoClick;
  if (nuggetOnly && (G.boss?.active || activeTab !== 'sauces')) return 'The nugget is busy!';
  return null;
}

function activateBurn(cardId) {
  $burnPreview.classList.remove('visible');
  const now = Date.now();
  if (now < G.burnCooldownUntil) {
    log(`⏳ Burn cooldown — wait a moment.`);
    return;
  }
  const card = CARD_BY_ID.get(cardId);
  if (!card || card.type !== 'Burn') return;
  if (!(G.collection[cardId] > 0)) return;
  const blocked = burnBlockedReason(card);
  if (blocked) { showBurnToast(blocked); return; }
  G.collection[cardId]--;
  G.burnCooldownUntil = now + BAL.BURN_GLOBAL_COOLDOWN_MS;
  showBurnToast(card.name);
  log(`🔥 Activated <span>${card.name}</span>!`);
  const handler = EFFECT_HANDLERS[card.archetype];
  if (handler) handler(card, card.params || {});
  else log(`⚠️ No handler for ${card.archetype}`);
  renderBurnBar();
  updateUI();
}

// ============================================================
// EFFECT HANDLERS — one per Burn archetype.
// Each receives (card, params) and applies its effect.
// ============================================================
const EFFECT_HANDLERS = {
  INSTANT_BURST(card, p) {
    const baseEAS = computeBaseEAS();

    // --- All Your Base: recent-activity scalar ---
    // Counts clicks (not click value): every clicksPerSecond clicks in the last 30s = 1s of base EAS
    if (p.recentClicksAPC) {
      const now = Date.now();
      G.recentClickTimestamps = G.recentClickTimestamps.filter(t => now - t < 30000);
      const recentClicks = G.recentClickTimestamps.length;
      const secs = Math.max(p.floorApsSeconds || 30, Math.min(p.capApsSeconds || 60, recentClicks / (p.clicksPerSecond || 4)));
      const amt = baseEAS * secs;
      G.aura += amt;
      spawnParticle(window.innerWidth / 2, window.innerHeight / 2, '+' + fmt(amt));
      if (p.retroOverlay) bodyFxFor('fx-retro', p.retroOverlay * 1000);
      return;
    }

    // --- Ermahgerd: mash-to-amplify ---
    if (p.baseApsSeconds) {
      let totalSeconds = p.baseApsSeconds;
      const cap = p.capApsSeconds || 60;
      const bonus = p.mashBonusSeconds || 3;
      const windowMs = (p.mashWindow || 3) * 1000;
      const deadline = Date.now() + windowMs;
      const payBase = () => {
        const amt = baseEAS * totalSeconds;
        G.aura += amt;
        spawnParticle(window.innerWidth / 2, window.innerHeight / 2, '+' + fmt(amt));
      };
      const onMash = () => {
        if (Date.now() > deadline) return;
        if (totalSeconds >= cap) return;
        totalSeconds = Math.min(cap, totalSeconds + bonus);
        spawnParticle(window.innerWidth / 2, window.innerHeight / 3, '+' + bonus + 's!');
      };
      document.addEventListener('click', onMash, { capture: true });
      setTimeout(() => {
        document.removeEventListener('click', onMash, { capture: true });
        payBase();
      }, windowMs);
      return;
    }

    // --- Standard: instant flat burst ---
    const amt = baseEAS * (p.apsSeconds || 0);
    G.aura += amt;
    spawnParticle(window.innerWidth / 2, window.innerHeight / 2, '+' + fmt(amt));
    if (p.shake) {
      // El Risitas: 'violent' shakes like the multi-copy path
      const violent = p.shake === 'violent';
      document.body.style.animation = violent ? 'bossShake 0.4s 12' : 'bossShake 0.4s 6';
      setTimeout(() => document.body.style.animation = '', violent ? 5000 : 2000);
    }
    // Arthur Fist: next nugget click counts double
    if (p.doubleNext) G.doubleNextClick = true;
    // Arthur Fist: also drops Kek Koins as a bonus
    if (p.kekBonus) {
      awardKek(p.kekBonus);
      spawnParticle(window.innerWidth / 2, window.innerHeight / 2 - 40, `+${p.kekBonus} 👑`);
    }
  },
  TEMP_CLICK_MULT(card, p) {
    // Own entry and timer; stacks additively with other click buffs (see clickBuffMult)
    addClickBuff({ src: card.id, mult: p.mult || 1, t: p.duration || 10, easPerClick: p.easPerClick || 0, capEAS: p.capEAS || 0 });
  },
  TEMP_APS_MULT(card, p) {
    addApsBuff({ src: card.id, mult: p.mult || 1, t: p.duration || 10 });
    // Rickroll: cosmetic fake crash screen for 1.5s (the buff is already running)
    if (p.fakeCrash) {
      const crash = document.createElement('div');
      crash.className = 'fake-crash';
      crash.style.cssText = 'position:fixed;inset:0;z-index:700;pointer-events:none;background:#3c3c3c;color:#ddd;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;font-size:1.4rem;';
      crash.innerHTML = '<div style="font-size:4rem">😵</div><div><b>Aw, Snap!</b> Aura.exe has stopped responding</div>';
      document.body.appendChild(crash);
      setTimeout(() => crash.remove(), 1500);
    }
    // Have You Ever Had A Dream: freeze the Skibidi drain for the same window
    if (p.pauseBoss) G.bossPauseTimer = Math.max(G.bossPauseTimer, p.duration || 10);
  },
  COIN_RAIN(card, p) {
    const total = p.coins || 10;
    const dur = p.duration || 5;
    const motion = p.motion || 'fall';
    const ival = (dur * 1000) / total;

    // Gabe the Dog bones: every caught bone is worth kekPerBone (× copies from "Use All")
    if (motion === 'bones') {
      let caught = 0;
      const spawnBone = (i) => {
        const el = document.createElement('div');
        el.className = 'burn-coin motion-bones';
        el.textContent = '🦴';
        el.style.setProperty('--dur', dur + 's');
        el.style.setProperty('--lane', i % 9);
        el.style.left = '-80px';
        el.onclick = () => {
          if (el.classList.contains('collected')) return;
          el.classList.add('collected');
          caught++;
          const rect = el.getBoundingClientRect();
          spawnParticle(rect.left, rect.top, '🦴');
          setTimeout(() => el.remove(), 300);
        };
        $burnFx.appendChild(el);
        $burnFx.style.display = 'block';
        setTimeout(() => { if (el.parentNode) el.remove(); }, dur * 1000 + 500);
      };
      for (let i = 0; i < total; i++) setTimeout(() => spawnBone(i), i * ival);
      // Pay once when the wave ends (after the last bone's own lifetime)
      setTimeout(() => {
        const kek = Math.round(caught * (p.kekPerBone || 0) * (p._copies || 1));
        if (kek > 0) awardKek(kek);
        showBurnToast(`BORK! ${caught}/${total} bones: +${kek} Kek Koins!`);
        log(`🐕 Gabe: ${caught}/${total} bones caught — +${kek} Kek Koins!`);
      }, (total - 1) * ival + dur * 1000 + 600);
      return;
    }

    // Sine-wave motion (Is This a Pigeon?): JS-driven per-frame position
    if (motion === 'sine') {
      const spawnSine = () => {
        const el = document.createElement('div');
        el.className = 'burn-coin';
        el.style.animation = 'none';
        el.textContent = card.emoji;
        const startX = 5 + Math.random() * 90;
        const speed = 60 + Math.random() * 40;   // px/s down
        const vx = (Math.random() - 0.5) * 60;   // vw/s drift
        el.style.cssText = `position:absolute;font-size:1.6rem;cursor:pointer;pointer-events:auto;left:${startX}vw;top:-50px;animation:none;`;
        // Real zigzag on rAF time: drift + a 6vw sine with a 1.2s period, kept on screen
        let t0 = null;
        const step = (ts) => {
          if (!el.parentNode || el.classList.contains('collected')) return;
          if (t0 === null) t0 = ts;
          const t = (ts - t0) / 1000;
          const x = Math.max(2, Math.min(95, startX + vx * t + 6 * Math.sin(2 * Math.PI * t / 1.2)));
          const y = -50 + speed * t;
          el.style.left = x + 'vw';
          el.style.top = y + 'px';
          if (y < window.innerHeight + 50) requestAnimationFrame(step);
          else el.remove();
        };
        el.onclick = () => {
          if (el.classList.contains('collected')) return;
          el.classList.add('collected');
          const amt = computeBaseEAS() * (p.valueEASEach || 7.5);
          G.aura += amt;
          const rect = el.getBoundingClientRect();
          spawnParticle(rect.left, rect.top, '+' + fmt(amt));
          setTimeout(() => el.remove(), 300);
        };
        $burnFx.appendChild(el);
        $burnFx.style.display = 'block';
        requestAnimationFrame(step);
        setTimeout(() => { if (el.parentNode) el.remove(); }, dur * 1000 + 500);
      };
      for (let i = 0; i < total; i++) setTimeout(spawnSine, i * ival);
      return;
    }

    // Gravity (Kazoo Kid): coins accelerate as they fall
    if (motion === 'gravity') {
      for (let i = 0; i < total; i++) {
        setTimeout(() => {
          const el = document.createElement('div');
          el.className = 'burn-coin motion-gravity';
          el.textContent = card.emoji;
          el.style.left = (10 + Math.random() * 80) + 'vw';
          const fallDur = (1.5 + Math.random() * 1) * dur / total;
          el.style.setProperty('--dur', fallDur + 's');
          el.onclick = () => {
            if (el.classList.contains('collected')) return;
            el.classList.add('collected');
            const amt = computeBaseEAS() * (p.valueEASEach || 4.5);
            G.aura += amt;
            const rect = el.getBoundingClientRect();
            spawnParticle(rect.left, rect.top, '+' + fmt(amt));
            setTimeout(() => el.remove(), 300);
          };
          $burnFx.appendChild(el);
          $burnFx.style.display = 'block';
          setTimeout(() => { if (el.parentNode) el.remove(); }, fallDur * 1000 + 500);
        }, i * ival);
      }
      return;
    }

    // Fade (Pink Guy Ravioli): appear at fixed positions and fade out quickly
    if (motion === 'fade') {
      const fadeDur = p.fadeDuration || 1.5;
      for (let i = 0; i < total; i++) {
        const el = document.createElement('div');
        el.className = 'burn-coin motion-fade';
        el.textContent = card.emoji;
        el.style.left = (5 + Math.random() * 88) + 'vw';
        el.style.top = (10 + Math.random() * 75) + 'vh';
        el.style.animation = 'none';
        el.style.cssText += `position:absolute;font-size:1.8rem;cursor:pointer;pointer-events:auto;animation:coinFade ${fadeDur}s ease-out ${i * 0.1}s forwards;`;
        el.onclick = () => {
          if (el.classList.contains('collected')) return;
          el.classList.add('collected');
          const amt = computeBaseEAS() * (p.valueEASEach || 7.5);
          G.aura += amt;
          const rect = el.getBoundingClientRect();
          spawnParticle(rect.left, rect.top, '+' + fmt(amt));
          setTimeout(() => el.remove(), 300);
        };
        $burnFx.appendChild(el);
        $burnFx.style.display = 'block';
        setTimeout(() => { if (el.parentNode) el.remove(); }, (fadeDur + 0.5) * 1000);
      }
      return;
    }

    // Streak (Shooting Stars): neon items fly left to right
    if (motion === 'streak') {
      for (let i = 0; i < total; i++) {
        setTimeout(() => {
          const el = document.createElement('div');
          el.className = 'burn-coin motion-streak';
          el.textContent = card.emoji;
          if (p.neon) el.style.filter = 'drop-shadow(0 0 6px cyan)';
          el.style.setProperty('--dur', (dur / total * 3) + 's');
          el.style.setProperty('--lane', i % 9);
          el.style.left = '-80px';
          el.onclick = () => {
            if (el.classList.contains('collected')) return;
            el.classList.add('collected');
            const amt = computeBaseEAS() * (p.valueEASEach || 12);
            G.aura += amt;
            const rect = el.getBoundingClientRect();
            spawnParticle(rect.left, rect.top, '+' + fmt(amt));
            setTimeout(() => el.remove(), 300);
          };
          $burnFx.appendChild(el);
          $burnFx.style.display = 'block';
          setTimeout(() => { if (el.parentNode) el.remove(); }, dur * 1000 + 500);
        }, i * ival);
      }
      return;
    }

    // Default: fall (Chocolate Rain, standard). Every kekEveryNth coin is a Kek Koin (gold).
    for (let i = 0; i < total; i++) {
      const isKek = p.kekEveryNth && ((i + 1) % p.kekEveryNth === 0);
      setTimeout(() => {
        if (isKek) {
          spawnBurnKekCoin();
        } else {
          spawnBurnCoin(p.valueEASEach || 6, card.emoji);
        }
      }, i * ival);
    }
  },
  TARGET_CHASE(card, p) {
    spawnBurnTarget(card, p);
  },
  GAMBLE(card, p) {
    const win = Math.random() < (p.p || 0.5);
    if (win) {
      const amt = computeBaseEAS() * (p.winEAS || 0);
      G.aura += amt;
      showBurnToast('WIN! +' + fmt(amt));
      log(`🐸 Evil Kermit GAMBLE — won ${fmt(amt)} aura!`);
    } else {
      showBurnToast('NOTHING');
      log(`🐸 Evil Kermit GAMBLE — nothing this time.`);
    }
  },
  AUTO_COLLECT(card, p) {
    // Safety net (burnBlockedReason blocks these first): Sigma Slam disables auto-collect, not the echo
    if (!p.echoClick && getFieldParams().disableAutoCollect) {
      showBurnToast('Sigma Slam: no auto-collect!');
      return;
    }
    // Distracted Boyfriend: echo-click mode
    if (p.echoClick) {
      addClickBuff({ src: card.id, mult: 1, t: p.echoDuration || 8, echo: true, easPerClick: p.easPerClick || 0, capEAS: p.capEAS || 0 });
      G.echoOffset = p.echoOffset || 150;
      log(`👀 Echo clicks active for ${p.echoDuration || 8}s!`);
      return;
    }
    // Spiderman Pointing: scoop up any settled/settling Kek Koins first
    if (p.autoCollectKekCoins) {
      const toCollect = activeKekCoins.filter(c => !c.collected && (c.phase === 'idle' || c.phase === 'settling'));
      if (toCollect.length) {
        toCollect.forEach(c => collectKekCoin(c, window.innerWidth / 2, window.innerHeight / 2));
        log(`🕷️ Spiderman scooped ${toCollect.length} Kek Koin${toCollect.length > 1 ? 's' : ''}!`);
      }
    }
    // Standard auto-click loop (Spiderman Pointing, Vitas, Disaster Girl)
    const clicks = p.clicks || 10;
    const dur = (p.duration || 3) * 1000;
    const ival = dur / clicks;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    let paid = 0;   // D6 EAS paid by this activation's auto-clicks (capped at capEAS)
    // Disaster Girl: animate fire sweep across screen
    if (p.sweep) {
      const sweep = document.createElement('div');
      sweep.style.cssText = `position:fixed;top:0;left:-80px;width:80px;height:100vh;background:linear-gradient(to right,transparent,rgba(255,120,0,0.6),transparent);pointer-events:none;z-index:500;transition:left ${p.duration || 4}s linear;`;
      document.body.appendChild(sweep);
      requestAnimationFrame(() => { sweep.style.left = (window.innerWidth + 80) + 'px'; });
      setTimeout(() => sweep.remove(), (p.duration || 4) * 1000 + 200);
    }
    for (let i = 0; i < clicks; i++) {
      setTimeout(() => {
        const bs = getBinderStats();
        const fieldMult = getFieldMult();
        const earned = (G.auraPerClick + bs.addApc) * (G.allAuraMult + bs.addMult + fieldMult) * (p.mult || 1);
        G.aura += earned;
        const e = Math.min(p.easPerClick || 0, (p.capEAS || 0) - paid);
        if (e > 0) { paid += e; G.aura += e * computeBaseEAS(); }
        spawnParticle(cx + (Math.random() - 0.5) * 200, cy + (Math.random() - 0.5) * 200, '+' + fmt(earned));
        // Vitas: each auto-click also registers as a boss hit even when boss is blocking
        if (p.piercesBoss && G.boss && G.boss.active) {
          const now = Date.now();
          G.boss.defeatClicks.push(now);
          G.boss.lastInteract = now;
          G.boss.defeatClicks = G.boss.defeatClicks.filter(t => now - t < BAL.BOSS_DEFEAT_WINDOW_S * 1000);
          const progress = Math.min(1, G.boss.defeatClicks.length / BAL.BOSS_CLICKS_TO_DEFEAT);
          if ($bossFill) $bossFill.style.width = (progress * 100) + '%';
          if (G.boss.defeatClicks.length >= BAL.BOSS_CLICKS_TO_DEFEAT) endBossFight(true);
        }
        // Disaster Girl sweep: collect nearby burn-coins in sweepRadius
        if (p.sweep && p.sweepRadius) {
          // Track the fire band as it crosses the screen left to right
          const sweepX = (i / clicks) * window.innerWidth;
          document.querySelectorAll('.burn-coin:not(.collected)').forEach(el => {
            const r = el.getBoundingClientRect();
            if (Math.abs(r.left - sweepX) < p.sweepRadius) el.click();
          });
        }
      }, i * ival);
    }
  },
  PRECISION(card, p) {
    const dur = p.duration || 10;
    // Own buff entry: another PRECISION card can't end or overwrite this window
    addClickBuff({ src: card.id, mult: p.mult || 1, t: dur, centerOnly: !!p.deadCenterOnly,
      easPerClick: p.easPerClick || 0, capEAS: p.capEAS || 0, kekEveryNHits: p.kekEveryNHits || 0, kekCap: p.kekCap || 0 });
    // Nugget shrink / invisibility (Big Chungus: larger shrunk hit target, see applyNuggetTransform)
    if (p.invisibleNugget) nuggetFxFor('invisible', dur * 1000);
    if (p.smallNugget) nuggetFxFor('shrink', dur * 1000);
  },
  SCREEN_GAG(card, p) {
    const amt = computeBaseEAS() * (p.pityEAS || 30);
    if (p.fakeError) {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;top:30%;left:50%;transform:translateX(-50%);background:#fff;color:#000;border:2px solid #000;padding:16px 24px;z-index:700;font-family:monospace;cursor:pointer;box-shadow:4px 4px 0 rgba(0,0,0,0.5);';
      div.innerHTML = '<b>⚠ ERROR</b><br>Too much aura<br><br><i>(click to dismiss)</i>';
      div.onclick = () => { G.aura += amt; spawnParticle(window.innerWidth / 2, window.innerHeight / 2, '+' + fmt(amt)); div.remove(); };
      document.body.appendChild(div);
      setTimeout(() => { if (div.parentNode) { G.aura += amt; div.remove(); } }, 6000);
    } else {
      // Pity payout lands when the gag ends ("sit through it")
      const gagMs = (p.gagDuration || p.scramble || 3) * 1000;
      if (p.scramble) bodyFxFor('fx-scramble', gagMs);
      if (p.blur) {
        document.body.style.setProperty('--fx-blur', `${Math.min(p.blur, 8) / 4}px`);
        bodyFxFor('fx-blur', gagMs);
      }
      if (p.biggerNugget) nuggetFxFor('grow', gagMs);
      setTimeout(() => {
        G.aura += amt;
        spawnParticle(window.innerWidth / 2, window.innerHeight / 2, '+' + fmt(amt));
      }, gagMs);
    }
  },
  RHYTHM(card, p) {
    spawnRhythmGame(card, p);
  },
  KEK_SPAWN(card, p) {
    const n = p.kekCoins || 2;
    for (let i = 0; i < n; i++) setTimeout(() => spawnKekCoin(), i * 120);
    log(`👑 <span>${card.name}</span>: ${n} Kek Koin${n > 1 ? 's' : ''} incoming!`);
  },
  KEK_DOUBLE_BUFF(card, p) {
    const n = p.doubleCount || 5;
    G.kekDoubleCount += n;
    log(`🪙 <span>${card.name}</span>: next ${G.kekDoubleCount} Kek Koins are worth 2×!`);
    showBurnToast(`Next ${G.kekDoubleCount} Koins: 2×!`);
  },
};

// Consume up to MULTI_COPY_CAP copies of a multi-copy eligible burn card at once.
// KEK_SPAWN / INSTANT_BURST scale: multiplier = 2^N - 1  (1→1×, 2→3×, 3→7× max)
function activateBurnMulti(cardId) {
  const card = CARD_BY_ID.get(cardId);
  if (!card || card.type !== 'Burn') return;
  if (!card.params || !card.params.multiKekBonus) return;
  const n = Math.min(G.collection[cardId] || 0, BAL.MULTI_COPY_CAP);
  if (n < 2) { activateBurn(cardId); return; }
  const now = Date.now();
  if (now < G.burnCooldownUntil) { log('⏳ Burn cooldown — wait a moment.'); return; }
  const blocked = burnBlockedReason(card);
  if (blocked) { showBurnToast(blocked); return; }
  G.collection[cardId] -= n;
  G.burnCooldownUntil = now + BAL.BURN_GLOBAL_COOLDOWN_MS;
  const multiplier = Math.pow(2, n) - 1;
  const p = card.params;
  showBurnToast(`${card.name} × ${n}!`);
  log(`🔥🔥 <span>${card.name} × ${n}</span> — ${multiplier}× power!`);
  if (card.archetype === 'KEK_SPAWN') {
    const total = (p.kekCoins || 2) * multiplier;
    for (let i = 0; i < total; i++) setTimeout(() => spawnKekCoin(), i * 80);
    log(`👑 +${total} Kek Koins incoming!`);
  } else if (card.archetype === 'KEK_DOUBLE_BUFF') {
    G.kekDoubleCount += (p.doubleCount || 5) * n;
    log(`🪙 Next ${G.kekDoubleCount} Kek Koins are worth 2×!`);
  } else if (card.archetype === 'COIN_RAIN') {
    // Gabe the Dog multi-copy: one bone run, every bone pays × n
    EFFECT_HANDLERS.COIN_RAIN(card, { ...p, _copies: n });
  } else if (card.archetype === 'INSTANT_BURST') {
    // El Risitas: exponential Aura burst
    const amt = computeBaseEAS() * (p.apsSeconds || 600) * multiplier;
    G.aura += amt;
    spawnParticle(window.innerWidth / 2, window.innerHeight / 2, '+' + fmt(amt));
    if (p.shake) { document.body.style.animation = 'bossShake 0.4s 12'; setTimeout(() => document.body.style.animation = '', 5000); }
  }
  renderBurnBar();
  updateUI();
  updateCardShopUI();
}

// ============================================================
// KEK KOIN — 3D physics drop currency
// ============================================================
// Phase machine per coin: burst → arc → settling → idle
// All physics manual (no engine). Coins live in `activeKekCoins`; ticked in
// gameLoop via tickKekCoins(dt) before renderer.render.

const activeKekCoins = [];

function spawnKekCoinCollectFX(sx, sy) {
  const el = document.createElement('div');
  el.style.cssText = [
    `position:fixed`,
    `left:${sx - 30}px`,
    `top:${sy - 30}px`,
    `width:60px`,
    `height:60px`,
    `pointer-events:none`,
    `z-index:200`,
    `background:url('Images/Kek Koin.png') center/contain no-repeat`,
    `animation:kekCoinCollect 0.8s ease-out forwards`,
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

const KEK_GRAVITY = -12;     // m/s^2 — snappy, not floaty
const KEK_GROUND_Y = -1.3;    // lower landing zone; visible in the expanded 1.5× canvas (frustum y ≈ -1.6..+2.2)
const KEK_AIR_DRAG = 0.02;    // per-frame velocity dampener
const KEK_BURST_TIME = 0.15;    // seconds before gravity kicks in
const KEK_SETTLE_TIME = 0.4;     // seconds to lerp to upright
const KEK_IDLE_TIMEOUT_S = 20;  // auto-collect after this long resting

// The one path every Kek Koin grant goes through.
function awardKek(n) {
  G.kekCoins += n;
  G.totalKekEarned += n;
  updateUI();
  updateCardShopUI();
}

function spawnKekCoin() {
  // Models not loaded yet: pay the coin (and the PBJ bonus) directly instead of losing it
  if (!kekCoinTemplate || !nuggetModel) {
    awardKek(1 + (getFieldParams().kekDropBonus || 0));
    return;
  }
  const mesh = kekCoinTemplate.clone(true);
  // THREE clone() shares materials by reference — clone them too so per-coin
  // opacity changes (fade-on-collect) don't bleed across instances.
  mesh.traverse(o => {
    if (o.isMesh && o.material) {
      if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
      else o.material = o.material.clone();
    }
  });
  scene.add(mesh);
  // Full 360° burst: random horizontal direction + 50-80° elevation.
  // Elevation ≥50° keeps horizontal travel ≤1.4 units so coins stay inside
  // the ±1.86-unit visible frustum (45° FOV, camera z=4.5).
  const direction = Math.random() * Math.PI * 2;
  const elevation = Math.PI * 5 / 18 + Math.random() * (Math.PI / 6);  // 50–80°
  const speed = 1.8 + Math.random() * 1.0;
  const horiz = Math.cos(elevation) * speed;
  const startPos = new THREE.Vector3(0, 0.3, 0);
  mesh.position.copy(startPos);
  activeKekCoins.push({
    mesh,
    phase: 'burst',
    pos: startPos.clone(),
    vel: new THREE.Vector3(
      Math.cos(direction) * horiz,
      Math.sin(elevation) * speed,
      Math.sin(direction) * horiz * 0.3   // compressed Z — camera is mostly head-on
    ),
    angVel: new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    ),
    bounces: 0,
    peakY: 0,
    settleLerp: 0,
    age: 0,
    idleAge: 0,
    glowMesh: null,
    light: null,
    collected: false,
  });
  // Peanut Butter Jelly bonus: every natural drop also gives bonus Kek Koins directly.
  const kekDropBonus = getFieldParams().kekDropBonus || 0;
  if (kekDropBonus) awardKek(kekDropBonus);
}

function spawnKekImpactBurst(pos) {
  // Lightweight dust: a handful of tiny billboard sprites that fade out.
  // Uses screen-space spawnParticle for cost-free DOM particles at the impact's projected screen point.
  const sp = pos.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  const sx = (sp.x * 0.5 + 0.5) * rect.width + rect.left;
  const sy = (-sp.y * 0.5 + 0.5) * rect.height + rect.top;
  spawnParticle(sx, sy, '·');
}

function _kekCreateGlow(coin) {
  // Gold disc beneath + soft point light.
  const geo = new THREE.CircleGeometry(0.35, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const disc = new THREE.Mesh(geo, mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(coin.pos.x, KEK_GROUND_Y + 0.005, coin.pos.z);
  scene.add(disc);
  coin.glowMesh = disc;
  const light = new THREE.PointLight(0xffd700, 0.6, 1.5);
  light.position.set(coin.pos.x, KEK_GROUND_Y + 0.4, coin.pos.z);
  scene.add(light);
  coin.light = light;
}

function _kekRemoveGlow(coin) {
  if (coin.glowMesh) {
    scene.remove(coin.glowMesh);
    coin.glowMesh.geometry.dispose();
    coin.glowMesh.material.dispose();
    coin.glowMesh = null;
  }
  if (coin.light) {
    scene.remove(coin.light);
    coin.light = null;
  }
}

function collectKekCoin(coin, sx, sy) {
  if (coin.collected) return;
  coin.collected = true;
  const worth = (G.kekDoubleCount > 0) ? 2 : 1;
  if (G.kekDoubleCount > 0) G.kekDoubleCount--;
  awardKek(worth);
  spawnKekCoinCollectFX(sx, sy);
  sfx('vine-boom-sound-meme', 0.35);
  // Brief pop animation: scale up + remove next frame chain
  coin._fadeTimer = 0;
  // Actual removal happens in tickKekCoins fade pass.
}

function tickKekCoins(dt) {
  if (activeKekCoins.length === 0) return;
  const visible = (activeTab === 'sauces');
  for (let i = activeKekCoins.length - 1; i >= 0; i--) {
    const c = activeKekCoins[i];
    c.mesh.visible = visible;
    c.age += dt;

    if (c.collected) {
      _kekRemoveGlow(c);
      scene.remove(c.mesh);
      activeKekCoins.splice(i, 1);
      continue;
    }

    switch (c.phase) {
      case 'burst':
        c.pos.addScaledVector(c.vel, dt);
        if (c.age >= KEK_BURST_TIME) c.phase = 'arc';
        break;

      case 'arc': {
        c.vel.y += KEK_GRAVITY * dt;
        c.vel.x *= (1 - KEK_AIR_DRAG);
        c.vel.z *= (1 - KEK_AIR_DRAG);
        c.pos.addScaledVector(c.vel, dt);
        // Keep coins inside the visible frustum (±1.6 units). If a coin would
        // exit the boundary, reflect and dampen its horizontal velocity.
        const BOUND = 1.6;
        if (Math.abs(c.pos.x) > BOUND) { c.vel.x *= -0.4; c.pos.x = Math.sign(c.pos.x) * BOUND; }
        if (Math.abs(c.pos.z) > BOUND) { c.vel.z *= -0.4; c.pos.z = Math.sign(c.pos.z) * BOUND; }
        if (c.pos.y > c.peakY) c.peakY = c.pos.y;
        if (c.pos.y <= KEK_GROUND_Y && c.vel.y < 0) {
          // Bounce
          const restitution = (c.bounces === 0) ? 0.5 : 0.18;
          c.vel.y = -c.vel.y * restitution;
          c.vel.x *= 0.6;
          c.vel.z *= 0.6;
          c.angVel.multiplyScalar(0.5);
          c.pos.y = KEK_GROUND_Y;
          spawnKekImpactBurst(c.pos);
          c.bounces++;
          if (c.bounces >= 2) {
            c.phase = 'settling';
            c.settleLerp = 0;
            // Lock x/z to current ground position
          }
        }
        break;
      }

      case 'settling': {
        c.vel.x *= 0.82;
        c.vel.z *= 0.82;
        c.pos.x += c.vel.x * dt;
        c.pos.z += c.vel.z * dt;
        c.pos.y = KEK_GROUND_Y;
        c.settleLerp = Math.min(1, c.settleLerp + dt / KEK_SETTLE_TIME);
        // Lerp rotation toward upright (face camera-ish): x and z to 0, y free.
        c.mesh.rotation.x = c.mesh.rotation.x * (1 - c.settleLerp * 0.2);
        c.mesh.rotation.z = c.mesh.rotation.z * (1 - c.settleLerp * 0.2);
        // also slow angular velocity x/z so spin freezes flat
        c.angVel.x *= 0.85;
        c.angVel.z *= 0.85;
        if (c.settleLerp >= 1) {
          c.mesh.rotation.x = 0;
          c.mesh.rotation.z = 0;
          c.angVel.set(0, Math.PI * 2 / 3.5, 0);   // idle spin: 360° per 3.5s
          c.phase = 'idle';
        }
        break;
      }

      case 'idle': {
        c.idleAge += dt;
        // Subtle floating bob
        c.pos.y = KEK_GROUND_Y + 0.08 + Math.sin(c.idleAge * 2) * 0.04;
        // Resting too long: the coin collects itself — except under Sigma Slam ("nothing collects itself")
        if (c.idleAge >= KEK_IDLE_TIMEOUT_S && !getFieldParams().disableAutoCollect) {
          const sp = c.pos.clone().project(camera);
          const rect = canvas.getBoundingClientRect();
          collectKekCoin(c, (sp.x * 0.5 + 0.5) * rect.width + rect.left, (-sp.y * 0.5 + 0.5) * rect.height + rect.top);
        }
        break;
      }
    }

    // Apply transforms
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.x += c.angVel.x * dt;
    c.mesh.rotation.y += c.angVel.y * dt;
    c.mesh.rotation.z += c.angVel.z * dt;
  }
}

// --- Raycast collection: clicking a coin in screen space ---
const _kekRaycaster = new THREE.Raycaster();
const _kekNdc = new THREE.Vector2();

function _kekIsAncestor(root, leaf) {
  let n = leaf;
  while (n) { if (n === root) return true; n = n.parent; }
  return false;
}

function tryCollectKekCoin(clientX, clientY) {
  if (activeKekCoins.length === 0) return false;
  if (activeTab !== 'sauces') return false;     // coins hidden on cards tab
  const rect = canvas.getBoundingClientRect();
  // Only consider clicks inside the canvas bounds (HUD clicks shouldn't count).
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
  _kekNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _kekNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _kekRaycaster.setFromCamera(_kekNdc, camera);
  const meshes = activeKekCoins.filter(c => !c.collected).map(c => c.mesh);
  if (meshes.length === 0) return false;
  const hits = _kekRaycaster.intersectObjects(meshes, true);
  if (hits.length === 0) return false;
  const coin = activeKekCoins.find(c => _kekIsAncestor(c.mesh, hits[0].object));
  if (!coin) return false;
  collectKekCoin(coin, clientX, clientY);
  return true;
}

// Kek Koin burn drop — awards kekAmt Kek Koins on click (or hover). Used by Chocolate Rain (fall) and Philosoraptor (hover).
function spawnBurnKekCoin(kekAmt, emoji, requireHover) {
  kekAmt = kekAmt || 1;
  const coin = document.createElement('div');
  coin.className = 'burn-coin';
  coin.textContent = emoji || '👑';
  coin.style.left = (10 + Math.random() * 80) + 'vw';
  coin.style.animationDuration = (3 + Math.random() * 2) + 's';
  coin.style.filter = 'drop-shadow(0 0 6px gold)';
  const collect = () => {
    if (coin.classList.contains('collected')) return;
    coin.classList.add('collected');
    awardKek(kekAmt);
    const rect = coin.getBoundingClientRect();
    spawnParticle(rect.left, rect.top, `+${kekAmt} 👑`);
    setTimeout(() => coin.remove(), 300);
  };
  if (requireHover) {
    coin.addEventListener('mouseenter', collect);
  } else {
    coin.onclick = collect;
  }
  $burnFx.appendChild(coin);
  $burnFx.style.display = 'block';
  setTimeout(() => { if (coin.parentNode) coin.remove(); }, 5500);
}

// --- Nyan Cat audio ---
let _nyanAudio = null;
let _nyanFadeInterval = null;

function _nyanAudioStart() {
  clearInterval(_nyanFadeInterval);
  if (!_nyanAudio) {
    _nyanAudio = new Audio('Sounds/nyan-cat_1.mp3');
    _nyanAudio.loop = true;
    _nyanAudio.volume = 0;
  }
  _nyanAudio.play().catch(() => {});
  // Fade in to 0.55 over 600ms
  const target = 0.55;
  _nyanFadeInterval = setInterval(() => {
    if (!_nyanAudio) { clearInterval(_nyanFadeInterval); return; }
    const next = Math.min(target, _nyanAudio.volume + 0.05);
    _nyanAudio.volume = next;
    if (next >= target) clearInterval(_nyanFadeInterval);
  }, 30);
}

function _nyanAudioStop() {
  if (!_nyanAudio) return;
  clearInterval(_nyanFadeInterval);
  // Fade out over ~800ms then pause
  _nyanFadeInterval = setInterval(() => {
    if (!_nyanAudio) { clearInterval(_nyanFadeInterval); return; }
    const next = Math.max(0, _nyanAudio.volume - 0.04);
    _nyanAudio.volume = next;
    if (next <= 0) {
      clearInterval(_nyanFadeInterval);
      _nyanAudio.pause();
      _nyanAudio.currentTime = 0;
    }
  }, 30);
}

function _nyanCheckAudio() {
  const count = document.querySelectorAll('.nyan-cat-run').length;
  if (count > 0) _nyanAudioStart();
  else _nyanAudioStop();
}

function spawnNyanCat() {
  // Max 2 on screen at once
  if (document.querySelectorAll('.nyan-cat-run').length >= 2) return;

  const el = document.createElement('div');
  el.className = 'nyan-cat-run';

  // Random vertical lane, avoiding very top/bottom
  const topPct = 15 + Math.random() * 55;
  // Speed: 5–8s to cross screen
  const duration = 5 + Math.random() * 3;
  el.style.top = topPct + 'vh';
  el.style.animationDuration = duration + 's';

  el.innerHTML = `<img src="Images/Effects/nyan-cat.gif" alt="Nyan Cat">`;

  let collected = false;
  el.addEventListener('click', () => {
    if (collected) return;
    collected = true;
    const rect = el.getBoundingClientRect();
    const cx = rect.right - 65;   // approximate cat center (cat is right side of image)
    const cy = rect.top + rect.height / 2;
    spawnKekCoin(); spawnKekCoin(); spawnKekCoin();
    spawnParticle(cx, cy, '+3 👑');
    log('🌈 <span>Nyan Cat caught! +3 Kek Koins!</span>');
    el.style.pointerEvents = 'none';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => { el.remove(); _nyanCheckAudio(); }, 300);
  });

  el.addEventListener('animationend', () => {
    if (!collected) log('🌈 <span>Nyan Cat escaped! No Kek Koins...</span>');
    el.remove();
    _nyanCheckAudio();
  });

  document.body.appendChild(el);
  _nyanCheckAudio();
}

function spawnBurnCoin(valueEAS, emoji, requireHover) {
  const coin = document.createElement('div');
  coin.className = 'burn-coin';
  coin.textContent = emoji || '🪙';
  coin.style.left = (10 + Math.random() * 80) + 'vw';
  coin.style.animationDuration = (3 + Math.random() * 2) + 's';
  const collect = () => {
    if (coin.classList.contains('collected')) return;
    coin.classList.add('collected');
    const amt = computeBaseEAS() * valueEAS;
    G.aura += amt;
    const rect = coin.getBoundingClientRect();
    spawnParticle(rect.left, rect.top, '+' + fmt(amt));
    setTimeout(() => coin.remove(), 300);
  };
  if (requireHover) {
    coin.addEventListener('mouseenter', collect);
  } else {
    coin.onclick = collect;
  }
  $burnFx.appendChild(coin);
  $burnFx.style.display = 'block';
  setTimeout(() => { if (coin.parentNode) coin.remove(); }, 5500);
}

function spawnBurnTarget(card, p) {
  let remaining = p.targets || 1;
  let hp = p.hp || 1;
  const timeoutMs = (p.timeout || 5) * 1000;
  const reward = (p.kekReward || p.payPerTarget) ? 0 : computeBaseEAS() * (p.rewardEAS || p.reward || 60);
  // moving:true (Leave Britney) wanders faster; all others drift slowly (px per 60 Hz frame)
  const speed = p.moving ? 8 : 3;
  const bs = getBinderStats();
  const mine = [];   // this activation's targets, so its timeout can't touch another chase card's
  const spawnOne = () => {
    if (remaining <= 0) return;
    const tgt = document.createElement('div');
    tgt.className = 'burn-target';
    tgt.textContent = card.emoji;
    if (bs.hitboxBonus) tgt.style.fontSize = '3.75rem';   // Big Chungus: 1.5× target
    tgt.style.left = (10 + Math.random() * 80) + 'vw';
    tgt.style.top = (15 + Math.random() * 65) + 'vh';
    let myHp = hp;
    // Zombie Kid Turtle regen: regain HP if player pauses clicking
    let regenTimer = null;
    const scheduleRegen = () => {
      if (!p.regenDelay) return;
      clearTimeout(regenTimer);
      regenTimer = setTimeout(() => {
        if (!tgt.parentNode) return;   // target gone (killed or timed out): stop regen loop
        if (myHp < hp) {
          myHp = Math.min(hp, myHp + (p.regenHp || 1));
          tgt.style.filter = 'brightness(1.5)';
          setTimeout(() => { tgt.style.filter = ''; }, 300);
        }
        scheduleRegen();
      }, (p.regenDelay || 1.5) * 1000);
    };
    if (p.regenDelay) scheduleRegen();
    mine.push({ tgt, stopRegen: () => clearTimeout(regenTimer) });
    tgt.onclick = () => {
      if (p.regenDelay) scheduleRegen();   // reset regen timer on each hit
      myHp--;
      tgt.style.transform = 'scale(0.7)';
      setTimeout(() => { tgt.style.transform = ''; }, 100);
      if (myHp <= 0) {
        clearTimeout(regenTimer);
        tgt.remove();
        remaining--;
        // End of Ze World: every kill pays its share right away
        if (p.payPerTarget) {
          const amt = computeBaseEAS() * (p.rewardEAS || 60) / (p.targets || 1);
          G.aura += amt;
          const r = tgt.getBoundingClientRect();
          spawnParticle(r.left, r.top, '+' + fmt(amt));
        }
        if (remaining <= 0) {
          if (p.kekReward) {
            // Zombie Kid Turtle: reward is Kek Koins, not Aura
            awardKek(p.kekReward);
            showBurnToast(`+${p.kekReward} 👑 Kek Koins!`);
            spawnParticle(window.innerWidth / 2, window.innerHeight / 2, `+${p.kekReward} 👑`);
          } else {
            if (!p.payPerTarget) {
              G.aura += reward;
              showBurnToast('+' + fmt(reward) + '!');
              spawnParticle(window.innerWidth / 2, window.innerHeight / 2, '+' + fmt(reward));
            } else showBurnToast('PERFECT RUN!');
            // End of Ze World perfect-run bonus Kek Koins
            if (p.kekBonus) {
              awardKek(p.kekBonus);
              spawnParticle(window.innerWidth / 2, window.innerHeight / 2 - 50, `+${p.kekBonus} 👑`);
              log(`☄️ Perfect run! +${p.kekBonus} Kek Koins!`);
            }
          }
        } else if (!p.swarm) {
          spawnOne();   // chain: next target appears when this one dies
        }
      }
    };
    $burnFx.appendChild(tgt);
    $burnFx.style.display = 'block';
    // Velocity in px/s (speed was tuned per 60 Hz frame), stepped by real frame time
    let dx = (Math.random() - 0.5) * speed * 2 * 60, dy = (Math.random() - 0.5) * speed * 2 * 60;
    let last = null;
    const wander = (ts) => {
      if (!tgt.parentNode) return;
      const dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      const cur = tgt.getBoundingClientRect();
      let nl = cur.left + dx * dt, nt = cur.top + dy * dt;
      if (nl < 20 || nl > window.innerWidth - 100) dx = -dx;
      if (nt < 60 || nt > window.innerHeight - 120) dy = -dy;
      tgt.style.left = (nl / window.innerWidth * 100) + 'vw';
      tgt.style.top = (nt / window.innerHeight * 100) + 'vh';
      requestAnimationFrame(wander);
    };
    requestAnimationFrame(wander);
  };
  // Ugandan Knuckles: the whole swarm at once; others chain one after another
  if (p.swarm) for (let i = 0; i < remaining; i++) spawnOne();
  else spawnOne();
  setTimeout(() => {
    mine.forEach(m => { m.stopRegen(); m.tgt.remove(); });
    if (remaining > 0) log(`❌ ${card.name} missed!`);
  }, timeoutMs);
}

// EAS a perfect RHYTHM run pays: the card's perfectEAS, else its rarity budget
function rhythmPerfectEAS(card) {
  const p = card.params || {};
  return p.perfectEAS || (card.rarity === 'rare' ? BAL.EAS_RARE : card.rarity === 'common' ? BAL.EAS_COMMON : BAL.EAS_UNCOMMON);
}

function spawnRhythmGame(card, p) {
  const dur = (p.duration || 10) * 1000;
  const baseEAS = computeBaseEAS();

  // Linear from 0: each hit pays its share of perfectEAS, so a 0-hit run pays nothing
  const perfect = rhythmPerfectEAS(card);
  const payout = (score, total) => {
    const amt = baseEAS * perfect * score / total;
    G.aura += amt;
    showBurnToast((score === total ? 'PERFECT! ' : `${score}/${total} `) + '+' + fmt(amt));
  };

  // Woman Yelling at Cat — click correct side (left/right) of screen
  if (p.spatial) {
    const total = p.sides || 4;
    let score = 0, step2 = 0;
    const nextSide = () => {
      if (step2 >= total) { payout(score, total); return; }
      const isLeft = Math.random() < 0.5;
      const x = isLeft ? '20%' : '80%';
      const prompt = document.createElement('div');
      prompt.style.cssText = `position:fixed;top:50%;left:${x};transform:translate(-50%,-50%);font-size:3.5rem;z-index:600;pointer-events:none;`;
      prompt.textContent = isLeft ? '⬅️' : '➡️';
      document.body.appendChild(prompt);
      // Each prompt ends exactly once: on a click or on timeout, whichever comes first
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        prompt.remove();
        document.removeEventListener('click', clickHandler);
        step2++;
        setTimeout(nextSide, 200);
      };
      const clickHandler = (e) => {
        const clickLeft = e.clientX < window.innerWidth / 2;
        if (clickLeft === isLeft) score++;
        finish();
      };
      document.addEventListener('click', clickHandler);
      const timer = setTimeout(finish, dur / total);
    };
    // Defer so the click that activated the burn card doesn't answer the first prompt
    setTimeout(nextSide, 0);
    return;
  }

  // Keyboard Cat — click ascending screen zones (must go higher each time)
  if (p.ascending) {
    const total = p.zones || 5;
    let score = 0;
    const stepH = window.innerHeight * 0.8 / total;
    const makeZone = (i) => {
      const zoneY = window.innerHeight * 0.85 - i * stepH;
      const zone = document.createElement('div');
      zone.style.cssText = `position:fixed;left:60%;right:5%;bottom:${(window.innerHeight - zoneY - 40)}px;height:40px;background:rgba(100,200,255,0.25);border:2px solid rgba(100,200,255,0.7);cursor:pointer;z-index:600;display:flex;align-items:center;justify-content:center;font-size:1rem;color:#fff;`;
      zone.textContent = `Zone ${i + 1}`;
      let hit = false;
      zone.onclick = () => {
        if (hit) return;
        // Zones must be hit bottom-to-top: each one higher than the last
        if (i !== score) {
          zone.style.background = 'rgba(255,80,80,0.4)';
          setTimeout(() => { if (!hit) zone.style.background = 'rgba(100,200,255,0.25)'; }, 250);
          return;
        }
        hit = true;
        score++;
        zone.style.background = 'rgba(100,255,100,0.4)';
        if (score >= total) { setTimeout(() => { document.querySelectorAll('.rhythm-zone').forEach(z => z.remove()); payout(score, total); }, 200); }
      };
      zone.className = 'rhythm-zone';
      document.body.appendChild(zone);
    };
    for (let i = 0; i < total; i++) makeZone(i);
    setTimeout(() => { document.querySelectorAll('.rhythm-zone').forEach(z => z.remove()); if (score < total) payout(score, total); }, dur);
    return;
  }

  // randomPos: pulses appear away from the nugget, at a random 25–75vw / 25–70vh
  const pulsePos = () => p.randomPos
    ? `left:${25 + Math.random() * 50}vw;top:${25 + Math.random() * 45}vh;`
    : 'left:50%;top:50%;';

  // Numa Numa Dance — click in time with a fixed-tempo pulse, inside a short hit window
  if (p.bpm) {
    const total = p.beats || 6;
    const period = dur / total;
    const windowMs = p.hitWindow ? p.hitWindow * 1000 : period * 0.85;
    let score = 0;
    for (let i = 0; i < total; i++) {
      const t = i * period;
      setTimeout(() => {
        const pulse = document.createElement('div');
        pulse.style.cssText = `position:fixed;${pulsePos()}transform:translate(-50%,-50%) scale(1);width:120px;height:120px;border-radius:50%;background:rgba(255,200,50,0.7);cursor:pointer;z-index:600;transition:transform 0.15s,opacity 0.15s;display:flex;align-items:center;justify-content:center;font-size:2.5rem;`;
        pulse.textContent = '🎵';
        let clicked = false;
        pulse.onclick = () => {
          if (clicked) return;
          clicked = true;
          score++;
          pulse.style.transform = 'translate(-50%,-50%) scale(1.4)';
          pulse.style.opacity = '0';
          setTimeout(() => pulse.remove(), 150);
          if (score >= total) payout(score, total);
        };
        document.body.appendChild(pulse);
        setTimeout(() => { if (!clicked) { pulse.remove(); } }, windowMs);
      }, t);
    }
    setTimeout(() => { if (score < total) payout(score, total); }, dur + 200);
    return;
  }

  // Just Do It (Shia) — accelerating BPM, 8 beats, each hit pays its share
  if (p.accelerating) {
    const total = p.beats || 8;
    let score = 0, fired = 0;
    const scheduleNext = (delay) => {
      if (fired >= total) return;
      const beat = fired;
      fired++;
      setTimeout(() => {
        const pulse = document.createElement('div');
        const scale = 1 + beat / total * 0.5;
        pulse.style.cssText = `position:fixed;${pulsePos()}transform:translate(-50%,-50%) scale(${scale});width:110px;height:110px;border-radius:50%;background:rgba(255,80,30,0.8);cursor:pointer;z-index:600;transition:transform 0.1s,opacity 0.1s;display:flex;align-items:center;justify-content:center;font-size:2rem;`;
        pulse.textContent = '💥';
        let clicked = false;
        pulse.onclick = () => {
          if (clicked) return;
          clicked = true;
          score++;
          pulse.style.opacity = '0';
          setTimeout(() => pulse.remove(), 100);
          if (score >= total) payout(score, total);
        };
        document.body.appendChild(pulse);
        const nextDelay = delay * 0.78;
        scheduleNext(nextDelay);
        setTimeout(() => { if (!clicked) pulse.remove(); }, delay * 0.8);
      }, delay);
    };
    scheduleNext(dur / total * 1.6);
    setTimeout(() => { if (score < total) payout(score, total); }, dur + 500);
    return;
  }

  // Fallback: generic timed prompts
  const total = p.beats || p.zones || 4;
  let score = 0;
  for (let i = 0; i < total; i++) {
    setTimeout(() => {
      const prompt = document.createElement('div');
      prompt.style.cssText = 'position:fixed;left:50%;top:60%;transform:translate(-50%,-50%);font-size:4rem;cursor:pointer;z-index:600;animation:burnToast 1.2s ease-out forwards;';
      prompt.textContent = '🎯';
      prompt.onclick = () => {
        score++;
        prompt.textContent = '✨';
        setTimeout(() => prompt.remove(), 200);
        if (score >= total) payout(score, total);
      };
      document.body.appendChild(prompt);
      setTimeout(() => { if (prompt.parentNode) prompt.remove(); }, dur / total);
    }, i * (dur / total));
  }
  setTimeout(() => { if (score < total) payout(score, total); }, dur + 200);
}

// ============================================================
// BOSS-THREAT SYSTEM (Skibidi)
// ============================================================
const $bossOverlay = document.getElementById('boss-overlay');
const $bossSprite = document.getElementById('boss-sprite');
const $bossDrain = document.getElementById('boss-drain');
const $bossFill = document.getElementById('boss-progress-fill');

function startBossFight() {
  const bs = getBinderStats();
  G.boss = {
    active: true,
    drainAccumPct: 0,
    defeatClicks: [],
    drainMult: bs.drainMult || 1,
    lastInteract: Date.now(),
  };
  $bossOverlay.classList.add('active');
  renderBurnBar();   // nugget-only burns are blocked during the boss
  sfxRand(S.toilet, 0.8);
  log('🚽 <span>SKIBIDI TOILET ATTACK!</span> Click frantically to defeat!');
}

function endBossFight(victory) {
  if (!G.boss) return;
  G.boss.active = false;
  $bossOverlay.classList.remove('active');
  if (victory) {
    const reward = computeBaseEAS() * BAL.BOSS_REWARD_SECONDS;
    G.aura += reward;
    showBurnToast('SKIBIDI DEFEATED!');
    log(`🏆 <span>Skibidi defeated!</span> +${fmt(reward)} aura.`);
    // Ohio Boss: defeating the Skibidi Toilet in Ohio drops bonus Kek Koins
    const fp = getFieldParams();
    if (fp.kekBossReward) {
      awardKek(fp.kekBossReward);
      log(`👑 <span>Ohio Boss bonus: +${fp.kekBossReward} Kek Koins!</span>`);
    }
  } else {
    log(`💩 Skibidi escaped with ${(G.boss.drainAccumPct * 100).toFixed(0)}% of your aura.`);
  }
  G.boss = null;
  renderBurnBar();
}

$bossSprite.addEventListener('click', () => {
  if (!G.boss || !G.boss.active) return;
  const now = Date.now();
  G.boss.defeatClicks.push(now);
  G.boss.lastInteract = now;
  G.boss.defeatClicks = G.boss.defeatClicks.filter(t => now - t < BAL.BOSS_DEFEAT_WINDOW_S * 1000);
  $bossSprite.style.transform = 'scale(0.9)';
  setTimeout(() => { $bossSprite.style.transform = ''; }, 80);
  const progress = Math.min(1, G.boss.defeatClicks.length / BAL.BOSS_CLICKS_TO_DEFEAT);
  $bossFill.style.width = (progress * 100) + '%';
  if (G.boss.defeatClicks.length >= BAL.BOSS_CLICKS_TO_DEFEAT) {
    endBossFight(true);
  }
});

function tickBoss(dt) {
  if (!G.boss || !G.boss.active) return;
  const now = Date.now();
  // Have You Ever Had A Dream: drain (and the AFK clock) frozen
  if (G.bossPauseTimer > 0) {
    G.boss.lastInteract = now;
    $bossDrain.textContent = `DRAIN: ${(G.boss.drainAccumPct * 100).toFixed(1)}% (FROZEN)`;
    return;
  }
  // Auto-resolve if player AFK
  if (now - G.boss.lastInteract > BAL.BOSS_AUTO_RESOLVE_IDLE_S * 1000 && G.boss.defeatClicks.length === 0) {
    endBossFight(false);
    return;
  }
  const drainPct = BAL.BOSS_DRAIN_PCT_PER_SEC * G.boss.drainMult;
  const stillRoom = BAL.BOSS_DRAIN_CAP - G.boss.drainAccumPct;
  if (stillRoom <= 0) {
    endBossFight(false);
    return;
  }
  const tickDrain = Math.min(stillRoom, drainPct * dt);
  G.boss.drainAccumPct += tickDrain;
  G.aura = Math.max(0, G.aura - G.aura * tickDrain / Math.max(0.01, 1 - G.boss.drainAccumPct + tickDrain));
  $bossDrain.textContent = `DRAIN: ${(G.boss.drainAccumPct * 100).toFixed(1)}%`;
}

// --- Save / Load ---
const SAVE_KEY = 'brain_rot_save';

function saveGame() {
  const payload = {
    aura: G.aura,
    totalClicks: G.totalClicks,
    owned: G.owned,
    auraPerClick: G.auraPerClick,
    auraPerSecond: G.auraPerSecond,
    allAuraMult: G.allAuraMult,
    cardShopUnlocked: G.cardShopUnlocked,
    packsPurchased: G.packsPurchased,
    collection: G.collection,
    binderSlots: G.binderSlots,
    fieldSlot: G.fieldSlot,
    brainMinutes: G.brainMinutes,
    moodIndex: G.moodIndex,
    moodTimer: G.moodTimer,
    kekCoins: G.kekCoins,
    clicksSinceLastKek: G.clicksSinceLastKek,
    totalKekEarned: G.totalKekEarned,
    kekDoubleCount: G.kekDoubleCount,
    fireLevel: G.fireLevel,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); }
  catch (e) { console.warn('Save failed:', e); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.aura !== undefined) G.aura = d.aura;
    if (d.totalClicks !== undefined) G.totalClicks = d.totalClicks;
    if (d.owned) Object.assign(G.owned, d.owned);
    if (d.auraPerClick !== undefined) G.auraPerClick = d.auraPerClick;
    if (d.auraPerSecond !== undefined) G.auraPerSecond = d.auraPerSecond;
    if (d.allAuraMult !== undefined) G.allAuraMult = d.allAuraMult;
    if (d.cardShopUnlocked !== undefined) G.cardShopUnlocked = d.cardShopUnlocked;
    if (d.packsPurchased !== undefined) G.packsPurchased = d.packsPurchased;

    // Card data migration — drop any references to IDs not in current CARD_LIBRARY
    const validIds = new Set(CARD_LIBRARY.map(c => c.id));
    if (d.collection) {
      G.collection = {};
      for (const k of Object.keys(d.collection)) {
        if (validIds.has(k)) G.collection[k] = d.collection[k];
      }
    }
    // Always normalize binderSlots to current size; drop dead IDs.
    G.binderSlots = new Array(BAL.BINDER_SLOTS).fill(null);
    if (d.binderSlots && Array.isArray(d.binderSlots)) {
      for (let i = 0; i < Math.min(d.binderSlots.length, BAL.BINDER_SLOTS); i++) {
        const id = d.binderSlots[i];
        if (id && validIds.has(id)) G.binderSlots[i] = id;
      }
    }
    if (d.fieldSlot && validIds.has(d.fieldSlot)) G.fieldSlot = d.fieldSlot;
    if (d.moodIndex !== undefined) G.moodIndex = d.moodIndex;
    if (d.moodTimer !== undefined) G.moodTimer = d.moodTimer;
    if (d.brainMinutes !== undefined) G.brainMinutes = d.brainMinutes;
    // Migration: old saves stored a wall-clock start time; count it as at most 30 minutes
    else if (d.scalingStartTime) G.brainMinutes = Math.min(30, (Date.now() - d.scalingStartTime) / 60000);
    if (d.kekCoins !== undefined) G.kekCoins = d.kekCoins;
    if (d.clicksSinceLastKek !== undefined) G.clicksSinceLastKek = d.clicksSinceLastKek;
    if (d.totalKekEarned !== undefined) G.totalKekEarned = d.totalKekEarned;
    if (d.kekDoubleCount !== undefined) G.kekDoubleCount = d.kekDoubleCount;
    if (d.fireLevel !== undefined && G.fieldSlot === 'f5') G.fireLevel = d.fireLevel;
    G.lastIdleClickTime = Date.now();   // First World Problems: idle time counts from load
    applyNuggetTransform();             // Big Chungus

    log('💾 <span>Save loaded!</span>');
  } catch (e) { console.warn('Save data corrupted, starting fresh:', e); }
}

function manualSave() {
  saveGame();
  const toast = document.getElementById('save-toast');
  toast.classList.add('visible');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('visible'), 2500);
}

// Auto-save every 60 seconds, and when the tab is closed or hidden
let _wipingSave = false;
setInterval(saveGame, 60000);
window.addEventListener('pagehide', () => { if (!_wipingSave) saveGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !_wipingSave) saveGame(); });

// --- New Game ---
function openNewGameConfirm() {
  document.getElementById('new-game-overlay').classList.add('active');
}
function closeNewGameConfirm() {
  document.getElementById('new-game-overlay').classList.remove('active');
}
function confirmNewGame() {
  _wipingSave = true;   // stop the pagehide save from writing the old game back
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

// Debug cheats only work once the dev menu is unlocked (click ACTIVE BINDER 5×),
// so players can't trigger them by accident.
function devCheatsEnabled() {
  const btn = document.getElementById('dev-menu-btn');
  return !!btn && btn.style.display !== 'none';
}

// --- Debug cheat: click SAUCES tab 5× quickly → +1M aura ---
(() => {
  let _clicks = 0, _timer = null;
  document.getElementById('tab-sauces').addEventListener('click', () => {
    if (!devCheatsEnabled()) return;
    _clicks++;
    clearTimeout(_timer);
    if (_clicks >= 5) {
      G.aura += 1_000_000;
      _clicks = 0;
      log('🧪 <span>DEBUG: +1M Aura</span>');
    } else {
      _timer = setTimeout(() => { _clicks = 0; }, 2000);
    }
  });
})();

// --- Init ---
spawnSkulls();
loadGame();          // restore save before building UI
buildShop();         // uses restored G.owned
updateUI();
updateCardShopUI();  // shows binder panel if cardShopUnlocked was saved
updateBinderSlotsUI();
applyFieldTheme();   // restore Field theme from save
renderBurnBar();     // show burn inventory if shop already unlocked
gameLoop();
