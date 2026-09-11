const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getChannelLabel,
  isValidCode,
  normalizeChannelType,
} = require("../src/codeRules");

test("normalizeChannelType accepts aliases", () => {
  assert.equal(normalizeChannelType("casino"), "casino");
  assert.equal(normalizeChannelType("sweepstakes-casino"), "casino");
  assert.equal(normalizeChannelType("free-sc"), "freesc");
  assert.equal(normalizeChannelType("FREE"), "freesc");
  assert.equal(normalizeChannelType("other"), null);
});

test("isValidCode allows a single token code", () => {
  assert.equal(isValidCode("ABC123"), true);
  assert.equal(isValidCode("free-sc_2026"), true);
});

test("isValidCode rejects chatter", () => {
  assert.equal(isValidCode("here is a code"), false);
  assert.equal(isValidCode("ab"), false);
  assert.equal(isValidCode("code!"), false);
});

test("getChannelLabel returns user-friendly names", () => {
  assert.equal(getChannelLabel("casino"), "Sweepstakes Casino");
  assert.equal(getChannelLabel("freesc"), "Free SC");
});
