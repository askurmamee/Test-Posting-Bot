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
  parseSubmissionParts,
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

function getRecordsChannel(guild) {
  const recordsChannelId = getGuildConfig(guild.id).recordsChannelId;
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
  const recordsChannel = getRecordsChannel(guild);

  if (recordsChannel) {
    configured.push(`${recordsChannel} — freebies records`);
  }

  return configured;
}

async function sendUsage(message) {
  await message.reply(
    [
      `Use \`${prefix}setcodechannel <casino|freesc> [#channel]\` to mark a code-only channel.`,
      `Use \`${prefix}setrecordschannel [#channel]\` to choose the freebies records channel.`,
      `Use \`${prefix}casino Name | CODE | https://link | short description\` from any channel.`,
      `Use \`${prefix}freesc Name | CODE | https://link | short description\` from any channel.`,
      `Use \`${prefix}codechannels\` to list the protected and records channels.`,
    ].join("\n"),
  );
}

async function postCode(message, type, rawDetails) {
  const submission = parseSubmissionParts(rawDetails);

  if (!submission) {
    await message.reply(
      `Usage: \`${prefix}${type} Name | CODE | https://link | short description\``,
    );
    return;
  }

  const targetChannel = getRecordsChannel(message.guild);

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    await message.reply(
      "I could not find the freebies records channel in this server.",
    );
    return;
  }

  await targetChannel.send(
    [
      `**${getChannelLabel(type)} Freebie**`,
      `**Name:** ${submission.name}`,
      `**Code:** \`${submission.code}\``,
      `**Link:** ${submission.link}`,
      `**About:** ${submission.description}`,
      `**Shared by:** ${message.author}`,
    ].join("\n"),
  );

  if (targetChannel.id === message.channel.id) {
    await message.delete().catch(() => null);
  } else {
    await message.reply(`Saved that ${getChannelLabel(type)} freebie in ${targetChannel}.`);
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

  if (command === "casino" || command === "freesc") {
    const details = withoutPrefix.slice(commandName.length).trim();

    if (!details) {
      await message.reply(
        `Usage: \`${prefix}${command} Name | CODE | https://link | short description\``,
      );
      return;
    }

    await postCode(message, command, details);
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
    command === "setrecordschannel" ||
    command === "unsetrecordschannel"
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

  if (command === "setrecordschannel") {
    const targetChannel = message.mentions.channels.first() ?? message.channel;
    setRecordsChannel(message.guild.id, targetChannel.id);
    await message.reply(`${targetChannel} is now the freebies records channel.`);
    return;
  }

  if (command === "unsetrecordschannel") {
    const removed = clearRecordsChannel(message.guild.id);
    await message.reply(
      removed
        ? "The freebies records channel has been cleared."
        : "There is no freebies records channel configured right now.",
    );
    return;
  }

  await message.reply(`Unknown command. Use \`${prefix}help\` for the command list.`);
}

async function moderateCodeOnlyChannel(message) {
  const recordsChannel = getRecordsChannel(message.guild);
  const configuredType = getConfiguredType(message.guild.id, message.channel.id);

  if (message.content.startsWith(prefix)) {
    return;
  }

  if (recordsChannel?.id === message.channel.id) {
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
