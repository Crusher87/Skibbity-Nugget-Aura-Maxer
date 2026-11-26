#!/usr/bin/env node
// ============================================================
// tools/gen-cards-csv.js — regenerate cards.csv from game.js (Node, no deps)
//
//   node tools/gen-cards-csv.js
//
// Header: Name,Category,Rarity,How It Works. The SAUCE "Upgrade" rows are kept
// verbatim from the existing cards.csv (their wording is friendlier than
// UPGRADES.desc); then one row per CARD_LIBRARY entry in library order:
// `${emoji} ${name}`, type, Title-Case rarity, CSV-quoted desc.
// Exits non-zero if the data row count is not 64 (5 upgrades + 59 cards).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLiterals } = require('./lib/extract');

const ROOT = path.resolve(__dirname, '..');
const CSV = path.join(ROOT, 'cards.csv');
const HEADER = 'Name,Category,Rarity,How It Works';
const EXPECTED_ROWS = 64;

const { CARD_LIBRARY } = loadLiterals(fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8'), ['CARD_LIBRARY']);

// Split CSV text into records (quoted fields may hold commas, quotes or newlines).
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const quote = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const plain = (s) => /[",\n]/.test(s) ? quote(s) : String(s);
const titleCase = (r) => r.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('-');

// Upgrade rows: copied verbatim (as raw lines) from the current file.
const oldText = fs.existsSync(CSV) ? fs.readFileSync(CSV, 'utf8') : '';
const upgradeRows = parseCsv(oldText).slice(1).filter(r => r[1] === 'Upgrade')
  .map(r => [plain(r[0]), r[1], r[2], quote(r[3])].join(','));

const cardRows = CARD_LIBRARY.map(c => [plain(`${c.emoji} ${c.name}`), c.type, titleCase(c.rarity), quote(c.desc)].join(','));
const rows = [...upgradeRows, ...cardRows];
fs.writeFileSync(CSV, [HEADER, ...rows].join('\n') + '\n');
console.log(`cards.csv: ${upgradeRows.length} upgrade rows + ${cardRows.length} cards = ${rows.length} rows`);
if (rows.length !== EXPECTED_ROWS) {
  console.error(`Expected ${EXPECTED_ROWS} rows, got ${rows.length}`);
  process.exit(1);
}
