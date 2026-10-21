# Card Balance Plan

A phased, sequential plan to rebalance all 57 booster cards (6 Field + 15 Binder + 38 Burn). SAUCE upgrades are a separate system and are out of scope.

---

## Phase 0 — Lock the Architectural Rules (do this first)

These rules constrain every card decision downstream. Cement them before touching any individual card.

### Rule 0.1 — Base vs Active Income Split
Two separate variables in the economy:
- `baseAPS` = Aura/sec from SAUCE upgrades + Binder cards only. No temporary buffs.
- `activeAPS` = `baseAPS` × all temporary multipliers (Field cards, Burn buffs like Rickroll).

Hard rule: every `INSTANT_BURST` card (Epic Fail Guy, Ermahgerd, All Your Base, MLG Airhorn, Arthur Fist, El Risitas) pulls from **`baseAPS` only**.
Only the live ticker reads `activeAPS`.
This kills the Rickroll × El Risitas exploit permanently.

**Code note (Phase 5 fix required):** `computeEAS()` at line 1369 in `game.js` currently multiplies by `apsMultTimer`, meaning INSTANT_BURST payouts already scale with Rickroll. Fix in Phase 5: add a `computeBaseEAS()` function that omits the `apsMultTimer` factor, and route all `INSTANT_BURST` cards through it.

### Rule 0.2 — One Archetype, One Differentiation Axis
Every archetype gets a required differentiation axis. Two cards in the same archetype must differ on that axis, not on raw numbers.

| Archetype | Differentiation axis |
|-----------|---------------------|
| TIMED_DROP | Friction (auto / click / hover / combo) |
| AUTO_COLLECT | Click pattern (rapid / mirror / lingering / piercing) |
| COIN_RAIN | Motion pattern OR reward type (flat / temp buff / card drop) |
| INSTANT_BURST | Activation hook (instant / mash-to-amplify / scales with recent activity) |
| SCREEN_GAG | Gag duration → payout (longer = more) |
| RHYTHM | What rhythm means (spatial / pitch / BPM / accelerating) |
| TARGET_CHASE | Target behavior (juke / armor / swarm / timed) |
| PRECISION | Precision constraint (invisible / center / shrinking / moving) |

### Rule 0.3 — Binder Slots Are Premium
Only 5 slots. Every binder card must be slot-worthy at its rarity tier. If a Common is strictly dominated by a Rare, the Common is dead — fix or cut.

### Rule 0.4 — Every Field Has a Tradeoff
Raw multiplier is not enough. Every Field card must trade something (higher mult for friction, lower mult for utility, etc.).

### Rule 0.5 — EAS Budget (Burn cards)
Established baselines stay:
- Common ≈ 30–45 EAS
- Uncommon ≈ 120–180 EAS
- Rare ≈ 600–900 EAS

A card with a clear downside (gamble, precision constraint) can earn +50% above its tier budget.

---

## Phase 1 — Audit the Existing Pool (catalog every problem)

Before rewriting, produce a single audit table. For each of the 57 cards, mark:
- **Clone risk** (which other cards share its archetype + outcome)
- **Dead-in-context** (does it do nothing in some common game states?)
- **Dominated** (is another card strictly better?)
- **Exploit risk** (does it stack multiplicatively with anything?)

### Full Audit Table (all 57 booster cards)

Flags: **C** = Clone risk | **D** = Dead-in-context | **Dom** = Dominated | **X** = Exploit risk

#### Field Cards
| Card | Issues | Notes |
|------|--------|-------|
| Ohio Boss (f1) | — | No tradeoff (Rule 0.4 fail). Pure stat stick at 50% |
| Sigma Slam (f2) | Dom | 80% with no downside dominates every other field. No reason to use anything else |
| Nyan Cat (f3) | — | Cursor trail is cosmetic, not a tradeoff. Rule 0.4 fail |
| Moth and Lamp (f4) | — | No tradeoff. Rule 0.4 fail |
| This is Fine (f5) | — | Speed 1.3× is marginal utility; low mult (25%) is the tradeoff. Borderline pass |
| Peanut Butter Jelly (f6) | — | 2× card drop rate is real tradeoff. ✓ |

#### Binder — Common
| Card | Issues | Notes |
|------|--------|-------|
| Shrek (bi_c1) | Dom | +5% global. Outclassed by GigaChad (+20% APS) in any slot competition |
| Harambe (bi_c2) | Dom | +5% APC. Tiny; outclassed by Big Chungus (+5% APC + bigger nugget) |
| Stonks (bi_c3) | C | 40 EAS/min auto. Nearly identical yield/min to Philosoraptor |
| Philosoraptor (bi_c4) | C | 40 EAS/min hover. Stonks clone in yield; only friction differs slightly |
| Doge (bi_c5) | — | 30 EAS/min auto. Lower than Stonks but distinct by feel |
| First World Problems (bi_c6) | D | 0.5%/sec cap 1% — useless to active players; also power collapses late game when bank is huge and rate stays fixed |

#### Binder — Uncommon
| Card | Issues | Notes |
|------|--------|-------|
| Grumpy Cat (bi_u1) | D | -10% upgrade costs. Dead once all SAUCE upgrades are purchased |
| Success Kid (bi_u2) | D | Pack luck bonus. Dead once collection is complete |
| Big Chungus (bi_u3) | — | Size + APC. Unique enough ✓ |
| Hide the Pain Harold (bi_u4) | D | Skibidi drain reduction only. Dead 90% of the time with no baseline benefit |
| I Can Has Cheezburger (bi_u5) | — | Click-to-claim 120 EAS/min. Best yield binder drop, clear friction ✓ |
| Expanding Brain (bi_u6) | D | +1%/min capped at 30%. Useless before 5 min, irrelevant after 30 min — window of value too narrow |

#### Binder — Rare
| Card | Issues | Notes |
|------|--------|-------|
| Chuck Norris (bi_r1) | — | Every 10th click = 10× crit. Always active, skill-expressive ✓ |
| Pepe / Mood Swing (bi_r2) | D | "Random bonus" has no defined params in CARD_LIBRARY (cycleSec: 30 only). Effectively a no-op |
| GigaChad (bi_r3) | — | +20% APS passively. Clearly strong Rare ✓ |

#### Burn — Common / AUTO_COLLECT
| Card | Issues | Notes |
|------|--------|-------|
| Spiderman Pointing (bu_c3) | C | 15 × 2.0× = 30× click value |
| Distracted Boyfriend (bu_c4) | C | 20 × 1.5× = 30× click value. Identical total to Spiderman |
| Vitas (bu_c12) | C | 12 × 2.5× = 30× click value. Identical total |
| Disaster Girl (bu_c15) | C | 10 × 3.0× = 30× click value. Identical total |

#### Burn — Common / INSTANT_BURST
| Card | Issues | Notes |
|------|--------|-------|
| Epic Fail Guy (bu_c7) | C, X | 30× baseAPS. Identical to Ermahgerd and All Your Base. Exploit: reads live EAS (includes Rickroll) |
| Ermahgerd (bu_c17) | C, X | 30× baseAPS. Perfect clone of Epic Fail Guy |
| All Your Base (bu_c18) | C, X | 30× baseAPS. Perfect clone. Retro overlay is cosmetic only |

#### Burn — Common / SCREEN_GAG
| Card | Issues | Notes |
|------|--------|-------|
| Mocking SpongeBob (bu_c5) | C | 33 EAS pity. Identical value to Brian and Dentist |
| Bad Luck Brian (bu_c6) | C | 33 EAS pity. Clone |
| David After Dentist (bu_c16) | C | 33 EAS pity. Clone |

#### Burn — Common / COIN_RAIN
| Card | Issues | Notes |
|------|--------|-------|
| Is This a Pigeon? (bu_c2) | C | 6 × 7.5 = 45 EAS. Same budget as Kazoo and Pink Guy |
| Kazoo Kid (bu_c10) | C | 10 × 4.5 = 45 EAS. Clone by value |
| Pink Guy Ravioli (bu_c13) | C | 8 × 5.6 = 44.8 EAS. Clone by value |

#### Burn — Common / TEMP_APS_MULT + TEMP_CLICK_MULT
| Card | Issues | Notes |
|------|--------|-------|
| Charlie Bit My Finger (bu_c8) | Dom | 1.5× / 20s. Strictly dominated by Have You Ever Had A Dream (same stats + boss pause) |
| Have You Ever Had A Dream (bu_c9) | — | 1.5× / 20s + boss pause. Strictly better than Charlie ✓ but makes Charlie dead |
| Star Wars Kid (bu_c11) | — | 2× clicks / 15s. Sustained click buff ✓ |
| Dramatic Chipmunk (bu_c14) | — | 5× clicks / 5s. Burst click buff. Distinct from SWK ✓ |

#### Burn — Uncommon / INSTANT_BURST
| Card | Issues | Notes |
|------|--------|-------|
| MLG Airhorn (bu_u1) | X | 120× baseAPS + shake. Exploit: reads live EAS |
| Arthur Fist (bu_u2) | X | 120× baseAPS + double next click. Has a hook ✓, but still exploit risk |

#### Burn — Uncommon / TARGET_CHASE + PRECISION + COIN_RAIN + RHYTHM
| Card | Issues | Notes |
|------|--------|-------|
| Ugandan Knuckles (bu_u3) | — | 8 swarm targets / 10s / 180 EAS ✓ |
| Woman Yelling at Cat (bu_u4) | C | 4 hits / 10s / 6× max. Near-clone of Keyboard Cat |
| Leave Britney Alone (bu_u5) | C | 1 armored target 8 HP / 6s / 180 EAS. Clone of Zombie Turtle (5 HP / 5s) |
| Surgery on a Grape (bu_u6) | — | Small nugget precision / 10s / 5× ✓ |
| Chocolate Rain (bu_u7) | C | 20 × 9 = 180 EAS. Clone of Shooting Stars and Gabe by value |
| Zombie Kid Turtle (bu_u8) | C | 1 armored target 5 HP / 5s / 180 EAS. Clone of Britney |
| Keyboard Cat (bu_u9) | C | 5 hits / 8s / 6× max. Near-clone of Woman Yelling |
| Numa Numa Dance (bu_u10) | — | 6 hits / 10s / 5× max. Slightly distinct rhythm ✓ |
| Shooting Stars (bu_u11) | C | 15 × 12 = 180 EAS. Clone of Chocolate Rain and Gabe |
| Rickroll (bu_u12) | X | 3× APS / 60s. Exploit: this is the multiplier half of the Rickroll × El Risitas combo |
| Gabe the Dog (bu_u13) | C | 25 × 7.2 = 180 EAS. Clone of Chocolate Rain and Shooting Stars |

#### Burn — Rare
| Card | Issues | Notes |
|------|--------|-------|
| John Cena (bu_r1) | Dom | Invisible nugget / 15s / 5×. Dominated by OAG (15s / 6×) at same rarity for less constraint |
| Just Do It / Shia (bu_r2) | — | 8 hits / 12s / 10× max. Rare-tier rhythm, clearly strongest rhythm ✓ |
| Leroy Jenkins (bu_r3) | — | 1 target / 3s / 900 EAS. Extreme time pressure = interesting risk ✓ |
| El Risitas (bu_r4) | X | 600× baseAPS. Exploit: reads live EAS including Rickroll |
| End of Ze World (bu_r5) | — | 25 targets / 15s / 900 EAS. Mass chase ✓ |
| Overly Attached GF (bu_r6) | — | Dead-center precision / 15s / 6×. Strictest constraint = highest rare mult ✓ |
| Evil Kermit (bu_r7) | Dom | 50/50: win 1200 EAS or 0. EV = 600 EAS = same as guaranteed El Risitas. Never the right pick |

### Issue summary (19 distinct problems)
1. AUTO_COLLECT all four = 30× click value (perfect mathematical clones)
2. INSTANT_BURST commons: Epic Fail Guy / Ermahgerd / All Your Base identical
3. SCREEN_GAG trio: all 33 EAS pity (identical)
4. COIN_RAIN commons: Pigeon / Kazoo / Pink Guy all ≈45 EAS
5. COIN_RAIN uncommons: Chocolate Rain / Shooting Stars / Gabe all ≈180 EAS
6. Rhythm: Woman Yelling and Keyboard Cat near-clones (4/6× vs 5/6×)
7. TARGET_CHASE: Britney (8HP) and Zombie Turtle (5HP) near-clones
8. Charlie dominated by Dream (identical stats + boss pause free)
9. John Cena dominated by OAG at same rarity
10. Evil Kermit EV = El Risitas guaranteed (always worse pick)
11. Hide the Pain Harold: dead 90% of time, no baseline passive
12. First World Problems: 0.5%/sec at 1% cap collapses in usefulness late game
13. Shrek (+5% global) dominated by GigaChad
14. Harambe (+5% APC) dominated by Big Chungus (same + bigger nugget)
15. Grumpy Cat: dead once SAUCE upgrades exhausted
16. Success Kid: dead post-collection
17. Expanding Brain: effective window too narrow (useless <5 min, irrelevant >30 min)
18. Pepe: no actual bonus defined in code (cycleSec only, no effect params)
19. computeEAS() exploit: INSTANT_BURST / Rickroll combo reads live multiplied APS

---

## Phase 2 — Rewrite by Archetype (work in batches, not card-by-card)

Process one archetype at a time. Rewriting in batches lets you enforce Rule 0.2 (differentiation axis) consistently.

### Batch order (do in this sequence)
1. **AUTO_COLLECT** (4 cards) — smallest, validates the rewrite process
2. **INSTANT_BURST** (5 cards) — also small, tests Rule 0.1
3. **SCREEN_GAG pity trio** (3 cards) — simplest dedup
4. **COIN_RAIN** (6 cards) — biggest cut needed (probably 6→4)
5. **RHYTHM** (4 cards) — full mechanical redesign
6. **TIMED_DROP** (4 cards) — friction differentiation
7. **TARGET_CHASE** (5 cards) — already mostly distinct, light pass
8. **PRECISION** (3 cards) — already mostly distinct, light pass
9. **Remaining binder uniques** (Shrek, Harambe, Grumpy, Success Kid, Chungus, Harold, Brain, Chuck, Pepe, GigaChad, First World, Mood Swing)
10. **Field cards** (6 cards) — add tradeoffs per Rule 0.4

### Per-batch process (repeat for each batch)
1. List the cards in the batch and their current effect.
2. State the differentiation axis from Rule 0.2.
3. Assign each card a unique position on that axis.
4. Write the new effect text in plain English.
5. Confirm budget math against Rule 0.5.
6. Cross-check: does any card in the batch still clone another?
7. Update `game.js` `CARD_LIBRARY` for that batch only.
8. Smoke test in browser before moving to next batch.

---

## Phase 3 — Cross-Card Balance Pass

After all batches are rewritten, do a horizontal sweep.

### 3.1 Rarity curve check
For each rarity, plot expected value per use:
- Common Burns should cluster around 30–45 EAS.
- Uncommon Burns around 120–180 EAS.
- Rare Burns around 600–900 EAS (or up to 1350 EAS with a hard downside).
- Flag any outlier and rebalance.

### 3.2 Binder slot competitiveness check
For each rarity, ask: "If I have 5 slots and own every card in this rarity, which would I drop?"
If any card is the answer twice, it needs a buff or a non-stat hook (per Rule 0.3).

### 3.3 Field card tradeoff check
For each field card, write the tradeoff in one sentence. If the sentence is just "+X% multiplier and looks cool," it fails Rule 0.4 — rewrite.

---

## Phase 4 — Combo Stress Test

Before shipping, simulate the 5 highest-risk combos by hand. For each, write down the resulting EAS/sec and compare to baseline.

### Combos to test
1. **Rickroll + El Risitas** — should now pay base, not 3× base (validates Rule 0.1).
2. **Field × Burn mult stacking** — calculate the multiplicative blowup ceiling with max Field + active Burn buffs running simultaneously.
3. **Chuck Norris (10× crit) + Star Wars Kid (2× clicks) + Big Chungus (+5% APC)** — click-side burst ceiling.
4. **GigaChad + Sigma Slam field + Rickroll** — passive-side burst ceiling.
5. **Pepe's random Burn cast + a stacked mult window** — uncontrolled randomness check.

Each combo's max output should be within 3× of the next-best non-combo play. If anything exceeds 5×, redesign the offending card.

---

## Phase 5 — Implementation in game.js

### 5.1 Refactor before adding logic
- Split economy into `baseAPS` and `activeAPS` variables.
- Add per-archetype handler functions so card effects don't sprawl through the click loop.
- Add a debug overlay that prints current `baseAPS`, `activeAPS`, active buffs, and their stack sources.

### 5.2 Per-card implementation
- Implement one archetype batch at a time (matches Phase 2 order).
- Each new card gets a single-line comment with its differentiation axis position.
- Run the smoke test (Phase 2 step 8) before moving on.

### 5.3 Pack pull validation
After each batch, open 20 packs in dev mode and confirm rarity distribution still matches design intent.

---

## Phase 6 — Playtest Validation

### 6.1 Three play sessions, three goals
- **Early game (0–10 min):** does every Common feel useful?
- **Mid game (10–45 min):** do Uncommons make a visible difference?
- **Late game (45+ min):** do Rares feel rare and Mythics feel mythic? Are any Commons now dead weight in the binder?

### 6.2 What to log
- Per card: times pulled, times used, EAS earned when used.
- Per session: peak `activeAPS` / `baseAPS` ratio (sanity-check Rule 0.1).
- Any card not used in 3 consecutive sessions = candidate for redesign.

---

## How Claude Should Use This Plan

When the user says "let's work on cards":
1. **Ask which phase we're in.** Don't assume.
2. **Work one batch at a time.** Never rewrite >5 cards in a single turn — the user has consistently asked for focused, bounded work.
3. **Before proposing a card rewrite, state which differentiation axis it occupies** (Rule 0.2). If you can't name it, the design is incomplete.
4. **Before approving a burst/multiplier card, run the Rule 0.1 check** out loud: "this reads from baseAPS, not activeAPS."
5. **Track progress directly in this file.** Check off items in Phase 1, mark batches done in Phase 2, etc. This file is the source of truth.
6. **Don't reintroduce clones.** Before adding a new card to a batch, re-read Rule 0.2 and the other cards already in that archetype.

---

## Progress Tracker

### Phase 0 — Rules locked
- [x] Rule 0.1 (base vs active income) — code fix deferred to Phase 5: add computeBaseEAS()
- [x] Rule 0.2 (differentiation axes)
- [x] Rule 0.3 (binder slot premium)
- [x] Rule 0.4 (field tradeoffs)
- [x] Rule 0.5 (EAS budgets)

### Phase 1 — Audit complete
- [x] Full audit table built — 19 issues catalogued

### Phase 2 — Batch rewrites

#### Batch 1 — AUTO_COLLECT ✅ DONE
Differentiation axis: **click pattern** (rapid discrete / echo-mirror / boss-piercing / area sweep)

| Card | Old effect | New identity | New effect | Budget |
|------|-----------|--------------|-----------|--------|
| Spiderman Pointing | 15 clicks × 2.0× = 30× | **Rapid baseline** — no change | 15 rapid auto-clicks over 5s at 2× click value | 30× ✓ |
| Distracted Boyfriend | 20 clicks × 1.5× = 30× | **Echo-mirror** — every manual click during 8s spawns a second click 150px offset | Pairs with COIN_RAIN / TARGET_CHASE (doubles reach); weaker alone | ~25–35× situational |
| Vitas | 12 clicks × 2.5× = 30× | **Boss-piercing** — 12 auto-clicks over 5s at 2.5× that bypass Skibidi Toilet armor | Normal clicks do nothing during boss block; Vitas ignores it | 30× + boss utility |
| Disaster Girl | 10 clicks × 3.0× = 30× | **Area sweep** — slow horizontal sweep across nugget; catches multiple COIN_RAIN / TARGET_CHASE items in its arc | 10 sweep-clicks over 4s at 3×; catches up to 3 nearby targets in each sweep step | 30–45× situational |

- [x] AUTO_COLLECT (4)
- [x] INSTANT_BURST (5)
- [x] SCREEN_GAG pity trio (3)
- [x] COIN_RAIN (6 — kept all 6, differentiated by motion + reward type)
- [x] RHYTHM (4)
- [x] TIMED_DROP (4)
- [x] TARGET_CHASE (5)
- [x] PRECISION (3)
- [x] Binder uniques (12, includes Evil Kermit gamble fix)
- [x] Field cards (6)

### Phase 3 — Cross-card pass
- [x] Rarity curve check — 1 fix: All Your Base capped at 60s
- [x] Binder slot competitiveness check — 1 fix: Big Chungus hitboxBonus added
- [x] Field tradeoff check — 1 fix: Nyan Cat mult 0.40→0.30

### Phase 4 — Combo stress test
- [x] All 5 combos tested

#### Results
| Combo | Pre-fix | Post-fix | Verdict |
|-------|---------|---------|---------|
| Rickroll + El Risitas | 3× over-payout ❌ | 600s income ✅ | Phase 5 computeBaseEAS() mandatory |
| Field × Burn mult stacking | 5.4× ❌ | 1.8× ✅ | Same Phase 5 fix resolves |
| Chuck Norris + SWK + Chungus | 1.5× total ✅ | — | Passes, no change |
| GigaChad + Sigma Slam + Rickroll | 5.4× ❌ | 3.0× ⚠️ | At threshold; acceptable given Sigma Slam tradeoff + 2 Rare pulls |
| Pepe + mult window | 1.17× ✅ | — | Passes, no change |

**Root cause of all failures:** `computeEAS()` multiplies by `apsMultTimer`. Single Phase 5 fix (`computeBaseEAS()` that excludes `apsMultTimer`) resolves Combos 1 and 2 and brings Combo 4 to threshold.

### Phase 5 — Implementation
- [x] Economy refactor (computeBaseEAS added; INSTANT_BURST + GAMBLE handlers fixed)
- [ ] Per-batch implementation (new params need rendering logic)
  - [x] B1 — exploits + one buff list (D1 multi-copy cap, D2 Brain, OAG Kek cap, additive buffs, D6 mechanism, base EAS everywhere): [docs/balance/B1.md](docs/balance/B1.md)
  - [x] B2 — stuck states and lost cards (burn gate + paged bar above the boss, nugget-size counters + Big Chungus, chase timeouts, Moth swap, FWP, pack on purchase, `awardKek`, filter variables): [docs/balance/B2.md](docs/balance/B2.md)
- [ ] Pack pull validation

### Phase 6 — Playtest
- [ ] Early-game session
- [ ] Mid-game session
- [ ] Late-game session