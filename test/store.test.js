const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const originalStoreDir = process.env.CHANNEL_STORE_DIR;

function loadStoreModule(storeDir) {
  process.env.CHANNEL_STORE_DIR = storeDir;
  const modulePath = require.resolve("../src/store");
  delete require.cache[modulePath];
  return require("../src/store");
}

test.afterEach(() => {
  if (originalStoreDir === undefined) {
    delete process.env.CHANNEL_STORE_DIR;
  } else {
    process.env.CHANNEL_STORE_DIR = originalStoreDir;
  }
});

test("store recovers from invalid json without throwing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "posting-bot-store-"));
  const storePath = path.join(tempDir, "channels.json");
  fs.writeFileSync(storePath, "{");

  const { getGuildConfig } = loadStoreModule(tempDir);

  assert.deepEqual(getGuildConfig("guild-1"), {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
    customCommands: {},
  });

  const repairedStore = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(repairedStore, { guilds: {} });
});

test("store normalizes malformed but parseable content", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "posting-bot-store-"));
  const storePath = path.join(tempDir, "channels.json");
  fs.writeFileSync(storePath, "{}");

  const { getGuildConfig } = loadStoreModule(tempDir);

  assert.deepEqual(getGuildConfig("guild-1"), {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
    customCommands: {},
  });

  fs.writeFileSync(storePath, "[]");
  assert.deepEqual(getGuildConfig("guild-2"), {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
    customCommands: {},
  });
});

test("store writes and reads guild channel configuration", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "posting-bot-store-"));
  const { getGuildConfig, setRecordsChannel, upsertChannel } = loadStoreModule(tempDir);

  upsertChannel("guild-1", "channel-1", "code");
  setRecordsChannel("guild-1", "code", "records-1");

  assert.deepEqual(getGuildConfig("guild-1"), {
    channels: {
      "channel-1": { type: "code" },
    },
    codeRecordsChannelId: "records-1",
    referralRecordsChannelId: null,
    customCommands: {},
  });
});

test("store supports add, edit, list and remove custom commands", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "posting-bot-store-"));
  const {
    addCustomCommand,
    editCustomCommand,
    getCustomCommand,
    listCustomCommands,
    removeCustomCommand,
  } = loadStoreModule(tempDir);

  assert.equal(
    addCustomCommand("guild-1", "hello", "Say hello", "Hello world"),
    true,
  );
  assert.equal(
    addCustomCommand("guild-1", "hello", "Say hello", "Duplicate"),
    false,
  );

  assert.deepEqual(getCustomCommand("guild-1", "hello"), {
    description: "Say hello",
    response: "Hello world",
  });
  assert.deepEqual(listCustomCommands("guild-1"), {
    hello: {
      description: "Say hello",
      response: "Hello world",
    },
  });

  assert.equal(
    editCustomCommand("guild-1", "hello", { response: "Updated response" }),
    true,
  );
  assert.deepEqual(getCustomCommand("guild-1", "hello"), {
    description: "Say hello",
    response: "Updated response",
  });

  assert.equal(editCustomCommand("guild-1", "missing", { response: "x" }), false);
  assert.equal(removeCustomCommand("guild-1", "hello"), true);
  assert.equal(removeCustomCommand("guild-1", "hello"), false);
  assert.equal(getCustomCommand("guild-1", "hello"), null);
});

test("custom command lookups ignore inherited Object prototype properties", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "posting-bot-store-"));
  const {
    addCustomCommand,
    editCustomCommand,
    getCustomCommand,
    removeCustomCommand,
  } = loadStoreModule(tempDir);

  assert.equal(getCustomCommand("guild-1", "constructor"), null);
  assert.equal(editCustomCommand("guild-1", "toString", { response: "x" }), false);
  assert.equal(removeCustomCommand("guild-1", "hasOwnProperty"), false);
  assert.equal(addCustomCommand("guild-1", "constructor", "ctor", "ok"), true);
  assert.deepEqual(getCustomCommand("guild-1", "constructor"), {
    description: "ctor",
    response: "ok",
  });
});

test("legacy guild config without customCommands is normalized", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "posting-bot-store-"));
  const storePath = path.join(tempDir, "channels.json");
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      guilds: {
        "guild-1": {
          channels: { "channel-1": { type: "code" } },
          codeRecordsChannelId: "records-1",
          referralRecordsChannelId: null,
        },
      },
    }),
  );

  const {
    addCustomCommand,
    getGuildConfig,
    listCustomCommands,
  } = loadStoreModule(tempDir);

  assert.deepEqual(getGuildConfig("guild-1"), {
    channels: {
      "channel-1": { type: "code" },
    },
    codeRecordsChannelId: "records-1",
    referralRecordsChannelId: null,
    customCommands: {},
  });
  assert.deepEqual(listCustomCommands("guild-1"), {});
  assert.equal(addCustomCommand("guild-1", "hello", "Say hello", "Hello"), true);
  assert.deepEqual(listCustomCommands("guild-1"), {
    hello: {
      description: "Say hello",
      response: "Hello",
    },
  });
});
