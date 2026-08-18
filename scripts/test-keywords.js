// One runnable check for the keyword logic. Run: node scripts/test-keywords.js
const assert = require("assert");
const { verdict, normalizeName } = require("../keywords.js");

const cases = [
  ["a great role at a great company", "NO_SIGNAL"],
  ["we offer visa sponsorship for the right candidate", "SPONSORED"],
  ["sponsorship is available for this role", "SPONSORED"],
  ["we cannot sponsor this role", "NOT_SPONSORED"],
  ["we do not offer sponsorship at this time", "NOT_SPONSORED"],
  ["must have the right to work in the UK", "NOT_SPONSORED"],
  ["unable to provide visa sponsorship", "NOT_SPONSORED"],
  ["we cannot provide sponsorship for this role", "NOT_SPONSORED"],
  ["we are not able to offer sponsorship", "NOT_SPONSORED"],
];

for (const [text, want] of cases) {
  assert.strictEqual(verdict(text), want, text);
}
assert.strictEqual(normalizeName("Acme  Corp, Ltd."), "acme corp ltd");
assert.strictEqual(normalizeName("  BARCLAYS BANK UK PLC "), "barclays bank uk plc");
console.log(`ok — ${cases.length} verdict cases + normalization`);
