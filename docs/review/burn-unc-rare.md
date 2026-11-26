# R3 — Burn Uncommon & Rare review

Reviewer R3. Scope: bu_u1–bu_u13, bu_r1–bu_r7 (20 cards). Read-only review of `game.js` on `main` at `e84fc53` (includes the cleanup PR `8a99ecb`). All line numbers refer to that commit.

Every number below is hand math from the reference states. `tools/card-sim.js` appeared at the end of the review and was run as a cross-check. Its APS/APC/EAS values and every per-card EAS and Kek value in scope match the hand math to rounding (e.g. Surgery 5/14/11, Cena 12/33/25, OAG 10/28/21 plus 81/45 Kek, Shia 546/330, Kermit EV 900).

The one difference is pack cost. The sim prices "pack #10" as 18 and "#30" as 48 (`packsPurchased` = 9 and 29), while this file uses 20 and 50 (`packsPurchased` = 10 and 30). Kek percentages here are therefore about 10% lower than the sim's. The flags do not change.

The sim scores chase cards with the literal 90%/50% clear chance. I give realistic estimates next to those where a card is clearly easier (Leroy, Ugandan) or harder (Britney, End of Ze World, Gabe).

---

## 0. Reference numbers used

From `UPGRADES` (game.js:95–101) and `buyUpgrade` (game.js:1350–1358). Base APC = 1, base mult = 1.0. No binder or field cards.

| State | APS | APC | Mult | `computeEAS()` (game.js:1740) | Click value (APC × mult) | Click value ÷ EAS |
|-------|-----|-----|------|------------------------------|--------------------------|-------------------|
| Early (10/2/0/0/0) | 40 | 1 | 1.0 | **40** | 1 | 0.025 |
| Mid (40/20/5/2/0) | 740 | 51 | 1.0 | **740** | 51 | 0.069 |
| Late (80/50/20/15/3) | 3,830 | 201 | 2.5 | **9,575** | 502.5 | 0.052 |

**Kek income from clicking** (game.js:1278–1284): the pity drop comes every 30 clicks, plus a 1% chance per click, and the counter resets on any drop. Expected clicks per drop = Σ₀²⁹ 0.99ᵏ ≈ 26.0. At 6 clicks/sec that is **≈13.8 Kek/min**, assuming every 3D coin is collected.

**Pack cost** (game.js:681–685) = 5 + floor(1.5 × packsPurchased). That is **20 Kek** at pack #10 and **50 Kek** at pack #30.

**Kek budget (plan 3.3).** Common ≤ ¼ pack, Uncommon ≤ ½ pack (10 Kek at #10, 25 at #30), Rare ≤ 1 pack (20 at #10, 50 at #30).

**How skill is scored.** For cards with a per-hit score (rhythm, coin rain, precision), "skilled / casual" means a 90% / 50% hit rate. For all-or-nothing chase cards it means a 90% / 50% chance of clearing, and I add my own realistic estimate where the card is clearly easier or harder than that.

**Precision value** is the net gain over normal clicking at 6 clicks/sec: (hits × mult + paid misses − normal clicks) × click value. On Surgery and Cena a miss is not a nugget click at all. On OAG a miss still pays 1×.

### Cleanup-PR fixes verified (not re-reported)
- **Arthur Fist `doubleNext`:** now works. It is set at game.js:1893 and used up in `doClick` at game.js:1248–1252.
- **OAG `deadCenterOnly`:** now works. A click counts only within 0.15 × nugget width of the centre (game.js:1237–1246), and Kek is paid only on hits (game.js:1258).
- **Woman Yelling:** the activating click is deferred (game.js:2810), and each prompt now finishes exactly once (`done` flag, game.js:2795–2805).
- **Zombie Kid Turtle:** the regen loop stops once the target is gone (game.js:2697).
- **Rhythm payouts by rarity:** each card now pays its own rarity budget (game.js:2770). Shia now pays the Rare budget (600).
- **Click buffs:** a weaker click buff no longer lowers a stronger one (TEMP_CLICK_MULT game.js:1902–1907, PRECISION game.js:2174).
- **Gabe multi-copy:** still linear, as the plan says it should stay for this PR (game.js:2259–2265). It is reported below as a text and exploit issue for B1.

---

## 1. Uncommons

### MLG Airhorn (bu_u1) — Burn / uncommon / INSTANT_BURST
- **Says (desc):** "screen shakes and you get 120 seconds of Aura all at once".
- **Says (cards.csv):** matches desc (cards.csv:46).
- **Does (code):** the standard flat burst pays `computeBaseEAS() × 120` (game.js:1884–1886), and `shake` plays `bossShake` 6× for 2s (game.js:1888–1891).
- **Params read / unread:** all read.
- **Payout:** 120 EAS at every state (4.8k / 88.8k / 1.15M Aura). Kek 0.
- **Skill/friction:** none.
- **Interactions:** reads base EAS, so Rickroll does not boost it (Rule 0.1 ✓). Not multi-copy.
- **Flags:** **Dom** (by Arthur Fist), **C**.
- **Fix:** give MLG its own activation hook, or 150–180 EAS so it is the "biggest plain burst" at uncommon. Otherwise it is Arthur Fist minus the extras.

### Arthur Fist (bu_u2) — Burn / uncommon / INSTANT_BURST
- **Says:** 120s of Aura, next click ×2, +2 Kek every time.
- **Says (cards.csv):** matches (cards.csv:47).
- **Does:** 120 × base EAS (game.js:1884), sets `doubleNextClick` (game.js:1893), adds 2 Kek directly (game.js:1895–1900). The ×2 is applied in `doClick` (game.js:1248).
- **Params read / unread:** all read ✓ (cleanup PR).
- **Payout:** 120 EAS, plus the double click (+0.025 / +0.069 / +0.052 EAS, which is nothing unless a 100× Gyatt is running), plus **2 Kek** (0.14 min of Kek income; 10% of pack #10, 4% of pack #30).
- **Skill/friction:** none.
- **Interactions:** the ×2 also stacks with frenzy, crits and the Distracted Boyfriend echo. Burn Kek is added directly, so it skips `kekDoubleCount`, the "Kek worth 2×" buff (only 3D coins check it, game.js:2405).
- **Flags:** OK (within budget). It is what makes MLG **Dom**.
- **Fix:** none for Arthur. Fix MLG instead.

### Ugandan Knuckles (bu_u3) — Burn / uncommon / TARGET_CHASE
- **Says:** "Click all 8 Knuckles **swarming** the screen within 10s — 180 Aura total".
- **Says (cards.csv):** matches (cards.csv:48).
- **Does:** one target at a time. The next spawns only after the previous dies (game.js:2737–2738). Pays nothing unless all 8 die within 10s (game.js:2716, 2758–2761). The reward is frozen at activation as `computeEAS() × 180` (game.js:2680), which is **live** EAS.
- **Params read / unread:** all read.
- **Payout:** 180 if cleared. EV skilled 162 / casual 90. Realistic about 95%, since 1.25s per slow target is easy. Kek 0.
- **Skill/friction:** chase. Targets drift at ≤3 px/frame (game.js:2682).
- **Interactions:** **Rickroll ×3** (reads live EAS). A Leroy or Britney timeout wipes these targets (see BUG under Leroy).
- **Flags:** **TXT** (sequential, not a swarm). **X-combo** (Rickroll).
- **Fix:** spawn all 8 at once (this is what makes it the "swarm" target), and switch the reward to `computeBaseEAS()`.

### Woman Yelling at Cat (bu_u4) — Burn / uncommon / RHYTHM (spatial)
- **Says:** click the side the arrow shows, 4 times in 10s, "for **up to 6×** Aura".
- **Says (cards.csv):** matches (cards.csv:49).
- **Does:** shows 4 random left/right prompts. Each lasts 2.5s (game.js:2807), and **any** click anywhere on the document answers it (game.js:2800–2806). Payout = `baseEAS × 120 × (1 + s/4 × 5) / 6` (game.js:2770–2776).
- **Params read / unread:** all read. `maxMult` only sets the floor (1/6 of budget). The player never sees a "6×".
- **Payout:** perfect 120 / skilled 110 / casual 70 / zero hits 20 EAS. The same at every state.
- **Skill/friction:** reaction (a simple binary choice, 2.5s each).
- **Interactions:** reads base EAS ✓. Because it listens on the whole document, a click on the shop, tabs or a Kek coin also answers the prompt. A coin click is swallowed in the capture phase (game.js:1210–1212), so that prompt times out instead.
- **Flags:** **TXT** ("up to 6×" means nothing). **C** in outcome with Keyboard Cat and Numa (all three pay 120 for a perfect run).
- **Fix:** rewrite the text as "up to 120s of Aura". Raise all rhythm uncommons into the band (150–180) and make them differ in payout shape, not just presentation.

### Leave Britney Alone (bu_u5) — Burn / uncommon / TARGET_CHASE (armor + mover)
- **Says:** one target, 8 HP, 6s, 180 Aura, keeps moving.
- **Says (cards.csv):** matches (cards.csv:50).
- **Does:** 1 target, `hp:8`, speed **8 px per animation frame** (game.js:2682, 2745–2754). Pays 180 × live EAS on kill, or nothing.
- **Params read / unread:** all read.
- **Payout:** 180 if cleared. EV skilled 162 / casual 90 by formula. Realistic estimate is lower: about 60–70% skilled and 20–30% casual, because it moves up to ~480 px/s per axis at 60 Hz. Kek 0.
- **Skill/friction:** hard chase.
- **Interactions:** Rickroll ×3. **Speed depends on frame rate**: the movement step is per frame, not per `dt`, so on a 120/144 Hz monitor she moves 2–2.4× faster. Same 3-px step for every chase target.
- **Flags:** **BUG** (frame-rate-dependent difficulty, all TARGET_CHASE). **X-combo** (Rickroll). Not a clone of Zombie any more (that card now pays Kek and regens) ✓.
- **Fix:** scale the movement step by `dt`, and give Britney the +50% hard-skill premium (≈220–270 EAS) or lower her HP to 6.

### Surgery on a Grape (bu_u6) — Burn / uncommon / PRECISION (shrinking)
- **Says:** the nugget shrinks, click precisely for 10s, "up to 5×".
- **Says (cards.csv):** matches (cards.csv:51).
- **Does:** click mult = max(current, 5) for 10s (game.js:2174–2176). The nugget container is scaled to 0.35, or 0.55 with Big Chungus (game.js:2184–2188), and restored after 10s (game.js:2189).
- **Params read / unread:** all read.
- **Payout (net vs normal clicking, 60 clicks):** skilled 210 click values / casual 90.
  - Early **5.3 / 2.3 EAS**
  - Mid **14.5 / 6.2**
  - Late **11.0 / 4.7**
  - That is ≈4–10% of the uncommon budget. With frenzy (≥7 clicks/sec) it is about 10× while frenzy lasts, which still leaves it under budget at Mid.
- **Skill/friction:** precision.
- **Interactions:** dead during a boss fight (the boss overlay, z 400 with pointer events, covers the nugget at z 50: index.html:1402–1416, 160–169). Also dead off the SAUCES tab (game.js:1220).
  - **BUG:** `orig` is captured when the card is activated (game.js:2181). A second Surgery, or a John Cena, activated while the first is running captures the *shrunk* transform and puts it back later, so **the nugget stays shrunk until reload**. Cena's restore also writes `transform` (game.js:2189).
- **Flags:** **BUG**, **D** (boss, other tab), P1 budget (way under).
- **Fix:** pay precision hits in EAS (e.g. 2.5 EAS per hit, capped at 180), and restore the transform to a constant (`''`) instead of the captured `orig`.

### Chocolate Rain (bu_u7) — Burn / uncommon / COIN_RAIN (fall, Aura + Kek)
- **Says:** 20 drops over 8s; every 4th is a Kek Koin, the rest give Aura.
- **Says (cards.csv):** matches (cards.csv:52).
- **Does:** spawns 20 drops, one every 0.4s. Drops with i+1 ≡ 0 (mod 4) become `spawnBurnKekCoin()` worth 1 Kek each, 5 in total (game.js:2082–2092, 2537–2563). The other 15 drops are `spawnBurnCoin(9)`, which pays `computeEAS() × 9` **when collected** (game.js:2651–2660).
- **Params read / unread:** all read.
- **Payout:** perfect **135 EAS + 5 Kek**. Skilled 121.5 + 4.5. Casual 67.5 + 2.5.
  - 5 Kek = 0.36 min of Kek income; 25% of pack #10, 10% of pack #30.
- **Skill/friction:** click falling coins (3–5s fall).
- **Interactions:** Rickroll ×3 on the Aura drops (live EAS). Disaster Girl's sweep can collect these drops. Burn Kek skips `kekDoubleCount`.
- **Flags:** OK on each axis alone. Rule 0.8 split: 135/150 of the Aura budget + 5/10 of the Kek budget ≈ 1.4 budgets. Slightly rich. **X-combo** (Rickroll).
- **Fix:** keep it; consider 8 EAS per drop. Switch to `computeBaseEAS()`.

### Zombie Kid Turtle (bu_u8) — Burn / uncommon / TARGET_CHASE (armor + regen, Kek)
- **Says:** 5 hits within 5s pays 8 Kek; it regens 1 HP after a 1.5s pause.
- **Says (cards.csv):** matches (cards.csv:53).
- **Does:** as stated. Aura reward = 0 (game.js:2680). Pays 8 Kek on kill (game.js:2717–2723). Regen timer at game.js:2692–2706.
- **Params read / unread:** all read.
- **Payout:** 0 EAS. **8 Kek** (skilled EV 7.2, casual 4; realistic ≈98%, since 5 clicks on a slow target take under 1.5s, so regen almost never fires). 8 Kek = 0.58 min of Kek income; 40% of pack #10, 16% of pack #30. Within the uncommon Kek budget.
- **Skill/friction:** light chase.
- **Interactions:** the Rickroll ×3 does nothing to it (it pays Kek). Frame-rate-dependent drift is minor at speed 3.
- **Flags:** OK. Regen is close to irrelevant flavour.
- **Fix (optional):** regenDelay 0.6s, or hp 8, so the regen mechanic actually matters.

### Keyboard Cat (bu_u9) — Burn / uncommon / RHYTHM ("pitch" = ascending zones)
- **Says:** click 5 zones, each higher than the last, in 8s, "up to 6×".
- **Says (cards.csv):** matches (cards.csv:54).
- **Does:** all 5 zones appear at once as full-width bars (game.js:2819–2843). Only an in-order click scores, and a wrong click has no penalty (game.js:2828–2832). Pays as soon as all 5 are hit, otherwise at 8s.
- **Params read / unread:** all read. "6×" is only the floor, as with Woman Yelling.
- **Payout:** perfect 120 / skilled 110 / casual 70 / zero 20 EAS. Realistic play is ~100%: there is no time or rhythm pressure, just 5 clicks bottom to top within 8s.
- **Skill/friction:** almost none.
- **Interactions:** reads base EAS ✓. The bars sit at z 600 across 90% of the width, so one of them can cover the nugget for up to 8s.
- **Flags:** **TXT** ("6×"). **C** (outcome identical to Woman Yelling and Numa). Effectively a guaranteed 120 EAS.
- **Fix:** add a per-zone timing window (zones light up one at a time) or a wrong-click penalty, then pay 150.

### Numa Numa Dance (bu_u10) — Burn / uncommon / RHYTHM (BPM)
- **Says:** click "in time with the rhythm" 6 times in 10s, "up to 5×".
- **Says (cards.csv):** matches (cards.csv:55).
- **Does:** shows 6 big 120px pulses at screen centre, one every 1.67s. Each is visible for 1.42s, and any click while it is visible scores (game.js:2847–2873). There is **no timing judgement**.
- **Params read / unread:** all read.
- **Payout:** perfect 120 / skilled 110.4 / casual 72 / zero 24 EAS.
- **Skill/friction:** none. The pulse sits on top of the nugget, so normal clicking at the centre hits every pulse.
- **Interactions:** reads base EAS ✓. Mash-clicking the centre also feeds frenzy, and normal click income keeps flowing between pulses.
- **Flags:** **TXT** (no rhythm), **C**.
- **Fix:** score by distance to the beat (e.g. ±150ms = perfect), or shrink the visible window to about 0.4s.

### Shooting Stars (bu_u11) — Burn / uncommon / COIN_RAIN (streak, Aura)
- **Says:** 15 neon stars left to right over 8s, 12 Aura each.
- **Says (cards.csv):** matches (cards.csv:56), except it says "12 Aura" when it means 12 *seconds of income*.
- **Does:** 15 stars, one every 0.53s. Each crosses the screen in `dur/total×3` = **1.6s** (game.js:2055–2079). Pays `computeEAS() × 12` per star.
- **Params read / unread:** all read.
- **Payout:** perfect **180** / skilled 162 / casual 90 EAS. Kek 0.
- **Skill/friction:** fast tracking (1.6s crossing).
- **Interactions:** Rickroll ×3.
- **Flags:** OK on budget. **TXT** (minor: "Aura" vs seconds). **X-combo**. Now differs from Chocolate Rain (fall, Aura + Kek) and Gabe (Kek) by reward type ✓.
- **Fix:** switch to `computeBaseEAS()` and say "12s of Aura".

### Rickroll (bu_u12) — Burn / uncommon / TEMP_APS_MULT
- **Says:** 3× Aura/sec for 60s.
- **Says (cards.csv):** matches (cards.csv:57).
- **Does:** sets `apsMultValue = 3` and `apsMultTimer = 60`, **unconditionally** (game.js:1908–1913). The ticker applies it (game.js:1561–1563).
- **Params read / unread:** `fakeCrash` is **unread (NOOP)**: no fake crash.
- **Payout:** +2 × EAS × 60 = **+120 EAS** of extra income (4.8k / 88.8k / 1.15M Aura). Delayed over 60s.
- **Skill/friction:** none (idle-friendly).
- **Interactions (most important):**
  - `computeEAS()` includes `apsMultTimer` (game.js:1743). So while Rickroll runs, every live-EAS payout is **×3**: TARGET_CHASE (game.js:2680), COIN_RAIN (game.js:1985, 2013, 2041, 2068, 2660), SCREEN_GAG (game.js:2193), TIMED_DROP binders (game.js:1630) and the boss reward (game.js:2956).
  - **Rickroll + Leroy = 2,700 EAS. Rickroll + End of Ze World = 2,700 EAS + 10 Kek.** Rule 0.1 is fixed for INSTANT_BURST, GAMBLE and RHYTHM only.
  - **Downgrade bug:** playing Charlie Bit My Finger or Have You Ever Had A Dream (1.5× / 20s) during Rickroll *replaces* 3× with 1.5× and resets the timer to 20s. The cleanup PR fixed this for click buffs only.
- **Flags:** **NOOP** (fakeCrash), **X** (combo with live-EAS burns), **BUG** (APS buff downgrade).
- **Fix:** route every burn payout through `computeBaseEAS()`, and use `apsMultValue = max(cur, p.mult)` with `timer = max(...)`, as TEMP_CLICK_MULT does.
- **vs MLG Airhorn:** both are worth 120 EAS. Rickroll's arrives over 60s, but it also triples any chase or rain card played in that window. So Rickroll is strictly the better uncommon pick, and MLG is dominated twice.

### Gabe the Dog (bu_u13) — Burn / uncommon / COIN_RAIN (bones, Kek)
- **Says:** catch ALL 25 bones for 10 Kek; "Stack copies for **exponential** payout!"
- **Says (cards.csv):** matches (cards.csv:58).
- **Does (single use):** 25 bones, one every 0.4s, each crossing in 10s (slow) (game.js:1921–1958, index.html:1192). Pays 10 Kek only if `caught >= 25` (game.js:1937). Otherwise nothing.
- **Does (multi-copy):** "Use All" pays `10 × N` Kek **instantly, with no minigame** (game.js:2259–2265). That is **linear**, while the button tooltip promises `2^N − 1`× (game.js:1787) and the desc says exponential.
- **Params read / unread:** `multiKekBonus` is only a flag. `rewardApcBuff` / `buffDuration` branch (game.js:1945–1951) is dead code for this card.
- **Payout (single):** 0 EAS. Kek: P(all 25) = h²⁵.
  - Skilled per-bone 90% gives 7% → EV 0.7 Kek. At 98% per bone it is 60% → EV 6 Kek.
  - Casual ≈ 0.
  - Best case 10 Kek = 0.72 min of income; 50% of pack #10, 20% of pack #30.
- **Payout (multi):** N=2 gives 20 Kek; N=3 (the D1 cap) gives 30 Kek, which is **1.5 packs at #10**, over the uncommon budget, with zero skill. Uncapped, 10 copies give 100 Kek.
- **Skill/friction:** chase, all-or-nothing on 25 bones.
- **Interactions:** Disaster Girl's sweep can click bones for you (game.js:2161–2167 uses `.burn-coin`). Kek skips `kekDoubleCount`.
- **Flags:** **TXT** (exponential vs linear; the tooltip number is wrong). **X** (multi skips the minigame). **K** (multi). **Dom** by Zombie Kid Turtle as a single use (8 Kek almost guaranteed vs 10 Kek all-or-nothing).
- **Fix:** pay 0.4 Kek per bone, rounded (10 for a full catch), so single use is fair. Run the minigame once for multi-copy, pay `kekReward × N` (capped at N=3) times the catch fraction, and fix the text and tooltip.

---

## 2. Rares

### John Cena (bu_r1) — Burn / rare / PRECISION (invisible)
- **Says:** the nugget is invisible; click where you think it is for 15s; 7× on a hit.
- **Says (cards.csv):** matches (cards.csv:59).
- **Does:** click mult = max(cur, 7) for 15s. The nugget opacity is set to 0.05 (game.js:2183). The nugget **never moves** from screen centre (index.html:160–165), so its position is always known and the constraint is close to cosmetic.
- **Params read / unread:** all read.
- **Payout (90 clicks):** skilled 477 click values / casual 225 (realistic ≈100% hits, 540).
  - Early **11.9 / 5.6 EAS**
  - Mid **32.9 / 15.5**
  - Late **25.0 / 11.8**
  - That is **≈2–5% of the rare budget** (600–900).
- **Skill/friction:** nominal.
- **Interactions:** dead during a boss fight or off the SAUCES tab. Caps at 10× when stacked with click buffs. **BUG:** its restore also writes `transform = orig` (game.js:2189), so after a Surgery it can leave the nugget shrunk. It can also cut OAG's Kek window short: it sets `kekPerHit=0` and `precisionCenterOnly=false` (game.js:2177–2178).
- **Flags:** **P1 far under budget**. **Dom** by OAG (OAG adds ~81 Kek for a similar Aura gain). Weak Rule 0.2 axis (invisible but static).
- **Fix:** move the invisible nugget (small random drift) and pay hits in EAS (e.g. 8 EAS per hit, capped at 900).

### Just Do It (Shia) (bu_r2) — Burn / rare / RHYTHM (accelerating)
- **Says:** 8 beats speeding up over 12s, "hit all 8 perfectly", "up to 10×".
- **Says (cards.csv):** matches (cards.csv:60).
- **Does:** shows 8 pulses at screen centre (game.js:2876–2906). The first comes at 2.4s, and each gap is ×0.78 of the last (2.4, 1.87, 1.46, 1.14, 0.89, 0.69, 0.54, 0.42s), so they appear at about 2.4 / 4.3 / 5.7 / 6.9 / 7.8 / 8.5 / 9.0 / 9.4s.
  - Each pulse stays visible for 0.8 × its own gap: from 1.92s for the first down to **0.34s** for the last.
  - "Up to 10×" is reachable: a perfect run pays the full 600 budget (game.js:2770).
- **Params read / unread:** all read.
- **Payout:** perfect 600 / skilled 546 / casual 330 / zero 60 EAS. The same at every state.
- **Skill/friction:** reaction, **but mashing the centre at 6 clicks/sec (167ms between clicks) catches every pulse**, since all are ≥337ms. A miss costs nothing, because the click falls through to the nugget.
- **Interactions:** reads base EAS ✓.
- **Flags:** **TXT** ("perfectly" and "10×" have no timing meaning). At the bottom of the rare band despite being the only rare with a real skill check, and that check can be beaten by mashing.
- **Fix:** move each pulse to a random position (stops mashing), then pay up to 900 (+50%) for a perfect run.

### Leroy Jenkins (bu_r3) — Burn / rare / TARGET_CHASE (timed)
- **Says:** a target "charges at you"; click it in 3s for 900 Aura.
- **Says (cards.csv):** matches (cards.csv:61).
- **Does:** 1 target, 1 HP, drifting at ≤3 px/frame like all the others (game.js:2682). There is no "charge". Pays `computeEAS() × 900` (live) on one click, within 3s.
- **Params read / unread:** all read.
- **Payout:** 900 EAS. Skilled 810 / casual 450 by formula; realistic ≈98% for anyone looking at the screen, i.e. **≈880 EAS**. That is the top of the rare band for one click.
- **Skill/friction:** one click.
- **Interactions:** **Rickroll ×3 = 2,700 EAS.**
  - **BUG:** its 3s timeout runs `$burnFx.querySelectorAll('.burn-target').forEach(remove)` (game.js:2759). That removes the targets of **any other chase card that is running** (Ugandan, Britney, Zombie, End of Ze World), and those cards then fail. Every chase card does this on its own timeout.
- **Flags:** **TXT** (minor), **X-combo**, **BUG** (cross-card target wipe). **Dom** over El Risitas (single use) and Kermit (same EV, no variance).
- **Fix:** keep 900 but make it a real "timed" card: spawn at the screen edge and rush across in about 1s, or drop to 750. Remove only this card's own targets on timeout, and pay with `computeBaseEAS()`.

### El Risitas (bu_r4) — Burn / rare / INSTANT_BURST (multi-copy)
- **Says:** 600s of income; 2 copies = 1800s, 3 copies = 4200s.
- **Says (cards.csv):** matches (cards.csv:62).
- **Does:** single use pays `computeBaseEAS() × 600` (game.js:1884). "Use All" pays `computeBaseEAS() × 600 × (2^N − 1)` and consumes **all** copies (game.js:2238–2275).
- **Params read / unread:** `shake: 'violent'` is treated as plain truthy: a single use shakes exactly like MLG (game.js:1888), and only multi-copy shakes longer (game.js:2271).
- **Payout:** single **600 EAS** (24k / 444k / 5.75M Aura).
  - Multi: N=2 → 1,800; N=3 → **4,200** (D1 cap); N=5 → 18,600; N=10 → **613,800 EAS** (uncapped today).
- **Skill/friction:** none.
- **Interactions:** reads base EAS, so Rickroll does not boost it (combo 1 passes ✓). Copies are uncapped. `BURN_INVENTORY_CAP` (game.js:19, 1781) limits how many *card types* are shown, not copies, and can hide the card entirely once more than 10 Burn types are owned.
- **Flags:** **X** (until D1 lands). At the bottom of the rare band. **Dom** single use by Leroy.
- **Fix:** D1 (`n = min(n, 3)`, consume only 3). Even capped, holding 3 copies pays 2.33× more than using them one at a time (4,200 vs 1,800), which is fine as a deliberate "save up" card.

### End of Ze World (bu_r5) — Burn / rare / TARGET_CHASE (sequential mass)
- **Says:** "Click 25 missiles in 15s — 900 Aura **total**. Click EVERY SINGLE ONE and you **also** earn 10 Kek as a bonus for the perfect run".
- **Says (cards.csv):** matches (cards.csv:63).
- **Does:** 25 targets **one at a time** (game.js:2737–2738). The 900 × live EAS **and** the 10 Kek are both paid only when all 25 die (game.js:2716–2735). Missing one pays nothing, so the Kek is not a "bonus" on top of anything.
- **Params read / unread:** all read.
- **Payout:** full clear = **900 EAS + 10 Kek** (Kek = 0.72 min of income; 50% of pack #10, 20% of pack #30).
  - EV by formula: skilled 810 + 9 / casual 450 + 5.
  - Realistic: 0.6s per target, each spawning at a random spot (10–90vw, 15–80vh, game.js:2688–2689), is tight. Estimate ≈40–60% skilled and ≈5% casual, i.e. **EV ≈ 450 EAS skilled, ≈45 casual**.
- **Skill/friction:** hard chase, all-or-nothing.
- **Interactions:** Rickroll ×3 = 2,700 EAS + 10 Kek. Hit by the target-wipe BUG if Leroy, Ugandan, Britney or Zombie times out during the 15s. Rule 0.8: full Aura budget + half the Kek budget.
- **Flags:** **TXT** (all-or-nothing vs "total"/"bonus"), **X-combo**.
- **Fix:** pay 36 EAS per missile (900 for all 25) plus 10 Kek only on a perfect run, or spawn 3 at a time.

### Overly Attached GF (bu_r6) — Burn / rare / PRECISION (centre)
- **Says:** click only the very centre for 15s; centre clicks get 6× and 1 Kek each.
- **Says (cards.csv):** matches (cards.csv:64).
- **Does:** click mult = max(cur, 6) for 15s. Clicks within `0.15 × width` of the centre get the mult **and 1 Kek** (game.js:1237–1262). Off-centre clicks still land but at 1×.
- **Params read / unread:** all read ✓ (`deadCenterOnly` is wired now).
- **Payout (90 clicks):** Aura net, skilled 405 click values / casual 225:
  - Early **10.1 / 5.6 EAS**
  - Mid **27.9 / 15.5**
  - Late **21.3 / 11.8**
  - **Kek: skilled 81 / casual 45** at 6 clicks/sec; 135 at 10 clicks/sec; 150+ for a fast autoclicker. There is no cap.
  - 81 Kek = **5.9 min of income = 4.0 packs at #10, 1.6 packs at #30.** Over the rare Kek budget (1 pack) by 1.6–6.7×.
- **Skill/friction:** precision (a centre circle 30% of the width across). Keeping the cursor still is easy.
- **Interactions:**
  - Frenzy at ≥7 clicks/sec multiplies the Aura ×10 but not the Kek.
  - **Off-centre clicks divide by `G.clickMultValue`** (game.js:1243), which strips *every* active click buff (Star Wars Kid, Gyatt 100×), not just OAG's 6×.
  - Surgery or Cena played during the window resets `kekPerHit` to 0 and `precisionCenterOnly` to false (game.js:2176–2178), so the Kek window ends early.
  - Surgery played first shrinks the nugget, which makes the centre circle tiny.
  - Dead during a boss fight or off the SAUCES tab.
- **Flags:** **K** (P0-level: the largest Kek source in my scope), **X** (no cap per use), **BUG** (miss strips other buffs).
- **Fix:** cap at 15 Kek per use (`kekPerHitCap`, per sweep B1), and on a miss divide only by the precision mult.

### Evil Kermit (bu_r7) — Burn / rare / GAMBLE
- **Says:** 50/50; win "**1800 Aura**", lose nothing; "if you win it's bigger than El Risitas".
- **Says (cards.csv):** matches (cards.csv:65).
- **Does:** `Math.random() < 0.5` → `computeBaseEAS() × 1800` (game.js:2097–2107). That is 1800 *seconds of income*, not 1800 Aura.
- **Params read / unread:** all read.
- **Payout:** win 1,800 / lose 0, **EV 900 EAS** (Early 36k, Mid 666k, Late 8.6M on a win). No Kek.
- **Skill/friction:** none (luck).
- **Interactions:** base EAS, so Rickroll does not boost it ✓. Not multi-copy.
- **Flags:** **TXT** ("1800 Aura"; "bigger than El Risitas" is only true against a single copy: 2 copies = 1,800, 3 copies = 4,200).
- **Fix:** text "win 1800 seconds of Aura (3× El Risitas)", and keep 1800 (see §5).

---

## 3. Clone / differentiation check (Rule 0.2 axes)

| Archetype (axis) | Cards in scope | Axis position in code | Outcome | Verdict |
|---|---|---|---|---|
| INSTANT_BURST (activation hook) | MLG (bu_u1), Arthur (bu_u2), El Risitas (bu_r4) | MLG = instant; Arthur = instant + double click + Kek; Risitas = instant + multi-copy | 120 / 120+2K / 600 | **MLG and Arthur share a hook, and Arthur ⊃ MLG → MLG Dom.** Risitas differs (multi-copy) ✓ |
| TARGET_CHASE (juke / armor / swarm / timed) | Ugandan (swarm*), Britney (armor + speed), Zombie (armor + regen, Kek), Leroy (timed), End (mass*) | *Ugandan and End are both **sequential single targets**, not swarms. Leroy's "charge" is the standard drift | 180 / 180 / 8K / 900 / 900+10K | Britney vs Zombie **now differentiated** (speed vs regen, Aura vs Kek) ✓. **Ugandan and End are the same mechanic** at two sizes. No true swarm exists |
| RHYTHM (spatial / pitch / BPM / accelerating) | Woman Yelling (spatial), Keyboard Cat (ascending), Numa (BPM), Shia (accelerating) | Spatial ✓; ascending ✓ but no timing; BPM ✗ (no beat judgement); accelerating ✓ but can be beaten by mashing | All three uncommons: perfect 120, skilled ≈110, casual ≈70 | **C by outcome**: the presentation differs, the payout curve is the same. Numa fails its axis |
| COIN_RAIN (motion or reward type) | Chocolate Rain (fall, Aura + Kek), Shooting Stars (fast streak, Aura), Gabe (slow streak, Kek all-or-nothing) | Shooting Stars and Gabe share the `coinStreak` keyframe and lanes (index.html:1182–1195) but differ in speed (1.6s vs 10s) | 135+5K / 180 / 10K | **Differentiated by reward type now** ✓. The BALANCE_PLAN "all 180 EAS" clone is gone |
| PRECISION (invisible / center / shrinking / moving) | Surgery (shrinking), Cena (invisible), OAG (centre) | Shrinking ✓, centre ✓, invisible ✗ (static nugget, so trivial) | All pay ≈1/10–1/40 of their Aura budget; OAG adds 45–150 Kek | Axes OK except Cena. **Payout ladder is inverted**: Cena (weakest constraint) has the highest mult, and OAG gets the most total value through Kek |
| TEMP_APS_MULT | Rickroll | — | +120 EAS, plus ×3 on live-EAS burns | Unique in scope, but see the exploit |
| GAMBLE | Kermit | — | EV 900 | Unique |

---

## 4. Rarity curve vs budgets (Mid state, skilled unless noted)

Uncommon band 120–180 EAS (up to 270 with a real downside). Rare band 600–900 (up to 1,350). Kek column is % of the pack cost at pack #10 / #30.

| Card | Rarity | Aura EAS-eq (perfect / skilled / casual) | Kek per use (% pack #10 / #30) | vs budget |
|---|---|---|---|---|
| MLG Airhorn | U | 120 / 120 / 120 | — | band floor |
| Arthur Fist | U | 120 / 120 / 120 | 2 (10% / 4%) | in band |
| Ugandan Knuckles | U | 180 / 162 / 90 (realistic ≈170) | — | in band |
| Woman Yelling | U | 120 / 110 / 70 | — | **under** (skill card) |
| Leave Britney | U | 180 / 162 / 90 (realistic ≈110 / ≈45) | — | under for a hard skill check |
| Surgery on a Grape | U | — / **14.5** / 6.2 (Early 5.3, Late 11.0) | — | **≈10% of budget** |
| Chocolate Rain | U | 135 / 121.5 / 67.5 | 5 (25% / 10%) | in band; Aura + Kek split ≈1.4 budgets |
| Zombie Kid Turtle | U | 0 | 8 (40% / 16%) | Kek-only, in budget |
| Keyboard Cat | U | 120 / ≈120 / 70 | — | band floor, no skill |
| Numa Numa | U | 120 / 110 / 72 | — | band floor, no skill |
| Shooting Stars | U | 180 / 162 / 90 | — | in band |
| Rickroll | U | +120 (plus ×3 on chase/rain burns in the window) | — | in band alone; **combo up to 2,700** |
| Gabe the Dog | U | 0 | 10 if perfect, EV 0.7–6 (50% / 20%); multi ×3 = 30 (150% / 60%) | single under, **multi over** |
| John Cena | R | — / **32.9** / 15.5 (Early 11.9, Late 25.0) | — | **≈4% of budget** |
| Shia | R | 600 / 546 / 330 | — | band floor (could be 900+) |
| Leroy Jenkins | R | 900 / ≈880 | — | band ceiling, ~no skill |
| El Risitas | R | 600 (×3 → 4,200) | — | band floor; multi X |
| End of Ze World | R | 900 / ≈450 / ≈45 realistic | 10 (50% / 20%) | under in practice (all-or-nothing) |
| Overly Attached GF | R | — / **27.9** / 15.5 (Early 10.1, Late 21.3) | **81 / 45** (405% / 162%) | Aura ≈4%; **Kek 4× budget** |
| Evil Kermit | R | EV 900 (1,800 / 0) | — | top of band; gamble premium +50% vs Risitas ✓ |

**How much payouts swing between states.** All EAS cards are flat across states by construction. The click-based cards (Surgery, Cena, OAG) swing 2.75× (click value ÷ EAS goes 0.025 → 0.069 → 0.052) and are always far under budget, because clicks are a small share of income in every reference state. This is the D6 issue: burns scale with Aura/sec, and click-paid cards would need `max(APS, APC × k)` or EAS-per-hit to reach their budget.

### Kek budget summary (≈13.8 Kek/min clicking at 6 clicks/sec)

| Card | Kek | Minutes of click income | Over tier budget? |
|---|---|---|---|
| Arthur Fist | 2 | 0.14 | no |
| Chocolate Rain | ≤5 | 0.36 | no (but splits with Aura) |
| Zombie Kid Turtle | 8 | 0.58 | no |
| Gabe (single) | 10 | 0.72 | no |
| Gabe (multi N=3 / N=10) | 30 / 100 | 2.2 / 7.2 | **yes**, with no skill check |
| End of Ze World | 10 | 0.72 | no |
| **OAG** | **81** (casual 45, 10 clicks/sec 135) | **5.9** (3.3 / 9.8) | **yes, 1.6–6.7 packs** |

---

## 5. Evil Kermit EV vs El Risitas

- **Single copy:** Kermit EV = 0.5 × 1,800 = **900** vs Risitas **600** guaranteed. Kermit is +50% EV, exactly the gamble premium Rule 0.5 allows. Variance: 50% of uses pay 0, and 25% of two-use runs pay nothing at all.
- **Multi-copy:** two Risitas used together = 1,800, the same as one Kermit win. Three = 4,200 (the D1 cap), vs three Kermits EV 2,700. A player who saves Risitas copies beats Kermit, so the two cards stay distinct: Kermit is "spend now, gamble", Risitas is "hoard".
- **The real problem is Leroy:** ≈880 EAS for one click, with no variance. That roughly equals Kermit's EV with no risk and beats Risitas's single use. Leroy dominates both single-use rare bursts.
- **Recommendation:** keep Kermit at 1,800 (EV 900), and fix its text to "1800 seconds of Aura". Lower Leroy or make it harder (see P1) so the rare burst ladder becomes Risitas 600 sure < Leroy ~700 skill < Kermit 900 gamble.

---

## 6. Ranked problem list

### P0 — broken / exploit
1. **OAG Kek per click has no cap.** It pays 81 Kek per use at 6 clicks/sec and 135+ at 10, i.e. 4–7 packs (game.js:1258–1262). *Fix:* add `kekPerHitCap: 15` per use.
2. **Rickroll ×3 reaches every live-EAS burn** (game.js:1743 used at 2680, 1985/2013/2041/2068/2660, 2193, 1630, 2956). Rickroll + Leroy or End = 2,700 EAS. *Fix:* pay TARGET_CHASE, COIN_RAIN, SCREEN_GAG and TIMED_DROP with `computeBaseEAS()`.
3. **El Risitas multi-copy is uncapped** (2^N − 1; 10 copies = 613,800 EAS) (game.js:2248, 2268). *Fix:* D1, `n = min(n, 3)`, and consume only those copies.
4. **Gabe "Use All" pays Kek with no minigame, linearly**, while the text and tooltip say exponential (game.js:2259–2265, 1787). *Fix:* play the bones once and pay `kekReward × min(N, 3) × catchFraction`; fix the text and tooltip.
5. **BUG: a chase card's timeout deletes every other chase card's targets** (game.js:2759). *Fix:* keep a per-activation list and remove only those targets.
6. **BUG: overlapping Surgery or Cena leaves the nugget permanently shrunk** (`orig` captured at game.js:2181, restored at game.js:2189). *Fix:* restore to `''`, or keep a precision depth counter.
7. **BUG: Rickroll is downgraded or shortened** by Charlie or Dream, because TEMP_APS_MULT overwrites value and timer (game.js:1909–1910). *Fix:* use `max(cur, mult)` and `max(timer, duration)`, as TEMP_CLICK_MULT does.
8. **BUG: an off-centre OAG click divides by the whole `clickMultValue`**, stripping other click buffs (game.js:1243). *Fix:* divide only by OAG's own mult, or skip only the precision bonus.
9. **NOOP: Rickroll `fakeCrash`** is never read (game.js:174). *Fix:* add a 1.5s fake "Aw, Snap" overlay, or cut it from the text (D3).

### P1 — unbalanced
10. **The whole PRECISION archetype is ≈2–10% of its Aura budget** (Surgery 5–15, Cena 12–33, OAG 10–28 EAS). *Fix:* pay per-hit EAS (e.g. Surgery 3/hit cap 180, Cena 10/hit cap 900, OAG 8/hit cap 900 + capped Kek), or tie it to D6.
11. **Leroy pays ≈880 EAS for one easy click** and dominates both El Risitas and Kermit. *Fix:* make it a true rushing target (edge spawn, crosses in about 1s), or set 700.
12. **MLG Airhorn is strictly dominated by Arthur Fist** (same 120 EAS, no extras). *Fix:* MLG 160–180 EAS, or give it its own hook.
13. **The three rhythm uncommons are outcome clones at the band floor** (120 perfect). Keyboard Cat and Numa have no real skill check. *Fix:* add timing judgement or per-zone windows, then pay 150–180 for a perfect run.
14. **Shia is the only real rare skill check but pays at the band floor**, and mashing the centre beats it. *Fix:* random pulse positions, perfect = 900.
15. **End of Ze World is all-or-nothing** on 25 sequential targets (realistic EV ≈450 skilled, ≈45 casual) while the text promises "900 total" plus a Kek "bonus". *Fix:* 36 EAS per missile, 10 Kek only on a perfect run.
16. **Gabe single use is dominated by Zombie Kid Turtle** (10 Kek all-or-nothing on 25 bones vs 8 Kek almost guaranteed). *Fix:* pay Kek per bone.
17. **Britney is a hard, frame-rate-dependent chase at a flat 180**. *Fix:* scale movement by `dt` (all chase targets) and pay 220–270, or lower HP to 6.
18. **John Cena's "invisible" constraint is trivial** (the nugget never moves). It fails the Rule 0.2 axis, and OAG dominates it through Kek. *Fix:* invisible plus slow drift.
19. **Chocolate Rain and End of Ze World pay near-full Aura plus Kek** (Rule 0.8 split ≈1.4–1.5 budgets). *Fix:* Chocolate Rain 8 EAS per drop. End: keep 10 Kek but only on a perfect run, as in item 15.

### P2 — text / polish
20. **Rhythm "up to N× Aura" text** (Woman Yelling, Keyboard Cat, Numa, Shia) describes the internal floor ratio, not anything the player sees. *Fix:* "up to 120s (Rare: 600s) of Aura".
21. **Ugandan "swarming" and End "missiles"** are one target at a time. *Fix:* spawn several at once (Ugandan 8 together = the true "swarm" axis) or reword.
22. **Kermit "1800 Aura" and Shooting Stars "12 Aura each"** are seconds of income. *Fix:* say "seconds of Aura".
23. **Leroy "charges at you"** uses the standard slow drift. *Fix:* implement the rush (item 11) or reword.
24. **El Risitas `shake: 'violent'`** is the same shake as MLG on a single use. *Fix:* use the 12-cycle shake for single use too.
25. **Burn Kek skips `kekDoubleCount`** (game.js:1896, 1940, 2549, 2719, 2730, 1259); only 3D coins honour the "Kek worth 2×" buff. *Fix:* route all Kek grants through one `awardKek(n)` helper.
26. **Precision cards are dead during a boss fight** (the overlay covers the nugget, index.html:1412–1416) and off the SAUCES tab (game.js:1220), and the whole window is wasted. *Fix:* block activation in those states, or pause the precision timer.
27. **Keyboard Cat's full-width bars can cover the nugget** for 8s (game.js:2822). *Fix:* narrow the bars or move them to the sides.
