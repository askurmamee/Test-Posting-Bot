const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

const MAX_EMBED_FIELD_VALUE_LENGTH = 1024;

function truncateForDiscord(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  if (maxLength <= 3) {
    return trimmed.slice(0, maxLength);
  }

  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function getRecordsChannelName(kind) {
  return kind === "code" ? "code-records" : "referral-records";
}

function buildRecordsChannelCreateOptions(guild, botUserId, kind) {
  return {
    name: getRecordsChannelName(kind),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.UseApplicationCommands,
        ],
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        id: botUserId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.UseApplicationCommands,
        ],
      },
    ],
  };
}

function formatLinkFieldValue(url, label) {
  const wrapperLength = label.length + 5;
  const maxUrlLength = MAX_EMBED_FIELD_VALUE_LENGTH - wrapperLength;
  const truncatedUrl = truncateForDiscord(url, maxUrlLength);

  return `[${label}](${truncatedUrl})`;
}

function buildRecordMessage(kind, submission, userMention, submittedAt = new Date()) {
  const fields = [
    {
      name: "Place",
      value: truncateForDiscord(submission.name, MAX_EMBED_FIELD_VALUE_LENGTH),
    },
    kind === "code"
      ? {
          name: "Code",
          value: `\`${truncateForDiscord(submission.code, MAX_EMBED_FIELD_VALUE_LENGTH - 2)}\``,
        }
      : {
          name: "Referral Link",
          value: formatLinkFieldValue(submission.link, "Open referral link"),
        },
  ];

  if (kind === "code" && submission.link) {
    fields.push({
      name: "Link",
      value: formatLinkFieldValue(submission.link, "Open link"),
    });
  }

  if (kind === "referral" && submission.description) {
    fields.push({
      name: "About",
      value: truncateForDiscord(submission.description, MAX_EMBED_FIELD_VALUE_LENGTH),
    });
  }

  fields.push({
    name: "Shared by",
    value: truncateForDiscord(userMention, MAX_EMBED_FIELD_VALUE_LENGTH),
  });

  const embed = new EmbedBuilder()
    .setColor(kind === "code" ? 0x57f287 : 0x5865f2)
    .setTitle(kind === "code" ? "Code Record" : "Referral Record")
    .setTimestamp(submittedAt)
    .addFields(fields);

  return { embeds: [embed] };
}

function isGuildTextChannel(channel) {
  return channel?.type === ChannelType.GuildText;
}

async function fetchGuildChannel(guild, channelId) {
  if (!channelId) {
    return null;
  }

  const cachedChannel = guild.channels.cache.get(channelId);

  if (cachedChannel) {
    return cachedChannel;
  }

  return guild.channels.fetch(channelId).catch(() => null);
}

async function findGuildTextChannelByName(guild, name) {
  const channels = await guild.channels.fetch().catch(() => null);

  return channels?.find((channel) => isGuildTextChannel(channel) && channel.name === name) ?? null;
}

async function ensureGuildRecordsChannel(guild, kind, options = {}) {
  const {
    allowCreate = true,
    botUserId,
    configuredChannelId,
    reason,
    selectedChannel,
    setConfiguredChannelId,
  } = options;

  if (selectedChannel) {
    if (!isGuildTextChannel(selectedChannel)) {
      throw new Error("Records channels must be standard text channels.");
    }

    setConfiguredChannelId?.(selectedChannel.id);
    return selectedChannel;
  }

  const configuredChannel = await fetchGuildChannel(guild, configuredChannelId);

  if (configuredChannel) {
    if (!isGuildTextChannel(configuredChannel)) {
      throw new Error("Configured records channels must remain standard text channels.");
    }

    return configuredChannel;
  }

  const existingNamedChannel = await findGuildTextChannelByName(guild, getRecordsChannelName(kind));

  if (existingNamedChannel) {
    setConfiguredChannelId?.(existingNamedChannel.id);
    return existingNamedChannel;
  }

  if (!allowCreate) {
    return null;
  }

  const targetChannel = await guild.channels.create({
    ...buildRecordsChannelCreateOptions(guild, botUserId, kind),
    reason: reason ?? `Auto-created ${kind} records channel`,
  });

  setConfiguredChannelId?.(targetChannel.id);
  return targetChannel;
}

module.exports = {
  buildRecordMessage,
  buildRecordsChannelCreateOptions,
  ensureGuildRecordsChannel,
  getRecordsChannelName,
  truncateForDiscord,
};
