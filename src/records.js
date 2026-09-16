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
  const trimmedUrl = truncateForDiscord(url, 2000);
  const markdownLink = `[${label}](${trimmedUrl})`;

  if (markdownLink.length <= MAX_EMBED_FIELD_VALUE_LENGTH) {
    return markdownLink;
  }

  return truncateForDiscord(trimmedUrl, MAX_EMBED_FIELD_VALUE_LENGTH);
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

module.exports = {
  buildRecordMessage,
  buildRecordsChannelCreateOptions,
  getRecordsChannelName,
  truncateForDiscord,
};
