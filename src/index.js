require("dotenv").config();

const {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

const {
  isValidCode,
  parseCodeSubmission,
  parseReferralSubmission,
} = require("./codeRules");
const {
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
} = require("./store");
const { formatCommandOutput, runUpdateCommand } = require("./control");
const { buildRecordMessage, ensureGuildRecordsChannel } = require("./records");

const token = process.env.DISCORD_TOKEN;
const adminRoleIds = new Set(
  (process.env.ADMIN_ROLE_IDS || "")
    .split(",")
    .map((roleId) => roleId.trim())
    .filter(Boolean),
);
const shouldRestartAfterUpdate = process.env.RESTART_AFTER_UPDATE === "true";
const customCommandNamePattern = /^[a-z0-9_-]{1,32}$/;

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
const rest = new REST({ version: "10" }).setToken(token);
const guildMutationLocks = new Map();

const baseCommandNames = new Set([
  "help",
  "code",
  "referral",
  "codechannels",
  "setcodechannel",
  "unsetcodechannel",
  "setcoderecordschannel",
  "unsetcoderecordschannel",
  "setreferralrecordschannel",
  "unsetreferralrecordschannel",
  "addcommand",
  "editcommand",
  "removecommand",
  "listcommands",
  "restartbot",
  "updatebot",
]);

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

      const typeLabel = config?.type === "code" ? "code-only" : config?.type ?? "configured";
      return `${channel} — ${typeLabel}`;
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

function canManageCustomCommands(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
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

async function postCode(guild, userMention, currentChannelId, rawDetails) {
  const submission = parseCodeSubmission(rawDetails);

  if (!submission) {
    return { error: "Please provide a valid place name, a valid code, and an optional http(s) link." };
  }

  let targetChannel;

  try {
    targetChannel = await withGuildMutationLock(
      guild.id,
      () => ensureGuildRecordsChannel(guild, "code", {
        botUserId: client.user.id,
        configuredChannelId: getGuildConfig(guild.id).codeRecordsChannelId,
        reason: "Auto-created code records channel for a code submission",
        setConfiguredChannelId: (channelId) => setRecordsChannel(guild.id, "code", channelId),
      }),
    );
  } catch (error) {
    console.error(`Failed to prepare code records channel for guild ${guild.id}:`, error);
    return {
      error:
        "I couldn't prepare the code records channel. Ask a moderator to run /setcoderecordschannel and make sure it points to a standard text channel.",
    };
  }

  await targetChannel.send(buildRecordMessage("code", submission, userMention));

  if (targetChannel.id === currentChannelId) {
    return { ok: "Saved that code here." };
  }

  return { ok: `Saved that code in ${targetChannel}.` };
}

async function postReferral(guild, userMention, currentChannelId, rawDetails) {
  const submission = parseReferralSubmission(rawDetails);

  if (!submission) {
    return {
      error: "Please provide a valid place name, a valid http(s) referral link, and an optional description up to 200 characters.",
    };
  }

  let targetChannel;

  try {
    targetChannel = await withGuildMutationLock(
      guild.id,
      () => ensureGuildRecordsChannel(guild, "referral", {
        botUserId: client.user.id,
        configuredChannelId: getGuildConfig(guild.id).referralRecordsChannelId,
        reason: "Auto-created referral records channel for a referral submission",
        setConfiguredChannelId: (channelId) => setRecordsChannel(guild.id, "referral", channelId),
      }),
    );
  } catch (error) {
    console.error(`Failed to prepare referral records channel for guild ${guild.id}:`, error);
    return {
      error:
        "I couldn't prepare the referral records channel. Ask a moderator to run /setreferralrecordschannel and make sure it points to a standard text channel.",
    };
  }

  await targetChannel.send(buildRecordMessage("referral", submission, userMention));

  if (targetChannel.id === currentChannelId) {
    return { ok: "Saved that referral here." };
  }

  return { ok: `Saved that referral in ${targetChannel}.` };
}

async function restartBot(interaction) {
  await interaction.editReply("Restarting the bot now.");
  scheduleRestart();
}

function scheduleRestart() {
  setTimeout(() => {
    client.destroy();
    process.exit(0);
  }, 1000);
}

async function updateBot(interaction) {
  const updateCommand = process.env.UPDATE_COMMAND?.trim();

  if (!updateCommand) {
    await interaction.editReply("Set UPDATE_COMMAND in the bot environment before using this command.");
    return;
  }

  await interaction.editReply(`Running update command:\n\`\`\`\n${updateCommand}\n\`\`\``);

  try {
    const { stdout, stderr } = await runUpdateCommand(updateCommand);
    const output = formatCommandOutput(stdout, stderr);

    if (shouldRestartAfterUpdate) {
      await interaction.followUp(`Update finished. Restarting the bot now.\n\`\`\`\n${output}\n\`\`\``);
      scheduleRestart();
      return;
    }

    await interaction.followUp(`Update finished.\n\`\`\`\n${output}\n\`\`\``);
  } catch (result) {
    const output = formatCommandOutput(result.stdout, result.stderr || result.error?.message);
    await interaction.followUp(`Update failed.\n\`\`\`\n${output}\n\`\`\``);
  }
}

function buildBaseCommands() {
  return [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show all available bot commands"),
    new SlashCommandBuilder()
      .setName("code")
      .setDescription("Submit a code record")
      .addStringOption((option) => option.setName("name").setDescription("Place name").setRequired(true))
      .addStringOption((option) => option.setName("code").setDescription("Code token").setRequired(true))
      .addStringOption((option) => option.setName("link").setDescription("Optional link").setRequired(false)),
    new SlashCommandBuilder()
      .setName("referral")
      .setDescription("Submit a referral record")
      .addStringOption((option) => option.setName("name").setDescription("Place name").setRequired(true))
      .addStringOption((option) => option.setName("link").setDescription("Referral link").setRequired(true))
      .addStringOption((option) => option.setName("description").setDescription("Optional short description").setRequired(false)),
    new SlashCommandBuilder()
      .setName("setcodechannel")
      .setDescription("Mark a channel as code-only")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((option) =>
        option.setName("channel").setDescription("Channel to mark as code-only").addChannelTypes(ChannelType.GuildText).setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("unsetcodechannel")
      .setDescription("Remove code-only rules from a channel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((option) =>
        option.setName("channel").setDescription("Channel to unmark (defaults to current)").addChannelTypes(ChannelType.GuildText).setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("setcoderecordschannel")
      .setDescription("Set channel for code records (or auto-create one)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((option) =>
        option.setName("channel").setDescription("Existing records channel").addChannelTypes(ChannelType.GuildText).setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("unsetcoderecordschannel")
      .setDescription("Clear code records channel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
      .setName("setreferralrecordschannel")
      .setDescription("Set channel for referral records (or auto-create one)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((option) =>
        option.setName("channel").setDescription("Existing records channel").addChannelTypes(ChannelType.GuildText).setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("unsetreferralrecordschannel")
      .setDescription("Clear referral records channel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
      .setName("codechannels")
      .setDescription("List configured code and records channels"),
    new SlashCommandBuilder()
      .setName("addcommand")
      .setDescription("Create a custom slash command")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption((option) => option.setName("name").setDescription("Command name (letters, numbers, _ or -)").setRequired(true))
      .addStringOption((option) => option.setName("description").setDescription("Short command description").setRequired(true))
      .addStringOption((option) => option.setName("response").setDescription("Message response for the command").setRequired(true)),
    new SlashCommandBuilder()
      .setName("editcommand")
      .setDescription("Edit an existing custom slash command")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption((option) => option.setName("name").setDescription("Existing command name").setRequired(true))
      .addStringOption((option) => option.setName("description").setDescription("New command description").setRequired(false))
      .addStringOption((option) => option.setName("response").setDescription("New command response").setRequired(false)),
    new SlashCommandBuilder()
      .setName("removecommand")
      .setDescription("Remove a custom slash command")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption((option) => option.setName("name").setDescription("Custom command name").setRequired(true)),
    new SlashCommandBuilder()
      .setName("listcommands")
      .setDescription("List all custom commands"),
    new SlashCommandBuilder()
      .setName("restartbot")
      .setDescription("Restart the bot process")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
      .setName("updatebot")
      .setDescription("Run the configured update command")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
}

function sanitizeCustomCommandName(name) {
  return name.trim().toLowerCase();
}

function isValidCustomCommandName(name) {
  return customCommandNamePattern.test(name) && !baseCommandNames.has(name);
}

async function syncAllGuildSlashCommands() {
  const guilds = Array.from(client.guilds.cache.values());
  const concurrency = Math.min(3, guilds.length);
  let nextIndex = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < guilds.length) {
      const guild = guilds[nextIndex];
      nextIndex += 1;

      try {
        await syncGuildSlashCommands(guild);
      } catch (error) {
        console.error(`Failed to sync slash commands for guild ${guild.id}:`, error);
      }
    }
  });

  await Promise.all(workers);
}

function withGuildMutationLock(guildId, work) {
  const current = guildMutationLocks.get(guildId) ?? Promise.resolve();
  const next = current.catch(() => null).then(work);
  guildMutationLocks.set(guildId, next);

  return next.finally(() => {
    if (guildMutationLocks.get(guildId) === next) {
      guildMutationLocks.delete(guildId);
    }
  });
}

function buildGuildCommandPayload(guildId) {
  const baseCommands = buildBaseCommands();
  const customCommands = listCustomCommands(guildId);

  for (const [name, config] of Object.entries(customCommands)) {
    if (!isValidCustomCommandName(name)) {
      continue;
    }

    const description = (config?.description || "Custom bot command").trim();

    baseCommands.push(
      new SlashCommandBuilder()
        .setName(name)
        .setDescription(description.slice(0, 100) || "Custom bot command"),
    );
  }

  return baseCommands.map((command) => command.toJSON());
}

async function syncGuildSlashCommands(guild) {
  const applicationId = client.application?.id ?? client.user?.id;

  if (!applicationId) {
    throw new Error("Unable to resolve application id for slash command registration.");
  }

  const body = buildGuildCommandPayload(guild.id);

  await rest.put(
    Routes.applicationGuildCommands(applicationId, guild.id),
    { body },
  );
}

async function reconcileGuildRecordsChannels(guild, options = {}) {
  await withGuildMutationLock(guild.id, async () => {
    const guildConfig = getGuildConfig(guild.id);
    const shouldCreateMissingChannels = options.allowCreateMissingChannels
      ?? Boolean(guildConfig.codeRecordsChannelId || guildConfig.referralRecordsChannelId);

    await ensureGuildRecordsChannel(guild, "code", {
      allowCreate: shouldCreateMissingChannels,
      botUserId: client.user.id,
      configuredChannelId: guildConfig.codeRecordsChannelId,
      reason: "Startup reconciliation for code records channel",
      setConfiguredChannelId: (channelId) => setRecordsChannel(guild.id, "code", channelId),
    });
    await ensureGuildRecordsChannel(guild, "referral", {
      allowCreate: shouldCreateMissingChannels,
      botUserId: client.user.id,
      configuredChannelId: guildConfig.referralRecordsChannelId,
      reason: "Startup reconciliation for referral records channel",
      setConfiguredChannelId: (channelId) => setRecordsChannel(guild.id, "referral", channelId),
    });
  });
}

async function reconcileAllGuildRecordsChannels() {
  const guilds = Array.from(client.guilds.cache.values());

  await Promise.all(
    guilds.map(async (guild) => {
      try {
        await reconcileGuildRecordsChannels(guild);
      } catch (error) {
        console.error(`Failed to reconcile records channels for guild ${guild.id}:`, error);
      }
    }),
  );
}

async function sendUsage(interaction) {
  await interaction.editReply(
    [
      "**Member commands**",
      "- `/code name:<place> code:<CODE> [link]`",
      "- `/referral name:<place> link:<https://...> [description]`",
      "",
      "**Channel setup commands**",
      "- `/setcodechannel [channel]`",
      "- `/unsetcodechannel [channel]`",
      "- `/setcoderecordschannel [channel]`",
      "- `/unsetcoderecordschannel`",
      "- `/setreferralrecordschannel [channel]`",
      "- `/unsetreferralrecordschannel`",
      "- `/codechannels`",
      "",
      "**Dynamic custom command management**",
      "- `/addcommand name description response`",
      "- `/editcommand name [description] [response]`",
      "- `/removecommand name`",
      "- `/listcommands`",
      "",
      "**Admin bot commands**",
      "- `/restartbot`",
      "- `/updatebot`",
    ].join("\n"),
  );
}

async function handleSlashCommand(interaction) {
  const { guild, member, commandName } = interaction;

  if (!guild) {
    await interaction.reply({ content: "This command can only be used inside a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  if (commandName === "help") {
    await sendUsage(interaction);
    return;
  }

  if (commandName === "code") {
    const name = interaction.options.getString("name", true);
    const code = interaction.options.getString("code", true);
    const link = interaction.options.getString("link") ?? "";
    const details = [name, code, link].filter(Boolean).join(" | ");
    const result = await postCode(guild, interaction.user.toString(), interaction.channelId, details);

    await interaction.editReply(result.error ?? result.ok);
    return;
  }

  if (commandName === "referral") {
    const name = interaction.options.getString("name", true);
    const link = interaction.options.getString("link", true);
    const description = interaction.options.getString("description") ?? "";
    const details = [name, link, description].filter(Boolean).join(" | ");
    const result = await postReferral(guild, interaction.user.toString(), interaction.channelId, details);

    await interaction.editReply(result.error ?? result.ok);
    return;
  }

  if (commandName === "codechannels") {
    const configured = listConfiguredChannels(guild);
    await interaction.editReply(
      configured.length > 0
        ? configured.join("\n")
        : "No code or records channels are configured yet.",
    );
    return;
  }

  if (
    commandName === "setcodechannel" ||
    commandName === "unsetcodechannel" ||
    commandName === "setcoderecordschannel" ||
    commandName === "unsetcoderecordschannel" ||
    commandName === "setreferralrecordschannel" ||
    commandName === "unsetreferralrecordschannel"
  ) {
    if (!canManageChannels(member)) {
      await interaction.editReply("You need the Manage Channels permission to change channel rules.");
      return;
    }
  }

  if (commandName === "setcodechannel") {
    const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;

    upsertChannel(guild.id, targetChannel.id, "code");
    await interaction.editReply(`${targetChannel} is now a code-only channel.`);
    return;
  }

  if (commandName === "unsetcodechannel") {
    const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
    const removed = removeChannel(guild.id, targetChannel.id);

    await interaction.editReply(
      removed
        ? `${targetChannel} is no longer code-only.`
        : `${targetChannel} was not configured as a code-only channel.`,
    );
    return;
  }

  if (commandName === "setcoderecordschannel") {
    const selectedChannel = interaction.options.getChannel("channel");
    const targetChannel = await withGuildMutationLock(
      guild.id,
      () => ensureGuildRecordsChannel(guild, "code", {
        botUserId: client.user.id,
        configuredChannelId: getGuildConfig(guild.id).codeRecordsChannelId,
        selectedChannel,
        reason: "Auto-created code records channel by /setcoderecordschannel",
        setConfiguredChannelId: (channelId) => setRecordsChannel(guild.id, "code", channelId),
      }),
    );
    await interaction.editReply(`${targetChannel} is now the code records channel.`);
    return;
  }

  if (commandName === "unsetcoderecordschannel") {
    const removed = clearRecordsChannel(guild.id, "code");
    await interaction.editReply(
      removed
        ? "The code records channel has been cleared."
        : "There is no code records channel configured right now.",
    );
    return;
  }

  if (commandName === "setreferralrecordschannel") {
    const selectedChannel = interaction.options.getChannel("channel");
    const targetChannel = await withGuildMutationLock(
      guild.id,
      () => ensureGuildRecordsChannel(guild, "referral", {
        botUserId: client.user.id,
        configuredChannelId: getGuildConfig(guild.id).referralRecordsChannelId,
        selectedChannel,
        reason: "Auto-created referral records channel by /setreferralrecordschannel",
        setConfiguredChannelId: (channelId) => setRecordsChannel(guild.id, "referral", channelId),
      }),
    );
    await interaction.editReply(`${targetChannel} is now the referral records channel.`);
    return;
  }

  if (commandName === "unsetreferralrecordschannel") {
    const removed = clearRecordsChannel(guild.id, "referral");
    await interaction.editReply(
      removed
        ? "The referral records channel has been cleared."
        : "There is no referral records channel configured right now.",
    );
    return;
  }

  if (commandName === "addcommand") {
    if (!canManageCustomCommands(member)) {
      await interaction.editReply("Only administrators can add custom commands.");
      return;
    }

    const rawName = interaction.options.getString("name", true);
    const description = interaction.options.getString("description", true).trim();
    const response = interaction.options.getString("response", true).trim();
    const name = sanitizeCustomCommandName(rawName);

    if (!isValidCustomCommandName(name)) {
      await interaction.editReply("Command name must be 1-32 chars using lowercase letters, numbers, `_`, or `-`.");
      return;
    }

    if (!description || description.length > 100) {
      await interaction.editReply("Description is required and must be 1-100 characters.");
      return;
    }

    if (!response || response.length > 2000) {
      await interaction.editReply("Response is required and must be 1-2000 characters.");
      return;
    }

    const result = await withGuildMutationLock(guild.id, async () => {
      if (!addCustomCommand(guild.id, name, description, response)) {
        return { status: "exists" };
      }

      try {
        await syncGuildSlashCommands(guild);
        return { status: "added" };
      } catch (error) {
        removeCustomCommand(guild.id, name);
        throw error;
      }
    });

    if (result.status === "exists") {
      await interaction.editReply(`/${name} already exists. Use /editcommand instead.`);
      return;
    }

    await interaction.editReply(`Added /${name}.`);
    return;
  }

  if (commandName === "editcommand") {
    if (!canManageCustomCommands(member)) {
      await interaction.editReply("Only administrators can edit custom commands.");
      return;
    }

    const rawName = interaction.options.getString("name", true);
    const description = interaction.options.getString("description");
    const response = interaction.options.getString("response");
    const name = sanitizeCustomCommandName(rawName);

    if (!isValidCustomCommandName(name)) {
      await interaction.editReply("Command name must be a non-reserved custom command name (1-32 chars, lowercase letters, numbers, `_`, or `-`).");
      return;
    }

    if (!description && !response) {
      await interaction.editReply("Provide at least one field to update: description or response.");
      return;
    }

    const hasDescriptionUpdate = description !== null;
    const hasResponseUpdate = response !== null;
    const trimmedDescription = description?.trim();
    const trimmedResponse = response?.trim();

    if (hasDescriptionUpdate && (!trimmedDescription || trimmedDescription.length > 100)) {
      await interaction.editReply("Description must be 1-100 characters.");
      return;
    }

    if (hasResponseUpdate && (!trimmedResponse || trimmedResponse.length > 2000)) {
      await interaction.editReply("Response must be 1-2000 characters.");
      return;
    }

    const result = await withGuildMutationLock(guild.id, async () => {
      const existingCommand = getCustomCommand(guild.id, name);

      if (!existingCommand) {
        return { status: "missing" };
      }

      if (!editCustomCommand(guild.id, name, {
        description: hasDescriptionUpdate ? trimmedDescription : undefined,
        response: hasResponseUpdate ? trimmedResponse : undefined,
      })) {
        return { status: "missing" };
      }

      try {
        await syncGuildSlashCommands(guild);
        return { status: "updated" };
      } catch (error) {
        editCustomCommand(guild.id, name, existingCommand);
        throw error;
      }
    });

    if (result.status === "missing") {
      await interaction.editReply(`/${name} does not exist.`);
      return;
    }

    await interaction.editReply(`Updated /${name}.`);
    return;
  }

  if (commandName === "removecommand") {
    if (!canManageCustomCommands(member)) {
      await interaction.editReply("Only administrators can remove custom commands.");
      return;
    }

    const rawName = interaction.options.getString("name", true);
    const name = sanitizeCustomCommandName(rawName);

    if (!isValidCustomCommandName(name)) {
      await interaction.editReply("Command name must be a non-reserved custom command name (1-32 chars, lowercase letters, numbers, `_`, or `-`).");
      return;
    }

    const result = await withGuildMutationLock(guild.id, async () => {
      const existingCommand = getCustomCommand(guild.id, name);

      if (!existingCommand) {
        return { status: "missing" };
      }

      if (!removeCustomCommand(guild.id, name)) {
        return { status: "missing" };
      }

      try {
        await syncGuildSlashCommands(guild);
        return { status: "removed" };
      } catch (error) {
        addCustomCommand(guild.id, name, existingCommand.description, existingCommand.response);
        throw error;
      }
    });

    if (result.status === "missing") {
      await interaction.editReply(`/${name} does not exist.`);
      return;
    }

    await interaction.editReply(`Removed /${name}.`);
    return;
  }

  if (commandName === "listcommands") {
    const commands = listCustomCommands(guild.id);
    const entries = Object.entries(commands);

    if (entries.length === 0) {
      await interaction.editReply("No custom commands configured yet.");
      return;
    }

    const lines = entries.map(([name, config]) => `- /${name} — ${config.description}`);
    const messages = [];
    let current = "";

    for (const line of lines) {
      const next = current ? `${current}\n${line}` : line;

      if (next.length > 1900) {
        messages.push(current);
        current = line;
      } else {
        current = next;
      }
    }

    if (current) {
      messages.push(current);
    }

    await interaction.editReply(messages[0]);

    for (const message of messages.slice(1)) {
      await interaction.followUp({ content: message, ephemeral: true });
    }
    return;
  }

  if (commandName === "restartbot") {
    if (!canControlBot(member)) {
      await interaction.editReply("You need the configured bot admin role or Administrator permission to restart the bot.");
      return;
    }

    await restartBot(interaction);
    return;
  }

  if (commandName === "updatebot") {
    if (!canControlBot(member)) {
      await interaction.editReply("You need the configured bot admin role or Administrator permission to update the bot.");
      return;
    }

    await updateBot(interaction);
    return;
  }

  const customCommand = getCustomCommand(guild.id, commandName);

  if (customCommand) {
    await interaction.editReply(customCommand.response);
    return;
  }

  await interaction.editReply("Unknown command.");
}

async function moderateCodeOnlyChannel(message) {
  const configuredType = getConfiguredType(message.guild.id, message.channel.id);
  const guildConfig = getGuildConfig(message.guild.id);

  if (
    guildConfig.codeRecordsChannelId === message.channel.id ||
    guildConfig.referralRecordsChannelId === message.channel.id
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

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await reconcileAllGuildRecordsChannels();
  } catch (error) {
    console.error("Failed to complete startup records channel reconciliation:", error);
  }

  try {
    await syncAllGuildSlashCommands();
  } catch (error) {
    console.error("Failed to complete startup slash command sync:", error);
  }
});

client.on("guildCreate", async (guild) => {
  try {
    await reconcileGuildRecordsChannels(guild, { allowCreateMissingChannels: false });
  } catch (error) {
    console.error(`Failed to reconcile records channels for new guild ${guild.id}:`, error);
  }

  try {
    await syncGuildSlashCommands(guild);
  } catch (error) {
    console.error(`Failed to sync slash commands for new guild ${guild.id}:`, error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  await handleSlashCommand(interaction).catch(async (error) => {
    console.error("Command failed:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("Something went wrong while running that command.").catch(() => null);
      return;
    }

    await interaction.reply({ content: "Something went wrong while running that command.", ephemeral: true }).catch(() => null);
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  await moderateCodeOnlyChannel(message).catch((error) => {
    console.error("Moderation failed:", error);
  });
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

client.login(token).catch((error) => {
  console.error("Failed to log in to Discord:", error);
  process.exit(1);
});
