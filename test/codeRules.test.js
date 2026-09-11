const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getChannelLabel,
  isValidCode,
  isValidDescription,
  isValidName,
  isValidUrl,
  normalizeChannelType,
  parseCodeSubmission,
  parseReferralSubmission,
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

test("name and description validators enforce limits", () => {
  assert.equal(isValidName("Chumba Casino"), true);
  assert.equal(isValidName(""), false);
  assert.equal(isValidDescription("Daily free coins"), true);
  assert.equal(isValidDescription(""), false);
});

test("parseCodeSubmission parses the bot code format with optional link", () => {
  assert.deepEqual(
    parseCodeSubmission("Lucky Land | LUCKY2026 | https://example.com/deal"),
    {
      code: "LUCKY2026",
      link: "https://example.com/deal",
      name: "Lucky Land",
    },
  );

  assert.deepEqual(parseCodeSubmission("Lucky Land | LUCKY2026"), {
    code: "LUCKY2026",
    link: null,
    name: "Lucky Land",
  });
});

test("parseCodeSubmission rejects invalid submissions", () => {
  assert.equal(parseCodeSubmission("Lucky Land | https://example.com"), null);
  assert.equal(parseCodeSubmission("Lucky Land | BAD CODE | https://example.com"), null);
});

test("parseReferralSubmission parses the referral format", () => {
  assert.deepEqual(
    parseReferralSubmission("Lucky Land | https://example.com/deal | Signup bonus"),
    {
      description: "Signup bonus",
      link: "https://example.com/deal",
      name: "Lucky Land",
    },
  );
});

test("parseReferralSubmission rejects invalid data", () => {
  assert.equal(parseReferralSubmission("Lucky Land | bad-link"), null);
  assert.equal(parseReferralSubmission(" | https://example.com"), null);
});
