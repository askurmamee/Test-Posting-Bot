const fs = require("node:fs");
const path = require("node:path");

const configuredDataDir = process.env.CHANNEL_STORE_DIR?.trim();
const dataDir = configuredDataDir
  ? path.resolve(process.cwd(), configuredDataDir)
  : path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "channels.json");

function createDefaultStore() {
  return { guilds: {} };
}

function normalizeStore(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultStore();
  }

  if (!value.guilds || typeof value.guilds !== "object" || Array.isArray(value.guilds)) {
    return createDefaultStore();
  }

  return { guilds: value.guilds };
}

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(createDefaultStore(), null, 2));
  }
}

function readStore() {
  ensureStore();

  const raw = fs.readFileSync(storePath, "utf8");

  try {
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    console.error("Store file is invalid JSON, resetting to defaults.", error.message);
    const fallback = createDefaultStore();
    writeStore(fallback);
    return fallback;
  }
}

function writeStore(data) {
  ensureStore();
  const tempPath = `${storePath}.tmp`;
  const normalized = normalizeStore(data);
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2));
  fs.renameSync(tempPath, storePath);
}

function getGuildConfig(guildId) {
  const store = readStore();
  const guildConfig = store.guilds[guildId];

  if (!guildConfig) {
    return {
      channels: {},
      codeRecordsChannelId: null,
      referralRecordsChannelId: null,
    };
  }

  return {
    channels: guildConfig.channels ?? {},
    codeRecordsChannelId: guildConfig.codeRecordsChannelId ?? guildConfig.recordsChannelId ?? null,
    referralRecordsChannelId: guildConfig.referralRecordsChannelId ?? null,
  };
}

function upsertChannel(guildId, channelId, type) {
  const store = readStore();
  store.guilds[guildId] ??= {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
  };
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

function setRecordsChannel(guildId, recordType, channelId) {
  const store = readStore();
  store.guilds[guildId] ??= {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
  };
  store.guilds[guildId][`${recordType}RecordsChannelId`] = channelId;
  writeStore(store);
}

function clearRecordsChannel(guildId, recordType) {
  const store = readStore();
  const guildConfig = store.guilds[guildId];
  const propertyName = `${recordType}RecordsChannelId`;

  if (!guildConfig?.[propertyName]) {
    return false;
  }

  guildConfig[propertyName] = null;
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
