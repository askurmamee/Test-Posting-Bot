const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getChannelLabel,
  isValidCode,
  isValidUrl,
  normalizeChannelType,
  parseSubmissionParts,
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

test("isValidUrl only accepts http and https urls", () => {
  assert.equal(isValidUrl("https://example.com/freebie"), true);
  assert.equal(isValidUrl("http://example.com/freebie"), true);
  assert.equal(isValidUrl("ftp://example.com"), false);
});

test("parseSubmissionParts parses the bot submission format", () => {
  assert.deepEqual(
    parseSubmissionParts(
      "Lucky Land | LUCKY2026 | https://example.com/deal | Daily free coins",
    ),
    {
      code: "LUCKY2026",
      description: "Daily free coins",
      link: "https://example.com/deal",
      name: "Lucky Land",
    },
  );
});

test("parseSubmissionParts rejects invalid submissions", () => {
  assert.equal(parseSubmissionParts("Lucky Land | https://example.com | bad"), null);
  assert.equal(parseSubmissionParts("Lucky Land | BAD CODE | https://example.com | deal"), null);
});
