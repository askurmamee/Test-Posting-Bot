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
  });

  fs.writeFileSync(storePath, "[]");
  assert.deepEqual(getGuildConfig("guild-2"), {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
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
  });
});
