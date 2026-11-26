# SAUCE upgrade balance sweep

The card sweep (B1–B9) left the five SAUCE upgrades on their original numbers. This pass retunes them **with every other income source counted**: cards (Binder, Field, Burns, Kek Koins and packs), the Sigma Rizz Frenzy meter, and the random events (Skibidi boss reward, Level 67 Gyatt, Fanum Tax).

Tool: [`tools/progress-sim.js`](../../tools/progress-sim.js). It plays a whole run second by second for three players and buys upgrades greedily ("time to afford + payback" first):

| Profile | Clicks/s | Frenzy | Events caught | Burn skill |
|---|---|---|---|---|
| Casual | 4 | no (below 7) | 60% | 65% |
| Active | 6 | no | 90% | 100% |
| Frenzy | 8 | yes, about 23% of the time at 10× | 95% | 100% |

It is a model, not the game: burns pay their rarity's average Mid payout when pulled, timed Binder drops are folded into Aura/s, and nobody goes idle. Use it to compare curves.

```
node tools/progress-sim.js                    # full report for game.js
node tools/progress-sim.js --brief            # one block per profile
node tools/progress-sim.js --upgrades f.json  # try other numbers without editing game.js
node tools/progress-sim.js --sigma-add        # compare with the old additive Sigma (before decision S1)
```

## The change

| Upgrade | Before | After |
|---|---|---|
| 🍅 Ketchup | +1/s · 150 · ×1.15 | +1/s · **100** · ×1.15 |
| 🥗 Sus Ranch | +15/s · 3,000 · ×1.18 | **+8/s · 1,100 · ×1.15** |
| 🌶️ Szechuan Synergy | +10/click · 75,000 · ×1.20 | **+4/click · 15,000 · ×1.22** |
| 👿 Grimace Extract | +200/s · 3,000,000 · ×1.25 | **+75/s · 130,000 · ×1.16** |
| 💎 Sigma Ohio Rizz Glaze | +0.5× · 100,000,000 · ×1.50 | +0.5× · **3,000,000 · ×1.40** |

The upgrade descriptions in game.js and cards.csv were updated to match.

## Before and after (median of 5 runs)

**First copy of each upgrade**

| Profile | Before (K / R / S / G / σ) | After |
|---|---|---|
| Casual | 0.6 m / 7 m / 20 m / 1.8 h / **never in 6 h** | 0.4 m / 4 m / 10 m / 28 m / 1.3 h |
| Active | 0.4 m / 5 m / 12 m / 1.1 h / 3.9 h | 0.3 m / 3 m / 6 m / 13 m / 45 m |
| Frenzy | 0.1 m / 1.6 m / 5 m / 25 m / 1.3 h | 0.1 m / 0.8 m / 3 m / 9 m / 17 m |

**Average income (Active)**

| Time | Before | After |
|---|---|---|
| 30 min | 3.0K/s | 3.5K/s |
| 1 h | 12.0K/s | 12.7K/s |
| 3 h | 25.5K/s | 66.5K/s |
| 6 h | 51.3K/s | 113K/s |

**Where the Aura comes from over 6 h (Active)**

| | Clicks | Gyatt event | Passive | Boss | Burns |
|---|---|---|---|---|---|
| Before | 42% | 31% | 14% | 3% | 10% |
| After | 25% | 15% | 31% | 14% | 16% |

## What it fixes

1. **The Grimace wall.** Its first copy used to pay back in 4 h 10 min against about 2 min for Sus Ranch (75× worse), so from roughly 30 min to over an hour nothing new unlocked. Now each tier is reached about 2–3× later than the one before, and Ranch only falls behind Grimace after ~18 copies.
2. **Sigma Glaze is reachable:** about 45 min for an active player and 1.3 h for a casual one (it was ~4 h and never).
3. **Clicks no longer swamp everything.** Szechuan was the best buy for a long stretch because Level 67 Gyatt (100× clicks) and frenzy multiply it, so passive income stayed tiny. Burns and the boss reward pay out in seconds of *passive* income, so cards were weak too. Passive + boss + burns now give ~60% of the Aura for an active player (was ~27%).
4. **The late game keeps growing.** Every tier is still being bought at 6 h, and Active income roughly doubles between 3 h and 6 h.

## Effect on the card sweep

`tools/card-sim.js` reference states now use the SAUCE counts the sim reaches for an active player at ~10 min, ~45 min and ~4 h. At **Early and Mid** every Burn, Binder and Field card stays inside its budget (no flags changed). At **Late** (11 Sigma Glazes, 6.5× mult) every "+X% on everything" card is diluted, see S1.

## Open decision

**S1. Should Sigma Glaze multiply the card bonuses?** Today the global multiplier is one sum: `1 + 0.5 × Sigma + Binder % + Field %`. So "+70% Aura" from a Field is worth +70% with no Sigma but only about +11% with 11 Sigmas. The card sweep chose additive on purpose (AUDIT §5.5); this curve gets many more Sigmas than the old one, so the dilution now shows up late.

| Option | Late Field +70% worth | Active income at 6 h |
|---|---|---|
| (a) Keep additive (this PR) | +11% | 113K/s |
| (b) Sigma × (1 + cards) | +70% | 245K/s |

(b) is a small code change (the six places in game.js that add up the multiplier) and the card text would be literally true. Not done here; say the word.

Also worth noting, not changed: the **Level 67 Gyatt** event (100× clicks for 15 s, roughly once every 11 min) and **frenzy** stack to 1,000× clicks when they overlap. Gyatt was ~31% of an active player's Aura before this change and ~15% after.

## Decision S1: Sigma multiplies card bonuses (chosen by Curtis, 2026-11-26)

The total multiplier was `allAuraMult + binder addMult + field`, so every Sigma copy shrank card "+X%" bonuses (a +70% Field was worth about +11% late game). It is now `allAuraMult × (1 + binder addMult + field)` everywhere it is used (`doClick`, the `gameLoop` income ticks, `computeEAS`, `computeBaseEAS`, AUTO_COLLECT clicks). Card bonuses keep their stated value all game. `tools/card-sim.js`, `tools/progress-sim.js` and `tools/smoke-test.mjs` mirror the new formula.

Unlock times don't change. Income is higher once cards and Sigma stack (median of 5 runs, `node tools/progress-sim.js --brief`):

| Profile | 1 h | 3 h | 6 h |
|---|---|---|---|
| Casual | 2.71K/s | 48.8K/s | 133K/s |
| Active | 17.6K/s | 136K/s | 245K/s (was 113K additive) |
| Frenzy | 269K/s | 910K/s | 1.27M/s |

Burn payouts are measured in seconds of income (EAS), so they scale with it and every card stays inside its budget. `node tools/smoke-test.mjs`: 126/126.
