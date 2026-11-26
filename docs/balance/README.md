# Balance sweep batches

These batches implement [CARD_BALANCE_SWEEP_PLAN.md](../CARD_BALANCE_SWEEP_PLAN.md) from the merged audit [docs/review/AUDIT.md](../review/AUDIT.md).

**Before you start:**
- Run them **in order**, one implementer on one branch (plan §5).
- After each batch:
  1. Re-run `node tools/card-sim.js` and paste the changed sections into that batch file.
  2. Run `node tools/gen-cards-csv.js` (from B3 on).
  3. Run the batch's smoke test.
- The B0 tooling is done (`tools/card-sim.js`). The only missing piece, `tools/gen-cards-csv.js`, is in B3.

**Budgets used everywhere:**
- Burn Aura: C 30–45, U 120–180, R 600–900 EAS (+50% for a real downside).
- Burn Kek per use: C ≤ 5, U ≤ 9, R ≤ 18. Binder/Field ≤ 14 Kek/min.
- Binder Aura: C 5–10%, U 8–15%, R 15–26% of total Aura/s at Mid.
- D6 is settled as **per-click EAS bonus, capped per use** (AUDIT §3).

## Group 1: B1–B3, pure bug fixes and approved decisions

These are Rule 0.6 / 0.7 fixes and D1–D6 as approved. They don't need a new OK, except the few rows marked *Curtis: OK?*: small behaviour choices made while fixing a bug.

| Batch | What it contains | Main shared code |
|---|---|---|
| [B1](B1.md) | **Exploits + buff rewrite.** D1 multi-copy cap 3 (consume only 3; Gabe plays the bones once and pays per bone). D2 Brain (+30% cap, open-time only). OAG Kek cap (15, Kek-main). One buff list with its own timers and additive stacking: fixes SWK/Chipmunk extending Gyatt, Charlie/Dream downgrading Rickroll, OAG misses stripping buffs. `CLICK_TOTAL_CAP` 100. **D6 mechanism** (`easPerClick` / `capEAS`, params 0). All one-shot payouts on `computeBaseEAS` (Rickroll leak). Kermit text | `activateBurnMulti`, `doClick`, `EFFECT_HANDLERS` (TEMP_*, PRECISION, AUTO_COLLECT), `gameLoop` timers, `computeEAS` call sites, `getBinderStats`, save/load |
| [B2](B2.md) | **Stuck states and lost cards.** Activation gate (Sigma no longer eats AUTO_COLLECT; nugget-only burns blocked during boss/off-tab). Burn bar sorted by rarity and paged (not just the first 10). Burn bar above the boss overlay. Nugget size/visibility counters (no stuck shrink/grow) + Big Chungus scale. Chase timeout removes only its own targets + dt movement. Moth blackout cleared on swap. FWP after load. Pack added at purchase. `awardKek` helper + Kek coin fallback. Filter variables (GigaChad grayscale, AYB/Dentist overlap) | `activateBurn`, `renderBurnBar`, index.html z-index/filters, `PRECISION`/`SCREEN_GAG`, `spawnBurnTarget`, `applyFieldTheme`, `buyPack`/`dismissPack`, `loadGame` |
| [B3](B3.md) | **Promises and text.** PBJ `cardDropRate` cut (D3). Rickroll `fakeCrash` overlay. Nyan/Ermahgerd/Ravioli dead params removed. Ohio really +50%. This is Fine reads its param. Moth spotlight follows the cursor. Kek coins auto-collect after 20 s, except under Sigma (Sigma's universal cost). Philosoraptor ❓. Pepe mode shown and saved. Pigeon real zigzag. Ugandan real swarm. End of Ze World pays per missile. Numa timing window + `randomPos`. Keyboard Cat bars off the nugget. Leroy/Troll/Kermit/units wording. **`tools/gen-cards-csv.js`** | card descs, `spawnBurnTarget`, `spawnRhythmGame`, `tickKekCoins`, `spawnEvent`, `getFieldMult`, tools/ |

## Group 2: B4–B9, number tuning that needs Curtis's OK

These are param changes, plus a few marked one-line code changes. At most 5 cards per table. A quick "ok" (or edits) per table is enough.

| Batch | Cards | Summary |
|---|---|---|
| [B4a](B4.md#b4a-auto_collect-family--all-your-base-5-cards) | Spiderman, Boyfriend, Vitas, Disaster Girl, All Your Base | D6 values for auto-clicks and echo (→ 30–36 EAS). Vitas becomes the boss killer (20 hits in 3 s). AYB counts clicks (45 at 6 cps) |
| [B4b](B4.md#b4b-temporary-buffs-4-cards) | Star Wars Kid, Dramatic Chipmunk, Charlie, Dream | D6 values for click buffs (→ 38–44 EAS). Charlie 3×/20 s (40). Dream 2×/30 s + freeze (30) |
| [B4c](B4.md#b4c-coin-rain--gag-2-cards) | Ravioli, Dentist | Ravioli 7.5/each (54, hard-skill premium). Dentist 55 → 45 |
| [B5a](B5.md#b5a-bursts-and-skill-cards-5-cards--1-shared-formula) | MLG, Woman Yelling, Keyboard Cat, Numa, Britney (+ RHYTHM formula) | MLG 160. Rhythm pays linearly from 0 with per-card `perfectEAS` (150 / 120 / 170). Britney 240 |
| [B5b](B5.md#b5b-precision-and-split-2-cards) | Surgery, Chocolate Rain | Surgery D6 (→ 150). Chocolate Rain 6/drop (split 1.18 → 0.95) |
| [B6](B6.md) | John Cena, Shia, Leroy, End of Ze World | Cena D6 (→ 680) + optional drift. Shia 800 with random pulses. Leroy 900 → 700. End 750 per-missile + 10 Kek perfect |
| [B7a](B7.md#b7a-timed_drop-cut--the-two-weak-uncommons-5-cards) | Stonks, Doge, Cheezburger, Big Chungus, Harold | TIMED_DROPs cut 5–12× (Stonks 10, Doge 5, Cheez 10). Chungus +40% APC. Harold half drain + 5% |
| [B7b](B7.md#b7b-pepe-1-card) | Pepe | Moods doubled (avg +20%) |
| [B8](B8.md) | Sigma Slam, Moth and Lamp, PBJ | Sigma 80 → 70%. Moth 65 → 70% (hand-tuned; number only). PBJ 30% + bonus every 2nd natural drop |
| [B9](B9.md) | Pack odds, Success Kid, dupes, price cap, pity, frenzy | D4 Field 5%. SK luck from Common. D5 dupe refund. **Decisions:** price cap 30, new-card pity after 4 dupes (median set 312 → 139 packs), optional frenzy APS ×2 |

## Combo checks (sweep plan §6.2): where each is fixed

| # | Combo | Fixed by |
|---|---|---|
| 1 | Rickroll + El Risitas | B1.3 (base EAS everywhere) |
| 2 | Field × burn | Unchanged; additive mult (AUDIT §5.5) |
| 3, 6 | Chuck + SWK + Chungus / frenzy + Chipmunk + crit | B1.2 additive buffs + `CLICK_TOTAL_CAP` |
| 4 | GigaChad + Sigma + Rickroll | B1 (APS cap 5) + B2 (filters) |
| 5 | Pepe + mult window | Fine at +40% |
| 7 | OAG + SWK + frenzy | Kek capped at 15 (B1) |
| 8 | Max multi-copy | ×3 cap (B1) |
| 9 | Echo + Chocolate Rain / End | The echo never hits coins or targets; capped (B1) |
| 10 | Grumpy + SK + PBJ | Discount floor unchanged; B9 cap |

Re-run all 10 after B4 and after B9.
