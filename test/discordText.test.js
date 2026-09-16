const test = require("node:test");
const assert = require("node:assert/strict");

const { splitLinesIntoMessages } = require("../src/discordText");

test("splitLinesIntoMessages keeps short lines in one message", () => {
  assert.deepEqual(
    splitLinesIntoMessages(["one", "two", "three"], 20),
    ["one\ntwo\nthree"],
  );
});

test("splitLinesIntoMessages paginates when max length is exceeded", () => {
  assert.deepEqual(
    splitLinesIntoMessages(["a".repeat(10), "b".repeat(10), "c".repeat(10)], 21),
    ["aaaaaaaaaa\nbbbbbbbbbb", "cccccccccc"],
  );
});

test("splitLinesIntoMessages splits oversized single lines", () => {
  assert.deepEqual(
    splitLinesIntoMessages(["x".repeat(25)], 10),
    ["xxxxxxxxxx", "xxxxxxxxxx", "xxxxx"],
  );
});
