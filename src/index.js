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
} = require("./codeRules");
const { getGuildConfig, removeChannel, upsertChannel } = require("./store");

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

function listConfiguredChannels(guild) {
  const guildConfig = getGuildConfig(guild.id);

  return Object.entries(guildConfig.channels)
    .map(([channelId, config]) => {
      const channel = guild.channels.cache.get(channelId);

      if (!channel) {
        return null;
      }

      return `${channel} — ${getChannelLabel(config.type)}`;
    })
    .filter(Boolean);
}

function findTargetChannel(guild, requestedType, currentChannelId) {
  const guildConfig = getGuildConfig(guild.id);
  const configuredEntries = Object.entries(guildConfig.channels);

  const current = configuredEntries.find(
    ([channelId, config]) =>
      channelId === currentChannelId && config.type === requestedType,
  );

  const fallback =
    current ??
    configuredEntries.find(([, config]) => config.type === requestedType);

  if (!fallback) {
    return null;
  }

  const [channelId] = fallback;
  return guild.channels.cache.get(channelId) ?? null;
}

async function sendUsage(message) {
  await message.reply(
    [
      `Use \`${prefix}setcodechannel <casino|freesc> [#channel]\` to mark a code-only channel.`,
      `Use \`${prefix}casino <CODE>\` to post a sweepstakes casino code.`,
      `Use \`${prefix}freesc <CODE>\` to post a free SC code.`,
      `Use \`${prefix}codechannels\` to list the protected channels.`,
    ].join("\n"),
  );
}

async function postCode(message, type, code) {
  if (!isValidCode(code)) {
    await message.reply(
      "That code format is not valid. Use one code with only letters, numbers, `_`, or `-`.",
    );
    return;
  }

  const targetChannel = findTargetChannel(message.guild, type, message.channel.id);

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    await message.reply(
      `I could not find a configured ${getChannelLabel(type)} code channel in this server.`,
    );
    return;
  }

  await targetChannel.send(`**${getChannelLabel(type)} code:** \`${code}\``);

  if (targetChannel.id === message.channel.id) {
    await message.react("✅");
  } else {
    await message.reply(`Posted ${code} in ${targetChannel}.`);
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
    const code = args[0];

    if (!code) {
      await message.reply(`Usage: \`${prefix}${command} <CODE>\``);
      return;
    }

    await postCode(message, command, code);
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

  if (command === "setcodechannel" || command === "unsetcodechannel") {
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

  await message.reply(`Unknown command. Use \`${prefix}help\` for the command list.`);
}

async function moderateCodeOnlyChannel(message) {
  const configuredType = getConfiguredType(message.guild.id, message.channel.id);

  if (!configuredType) {
    return;
  }

  if (message.content.startsWith(prefix)) {
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
