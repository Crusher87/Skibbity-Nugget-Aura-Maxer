# R2 — Burn Commons review (bu_c1 – bu_c18)

Reviewed against `game.js` at commit `afe4c54` (= `e84fc53` merge of cleanup PR #2; the later commit only touches docs). All line numbers are `game.js:LINE` unless prefixed `index.html:`. Read-only review; math done by hand, then cross-checked against `node tools/card-sim.js` (seed 12345). The sim's section (b) agrees with every common's Early/Mid/Late value below, including the 13.8 Kek/min baseline and the pack #10/#30 costs of 18/48. The sim does not model combos (the Gyatt extension, the SWK+Chipmunk timer, the Rickroll overwrite) or the boss-overlay blocking; those come from reading the code.

## 0. Reference numbers used

Derived from `UPGRADES` (game.js:96-100) and `buyUpgrade` (game.js:1356-1358); no binder, no field.

| State | APS | APC | allAuraMult | `computeEAS()` | Click value (APC × mult) | Click value ÷ EAS | 6 cps clicking, EAS/s |
|-------|-----|-----|-------------|----------------|--------------------------|-------------------|-----------------------|
| Early (10/2/0/0/0) | 40 | 1 | 1.0 | 40 | 1 | 0.025 | 0.15 |
| Mid (40/20/5/2/0) | 740 | 51 | 1.0 | 740 | 51 | 0.069 | 0.41 |
| Late (80/50/20/15/3) | 3,830 | 201 | 2.5 | 9,575 | 502.5 | 0.052 | 0.31 |

**Kek baseline.** Drop on the 30th click or 1%/click RNG (game.js:1279-1284) → expected 26.0 clicks per drop (Σ₀²⁹ 0.99ᵏ). At 6 cps that is **13.8 Kek/min**. Pack cost = `5 + floor(packsPurchased × 1.5)` (game.js:682-686): the 10th pack costs **18**, the 30th costs **48** (cost when `packsPurchased` = 9 / 29). Common Kek budget (plan 3.3) = ¼ pack = **4.5 Kek @ #10, 12 Kek @ #30**.

**Pull odds.** One specific common = 0.9 × 0.6 / 24 = 2.25% per pack (game.js:688-701) → ~44 packs per copy, so N copies ≈ 44·N packs.

**Conventions.** "Max" = every target hit. Skill cards also show skilled 90% / casual 50% hit rates. Click cards assume 6 cps (casual = 3 cps = half the value). Frenzy needs 7 cps (game.js:34, 1306), so it is *not* active at the 6 cps reference. It is shown separately where relevant.

---

## 1. Per-card blocks

### Troll Face (bu_c1) — Burn / common / TARGET_CHASE
- **Says (desc):** "The nugget runs away! Chase it and click it within 5s to earn 45 Aura." (game.js:144)
- **Says (cards.csv):** matches desc (cards.csv:28)
- **Does (code):** spawns one 1-HP 😈 target in `#burn-fx` at a random position. It drifts at 3 px per animation frame and bounces off the edges (game.js:2682, 2741-2752). Clicking it pays `computeEAS() × 45`, snapshotted at activation (game.js:2680, 2732-2734). After 5s *every* `.burn-target` in `#burn-fx` is removed (game.js:2758-2761).
- **Params read / unread:** targets, timeout, rewardEAS read. No unread params.
- **Payout:** 45 EAS max at every state (1,800 / 33,300 / 430,875 Aura). Skilled 40.5, casual 22.5 EAS. The target is large (2.5rem) and slow, and you get 5s, so the real hit rate is close to 100%. 0 Kek.
- **Skill/friction:** chase (trivial). It is not the nugget, and it does not run away from the cursor.
- **Interactions:** `computeEAS` includes `apsMultTimer` (game.js:1743), so Charlie, Dream or Rickroll raise the reward 1.5× or 3×. The target sits above the boss overlay (z 500 vs 400), so it is clickable during a boss. Its 5s cleanup also deletes targets from any other chase card that is still running (Britney, Knuckles, Leroy, End of Ze World), because it removes all `.burn-target` elements, not just its own (game.js:2759). Not blocked by Sigma Slam.
- **Flags:** TXT (no "runs away"; "45 Aura" is really 45 seconds of income), C (same shape as Leroy Jenkins bu_r3: one slow-drifting single-hit target), BUG (cross-card target cleanup, systemic in `spawnBurnTarget`). Drift is per frame, so it moves faster on 120/144 Hz screens.
- **Notes / suggested fix:** make it flee the cursor (claim the "juke" position on the TARGET_CHASE axis, which matches the text), and remove only its own target on timeout.

### Is This a Pigeon? (bu_c2) — Burn / common / COIN_RAIN (sine)
- **Says (desc):** "6 butterflies float around in crazy zigzag patterns! Click all of them in 4s for 7.5 Aura each." (game.js:145)
- **Says (cards.csv):** matches desc (cards.csv:29)
- **Does (code):** spawns 6 butterflies, one every 667 ms (game.js:1918, 1997). Each moves in a **straight diagonal line**: constant `vx` of up to ±30 vw/s and a fall speed of 60–100 px/s (game.js:1969-1980). Nothing makes it zigzag. Each one is removed 4.5s after it spawns (game.js:1994). A click pays `computeEAS() × 7.5`, read at click time (game.js:1984).
- **Params read / unread:** coins, valueEASEach, duration, motion read.
- **Payout:** 45 EAS max at every state. Skilled 40.5, casual 22.5. 0 Kek.
- **Skill/friction:** click moving targets. The easiest of the three coin rains: the whole wave lasts ~7.8s, and butterflies only fall 270–450 px before they vanish.
- **Interactions:** affected by the APS buff (1.5× with Charlie/Dream, 3× with Rickroll). Disaster Girl's sweep auto-clicks the butterflies (game.js:2164-2166). Clickable during a boss.
- **Flags:** TXT ("zigzag" is a straight line; "4s" is really ~7.8s; "Aura" means EAS). BUG (minor): `step(16)` assumes 16 ms per frame (game.js:1979, 1993), so speed depends on frame rate, and there is no horizontal bound, so fast butterflies leave the screen.
- **Notes / suggested fix:** add a real sine term to x (`x = x0 + A·sin(t·ω)`), clamp x to the viewport, and use the real rAF `dt`.

### Spiderman Pointing (bu_c3) — Burn / common / AUTO_COLLECT
- **Says (desc):** "Two Spidermen point at each other — and every Kek Koin on screen gets scooped up! Then auto-clicks the nugget 10 times at 1.5× power." (game.js:146)
- **Says (cards.csv):** matches desc (cards.csv:30)
- **Does (code):** collects every 3D Kek coin that is in the `idle` or `settling` phase (game.js:2123-2129). Coins still in mid-air are skipped. Then it makes 10 synthetic clicks over 5s, each worth `(APC + addApc) × mult × 1.5`. The clicks skip `clickMultValue`, frenzy, crits, Kek drop rolls and echo (game.js:2131-2148). No "two Spidermen" visual exists.
- **Params read / unread:** clicks, mult, duration, autoCollectKekCoins read.
- **Payout:** 15 click values = **0.38 / 1.03 / 0.79 EAS** (Early / Mid / Late). Kek: the scoop adds nothing new, because 3D Kek coins never expire (the idle phase has no timeout, game.js:2490-2495), so the player would collect them anyway. It is convenience only. The one exception is a big Bad Luck Brian "Use All" pile, where the scoop saves hundreds of clicks.
- **Skill/friction:** none.
- **Interactions:** Sigma Slam blocks it, and the card is **still consumed** (it is decremented at game.js:1820 before the handler returns at 2111-2114). It applies Mocking SpongeBob doubles (it goes through `collectKekCoin`, game.js:2405). Combined with Brian ×N it auto-collects the whole pile.
- **Flags:** D (Sigma Slam; also when no coins are on screen), BUG (card wasted under Sigma Slam), TXT (cosmetic "two Spidermen"), and **out of budget**: 1–3% of the Common EAS budget.
- **Notes / suggested fix:** pay a real budget (for example 10 clicks worth 3–4 EAS each, scaled from EAS not APC), or make the scoop pay +1 Kek per coin scooped so the hook is worth something.

### Distracted Boyfriend (bu_c4) — Burn / common / AUTO_COLLECT (echo)
- **Says (desc):** "Every click spawns a second ghost click 150px away for 8s. Two clicks for the price of one!" (game.js:147)
- **Says (cards.csv):** matches desc (cards.csv:31)
- **Does (code):** sets `G.echoTimer = 8` and `G.echoOffset = 150` (game.js:2116-2120; `echoOffset` is now read, so the cleanup PR fix is confirmed). In `doClick`, every real nugget click adds `earned` a second time (game.js:1264-1268). That `earned` already includes `clickMultValue`, the Chuck Norris crit, the Arthur double and frenzy ×10. The 150 px offset only moves the particle. The echo is not a real click at that spot, so it hits no coins or targets.
- **Params read / unread:** echoClick, echoDuration, echoOffset read (the offset is cosmetic).
- **Payout:** 48 extra click values at 6 cps = **1.20 / 3.31 / 2.52 EAS** (casual 3 cps: half that). During frenzy at 7 cps (10×): 560 click values = 14 / 38.6 / 29.4 EAS. During Level 67 Gyatt (100×): 4,800 click values = **120 / 331 / 252 EAS**.
- **Skill/friction:** click (scales with your own cps).
- **Interactions:** echo does **not** trigger Kek drops, count toward frenzy, advance the Chuck Norris crit counter or count for All Your Base, because those all use the real click only (game.js:1271-1284). It *does* copy the value of a real crit or frenzy click. It does not copy OAG's Kek per hit (game.js:1256-1260). It is an amplifier for every click buff. Blocked by Sigma Slam (card consumed). Useless during a boss, because the boss overlay blocks nugget clicks (index.html:1402-1416, z 400 over the nugget at z 50).
- **Flags:** D (Sigma Slam, boss), TXT ("ghost click 150px away" is really "+100% click Aura"), out of budget alone (3–7% of Common). Combo spike with Gyatt (5–7× the Common cap).
- **Notes / suggested fix:** retext as "clicks count double for 8s". Raise the duration or pay from EAS so it is worth using without Gyatt, or accept it as a deliberate combo card and document that.

### Mocking SpongeBob (bu_c5) — Burn / common / KEK_DOUBLE_BUFF
- **Says (desc):** "Your next 5 Kek Koins are worth DOUBLE. Stack multiple copies and use them all at once to double even more!" (game.js:148)
- **Says (cards.csv):** matches desc (cards.csv:32)
- **Does (code):** `G.kekDoubleCount += 5` (game.js:2228-2233). The count is spent only in `collectKekCoin` for 3D nugget coins (game.js:2405-2406). It does **not** apply to Kek from burn coins (Chocolate Rain, Philosoraptor: game.js:2547-2549), Gabe, OAG per-hit Kek, Zombie Turtle, End of Ze World or the PBJ bonus. The count is saved (game.js:3077).
- **Multi-copy (game.js:2256-2258):** **linear**, `5 × N` doubles. Yet the "Use All" button tooltip promises `2^N − 1` × power (game.js:1787), and the desc says "double even more". Use All = using the copies one by one; it only saves cooldowns.

  | N | Doubles | Extra Kek | Clicks to cash out (26/coin) | % of pack #30 |
  |---|---------|-----------|------------------------------|---------------|
  | 1 | 5 | 5 | ~130 (22s) | 10% |
  | 2 | 10 | 10 | ~260 | 21% |
  | 3 | 15 | 15 | ~390 | 31% |
  | 5 | 25 | 25 | ~650 | 52% |
  | 10 | 50 | 50 | ~1,300 (3.6 min) | 104% |
- **Payout:** 0 Aura. **+5 Kek** = 0.36 min of Kek income = **28% of pack #10** (just over the ¼ budget) and 10% of pack #30. Paid out over the next ~130 clicks.
- **Skill/friction:** none (deferred payout).
- **Interactions:** stacks with Bad Luck Brian (doubles Brian's coins) and with Nyan Cat drops. Spiderman's scoop spends the doubles.
- **Flags:** TXT (multi-copy is linear, and the button says exponential), borderline K at pack #10 only. OK otherwise.
- **Notes / suggested fix:** fix the button tooltip so it reads per archetype ("+5 doubles each"), or make it ×(2^N−1) capped at N=3 (D1) if exponential is wanted. Let the doubles apply to all Kek sources, or say "Kek Koins from the nugget".

### Bad Luck Brian (bu_c6) — Burn / common / KEK_SPAWN
- **Says (desc):** "he drops 2 Kek Koins! Hold multiple copies and use them all at once for exponential payout!" (game.js:149)
- **Says (cards.csv):** matches desc (cards.csv:33)
- **Does (code):** calls `spawnKekCoin()` twice, 120 ms apart (game.js:2223-2226). These are 3D nugget coins: they never expire and need a click each (or a Spiderman scoop). Each `spawnKekCoin` also grants the PBJ `kekDropBonus` (+1) straight away (game.js:2356-2361). Each coin is doubled by SpongeBob.
- **Multi-copy (game.js:2248-2255):** `2 × (2^N − 1)` coins, spawned 80 ms apart. Copies are uncapped (`activateBurnMulti` takes all of `G.collection[cardId]`, game.js:2242-2246).

  | N | Coins / Kek | Per card | Minutes of Kek income | % of pack #10 / #30 | Packs to hold N (~44/copy) |
  |---|-------------|----------|-----------------------|---------------------|----------------------------|
  | 1 | 2 | 2 | 0.14 | 11% / 4% | 44 |
  | 2 | 6 | 3 | 0.43 | 33% / 13% | 89 |
  | 3 (D1 cap) | 14 | 4.7 | 1.0 | 78% / 29% | 133 |
  | 5 | 62 | 12.4 | 4.5 | 344% / 129% | 222 |
  | 10 | 2,046 | 205 | 148 | 114 packs / 43 packs | 444 |

  With PBJ field the counts double again (bonus +1 per spawn). With SpongeBob doubles active, each collected coin counts 2.
- **Payout:** 0 Aura. **+2 Kek** = 11% of pack #10 and 4% of pack #30. Inside budget for a single use.
- **Skill/friction:** click each coin (a chore at large N).
- **Interactions:** PBJ, SpongeBob, Spiderman (see above). N=10 spawns 2,046 three.js meshes, each with cloned materials (game.js:2313-2320), over 164s. That is a likely frame-rate and memory problem.
- **Flags:** X (uncapped 2^N; already decision D1a), K at N ≥ 5, BUG (perf at large N).
- **Notes / suggested fix:** D1: `n = min(n, 3)` and consume only 3. At large N, spawn one "jackpot" coin worth the total instead of thousands of meshes.

### Epic Fail Guy (bu_c7) — Burn / common / INSTANT_BURST
- **Says (desc):** "30 seconds worth of Aura right now!" (game.js:150)
- **Says (cards.csv):** matches desc (cards.csv:34)
- **Does (code):** `computeBaseEAS() × 30`, paid instantly (game.js:1887-1890). It reads the base EAS (no `apsMultTimer`, game.js:1750-1756), so Rule 0.1 holds.
- **Params read / unread:** apsSeconds read.
- **Payout:** **30 EAS** at every state (1,200 / 22,200 / 287,250 Aura). 0 Kek.
- **Skill/friction:** none.
- **Interactions:** none (Rickroll does not amplify it ✓). Pays only 1 Aura at 0 APS (floor at game.js:1756).
- **Flags:** OK. It is the low-end "instant" anchor. In practice it is the same card as All Your Base (see bu_c18).
- **Notes / suggested fix:** none for itself. Keep it as the no-skill baseline at the bottom of the band.

### Charlie Bit My Finger (bu_c8) — Burn / common / TEMP_APS_MULT
- **Says (desc):** "Get 1.5× Aura per second for 20s." (game.js:151)
- **Says (cards.csv):** matches desc (cards.csv:35)
- **Does (code):** **overwrites** `G.apsMultValue = 1.5` and `G.apsMultTimer = 20` (game.js:1908-1911). It does not take the max like `TEMP_CLICK_MULT` now does (the cleanup PR fixed only the click side). Used during Rickroll (3×/60s, game.js:174), it **replaces the 3× with 1.5×** and cuts the remaining time to 20s. A second Charlie just resets the timer to 20s.
- **Params read / unread:** mult, duration read.
- **Payout:** +0.5 × 20 = **10 EAS** at every state, a third of the Common floor. Side effect: every `computeEAS()` payout during the window is 1.5×. That covers coin rains, Troll Face, Dentist and the **boss reward** (game.js:2956: 300 → 450 EAS, +150 EAS if a boss dies in the window).
- **Skill/friction:** none.
- **Interactions:** Rickroll clobber (see above). Boosts COIN_RAIN, TARGET_CHASE and SCREEN_GAG payouts, which read `computeEAS` and not base. That leak breaks the spirit of Rule 0.1. The burn bar (z 90) sits under the boss overlay (z 400, `pointer-events:auto`, index.html:924-929 vs 1402-1416), so it cannot be used during a boss fight. (Static CSS reading; R4 should confirm in the smoke test.)
- **Flags:** **Dom** (by Dream), BUG (overwrites a stronger APS buff, so using it can cost about −110 EAS when it lands on a fresh Rickroll), under budget (10 vs 30–45).
- **Notes / suggested fix:** `apsMultValue = max(cur, p.mult)` and `apsMultTimer = max(cur, dur)` (mirror game.js:1905-1906). Rebuild it as "shorter, stronger", for example 2.5× / 20s (= 30 EAS), so Dream is not strictly better.

### Have You Ever Had A Dream (bu_c9) — Burn / common / TEMP_APS_MULT
- **Says (desc):** "1.5× Aura per second for 20s AND the Skibidi Toilet freezes!" (game.js:152)
- **Says (cards.csv):** matches desc (cards.csv:36)
- **Does (code):** same as Charlie, plus `G.bossPauseTimer = 20` (game.js:1912). While the timer is above 0, `tickBoss` skips the drain and keeps refreshing `lastInteract`, so the boss can't auto-resolve (game.js:2991-2998). The sprite keeps animating, and the drain readout says "(FROZEN)". **`pauseBoss` is wired (cleanup PR confirmed).** It does not stop a boss from spawning, which is fine.
- **Params read / unread:** mult, duration, pauseBoss all read.
- **Payout:** **10 EAS** plus the freeze. Freeze value when a boss is up: it saves about 2%/s × kill time (~3.3s at 6 cps) ≈ 6.7% of *banked* Aura. If the boss is killed inside the window, the boss reward also gets 1.5× (+150 EAS). The catch is that the burn bar is under the boss overlay, so Dream **can't be cast once a boss is up**. It only works pre-armed. Bosses come at ~1/5 of events, with events every 90–180s (game.js:1383-1389, 1405-1414, 1603-1606), so about one every 11 min. A random 20s window catches one ~3% of the time. In practice it behaves the same as Charlie.
- **Skill/friction:** none.
- **Interactions:** same Rickroll overwrite bug as Charlie. While frozen, the boss keeps blocking nugget clicks for the full 20s unless you kill it. Vitas and Shrek/Harold are unaffected.
- **Flags:** BUG (same overwrite), D (no boss is on screen ~97% of the time, and it can't be cast during one), under budget.
- **Notes / suggested fix:** move the burn bar above the boss overlay (z > 400) so Dream (and Vitas) can be cast reactively. Then 10 EAS + freeze is a fine "utility" common, and Charlie gets the pure-value role.

### Kazoo Kid (bu_c10) — Burn / common / COIN_RAIN (gravity)
- **Says (desc):** "10 Aura drops fall from the top with heavy gravity... Catch them before they hit the floor for 4.5 Aura each." (game.js:153)
- **Says (cards.csv):** matches desc (cards.csv:37)
- **Does (code):** one drop every 800 ms. Each falls the full screen in `(1.5–2.5) × 8/10` = **1.2–2.0s** with ease-in (game.js:2001-2024; index.html:1141-1150, 1178-1180). A click pays `computeEAS() × 4.5`.
- **Params read / unread:** coins, valueEASEach, duration, motion read.
- **Payout:** 45 EAS max. Skilled 40.5, casual 22.5. 0 Kek.
- **Skill/friction:** click accelerating targets, one at a time. Medium difficulty.
- **Interactions:** APS buff boost, Disaster Girl sweep, clickable during a boss.
- **Flags:** TXT ("Aura" = EAS). OK otherwise. This is the only coin rain whose text matches its motion.
- **Notes / suggested fix:** none beyond the unit wording.

### Star Wars Kid (bu_c11) — Burn / common / TEMP_CLICK_MULT
- **Says (desc):** "Get 2× click Aura for 15s." (game.js:154)
- **Says (cards.csv):** matches desc (cards.csv:38)
- **Does (code):** `clickMultValue = max(cur, min(10, cur × 2))` and `clickMultTimer = max(timer, 15)` (game.js:1902-1907). There is one shared value and one shared timer for every click buff. The cleanup PR fix ("never lowers a bigger boost") is confirmed. It has two side effects:
  1. **It extends Level 67 Gyatt.** With Gyatt at 100× and 1s left, SWK keeps 100× (max) and pushes the timer to 15s. That is 15 extra seconds of 100× = 99 × 15 × 6 = 8,910 click values = **223 / 614 / 468 EAS**. Uncommon-to-rare value from a common.
  2. **SWK + Chipmunk = 10× for the full 15s** (one timer). That is 810 extra click values (20 / 56 / 43 EAS) against the intended 330 (2× for 15s with 10× for 5s).
- **Params read / unread:** mult, duration read.
- **Payout (alone, 6 cps):** +1 × 15s × 6 = 90 click values = **2.25 / 6.20 / 4.72 EAS** (casual half). During frenzy (7 cps, 10s overlap): 18 / 51 / 39 EAS.
- **Skill/friction:** click.
- **Interactions:** frenzy ×10 and crits stack on top of the 10× cap (game.js:1226-1254), so the real ceiling is 10 × 10 × crit. Boyfriend echo doubles it. Auto-collect clicks ignore it. Useless during a boss (nugget blocked).
- **Flags:** X (extends Gyatt and Chipmunk through the shared timer), **Dom** (by Chipmunk: 15 vs 20 extra click-seconds, and Chipmunk fits inside a frenzy), under budget alone.
- **Notes / suggested fix:** give each click buff its own timer (a list of `{mult, until}`, product capped at 10), so no buff can extend another.

### Vitas (Chum Drum) (bu_c12) — Burn / common / AUTO_COLLECT (piercing)
- **Says (desc):** "12 ghost clicks at 2.5× power over 5s — they even go through the Skibidi Toilet's armor!" (game.js:155)
- **Says (cards.csv):** matches desc (cards.csv:39)
- **Does (code):** 12 synthetic clicks at 2.5× (base click value only, game.js:2141-2148). With a boss up, each click also adds a boss defeat hit (game.js:2150-2159). That is 12 of the 20 hits needed within 8s, so it can't kill the boss alone.
- **Params read / unread:** clicks, mult, duration, piercesBoss read.
- **Payout:** 30 click values = **0.75 / 2.07 / 1.57 EAS**. Boss help: it saves roughly 2s of boss clicking, about 4% of banked Aura in avoided drain. **But** it can only be cast before the boss appears (burn bar under the overlay, see Charlie), and its hits only land if the boss spawns inside the 5s auto-click window. In practice the pierce almost never fires.
- **Skill/friction:** none.
- **Interactions:** Sigma Slam blocks it (card consumed). Ignores click buffs, frenzy and crits.
- **Flags:** D (Sigma Slam; boss hook unreachable), TXT (the boss has no "armor"; the boss overlay just blocks the nugget), under budget (2–5% of Common).
- **Notes / suggested fix:** make the burn bar usable during a boss. Retune it as the "boss killer": 20 hits in 3s = instant win, plus a small EAS payout.

### Pink Guy Ravioli (bu_c13) — Burn / common / COIN_RAIN (fade)
- **Says (desc):** "8 pieces of ravioli splat on screen and fade away in 1.5s — click them fast for 5.6 Aura each!" (game.js:156)
- **Says (cards.csv):** matches desc (cards.csv:40)
- **Does (code):** all 8 appear **at once** at random spots, with a fade staggered by `i × 0.1s` (game.js:2028-2046). Each is removed at 2.0s whatever its delay (game.js:2044). The first ones are fully invisible but still clickable for the last ~0.5s. A click pays `computeEAS() × 5.6`.
- **Params read / unread:** coins, valueEASEach, motion, fadeDuration read. **`duration: 6` is unread** (the fade branch never uses `dur`).
- **Payout:** 44.8 EAS max. Skilled 40.3, casual 22.4. Realistically this is the hardest coin rain: 8 aimed clicks across the whole screen in ~2s.
- **Skill/friction:** precision speed-clicking.
- **Interactions:** APS buff boost. Disaster Girl's sweep covers the screen in 4s, which is too slow to reach ravioli in the right half before they vanish.
- **Flags:** **Dom** (same 45 cap as Pigeon and Kazoo, but much harder, so its EV is lower for the same rarity), TXT ("Aura" = EAS), NOOP (minor: the `duration` param).
- **Notes / suggested fix:** pay it at the top of the Rule 0.5 skill premium (8 × 7.5 = 60 EAS), or stagger spawns over the 6s `duration`.

### Dramatic Chipmunk (bu_c14) — Burn / common / TEMP_CLICK_MULT
- **Says (desc):** "Get 5× click Aura for 5 epic seconds!" (game.js:157)
- **Says (cards.csv):** matches desc (cards.csv:41)
- **Does (code):** same handler as SWK (game.js:1902-1907): ×5 capped at 10, timer = max(timer, 5).
- **Params read / unread:** mult, duration read.
- **Payout (alone, 6 cps):** +4 × 5s × 6 = 120 click values = **3.0 / 8.3 / 6.3 EAS**. Inside frenzy (7 cps, the 5s fits in the 10s window): 1,400 click values = **35 / 96 / 73 EAS**. Used near the end of Gyatt: 99 × 5 × 6 = 2,970 click values = 74 / 205 / 156 EAS.
- **Skill/friction:** click (burst; rewards timing it with a frenzy).
- **Interactions:** same shared-timer extension as SWK. With SWK, 10× lasts 15s.
- **Flags:** X (shared timer), under budget alone. Inside budget with frenzy, which is the intended play.
- **Notes / suggested fix:** keep the "burst" identity. Fix the shared timer. The base value only reaches budget if clicks are worth more (D6) or the multiplier is applied to EAS.

### Disaster Girl (bu_c15) — Burn / common / AUTO_COLLECT (sweep)
- **Says (desc):** "Fire sweeps across the screen and automatically collects any nearby Aura drops and targets in its 150px path!" (game.js:158)
- **Says (cards.csv):** matches desc (cards.csv:42)
- **Does (code):** a cosmetic fire band moves left to right over 4s (game.js:2135-2141). There are 10 ticks; on each, every uncollected `.burn-coin` whose **left edge** is within 150 px of `sweepX = i/10 × width` gets `el.click()` (game.js:2160-2167; the cleanup PR centre-only bug is fixed ✓). It also makes 10 synthetic clicks at 3× (game.js:2141-2148), which the text does not mention.
  - **Hits:** coin-rain coins (Pigeon, Kazoo, Ravioli, Shooting Stars), Chocolate Rain's Kek burn coins (onclick, game.js:2554-2555), **Gabe's bones** (`.burn-coin motion-bones`, game.js:1925-1928, which helps the "catch all" Kek reward), and non-hover TIMED_DROP coins.
  - **Misses:** `.burn-target` (**the "targets" in the text never happen**), hover-only coins (Philosoraptor, `requireHover` drops, because `el.click()` does not fire `mouseenter`, game.js:2557-2558, 2666-2667), and 3D Kek coins.
- **Params read / unread:** clicks, mult, duration, sweep, sweepRadius read.
- **Payout:** alone, 30 click values = **0.75 / 2.07 / 1.57 EAS**. Its real value is the coins it collects: after Pigeon it can pick up the whole 45 EAS hands-free, and after Kazoo most of it.
- **Skill/friction:** none (but you need a coin rain or drop on screen).
- **Interactions:** Sigma Slam blocks it (card consumed). Strong with COIN_RAIN, Gabe and Chocolate Rain. That is a two-card play, gated by the 1.5s cooldown.
- **Flags:** TXT (no targets; the 3× clicks are not mentioned), D (Sigma Slam; nothing on screen), under budget alone.
- **Notes / suggested fix:** also sweep `.burn-target` (one hit per tick) and hover coins, or drop "targets" from the text. Mention the auto-clicks or remove them.

### David After Dentist (bu_c16) — Burn / common / SCREEN_GAG
- **Says (desc):** "Screen goes blurry for 6s and the nugget gets huge — sit through it for 55 Aura!" (game.js:159)
- **Says (cards.csv):** matches desc (cards.csv:43)
- **Does (code):** the amount is snapshotted at cast, `computeEAS() × 55` (game.js:2193). Then `body.style.filter = blur(2px)` (`min(8,8)/4`, game.js:2205) and the nugget scales to 1.4 (game.js:2208-2211). After `gagDuration` = 6s (game.js:2203) it clears the filter, restores the nugget transform, and pays (game.js:2212-2217). **gagDuration and biggerNugget are wired (cleanup PR confirmed).**
- **Params read / unread:** pityEAS, blur, biggerNugget, gagDuration read.
- **Payout:** **55 EAS** at every state (2,200 / 40,700 / 526,625 Aura). That is 22% over the 45 top of the band, inside the +50% "downside" allowance, but the downside is mild: a 2 px blur, and the nugget gets *easier* to click. 0 Kek.
- **Skill/friction:** none ("sit through it" asks nothing of the player; clicking still works).
- **Interactions:** **BUG: the nugget can get stuck at 1.4×.** A second Dentist (or a Surgery on a Grape PRECISION) cast within 6s captures the *already enlarged* transform as its "original" (game.js:2207 / 2181). When it ends, it restores `scale(1.4)` after the first cast has already reset it, and the nugget stays huge until a reload. A filter clash also happens: All Your Base, Woman Yelling (`scramble`) and Dentist all write `body.style.filter` (game.js:1852-1853, 2204-2205, 2213). Whichever ends first clears the other's effect early. Nothing stays on permanently, because every path ends with `''`, and GigaChad's grayscale uses a class (index.html:1251-1253) that comes back. The bigger nugget also makes the OAG centre-only check easier (radius based on the rect, game.js:1243-1246).
- **Flags:** BUG (stuck nugget scale), BUG (minor: shared filter property), slightly over budget for a weak downside.
- **Notes / suggested fix:** use a CSS class or a counter for big/small nugget and blur, not a saved `origTransform`. Make the gag a real cost (for example, clicks during the gag don't count) or trim to 45 EAS.

### Ermahgerd (bu_c17) — Burn / common / INSTANT_BURST (mash)
- **Says (desc):** "MASH THE NUGGET to power it up! Starts at 15s of Aura. Every click within 3s adds +3s more, up to 60s max!" (game.js:160)
- **Says (cards.csv):** matches desc (cards.csv:44)
- **Does (code):** base EAS is snapshotted at cast (game.js:1837). A document-level capture listener counts **any click anywhere** for 3s (UI buttons and the boss overlay too), adding +3s up to 60s. It pays when the 3s are up (game.js:1861-1881). The particle shows an Aura number with an "s!" suffix (game.js:1872), which is confusing.
- **Params read / unread:** baseApsSeconds, mashWindow, mashBonusSeconds, capApsSeconds read. **`textTheme` is unread** (cosmetic NOOP, as already known).
- **Payout:** 15 EAS minimum. It reaches the 60 cap at 15 clicks in 3s (5 cps). Skilled (5.4 cps → 16 clicks): **60 EAS**. Casual (3 cps → 9 clicks): **42 EAS**. Same at every state. Mash clicks on the nugget also pay normal click Aura and roll for Kek.
- **Skill/friction:** mash.
- **Interactions:** reads base EAS, so Rickroll does not amplify it ✓. Overlapping casts (cooldown 1.5s < 3s window) each count the same clicks, which is fine since each pays separately.
- **Flags:** TXT (any click counts, not just the nugget), NOOP (cosmetic `textTheme`), OK on budget (60 = 133% of 45, within the +50% skill premium).
- **Notes / suggested fix:** count only nugget clicks, or say "click anywhere". Fix the particle text to show "+3s".

### All Your Base (bu_c18) — Burn / common / INSTANT_BURST (recent activity)
- **Says (desc):** "Rewards you for how much you clicked in the last 30s — gives that many clicks × click power. At least 30s of Aura, max 60s!" (game.js:161)
- **Says (cards.csv):** matches desc (cards.csv:45)
- **Does (code):** `raw = recentClicks × base click value` (no click buff, no frenzy), clamped to [30, 60] × baseEAS (game.js:1840-1850). It also adds a sepia/hue overlay for 5s through `body.style.filter` (game.js:1851-1854).
- **`recentClickTimestamps` check:** it is trimmed to 30s **only inside `doClick`** (game.js:1276-1277) and is not re-filtered when read (game.js:1843). After the player goes idle, the array still holds the clicks from the 30s before their *last* click, so going AFK and then casting still counts old clicks. The array is bounded, so there is no memory leak. Echo, auto-click and mash clicks on non-nugget elements are not counted.
- **Payout:** at 6 cps, 180 clicks → raw = **4.5 / 12.4 / 9.5 EAS**, so it is **always clamped to the 30 EAS floor** at all three states. Getting above the floor needs click value ÷ EAS > 1/6 (an extreme Szechuan build, or the first minute of the game).
- **Skill/friction:** click (in theory; in practice none).
- **Interactions:** filter clash with Dentist and Woman Yelling (see bu_c16). It temporarily hides GigaChad's grayscale.
- **Flags:** **C** (an exact clone of Epic Fail Guy in every reference state: 30 EAS, instant), TXT ("that many clicks × click power" never decides the payout), BUG (minor: stale timestamps after idling).
- **Notes / suggested fix:** scale by click *count* rather than click value, for example `EAS × clamp(recentClicks / 6, 30, 60)`, so 180+ clicks in 30s = 30–60 EAS and active players get more (this also helps D6). Filter the timestamps at read time.

---

## 2. Clone / differentiation check (Rule 0.2 axes)

| Archetype (commons) | Axis | Positions now | Verdict |
|---|---|---|---|
| **AUTO_COLLECT**: Spiderman, Boyfriend, Vitas, Disaster Girl | Click pattern (rapid / mirror / lingering / piercing) | rapid + Kek scoop / mirror (echo) / piercing (boss) / sweep (collects coins) | **Differentiated in shape** ✓ (the BALANCE_PLAN "all 30× click value" clone set is resolved). But the hooks carry all the value and the base payout is tiny: 0.4–3.3 EAS, 1–7% of budget. Spiderman's hook is ~0 (coins never expire), and Vitas's hook can't fire (burn bar blocked during a boss). Boyfriend and DG are combo cards whose solo value is ~0. |
| **INSTANT_BURST**: Epic Fail Guy, Ermahgerd, All Your Base | Activation hook (instant / mash / recent activity) | instant 30 / mash 15–60 / recent activity clamped 30–60 | **AYB = EFG clone** in practice: the recent-activity raw value never beats the floor. Ermahgerd is differentiated ✓. |
| **COIN_RAIN**: Pigeon, Kazoo, Ravioli | Motion pattern OR reward type | straight diagonal (claimed sine) / gravity / fade | Motion is differentiated ✓ (Pigeon's "sine" isn't one). All three pay the same 45 EAS cap despite very different difficulty, so **Ravioli is dominated** by Pigeon. Reward type is identical (flat Aura). |
| **TEMP_APS_MULT**: Charlie, Dream | (no axis in Rule 0.2) | same 1.5× / 20s; Dream + boss freeze | **Charlie Dom by Dream.** But Dream's hook only triggers ~3% of the time (can't cast during a boss), so in play they are near-identical **C**. |
| **TEMP_CLICK_MULT**: Star Wars Kid, Dramatic Chipmunk | (sustained vs burst) | 2× / 15s vs 5× / 5s | Shapes differ ✓, but Chipmunk wins on both total value (20 vs 15 extra click-seconds) and frenzy fit, so SWK is mildly **Dom**. A shared-timer bug makes them combine to 10× / 15s. |
| **KEK_***: SpongeBob (double), Brian (spawn) | Reward type | delayed doubling / instant coins | Differentiated ✓ (the old SCREEN_GAG pity trio is resolved). |
| **SCREEN_GAG**: David After Dentist | Gag duration → payout | 6s → 55 | Only common gag ✓. Over budget for a weak downside. |
| **TARGET_CHASE**: Troll Face | Target behaviour (juke / armor / swarm / timed) | single slow drift, 5s | Same shape as Leroy Jenkins (rare) with a longer timeout; doesn't "juke" as the text says. Claim the **juke** slot. |

## 3. Rarity curve: Common budget 30–45 EAS, Kek ≤ ¼ pack (4.5 @ #10 / 12 @ #30)

Aura in EAS-equivalent. "Skilled / casual" = 90% / 50% hit rate for skill cards; click cards at 6 cps / 3 cps.

| Card | Early | Mid | Late | Skilled / casual | Kek | vs budget |
|---|---|---|---|---|---|---|
| Troll Face | 45 | 45 | 45 | 40.5 / 22.5 (realistic ~45) | 0 | in band (top) |
| Is This a Pigeon? | 45 | 45 | 45 | 40.5 / 22.5 | 0 | in band (top), easiest rain |
| Spiderman Pointing | 0.38 | 1.03 | 0.79 | — | ~0 net (scoop) | **far under (1–3%)** |
| Distracted Boyfriend | 1.20 | 3.31 | 2.52 | 6 cps / half at 3 cps | 0 | **far under**; 120–331 with Gyatt |
| Mocking SpongeBob | 0 | 0 | 0 | — | +5 (28% @ #10, 10% @ #30) | Kek borderline at #10 |
| Bad Luck Brian | 0 | 0 | 0 | — | +2 (11% / 4%) | in Kek budget; **N≥5 = K, N=10 = X** |
| Epic Fail Guy | 30 | 30 | 30 | — | 0 | in band (floor) |
| Charlie Bit My Finger | 10 | 10 | 10 | — | 0 | **under (33%)** |
| Have You Ever Had A Dream | 10 (+freeze) | 10 | 10 | — | 0 | **under**; freeze rarely usable |
| Kazoo Kid | 45 | 45 | 45 | 40.5 / 22.5 | 0 | in band (top) |
| Star Wars Kid | 2.25 | 6.20 | 4.72 | half at 3 cps | 0 | **far under**; 223–614 if it extends Gyatt |
| Vitas (Chum Drum) | 0.75 | 2.07 | 1.57 | — | 0 | **far under** |
| Pink Guy Ravioli | 44.8 | 44.8 | 44.8 | 40.3 / 22.4 (realistic lower) | 0 | in band, lowest EV of the rains |
| Dramatic Chipmunk | 3.0 | 8.3 | 6.3 | 35 / 96 / 73 in frenzy | 0 | **under** alone; in band with frenzy |
| Disaster Girl | 0.75 | 2.07 | 1.57 | + coins swept (up to ~45 with Pigeon) | 0 | **far under** alone |
| David After Dentist | 55 | 55 | 55 | — | 0 | **over (+22%)**, weak downside |
| Ermahgerd | 15–60 | 15–60 | 15–60 | 60 / 42 | 0 | in band / skill premium ✓ |
| All Your Base | 30 | 30 | 30 | (raw 4.5 / 12.4 / 9.5, always floored) | 0 | in band (floor), clone |

**Shape of the curve.** Eight cards sit in the 30–55 band: Troll, Pigeon, Kazoo, Ravioli, EFG, AYB, Ermahgerd, Dentist. The eight click/APS-buff cards (Spiderman, Boyfriend, Vitas, DG, SWK, Chipmunk, Charlie, Dream) pay **0.4–10 EAS**, about 10–100× less. The root cause is that a click is worth only 2.5–7% of an Aura-second at every reference state, so any card paid in "click values" can't reach an EAS budget. This is strong evidence for **D6** (scale by `max(APS, APC × k)`), or for converting these cards to pay in EAS directly. The two Kek commons are in budget for single use. Only Brian's uncapped multi-copy breaks it, and D1 fixes that.

## 4. Ranked problem list

### P0 — broken / exploit
1. **Click-buff shared timer lets a common extend Level 67 Gyatt's 100×** (SWK +15s, Chipmunk +5s): up to 614 EAS Mid from a common. SWK + Chipmunk also gives 10× for 15s. (game.js:1902-1907, 1387) → *Fix:* give each buff its own `{mult, until}` entry and take the capped product, so no card ever extends another's timer.
2. **Bad Luck Brian multi-copy is 2^N − 1, uncapped** (N=10 → 2,046 Kek, 2,046 three.js meshes). (game.js:2242-2255) → *Fix:* D1a cap at 3, consume only 3. At high N spawn one combined coin.
3. **TEMP_APS_MULT overwrites stronger buffs**: Charlie or Dream during Rickroll drops 3× to 1.5× and cuts the timer to 20s (about −110 EAS). (game.js:1908-1911) → *Fix:* `apsMultValue = max(cur, mult)`, `apsMultTimer = max(cur, dur)`, the same as the click-mult fix.
4. **David After Dentist can leave the nugget stuck at 1.4×** when cast twice within 6s, or with Surgery on a Grape. (game.js:2207-2214, 2181-2189) → *Fix:* track big/small nugget with a class or counter and restore to the base transform, not a captured "orig".
5. **Burn bar is unclickable during a boss** (z 90 under the boss overlay at z 400 with `pointer-events:auto`), so Dream's freeze and Vitas's boss pierce almost never work. (index.html:924-929, 1402-1416; game.js:1912, 2150-2159). Confirm in R4's smoke test. → *Fix:* raise `#burn-bar` (and `#burn-preview`) above 400.
6. **AUTO_COLLECT burns are consumed for nothing under Sigma Slam.** (game.js:1820 then 2111-2114) → *Fix:* check `disableAutoCollect` in `activateBurn` before decrementing, or grey the cards out.

### P1 — unbalanced / clone / dominated
7. **Eight click/APS-buff commons pay 0.4–10 EAS against a 30–45 budget** (Spiderman, Boyfriend, Vitas, DG, SWK, Chipmunk, Charlie, Dream). → *Fix:* D6, or pay these from EAS (for example auto-clicks worth `EAS × k` each, Charlie 2.5× / 20s).
8. **All Your Base = Epic Fail Guy clone.** The raw value (4.5–12 EAS) never beats the 30 floor. (game.js:1840-1850) → *Fix:* scale by click count, `EAS × clamp(clicks / 6, 30, 60)`.
9. **Charlie strictly dominated by Dream**, and the two are near-identical in play. (game.js:151-152, 1908-1913) → *Fix:* Charlie = shorter and stronger (2.5× / 20s, or 3× / 10s). Dream keeps 1.5× + freeze as the utility pick.
10. **Ravioli dominated by Pigeon/Kazoo**: same 45 cap, much harder. (game.js:156, 2028-2046) → *Fix:* 7.5 EAS each (60 total, skill premium), or stagger spawns over the 6s `duration`.
11. **SWK dominated by Chipmunk** (15 vs 20 extra click-seconds; Chipmunk fits a frenzy). → *Fix:* SWK 2× / 30s, or 3× / 15s.
12. **COIN_RAIN, Troll Face and Dentist read live `computeEAS()`**, so Charlie, Dream and Rickroll multiply them (Rickroll + Pigeon = 135 EAS). The boss reward gets the same boost (+150 EAS with Charlie). (game.js:1984, 2016, 2039, 2193, 2680, 2956) → *Fix:* route them through `computeBaseEAS()` (extend Rule 0.1 to every one-shot payout).
13. **Dentist 55 EAS with a nearly free downside.** (game.js:159, 2193-2217) → *Fix:* 45 EAS, or make clicks not count during the gag.
14. **Spiderman's Kek scoop is worth ~0**, because 3D coins never expire. (game.js:2123-2129, 2490-2495) → *Fix:* +1 bonus Kek per coin scooped (≤ 4 per use to fit budget), or make coins expire so the scoop matters.

### P2 — text / polish
15. Several texts say "N Aura" when the code pays N seconds of income (Troll 45, Pigeon 7.5, Kazoo 4.5, Ravioli 5.6, Dentist 55). → *Fix:* "N seconds of Aura" (the same wording issue as Evil Kermit).
16. Pigeon: there is no zigzag (straight line), the window is "4s" but really ~7.8s, the speed depends on frame rate (`step(16)`), and butterflies leave the screen. (game.js:1963-1997) → *Fix:* real sine x-offset, clamp, use rAF dt.
17. Troll Face: "the nugget runs away", but a slow 😈 drifts randomly. Its timeout deletes every chase target on screen. (game.js:2682, 2759) → *Fix:* flee from the cursor, and remove only its own element.
18. Disaster Girl text promises "targets" (never swept) and hides its 10 × 3× auto-clicks. It can't collect hover-only drops. (game.js:2160-2167) → *Fix:* sweep `.burn-target` too and trigger hover collect, or retext.
19. SpongeBob's multi-copy is linear (5 × N), but the "Use All" tooltip says 2^N − 1 and the desc says "double even more". The doubles only apply to nugget coins. (game.js:1787, 2256-2258, 2405) → *Fix:* per-archetype tooltip text, and state "nugget Kek Koins".
20. Distracted Boyfriend's "ghost click 150px away" is cosmetic. It is really "+100% click Aura for 8s" and can't hit coins or targets. (game.js:1264-1268) → *Fix:* retext.
21. All Your Base's `recentClickTimestamps` is only trimmed on click, so it counts stale clicks after idling. (game.js:1276-1277, 1843) → *Fix:* filter when reading.
22. Ermahgerd counts any click on the page, not just the nugget. Its "+Ns!" particle shows Aura with an "s" suffix. `textTheme` is unread. (game.js:1872, 1876, 160) → *Fix:* count only nugget clicks or retext. Show "+3s".
23. `body.style.filter` is shared by All Your Base, Dentist and Woman Yelling, so overlapping casts cut each other's overlay short (no permanent leak). → *Fix:* one class per effect.
24. Ravioli `duration: 6` is unread. Vitas text mentions boss "armor" that doesn't exist. → *Fix:* use it or remove it; retext.

## 5. Cleanup PR items verified (not re-reported)
- Dream `pauseBoss`: wired (game.js:1912, 2991-2998) ✓. Reachability problem: P0 #5.
- Boyfriend `echoOffset`: read (game.js:2118) ✓. Cosmetic only.
- Dentist `gagDuration` / `biggerNugget`: wired, pays at end (game.js:2203-2217) ✓. New stuck-scale bug: P0 #4.
- Disaster Girl sweep tracks the band across the screen (game.js:2161-2167) ✓.
- `TEMP_CLICK_MULT` no longer lowers a bigger boost such as Gyatt (game.js:1905) ✓. The side effect is the timer extension (P0 #1).
