# Balance sweep validation (after B9)

This file covers the end-of-sweep checks from [CARD_BALANCE_SWEEP_PLAN.md](../CARD_BALANCE_SWEEP_PLAN.md):
- §6.2: the 10 combo checks.
- §6.3: the pack pull validation.

The run is on branch `claude/project-thread-0k9wjd` after the B9 commit.

**Sources:**
- `node tools/smoke-test.mjs`: common pass + B1–B9 + `COMBOS`. **126 / 126 checks passed, 0 page / console errors.**
- `node tools/card-sim.js`, seed 12345, 300 completion trials, one 1,000-pack run.
- "Before" numbers come from running the same sim on the B8 `game.js` with `--game`.

## §6.2 Combo stress test

**Setup:** Mid reference state (APS 740, APC 51), 6 cps (7 cps for frenzy). Measured in the real page by the smoke test's `COMBOS` block, with passive income switched off for the payout measurements.

**Rule (BALANCE_PLAN Phase 4):** a combo passes if it is ≤ 3× the best non-combo play in it. Over 5× means redesign.

| # | Combo | Measured | Best single play | Ratio | Result |
|---|---|---|---|---|---|
| 1 | Rickroll + El Risitas | Risitas pays 600 base EAS with Rickroll live | Risitas alone, 600 | **1.00×** | ✅ pass |
| 2 | Field × Burn: Moth (+70%) + Rickroll + Charlie + Dream | Income 8.5× base (APS buffs 1 + 2 + 2 + 1, capped at 5, × 1.7 Field) | Rickroll alone, 3× | **2.83×** | ✅ pass |
| 2b | Field × Burn: Sigma (+70%) + MLG | 1.70× MLG's payout (Field is additive in base EAS) | MLG alone | **1.70×** | ✅ pass |
| 3 | Chuck Norris + Star Wars Kid + Big Chungus | 10 clicks = 53.2 plain clicks (2 × 1.4 × 1.9) | SWK alone, 20 | **2.66×** | ✅ pass |
| 4 | GigaChad + Sigma Slam + Rickroll | Income 6.12× (1.2 × 3 × 1.7) | Rickroll alone, 3× | **2.04×** | ✅ pass |
| 5 | Pepe + a mult window | APC mode + SWK: 28 vs 20 clicks; APS mode + Rickroll: 4.2× vs 3× | SWK / Rickroll alone | **1.40×** | ✅ pass |
| 6 | Frenzy + Dramatic Chipmunk + Chuck crit (35 clicks at 7 cps) | 3,100 vs 1,750 plain clicks. Biggest click 500× = 5 × 10 crit × 10 frenzy, inside `CLICK_TOTAL_CAP` 100 × frenzy | Frenzy + Chipmunk | **1.77×** | ✅ pass, cap honoured |
| 7 | OAG + Star Wars Kid + frenzy (300 centre clicks) | 15 Kek | OAG alone, 15 Kek (cap) | **1.00×** | ✅ pass |
| 8 | Max multi-copy, 10 held, "Use All" | El Risitas uses 3 for 4,200 EAS. Brian uses 3 for 14 Kek. 7 copies of each kept | 3 singles: 1,800 EAS / 6 Kek | **2.33×** | ✅ pass (D1 ×3 cap) |
| 9 | Boyfriend echo + Chocolate Rain + End of Ze World (48 nugget clicks over the whole rain) | 0 rain coins collected, 0 rain Kek, the missile untouched. The echo adds only its own 30 EAS D6 | No echo | **1.00× reach** | ✅ pass |
| 10 | Grumpy Cat + Success Kid + PBJ | Pack #1 costs 1 Kek (the `max(1, …)` floor). Capped pack costs 23 (= 30 − 2 − 5) | Plain capped pack, 30 | Never free | ✅ pass |

**All 10 pass. Nothing is above 3×.**

The closest are:
- #2, Field + three APS burns at 2.83×. The `APS_MULT_CAP` of 5 is what holds it.
- #3, Chuck + SWK + Chungus at 2.66×. This combo costs three slots plus a burn.

Combo #1 is also covered in the B1 checks (Rickroll + El Risitas, and Rickroll + Leroy at 700 base). Combo #9 with End of Ze World alone is covered in B6.

## §6.3 Pack pull validation (1,000 packs, before / after B9)

| | Before B9 (B8 game.js) | After B9 |
|---|---|---|
| Odds rule | Field 10%, SK bonus from Uncommon, no pity, no refund, no cap | Field 5%, SK bonus from Common, pity after 4 dupes, D5 refund, cap 30 |
| Rarity mix over 1,000 packs (Field / C / U / R) | 11.7 / 51.6 / 25.1 / 11.6% | 6.0 / 55.3 / 25.5 / 13.2% |
| Per-card odds (Field / C / U / R) | 1.67 / 2.25 / 1.33 / 1.08% | 0.83 / 2.37 / 1.40 / 1.14% |
| Per-card odds with Success Kid | 2.00 / 2.20 / **1.07** / 1.50% | 1.00 / 2.15 / **1.39** / 1.60% |
| Useless Binder/Field dupes in 1,000 packs | 336 (no value) | 296, all refunded: 775 Kek (0.78 / pack) |
| Pity swaps in 1,000 packs | — | 8 |
| **Packs to the full set (median, p10–p90)** | **314** (223–472) | **141** (129–152) |
| With Success Kid slotted | 325 (slower than without) | 137 (faster than without) |
| Net Kek to the full set (median, + 50 shop) | 75,253 (≈ 91 h of clicking) | **3,993 (≈ 4.8 h)** |
| Pack #10 cost / minutes of clicking for it | 18 Kek / 1.3 min | 18 Kek / 1.3 min |
| Pack #30 cost / minutes | 48 / 3.5 min | **30 / 2.2 min** |
| Pack #59 cost / minutes | 92 / 6.7 min | **30 / 2.2 min** |
| Cumulative Kek to pack #59 (+ shop) | 2,897 (3.5 h) | 1,595 (1.9 h) |
| Longest wait for one pack | grows without limit | **2.2 min** (cap 30; 23 with Grumpy + SK) |

Kek income is 13.8 / min at 6 cps (clicking only). Harambe + PBJ make it 27.2 / min.

**Target check:**
- The full set lands around pack 120–180: **141** median (p90 152). ✅
- In mid game you are never stuck more than ~5 minutes of clicking for the next pack: at most **2.2 min** at any pack number. ✅

The rarity mix and per-card odds match B9's analytic table. Field is now rarer per card than Rare (0.83 vs 1.14%), so Mythic reads as the rarest.
