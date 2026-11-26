// tools/lib/extract.js — pull a `const NAME = {…}` / `[…]` literal out of game.js source text.
// Shared by tools/card-sim.js and tools/gen-cards-csv.js. No DOM code is ever run:
// only the literal's text is returned (callers evaluate it in a vm sandbox).
'use strict';
const vm = require('vm');

// Bracket matcher that skips over string literals and comments.
function extractLiteral(src, name) {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*`).exec(src);
  if (!m) throw new Error(`Could not find "const ${name} =" in game.js`);
  let i = m.index + m[0].length;
  const open = src[i], close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) throw new Error(`${name} is not an object/array literal`);
  let depth = 0, start = i;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`Unbalanced literal for ${name}`);
}

// Evaluate the named literals in one sandbox: { BAL, UPGRADES, CARD_LIBRARY, … }.
function loadLiterals(src, names) {
  const sandbox = {};
  vm.createContext(sandbox);
  const out = {};
  for (const n of names) out[n] = vm.runInContext('(' + extractLiteral(src, n) + ')', sandbox);
  return out;
}

module.exports = { extractLiteral, loadLiterals };
