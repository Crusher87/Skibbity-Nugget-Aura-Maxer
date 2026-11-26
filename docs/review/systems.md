# Systems & Economy review (R4)

Reviewer R4, brief = CARD_REVIEW_PLAN.md §1, §3, §5 plus the §0 findings. Code reviewed: `game.js` on branch `claude/project-thread-0k9wjd` at `e84fc53` (cleanup PR #2 merged). All `game.js:LINE` refs are for that commit. Flags as in plan §1 (TXT, NOOP, C, Dom, D, X, K, BUG, OK).

**How to reproduce**
- Numbers: `node tools/card-sim.js` (Node 22, no deps; reads `game.js` as text; ~0.2 s). Output pasted in the Appendix A. Re-run after every balance batch; card params and pullCard odds are read from `game.js` directly, and handler behaviour is mirrored one function per archetype (`BURN_MODELS`, `binderEffect`) so a handler change needs a matching edit there.
- Browser: Playwright + Chromium (SwiftShader WebGL) against `python3 -m http.server`. The CDN scripts (three.js r128 + GLTFLoader) are blocked by the sandbox proxy, so the test routes those two URLs to the identical `three@0.128.0` files from npm. Results in §8.

---

## 0. Cleanup PR verification (plan §0)

| §0 item | Status now | Ref | Flag |
|---|---|---|---|
| Dream `pauseBoss` | Wired: sets `bossPauseTimer` (game.js:1912); `tickBoss` skips drain and resets the AFK clock while it runs (game.js:2993-2997). It does **not** stop a boss from spawning (`spawnEvent` never checks it, game.js:1403-1416), and does nothing if no boss shows up in the 20s. | 1912, 2993 | OK (text matches "freezes") |
| OAG `deadCenterOnly` | Wired: off-centre (> 15% of container width) clicks lose the buff and the Kek (game.js:1237-1246, 1258). But the miss path divides out the *whole* `clickMultValue` (game.js:1243), so an off-centre click also loses a running Gyatt / Star Wars Kid buff. | 1237-1246 | OK, minor BUG |
| Arthur Fist `doubleNext` | Wired (game.js:1893, 1248-1252). Worth 1 click, ~0.1 EAS: cosmetic in practice. | 1893 | OK |
| Rickroll `fakeCrash` | Still NOOP (only appears in the params, game.js:174). | 174 | NOOP (P2) |
| David `gagDuration` / `biggerNugget` | Wired: 6s blur(2px) + 1.4× nugget, pays at end (game.js:2203-2217). | 2203 | OK |
| Success Kid `rareBonus` / `mythicBonus` | Wired (game.js:649-653, 693-698), but `rareBonus` is taken out of **Uncommon**, not Common: with SK the mix is Field 12 / C 52.8 / U 20.2 / R 15 instead of 10/54/25.2/10.8. Per-uncommon odds drop 1.33% → 1.07%, so SK makes completing the set *slower* (mean 344 vs 332 packs, sim (e)). | 697-698 | TXT/X-lite (P1) |
| PBJ `cardDropRate` | Still NOOP (game.js:120); `kekDropBonus` is now read from params (game.js:2356). | 120, 2356 | NOOP (P0 per Rule 0.6 / D3: cut) |
| Stonks `fluctuate` | Wired, ±30% (game.js:1620). | 1620 | OK |
| Pepe `cycleSec` | Read (game.js:1568). `moodTimer` ticks even when Pepe isn't slotted and `moodIndex` isn't saved. | 1568 | OK |
| Distracted Boyfriend `echoOffset` | Read (game.js:2118), value 150. | 2118 | OK |
| Nyan `cursorTrail`, Ermahgerd `textTheme` | Still NOOP, cosmetic (game.js:117, 160). | 117, 160 | NOOP (P2) |
| Chuck Norris double count | Removed (comment game.js:635; crit only in `doClick`, game.js:1227-1235). | 635 | OK |
| RHYTHM paid by own rarity | Yes (game.js:2770). Note a 0-hit run still pays `budget / maxMult` (Shia 60 EAS for doing nothing). | 2770-2773 | OK |
| Weaker click buff can't lower a stronger one | Yes (game.js:1905), but now buffs **multiply and take the longer duration** — see §6. The APS side was not fixed (§6). | 1904-1906 | X / BUG |
| Gabe multi-copy | Still linear `kekReward × N`, **no minigame** (game.js:2259-2265). | 2259 | X (P0, D1) |
| Multi-copy 2^N − 1 | Unchanged (game.js:2248). | 2248 | X (P0, D1) |
| Expanding Brain | Still uncapped and wall-clock based (game.js:636-640, saved at 3031). | 639 | X (P0, D2) |
| OAG Kek per hit | No cap: 81 Kek skilled / 45 casual per use (sim (b)). | 1258-1262 | K, X (P0) |
| Evil Kermit text "1800 Aura" | Unchanged; really 1800 × `computeBaseEAS` (game.js:183, 2100). | 183 | TXT |
| Field odds > Rare odds | Unchanged: 1.67% per Field vs 1.08% per Rare (sim (e)). | 693 | P1 (D4) |
| Duplicate Binder/Field useless | Unchanged: 336 of 1,000 pulls are useless dupes (sim (e)). | 818 | P1 (D5) |

---

## 1. Sim script

`tools/card-sim.js` — see header comment for usage. What it mirrors (lines printed live in its "Source map" line):

| Sim function | Mirrors |
|---|---|
| `baseG` | `buyUpgrade` effects (game.js:1350-1364) |
| `getBinderStats` | game.js:604-667 (same switch; Brain uses an explicit `brainMinutes`) |
| `getFieldMult`, `computeEAS`, `computeBaseEAS` | game.js:670-676, 1740-1746, 1750-1756 |
| `clickValue`, `apsIncome` | `earned` in `doClick` (game.js:1253) and the passive tick in `gameLoop` (game.js:1559-1564) |
| `packCost`, `clicksPerKek`, `kekPerMin` | `getKekPackCost` (game.js:682-686), Kek drop rule in `doClick` (game.js:1279-1284), PBJ bonus in `spawnKekCoin` (game.js:2356) |
| `BURN_MODELS.<ARCHETYPE>` | the matching `EFFECT_HANDLERS` entry (game.js:1835-2234), `spawnBurnTarget` (2676), `spawnRhythmGame` (2764) |
| `pullCard`, `cardOdds` | game.js:688-702; odds literals are parsed out of the function body |
| `multiPayout` | `activateBurnMulti` (game.js:2238-2276) |

Modelling assumptions (state them when quoting numbers): 6 cps; "skilled/casual" = 90%/50% *per item* for coin rain and precision, and = *run success probability* for all-or-nothing runs (TARGET_CHASE, Gabe, End of Ze World bonus); Aura payouts are *extra over what you'd earn by just clicking*; Success Kid assumes 10/30/50 unique cards owned at Early/Mid/Late; Expanding Brain 10/40/120 minutes since first slotted.

Reference state check (plan §3.1): Early APS 40 / APC 1 / EAS 40; Mid APS 740 / APC 51 / EAS 740; Late APS 3,830 / APC 201 / mult 2.5× / EAS 9,575. Clicking at 6 cps is 13% / 29% / 24% of income.

Headline from the sim that isn't in R1–R3's scope:
- **Every click-valued burn is 10–50× under its budget** (Star Wars Kid 6 EAS vs 30, Dramatic Chipmunk 8, Spiderman 1, Vitas 2, Distracted Boyfriend 3, Surgery 14 vs 120, John Cena 33 vs 600, OAG 28 vs 600 Aura). `computeEAS` measures Aura/sec, and at every reference state one click is worth 0.02–0.07 s of APS. This is the real D6 problem: the issue isn't that burns scale with APS, it's that click archetypes (AUTO_COLLECT, TEMP_CLICK_MULT, PRECISION) pay in click value at all. Fix direction: pay click cards `rarityBudget × computeBaseEAS() × hitFraction` (or scale click value by `max(1, computeBaseEAS / (CPS × clickValue))`), keeping the click as the skill check.
- **TIMED_DROP binders are huge next to every other binder**: Cheezburger +200% APS (+400% with Doge), Stonks +83%, Doge +50%, vs GigaChad (Rare) +20% and Chuck Norris +90% APC (≈ +12–26% total). R1 owns the cards; the system cause is that `valueEAS` is "seconds of income per drop" with a 60–90s interval (game.js:1618-1634), i.e. a fixed % of APS. Dom for GigaChad, Pepe, Shrek, Grumpy, Harold.
- **Field and global binder mults are additive with Sigma Glaze** (game.js:1253, 1562, 1744): Sigma Slam is +80% Early/Mid but only +32% Late; Shrek +5% → +2%. Intended or not, it should be stated.

---

## 2. Kek Koin economy

### 2.1 Income
Nugget drop rule: a coin when `clicksSinceLastKek >= 30` **or** `Math.random() < 0.01` (game.js:1279-1284). Expected clicks per coin = Σ_{j<30} 0.99^j = **26.03** → **13.83 Kek/min at 6 cps** (≈ 0.23 Kek/s). The coin is a 3D object that still has to be clicked (`tryCollectKekCoin`, game.js:1197, 2517-2534); clicks spent on coins don't count as nugget clicks. `KEK_IDLE_TIMEOUT_S = 20` (game.js:2309) says "auto-collect after this long resting" but **is never read** — uncollected coins sit forever and are lost on reload (not saved, game.js:3018-3037). NOOP / P2.

| Source | Kek | Rate / per use | Ref | vs budget (§2.4) |
|---|---|---|---|---|
| Clicking | 1 per 26 clicks | 13.8/min | 1279-1284 | baseline |
| Harambe (bi_c2) | interval 30→22 | 18.1/min (+4.3) | 620, 1279 | OK |
| Philosoraptor (bi_c4) | 3 per 90s hover | 2.0/min | 1626-1628 | OK |
| Nyan Cat (f3) | 3 per cat, every 20s, max 2 on screen | ≤ 9.0/min | 1691-1697, 2632 | OK (65% of click) |
| Ohio Boss (f1) | 5 per boss win | ≈ 0.6/min | 2961-2967 | OK |
| PBJ (f6) | +1 per `spawnKekCoin` call | +13.8/min (= +100%), also on Brian and Nyan coins | 2356-2361 | at limit |
| Bad Luck Brian (bu_c6) | 2 coins (×(2^N−1) multi) | 2 | 2223-2227, 2252 | OK single; X multi |
| Mocking SpongeBob (bu_c5) | next 5 coins ×2 | +5 | 2228-2233, 2405 | at limit |
| Arthur Fist (bu_u2) | +2 with 120 EAS | 2 | 1895-1900 | OK (split 0.89) |
| Chocolate Rain (bu_u7) | 5 Kek coins of 20 | 5 + 135 EAS | 2083-2092 | OK (split 1.18) |
| Zombie Kid Turtle (bu_u8) | 8 on kill | 8 | 2717-2723 | OK |
| Gabe (bu_u13) | 10 if all 25 caught; multi = 10×N, no game | 10 | 1937-1945, 2259 | OK single; X multi |
| End of Ze World (bu_r5) | +10 only on full clear, with 900 EAS | 10 | 2729-2735 | OK (split 1.4, gated) |
| **Overly Attached GF (bu_r6)** | 1 per centre click for 15s | **81 skilled / 45 casual; 150 at 10 cps** | 1258-1262 | **K, X** (4.5× rare budget) |
| Dev cheat | +50 on 5 CARDS-tab clicks | dev only | 536-546 | OK (gated, 3113) |

**Sinks:** shop unlock 50 Kek once (game.js:1155-1158) and packs (game.js:707-712). Discounts: Grumpy −2 and Success Kid up to −5 (at 25 unique) per pack, floor 1 (game.js:629, 655-657, 685). Both maxed = −7 Kek: 39% off pack #10, 15% off pack #30, 8% off pack #59 (flat discounts fade as prices climb).

### 2.2 Pack cost curve
`cost(n) = 5 + floor(1.5 × (n−1))` for the n-th pack (game.js:682-686) — linear, so cumulative cost is quadratic.

| Milestone | Pack cost | Cumulative (+50 shop) | Minutes @13.8/min | Minutes w/ Harambe+PBJ |
|---|---|---|---|---|
| Pack #10 | 18 | 165 | **12** | 4.5 |
| Pack #30 | 48 | 845 | **61** | 23 |
| Pack #59 (= number of cards) | 92 | 2,897 | **210** (3.5 h) | 80 |
| Median full set (314 packs, sim (e)) | 474 | 75,253 | **5,441** (≈ 91 h) | ≈ 34 h |

The sweep plan's target (full set at pack 120–180, never > 5 min of clicking for the next pack in mid-game) is far out of reach: the 59th pack alone is 6.7 min of clicking and the set takes ~90 hours of continuous 6-cps clicking. Card Kek income doesn't change this much (a whole Burn hand pays tens of Kek; pack #100 costs 153).

Cost-cap options for B9 (cumulative Kek / hours of clicking at 13.8/min):

| Curve | to #59 | to #150 | to #314 (median set) |
|---|---|---|---|
| Current (uncapped) | 2,897 / 3.5 h | 17,525 / 21 h | 75,253 / 91 h |
| Cap 48 (pack #30 price) | 2,237 / 2.7 h | 6,605 / 8.0 h | 14,477 / 17 h |
| Cap 30 | 1,595 / 1.9 h | 4,325 / 5.2 h | 9,245 / 11 h |
| Cap 25 | 1,378 / 1.7 h | 3,653 / 4.4 h | 7,753 / 9.3 h |

Recommendation: cap at **25–30 Kek** (≈ 2 min of clicking) and fix the set-completion tail with D5 dupe refunds and/or a pity rule (e.g. "a new card at least every N packs"), rather than steeper costs. With D4 (Field 5%) the Field cards become the long pole and completion gets slower; re-run the sim after B9.

### 2.3 Dupes
In 1,000 packs, 605 pulls are Burn dupes (usable) and 336 are Binder/Field dupes (useless) (sim (e)). D5's proposed refund (C1/U2/R4/Field6) is worth ≈ 1.0 Kek per pack once the binder side is complete (0.1×6 + 0.54×6/24×1 + 0.252×6/19×2 + 0.108×3/10×4), i.e. 2–5% of a pack: safe under Rule 0.8.

### 2.4 Proposed Kek budget (Rule 0.8, to confirm)
Anchor on pack #10's price (18 Kek): that is where Kek matters most, and a flat Kek payout naturally loses value later as pack prices rise (or holds steady if B9 caps the price).

| Rarity | Kek per single use | ≈ minutes of click Kek | % of pack #10 / #30 |
|---|---|---|---|
| Common | **≤ 5** | ≤ 0.35 | 28% / 10% |
| Uncommon | **≤ 9** | ≤ 0.65 | 50% / 19% |
| Rare | **≤ 18** | ≤ 1.3 | 100% / 38% |
| Binder / Field (while slotted) | **≤ 14 Kek/min** (≤ +100% of click Kek) | — | — |
| Multi-copy N | ≤ N × single budget × 1.25 | — | — |
| Split cards | `EAS/topBudget + Kek/KekBudget ≤ 1.0` (≤ 1.5 with a real downside) | — | — |

If B9 caps the pack price at 25–30, re-anchor to the cap: Common ≤ 6–7, Uncommon ≤ 12–15, Rare ≤ 25–30.

Against this budget: **OAG is the only K** (81 Kek, 4.5 packs' worth at #10). SpongeBob (5), Gabe (10, all-or-nothing) and PBJ (+100%) sit right on the line. Multi-copy Brian is K at N ≥ 3 (14 Kek for 3 commons = 4.7/card, OK after D1; at N = 10 it's 2,046).

---

## 3. Multi-copy (`activateBurnMulti`, game.js:2238-2276)

Eligible = `params.multiKekBonus` (game.js:2241): Mocking SpongeBob, Bad Luck Brian, Gabe, El Risitas. The "🔥 ALL" button title promises `2^N − 1× power` for all four (game.js:1787), but only Brian (game.js:2252-2255) and El Risitas (game.js:2266-2271) are exponential; SpongeBob is linear `doubleCount × N` (game.js:2256-2258, identical to using them one by one: TXT, the card text says "double even more"), and Gabe is linear `kekReward × N` **paid instantly with no bones** (game.js:2259-2265) — strictly better than playing the card (X). All copies are consumed (game.js:2246); copies are uncapped (`BURN_INVENTORY_CAP` only limits distinct types shown, game.js:1772). Verified in the browser: Brian ×3 spawned 14 coins, Gabe ×4 gave 40 Kek instantly, El Risitas ×3 paid exactly 4,200 × base EAS.

Payouts and how many packs it takes to hold N copies are in sim table (f). Highlights: El Risitas ×3 = 4,200 EAS (vs 1,800 for three singles), ×10 = 613,800 EAS (454M Aura at Mid). Brian ×10 = 2,046 Kek. **But reaching N is very expensive under the current pack curve**: holding 3 El Risitas takes ~278 packs (≈ 59k Kek, ≈ 71 h of clicking); 3 Brians ~134 packs (14k Kek). So the 1023× case is a dev-menu / very-long-save exploit, while 2–4 copies are reachable for commons in a long session. D1 (cap 3, consume only the used copies) fixes both; after B9 makes packs cheaper, holding copies gets faster, so the cap matters more, not less.

Also: Brian's (and Nyan's) Kek are 3D coins via `spawnKekCoin`, which silently returns if the GLB models haven't loaded or failed (game.js:2312) — the card is consumed and pays nothing; PBJ's bonus is after that early return too. 2,046 multi-copy coins would also be 2,046 cloned meshes/materials in the scene at once (game.js:2313-2322): a performance hazard, gone with D1.

---

## 4. Frenzy (game.js:1289-1330)

- Trigger: ≥ 7 clicks/s averaged over 3 s, only real `doClick` clicks count (game.js:1272-1275, 1303-1307). Echo clicks and AUTO_COLLECT clicks never push a timestamp (game.js:1264-1268, 2143-2149), so **neither can start frenzy**. Lasts 10 s, then 30 s cooldown (game.js:1312, 1321).
- What it multiplies: nugget clicks ×10 (game.js:1254), and the **passive APS tick ×10** (game.js:1562) — plus IDLE_DRIP (game.js:1651) and the displayed rate. Echo clicks copy `earned`, so they get ×10 too (game.js:1266).
- What it does not multiply: any burn payout (computeEAS/BaseEAS have no frenzy term, game.js:1740-1756), AUTO_COLLECT clicks (game.js:2147), Kek drops or OAG Kek per hit (game.js:1258-1262).
- Value (sim (g)): one frenzy is +106 / +133 / +123 EAS (Early/Mid/Late), 90 of it from the APS ×10. Sustained (10 s on / 30 s off) that's **+160–200 EAS per minute**, i.e. a free Uncommon burn every 40 s, available at 7 cps and zero at 6 cps. That cliff dwarfs most Common burns. Not a card bug, but it is the biggest non-card income lever and should be in the balance baseline. Suggest frenzy multiply clicks only (not APS), or count APS ×2.
- Combo ceiling: the click product is not capped. `CLICK_MULT_CAP` (10) only bounds the stored buff (game.js:1905, 2174); Level 67 Gyatt sets 100× directly (game.js:1387), then Chuck crit ×10 (game.js:1232), Arthur ×2 (game.js:1250), frenzy ×10 (game.js:1254), → up to **20,000× on one click** (and the echo adds a second copy). Sweep plan combo #6 will fail. Suggest `clickMult = Math.min(BAL.CLICK_MULT_CAP_TOTAL, …)` applied after all factors except frenzy.

---

## 5. Boss (Skibidi Toilet)

- Spawn: an event every 90–180 s (game.js:1392, 1600-1604); boss is 1 of 5 entries → 20%, one per ~11 min (game.js:1383-1390). Ohio adds a pre-roll of `(1.5−1)×0.2 = 10%` then the normal 20% → **28%, i.e. +40%, not the +50% the card says** (game.js:1408-1412). TXT, P2.
- While active the overlay takes pointer events (index.html:1414), so the nugget can't be clicked: no click Aura, no Kek drops, no frenzy progress.
- Drain: 2%/s of the bank, capped at 20% (game.js:3003-3011). AFK for 5 s with no boss clicks ends it with 10% lost (game.js:2999-3001). Win = 20 clicks inside 8 s (game.js:2979-2986) — 3.3 s at 6 cps → ~6.7% drained.
- Reward: `computeEAS() × 300` (game.js:2956). Because drain is a % of bank and reward is flat EAS, a win is net-negative once the bank exceeds **4,500 EAS (75 min of income)** (sim (g)). Fine as an anti-hoarding tax; worth stating in text. Reward includes Rickroll's ×3 (computeEAS, not base) → 900 EAS under Rickroll.
- Card interactions: Shrek ×0.9 and Harold ×0.8 multiply the **drain rate** (game.js:615, 632, 2943) — they cut the AFK loss 10% → 8% (both: 7.2%) and slow the cap, but the 20% cap is unchanged. Dream freezes drain and the AFK clock (game.js:2993-2997) but the boss stays up and resumes after 20 s. Vitas' 12 piercing clicks count toward the 20 (game.js:2151-2159) — can't win alone. Ohio +5 Kek per win (game.js:2961-2967). Drain multiplier is snapshotted at spawn (game.js:2943), so slotting Harold mid-fight does nothing.

Other events: Fanum Tax is 60% of events and takes 10% of the bank if not clicked within 3 s (game.js:1389, 1468-1481). Level 67 Gyatt (20%) is 100× clicks for 15 s = **468–614 EAS-equivalent** at Mid/Late (sim (g)), a Rare burn's worth for free, and it bypasses `CLICK_MULT_CAP`.

---

## 6. Burn activation & overlapping timed effects

- Global cooldown 1.5 s (game.js:20, 1813-1821), also on Use All (game.js:2245). The copy is decremented **before** the handler runs (game.js:1820), so a handler that bails consumes the card for nothing: every AUTO_COLLECT burn under Sigma Slam (game.js:2111-2114; verified in browser: Spiderman consumed, 0 auto-clicks). D + BUG, P1. Distracted Boyfriend's echo is also blocked though it's a manual-click effect.
- **Burn bar shows only the first 10 owned Burn types in CARD_LIBRARY order** (game.js:1772). With ≥ 10 commons/uncommons in hand, every later card — including all Rares — can't be clicked at all (verified: 38 owned, 10 rendered, last = Kazoo Kid). BUG, P0: a player hoarding commons can't use the Rare they just pulled. Fix: sort by rarity desc / most recent, or scroll.
- `TEMP_APS_MULT` **overwrites** value and timer (game.js:1909-1910): Charlie (1.5×/20 s) during Rickroll (3×/57 s left) drops it to 1.5×/20 s (verified in browser). Same for Dream. The cleanup fixed this only for click buffs. BUG, P1. Fix: `value = max(cur, p.mult)`, `timer = max(cur, p.duration)`.
- `TEMP_CLICK_MULT` now **multiplies** and keeps the **longer** timer (game.js:1904-1906): Dramatic Chipmunk then Star Wars Kid = **10× for 15 s** (verified). That's 9×15 = 135 bonus click-seconds vs 15 + 20 = 35 used separately (3.9×, over the Phase 4 3× rule). Two Star Wars Kids = 4× for 15 s. PRECISION also extends: after OAG's 15 s window the 6× (or 10× if stacked) stays until the other buff's timer ends (game.js:2174-2175). X, P1. Fix: each buff keeps its own value+timer (array of active buffs, product capped), or `value = max`, `timer` belonging to the winner.
- `CLICK_MULT_CAP` is enforced on the stored buff (game.js:1905, 1948, 2174) but not on the total click (see §4) or on Gyatt (game.js:1387).
- `computeEAS` includes the temporary APS mult (game.js:1743), and is used by COIN_RAIN (1985, 2013, 2041, 2068, 2660), TARGET_CHASE (2680), SCREEN_GAG (2193), TIMED_DROP (1630, 2660) and the boss reward (2956). So **Rickroll ×3 multiplies all of them**: Leroy or End of Ze World under Rickroll pays 2,700 EAS instead of 900. BALANCE_PLAN Rule 0.1 says only the live ticker may read the active APS. X, P1. Fix: switch those call sites to `computeBaseEAS()`.
- Shared `document.body.style.filter` (All Your Base 1852-1853, David 2204-2213): whichever timer fires first clears the other's filter early; while either runs, the inline filter hides GigaChad's/Sigma Slam's class filter (index.html:1246-1253). No permanent leak found (smoke test: 0 leftovers). P2.
- Effects that read state at activation vs. at collect: TARGET_CHASE fixes its reward at activation (game.js:2680), COIN_RAIN at each click — so a Rickroll started mid-rain boosts only the later coins. Fine, just inconsistent.

---

## 7. Save / load (game.js:3018-3096)

| Saved | Not saved (lost on reload) |
|---|---|
| aura, totalClicks, owned, APC/APS/mult, shop unlocked, packsPurchased, collection, binderSlots, fieldSlot, `scalingStartTime`, kekCoins, clicksSinceLastKek, totalKekEarned, `kekDoubleCount`, fireLevel (only if f5) (game.js:3019-3037) | every running burn effect (`clickMult*`, `apsMult*`, `precision*`, `kekPerHit`, `echoTimer`, `bossPauseTimer`, `doubleNextClick`), boss and frenzy state, `moodIndex`/`moodTimer`, `critClickCounter`, `fireAccum`, `recentClickTimestamps`, every `setTimeout`-driven payout (Ermahgerd, SCREEN_GAG, RHYTHM, COIN_RAIN/TARGET items), uncollected 3D Kek coins (`activeKekCoins`), the TIMED_DROP `_lastDrop` stamps (stored on the shared card object, game.js:1010, 1615), the open pack |

Consequences:
- **Burns are consumed before they pay** (game.js:1820) and their effects aren't saved, so closing the tab during any timed burn loses the card and the payout. P2 (expected for a clicker, but SCREEN_GAG/RHYTHM pay only at the end).
- **Pack bought then reloaded mid-animation**: Kek is spent and `packsPurchased` bumped at purchase (game.js:709-712), the card is only added on dismiss (game.js:818). The pagehide save (game.js:3095) writes that state → card lost. Verified in browser. BUG, P1. Fix: add to collection in `buyPack`, keep the animation cosmetic.
- **Expanding Brain** (`scalingStartTime`, game.js:637-639, 3031, 3073): set on first slot, never reset on unequip (game.js:1017-1026) and saved as a wall-clock time, so it counts time unslotted and time with the game closed. X, P0 (D2: track minutes in `gameLoop` via `dt`, cap 30%).
- Field/Binder effects recompute from saved slots on load (`applyFieldTheme`, `updateBinderSlotsUI`, game.js:3141-3142): fine. This is Fine keeps its fire level but restarts the 30 s step; Pepe restarts in APS mode; TIMED_DROP binders restart their interval (no instant drop). OK.
- Nothing is computed offline except Brain (game loop skips while hidden, game.js:1553; `lastTick` reset on focus, 1548). OK.

---

## 8. Browser smoke test — all 38 Burns

Setup: Chromium headless (Playwright, SwiftShader), page served by `python3 -m http.server`, three.js routed to local npm copies (CDN blocked by the sandbox). For each Burn a **fresh page**: wait for models, set the Mid reference state (`G.auraPerSecond = 740`, `G.auraPerClick = 51`), `devGiveCard(id)` (game.js:906), `activateBurn(id)` (game.js:1810), then a bot for the card's duration + 2 s: clicks the nugget, clicks every `.burn-coin` / `.burn-target` / rhythm zone / pulse, hovers coins, answers Woman Yelling's arrows. Then check: page errors, console errors, failed requests, card consumed, and leftovers (`body.style.filter`, `body.style.animation`, `#burn-fx` children, `.rhythm-zone`, nugget transform/opacity).

**Result: 38 / 38 ✅ — 0 page errors, 0 console errors, 0 failed requests, 0 leaked filters/animations/zones/nugget styles.** Boot (no card) also clean. Remaining `#burn-fx` children on 5 coin-rain cards are items still inside their own lifetime (removed by their `setTimeout`, game.js:1956, 2021, 2562, 2673), not leaks.

Caveat: under SwiftShader the page ran ~8–10× slow (a 150 ms `setTimeout` took 1.3–2.6 s while WebGL rendered), so the bot failed the fast skill runs (End of Ze World, Zombie Turtle, Gabe) and Aura numbers are only a sanity check. They match the sim where the bot can succeed (MLG 137, El Risitas 623, Leroy 916, Ugandan 204 EAS incl. ~10–15 EAS of passive income during the window).

| # | Card | id | Archetype | Result | Page/console errors | Aura gained (EAS, incl. passive) | Kek gained | Leftovers after window |
|---|---|---|---|---|---|---|---|---|
| 1 | Troll Face | bu_c1 | TARGET_CHASE | ✅ | none | 61 | 0 | none |
| 2 | Is This a Pigeon? | bu_c2 | COIN_RAIN | ✅ | none | 17 | 0 | 5 #burn-fx children (in-flight, removed by own timer) |
| 3 | Spiderman Pointing | bu_c3 | AUTO_COLLECT | ✅ | none | 17 | 0 | none |
| 4 | Distracted Boyfriend | bu_c4 | AUTO_COLLECT | ✅ | none | 20 | 0 | none |
| 5 | Mocking SpongeBob | bu_c5 | KEK_DOUBLE_BUFF | ✅ | none | 20 | 0 (+5 doubled pending) | none |
| 6 | Bad Luck Brian | bu_c6 | KEK_SPAWN | ✅ | none | 15 | 2 | none |
| 7 | Epic Fail Guy | bu_c7 | INSTANT_BURST | ✅ | none | 45 | 0 | none |
| 8 | Charlie Bit My Finger | bu_c8 | TEMP_APS_MULT | ✅ | none | 41 | 1 | none |
| 9 | Have You Ever Had A Dream | bu_c9 | TEMP_APS_MULT | ✅ | none | 42 | 0 | none |
| 10 | Kazoo Kid | bu_c10 | COIN_RAIN | ✅ | none | 50 | 0 | 2 #burn-fx children (in-flight, removed by own timer) |
| 11 | Star Wars Kid | bu_c11 | TEMP_CLICK_MULT | ✅ | none | 29 | 1 | none |
| 12 | Vitas (Chum Drum) | bu_c12 | AUTO_COLLECT | ✅ | none | 21 | 0 | none |
| 13 | Pink Guy Ravioli | bu_c13 | COIN_RAIN | ✅ | none | 68 | 1 | none |
| 14 | Dramatic Chipmunk | bu_c14 | TEMP_CLICK_MULT | ✅ | none | 12 | 0 | none |
| 15 | Disaster Girl | bu_c15 | AUTO_COLLECT | ✅ | none | 14 | 0 | none |
| 16 | David After Dentist | bu_c16 | SCREEN_GAG | ✅ | none | 74 | 0 | none |
| 17 | Ermahgerd | bu_c17 | INSTANT_BURST | ✅ | none | 42 | 0 | none |
| 18 | All Your Base | bu_c18 | INSTANT_BURST | ✅ | none | 49 | 0 | none |
| 19 | MLG Airhorn | bu_u1 | INSTANT_BURST | ✅ | none | 136 | 0 | none |
| 20 | Arthur Fist | bu_u2 | INSTANT_BURST | ✅ | none | 132 | 2 | none |
| 21 | Ugandan Knuckles | bu_u3 | TARGET_CHASE | ✅ | none | 204 | 0 | none |
| 22 | Woman Yelling at Cat | bu_u4 | RHYTHM | ✅ | none | 138 | 0 | none |
| 23 | Leave Britney Alone | bu_u5 | TARGET_CHASE | ✅ | none | 203 | 0 | none |
| 24 | Surgery on a Grape | bu_u6 | PRECISION | ✅ | none | 29 | 0 | none |
| 25 | Chocolate Rain | bu_u7 | COIN_RAIN | ✅ | none | 151 | 4 | 1 #burn-fx children (in-flight, removed by own timer) |
| 26 | Zombie Kid Turtle | bu_u8 | TARGET_CHASE | ✅ | none | 17 | 0 | none |
| 27 | Keyboard Cat | bu_u9 | RHYTHM | ✅ | none | 146 | 0 | none |
| 28 | Numa Numa Dance | bu_u10 | RHYTHM | ✅ | none | 147 | 0 | none |
| 29 | Shooting Stars | bu_u11 | COIN_RAIN | ✅ | none | 204 | 1 | none |
| 30 | Rickroll | bu_u12 | TEMP_APS_MULT | ✅ | none | 197 | 1 | none |
| 31 | Gabe the Dog | bu_u13 | COIN_RAIN | ✅ | none | 25 | 0 | 6 #burn-fx children (in-flight, removed by own timer) |
| 32 | John Cena | bu_r1 | PRECISION | ✅ | none | 40 | 1 | none |
| 33 | Just Do It (Shia) | bu_r2 | RHYTHM | ✅ | none | 353 | 0 | none |
| 34 | Leroy Jenkins | bu_r3 | TARGET_CHASE | ✅ | none | 916 | 0 | none |
| 35 | El Risitas | bu_r4 | INSTANT_BURST | ✅ | none | 623 | 1 | none |
| 36 | End of Ze World | bu_r5 | TARGET_CHASE | ✅ | none | 29 | 0 | none |
| 37 | Overly Attached GF | bu_r6 | PRECISION | ✅ | none | 25 | 4 | none |
| 38 | Evil Kermit | bu_r7 | GAMBLE | ✅ | none | 13 | 0 | none |

Targeted system checks (same harness, one page): Rickroll → Charlie leaves 1.5×/20 s; Chipmunk → Star Wars Kid = 10×/15 s; Sigma Slam + Spiderman = consumed, 0 auto-click Aura; 38 Burn types owned → 10 rendered; Brian ×3 → 14 coins (19 Kek with SpongeBob first); Gabe ×4 → 40 Kek instantly; El Risitas ×3 → 4,200 EAS; buy pack + save mid-animation → −5 Kek, +1 packsPurchased, 0 cards.

---

## 9. Ranked systems problems

**P0 — broken / unbounded**
1. Burn bar only shows the first 10 owned Burn types; later cards (all Rares) can't be used (game.js:1772). → Sort by rarity desc (or newest) and add paging/scroll, or show all with a smaller fan.
2. Multi-copy 2^N − 1 with uncapped copies; Gabe Use All pays without the minigame; SpongeBob/Gabe button promises 2^N−1 (game.js:2238-2265, 1787). → D1: `n = min(n, BAL.MULTI_COPY_CAP=3)`, consume only n, Gabe plays one bone run and pays `kekReward × n` on a full catch, fix button text per archetype.
3. Overly Attached GF pays 1 Kek per centre click uncapped: 81 skilled / 150 at 10 cps (game.js:1258-1262). → `kekPerHitCap` ≈ 10–18 per use (Rare Kek budget).
4. Expanding Brain uncapped, wall-clock, never reset on unequip (game.js:637-639, 3031). → D2: `G.brainMinutes += dt/60` in `gameLoop` while slotted, cap +30%.
5. PBJ "cards drop 2× as often" is a NOOP (game.js:120). → D3: replace the text with something real.

**P1 — unbalanced / buggy interactions**
6. Click-valued burns pay 1–8% of their EAS budget at every reference state (sim (b)). → Pay click archetypes from `computeBaseEAS × rarityBudget × hitFraction`; settles D6 too.
7. Pack cost curve is linear-uncapped: pack #59 = 3.5 h, median full set ≈ 314 packs ≈ 91 h of clicking (game.js:682-686). → Cap the price at 25–30 Kek and add a "new card" pity; re-anchor the Kek budget to the cap.
8. Rickroll's ×3 leaks into every `computeEAS` payout (COIN_RAIN, TARGET_CHASE, SCREEN_GAG, TIMED_DROP, boss reward) (game.js:1743 and call sites in §6). → Use `computeBaseEAS()` everywhere except the passive tick.
9. `TEMP_APS_MULT` overwrites a stronger running buff (game.js:1909-1910). → `max` on value and timer.
10. `TEMP_CLICK_MULT` multiplies stacks and takes the longest timer: Chipmunk + SWK = 10×/15 s (3.9× the parts) (game.js:1904-1906). → Track buffs separately or take `max` value with its own timer.
11. No cap on the final click multiplier: Gyatt 100 × crit 10 × Arthur 2 × frenzy 10 × echo 2 (game.js:1232, 1250, 1254, 1266, 1387). → Cap the product (excluding frenzy) at `CLICK_MULT_CAP`, route Gyatt through the same path.
12. Sigma Slam consumes AUTO_COLLECT burns that then do nothing (game.js:1820, 2111). → Check before decrementing (refuse activation with a toast), and let Distracted Boyfriend's echo through.
13. Success Kid's `rareBonus` comes out of Uncommon, slowing set completion (game.js:697-698). → Take it from Common: `commonCut = 0.60 − rareBonus`.
14. Field cards (1.67% each) out-pull each Rare (1.08%) (game.js:693). → D4: 5% Field (0.83% each).
15. Duplicate Binder/Field pulls are worthless (336 / 1,000 packs) (game.js:818). → D5 refund C1/U2/R4/F6 (≈ 1 Kek/pack, within budget).
16. Frenzy multiplies passive APS ×10: +160–200 EAS/min at 7 cps, 0 at 6 cps (game.js:1562). → Frenzy on clicks only (or APS ×2).
17. Buying a pack then closing the tab during the animation loses the card (game.js:709-712, 818, 3095). → Add the card to the collection in `buyPack`.
18. TIMED_DROP binders (fixed % of APS) dwarf % binders: Cheezburger +200% APS vs GigaChad +20% (game.js:1618-1634). → R1 retunes `valueEAS` / interval; target ≤ GigaChad per rarity.

**P2 — polish**
19. Ohio Boss boss rate is +40%, text says +50% (game.js:1408-1412). → `bossBias = (mult−1) × 0.2 / 0.8` or fix the text.
20. `KEK_IDLE_TIMEOUT_S` unused; uncollected Kek coins pile up and aren't saved (game.js:2309, 3018-3037). → Auto-collect idle coins after 20 s as the comment says.
21. `spawnKekCoin` silently does nothing (card consumed) when the GLB models aren't loaded (game.js:2312). → Fall back to adding the Kek directly.
22. OAG's off-centre miss strips any other running click buff (game.js:1243). → Divide by the OAG mult only.
23. AYB / David share `body.style.filter` and clear each other early; inline filter hides GigaChad/Sigma class filters while active (game.js:1852-1853, 2204-2213). → Use a dedicated overlay element or CSS classes.
24. Rickroll `fakeCrash`, Nyan `cursorTrail`, Ermahgerd `textTheme` still NOOP (game.js:174, 117, 160). → Implement cosmetically or drop from params.
25. Hoarded temp effects lost on reload; Pepe `moodIndex` not saved (game.js:3018-3037). → Accept, or save timers.
26. RHYTHM pays `budget / maxMult` for zero hits (Shia 60 EAS) (game.js:2771-2773). → Start the scale at 0 hits = 0 or a small pity.

---

## Appendix A — `node tools/card-sim.js` output (seed 12345)

Generated by `node tools/card-sim.js` (seed 12345) from `game.js` — 59 cards (6 Field / 15 Binder / 38 Burn). Assumes 6 clicks/sec, skilled 90% / casual 50% hit rate, empty binder and no Field unless stated.

Source map (current game.js lines mirrored): `getBinderStats`:604, `getFieldMult`:670, `getKekPackCost`:682, `pullCard`:688, `doClick`:1218, `gameLoop`:1550, `computeEAS`:1740, `computeBaseEAS`:1750, `EFFECT_HANDLERS`:1835, `activateBurnMulti`:2238, `spawnBurnTarget`:2676, `spawnRhythmGame`:2764, `spawnKekCoin`:2311, `spawnEvent`:1403, `tickBoss`:2989, `endBossFight`:2951

### (a) Reference states
| State | SAUCE (k/r/s/g/σ) | APS | APC | Global mult | computeEAS | computeBaseEAS | Click Aura/s @6cps | Click share of income |
|---|---|---|---|---|---|---|---|---|
| Early | 10/2/0/0/0 | 40 | 1 | 1.00× | 40 | 40 | 6 | 13% |
| Mid | 40/20/5/2/0 | 740 | 51 | 1.00× | 740 | 740 | 306 | 29% |
| Late | 80/50/20/15/3 | 3,830 | 201 | 2.50× | 9,575 | 9,575 | 3,015 | 24% |

### (b) Burn payouts
EAS-eq = extra Aura ÷ computeEAS() at that state (skilled / casual). Kek shown skilled / casual. "Kek min" = minutes of 6-cps click Kek income (13.8/min). Pack #10 costs 18, pack #30 costs 48. Flags: Aura budget vs Rule 0.5 (OVER = above budget +50%, under = below ⅔ of floor) using the Mid skilled value; **K** = skilled Kek above the proposed per-use budget (Common 5 / Uncommon 9 / Rare 18 Kek). "Budget use" = Mid EAS ÷ top of Aura budget + Kek ÷ Kek budget (Rule 0.8 split; 1.0 = one full budget, 1.5 = +50% downside allowance).

| Card | id | R | Archetype | Early EAS-eq | Mid EAS-eq | Late EAS-eq | Kek | Kek min | % pack #10 / #30 | Budget use | Flags · notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Troll Face | bu_c1 | C | TARGET_CHASE | 41 / 23 | 41 / 23 | 41 / 23 | — | — | — | 0.90 | ok · 1 target(s)/5s, all-or-nothing |
| Is This a Pigeon? | bu_c2 | C | COIN_RAIN | 41 / 23 | 41 / 23 | 41 / 23 | — | — | — | 0.90 | ok · 6 coins × 7.5 |
| Spiderman Pointing | bu_c3 | C | AUTO_COLLECT | 0 | 1 | 1 | — | — | — | 0.02 | under · 10×1.5 click |
| Distracted Boyfriend | bu_c4 | C | AUTO_COLLECT | 1 | 3 | 3 | — | — | — | 0.07 | under · 48 echoed clicks |
| Mocking SpongeBob | bu_c5 | C | KEK_DOUBLE_BUFF | 0 | 0 | 0 | 5.0 | 0.36 | 28% / 10% | 1.00 | under · +5 Kek over next 0.4 min of clicking |
| Bad Luck Brian | bu_c6 | C | KEK_SPAWN | 0 | 0 | 0 | 2.0 | 0.14 | 11% / 4% | 0.40 | under · coins must be clicked |
| Epic Fail Guy | bu_c7 | C | INSTANT_BURST | 30 | 30 | 30 | — | — | — | 0.67 | ok |
| Charlie Bit My Finger | bu_c8 | C | TEMP_APS_MULT | 10 | 10 | 10 | — | — | — | 0.22 | under · also ×mult on computeEAS payouts while active |
| Have You Ever Had A Dream | bu_c9 | C | TEMP_APS_MULT | 10 | 10 | 10 | — | — | — | 0.22 | under · also freezes boss drain |
| Kazoo Kid | bu_c10 | C | COIN_RAIN | 41 / 23 | 41 / 23 | 41 / 23 | — | — | — | 0.90 | ok · 10 coins × 4.5 |
| Star Wars Kid | bu_c11 | C | TEMP_CLICK_MULT | 2 | 6 | 5 | — | — | — | 0.14 | under · 2×15s @6cps |
| Vitas (Chum Drum) | bu_c12 | C | AUTO_COLLECT | 1 | 2 | 2 | — | — | — | 0.05 | under · 12×2.5 click, 12 boss hits |
| Pink Guy Ravioli | bu_c13 | C | COIN_RAIN | 40 / 22 | 40 / 22 | 40 / 22 | — | — | — | 0.90 | ok · 8 coins × 5.6 |
| Dramatic Chipmunk | bu_c14 | C | TEMP_CLICK_MULT | 3 | 8 | 6 | — | — | — | 0.18 | under · 5×5s @6cps |
| Disaster Girl | bu_c15 | C | AUTO_COLLECT | 1 | 2 | 2 | — | — | — | 0.05 | under · 10×3 click |
| David After Dentist | bu_c16 | C | SCREEN_GAG | 55 | 55 | 55 | — | — | — | 1.22 | ok · 6s gag |
| Ermahgerd | bu_c17 | C | INSTANT_BURST | 60 / 42 | 60 / 42 | 60 / 42 | — | — | — | 1.33 | ok · 16 mashes → 60s |
| All Your Base | bu_c18 | C | INSTANT_BURST | 30 | 30 | 30 | — | — | — | 0.67 | ok · raw clicks×APC=12.4 EAS → floor |
| MLG Airhorn | bu_u1 | U | INSTANT_BURST | 120 | 120 | 120 | — | — | — | 0.67 | ok |
| Arthur Fist | bu_u2 | U | INSTANT_BURST | 120 | 120 | 120 | 2.0 | 0.14 | 11% / 4% | 0.89 | ok · +1 doubled click (tiny) |
| Ugandan Knuckles | bu_u3 | U | TARGET_CHASE | 162 / 90 | 162 / 90 | 162 / 90 | — | — | — | 0.90 | ok · 8 target(s)/10s, all-or-nothing |
| Woman Yelling at Cat | bu_u4 | U | RHYTHM | 110 / 70 | 110 / 70 | 110 / 70 | — | — | — | 0.61 | ok · 0 hits still pays 20 EAS |
| Leave Britney Alone | bu_u5 | U | TARGET_CHASE | 162 / 90 | 162 / 90 | 162 / 90 | — | — | — | 0.90 | ok · 1 target(s)/6s, all-or-nothing |
| Surgery on a Grape | bu_u6 | U | PRECISION | 5 / 2 | 14 / 6 | 11 / 5 | — | — | — | 0.08 | under · 54/60 hits |
| Chocolate Rain | bu_u7 | U | COIN_RAIN | 122 / 68 | 122 / 68 | 122 / 68 | 4.5 / 2.5 | 0.33 | 25% / 9% | 1.18 | ok · 15 coins × 9 + 5 Kek coins |
| Zombie Kid Turtle | bu_u8 | U | TARGET_CHASE | 0 | 0 | 0 | 7.2 / 4.0 | 0.52 | 40% / 15% | 0.80 | under · 5 HP, Kek reward |
| Keyboard Cat | bu_u9 | U | RHYTHM | 110 / 70 | 110 / 70 | 110 / 70 | — | — | — | 0.61 | ok · 0 hits still pays 20 EAS |
| Numa Numa Dance | bu_u10 | U | RHYTHM | 110 / 72 | 110 / 72 | 110 / 72 | — | — | — | 0.61 | ok · 0 hits still pays 24 EAS |
| Shooting Stars | bu_u11 | U | COIN_RAIN | 162 / 90 | 162 / 90 | 162 / 90 | — | — | — | 0.90 | ok · 15 coins × 12 |
| Rickroll | bu_u12 | U | TEMP_APS_MULT | 120 | 120 | 120 | — | — | — | 0.67 | ok · also ×mult on computeEAS payouts while active |
| Gabe the Dog | bu_u13 | U | COIN_RAIN | 0 | 0 | 0 | 9.0 / 5.0 | 0.65 | 50% / 19% | 1.00 | under · 10 Kek only if all 25 caught |
| John Cena | bu_r1 | R | PRECISION | 12 / 6 | 33 / 16 | 25 / 12 | — | — | — | 0.04 | under · 81/90 hits |
| Just Do It (Shia) | bu_r2 | R | RHYTHM | 546 / 330 | 546 / 330 | 546 / 330 | — | — | — | 0.61 | ok · 0 hits still pays 60 EAS |
| Leroy Jenkins | bu_r3 | R | TARGET_CHASE | 810 / 450 | 810 / 450 | 810 / 450 | — | — | — | 0.90 | ok · 1 target(s)/3s, all-or-nothing |
| El Risitas | bu_r4 | R | INSTANT_BURST | 600 | 600 | 600 | — | — | — | 0.67 | ok |
| End of Ze World | bu_r5 | R | TARGET_CHASE | 810 / 450 | 810 / 450 | 810 / 450 | 9.0 / 5.0 | 0.65 | 50% / 19% | 1.40 | ok · 25 target(s)/15s, all-or-nothing |
| Overly Attached GF | bu_r6 | R | PRECISION | 10 / 6 | 28 / 16 | 21 / 12 | 81.0 / 45.0 | 5.86 | 450% / 169% | 4.53 | under **K** · 81 center hits |
| Evil Kermit | bu_r7 | R | GAMBLE | 900 | 900 | 900 | — | — | — | 1.00 | ok · EV of 1800 @ p=0.5 |

### (c) Binder: % change when slotted (vs empty binder)
APS = passive Aura/sec, APC = Aura per click, Total = APS + 6 cps clicking. TIMED_DROP counts every drop collected as extra Aura/sec.

| Card | id | R | Archetype | Early APS/APC/Total | Mid APS/APC/Total | Late APS/APC/Total | Notes (Mid) |
|---|---|---|---|---|---|---|---|
| Shrek | bi_c1 | C | GLOBAL_MULT | +5% / +5% / **+5%** | +5% / +5% / **+5%** | +2% / +2% / **+2%** | boss drain ×0.9 |
| Harambe | bi_c2 | C | PASSIVE_APC_PCT | +0% / +50% / **+7%** | +0% / +1% / **+0%** | +0% / +0% / **+0%** | Kek every 22 clicks: 18.1 vs 13.8 Kek/min |
| Stonks | bi_c3 | C | TIMED_DROP | +83% / +0% / **+72%** | +83% / +0% / **+59%** | +83% / +0% / **+63%** | 75 EAS / 90s click ±30% |
| Philosoraptor | bi_c4 | C | TIMED_DROP | +0% / +0% / **+0%** | +0% / +0% / **+0%** | +0% / +0% / **+0%** | 2.0 Kek/min (14% of click Kek) |
| Doge | bi_c5 | C | TIMED_DROP | +50% / +0% / **+43%** | +50% / +0% / **+35%** | +50% / +0% / **+38%** | 30 EAS / 60s auto |
| First World Problems | bi_c6 | C | IDLE_DRIP | +0% / +0% / **+0%** | +0% / +0% / **+0%** | +0% / +0% / **+0%** | +50% APS only after 5s idle (0 while clicking) |
| Grumpy Cat | bi_u1 | U | COST_REDUCTION | +3% / +3% / **+3%** | +3% / +3% / **+3%** | +1% / +1% / **+1%** | −10% SAUCE cost, −2 Kek/pack |
| Success Kid | bi_u2 | U | PACK_LUCK | +10% / +10% / **+10%** | +10% / +10% / **+10%** | +4% / +4% / **+4%** | 30 unique: −5 Kek/pack, +5% rare, +2% field |
| Big Chungus | bi_u3 | U | BIGGER_TARGET | +0% / +5% / **+1%** | +0% / +5% / **+1%** | +0% / +5% / **+1%** | bigger hitbox (Surgery on a Grape) |
| Hide the Pain Harold | bi_u4 | U | EVENT_SOFTENER | +3% / +3% / **+3%** | +3% / +3% / **+3%** | +1% / +1% / **+1%** | boss drain ×0.8 |
| I Can Has Cheezburger | bi_u5 | U | TIMED_DROP | +200% / +0% / **+174%** | +200% / +0% / **+141%** | +200% / +0% / **+152%** | 120 EAS / 60s click (400% with Doge) |
| Expanding Brain | bi_u6 | U | SCALING_OVER_TIME | +0% / +10% / **+1%** | +0% / +40% / **+12%** | +0% / +120% / **+29%** | at 40 min since first slotted; 1 day = +1440% |
| Chuck Norris | bi_r1 | R | CRIT_CHANCE | +0% / +90% / **+12%** | +0% / +90% / **+26%** | +0% / +90% / **+22%** | avg over 10 clicks |
| Pepe (Mood Swing) | bi_r2 | R | MOOD_SWING | +10% / +10% / **+10%** | +10% / +10% / **+10%** | +8% / +8% / **+8%** | avg of 3 modes; per mode total 14.1% / 5.9% / 10.0% |
| GigaChad | bi_r3 | R | PASSIVE_APS_PCT | +20% / +0% / **+17%** | +20% / +0% / **+14%** | +20% / +0% / **+15%** |  |

### (d) Field cards
Field mult is additive with the SAUCE global mult (getFieldMult + allAuraMult), so its relative value shrinks once Sigma Glaze is bought.

| Field | id | mult | Early Δincome | Mid Δincome | Late Δincome | Tradeoff (from params) |
|---|---|---|---|---|---|---|
| Ohio Boss | f1 | 50% | +50% | +50% | +20% | boss chance per event 20%→28% (+40%, text says +50%), +5 Kek per win |
| Sigma Slam | f2 | 80% | +80% | +80% | +32% | disables all AUTO_COLLECT burns and Doge auto-collect (burn is still consumed) |
| Nyan Cat | f3 | 30% | +30% | +30% | +12% | Nyan Cat every 20s worth 3 Kek if clicked = 9.0 Kek/min (65% of click Kek) |
| Moth and Lamp | f4 | 65% | +65% | +65% | +26% | blackout 5s every 30s (14% of the time dark) |
| This is Fine | f5 | 25–65% | +25%→+65% | +25%→+65% | +10%→+26% | ramps 25%→65% over 150s, resets when unequipped |
| Peanut Butter Jelly | f6 | 40% | +40% | +40% | +16% | +1 Kek per spawnKekCoin = +13.8 Kek/min (+100%); also on Brian / Nyan coins; cardDropRate: NOOP (no card drops exist) |

### (e) Pack pulls — Monte Carlo of pullCard()
pullCard() odds read from game.js: Field 10%, then common < 0.6, uncommon < 0.88, rare above.

Pools: Field 6, Common 24, Uncommon 19, Rare 10 (Burn+Binder). Success Kid adds rareBonus 0.05, mythicBonus 0.02.

| Setup | Field | Common | Uncommon | Rare | Unique after 1,000 | Burn dupes (usable) | Binder/Field dupes (useless) |
|---|---|---|---|---|---|---|---|
| No luck | 11.7% | 51.6% | 25.1% | 11.6% | 59 | 605 | 336 |
| Success Kid slotted | 14.1% | 50.1% | 21.4% | 14.4% | 59 | 586 | 355 |

Per-card odds per pack (analytic): Field 1.67% (SK 2.00%) · Common 2.25% (SK 2.20%) · Uncommon 1.33% (SK 1.07%) · Rare 1.08% (SK 1.50%)

Packs to complete all 59 cards (300 trials):

| Setup | Mean packs | p10 | Median | p90 | Kek to buy median (+shop) | Minutes @13.8 Kek/min |
|---|---|---|---|---|---|---|
| No luck | 332 | 223 | 314 | 472 | 75,253 | 5,441 |
| Success Kid slotted (−5 Kek/pack) | 344 | 226 | 325 | 487 | 78,945 | 5,708 |

### Kek Koin economy
Clicks per nugget Kek drop: 26.03 (pity 30, 1% per click), Harambe 19.84.

| Income source @6cps | Kek/min |
|---|---|
| Clicking only | 13.83 |
| + Harambe | 18.15 |
| + PBJ field | 27.66 |
| + Harambe + PBJ | 36.30 |

| Pack # | Cost | Cost w/ Grumpy+SK(max) | Cumulative Kek (+shop) | Minutes (clicks only) | Minutes (Harambe+PBJ) |
|---|---|---|---|---|---|
| 1 | 5 | 1 | 55 | 4.0 | 1.5 |
| 5 | 11 | 4 | 89 | 6.4 | 2.5 |
| 10 | 18 | 11 | 165 | 11.9 | 4.5 |
| 20 | 33 | 26 | 430 | 31.1 | 11.8 |
| 30 | 48 | 41 | 845 | 61.1 | 23.3 |
| 59 | 92 | 85 | 2,897 | 209.5 | 79.8 |
| 100 | 153 | 146 | 7,950 | 574.8 | 219.0 |
| 150 | 228 | 221 | 17,525 | 1,267.2 | 482.8 |
| 200 | 303 | 296 | 30,850 | 2,230.6 | 850.0 |

### (f) Multi-copy "Use All" (activateBurnMulti) N = 2..10
Multiplier in code is 2^N − 1 for KEK_SPAWN and INSTANT_BURST; KEK_DOUBLE_BUFF and Gabe (COIN_RAIN kekReward) are linear and Gabe skips the minigame. "Packs to hold N" = N ÷ per-pack odds of that card (no luck), "Kek" = cumulative pack cost from a fresh save.

| N | 2^N−1 | Mocking SpongeBob (Kek): all vs N singles | Bad Luck Brian (Kek): all vs N singles | Gabe the Dog (Kek): all vs N singles | El Risitas (EAS): all vs N singles | Packs to hold N Mocking SpongeBob (Kek) | Packs to hold N Bad Luck Brian (Kek) | Packs to hold N Gabe the Dog (Kek) | Packs to hold N El Risitas (Kek) |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 10 vs 10 | 6 vs 4 | 20 vs 18 | 1,800 vs 1,200 | 89 (6.3k) | 89 (6.3k) | 151 (17.7k) | 186 (26.7k) |
| 3 | 7 | 15 vs 15 | 14 vs 6 | 30 vs 27 | 4,200 vs 1,800 | 134 (14.0k) | 134 (14.0k) | 227 (39.6k) | 278 (59.1k) |
| 4 | 15 | 20 vs 20 | 30 vs 8 | 40 vs 36 | 9,000 vs 2,400 | 178 (24.5k) | 178 (24.5k) | 302 (69.6k) | 371 (104.7k) |
| 5 | 31 | 25 vs 25 | 62 vs 10 | 50 vs 45 | 18,600 vs 3,000 | 223 (38.2k) | 223 (38.2k) | 377 (108.1k) | 463 (162.6k) |
| 6 | 63 | 30 vs 30 | 126 vs 12 | 60 vs 54 | 37,800 vs 3,600 | 267 (54.5k) | 267 (54.5k) | 453 (155.7k) | 556 (234.1k) |
| 7 | 127 | 35 vs 35 | 254 vs 14 | 70 vs 63 | 76,200 vs 4,200 | 312 (74.3k) | 312 (74.3k) | 528 (211.2k) | 649 (318.5k) |
| 8 | 255 | 40 vs 40 | 510 vs 16 | 80 vs 72 | 153,000 vs 4,800 | 356 (96.5k) | 356 (96.5k) | 604 (276.0k) | 741 (414.8k) |
| 9 | 511 | 45 vs 45 | 1,022 vs 18 | 90 vs 81 | 306,600 vs 5,400 | 400 (121.6k) | 400 (121.6k) | 679 (348.5k) | 834 (525.0k) |
| 10 | 1023 | 50 vs 50 | 2,046 vs 20 | 100 vs 90 | 613,800 vs 6,000 | 445 (150.3k) | 445 (150.3k) | 754 (429.4k) | 926 (646.8k) |

El Risitas at Mid (computeBaseEAS 740): N=3 → 3,108,000 Aura; N=10 → 454,212,000 Aura.

### (g) Systems: frenzy, events, boss
| State | Frenzy extra (EAS) @7cps | of which APS ×10 | of which clicks ×10 | Per minute if sustained (10s on / 30s cd) | Level 67 Gyatt (100× clicks 15s) EAS-eq | Boss win reward | Break-even bank (win @6cps) |
|---|---|---|---|---|---|---|---|
| Early | 106 | 90 | 16 | 159 | 223 | 300 EAS | 4,500 EAS (75 min of income) |
| Mid | 133 | 90 | 43 | 200 | 614 | 300 EAS | 4,500 EAS (75 min of income) |
| Late | 123 | 90 | 33 | 185 | 468 | 300 EAS | 4,500 EAS (75 min of income) |

Events every 90–180s (mean 135s): boss 20% (one per 11.3 min), Ohio 28% (one per 8.0 min → 0.62 Kek/min if every boss is won), Gyatt 20%, Fanum Tax 60% (−10% bank if not clicked within 3s). Boss: 2%/s drain, cap 20%, AFK auto-resolve after 5s (= 10% lost), win needs 20 clicks in 8s.

