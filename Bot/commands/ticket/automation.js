const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automation')
    .setDescription('Start or stop automations for this ticket.')
    .addStringOption((opt) =>
      opt.setName('action').setDescription('Start or stop').setRequired(true).addChoices(
        { name: 'Start', value: 'start' },
        { name: 'Stop', value: 'stop' }
      )
    ),
  folder: 'ticket',

  async execute(interaction, { config, ticketState, saveTicketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const member = interaction.member;

    const guildTickets = getGuildTickets(ticketState, guildId);
    const ticketData = guildTickets[channel.id];

    if (!ticketData) {
      return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const panelConfig = guildConfig.panels?.[ticketData.panelId];

    if (!panelConfig) {
      return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'Panel config not found.')], flags: MessageFlags.Ephemeral });
    }

    // Only support/admin
    const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
    const isAdmin = member.permissions.has('Administrator');

    if (!isSupport && !isAdmin) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can control automations.')], flags: MessageFlags.Ephemeral });
    }

    const ao = panelConfig.automationOptions;
    if (!ao?.autoCloseEnabled && !ao?.autoMessageEnabled) {
      return interaction.reply({ embeds: [embedBuilder.error('No Automations', 'No automations are configured for this panel.')], flags: MessageFlags.Ephemeral });
    }

    const action = interaction.options.getString('action', true);

    if (action === 'stop') {
      ticketData.automationsPaused = true;
      saveTicketState();

      const desc = [];
      if (ao.autoCloseEnabled) desc.push(`• Auto-close after ${ao.autoCloseHours}h — **PAUSED**`);
      if (ao.autoMessageEnabled) desc.push(`• Auto-message after ${ao.autoMessageDelayMinutes}m — **PAUSED**`);

      return interaction.reply({ embeds: [embedBuilder.success('Automations Stopped', desc.join('\n'))], flags: MessageFlags.Ephemeral });
    } else {
      ticketData.automationsPaused = false;
      saveTicketState();

      const desc = [];
      if (ao.autoCloseEnabled) desc.push(`• Auto-close after ${ao.autoCloseHours}h — **ACTIVE**`);
      if (ao.autoMessageEnabled) desc.push(`• Auto-message after ${ao.autoMessageDelayMinutes}m — **ACTIVE**`);

      return interaction.reply({ embeds: [embedBuilder.success('Automations Started', desc.join('\n'))], flags: MessageFlags.Ephemeral });
    }
  },
};

