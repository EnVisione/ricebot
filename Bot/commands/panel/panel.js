const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig, saveConfig } = require('../../utils/config');
const { buildTicketPanelEmbed, buildTicketPanelComponents } = require('../../tickets/ticketPanelBuilder');
const { buildRRPanel } = require('../../reactionroles/rrBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post a ticket or reaction roles panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  folder: 'panel',

  async execute(interaction, { config }) {
    const guildId = interaction.guildId;
    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);

    const panelIds = Object.keys(guildConfig.panels || {});
    const hasTicketPanels = panelIds.length > 0;
    const hasRRRoles = (guildConfig.reactionRoles?.roles?.length || 0) > 0;

    const options = [];

    if (hasTicketPanels) {
      options.push({
        label: 'Ticket Panel',
        value: 'ticket',
        description: `${panelIds.length} panel(s) configured`,
        emoji: '🎫',
      });
    } else {
      options.push({
        label: 'Ticket Panel (Not Configured)',
        value: 'ticket_disabled',
        description: 'Use /ticketadmin create-panel first',
        emoji: '❌',
      });
    }

    if (hasRRRoles) {
      options.push({
        label: 'Reaction Roles Panel',
        value: 'rr',
        description: `${guildConfig.reactionRoles.roles.length} role(s) configured`,
        emoji: '🎭',
      });
    } else {
      options.push({
        label: 'Reaction Roles (Not Configured)',
        value: 'rr_disabled',
        description: 'Use /rradmin add-role first',
        emoji: '❌',
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`panel:select:${guildId}`)
      .setPlaceholder('Select panel type to post...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      embeds: [embedBuilder.info('Post Panel', 'Select which panel type you want to post in this channel.')],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};

