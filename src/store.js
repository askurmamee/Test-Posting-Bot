const fs = require("node:fs");
const path = require("node:path");

const configuredDataDir = process.env.CHANNEL_STORE_DIR?.trim();
const dataDir = configuredDataDir
  ? path.resolve(process.cwd(), configuredDataDir)
  : path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "channels.json");
const validRecordTypes = new Set(["code", "referral"]);
const hasOwn = Object.prototype.hasOwnProperty;

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
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
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
      customCommands: {},
    };
  }

  return {
    channels: guildConfig.channels ?? {},
    codeRecordsChannelId: guildConfig.codeRecordsChannelId ?? guildConfig.recordsChannelId ?? null,
    referralRecordsChannelId: guildConfig.referralRecordsChannelId ?? null,
    customCommands:
      guildConfig.customCommands && typeof guildConfig.customCommands === "object"
        ? guildConfig.customCommands
        : {},
  };
}

function upsertChannel(guildId, channelId, type) {
  const store = readStore();
  store.guilds[guildId] ??= {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
    customCommands: {},
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
  if (!validRecordTypes.has(recordType)) {
    return false;
  }

  const store = readStore();
  store.guilds[guildId] ??= {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
    customCommands: {},
  };
  store.guilds[guildId][`${recordType}RecordsChannelId`] = channelId;
  writeStore(store);
  return true;
}

function clearRecordsChannel(guildId, recordType) {
  if (!validRecordTypes.has(recordType)) {
    return false;
  }

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

function addCustomCommand(guildId, name, description, response) {
  const store = readStore();
  store.guilds[guildId] ??= {
    channels: {},
    codeRecordsChannelId: null,
    referralRecordsChannelId: null,
    customCommands: {},
  };
  store.guilds[guildId].customCommands ??= {};

  if (hasOwn.call(store.guilds[guildId].customCommands, name)) {
    return false;
  }

  store.guilds[guildId].customCommands[name] = {
    description,
    response,
  };
  writeStore(store);
  return true;
}

function editCustomCommand(guildId, name, updates) {
  const store = readStore();
  const customCommands = store.guilds[guildId]?.customCommands;
  const command = hasOwn.call(customCommands ?? {}, name)
    ? customCommands[name]
    : null;

  if (!command) {
    return false;
  }

  const nextDescription = updates.description ?? command.description;
  const nextResponse = updates.response ?? command.response;
  store.guilds[guildId].customCommands[name] = {
    description: nextDescription,
    response: nextResponse,
  };
  writeStore(store);
  return true;
}

function removeCustomCommand(guildId, name) {
  const store = readStore();

  if (!hasOwn.call(store.guilds[guildId]?.customCommands ?? {}, name)) {
    return false;
  }

  delete store.guilds[guildId].customCommands[name];
  writeStore(store);
  return true;
}

function listCustomCommands(guildId) {
  return getGuildConfig(guildId).customCommands;
}

function getCustomCommand(guildId, name) {
  const customCommands = getGuildConfig(guildId).customCommands;
  return hasOwn.call(customCommands, name) ? customCommands[name] : null;
}

module.exports = {
  addCustomCommand,
  clearRecordsChannel,
  editCustomCommand,
  getCustomCommand,
  getGuildConfig,
  listCustomCommands,
  removeChannel,
  removeCustomCommand,
  setRecordsChannel,
  upsertChannel,
};
