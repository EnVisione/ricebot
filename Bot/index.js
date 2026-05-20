require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} = require('discord.js');

const logger = require('./utils/logger');
const { loadConfig, saveConfig, getGuildConfig, validateConfig, getWriteQueue: getConfigWriteQueue } = require('./utils/config');
const { loadTicketState, saveTicketState, getGuildTickets, updateActivity, getWriteQueue: getTicketWriteQueue, cleanupOldTickets } = require('./utils/ticketState');

// Handlers
const closeHandler = require('./tickets/closeHandler');
const claimHandler = require('./tickets/claimHandler');
const ticketFormHandler = require('./tickets/ticketFormHandler');
const { handleRRButton, handleRRDropdown } = require('./reactionroles/rrHandler');
const { createTicket } = require('./tickets/ticketService');
const { buildTicketPanelEmbed, buildTicketPanelComponents } = require('./tickets/ticketPanelBuilder');
const { buildRRPanel } = require('./reactionroles/rrBuilder');
const embedBuilder = require('./utils/embedBuilder');
const automationService = require('./tickets/automationService');
const setupHandler = require('./commands/admin/setup');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function loadCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  const commands = new Collection();
  if (!fs.existsSync(commandsDir)) return commands;

  const files = walk(commandsDir);
  for (const file of files) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const cmd = require(file);
    if (!cmd?.data?.name || typeof cmd.execute !== 'function') continue;
    // Derive folder from path
    const rel = path.relative(commandsDir, file);
    const folder = path.dirname(rel).split(path.sep)[0] || 'general';
    cmd.folder = cmd.folder || folder;
    commands.set(cmd.data.name, cmd);
  }
  return commands;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

const config = loadConfig();
const ticketState = loadTicketState();

client.commands = loadCommands();

client.once(Events.ClientReady, () => {
  logger.info(null, `Logged in as ${client.user.tag}`);
  logger.info(null, `Loaded ${client.commands.size} commands`);

  // Validate configuration and log warnings
  validateConfig(config);

  // Cleanup old closed tickets (30 days default)
  const cleanedCount = cleanupOldTickets(ticketState);
  if (cleanedCount > 0) {
    logger.info(null, `Cleaned up ${cleanedCount} old closed tickets`);
    saveTicketState(ticketState);
  }

  // Schedule daily ticket cleanup (every 24 hours)
  setInterval(() => {
    const cleaned = cleanupOldTickets(ticketState);
    if (cleaned > 0) {
      logger.info(null, `Daily cleanup: removed ${cleaned} old closed tickets`);
      saveTicketState(ticketState);
    }
  }, 24 * 60 * 60 * 1000);

  // Start automation service
  automationService.startAutomation(client, config, ticketState);
});

// Phantom ping on member join
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const guildConfig = getGuildConfig(config, member.guild.id, member.guild.name);
    const pp = guildConfig.server?.phantomPing;
    if (!pp?.enabled || !pp.channelId) return;

    const channel = member.guild.channels.cache.get(pp.channelId);
    if (!channel) {
      logger.warn(member.guild.id, `Phantom ping enabled, but channel ${pp.channelId} not found`);
      return;
    }

    const pingMessage = await channel.send(`${member}`);
    await pingMessage.delete().catch(() => {});

    logger.info(member.guild.id, `Phantom pinged ${member.user.tag} in #${channel.name}`);
  } catch (e) {
    logger.error(member.guild.id, 'Error in phantom ping handler', e);
  }
});

// Message activity tracking for automations
client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Update ticket activity
  updateActivity(ticketState, message.guild.id, message.channel.id, () => saveTicketState(ticketState));
});

client.on(Events.InteractionCreate, async (interaction) => {
  const receivedAt = Date.now();
  const ref = receivedAt.toString();

  // This bot only works in guilds
  if (!interaction.guild) {
    if (interaction.isRepliable()) {
      return interaction.reply({
        content: 'This bot can only be used in servers.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  const ctx = {
    client,
    config,
    ticketState,
    saveConfig: () => saveConfig(config),
    saveTicketState: () => saveTicketState(ticketState),
  };

  try {
    // SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) {
        return interaction.reply({
          content: `Unknown command. (ref ${ref})`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Log slow dispatches only
      const preExecTime = Date.now() - receivedAt;

      if (preExecTime > 500) {
        logger.warn(interaction.guildId, `Slow dispatch: ${preExecTime}ms before ${interaction.commandName} execute`);
      }

      return await cmd.execute(interaction, ctx);
    }

    // AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) {
        return await cmd.autocomplete(interaction, ctx);
      }
      return;
    }

    // BUTTONS
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Setup wizard buttons
      if (customId.startsWith('setup:')) {
        return setupHandler.handleButton(interaction, config, ctx.saveConfig);
      }

      // Ticket open button - show form modal
      if (customId.startsWith('ticket:open:')) {
        return ticketFormHandler.handleTicketButtonClick(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      // Ticket close
      if (customId === 'ticket:close') {
        return closeHandler.handleCloseButton(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      if (customId === 'ticket:close_confirm') {
        return closeHandler.handleCloseConfirm(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      if (customId === 'ticket:close_cancel') {
        return closeHandler.handleCloseCancel(interaction);
      }

      // Ticket reopen/delete
      if (customId === 'ticket:reopen') {
        return closeHandler.handleReopenButton(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      if (customId === 'ticket:delete') {
        return closeHandler.handleDeleteButton(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      if (customId === 'ticket:delete_confirm') {
        return closeHandler.handleDeleteConfirm(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      if (customId === 'ticket:delete_cancel') {
        return closeHandler.handleDeleteCancel(interaction);
      }

      // Ticket claim/unclaim
      if (customId === 'ticket:claim') {
        return claimHandler.handleClaimButton(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      if (customId === 'ticket:unclaim') {
        return claimHandler.handleUnclaimButton(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      // Reaction role buttons (rr:{roleId})
      if (customId.startsWith('rr:') && !customId.startsWith('rr:dropdown:')) {
        return handleRRButton(interaction, config, ctx.saveConfig);
      }
    }

    // SELECT MENUS
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;

      // Ticket form - category selection
      if (customId.startsWith('ticket:form:category:')) {
        return ticketFormHandler.handleCategorySelect(interaction, config);
      }

      // Ticket form - issue type selection
      if (customId.startsWith('ticket:form:issue:')) {
        return ticketFormHandler.handleIssueSelect(interaction, config);
      }

      // Setup wizard reconfig menu
      if (customId.startsWith('setup:reconfig:')) {
        return setupHandler.handleReconfig(interaction, config, ctx.saveConfig);
      }

      // Panel type selection (from /panel command)
      if (customId.startsWith('panel:select:')) {
        const selected = interaction.values[0];
        const guildId = interaction.guildId;
        const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);

        if (selected === 'ticket_disabled' || selected === 'rr_disabled') {
          return interaction.update({ embeds: [embedBuilder.error('Not Configured', 'This panel type is not configured yet. Use /ticketadmin or /rradmin.')], components: [] });
        }

        if (selected === 'ticket') {
          const panelIds = Object.keys(guildConfig.panels || {});

          if (panelIds.length === 1) {
            // Post directly
            const panelId = panelIds[0];
            const panelConfig = guildConfig.panels[panelId];
            const embed = buildTicketPanelEmbed(panelConfig);
            const components = buildTicketPanelComponents(panelId, panelConfig);

            await interaction.channel.send({ embeds: [embed], components });
            panelConfig.postedAt = Date.now();
            panelConfig.postedChannelId = interaction.channel.id;
            saveConfig(config);

            return interaction.update({ embeds: [embedBuilder.success('Panel Posted', 'Ticket panel has been posted.')], components: [] });
          }

          // Multiple panels - show selection
          const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
          const options = panelIds.map((pid) => {
            const p = guildConfig.panels[pid];
            return {
              label: p.name,
              value: pid,
              description: p.ticketOptions?.categoryId ? 'Category set' : '⚠️ No category',
            };
          });

          const menu = new StringSelectMenuBuilder()
            .setCustomId(`panel:ticket:${guildId}`)
            .setPlaceholder('Select panel to post...')
            .addOptions(options);

          return interaction.update({
            embeds: [embedBuilder.info('Select Panel', 'Which ticket panel do you want to post?')],
            components: [new ActionRowBuilder().addComponents(menu)],
          });
        }

        if (selected === 'rr') {
          const rr = guildConfig.reactionRoles;
          if (!rr.roles?.length) {
            return interaction.update({ embeds: [embedBuilder.error('No Roles', 'Add roles first with /rradmin add-role.')], components: [] });
          }

          const { embed, components } = buildRRPanel(rr, guildId);
          const channelId = rr.channelId || interaction.channel.id;
          const channel = interaction.guild.channels.cache.get(channelId);

          if (!channel) {
            return interaction.update({ embeds: [embedBuilder.error('Channel Not Found', 'Set a channel with /rradmin set-channel.')], components: [] });
          }

          const msg = await channel.send({ embeds: [embed], components });
          rr.panelMessageId = msg.id;
          rr.channelId = channel.id;
          saveConfig(config);

          return interaction.update({ embeds: [embedBuilder.success('Panel Posted', `[Jump to panel](${msg.url})`)], components: [] });
        }
      }

      // Ticket panel selection (when multiple panels exist)
      if (customId.startsWith('panel:ticket:')) {
        const panelId = interaction.values[0];
        const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);
        const panelConfig = guildConfig.panels?.[panelId];

        if (!panelConfig) {
          return interaction.update({ embeds: [embedBuilder.error('Panel Not Found', 'This panel no longer exists.')], components: [] });
        }

        const embed = buildTicketPanelEmbed(panelConfig);
        const components = buildTicketPanelComponents(panelId, panelConfig);

        await interaction.channel.send({ embeds: [embed], components });
        panelConfig.postedAt = Date.now();
        panelConfig.postedChannelId = interaction.channel.id;
        saveConfig(config);

        return interaction.update({ embeds: [embedBuilder.success('Panel Posted', `Ticket panel **${panelConfig.name}** has been posted.`)], components: [] });
      }

      // Ticket open dropdown (alternate style)
      if (customId.startsWith('ticket:open:')) {
        const panelId = customId.replace('ticket:open:', '');
        const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);
        const panelConfig = guildConfig.panels?.[panelId];

        if (!panelConfig) {
          return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'This panel no longer exists.')], flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await createTicket(interaction, panelId, panelConfig, guildConfig, config, ticketState, ctx.saveConfig, ctx.saveTicketState);

        if (result.success) {
          return interaction.editReply({ embeds: [embedBuilder.success('Ticket Created', `Your ticket: <#${result.channel.id}>`)] });
        } else {
          return interaction.editReply({ embeds: [embedBuilder.error('Failed', result.error)] });
        }
      }

      // Reaction role dropdown
      if (customId.startsWith('rr:dropdown:')) {
        return handleRRDropdown(interaction, config, ctx.saveConfig);
      }
    }

    // MODAL SUBMITS
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      // Ticket form modal submit
      if (customId.startsWith('ticket:form:submit:')) {
        return ticketFormHandler.handleFormSubmit(interaction, config, ticketState, ctx.saveConfig, ctx.saveTicketState);
      }

      // Setup wizard modals
      if (customId.startsWith('setup:modal:')) {
        return setupHandler.handleModal(interaction, config, ctx.saveConfig);
      }
    }

  } catch (e) {
    const interactionAge = Date.now() - interaction.createdTimestamp;
    logger.error(interaction.guildId, `Unhandled interaction error (ref ${ref}, age ${interactionAge}ms)`, e);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: `Something went wrong. Reference: ${ref}`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: `Something went wrong. Reference: ${ref}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (_) {
      // ignore secondary failures
    }
  }
});

// Graceful shutdown handlers
async function gracefulShutdown(signal) {
  logger.info(null, `${signal} received — flushing write queues`);
  try {
    await getConfigWriteQueue();
    await getTicketWriteQueue();
    logger.info(null, 'Write queues flushed');

    // Properly close the WebSocket connection
    client.destroy();
    logger.info(null, 'Client destroyed, exiting');
  } catch (e) {
    logger.error(null, 'Error during shutdown', e);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

client.login(process.env.DISCORD_TOKEN);
