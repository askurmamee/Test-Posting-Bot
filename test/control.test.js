const test = require("node:test");
const assert = require("node:assert/strict");

const { formatCommandOutput } = require("../src/control");

test("formatCommandOutput returns combined output", () => {
  assert.equal(formatCommandOutput("done", "warning"), "done\nwarning");
});

test("formatCommandOutput returns fallback text when empty", () => {
  assert.equal(formatCommandOutput("", ""), "No output.");
});

test("formatCommandOutput truncates long output", () => {
  const longOutput = "x".repeat(1600);
  const result = formatCommandOutput(longOutput, "");

  assert.equal(result.length, 1500);
  assert.equal(result.endsWith("..."), true);
});
