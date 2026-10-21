# Card Balance Sweep Plan

This plan turns the results of [CARD_REVIEW_PLAN.md](CARD_REVIEW_PLAN.md) (`docs/review/AUDIT.md`) into actual changes in `game.js` and `cards.csv`. It finishes the open parts of [BALANCE_PLAN.md](../BALANCE_PLAN.md): **Phase 5 per-batch implementation, Phase 5.3 pack pull validation, and Phase 6 playtests.**

The design rules from BALANCE_PLAN Phase 0 (Rules 0.1–0.5) still apply. This plan adds three more rules, an approval gate, and a way to split the work across agents without merge conflicts.

---

## 1. New rules (add to BALANCE_PLAN Phase 0)

### Rule 0.6 — The card does what it says
If the text promises it, the code does it. Every unread param from the review is either **implemented** or **removed from the text** — no third option. `cards.csv` is generated from `CARD_LIBRARY` so they can't drift again.

### Rule 0.7 — Nothing grows without a ceiling
No effect may scale without a cap: no uncapped time scaling, no unbounded copy stacking, no per-click payout without a limit. The test: "What's the payout if a player does this for 10 hours / with 10 copies / at 15 clicks per second?" must have a finite, sane answer.

### Rule 0.8 — Kek Koin budget per rarity
Kek Koins buy packs, so Kek payouts are measured against pack cost. Starting budget (confirm with review numbers):

| Rarity | Kek per single use |
|--------|--------------------|
| Common | ≤ ¼ of a mid-game pack (≈ 2–5 Kek) |
| Uncommon | ≤ ½ pack (≈ 5–10 Kek) |
| Rare | ≤ 1 pack (≈ 10–20 Kek) |
| Binder / Field (per minute while slotted) | ≤ normal click Kek income per minute |

A card should pay **Aura or Kek as its main reward**, not full value of both (Chocolate Rain style splits count against both budgets proportionally).

---

## 2. Decisions Curtis makes first (approval gate)

Nothing is implemented until these are answered. Each has a recommendation; the review's decision list may add more.

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | **Multi-copy "Use All" (2^N − 1)** | (a) Cap at 3 copies (max 7×) · (b) Linear + bonus: N copies = N × 1.25 · (c) Keep exponential but cap N at 4 (15×) | **(a)**: keeps the fun "1 → 3 → 7" jump in the text, kills the 1023× case |
| D2 | **Expanding Brain** | (a) Cap at +30% and only count time while the game is open · (b) Reset each session · (c) Keep uncapped | **(a)** |
| D3 | **Each NOOP effect still left after the cleanup PR** (pauseBoss, deadCenterOnly, doubleNext, fakeCrash, gagDuration/biggerNugget, rareBonus/mythicBonus, cardDropRate, fluctuate) | Implement / cut from text | Implement **pauseBoss, deadCenterOnly, doubleNext, rareBonus/mythicBonus, gagDuration** (they're what makes those cards different). Cut **cardDropRate** (no card drops exist; replace PBJ's line with something real), keep **fakeCrash / fluctuate** as small cosmetic implements if time allows, else cut from text |
| D4 | **Field odds** (each Mythic Field is likelier than each Rare) | (a) Field 10% → 5% · (b) Leave it | **(a)**, so Mythic feels rarer than Rare |
| D5 | **Duplicate Binder/Field pulls** (currently worthless) | (a) Convert dupes to Kek Koins (e.g. Common 1 / Unc 2 / Rare 4 / Field 6) · (b) Leave | **(a)**: small, softens bad luck. Counts against Rule 0.8 |
| D6 | **Burn payouts scale only with Aura/sec** | (a) Scale with `max(APS, APC × 3)` so click builds aren't punished · (b) Leave | Decide after review numbers; flag only |

---

## 3. Work order (batches)

Same approach as BALANCE_PLAN Phase 2: one batch at a time, **at most 5 cards changed per batch**, smoke test before the next one. Order is by severity, so the game is never left worse than it started.

| Batch | Contents | Why first |
|-------|----------|-----------|
| **B0 — Tooling** | `tools/card-sim.js` (from review), `tools/gen-cards-csv.js` (writes cards.csv from CARD_LIBRARY), a dev-menu "grant N copies" button if missing | Every later batch is measured with these |
| **B1 — Exploits (P0)** | multi-copy cap (D1), Expanding Brain (D2), OAG Kek per hit cap, Gabe multi-copy must still require catching bones, Evil Kermit text | Removes the runaway cases so later numbers mean something |
| **B2 — Broken promises, part 1** | Verify the cleanup PR's wiring of Dream `pauseBoss`, OAG `deadCenterOnly`, Arthur Fist `doubleNext`, Success Kid pack luck, David After Dentist gag; tune their numbers now that they work (e.g. Charlie is now strictly dominated by Dream) | Card identity depends on these |
| **B3 — Broken promises, part 2 + text** | PBJ rewrite, Stonks/Pepe/Rickroll cosmetics or text cuts, Distracted Boyfriend uses `echoOffset` | Finishes Rule 0.6 |
| **B4 — Burn Commons numbers** | Up to 5 per pass, worst P1 first (from AUDIT) | Most-pulled cards; early game feel |
| **B5 — Burn Uncommon numbers** | Up to 5 per pass | |
| **B6 — Burn Rare numbers** | Up to 5 per pass, plus Kermit EV vs El Risitas | |
| **B7 — Binder pass** | Slot competitiveness per rarity (Rule 0.3) | |
| **B8 — Field pass** | Tradeoff sentence per card (Rule 0.4), odds (D4) | |
| **B9 — Pack & Kek economy** | Pack rates (D4), dupes (D5), pack cost curve vs Kek income | Last, because B1–B8 change Kek income |

### Per-batch process
1. **Pick cards** from AUDIT.md for this batch (≤ 5).
2. **Write a change table** in `docs/balance/<batch>.md`:

   | Card | Problem (AUDIT ref) | Change | Axis (Rule 0.2) | Budget before → after (Early/Mid/Late) |
   |------|---------------------|--------|-----------------|------------------------------------------|

3. **Curtis approves the table** (or edits it). For B4–B8 a quick "ok" in the thread is enough.
4. **Implement** in `game.js`: params first, handler code only when needed. One-line comment per changed card naming its axis position.
5. **Regenerate `cards.csv`** with `tools/gen-cards-csv.js`.
6. **Re-run `tools/card-sim.js`** and paste the before/after numbers in the batch file.
7. **Smoke test** in a browser (Playwright): activate each changed card, no console errors, no leftover filters/overlays.
8. **Tick the box** in BALANCE_PLAN.md's progress tracker.

---

## 4. Default fixes to start from

These are proposals for the batch tables, based on what's already known. The review may change them.

**B1 — Exploits**
- `activateBurnMulti`: `n = Math.min(n, BAL.MULTI_COPY_CAP)` with `MULTI_COPY_CAP: 3`; only consume the copies used. Update El Risitas, Brian, SpongeBob, Gabe text.
- Gabe multi-copy: run the bone minigame once, pay `kekReward × N` only if all bones are caught (or per-bone share).
- Expanding Brain: track `G.brainMinutes` advanced by `dt` in the game loop (not `Date.now()`), cap at `capPct: 0.30`.
- OAG: with `deadCenterOnly` implemented, also cap Kek at `kekPerHitCap: 10` per use.
- Evil Kermit: text says "1800 seconds of income". Decide EV: keep 1800 (EV 900, +50% over El Risitas's 600 as a gamble premium per Rule 0.5) or drop to 1500.

**B2 — Broken promises** (the cleanup PR implements most of these; use this as the check list for its behaviour)
- Dream: while active, `tickBoss` skips drain and boss spawn. Charlie then stays as the plain version; consider buffing Charlie to 1.75× / 15s so it's not dominated (different shape: shorter, stronger).
- OAG: hit counts only if the click is within ~25% of the nugget radius from its center.
- Arthur Fist: set `G.doubleNextClick = true`, consumed in the click handler.
- Success Kid: in `pullCard()`, shift `rareBonus` from common into rare and `mythicBonus` into Field.
- David After Dentist: blur and big nugget for `gagDuration`, pay `pityEAS` at the end (sitting through it is the cost).

**B3 — Text / small**
- PBJ: replace "cards drop 2× as often" with something that exists, e.g. "+1 Kek per natural Kek drop" (already true) plus "pack costs −1".
- Pepe: read `cycleSec`. Stonks: `fluctuate` = random ±30% payout. Rickroll: 1.5s fake "Aw, Snap" overlay, then buff.

---

## 5. Splitting the work across agents

Changing numbers is serial by nature, because every card lives in one `CARD_LIBRARY` block in `game.js` and some fixes touch shared handlers. So the split is **parallel proposals, serial implementation**.

| Role | Runs | Does |
|------|------|------|
| **Proposal agents (P-Field/Binder, P-Common, P-Uncommon/Rare, P-Economy)** | In parallel, read-only | Each drafts the change tables for its batches (`docs/balance/*.md`) from AUDIT.md + sim numbers. No game.js edits |
| **Implementer (one agent, one branch)** | Serial, batch by batch | Applies approved tables to game.js, regenerates csv, runs sim + smoke test, opens/updates one PR per 1–2 batches |
| **Checker** | After each implemented batch | Re-runs sim and combo tests (section 6), compares to the batch table, flags anything off-budget |

Why not let several agents edit game.js at once: B1–B3 change shared functions (`activateBurnMulti`, `pullCard`, click handler, `tickBoss`), and the cleanup thread is also reformatting game.js. Parallel edits there would conflict constantly. Pure param changes (B4–B8, one card per line) *could* be parallel in separate worktrees, but they're small enough that serial is faster than resolving conflicts.

**Coordination with the "Codebase review and cleanup" thread:** its PR (branch `cleanup-and-fixes`) wires up most NOOP params, fixes Chuck Norris double-counting, applies Success Kid luck, pays RHYTHM by rarity, and makes Gabe multi-copy 2^N − 1. Branch balance work from `main` **after** that PR merges, and take sim baselines from the merged code. If it hasn't merged when B0 starts, B0 (new files under `tools/` only) can go ahead; B1 waits.

---

## 6. Validation

### 6.1 After every batch
- `node tools/card-sim.js` → every changed card inside its Aura/Kek budget at all three reference states.
- Browser smoke test of changed cards.

### 6.2 Combo stress test (rerun BALANCE_PLAN Phase 4 + new combos)
Each combo's peak must be within 3× of the best non-combo play (Phase 4 rule; redesign anything over 5×).

1. Rickroll + El Risitas (should pay base only — Rule 0.1)
2. Field × Burn mult stacking
3. Chuck Norris + Star Wars Kid + Big Chungus
4. GigaChad + Sigma Slam + Rickroll
5. Pepe + mult window
6. **New:** Frenzy (10×) + Dramatic Chipmunk (5×) + Chuck Norris crit — `CLICK_MULT_CAP` honored?
7. **New:** OAG + Star Wars Kid + frenzy — Kek per hit window
8. **New:** Max multi-copy El Risitas / Brian at the new cap
9. **New:** Distracted Boyfriend echo + Chocolate Rain / End of Ze World (double reach on Kek payouts)
10. **New:** Grumpy Cat + Success Kid + PBJ pack discount floor

### 6.3 Pack pull validation (BALANCE_PLAN 5.3)
Sim 1,000 packs before and after B9: rarity mix, packs to complete the set, and Kek income vs pack cost at pack #10 / #30 / #59. Target (to confirm with Curtis): full set around pack 120–180, never stuck more than ~5 minutes of clicking for the next pack in mid game.

### 6.4 Playtests (BALANCE_PLAN Phase 6)
Curtis plays three sessions (early / mid / late, can use dev menu to jump). Log per card: pulled, used, payout. Any card unused across all three sessions goes back into a batch.

---

## 7. Done when
- Every P0 and P1 item in AUDIT.md is fixed or explicitly accepted by Curtis.
- `cards.csv` is generated and matches `CARD_LIBRARY`.
- All 10 combos pass, pack validation done.
- BALANCE_PLAN.md tracker: Phase 5 and Phase 6 boxes ticked.
