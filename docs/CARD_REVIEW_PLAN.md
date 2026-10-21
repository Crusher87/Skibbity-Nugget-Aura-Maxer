# Card Review Plan

The goal of this review is to find out what every card **actually does in code today**, measure it, and list every problem, before anyone changes a number. It produces the evidence that [CARD_BALANCE_SWEEP_PLAN.md](CARD_BALANCE_SWEEP_PLAN.md) acts on.

It builds on [BALANCE_PLAN.md](../BALANCE_PLAN.md). Phases 0–4 there were design work done on paper. Since then the cards were reworked by hand (Troll Face added, Spiderman / Mocking SpongeBob / Bad Luck Brian / Gabe moved to Kek Koin payouts, El Risitas multi-copy, escalating This is Fine, Moth blackout, Nyan Cat Kek drops, etc.). So the Phase 1 audit table in BALANCE_PLAN.md is out of date, and the review re-audits from the code, not from that table.

**This review is read-only.** No agent edits `game.js`, `cards.csv`, or `BALANCE_PLAN.md` during it. Every agent writes only its own file under `docs/review/`.

---

## 0. What we already know (starting findings)

A first pass over `game.js` (commit `5b3e14b`) already turned these up. Reviewers confirm each one and add detail; they don't need to rediscover them.

> **Overlap with the cleanup PR (branch `cleanup-and-fixes`).** That PR is expected to: wire up `pauseBoss`, `deadCenterOnly`, `doubleNext`, `gagDuration`, `fluctuate`, `echoOffset`; make Success Kid's `rareBonus`/`mythicBonus` apply in `pullCard()`; remove Chuck Norris's double-counted crit EV from `getBinderStats()`; pay RHYTHM cards by their own rarity budget (Shia was paid as Uncommon); stop a weaker click buff from lowering a stronger one; and make Gabe's multi-copy use 2^N − 1. Run the review **after** it merges, and for items it covers, verify the new behaviour instead of re-reporting the old bug. Note that Gabe going exponential makes the multi-copy exploit in 0.2 bigger, not smaller.

### 0.0 Cards Curtis already reworked by hand
Curtis remembers doing **Nyan Cat** and "one or two at the beginning of the binder". The code agrees: Nyan Cat (f3), Shrek (bi_c1, added drain reduction), Harambe (bi_c2, faster Kek drops + flat APC) and Philosoraptor (bi_c4, now pays Kek) all differ from the BALANCE_PLAN audit and look hand-tuned. Moth and Lamp and This is Fine were also reworked at some point (their `cards.csv` text is older than the code). For these, keep Curtis's design intent: check that the numbers and text hold up, and don't propose a redesign unless something is broken.

### 0.1 Card text promises things the code never does
These params are defined in `CARD_LIBRARY` but no code reads them:

| Card | Unread param(s) | What the player is told vs. what happens |
|------|-----------------|------------------------------------------|
| Have You Ever Had A Dream (bu_c9) | `pauseBoss` | "Skibidi Toilet freezes" — it doesn't. So it is **identical** to Charlie Bit My Finger in practice |
| Overly Attached GF (bu_r6) | `deadCenterOnly` | "Only center clicks count" — any click counts, so it is an easy 6× + 1 Kek per click for 15s |
| Arthur Fist (bu_u2) | `doubleNext` | "Next click counts double" — doesn't happen |
| Rickroll (bu_u12) | `fakeCrash` | "Pretends to crash first" — doesn't happen (cosmetic only) |
| David After Dentist (bu_c16) | `gagDuration`, `biggerNugget` | 6s gag and huge nugget never happen; blur uses `blur: 8` as seconds |
| Success Kid (bi_u2) | `rareBonus`, `mythicBonus` | "Luckier pack pulls" — `pullCard()` ignores luck entirely (`BAL.PACK_LUCK_*` also unused) |
| Peanut Butter Jelly (f6) | `cardDropRate`, `kekDropBonus` | "Cards drop 2× as often" — there is no card drop outside packs. Kek bonus is hardcoded on `fieldSlot === 'f6'` instead of the param |
| Stonks (bi_c3) | `fluctuate` | Payout never fluctuates |
| Pepe (bi_r2) | `cycleSec` | Cycle is hardcoded to 30s in the game loop |
| Distracted Boyfriend (bu_c4) | `echoOffset` | Offset hardcoded somewhere else (verify value = 150) |
| Nyan Cat (f3) | `cursorTrail` | Cosmetic, verify whether a trail exists at all |
| Ermahgerd (bu_c17) | `textTheme` | Cosmetic |

### 0.2 Exploits and runaway scaling
- **Multi-copy "Use All" is 2^N − 1.** Copies are uncapped (`BURN_INVENTORY_CAP` limits distinct card types shown, not copies). 10 El Risitas = 1023 × 600s of income; 10 Bad Luck Brian = 2,046 Kek Koins. Hoarding always beats using.
- **Gabe the Dog "Use All"** grants Kek **without playing the minigame** (linear today; 2^N − 1 after the cleanup PR, which makes 10 copies = 10,230 Kek).
- **Expanding Brain** is uncapped and its start time is saved, so it keeps growing while the game is closed (+1% click Aura per real-world minute: +1,440% after a day).
- **Overly Attached GF** pays 1 Kek per click with no center check (see 0.1). At 8–10 clicks/sec that is 120–150 Kek from one card. Also check if another click buff (Star Wars Kid, Dramatic Chipmunk) overwrites `clickMultTimer` and ends or extends the Kek window.
- **Evil Kermit** EV = 900s of income vs El Risitas 600s guaranteed. Card text says "1800 Aura", but it is really 1800 *seconds of income*.

### 0.3 Pack economy oddities
`pullCard()`: 10% Field, then 60/28/12 common/uncommon/rare over Burn+Binder pools of 24/19/10 cards. Per-card odds per pack:

| Group | Pool size | Odds for one specific card |
|-------|-----------|----------------------------|
| Field (mythic-rare) | 6 | 1.67% |
| Common | 24 | 2.25% |
| Uncommon | 19 | 1.33% |
| Rare | 10 | 1.08% |

So each "Mythic" Field card is **more likely** than each Rare. Duplicate Binder and Field pulls have no use at all (no sell, no upgrade).

### 0.4 Docs drift
- `cards.csv` is stale for several cards (Nyan Cat, Moth and Lamp, This is Fine, PBJ text differ from `CARD_LIBRARY.desc`).
- BALANCE_PLAN.md says 57 cards; there are 59 (Troll Face makes 18 Burn commons).
- Card text says "(scaled to your progress)" but the scale is `computeEAS()` = Aura/sec. A click-heavy build (Szechuan) with low APS gets tiny burn payouts.

---

## 1. Ground rules for reviewers

1. **Code is truth.** For each card, read its `CARD_LIBRARY` entry, follow `archetype` to its handler (`EFFECT_HANDLERS`, `getBinderStats()`, the `gameLoop` TIMED_DROP / IDLE_DRIP / Field blocks, `spawnBurnTarget`, `spawnRhythmGame`, `activateBurnMulti`) and write down what really happens.
2. **Cite lines.** Every finding has a `game.js:LINE` reference.
3. **No fixes.** Write a recommended fix in one line if obvious, but don't edit game code.
4. **Use the shared reference states** (section 3) for all numbers so results compare across agents.
5. **Use the shared flags** so results can be merged into one table.

### Flags
| Flag | Meaning |
|------|---------|
| **TXT** | Card text (desc or cards.csv) doesn't match code |
| **NOOP** | A param or promised effect is never implemented |
| **C** | Clone: same archetype and roughly same outcome as another card |
| **Dom** | Dominated: another card at the same or lower rarity is strictly better |
| **D** | Dead in some common state (no boss, all upgrades bought, Sigma Slam field, early game with ~0 APS) |
| **X** | Exploit / unbounded stacking |
| **K** | Kek Koin payout outside budget (see section 3.3) |
| **BUG** | Crash, stuck state, leaked timer/filter, or visual left on screen |
| **OK** | Checked, no issues |

---

## 2. Work split (4 parallel agents + 1 merge)

All four reviewers can run at the same time because they only read code and each writes its own file. Each is a separate agent with this plan as its brief.

| Agent | Scope | Output file |
|-------|-------|-------------|
| **R1 — Field & Binder** | 6 Field + 15 Binder cards (f1–f6, bi_c1–bi_c6, bi_u1–bi_u6, bi_r1–bi_r3) | `docs/review/field-binder.md` |
| **R2 — Burn Commons** | 18 Burn commons (bu_c1–bu_c18) | `docs/review/burn-common.md` |
| **R3 — Burn Uncommon & Rare** | 13 uncommons + 7 rares (bu_u1–bu_u13, bu_r1–bu_r7) | `docs/review/burn-unc-rare.md` |
| **R4 — Systems & Economy** | Pack pulls, Kek Koin income/spend, multi-copy, frenzy, boss, events, save/load of card state, the simulation script | `docs/review/systems.md` + `tools/card-sim.js` |
| **Merge (lead)** | Combine into one audit table, dedupe, rank by severity | `docs/review/AUDIT.md` |

R4 starts by writing the simulation script first, since R1–R3 use its numbers. If it isn't ready yet, R1–R3 do the math by hand from the reference states and R4 checks it afterwards.

---

## 3. Shared reference states and budgets

### 3.1 Reference game states
Every number in the review is computed at these three states. R4 confirms the APS/APC values with the sim script.

| State | SAUCE owned (ketchup / ranch / szechuan / grimace / sigma) | Approx. meaning |
|-------|------|-----------------|
| **Early** | 10 / 2 / 0 / 0 / 0 | First packs, ~10 min in |
| **Mid** | 40 / 20 / 5 / 2 / 0 | ~30–45 min |
| **Late** | 80 / 50 / 20 / 15 / 3 | Endgame, Sigma Glaze bought |

For each state also assume: 5 empty binder slots unless the card under test is slotted, no field, 6 clicks/sec when the card asks for clicking, and a "skilled" vs "casual" hit rate (90% / 50%) for skill-based cards.

### 3.2 Aura budgets (from BALANCE_PLAN Rule 0.5)
Burns measured in EAS (seconds of current Aura/sec):
- Common ≈ 30–45, Uncommon ≈ 120–180, Rare ≈ 600–900, up to +50% for a real downside (gamble, hard skill check).

Click-based cards (AUTO_COLLECT, TEMP_CLICK_MULT, PRECISION, RHYTHM) pay in click value, not EAS. Convert them: `EAS-equivalent = Aura gained ÷ computeEAS()` at each reference state, and note how much the answer swings between states.

### 3.3 Kek Koin budget (new — not in BALANCE_PLAN)
Many cards now pay Kek Koins, which buy packs, so they feed back into the card economy. R4 first measures:
- Kek income per minute from clicking alone (1 per 30 clicks + 1% per click) at 6 clicks/sec.
- Pack cost curve: `5 + floor(1.5 × packsPurchased)`, minus Grumpy Cat / Success Kid discounts.

Then express each Kek payout as **"minutes of normal Kek income"** and **"% of the next pack's cost at pack #10 and #30"**. Reviewers flag **K** when a single use pays more than one full pack at its rarity tier (proposed budget, to confirm in the balance plan: Common ≤ 1/4 pack, Uncommon ≤ 1/2 pack, Rare ≤ 1 pack).

---

## 4. Per-card checklist (R1–R3)

For **every** card, fill in this block:

```markdown
### <Name> (<id>) — <type> / <rarity> / <archetype>
- **Says (desc):** …
- **Says (cards.csv):** … (or "matches desc")
- **Does (code):** … (game.js:LINE, …)
- **Params read / unread:** …
- **Payout:** Early … / Mid … / Late …  (Aura as EAS-equivalent, and Kek)
- **Skill/friction:** none / click / hover / precision / timing / chase
- **Interactions:** Sigma Slam? boss active? frenzy? multi-copy? other binder/field cards?
- **Flags:** TXT, NOOP, …
- **Notes / suggested fix (1 line):** …
```

Specific things to check by group:

**R1 — Field & Binder**
- Every Field: write its tradeoff in one sentence (BALANCE_PLAN Rule 0.4). Check what happens when you swap fields mid-effect (blackout / fire / Nyan cats cleaned up?).
- Ohio Boss: does `bossSpawnMult` actually change spawn odds as stated (+50%)? Is 5 Kek per boss in Kek budget?
- Binder slot test (Rule 0.3): for each rarity, which card would you drop first from a full binder? A card that's always the answer is **Dom**.
- `getBinderStats()` is called many times per frame — note any card whose effect depends on call order or `Date.now()` (Expanding Brain).
- Stacking: Shrek + Harold drain reduction, Grumpy + Success Kid pack discount floor (`Math.max(1, …)`), Cheezburger + Doge combo, Chuck Norris crit as EV in `getBinderStats` vs real every-10th crit in click code (is it counted twice?).
- Duplicate copies: confirm they're useless and note it.

**R2 — Burn Commons**
- Re-check BALANCE_PLAN batch results against code: are the 4 AUTO_COLLECT, 3 INSTANT_BURST, COIN_RAIN commons actually differentiated now?
- Charlie vs Dream (pauseBoss NOOP), Star Wars Kid vs Dramatic Chipmunk (total value 30× vs 25× click), Troll Face vs other chase cards.
- Mocking SpongeBob / Bad Luck Brian multi-copy math at 2, 3, 5, 10 copies.
- Disaster Girl sweep and Distracted Boyfriend echo: do they really hit coins and targets? Can echo clicks trigger Kek drops / frenzy / Chuck Norris crits?
- All Your Base: is `recentClickTimestamps` trimmed to 30s?
- Leaked state: any `document.body.style.filter` set by one card and cleared by another's timer (All Your Base, David After Dentist, GigaChad grayscale all write the same property).

**R3 — Burn Uncommon & Rare**
- Clone pairs from BALANCE_PLAN (Woman Yelling vs Keyboard Cat, Britney vs Zombie Turtle, the COIN_RAIN uncommons): differentiated now?
- Rickroll: 3× APS for 60s = 120 EAS of extra income. Compare to MLG Airhorn (120 EAS instant).
- El Risitas, Gabe multi-copy; Evil Kermit EV; Leroy 3s success rate; End of Ze World perfect-run Kek bonus; OAG Kek per hit.
- John Cena vs OAG vs Surgery on a Grape (precision family): constraint vs payout ladder.
- Rhythm cards: is "up to N×" reachable, and what do partial hits pay?

---

## 5. Systems checklist (R4)

1. **Sim script `tools/card-sim.js`** (Node, no browser). Load `game.js` source, pull out `BAL`, `UPGRADES`, `CARD_LIBRARY` with a regex or `vm` sandbox (don't run the DOM code), then:
   - Compute APS / APC / `computeEAS()` / `computeBaseEAS()` at the 3 reference states.
   - For each Burn, compute payout per section 3 (Aura EAS-equivalent + Kek).
   - For each Binder, compute % change in Aura/sec and Aura/click when slotted.
   - Simulate 1,000 pack openings: rarity distribution, packs to complete the set, expected dupes.
   - Print a markdown table so it can be pasted into the audit and re-run after every balance batch.
2. **Kek Koin economy:** sources (clicks, Harambe, Philosoraptor, Nyan Cat, Ohio Boss, PBJ, Brian, Gabe, Chocolate Rain, Zombie Turtle, Arthur Fist, End of Ze World, OAG) vs sinks (shop unlock 50, packs). Minutes to buy pack #10, #30, #59.
3. **Multi-copy (`activateBurnMulti`)**: payout at N = 2…10 for each eligible card. Also how many packs it takes to hold N copies.
4. **Frenzy** (10× for 10s at 7 clicks/sec): does it multiply burn payouts, click-buff cards, OAG Kek? Can echo or auto clicks start frenzy?
5. **Boss**: drain vs reward (300 EAS on defeat), which cards interact (Vitas, Dream, Shrek, Harold, Ohio).
6. **Burn activation**: 1.5s global cooldown, what happens if two timed effects overlap (`clickMultTimer`, `apsMultTimer` overwritten or stacked?), `CLICK_MULT_CAP` actually enforced?
7. **Save/load**: which card state is saved (`scalingStartTime`, `moodIndex`, `_lastDrop` lives on the shared card object and isn't saved), and what happens to Field/Binder effects after reload.
8. **Smoke test in a browser** (Playwright + Chromium are available in the cloud container): open `index.html` from a local static server, use the dev menu to grant each Burn, activate it, and log console errors. One line per card: ✅ / ❌ + error.

---

## 6. Merge step (lead)

1. Combine R1–R4 into `docs/review/AUDIT.md`: one row per card (59 rows) with flags and a one-line verdict, then a systems section.
2. Rank every problem into:
   - **P0 — broken:** NOOP text, BUG, X (unbounded). Must fix.
   - **P1 — unbalanced:** outside Aura/Kek budget, Dom, C.
   - **P2 — polish:** TXT wording, cosmetic NOOPs.
3. Produce the **decision list** for Curtis: each NOOP is "implement it" or "change the text", and each exploit has 2–3 fix options with a recommendation.
4. Update the BALANCE_PLAN.md progress tracker with a "Review sweep done" line and link to AUDIT.md.

### Definition of done
- All 59 cards have a filled block, with code line references.
- Sim script runs with `node tools/card-sim.js` and its output is in AUDIT.md.
- Browser smoke test result for all 38 Burns.
- Decision list ready for Curtis.

---

## 7. How to run it

- **Before starting:** wait for the "Codebase review and cleanup" PR to merge, then run the review against that `main` so line numbers stay valid. (If it's not merged, review `5b3e14b` and note the commit in every file.)
- Launch R1–R4 as four parallel agents, each with: this file, BALANCE_PLAN.md, its scope row from section 2, and the instruction "read-only except your output file".
- Expected size: R1–R3 ≈ 20 cards each, R4 the largest. The merge step is one agent pass.
