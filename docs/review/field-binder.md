# Review R1: Field & Binder cards

- **Reviewer:** R1 (Field & Binder)
- **Commit reviewed:** `e84fc53` (main, includes cleanup PR #2 / `8a99ecb`)
- **Scope:** 6 Field (f1–f6) and 15 Binder (bi_c1–bi_c6, bi_u1–bi_u6, bi_r1–bi_r3)
- **Method:** Math done by hand. Cross-checked afterwards with `node tools/card-sim.js` section (c): every Binder % matches (the sim prices pack #10/#30 at packsPurchased 9/29 = 18/48 Kek; this file uses packsPurchased 10/30 = 20/50).

---

## Reference numbers used

From `UPGRADES` (game.js:95-101): APS = ketchup×1 + ranch×15 + grimace×200. APC = 1 + szechuan×10. Base mult = 1 + 0.5×sigma. `computeEAS()` = APS × mult (game.js:1740).

| State | APS | APC | Base mult | EAS (Aura/s passive) | Click Aura/s at 6 cps | Total Aura/s (active) |
|-------|-----|-----|-----------|----------------------|------------------------|-----------------------|
| Early | 40 | 1 | 1.0 | 40 | 6 | 46 |
| Mid | 740 | 51 | 1.0 | 740 | 306 | 1,046 |
| Late | 3,830 | 201 | 2.5 | 9,575 | 3,015 | 12,590 |

How to read the payouts below:
- **"% total"** is the change in total Aura/s (passive + 6 cps clicking) with the card slotted.
- **"% idle"** is the same with 0 cps.
- A TIMED_DROP worth V EAS every T seconds adds V/T × EAS per second, so it shows as "+(V/T) of APS income".

**Kek baseline.** The click Kek drop (game.js:1279-1284) is a 30-click pity timer plus a 1% roll per click. That works out to one drop every (1-0.99^30)/0.01 = 26.0 clicks, so **13.8 Kek/min at 6 cps**. With Harambe (22-click pity) it is 19.8 clicks per drop, so 18.1 Kek/min.

**Pack cost** (game.js:682-686) is `5 + floor(1.5 × packsPurchased)`. I use 20 Kek at packsPurchased = 10 and 50 Kek at packsPurchased = 30.

**Additive-mult dilution (applies to every card that adds to `addMult` and to every Field).** These cards add to the same base as Sigma Glaze (`G.allAuraMult + bs.addMult + fieldMult`, game.js:1253 and 1563). So "+X% Aura" is only worth X% while base mult = 1. At Late (base 2.5), Shrek's +5% is +2%, Sigma Slam's +80% is +32%, and so on. The text never says this. I list it once here (P2) instead of on every card.

---

## Cleanup PR items in scope (verified, not re-reported)

| Item | Status | Where |
|------|--------|-------|
| Chuck Norris EV no longer added in `getBinderStats` | ✅ Only the real every-10th crit in `doClick` remains | game.js:635, 1226-1235 |
| Success Kid `rareBonus`/`mythicBonus` used in `pullCard()` | ✅ Wired. The rare bonus is taken from **uncommons** (common stays 60%) | game.js:688-699 |
| Stonks `fluctuate` | ✅ ±30% uniform | game.js:1619-1620 |
| Pepe `cycleSec` | ✅ Read from the card | game.js:1568 |
| PBJ Kek bonus reads `kekDropBonus` param | ✅ No more hardcoded `f6` check | game.js:2355-2361 |
| GigaChad grayscale | ✅ `body.gigachad-mode` toggled | game.js:1150-1152, index.html:1251 |
| Re-equipping a TIMED_DROP can't fire an instant drop | ✅ `_lastDrop = Date.now()` on equip | game.js:1010 |

---

## Field cards

### Ohio Boss (f1): Field / mythic-rare / FIELD_THEME
- **Says (desc):** "+50% Aura on everything! Boss spawns 50% more often — but every time you defeat the Skibidi Toilet while in Ohio, it drops 5 Kek Koins!"
- **Says (cards.csv):** Matches desc.
- **Does (code):**
  - Adds +0.50 to the mult (game.js:670-676).
  - Spawn odds: `spawnEvent` rolls `bossBias = (1.5-1)×0.2 = 0.10` first, then falls back to the normal 1-in-5 pick that also contains the boss (game.js:1406-1412, EVENTS at 1383-1389). So P(boss) = 0.10 + 0.90×0.20 = **0.28 vs 0.20. That is +40%, not +50%.**
  - +5 Kek on victory, using the field slotted *at the moment of victory* (game.js:2961-2967).
  - The boss reward is 300 × `computeEAS()`, so it is also boosted by the +50% (game.js:2955).
- **Params read / unread:** `mult`, `theme`, `bossSpawnMult`, `kekBossReward` are all read.
- **Payout:**
  - Aura: +50% / +50% / +20% (Early/Mid/Late).
  - Bosses: about 5.3/h → 7.5/h (events every 90-180s, mean 135s).
  - Kek: 5 per kill = 25% of pack #10, 10% of pack #30. About 0.6 Kek/min if every boss is beaten, roughly 4% of click Kek income. Well inside budget.
- **Skill/friction:** The extra bosses need clicking (20 hits in 8s). An AFK player loses about 10% of banked Aura per extra boss (5s auto-resolve at 2%/s, game.js:2996-3001).
- **Interactions:** Shrek/Harold reduce the drain. Field-swap cheese: the Kek and boss reward use whatever field is slotted at the kill, so you can sit in Sigma Slam and swap to Ohio only for the last hit (P2).
- **Flags:** TXT (+40% not +50%).
- **Fix (1 line):** Use `bossBias = (0.2×1.5 − 0.2)/0.8 = 0.125` so it is really +50%, or change the text to "40% more often".

### Sigma Slam (f2): Field / mythic-rare / FIELD_THEME
- **Says (desc):** "Huge +80% Aura boost! But nothing collects itself — you have to click everything. Only for real pros!"
- **Says (cards.csv):** Matches desc.
- **Does (code):**
  - Adds +0.80 to the mult.
  - `disableAutoCollect` does two things:
    - (a) AUTO_COLLECT burns (Spiderman, Distracted Boyfriend, Vitas, Disaster Girl) just toast "no auto-collect" (game.js:2109-2114), **after `activateBurn` already took the card** (game.js:1820). **The card is lost for nothing.**
    - (b) Doge drops a coin you have to click instead of auto-paying (game.js:1625-1635).
  - 3D Kek coins never auto-collect even without Sigma (`KEK_IDLE_TIMEOUT_S` at game.js:2309 is never used), so Sigma changes nothing there.
- **Params read / unread:** All read.
- **Payout:** Aura +80% / +80% / +32%. No Kek.
- **Skill/friction:** Only if you own Doge or AUTO_COLLECT burns. Otherwise there is no friction at all.
- **Interactions:**
  - GigaChad + Sigma: body filter grayscale(1) wins over Sigma's 0.85 (index.html:1246-1252).
  - Sigma is the best raw-Aura field at every state.
- **Flags:** BUG (burn eaten), Dom (beats every other field on Aura; its downside only hits 5 specific cards).
- **Fix (1 line):** Refuse AUTO_COLLECT activation *before* taking the card (grey it out in the burn bar). Then either give Sigma a real cost (e.g. TIMED_DROP coins also fall 2× faster) or trim it to +70%.

### Nyan Cat (f3): Field / mythic-rare / FIELD_THEME *(hand-tuned by Curtis)*
- **Says (desc):** "+30% Aura boost. Every 20s Nyan Cat flies across the screen — click it to grab 3 Kek Koins! Up to 2 can be on screen at once. Lower multiplier than other fields, but free Kek Koins forever!"
- **Says (cards.csv):** Matches desc (now regenerated).
- **Does (code):**
  - Adds +0.30 to the mult.
  - Every 20s `spawnNyanCat()` flies a cat across for 5-8s (game.js:1690-1697, 2609-2649). Clicking it spawns 3 physical Kek coins at the nugget (game.js:2632). Those still have to be clicked, and only on the Sauces tab (game.js:2519).
  - The 2-cat cap (game.js:2611) can never be hit: each cat lives at most 8s and the interval is 20s.
  - `_coinTrailAccum` is not reset on field swap (harmless).
  - Cats are z-index 600 (index.html:1332), so they stay clickable on other tabs and survive a field swap. A cat on screen when you swap still pays out. No exploit, since swapping doesn't speed up spawns.
- **Params read / unread:** `coinTrailInterval` read. `cursorTrail` is **unread** (no trail exists; the text no longer promises one, so this is a dead param).
- **Payout:**
  - Aura: +30% / +30% / +12%.
  - Kek: 3 per catch = 15% of pack #10, 6% of pack #30. Up to 9 Kek/min (65% of click Kek income). Inside the per-minute budget.
- **Skill/friction:** Click a moving target every 20s, then click 3 coins.
- **Interactions:** `kekDoubleCount` applies to the coins. **PBJ beats it for active players** (see PBJ).
- **Flags:** TXT (minor: "up to 2 on screen" is unreachable), NOOP (cosmetic `cursorTrail`).
- **Fix (1 line):** Keep Curtis's numbers. Drop "Up to 2 can be on screen at once" (or make the interval 8s with 2 lanes) and delete `cursorTrail`. Fix the PBJ comparison on the PBJ side.

### Moth and Lamp (f4): Field / mythic-rare / FIELD_THEME *(hand-tuned)*
- **Says (desc):** "+65% Aura boost! But every 30s the screen plunges into darkness for 5 seconds — you can barely see anything. Kek Koins, burn cards, events — all hidden in the dark."
- **Says (cards.csv):** Matches desc.
- **Does (code):**
  - Adds +0.65 to the mult.
  - Every 30s there is a 5s blackout: `#moth-blackout` at z-index 550 with a 90px lamp hole that follows the cursor (game.js:1521-1541, 1675-1689). It covers burn coins (500), the boss overlay (400) and events (150), but has `pointer-events:none`, so blind clicks/hovers still work.
  - `body.theme-dark::before` draws a **permanent** dark vignette whose spotlight uses `--mx/--my` (index.html:1259-1265). **game.js never sets them**, so the hole is stuck at screen centre the whole time Moth is slotted, not only during blackouts.
- **Params read / unread:** All read.
- **Payout:** Aura +65% / +65% / +26%. No Kek.
- **Skill/friction:** Visual: 5s of every 30s is blind (17% of the time), plus the always-on edge vignette.
- **Interactions / swap test:** **BUG.** Swapping from Moth to any other Field *during* a blackout leaves the screen black. The field block only ends the blackout when the field is removed or isn't FIELD_THEME (game.js:1710-1716). With another field slotted, the `blackoutInterval` branch is skipped and `_mothBlackoutEnd()` is never called. `applyFieldTheme()` (game.js:1068-1084) doesn't clear it either. Recovery: unequip the field, or re-equip Moth.
  - `_mothBlackoutAccum` also isn't reset on swap.
- **Flags:** BUG (stuck blackout), BUG/TXT (spotlight vars never set), Dom-risk vs This is Fine (same +65% endpoint).
- **Fix (1 line):** In `applyFieldTheme()`, call `_mothBlackoutEnd()` and zero `_mothBlackoutAccum` whenever the new field isn't f4. Either set `--mx/--my` from the mousemove handler (game.js:1514) or drop the `::before` spotlight.

### This is Fine (f5): Field / mythic-rare / FIELD_THEME *(hand-tuned)*
- **Says (desc):** "Starts at +25% Aura — but every 30s the fire spreads one level (up to 5). Each level adds +8% more Aura and thickens the smoke. At max you're at +65% Aura."
- **Says (cards.csv):** Matches desc.
- **Does (code):**
  - Mult = `0.25 + fireLevel × 0.08`. The 0.25 is **hardcoded** and ignores `params.mult` (game.js:674).
  - Level goes up every 30s up to 5 (game.js:1699-1708), so +65% after 150s. Smoke is a radial vignette, 0.17/level at the edges (max 0.82), with a clear centre (game.js:1041-1066).
  - Swapping away resets the fire (game.js:1072-1076). `fireLevel` is saved and restored (game.js:3036, 3078). `fireAccum` isn't saved (harmless).
- **Params read / unread:** `fireInterval`, `fireMaxLevel`, `fireAuraPer`, `theme` read. `mult` unread (hardcoded duplicate).
- **Payout:** Aura +25% → +65% / same / +10% → +26%. Average over the first 150s is about +45%. After that it is a flat +65%.
- **Skill/friction:** A one-time 2.5 min ramp, then a permanent edge vignette that doesn't block clicks.
- **Interactions:** The ramp only resets on swap or unequip, and the level persists across reloads. So in a long session it is **+65% with milder friction than Moth's 17% blackout**, which makes Moth roughly dominated.
- **Flags:** TXT-internal (hardcoded 0.25), Dom-risk over Moth.
- **Fix (1 line):** Read `card.params.mult` instead of 0.25. Keep Curtis's escalation, but either cap fire at +60% or lift Moth to +70% so the harder friction pays more.

### Peanut Butter Jelly (f6): Field / mythic-rare / FIELD_THEME
- **Says (desc):** "+40% Aura and cards drop 2× as often! AND every Kek Koin that pops out of the nugget spawns a free bonus one!"
- **Says (cards.csv):** Matches desc.
- **Does (code):**
  - Adds +0.40 to the mult.
  - Every `spawnKekCoin()` gives +1 Kek directly. It is invisible, needs no pickup, and isn't doubled by `kekDoubleCount` (game.js:2355-2361).
  - `spawnKekCoin` is also called by Bad Luck Brian / KEK_SPAWN, including multi-copy (game.js:2225, 2254), and by Nyan (not slottable at the same time). **So PBJ doubles Brian.**
  - No card drops exist outside packs, so `cardDropRate` is a NOOP.
- **Params read / unread:** `kekDropBonus` read. `cardDropRate` **unread** (D3: cut).
- **Payout:**
  - Aura: +40% / +40% / +16%.
  - Kek: +13.8 Kek/min at 6 cps (= 100% of click Kek income, so it doubles it), +23/min at 10 cps. Brian 2 → 4 Kek. 10-copy Brian 2,046 → 4,092 Kek until D1 caps it.
- **Skill/friction:** None.
- **Interactions:** Harambe (more drops → more bonus). Brian multi-copy. Combo 6.2-#10 in the sweep plan.
- **Flags:** NOOP (cardDropRate), TXT, K (at the per-minute budget line at 6 cps and above it for fast clickers), Dom (beats Nyan on *both* mult and Kek for any clicking player; fails Rule 0.4 because no downside is left once cardDropRate is cut).
- **Fix (1 line):** Per D3, drop the card-drop line. Give PBJ the lowest mult (+25-30%) or make the bonus "+1 Kek every 2nd drop", so Nyan (Curtis's design) keeps its "Kek field" identity at +30%.

### Field tradeoff sentences (Rule 0.4)

| Field | One-sentence tradeoff (as coded today) | Passes? |
|-------|----------------------------------------|---------|
| Ohio Boss | +50% Aura and 5 Kek per kill, for ~40% more Skibidi bosses that drain ~10% of your bank whenever you're AFK. | ⚠️ Only a cost for AFK players. For active players the extra bosses are extra 300-EAS rewards |
| Sigma Slam | +80% Aura, but Doge needs clicking and the 4 AUTO_COLLECT burns can't be used (and get eaten). | ❌ The cost only exists if you own those 5 cards. Best Aura field everywhere |
| Nyan Cat | Lowest mult (+30%) in exchange for ~9 Kek/min from catching a cat every 20s. | ✅ Curtis's design holds, but PBJ undercuts it |
| Moth and Lamp | +65% Aura, but you're blind 5s of every 30s (drops, events, coins hidden) plus a constant edge vignette. | ✅ Real cost. Same payoff as This is Fine after 2.5 min |
| This is Fine | Starts weak (+25%) and ramps to +65% over 2.5 min; swapping away resets it; smoke thickens at the edges. | ⚠️ The ramp cost is paid once per session. After that it is Moth with milder friction |
| Peanut Butter Jelly | +40% Aura **and** doubled click Kek income, with no downside (the "2× card drops" line does nothing). | ❌ No tradeoff. Dominates Nyan |

**Field-swap cleanup check:**
- Moth blackout: ❌ stuck if you swap mid-blackout.
- This is Fine fire: ✅ reset by `applyFieldTheme`.
- Nyan cats: ✅ self-remove on `animationend`. Paying out after a swap is harmless.
- Theme classes: ✅ all removed in `applyFieldTheme` (game.js:1069-1070).
- Field swaps are free and instant, so "swap to Ohio for the last boss hit" and "sit in Sigma, swap in Moth/Fire never" cheese is possible (P2).

---

## Binder: Common

### Shrek (bi_c1): Binder / common / GLOBAL_MULT *(hand-tuned)*
- **Says (desc):** "+5% Aura on everything! Plus the Skibidi Toilet drains you 10% less."
- **Says (cards.csv):** Matches desc.
- **Does (code):**
  - `addMult += 0.05` and `drainMult *= 0.9` (game.js:612-615).
  - `drainMult` is captured when the boss starts (game.js:2943) and scales the 2%/s rate only, not the 20% cap (game.js:3003-3005).
- **Params read / unread:** All read.
- **Payout:**
  - Aura: +5% / +5% / +2% (diluted).
  - Drain: an AFK boss drains 9% instead of 10%. A boss killed in ~3.3s drains 6.0% instead of 6.7%.
- **Skill/friction:** None.
- **Interactions:** Shrek + Harold = 0.9 × 0.8 = 0.72, so 1.44%/s. Multiplicative, as intended (game.js:614, 632). Only affects bosses that start after equipping.
- **Flags:** Dom (in Aura terms vs Doge, see slot test). Otherwise OK.
- **Fix (1 line):** Fine as Curtis built it. It stays weak only because TIMED_DROPs are far over budget.

### Harambe (bi_c2): Binder / common / PASSIVE_APC_PCT *(hand-tuned)*
- **Says (desc):** "Kek Koins appear every 22 clicks instead of 30 — AND every click earns +0.5 flat Aura."
- **Says (cards.csv):** Matches desc.
- **Does (code):** `addApc += 0.5` (multiplied by the global mult) and `kekIntervalReduce += 8` (game.js:617-620). The Kek pity interval becomes `max(5, 30-8) = 22` (game.js:1279).
- **Params read / unread:** All read. The archetype name PASSIVE_APC_PCT is misleading (it's flat), but only internally.
- **Payout:**
  - Aura: +6.5% / +0.3% / +0.1% total (falls off hard after Early). Idle 0.
  - Kek: 13.8 → 18.1 Kek/min (+4.3/min, +31%) at 6 cps. That is +0.22 pack#10 per minute. Inside the per-minute budget.
- **Skill/friction:** Clicking.
- **Interactions:** Boosts PBJ's bonus (more drops). Also adds to AUTO_COLLECT burn clicks (they read `bs.addApc`, game.js:2147).
- **Flags:** OK.
- **Fix (1 line):** None. The flat APC is an Early-game hook and Kek is the real value; that matches the design.

### Stonks (bi_c3): Binder / common / TIMED_DROP
- **Says (desc):** "A bonus item falls every 90s — click it to grab 75 Aura!"
- **Says (cards.csv):** Matches desc.
- **Does (code):** Every 90s `spawnBurnCoin(75 × (1±0.3))` (game.js:1614-1635). A click pays `computeEAS() × value` (game.js:2651-2663), so 52-98 **seconds of income**, not 75 Aura. The coin falls in 3-5s and is removed at 5.5s.
- **Params read / unread:** All read (`fluctuate` now wired).
- **Payout:**
  - Skilled (90%): **+65% / +53% / +57%** of total Aura/s.
  - Casual (50%): +36% / +30% / +32%.
  - Idle 0.
- **Skill/friction:** Click a falling coin once per 90s.
- **Interactions:** `computeEAS` includes Rickroll's temp APS mult, field and binder mults. Disaster Girl's sweep can collect it (game.js:2156-2163). Hidden by Moth's blackout.
- **Flags:** TXT ("75 Aura" is 75 s of income; fluctuation not mentioned), **over budget** (a common Burn's worth, 30-45 EAS, every 90s forever).
- **Fix (1 line):** Cut `valueEAS` to ~12 (≈+13% skilled) and reword as "≈12 seconds of Aura (±30%)".

### Philosoraptor (bi_c4): Binder / common / TIMED_DROP *(hand-tuned)*
- **Says (desc):** "Every 90s a floating question mark drifts across the screen. Hover over it to grab 3 Kek Koins."
- **Says (cards.csv):** Matches desc.
- **Does (code):** Every 90s `spawnBurnKekCoin(3, '🦖', hover)` (game.js:1627-1629, 2537-2563). It's a falling 🦖 with a gold glow, not a drifting "?". A `mouseenter` collects it.
- **Params read / unread:** All read.
- **Payout:** Kek 3 per 90s = **2 Kek/min** (14% of click Kek income). 3 Kek = 15% of pack #10, 6% of pack #30. No Aura.
- **Skill/friction:** Hover a falling item.
- **Interactions:** Moth hides it, but blind hover still works. Disaster Girl's sweep clicks it, but it only listens for hover, so the sweep **does not** collect it.
- **Flags:** TXT (cosmetic: "question mark drifts" is a dino that falls).
- **Fix (1 line):** Use ❓ as the emoji (or reword). Numbers stay as Curtis set them.

### Doge (bi_c5): Binder / common / TIMED_DROP
- **Says (desc):** "Every 60s you automatically get 30 free Aura."
- **Says (cards.csv):** Matches desc.
- **Does (code):** Every 60s `G.aura += computeEAS() × 30`, auto-collected (game.js:1630-1633). Under Sigma Slam it becomes a coin you have to click.
- **Params read / unread:** All read.
- **Payout:**
  - **+43% / +35% / +38%** of total.
  - **+50% idle at every state.** That is the same as First World Problems' idle bonus, but it also works while clicking.
- **Skill/friction:** None.
- **Interactions:** Turns Cheezburger's 2× combo on. Rickroll boosts it (uses `computeEAS`).
- **Flags:** TXT ("30 free Aura" is 30 s of income), over budget, **Dom-maker**: it beats FWP outright, beats every %-card at every rarity including GigaChad (rare, +20% APS), and is bigger than Sigma Slam's Late +32%.
- **Fix (1 line):** `valueEAS` 30 → ~5 (≈+8% APS, the cost of having no friction) and reword "≈5 seconds of Aura every minute".

### First World Problems (bi_c6): Binder / common / IDLE_DRIP
- **Says (desc):** "Stop clicking for 5 seconds and earn 1.5× Aura per second until you click again."
- **Says (cards.csv):** Matches desc.
- **Does (code):** If more than 5s have passed since the last nugget `doClick`, it adds `(APS+addAps) × apsMult × effectiveMult × 0.5 × dt` (game.js:1640-1654).
  - **Bug:** `G.lastIdleClickTime` isn't saved and starts at 0. `idleSec = now − (0 || now) = 0`, so **after every page load FWP does nothing until the player clicks the nugget once.** A pure-AFK player (its target audience) who reloads gets nothing.
- **Params read / unread:** All read.
- **Payout:** +50% of passive income while idle (all states). 0 while clicking.
- **Skill/friction:** Don't click.
- **Interactions:** Boss: clicking the boss sprite doesn't reset idle (only `doClick` does), which is fine. Rickroll multiplies it.
- **Flags:** BUG/D (dead after reload), **Dom** (Doge gives the same +50% idle and still pays while clicking).
- **Fix (1 line):** Set `G.lastIdleClickTime = Date.now()` on load / when 0. Once Doge is cut, raise this to 1.75-2× idle so it's the AFK specialist.

## Binder: Uncommon

### Grumpy Cat (bi_u1): Binder / uncommon / COST_REDUCTION
- **Says (desc):** "+3% Aura boost always, upgrades cost 10% less, AND every booster pack costs 2 fewer Kek Koins. Even after you own everything, that discount stays."
- **Says (cards.csv):** Matches desc.
- **Does (code):** `costReduce = max(…, 0.10)`, `addMult += 0.03`, `kekPackDiscount += 2` (game.js:626-630). Upgrade cost uses it at game.js:104-107. Pack cost floor is `max(1, base − floor(discount))` (game.js:685).
- **Params read / unread:** All read.
- **Payout:**
  - Aura: +3% / +3% / +1.2%.
  - Upgrades: 10% cheaper (≈ +11% buying speed while upgrades remain).
  - Kek: −2 per pack = 10% of pack #10, 4% of pack #30. Over a 30-pack run it saves 60 Kek.
- **Skill/friction:** None.
- **Interactions:** Grumpy + Success Kid = up to −7 Kek. The floor only matters at packsPurchased ≤ 1 (5 − 7 → 1). See stacking.
- **Flags:** OK. Strictly better than Harold (see slot test).
- **Fix (1 line):** None needed. Optionally make the pack discount a % (−10%) so it doesn't fade late.

### Success Kid (bi_u2): Binder / uncommon / PACK_LUCK
- **Says (desc):** "+1% Aura per card type owned (up to +10%), luckier pack pulls, PLUS the more unique cards you own the cheaper packs get — up to 5 Kek Koins off each pack!"
- **Says (cards.csv):** Matches desc.
- **Does (code):**
  - `addMult += min(0.10, unique × 0.01)`. `uniqueOwned` counts ids with count > 0, so **Burns you've used no longer count**, and the bonus drops when you burn your last copy.
  - Pack discount `min(5, unique × 0.2)`, floored (game.js:647-657, 685).
  - `pullCard()`: Field 10% → 12%; rare cut 0.88 → 0.83, so rare 12% → 17% of non-Field pulls. Common stays 60% because of the `min(0.60, rareCut)`, so the shift comes **from uncommons** (28% → 23%) (game.js:688-699).
- **Params read / unread:** All read.
- **Payout:**
  - Aura: +3-10% Early (depends on collection), +10% Mid, +4% Late.
  - Kek: −2 at 10 unique (10% of pack #10), −5 at ≥25 unique (10% of pack #30).
  - Luck: +42% relative rare rate, +20% relative Field rate.
- **Skill/friction:** None.
- **Interactions:** With D4 (Field 5%) the `mythicBonus` of +2% becomes a 40% relative boost; re-check then. The per-type count is computed on every `getBinderStats` call (`Object.keys().filter`, 13 call sites, some per frame). That is a perf nit.
- **Flags:** TXT (minor: "card type owned" drops when Burns are used up).
- **Fix (1 line):** Count unique cards *ever* pulled (or Binder/Field only) so burning cards doesn't shrink the bonus.

### Big Chungus (bi_u3): Binder / uncommon / BIGGER_TARGET
- **Says (desc):** "Makes the nugget 1.5× bigger and gives +5% click Aura. Easier to click and easier to catch chase events!"
- **Says (cards.csv):** Matches desc.
- **Does (code):** `apcMultBonus += 0.05` and `hitboxBonus = true` (game.js:622-625). `hitboxBonus` is only read by Surgery on a Grape's shrink: 0.55 instead of 0.35 (game.js:2186).
  - **`scale: 1.5` is never read.** The nugget never grows.
  - Nothing makes chase targets (`spawnBurnTarget`) easier.
- **Params read / unread:** `apcBonus`, `hitboxBonus` (one use) read. `scale` **unread**. "Easier to catch chase events" isn't implemented.
- **Payout:** Aura +0.7% / +1.5% / +1.2%. 0 idle.
- **Skill/friction:** None.
- **Interactions:** Surgery on a Grape only.
- **Flags:** **NOOP** (scale, chase-event promise), **Dom** (weakest Binder in the game at every state; the drop-first uncommon).
- **Fix (1 line):** Implement `scale` (nugget 1.5× and a larger `burn-target` hitbox) and raise `apcBonus` to ~0.25, or cut both promises from the text.

### Hide the Pain Harold (bi_u4): Binder / uncommon / EVENT_SOFTENER
- **Says (desc):** "+3% Aura boost always, plus Skibidi Toilet drains you 20% less."
- **Says (cards.csv):** Matches desc.
- **Does (code):** `drainMult *= 0.8`, `addMult += 0.03` (game.js:631-634).
- **Params read / unread:** All read.
- **Payout:**
  - Aura: +3% / +3% / +1.2%.
  - Drain: an AFK boss drains 8% instead of 10% of the bank; a fast kill saves ~1.3% of the bank.
- **Skill/friction:** None.
- **Interactions:** Shrek stacks multiplicatively (verified). Ohio makes it slightly more relevant.
- **Flags:** **Dom** (Grumpy Cat gives the same +3% plus cost and pack discounts; the drain saving is worth ~1-2% of bank, ~5 times an hour).
- **Fix (1 line):** Give Harold a non-stat hook, e.g. "boss drain −50% and boss reward +25%", or "Fanum Tax steals 5% instead of 10%".

### I Can Has Cheezburger (bi_u5): Binder / uncommon / TIMED_DROP
- **Says (desc):** "A burger floats by every 60s — click it to grab 120 Aura! Got Doge in another slot too? The burger doubles to 240 Aura!"
- **Says (cards.csv):** Matches desc.
- **Does (code):** Every 60s a click coin worth `computeEAS() × 120`, ×2 if `bi_c5` is slotted (game.js:1621-1623, 2651-2663). The burger falls; it doesn't "float by".
- **Params read / unread:** All read.
- **Payout:**
  - Solo skilled: **+157% / +127% / +137%**. Casual: +87% / +71% / +76%.
  - With Doge: **+313% / +255% / +274%**, plus Doge's own 35-43%. **2 slots ≈ 3.5-4× your income.**
- **Skill/friction:** Click once a minute.
- **Interactions:** Combo verified. Rickroll ×3 boosts the coin's value if you click it during the buff.
- **Flags:** TXT ("120 Aura" is 120 s of income), **over budget by ~10×**, makes every other binder irrelevant (the "always kept" card).
- **Fix (1 line):** `valueEAS` 120 → ~10 (≈+17% solo, +33% + Doge for 2 slots) and reword in seconds of income.

### Expanding Brain (bi_u6): Binder / uncommon / SCALING_OVER_TIME
- **Says (desc):** "+1% click Aura for every minute you play — it never stops growing!"
- **Says (cards.csv):** Matches desc.
- **Does (code):** `apcMultBonus += 0.01 × (Date.now() − G.scalingStartTime) / 60000`, uncapped (game.js:636-640).
  - `scalingStartTime` is set the first time `getBinderStats` runs with the card slotted, and saved/loaded (game.js:3031, 3073). It is **never reset**, so it counts unslotted time and offline time.
  - It depends on `Date.now()` per call, but all calls in a frame land within a ms, so call order doesn't matter in practice. Offline growth is the real issue.
- **Params read / unread:** All read.
- **Payout** (slotted from the start, % of total Aura/s at 6 cps):

  | Minutes since first slotted | 10 min | 40 min | 3 h | 1 day |
  |---|---|---|---|---|
  | Early | +1.3% | | | |
  | Mid | | +11.7% | | |
  | Late | | | +43% | +1,440% APC → ≈ +345% total |

  With D2 (cap +30%, open time only): +3.9% / +8.8% / +7.2%. 0 idle.
- **Skill/friction:** Clicking.
- **Interactions:** Multiplies `G.auraPerClick` only (`addApc` at game.js:661). Chuck crits multiply it further.
- **Flags:** **X** (unbounded, grows offline) and TXT once D2 lands.
- **Fix (1 line):** D2 as approved: `G.brainMinutes += dt/60` in `gameLoop` while slotted, `min(0.30, …)`. Text "+1% per minute played while slotted (max +30%)".

## Binder: Rare

### Chuck Norris (bi_r1): Binder / rare / CRIT_CHANCE
- **Says (desc):** "Every 10th click is a super crit hit for 10× Aura!"
- **Says (cards.csv):** Matches desc.
- **Does (code):** `G.critClickCounter++` on every nugget `doClick`. Every 10th click, `clickMult *= 10` (game.js:1226-1235). It isn't added in `getBinderStats` any more, so there is **no double count** ✅.
  - AUTO_COLLECT auto-clicks don't go through `doClick`, so they never crit.
  - The Distracted Boyfriend echo copies `earned`, so an echoed crit also pays 10× (game.js:1263-1267).
  - The crit multiplies an active `clickMultValue`, Arthur Fist ×2 and frenzy ×10, and **ignores `CLICK_MULT_CAP`**. Gyatt 100× × crit 10× × frenzy 10× = a single 10,000× click.
- **Params read / unread:** All read.
- **Payout:**
  - EV is +90% click Aura (9×1 + 10 per 10 clicks). That is **+11.7% / +26% / +22%** of total.
  - 0 idle.
- **Skill/friction:** Clicking. The counter is deterministic and shown as a particle.
- **Interactions:** Expected value is the same percentage inside any buff window, so it isn't a real exploit. The 10,000× spike is a combo-test item (sweep 6.2 #6).
- **Flags:** OK (cleanup verified). The CLICK_MULT_CAP question goes to R4.
- **Fix (1 line):** None for the card. R4 should decide whether crits count against `CLICK_MULT_CAP`.

### Pepe (Mood Swing) (bi_r2): Binder / rare / MOOD_SWING
- **Says (desc):** "Switches modes every 30s: +20% Aura/sec, then +20% click Aura, then +10% on everything — then repeats!"
- **Says (cards.csv):** Matches desc.
- **Does (code):** `G.moodTimer` runs every frame whether or not Pepe is slotted, and `moodIndex++` every `cycleSec` (game.js:1567-1568). `getBinderStats` applies mode `moodIndex % 3` (game.js:642-648).
  - `moodIndex` isn't saved, so it restarts at the APS mode on load.
  - **The current mode isn't shown anywhere.** The label is a static "Rotating buff" (game.js:584) and nothing is logged, so the player can't play around it.
- **Params read / unread:** All read.
- **Payout:** Average over a cycle: **+10% / +10% / +8%** total. Idle: +10% / +10% / +8%.
- **Skill/friction:** None in practice (the mode is invisible).
- **Interactions:** "Pepe + mult window" combo is fine (≤ +20%).
- **Flags:** **Dom**. GigaChad (+14-17% active, +20% idle) beats it at every state, active or idle. It is the drop-first rare.
- **Fix (1 line):** Show the current mode on the slot and log changes. Raise the modes to +40% APS / +40% APC / +20% all, so the average (~+20%) matches GigaChad and players can time click sessions to the APC phase.

### GigaChad (bi_r3): Binder / rare / PASSIVE_APS_PCT
- **Says (desc):** "+20% Aura per second. The whole screen goes black and white."
- **Says (cards.csv):** Matches desc.
- **Does (code):** `apsMultBonus += 0.20` → `addAps = APS × 0.2` (game.js:616, 660). `body.gigachad-mode` gives grayscale(1) (game.js:1150-1152).
  - The CSS rule sits **before** `theme-fire/banana/ohio` (index.html:1251 vs 1384-1399) at the same specificity, so with those Fields the field filter wins and **the screen isn't black and white**.
  - Any burn that writes `document.body.style.filter` (game.js:1852, 2204-2205) also overrides it for its duration.
- **Params read / unread:** All read.
- **Payout:** +17% / +14% / +15% active. +20% idle.
- **Skill/friction:** None (the grayscale is a cosmetic "cost").
- **Interactions:** Sigma Slam + GigaChad + Rickroll combo: base APS +20% × Rickroll ×3. R4 is measuring it.
- **Flags:** TXT/cosmetic (grayscale lost under 3 Fields), **Dom** *by a common*: Doge gives +50% idle / +35-43% active with no friction.
- **Fix (1 line):** Move `body.gigachad-mode` after the field theme rules (or use `filter: grayscale(1) !important` combined with the theme filter). The numbers are fine once TIMED_DROPs are cut.

---

## Binder slot competitiveness (Rule 0.3)

**All 15 Binders, Mid state, % of total Aura/s (6 cps, skilled clicks), idle in brackets:**

| Rank | Card | Rarity | Mid active | Mid idle |
|------|------|--------|-----------|----------|
| 1 | Cheezburger (+Doge combo) | U | +255% | 0 |
| 2 | Stonks | C | +53% | 0 |
| 3 | Doge | C | +35% | +50% |
| 4 | Chuck Norris | R | +26% | 0 |
| 5 | GigaChad | R | +14% | +20% |
| 6 | Expanding Brain (40 min) | U | +12% (grows) | 0 |
| 7 | Success Kid | U | +10% + Kek + luck | +10% |
| 8 | Pepe | R | +10% | +10% |
| 9 | Shrek | C | +5% | +5% |
| 10 | Grumpy Cat | U | +3% + 10% cost + Kek | +3% |
| 11 | Harold | U | +3% | +3% |
| 12 | Big Chungus | U | +1.5% | 0 |
| 13 | Harambe | C | +0.3% (+4.3 Kek/min) | 0 |
| — | Philosoraptor | C | 2 Kek/min | — |
| — | First World Problems | C | 0 | +50% |

So an optimal Mid binder is **Cheezburger, Doge, Stonks, Chuck Norris, plus GigaChad or Brain.** Three of the five are TIMED_DROPs, two of them commons. This breaks Rule 0.3 in the opposite direction from BALANCE_PLAN's fear: commons are *stronger* than rares.

| Rarity | Drop first | Why | Always kept |
|--------|-----------|-----|-------------|
| Common | **First World Problems**, then **Shrek** | FWP is strictly dominated by Doge (same idle +50%, Doge also pays while active). Shrek's +5% is 1/7th of Doge. Harambe/Philosoraptor survive only as Kek picks | Doge + Stonks (over budget) |
| Uncommon | **Big Chungus**, then **Harold** | Chungus +0.7-1.5% with its main promise NOOP. Harold is Grumpy minus the discounts | Cheezburger (≈10× over budget) |
| Rare | **Pepe** | Lower than GigaChad in every state, active and idle, and its mode is invisible | Chuck (active) / GigaChad (idle) is a real choice ✅ |

**Dom flags from this test:** FWP (by Doge), Big Chungus, Harold (by Grumpy), Pepe (by GigaChad), and GigaChad/Pepe/Shrek/Grumpy/Harold/Success Kid in raw Aura terms (by Doge/Stonks/Cheezburger).

**Root fix:** bring TIMED_DROP `valueEAS` down to %-card levels: Doge ≈ +8%, Stonks ≈ +13% skilled, Cheezburger ≈ +17% solo / +33% with Doge. Then re-run this table. Expected order after that: Chuck ≈ GigaChad > Pepe (buffed) > Cheez combo > Brain (capped) ≈ Success Kid > Stonks > Doge ≈ Shrek, which is a sane rarity curve.

---

## Stacking checks (R1 checklist)

| Check | Result | Where |
|-------|--------|-------|
| Shrek + Harold drain | ✅ Multiplicative: 0.9 × 0.8 = 0.72 → 1.44%/s. Captured at boss start. Changes the rate only; the 20% cap is unchanged | game.js:614, 632, 2943, 3003-3005 |
| Grumpy + Success Kid pack discount floor | ✅ `max(1, base − floor(2 + min(5, 0.2·unique)))`. The floor only bites at packsPurchased 0-1 with ≥25 unique (impossible that early), so in practice it never triggers. Max saving 7 Kek = 35% of pack #10, 14% of pack #30. Not an exploit | game.js:682-686 |
| Cheezburger + Doge combo | ✅ Works (`binderSlots.includes('bi_c5')`), but the result is +255-313% Aura/s for 2 slots, way over budget | game.js:1621-1623 |
| Chuck crit EV vs real crit | ✅ Counted once (only in `doClick`). Crits stack on top of the click buff, frenzy and Arthur Fist, ignoring `CLICK_MULT_CAP` | game.js:635, 1226-1235, 1253-1254 |
| `getBinderStats` call order / `Date.now()` | Expanding Brain is the only time-dependent card. Call-order effects are sub-ms, so harmless. The real problem is offline/unslotted growth (X). Success Kid recounts the collection on each of the 13 call sites (perf nit) | game.js:636-640, 650 |
| Same Binder in two slots | ✅ Blocked in the UI (an equipped card has no EQUIP button, game.js:981-990). `equipCard()` itself doesn't check (game.js:1007-1008), so only the console could do it | |
| PBJ + Kek burns | ⚠️ PBJ adds +1 per `spawnKekCoin`, so Brian 2 → 4 and multi-copy Brian ×2. D1 cap limits it | game.js:2225, 2254, 2355-2361 |
| Sigma + AUTO_COLLECT | ❌ The card is consumed before the handler refuses it | game.js:1820, 2111-2114 |
| GigaChad + Field filters | ⚠️ The Field filter wins for Ohio, Fire and PBJ | index.html:1251 vs 1384-1399 |

**Duplicate copies:** confirmed useless. Binder and Field cards can only be slotted once, and there is no sell/upgrade/convert path (`dismissPack` just increments the count, game.js:818). D5 (dupes → Kek) applies.

---

## Ranked problem list

### P0: broken (NOOP / BUG / X)
1. **Moth and Lamp blackout stuck after a field swap.** Swapping to another Field mid-blackout leaves the screen black indefinitely (game.js:1675-1716, 1068-1084). Fix: call `_mothBlackoutEnd()` and reset `_mothBlackoutAccum` in `applyFieldTheme()` when the field isn't f4.
2. **Expanding Brain unbounded and grows offline/unslotted** (game.js:636-640). Fix: D2, accumulate `dt` while slotted and cap at +30%.
3. **Big Chungus `scale: 1.5` and "easier chase events" are NOOP** (game.js:133, 622-625). Fix: implement the nugget scale and a bigger `.burn-target` hitbox, or cut both from the text.
4. **PBJ `cardDropRate` NOOP** (game.js:120). Fix: per D3, cut the line and give PBJ a real tradeoff (see P1-4).
5. **Sigma Slam eats AUTO_COLLECT burns** (game.js:1820, 2111-2114). Fix: check `disableAutoCollect` before `G.collection[cardId]--` and grey the card out in the burn bar.
6. **First World Problems dead after reload until the first click** (`lastIdleClickTime` starts at 0, game.js:80, 1646). Fix: initialise it to `Date.now()` on load.

### P1: unbalanced (budget / Dom / C)
1. **TIMED_DROP binders are 5-20× over budget:** Cheezburger +127-157% (+255-313% with Doge), Stonks +53-65%, Doge +35-50% (game.js:126, 128, 135, 1610-1638). They dominate every %-card including both rares. Fix: `valueEAS` Doge 30→5, Stonks 75→12, Cheez 120→10 (combo stays 2×).
2. **First World Problems dominated by Doge** (same +50% idle). Fix: after cutting Doge, raise FWP's `idleApsMult` to 1.75-2.0 so it's the AFK pick.
3. **Pepe dominated by GigaChad and its mode is invisible** (game.js:139, 584, 1567-1568). Fix: show and log the mode, and use moods +40% APS / +40% APC / +20% all.
4. **PBJ dominates Nyan Cat and has no downside**: +40% vs +30% mult and +13.8 vs 9 Kek/min at 6 cps (game.js:117, 120, 2355-2361). Fix: on the PBJ side, use mult 0.25-0.30 or "+1 Kek every 2nd drop". Keep Curtis's Nyan unchanged.
5. **Sigma Slam's tradeoff only exists if you own 5 specific cards.** Best field at every state (game.js:116). Fix: give it a universal cost (e.g. TIMED_DROP/Kek coins fall faster) or use +70%.
6. **Big Chungus is the weakest Binder** (+0.7-1.5%) and **Harold is Grumpy minus the discounts** (game.js:133-134). Fix: Chungus `apcBonus` 0.05 → 0.25 with a working scale. Harold gets a hook (drain −50% + boss reward +25%).
7. **Moth vs This is Fine end at the same +65%**, and Fire's friction is milder after a one-time 150s ramp (game.js:118-119, 674). Fix (keeps Curtis's design): Moth 0.70 *or* Fire max 0.60.

### P2: polish (TXT / cosmetic)
1. **"N Aura" text on Stonks/Doge/Cheezburger means N *seconds of income*.** Stonks' ±30% isn't mentioned. Fix: reword as "≈N seconds of Aura".
2. **Ohio "50% more often" is really +40%** (game.js:1408-1409). Fix: bias 0.125, or change the text.
3. **Additive mults are diluted by Sigma Glaze:** "+5%" is +2% at Late for Shrek, Grumpy, Harold, Success Kid, Pepe-global and all Fields (game.js:1253, 1563). Fix: either make Field/Binder mults multiplicative on base, or say "+0.05× mult".
4. **GigaChad grayscale overridden by the Ohio/Fire/PBJ theme filters** (index.html:1251 vs 1384-1399). Fix: reorder the CSS or combine the filters.
5. **Moth's `--mx/--my` are never set**, so the permanent spotlight sits at screen centre (index.html:1263). Fix: set them on mousemove, or remove the `::before`.
6. **Nyan "up to 2 on screen" can't happen; `cursorTrail` param unused** (game.js:117, 2611). Fix: drop the clause and the param.
7. **This is Fine hardcodes 0.25 instead of `params.mult`** (game.js:674). Fix: read the param.
8. **Philosoraptor drops a falling 🦖, not a drifting "?"** (game.js:1628). Fix: emoji ❓ or reword.
9. **Success Kid's "per card type owned" drops when Burns are used; its luck shift comes only from uncommons** (game.js:650, 698). Fix: count ever-pulled ids and document the shift.
10. **Free instant Field swaps allow "swap to Ohio for the kill" cheese** (game.js:2961-2967). Fix: optionally add a 30s field-swap cooldown.
11. **Duplicate Binder/Field pulls are worthless** (game.js:818). Fix: D5.
