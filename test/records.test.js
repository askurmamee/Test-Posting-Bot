const test = require("node:test");
const assert = require("node:assert/strict");
const { ChannelType } = require("discord.js");

const {
  buildRecordMessage,
  buildRecordsChannelCreateOptions,
  ensureGuildRecordsChannel,
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
  assert.equal(linkField.value.startsWith("[Open referral link]("), true);
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

test("ensureGuildRecordsChannel reuses an existing named channel when config is unset", async () => {
  const namedChannel = { id: "ref-1", name: "referral-records", type: ChannelType.GuildText };
  const boundIds = [];
  const guild = {
    channels: {
      cache: new Map(),
      create: async () => {
        throw new Error("should not create a new channel");
      },
      fetch: async (channelId) => {
        if (channelId) {
          return null;
        }

        return {
          find: (predicate) => (predicate(namedChannel) ? namedChannel : null),
        };
      },
    },
    roles: { everyone: { id: "everyone" } },
  };

  const channel = await ensureGuildRecordsChannel(guild, "referral", {
    botUserId: "bot-user",
    configuredChannelId: null,
    setConfiguredChannelId: (channelId) => boundIds.push(channelId),
  });

  assert.equal(channel, namedChannel);
  assert.deepEqual(boundIds, ["ref-1"]);
});

test("ensureGuildRecordsChannel creates and binds a missing configured channel", async () => {
  const createdChannel = { id: "code-2", name: "code-records", type: ChannelType.GuildText };
  const boundIds = [];
  const guild = {
    channels: {
      cache: new Map(),
      create: async (options) => {
        assert.equal(options.name, "code-records");
        return createdChannel;
      },
      fetch: async (channelId) => {
        if (channelId) {
          return null;
        }

        return {
          find: () => null,
        };
      },
    },
    roles: { everyone: { id: "everyone" } },
  };

  const channel = await ensureGuildRecordsChannel(guild, "code", {
    botUserId: "bot-user",
    configuredChannelId: "missing-id",
    reason: "test",
    setConfiguredChannelId: (channelId) => boundIds.push(channelId),
  });

  assert.equal(channel, createdChannel);
  assert.deepEqual(boundIds, ["code-2"]);
});

test("ensureGuildRecordsChannel rejects configured non-text channels", async () => {
  const guild = {
    channels: {
      cache: new Map([
        ["voice-1", { id: "voice-1", type: ChannelType.GuildVoice }],
      ]),
      create: async () => {
        throw new Error("should not create a new channel");
      },
      fetch: async () => null,
    },
    roles: { everyone: { id: "everyone" } },
  };

  await assert.rejects(
    ensureGuildRecordsChannel(guild, "code", {
      botUserId: "bot-user",
      configuredChannelId: "voice-1",
      setConfiguredChannelId: () => {
        throw new Error("should not rebind");
      },
    }),
    /Configured records channels must remain standard text channels/,
  );
});
