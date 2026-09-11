const fs = require("node:fs");
const path = require("node:path");

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "channels.json");

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({ guilds: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();

  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function getGuildConfig(guildId) {
  const store = readStore();
  return store.guilds[guildId] ?? { channels: {}, recordsChannelId: null };
}

function upsertChannel(guildId, channelId, type) {
  const store = readStore();
  store.guilds[guildId] ??= { channels: {}, recordsChannelId: null };
  store.guilds[guildId].channels[channelId] = { type };
  writeStore(store);
}

function removeChannel(guildId, channelId) {
  const store = readStore();
  const guildConfig = store.guilds[guildId];

  if (!guildConfig?.channels?.[channelId]) {
    return false;
  }

  delete guildConfig.channels[channelId];
  writeStore(store);
  return true;
}

function setRecordsChannel(guildId, channelId) {
  const store = readStore();
  store.guilds[guildId] ??= { channels: {}, recordsChannelId: null };
  store.guilds[guildId].recordsChannelId = channelId;
  writeStore(store);
}

function clearRecordsChannel(guildId) {
  const store = readStore();
  const guildConfig = store.guilds[guildId];

  if (!guildConfig?.recordsChannelId) {
    return false;
  }

  guildConfig.recordsChannelId = null;
  writeStore(store);
  return true;
}

module.exports = {
  clearRecordsChannel,
  getGuildConfig,
  removeChannel,
  setRecordsChannel,
  upsertChannel,
};
