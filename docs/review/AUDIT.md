# Card Audit (merged review)

This file merges the four reviews into one list:
- [field-binder.md](field-binder.md) (R1)
- [burn-common.md](burn-common.md) (R2)
- [burn-unc-rare.md](burn-unc-rare.md) (R3)
- [systems.md](systems.md) (R4)

It is the input for the balance batches in [../balance/](../balance/README.md).

- **Code reviewed:** `game.js` / `index.html` at `e84fc53` (cleanup PR #2 merged). Neither file has changed since then, so every `game.js:LINE` reference holds at `HEAD`.
- **Sim:** `node tools/card-sim.js` (seed 12345). Its output is in Appendix A.
- **Smoke test:** 38/38 Burns pass with no console errors and no leaked filters (systems.md §8). The test found no crashes. The bugs below are logic bugs and interaction bugs.
- **Decisions:** Curtis approved D1–D6 on 2026-10-21. This merge settles D6 (§3). Open questions that D1–D6 don't cover are in §5.

---

## 0. Budgets used for every verdict

| What | Budget | Source |
|---|---|---|
| Burn Aura (EAS = seconds of `computeBaseEAS()`) | Common 30–45, Uncommon 120–180, Rare 600–900. Up to +50% for a real downside (gamble, hard skill check) | BALANCE_PLAN Rule 0.5 |
| Burn Kek per single use | Common ≤ 5, Uncommon ≤ 9, Rare ≤ 18 (≈ ¼, ½ and 1 × the price of pack #10, which is 18 Kek) | R4 proposal (systems.md §2.4), adopted |
| Split cards (Aura + Kek) | `EAS ÷ top Aura budget + Kek ÷ Kek budget ≤ 1.0` (≤ 1.5 with a real downside) | Rule 0.8, R4 |
| Multi-copy N | ≤ N × single budget × 1.25. **Exception:** D1's 1 → 3 → 7 for El Risitas (see §5) | R4 |
| Binder / Field Kek | ≤ 14 Kek/min while slotted (= normal 6-cps click Kek income) | R4 |
| Binder Aura (new; % of total Aura/s at 6 cps, Mid) | Common 5–10%, Uncommon 8–15%, Rare 15–26% | Taken from R1's "sane order" after the TIMED_DROP cut. Chuck Norris (+26%) and GigaChad (+14–17%), which nobody flagged, set the Rare band |

Reference states: Early EAS 40 / click 1, Mid 740 / 51, Late 9,575 / 502.5. Clicking at 6 cps earns 13.8 Kek/min.

---

## 1. Per-card table (59 cards)

**Flags:**
- **TXT:** the text is wrong.
- **NOOP:** a promised effect never happens.
- **C:** a clone of another card.
- **Dom:** dominated by another card.
- **D:** dead in a common situation.
- **X:** an exploit or unbounded effect.
- **K:** a Kek payout over budget.
- **BUG:** a code bug.
- **OK:** no problems.

**Columns:**
- **Pri:** the worst problem that touches the card.
- **Problems:** IDs in the §4 list.
- **Batch:** where each fix lands.

"Hand-tuned" marks Curtis's designs. For those cards only numbers and bugs change, never the design.

### Field (6)
| id | Name | Flags | Verdict | Pri | Problems | Batch |
|---|---|---|---|---|---|---|
| f1 | Ohio Boss | TXT | +50% Aura and 5 Kek per kill are fine. The boss rate is really +40%, but the text says +50%. Swapping in only for the kill is possible (cheese) | P2 | P2-03, P2-11 | B3 |
| f2 | Sigma Slam | BUG, Dom, D | Eats AUTO_COLLECT burns. Best Aura field at every state, and its cost only hits 5 cards | P0 | P0-12, P1-21 | B2, B3, B8 |
| f3 | Nyan Cat *(hand-tuned)* | TXT, NOOP (cosmetic) | Numbers hold (≤ 9 Kek/min, the lowest mult). "Up to 2 on screen" can't happen, and `cursorTrail` is never read. PBJ undercuts it | P2 | P2-07, P1-20 | B3 (PBJ fix in B8) |
| f4 | Moth and Lamp *(hand-tuned)* | BUG, TXT | The blackout gets stuck if you swap fields mid-blackout. The spotlight vars are never set. Ends at the same +65% as This is Fine, but with a harsher cost | P0 | P0-11, P2-06, P1-22 | B2, B3, B8 |
| f5 | This is Fine *(hand-tuned)* | TXT (internal) | Escalation works and fire resets on swap. The 0.25 base is hardcoded instead of read from `params.mult` | P2 | P2-08 | B3 |
| f6 | Peanut Butter Jelly | NOOP, Dom, K (at line) | "Cards drop 2×" is a NOOP. It doubles click Kek (+13.8/min) with no downside and dominates Nyan | P0 | P0-17, P1-20 | B3, B8 |

### Binder (15)
| id | Name | Flags | Verdict | Pri | Problems | Batch |
|---|---|---|---|---|---|---|
| bi_c1 | Shrek *(hand-tuned)* | OK | +5% and −10% drain. It only looked weak next to the over-budget TIMED_DROPs. No change | — | — | — |
| bi_c2 | Harambe *(hand-tuned)* | OK | +4.3 Kek/min plus a flat APC hook for the early game. In budget | — | — | — |
| bi_c3 | Stonks | TXT, over budget | +59–72% total from one click every 90s. "75 Aura" really means 75 s of income | P1 | P1-03, P2-01 | B7a |
| bi_c4 | Philosoraptor *(hand-tuned)* | TXT (cosmetic) | 2 Kek/min is fine. It drops a 🦖, not a "?" | P2 | P2-09 | B3 |
| bi_c5 | Doge | TXT, over budget | +35–50% with no friction. It makes FWP, GigaChad, Pepe, Shrek and Harold look dominated | P1 | P1-03, P2-01 | B7a |
| bi_c6 | First World Problems | BUG, Dom | Does nothing after a reload until the first click. Dominated by Doge until Doge is cut | P0 | P0-15, P1-03 | B2 (B7a cures the Dom) |
| bi_u1 | Grumpy Cat | OK | +3%, −10% upgrade cost and −2 Kek per pack. Fine | — | — | — |
| bi_u2 | Success Kid | TXT | Rare bonus is taken from Uncommon, which makes set completion slower. The type count shrinks when Burns are used up | P1 | P1-23, P2-10 | B9, B3 |
| bi_u3 | Big Chungus | NOOP, Dom | `scale: 1.5` and "easier chase events" are NOOPs. Weakest binder (+1%) | P0 | P0-18, P1-19 | B2, B7a |
| bi_u4 | Hide the Pain Harold | Dom | Same as Grumpy Cat minus the discounts | P1 | P1-19 | B7a |
| bi_u5 | I Can Has Cheezburger | TXT, over budget | +127–157% solo and +255–313% with Doge, about 10× budget. It is the "always kept" binder | P1 | P1-03, P2-01 | B7a |
| bi_u6 | Expanding Brain | X, TXT | Uncapped, runs on the wall clock, and grows offline and while unslotted (+1,440% after a day) | P0 | P0-03 | B1 (D2) |
| bi_r1 | Chuck Norris | OK (system X) | +12–26% total, and the cleanup fix holds. Its crit ignores every click cap (up to 20,000× clicks) | P1 | P1-02 | B1 |
| bi_r2 | Pepe (Mood Swing) | Dom | +8–10%, below GigaChad in every state. The current mode is invisible and not saved | P1 | P1-18, P2-30 | B3, B7b |
| bi_r3 | GigaChad | TXT (cosmetic) | Numbers are fine. Its grayscale is lost under the Ohio, Fire and PBJ themes and under burn filters | P2 | P2-05 | B2 |

### Burn: Common (18)
| id | Name | Flags | Verdict | Pri | Problems | Batch |
|---|---|---|---|---|---|---|
| bu_c1 | Troll Face | TXT, C, BUG (system) | 45 EAS is in band. It doesn't run away. Its timeout wipes other chase cards' targets, and it reads live EAS | P0 | P0-09, P0-06, P2-16 | B1, B2, B3 |
| bu_c2 | Is This a Pigeon? | TXT, BUG (minor) | 45 EAS is in band. It moves in a straight line with no zigzag, the window is ~7.8 s not 4 s, and movement is frame-rate bound | P0 | P0-06, P2-15 | B1, B3 |
| bu_c3 | Spiderman Pointing | D, BUG, under | Pays 0.4–1 EAS (1–3% of budget). The Kek scoop is worth about 0. Eaten under Sigma | P0 | P0-12, P1-01, P2-20 | B2, B4a |
| bu_c4 | Distracted Boyfriend | D, TXT, under | Pays 1–3 EAS. 331 EAS when combined with Gyatt. The "ghost click 150px away" is cosmetic | P1 | P1-01, P1-02, P2-19 | B1, B4a |
| bu_c5 | Mocking SpongeBob | TXT | 5 Kek, right at the Common line. Multi-copy is linear, but the button promises 2^N−1. The doubles only apply to nugget coins | P2 | P2-18 | B1 |
| bu_c6 | Bad Luck Brian | X, K (multi) | 2 Kek single is fine. Multi-copy is 2^N−1 and uncapped (2,046 Kek / meshes at N=10) | P0 | P0-01 | B1 |
| bu_c7 | Epic Fail Guy | OK | 30 EAS no-skill anchor | — | — | — |
| bu_c8 | Charlie Bit My Finger | Dom, BUG, under | 10 EAS. Dominated by Dream. It overwrites a running Rickroll (−110 EAS) | P0 | P0-07, P1-04 | B1, B4b |
| bu_c9 | Have You Ever Had A Dream | BUG, D, under | 10 EAS. Its freeze can't be cast once a boss is up, because the burn bar sits under the overlay. It also overwrites Rickroll | P0 | P0-14, P0-07, P1-04 | B1, B2, B4b |
| bu_c10 | Kazoo Kid | TXT (unit) | 45 EAS. The only coin rain whose motion matches its text | P0 | P0-06, P2-01 | B1, B3 |
| bu_c11 | Star Wars Kid | X, Dom, under | 2–6 EAS alone. Its shared timer extends Gyatt's 100× (up to 614 EAS) and Chipmunk's 5× | P0 | P0-05, P1-01, P1-05 | B1, B4b |
| bu_c12 | Vitas (Chum Drum) | D, TXT, under | 1–2 EAS. Its boss pierce can't fire (burn bar is under the boss overlay). No boss "armor" exists | P0 | P0-14, P1-01, P2-20 | B2, B4a |
| bu_c13 | Pink Guy Ravioli | Dom, NOOP (minor) | Hardest coin rain, same 45 cap as Pigeon. `duration` is never read | P1 | P1-07, P2-20 | B3, B4c |
| bu_c14 | Dramatic Chipmunk | X, under | 3–8 EAS alone. In budget during frenzy. Shared-timer stacking | P0 | P0-05, P1-01 | B1, B4b |
| bu_c15 | Disaster Girl | D, TXT, under | 1–2 EAS alone. Never sweeps "targets". Hides 10 auto-clicks. Eaten under Sigma | P0 | P0-12, P1-01, P2-17 | B2, B4a |
| bu_c16 | David After Dentist | BUG, over | Leaves the nugget stuck at 1.4×. Pays 55 EAS for a soft downside. Shares the body filter with other cards | P0 | P0-10, P0-06, P1-08, P2-12 | B1, B2, B4c |
| bu_c17 | Ermahgerd | TXT, NOOP (cosmetic) | 42–60 EAS, in band. Counts any click on the page. The "+Ns!" particle shows Aura. `textTheme` is never read | P2 | P2-13 | B3 |
| bu_c18 | All Your Base | C, TXT, BUG (minor) | Always floored at 30, so it is a clone of Epic Fail Guy. Counts stale timestamps | P1 | P1-06, P2-14, P2-12 | B2, B3, B4a |

### Burn: Uncommon (13)
| id | Name | Flags | Verdict | Pri | Problems | Batch |
|---|---|---|---|---|---|---|
| bu_u1 | MLG Airhorn | Dom, C | 120 EAS, the same as Arthur Fist minus the extras | P1 | P1-09 | B5a |
| bu_u2 | Arthur Fist | OK | 120 EAS + 2 Kek + a doubled click. Split 0.89 | — | — | — |
| bu_u3 | Ugandan Knuckles | TXT, X (combo) | 180 EAS. Targets come one at a time, not as a "swarm". Tripled by Rickroll | P0 | P0-06, P2-23 | B1, B3 |
| bu_u4 | Woman Yelling at Cat | TXT, C | Perfect 120 at the band floor. "Up to 6×" is meaningless. Same outcome as the other rhythm uncommons | P1 | P1-10, P2-22, P2-32 | B5a |
| bu_u5 | Leave Britney Alone | BUG, X (combo) | Hard chase that depends on frame rate, at a flat 180 (realistic ~110) | P0 | P1-15, P0-06 | B1, B2, B5a |
| bu_u6 | Surgery on a Grape | BUG, D, under | 5–15 EAS (≈10% of budget). Leaves the nugget stuck shrunk. Dead during a boss | P0 | P0-10, P1-01, P2-31 | B2, B5b |
| bu_u7 | Chocolate Rain | X (combo), split rich | 135 EAS + 5 Kek, split 1.2–1.4. Tripled by Rickroll | P0 | P1-17, P0-06 | B1, B5b |
| bu_u8 | Zombie Kid Turtle | OK | 8 Kek, nearly guaranteed. In budget. It is a victim of the target-wipe bug | P0 | P0-09 | B2 |
| bu_u9 | Keyboard Cat | TXT, C | No real skill check. A guaranteed 120. The bars can cover the nugget | P1 | P1-10, P2-22, P2-27 | B3, B5a |
| bu_u10 | Numa Numa Dance | TXT, C | No timing judgement. Mashing the centre catches every pulse | P1 | P1-10, P2-22 | B3, B5a |
| bu_u11 | Shooting Stars | TXT (unit), X (combo) | 180 EAS, in band. Tripled by Rickroll | P0 | P0-06, P2-01 | B1, B3 |
| bu_u12 | Rickroll | X, BUG, NOOP (cosmetic) | 120 EAS alone, but ×3 on every live-EAS payout (up to 2,700). Charlie and Dream downgrade it. `fakeCrash` is never read | P0 | P0-06, P0-07, P2-21 | B1, B3 |
| bu_u13 | Gabe the Dog | X, TXT, K (multi), Dom | Use All pays Kek with no minigame. Single use is all-or-nothing and dominated by Zombie. The "exponential" text is wrong | P0 | P0-02, P1-14 | B1 |

### Burn: Rare (7)
| id | Name | Flags | Verdict | Pri | Problems | Batch |
|---|---|---|---|---|---|---|
| bu_r1 | John Cena | BUG, under, Dom | 12–33 EAS (2–5% of budget). The invisible nugget never moves. Can leave the nugget shrunk. Resets OAG's window | P0 | P0-10, P0-08, P1-01, P1-16 | B1, B2, B6 |
| bu_r2 | Just Do It (Shia) | TXT | 546 EAS, at the band floor. Mashing beats its only real skill check | P1 | P1-11, P2-22 | B3, B6 |
| bu_r3 | Leroy Jenkins | TXT, X (combo), BUG, Dom | ≈880 EAS for one easy click. Dominates Risitas and Kermit. 2,700 with Rickroll. Its timeout wipes other targets | P0 | P0-06, P0-09, P1-12, P2-24 | B1, B2, B3, B6 |
| bu_r4 | El Risitas | X | 600 single. Multi-copy is uncapped (613,800 EAS at N=10). The violent shake is the same as MLG's | P0 | P0-01, P2-25 | B1, B3 |
| bu_r5 | End of Ze World | TXT, X (combo) | All-or-nothing on 25 targets (realistic EV ≈450), but the text says "900 total" plus a "bonus" | P0 | P0-06, P1-13, P2-23 | B1, B3, B6 |
| bu_r6 | Overly Attached GF | K, X, BUG | 81 Kek skilled and 150 at 10 cps (4.5× the Rare Kek budget). A miss strips other buffs | P0 | P0-04, P0-08, P1-01 | B1 |
| bu_r7 | Evil Kermit | TXT | EV 900, a fair +50% gamble premium over Risitas. "1800 Aura" really means seconds | P2 | P2-02 | B1 |

**Card counts by worst priority:**

| Priority | Field | Binder | Common | Uncommon | Rare | Total |
|---|---|---|---|---|---|---|
| P0 | 3 | 3 | 12 | 8 | 5 | **31** |
| P1 | 0 | 7 | 3 | 4 | 1 | **15** |
| P2 | 3 | 2 | 2 | 0 | 1 | **8** |
| OK | 0 | 3 | 1 | 1 | 0 | **5** |

Many cards count as P0 only because a system bug hits them, mostly the Rickroll leak (P0-06), the target wipe (P0-09) and the burn bar (P0-13/14). Only 18 cards cause a P0 through their own code or params:
- f2, f4, f6
- bi_c6, bi_u3, bi_u6
- bu_c6, bu_c8, bu_c9, bu_c11, bu_c14, bu_c16
- bu_u6, bu_u12, bu_u13
- bu_r1, bu_r4, bu_r6

---

## 2. Systems section (from R4, verified against the other reviews)

| Area | Finding | Ref | Problems |
|---|---|---|---|
| **Reference states** | Sim and hand math agree everywhere. One click is worth 0.025 / 0.069 / 0.052 EAS at Early / Mid / Late. That is why every click-paid Burn is 10–50× under budget | sim (a) | P1-01 |
| **Kek income** | 13.8 Kek/min at 6 cps (one coin per 26 clicks). Harambe raises it to 18.1, PBJ to 27.7. `KEK_IDLE_TIMEOUT_S` is unused: uncollected coins never auto-collect and aren't saved | game.js:1279-1284, 2309 | P2-28 |
| **Kek sources vs budget** | OAG (81 Kek) is the only single-use **K**. PBJ sits right at the per-minute line. Multi-copy Brian and Gabe break budget only through P0-01/02 | systems.md §2.1 | P0-04, P1-20 |
| **Pack cost** | `5 + floor(1.5 × n)`, linear and uncapped. Pack #59 costs 92 Kek. The median full set takes 312 packs, about 91 h of clicking. The sweep target of 120–180 packs is out of reach without a cap and a pity rule | game.js:682-686 | P1-26 |
| **Pull odds** | Each Field card has 1.67% per pack, which beats each Rare at 1.08% (D4). Success Kid takes its rare bonus from Uncommon. 336 of every 1,000 pulls are worthless Binder/Field dupes (D5) | game.js:688-702, 818 | P1-23, P1-24, P1-25 |
| **Multi-copy** | 2^N−1 for Brian and El Risitas. Linear for SpongeBob, and for Gabe with no minigame. All copies are consumed and copies are uncapped. Holding 3 El Risitas takes ~278 packs today, so the 1023× case needs a dev menu or a very long save. Cheaper packs (B9) would make the cap matter more | game.js:2238-2276, 1787 | P0-01, P0-02 |
| **Frenzy** | Triggers at 7 cps. Multiplies nugget clicks **and passive APS** ×10, worth +160–200 EAS/min if sustained, and 0 at 6 cps. Echo and auto clicks can't start it. Burn payouts are not multiplied | game.js:1289-1330, 1562 | P1-27 |
| **Click multiplier** | `CLICK_MULT_CAP` only bounds the stored buff. Gyatt 100 × crit 10 × Arthur 2 × frenzy 10 × echo 2 is up to 20,000× on one click | game.js:1232, 1250, 1254, 1266, 1387 | P1-02 |
| **Timed buffs** | Click buffs share one value and one timer, and the stronger buff keeps the longest timer. APS buffs overwrite each other | game.js:1902-1913, 2174 | P0-05, P0-07 |
| **Rule 0.1 leak** | `computeEAS()` includes the temporary APS mult. It is used by COIN_RAIN, TARGET_CHASE, SCREEN_GAG, TIMED_DROP and the boss reward | game.js:1743 + call sites | P0-06 |
| **Boss** | 20% of events (28% with Ohio, which is +40%). Drain is 2%/s capped at 20%, and a win pays 300 EAS. The overlay blocks the nugget **and the burn bar**. Shrek and Harold scale the drain rate only | game.js:2943-3011; index.html:924-929, 1402-1416 | P0-14, P2-03 |
| **Burn bar** | Shows only the first 10 owned Burn types, in library order. Cards are consumed before the handler can refuse them | game.js:1772, 1820 | P0-13, P0-12 |
| **Save/load** | Not saved: running buffs, Pepe's mood, Kek coins in flight, and the pack being opened (the card is lost). Brain is saved as a wall-clock start. FWP's idle clock starts at 0 | game.js:3018-3096 | P0-03, P0-15, P0-16, P2-30 |
| **Smoke test** | 38/38 ✅, 0 errors, 0 leftover filters, animations, zones or nugget styles in single-card runs. All the overlap bugs (P0-05/07/09/10) need two cards to reproduce | systems.md §8 | — |
| **Burn bar under boss overlay (confirmed)** | `#burn-bar` is z-index 90 (index.html:929). `#boss-overlay.active` covers the whole screen at z 400 with `pointer-events:auto` (index.html:1402-1416). So no Burn can be clicked during a boss. The smoke test didn't try this; it is confirmed from the CSS | index.html:929, 1405, 1414 | P0-14 |

---

## 3. D6 decision: click-valued burns pay in EAS (per-click EAS bonus, capped per use)

Every click-paid Burn reaches only 1–10% of its budget at every reference state. That covers AUTO_COLLECT, TEMP_CLICK_MULT, PRECISION and the echo. The cause: one click is worth 0.02–0.07 seconds of APS in all three states. D6 option (a), `max(APS, APC × 3)`, would change nothing, because APC × 3 stays far below APS everywhere (Mid: 153 vs 740). A global click floor tied to EAS would fix the cards. But it would also re-price frenzy, Gyatt, Chuck Norris and plain clicking, all of which the sim currently calls balanced.

**Adopted rule.** Each click-paid Burn gets two params, `easPerClick` and `capEAS`. Every qualifying click during its window pays an extra `easPerClick × computeBaseEAS()`, until the activation has paid `capEAS` in total:
- **Qualifying clicks:** real nugget clicks during the window (centre hits only for OAG), or the card's own auto-clicks.
- **Click multiplier:** the card's existing multiplier stays as flavour and combo glue, and players see it.
- **No amplifiers:** the EAS part is not multiplied by frenzy, crits or other buffs, and it reads base EAS (Rule 0.1).
- **Budget:** it lands every card inside its rarity budget at all three states.
- **Rule 0.7:** the per-use cap keeps a 15-cps autoclicker finite.
- **Skill:** hit rate still matters.

**Where it lands:**
- The mechanism ships in **B1** with all params at 0, as part of the click-buff rewrite (one shared code path).
- OAG gets its numbers in B1, together with the Kek cap.
- The other cards get their numbers in B4a, B4b, B5b and B6.

---

## 4. Ranked problem list (deduped)

**Columns:**
- **Src:** which review reported the problem.
  - R1 = field-binder.md
  - R2 = burn-common.md
  - R3 = burn-unc-rare.md
  - R4 = systems.md
- **Line:** `game.js:LINE` unless prefixed `index.html:`.
- **Batch:** the batch file in `docs/balance/` that fixes it.

### P0: broken / bug / exploit / NOOP promise (18)
| ID | Problem | Src | Line | Batch |
|---|---|---|---|---|
| P0-01 | Multi-copy "Use All" is 2^N−1 with uncapped copies, and it consumes every copy. El Risitas ×10 = 613,800 EAS. Brian ×10 = 2,046 Kek and 2,046 meshes | R2, R3, R4 | 2238-2276 (2248, 2246) | B1 |
| P0-02 | Gabe "Use All" pays `kekReward × N` instantly with no minigame. The button promises 2^N−1 for SpongeBob and Gabe too | R3, R4 | 2259-2265, 1787 | B1 |
| P0-03 | Expanding Brain is uncapped and runs on the wall clock. It grows offline and while unslotted | R1, R4 | 636-640, 3031, 3073 | B1 (D2) |
| P0-04 | OAG pays 1 Kek per centre click with no cap: 81 skilled, 150 at 10 cps | R3, R4 | 1258-1262 | B1 |
| P0-05 | Click buffs share one value and one timer. SWK or Chipmunk extends Gyatt's 100× (up to 614 EAS from a Common), and SWK + Chipmunk gives 10× for 15 s. PRECISION extends too | R2, R4 | 1902-1907, 2174-2175, 1387 | B1 |
| P0-06 | Rickroll's ×3 (any TEMP_APS_MULT) leaks into one-shot payouts through `computeEAS()`. Rickroll + Leroy = 2,700 EAS. Also hits rains, chases, Dentist, TIMED_DROPs and the boss reward | R2, R3, R4 | 1743; 1630, 1985, 2013, 2041, 2068, 2193, 2660, 2680, 2956 | B1 |
| P0-07 | TEMP_APS_MULT overwrites value and timer. Charlie or Dream during Rickroll turns 3×/57 s into 1.5×/20 s | R2, R3, R4 | 1908-1911 | B1 |
| P0-08 | An off-centre OAG click divides by the whole `clickMultValue`, which strips other buffs. Surgery or Cena reset `kekPerHit` and `precisionCenterOnly`, which ends OAG's window | R3, R4 | 1243, 2176-2178 | B1 |
| P0-09 | A chase card's timeout removes every `.burn-target`, including other running chase cards' targets | R2, R3 | 2758-2761 | B2 |
| P0-10 | Nugget stuck shrunk or grown: Surgery, Cena and Dentist capture the "original" transform at cast and restore it later | R2, R3 | 2181, 2189, 2207, 2214 | B2 |
| P0-11 | Moth blackout stuck after a field swap mid-blackout | R1 | 1675-1716, 1068-1084 | B2 |
| P0-12 | Sigma Slam: AUTO_COLLECT burns are consumed before the handler refuses them | R1, R2, R4 | 1820, 2111-2114 | B2 |
| P0-13 | The burn bar renders only the first 10 owned Burn types in library order, so later cards (all Rares) can't be used | R4 | 1772 | B2 |
| P0-14 | The burn bar (z 90) sits under the boss overlay (z 400, `pointer-events:auto`), so no Burn works during a boss. Dream's freeze and Vitas's pierce become unreachable. Confirmed from the CSS | R2, R4 | index.html:924-929, 1402-1416 | B2 |
| P0-15 | First World Problems does nothing after a load until the first nugget click (`lastIdleClickTime` = 0) | R1 | 80, 1646 | B2 |
| P0-16 | Pack lost on reload: Kek is spent at purchase, but the card is only added on dismiss | R4 | 709-712, 818, 3095 | B2 |
| P0-17 | PBJ `cardDropRate` is a NOOP ("cards drop 2× as often"). D3: cut it | R1, R4 | 120 | B3 |
| P0-18 | Big Chungus `scale: 1.5` and "easier to catch chase events" are NOOPs | R1 | 133, 622-625 | B2 |

### P1: unbalanced / dominated / clone (27)
| ID | Problem | Src | Line | Batch |
|---|---|---|---|---|
| P1-01 | Click-paid Burns pay 1–10% of budget: Spiderman, Boyfriend, Vitas, Disaster Girl, SWK, Chipmunk, Surgery, Cena, OAG (Aura) | R2, R3, R4 | 1902-1907, 2109-2168, 2170-2190 | B1 (mechanism), B4a, B4b, B5b, B6 |
| P1-02 | No cap on the final click multiplier (Gyatt × crit × Arthur × frenzy). The echo copies the full `earned` | R1, R2, R4 | 1225-1268, 1387 | B1 |
| P1-03 | TIMED_DROP binders are 5–20× over budget: Cheezburger +127–157% (+255–313% with Doge), Stonks +53–65%, Doge +35–50%. This makes FWP, GigaChad, Pepe, Shrek and Harold look dominated | R1, R4 | 126, 128, 135, 1610-1638 | B7a |
| P1-04 | Charlie is dominated by Dream, and both pay 10 EAS against a 30–45 budget | R2 | 151-152 | B4b |
| P1-05 | SWK is dominated by Chipmunk (15 vs 20 extra click-seconds) | R2 | 154, 157 | B4b |
| P1-06 | All Your Base is always floored at 30, a clone of Epic Fail Guy | R2 | 1840-1850 | B4a |
| P1-07 | Ravioli is the hardest coin rain but has the same 45 cap as Pigeon and Kazoo | R2 | 156, 2028-2046 | B4c |
| P1-08 | Dentist pays 55 EAS for a near-free downside | R2 | 159, 2193-2217 | B4c |
| P1-09 | MLG Airhorn is strictly dominated by Arthur Fist | R3 | 163-164 | B5a |
| P1-10 | The three rhythm Uncommons are outcome clones at the band floor. Keyboard Cat and Numa have no skill check. Zero hits still pay budget/maxMult | R3, R4 | 166, 171-172, 2770-2873 | B3 (Numa timing), B5a |
| P1-11 | Shia, the only real Rare skill check, pays at the band floor and can be beaten by mashing | R3 | 178, 2876-2906 | B3 (random position), B6 |
| P1-12 | Leroy pays ≈880 EAS for one easy click and dominates El Risitas and Kermit | R3 | 179 | B6 |
| P1-13 | End of Ze World is all-or-nothing (realistic EV ≈450 skilled, ≈45 casual), while the text promises "900 total" plus a "bonus" | R3 | 181, 2716-2735 | B3 (per-target pay), B6 |
| P1-14 | Gabe single use is all-or-nothing on 25 bones and dominated by Zombie Turtle | R3 | 175, 1937 | B1 (per-bone, with P0-02) |
| P1-15 | Britney is a hard chase at a flat 180. All chase movement is per frame, so 120/144 Hz screens make it 2× harder | R2, R3 | 167, 2682, 2741-2752 | B2 (dt), B5a |
| P1-16 | John Cena's "invisible" constraint is trivial (the nugget never moves). Dominated by OAG | R3 | 177, 2183 | B6 |
| P1-17 | Chocolate Rain pays near-full Aura plus Kek (split 1.18 sim, 1.4 by hand) | R3, R4 | 169 | B5b |
| P1-18 | Pepe is dominated by GigaChad, and its current mode is invisible | R1 | 139, 584, 1567-1568 | B3 (show mode), B7b |
| P1-19 | Big Chungus is the weakest binder. Harold is Grumpy Cat minus the discounts | R1 | 133-134 | B7a |
| P1-20 | PBJ dominates Nyan (+40% vs +30%, and +13.8 vs 9 Kek/min) with no downside | R1 | 117, 120, 2355-2361 | B8 |
| P1-21 | Sigma Slam's cost only exists if you own 5 specific cards. It is the best field everywhere | R1 | 116 | B3 (idle Kek auto-collect off under Sigma), B8 |
| P1-22 | Moth and This is Fine both end at +65%, and Fire's friction is milder after its 150 s ramp | R1 | 118-119, 674 | B8 |
| P1-23 | Success Kid's `rareBonus` comes out of Uncommon, which makes set completion slower (mean 344 vs 332 packs) | R1, R4 | 697-698 | B9 |
| P1-24 | Each Field card is likelier than each Rare (1.67% vs 1.08%). D4 | R4 | 693 | B9 |
| P1-25 | Duplicate Binder/Field pulls are worthless (336 per 1,000 packs). D5 | R1, R4 | 818 | B9 |
| P1-26 | The pack cost curve is uncapped and linear. A full set takes ≈312 packs and ≈91 h | R4 | 682-686 | B9 (needs Curtis) |
| P1-27 | Frenzy multiplies passive APS ×10 (+160–200 EAS/min at 7 cps, a cliff at 6 cps) | R4 | 1562 | B9 (needs Curtis) |

### P2: polish / text / cosmetic NOOP (33)
| ID | Problem | Src | Line | Batch |
|---|---|---|---|---|
| P2-01 | "N Aura" really means N seconds of income: Troll, Pigeon, Kazoo, Ravioli, Dentist, Shooting Stars, Ugandan, Britney, Leroy, End, Stonks, Doge, Cheezburger | R1, R2, R3 | 126-183 (desc) | B3 (unchanged cards); with the numbers in B4–B7 |
| P2-02 | Evil Kermit's "1800 Aura" is 1800 × base EAS. "Bigger than El Risitas" is true only against one copy | R3, R4 | 183, 2100 | B1 |
| P2-03 | Ohio's boss rate is +40%, but the text says +50% | R1, R4 | 1408-1412 | B3 |
| P2-04 | Field and binder "+X%" are additive with Sigma Glaze, so they are diluted at Late (+80% → +32%) | R1, R4 | 1253, 1562, 1744 | Curtis decision (§5) |
| P2-05 | GigaChad's grayscale is overridden by the Ohio, Fire and PBJ theme filters and by inline burn filters | R1 | index.html:1251 vs 1384-1399 | B2 (with P2-12) |
| P2-06 | Moth's `--mx/--my` are never set, so the permanent spotlight sits at screen centre | R1 | index.html:1259-1265, game.js:1514 | B3 |
| P2-07 | Nyan's "Up to 2 on screen" can't happen. `cursorTrail` is never read | R1, R4 | 117, 2611 | B3 |
| P2-08 | This is Fine hardcodes 0.25 instead of reading `params.mult` | R1 | 674, 1705 | B3 |
| P2-09 | Philosoraptor drops a falling 🦖, not a "question mark" | R1 | 1628 | B3 |
| P2-10 | Success Kid's "per card type owned" drops when Burns are used up | R1 | 650 | B3 (text) |
| P2-11 | Free, instant field swaps allow "swap to Ohio for the kill" cheese | R1 | 2961-2967 | Curtis decision (§5) |
| P2-12 | `document.body.style.filter` is shared by AYB and Dentist, so overlapping casts cut each other short | R2, R4 | 1852-1853, 2204-2213 | B2 |
| P2-13 | Ermahgerd counts any click on the page. Its "+Ns!" particle shows Aura. `textTheme` is never read | R2 | 1861-1881, 1872, 160 | B3 |
| P2-14 | All Your Base: `recentClickTimestamps` is trimmed only inside `doClick`, so idle players still have stale clicks | R2 | 1276-1277, 1843 | B3 |
| P2-15 | Pigeon has no zigzag, `step(16)` makes it frame-rate bound, and butterflies can leave the screen | R2 | 1963-1997 | B3 |
| P2-16 | Troll Face "runs away", but really it is a slow drift | R2 | 144, 2682 | B3 |
| P2-17 | Disaster Girl's "targets" are never swept. Its 10 auto-clicks are hidden. Hover-only drops are missed | R2 | 158, 2160-2167 | B4a |
| P2-18 | SpongeBob's multi-copy is linear but promised as exponential. Its doubles apply to nugget coins only | R2 | 148, 2256-2258, 2405 | B1 |
| P2-19 | Distracted Boyfriend's "ghost click 150px away" is cosmetic; the card really means +100% click Aura | R2 | 147, 1264-1268 | B4a |
| P2-20 | Ravioli's `duration` is never read. Vitas mentions boss "armor". Spiderman has no "two Spidermen" visual | R2 | 155-156, 146 | B3 (Ravioli), B4a (Vitas, Spiderman) |
| P2-21 | Rickroll's `fakeCrash` is never read (D3: implement as cosmetic) | R3, R4 | 174 | B3 |
| P2-22 | Rhythm "up to N× Aura" text describes an internal ratio | R3 | 166, 171-172, 178 | B5a, B6 |
| P2-23 | Ugandan's "swarming" and End's "missiles" spawn one target at a time | R3 | 2737-2738 | B3 |
| P2-24 | Leroy "charges at you", but really it is the standard slow drift | R3 | 179, 2682 | B3 |
| P2-25 | El Risitas `shake: 'violent'` is the same shake as MLG on a single use | R3 | 1888 | B3 |
| P2-26 | Burn Kek grants bypass one shared path and skip `kekDoubleCount` | R3 | 1259, 1896, 1940, 2549, 2719, 2730 | B2 (`awardKek`) |
| P2-27 | Keyboard Cat's full-width bars can cover the nugget for 8 s | R3 | 2822 | B3 |
| P2-28 | `KEK_IDLE_TIMEOUT_S` is unused, so 3D Kek coins pile up and are lost on reload | R2, R4 | 2309, 2490-2495 | B3 |
| P2-29 | `spawnKekCoin` silently does nothing if the GLB models aren't loaded, so Brian is consumed and pays 0 | R4 | 2312 | B2 |
| P2-30 | Temp effects are lost on reload (accepted). Pepe's `moodIndex` isn't saved, and its timer runs while unslotted | R1, R4 | 1567-1568, 3018-3037 | B3 (Pepe only) |
| P2-31 | Precision and click-buff windows are wasted during a boss or off the SAUCES tab | R3 | 1220, index.html:1412-1416 | B2 (activation gate) |
| P2-32 | Woman Yelling counts any document click (shop, tabs) as an answer | R3 | 2800-2806 | Accepted (no batch) |
| P2-33 | `cards.csv` drifts from `CARD_LIBRARY`, and there is no generator | plan §0.4 | cards.csv | B3 (`tools/gen-cards-csv.js`) |

**Totals:** P0 18 · P1 27 · P2 33 = **78 distinct problems**.

---

## 5. Decisions still open (not covered by D1–D6)

1. **Pack price cap + new-card pity (P1-26).** The sweep target (full set at 120–180 packs) is out of reach without both. A cap of 30 Kek plus "after 4 dupes in a row, the next pull is a card you don't own" gives a median of 139 packs and ≈4.8 h of clicking (scratch Monte Carlo, D4 odds). Today it is 312 packs and ≈91 h. B9 proposes both; Curtis picks the values.
2. **Frenzy ×10 on passive APS (P1-27).** Keep it, or make frenzy multiply clicks only? Only the clicks-only option changes the baseline every burn is measured against. B9 lists it as optional.
3. **Click and APS caps.** B1 adds `CLICK_TOTAL_CAP = 100` (Gyatt × crit × Arthur, before frenzy) and `APS_MULT_CAP = 5`, and makes buffs stack additively, each with its own timer. That nerfs "Gyatt + Chuck crit" from 1,000× to 100× per click.
4. **D1 vs the multi-copy budget.** El Risitas ×3 = 4,200 EAS is above the R4 rule (≤ 3 × 900 × 1.25 = 3,375). The batches keep D1's 1 → 3 → 7 as approved. Say so if you want it lowered.
5. **Additive mult dilution (P2-04).** Fields and binders show "+80%", which is +32% at Late. Either make Field/Binder mults multiplicative on the base, or reword the text. Not scheduled.
6. **Field-swap cheese (P2-11).** Optional 30 s field-swap cooldown. Not scheduled.
7. **Small behaviour changes inside B2/B3 that go slightly beyond "fix the bug".** Each is listed in its batch for an explicit OK:
   - Burns that need the nugget are blocked during a boss or off-tab.
   - Distracted Boyfriend's echo is allowed under Sigma Slam.
   - Kek coins auto-collect after 20 s, except under Sigma Slam.
   - Numa and Shia pulses get random positions.

---

## Appendix A: `node tools/card-sim.js` (seed 12345), baseline before any batch

The full output is reproduced in [systems.md Appendix A](systems.md#appendix-a--node-toolscard-simjs-output-seed-12345). It is byte-identical to a fresh run at `HEAD`, because `game.js` hasn't changed since `e84fc53`. The burn and binder rows it reports are quoted as the "before" values in each batch table. After every batch, re-run `node tools/card-sim.js` and paste its sections (b)–(d) into that batch file.
