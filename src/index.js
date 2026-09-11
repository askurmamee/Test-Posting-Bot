require("dotenv").config();

const {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require("discord.js");

const {
  getChannelLabel,
  isValidCode,
  normalizeChannelType,
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

const token = process.env.DISCORD_TOKEN;
const prefix = process.env.BOT_PREFIX?.trim() || "!";

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in environment.");
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

      return `${channel} — ${getChannelLabel(config.type)} code-only`;
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

async function sendUsage(message) {
  await message.reply(
    [
      `Use \`${prefix}setcodechannel <casino|freesc> [#channel]\` to mark a code-only channel.`,
      `Use \`${prefix}setcoderecordschannel [#channel]\` to choose the code records channel.`,
      `Use \`${prefix}setreferralrecordschannel [#channel]\` to choose the referral records channel.`,
      `Use \`${prefix}code Name | CODE | optional-link\` from any channel.`,
      `Use \`${prefix}referral Name | https://link | optional short description\` from any channel.`,
      `Use \`${prefix}codechannels\` to list the protected and records channels.`,
    ].join("\n"),
  );
}

async function postCode(message, type, rawDetails) {
  const submission = parseCodeSubmission(rawDetails);

  if (!submission) {
    await message.reply(
      `Usage: \`${prefix}${type} Name | CODE | optional-link\``,
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
    `**${type === "code" ? "Code Record" : `${getChannelLabel(type)} Freebie`}**`,
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
    command === "casino" ||
    command === "freesc" ||
    command === "code"
  ) {
    const details = withoutPrefix.slice(commandName.length).trim();

    if (!details) {
      await message.reply(
        `Usage: \`${prefix}${command} Name | CODE | optional-link\``,
      );
      return;
    }

    await postCode(message, command, details);
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
        : "No code-only channels are configured yet.",
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
    const hasPermission = message.member.permissions.has(
      PermissionFlagsBits.ManageChannels,
    );

    if (!hasPermission) {
      await message.reply("You need the Manage Channels permission to change channel rules.");
      return;
    }
  }

  if (command === "setcodechannel") {
    const requestedType = normalizeChannelType(args[0]);
    const targetChannel = message.mentions.channels.first() ?? message.channel;

    if (!requestedType) {
      await message.reply(
        `Usage: \`${prefix}setcodechannel <casino|freesc> [#channel]\``,
      );
      return;
    }

    upsertChannel(message.guild.id, targetChannel.id, requestedType);
    await message.reply(
      `${targetChannel} is now a ${getChannelLabel(requestedType)} code-only channel.`,
    );
    return;
  }

  if (command === "unsetcodechannel") {
    const targetChannel = message.mentions.channels.first() ?? message.channel;
    const removed = removeChannel(message.guild.id, targetChannel.id);

    await message.reply(
      removed
        ? `${targetChannel} is no longer code-only.`
        : `${targetChannel} was not configured as a code-only channel.`,
    );
    return;
  }

  if (command === "setcoderecordschannel") {
    const targetChannel = message.mentions.channels.first() ?? message.channel;
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
    const targetChannel = message.mentions.channels.first() ?? message.channel;
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

    const notice = `${message.author}, this channel is records-only. Use bot commands from any channel to add freebies here.`;
    await message.channel
      .send(notice)
      .then((sent) => {
        setTimeout(() => {
          sent.delete().catch(() => null);
        }, 5000);
      })
      .catch(() => null);
    return;
  }

  if (!configuredType) {
    return;
  }

  if (message.attachments.size === 0 && isValidCode(message.content)) {
    return;
  }

  await message.delete().catch(() => null);

  const notice = `${message.author}, this channel is code-only. Use a single code or the bot commands.`;
  await message.channel.send(notice).then((sent) => {
    setTimeout(() => {
      sent.delete().catch(() => null);
    }, 5000);
  }).catch(() => null);
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
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

  await moderateCodeOnlyChannel(message);
});

client.login(token);
