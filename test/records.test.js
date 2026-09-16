const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRecordMessage,
  buildRecordsChannelCreateOptions,
  getRecordsChannelName,
  truncateForDiscord,
} = require("../src/records");

test("truncateForDiscord leaves short content alone and truncates long content safely", () => {
  assert.equal(truncateForDiscord("hello", 10), "hello");
  assert.equal(truncateForDiscord("x".repeat(20), 10), "xxxxxxx...");
});

test("buildRecordMessage formats code submissions as embeds", () => {
  const payload = buildRecordMessage(
    "code",
    { code: "LUCKY2026", link: "https://example.com/code", name: "Lucky Land" },
    "<@123>",
    new Date("2026-09-16T10:00:00.000Z"),
  );
  const embed = payload.embeds[0].toJSON();

  assert.equal(embed.title, "Code Record");
  assert.equal(embed.fields[0].name, "Place");
  assert.equal(embed.fields[1].value, "`LUCKY2026`");
  assert.equal(embed.fields[2].name, "Link");
  assert.equal(embed.fields[3].name, "Shared by");
  assert.equal(embed.timestamp, "2026-09-16T10:00:00.000Z");
});

test("buildRecordMessage formats referral submissions cleanly and truncates long links", () => {
  const longUrl = `https://example.com/${"ref".repeat(400)}`;
  const payload = buildRecordMessage(
    "referral",
    { description: "Signup bonus", link: longUrl, name: "Lucky Land" },
    "<@123>",
  );
  const embed = payload.embeds[0].toJSON();
  const linkField = embed.fields.find((field) => field.name === "Referral Link");
  const aboutField = embed.fields.find((field) => field.name === "About");

  assert.equal(embed.title, "Referral Record");
  assert.ok(linkField.value.length <= 1024);
  assert.equal(aboutField.value, "Signup bonus");
});

test("records channel helpers use stable names and bot-only create permissions", () => {
  const options = buildRecordsChannelCreateOptions(
    { roles: { everyone: { id: "everyone" } } },
    "bot-user",
    "referral",
  );

  assert.equal(getRecordsChannelName("code"), "code-records");
  assert.equal(getRecordsChannelName("referral"), "referral-records");
  assert.equal(options.name, "referral-records");
  assert.deepEqual(options.permissionOverwrites[0].deny.length > 0, true);
  assert.equal(options.permissionOverwrites[1].id, "bot-user");
});
