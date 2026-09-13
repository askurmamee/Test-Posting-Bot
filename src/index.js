require("dotenv").config();

const {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require("discord.js");

const {
  isValidCode,
  parseCodeSubmission,
  parseReferralSubmission,
} = require("./codeRules");
const {
  clearRecordsChannel,
  getGuildConfig,
  removeChannel,
  setRecordsChannel,
  upsertChannel,
} = require("./store");
const { formatCommandOutput, runUpdateCommand } = require("./control");

const token = process.env.DISCORD_TOKEN;
const prefix = process.env.BOT_PREFIX?.trim() || "!";
const adminRoleIds = new Set(
  (process.env.ADMIN_ROLE_IDS || "")
    .split(",")
    .map((roleId) => roleId.trim())
    .filter(Boolean),
);
const shouldRestartAfterUpdate = process.env.RESTART_AFTER_UPDATE === "true";

if (!token) {
  console.error("Missing DISCORD_TOKEN in environment.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function getConfiguredType(guildId, channelId) {
  return getGuildConfig(guildId).channels[channelId]?.type ?? null;
}

function getRecordsChannel(guild, kind) {
  const recordsChannelId = getGuildConfig(guild.id)[`${kind}RecordsChannelId`];
  return recordsChannelId ? guild.channels.cache.get(recordsChannelId) ?? null : null;
}

function listConfiguredChannels(guild) {
  const guildConfig = getGuildConfig(guild.id);
  const configured = Object.entries(guildConfig.channels)
    .map(([channelId, config]) => {
      const channel = guild.channels.cache.get(channelId);

      if (!channel) {
        return null;
      }

      return `${channel} — code-only`;
    })
    .filter(Boolean);
  const codeRecordsChannel = getRecordsChannel(guild, "code");
  const referralRecordsChannel = getRecordsChannel(guild, "referral");

  if (codeRecordsChannel) {
    configured.push(`${codeRecordsChannel} — code records`);
  }

  if (referralRecordsChannel) {
    configured.push(`${referralRecordsChannel} — referral records`);
  }

  return configured;
}

function getTargetChannel(message) {
  return message.mentions.channels.first() ?? message.channel;
}

function canManageChannels(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageChannels));
}

function canControlBot(member) {
  if (!member) {
    return false;
  }

  if (adminRoleIds.size > 0) {
    return member.roles?.cache?.some((role) => adminRoleIds.has(role.id)) ?? false;
  }

  return Boolean(member.permissions?.has(PermissionFlagsBits.Administrator));
}

async function sendTemporaryNotice(channel, text) {
  await channel
    .send(text)
    .then((sent) => {
      setTimeout(() => {
        sent.delete().catch(() => null);
      }, 5000);
    })
    .catch(() => null);
}

async function sendUsage(message) {
  await message.reply(
    [
      "**Member commands**",
      `- \`${prefix}code Name | CODE | optional-link\``,
      `- \`${prefix}referral Name | https://link | optional short description\``,
      "",
      "**Channel setup commands**",
      `- \`${prefix}setcodechannel [#channel]\``,
      `- \`${prefix}unsetcodechannel [#channel]\``,
      `- \`${prefix}setcoderecordschannel [#channel]\``,
      `- \`${prefix}unsetcoderecordschannel\``,
      `- \`${prefix}setreferralrecordschannel [#channel]\``,
      `- \`${prefix}unsetreferralrecordschannel\``,
      `- \`${prefix}codechannels\``,
      "",
      "**Admin bot commands**",
      `- \`${prefix}restartbot\``,
      `- \`${prefix}updatebot\``,
    ].join("\n"),
  );
}

async function postCode(message, rawDetails) {
  const submission = parseCodeSubmission(rawDetails);

  if (!submission) {
    await message.reply(
      `Usage: \`${prefix}code Name | CODE | optional-link\``,
    );
    return;
  }

  const targetChannel = getRecordsChannel(message.guild, "code");

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    await message.reply(
      "I could not find the code records channel in this server.",
    );
    return;
  }

  const lines = [
    "**Code Record**",
    `**Place:** ${submission.name}`,
    `**Code:** \`${submission.code}\``,
  ];

  if (submission.link) {
    lines.push(`**Link:** ${submission.link}`);
  }

  lines.push(`**Shared by:** ${message.author}`);

  await targetChannel.send(lines.join("\n"));

  if (targetChannel.id === message.channel.id) {
    await message.delete().catch(() => null);
  } else {
    await message.reply(`Saved that code in ${targetChannel}.`);
  }
}

async function postReferral(message, rawDetails) {
  const submission = parseReferralSubmission(rawDetails);

  if (!submission) {
    await message.reply(
      `Usage: \`${prefix}referral Name | https://link | optional short description\``,
    );
    return;
  }

  const targetChannel = getRecordsChannel(message.guild, "referral");

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    await message.reply(
      "I could not find the referral records channel in this server.",
    );
    return;
  }

  const lines = [
    "**Referral Record**",
    `**Place:** ${submission.name}`,
    `**Link:** ${submission.link}`,
  ];

  if (submission.description) {
    lines.push(`**About:** ${submission.description}`);
  }

  lines.push(`**Shared by:** ${message.author}`);

  await targetChannel.send(lines.join("\n"));

  if (targetChannel.id === message.channel.id) {
    await message.delete().catch(() => null);
  } else {
    await message.reply(`Saved that referral in ${targetChannel}.`);
  }
}

async function restartBot(message) {
  await message.reply("Restarting the bot now.");

  setTimeout(() => {
    client.destroy();
    process.exit(0);
  }, 1000);
}

async function updateBot(message) {
  const updateCommand = process.env.UPDATE_COMMAND?.trim();

  if (!updateCommand) {
    await message.reply("Set UPDATE_COMMAND in the bot environment before using this command.");
    return;
  }

  await message.reply(`Running update command:\n\`\`\`\n${updateCommand}\n\`\`\``);

  try {
    const { stdout, stderr } = await runUpdateCommand(updateCommand);
    await message.reply(`Update finished.\n\`\`\`\n${formatCommandOutput(stdout, stderr)}\n\`\`\``);

    if (shouldRestartAfterUpdate) {
      await restartBot(message);
    }
  } catch (result) {
    const output = formatCommandOutput(result.stdout, result.stderr || result.error?.message);
    await message.reply(`Update failed.\n\`\`\`\n${output}\n\`\`\``);
  }
}

async function handleCommand(message) {
  const withoutPrefix = message.content.slice(prefix.length).trim();

  if (!withoutPrefix) {
    return;
  }

  const [commandName, ...args] = withoutPrefix.split(/\s+/);
  const command = commandName.toLowerCase();

  if (command === "help") {
    await sendUsage(message);
    return;
  }

  if (
    command === "code"
  ) {
    const details = withoutPrefix.slice(commandName.length).trim();

    if (!details) {
      await message.reply(
        `Usage: \`${prefix}code Name | CODE | optional-link\``,
      );
      return;
    }

    await postCode(message, details);
    return;
  }

  if (command === "referral") {
    const details = withoutPrefix.slice(commandName.length).trim();

    if (!details) {
      await message.reply(
        `Usage: \`${prefix}referral Name | https://link | optional short description\``,
      );
      return;
    }

    await postReferral(message, details);
    return;
  }

  if (command === "codechannels") {
    const configured = listConfiguredChannels(message.guild);
    await message.reply(
      configured.length > 0
        ? configured.join("\n")
        : "No code or records channels are configured yet.",
    );
    return;
  }

  if (
    command === "setcodechannel" ||
    command === "unsetcodechannel" ||
    command === "setcoderecordschannel" ||
    command === "unsetcoderecordschannel" ||
    command === "setreferralrecordschannel" ||
    command === "unsetreferralrecordschannel"
  ) {
    if (!canManageChannels(message.member)) {
      await message.reply("You need the Manage Channels permission to change channel rules.");
      return;
    }
  }

  if (command === "setcodechannel") {
    const targetChannel = getTargetChannel(message);

    upsertChannel(message.guild.id, targetChannel.id, "code");
    await message.reply(`${targetChannel} is now a code-only channel.`);
    return;
  }

  if (command === "unsetcodechannel") {
    const targetChannel = getTargetChannel(message);
    const removed = removeChannel(message.guild.id, targetChannel.id);

    await message.reply(
      removed
        ? `${targetChannel} is no longer code-only.`
        : `${targetChannel} was not configured as a code-only channel.`,
    );
    return;
  }

  if (command === "setcoderecordschannel") {
    const targetChannel = getTargetChannel(message);
    setRecordsChannel(message.guild.id, "code", targetChannel.id);
    await message.reply(`${targetChannel} is now the code records channel.`);
    return;
  }

  if (command === "unsetcoderecordschannel") {
    const removed = clearRecordsChannel(message.guild.id, "code");
    await message.reply(
      removed
        ? "The code records channel has been cleared."
        : "There is no code records channel configured right now.",
    );
    return;
  }

  if (command === "setreferralrecordschannel") {
    const targetChannel = getTargetChannel(message);
    setRecordsChannel(message.guild.id, "referral", targetChannel.id);
    await message.reply(`${targetChannel} is now the referral records channel.`);
    return;
  }

  if (command === "unsetreferralrecordschannel") {
    const removed = clearRecordsChannel(message.guild.id, "referral");
    await message.reply(
      removed
        ? "The referral records channel has been cleared."
        : "There is no referral records channel configured right now.",
    );
    return;
  }

  if (command === "restartbot" || command === "restart") {
    if (!canControlBot(message.member)) {
      await message.reply("You need the configured bot admin role or Administrator permission to restart the bot.");
      return;
    }

    await restartBot(message);
    return;
  }

  if (command === "updatebot" || command === "update") {
    if (!canControlBot(message.member)) {
      await message.reply("You need the configured bot admin role or Administrator permission to update the bot.");
      return;
    }

    await updateBot(message);
    return;
  }

  await message.reply(`Unknown command. Use \`${prefix}help\` for the command list.`);
}

async function moderateCodeOnlyChannel(message) {
  const codeRecordsChannel = getRecordsChannel(message.guild, "code");
  const referralRecordsChannel = getRecordsChannel(message.guild, "referral");
  const configuredType = getConfiguredType(message.guild.id, message.channel.id);

  if (message.content.startsWith(prefix)) {
    return;
  }

  if (
    codeRecordsChannel?.id === message.channel.id ||
    referralRecordsChannel?.id === message.channel.id
  ) {
    await message.delete().catch(() => null);
    await sendTemporaryNotice(
      message.channel,
      `${message.author}, this channel is records-only. Use bot commands from any channel to add freebies here.`,
    );
    return;
  }

  if (!configuredType) {
    return;
  }

  if (message.attachments.size === 0 && isValidCode(message.content)) {
    return;
  }

  await message.delete().catch(() => null);
  await sendTemporaryNotice(
    message.channel,
    `${message.author}, this channel is code-only. Use a single code or the bot commands.`,
  );
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  if (message.content.startsWith(prefix)) {
    await handleCommand(message).catch((error) => {
      console.error("Command failed:", error);
      return message.reply("Something went wrong while running that command.");
    });
    return;
  }

  await moderateCodeOnlyChannel(message).catch((error) => {
    console.error("Moderation failed:", error);
  });
});

client.login(token).catch((error) => {
  console.error("Failed to log in to Discord:", error);
  process.exit(1);
});
