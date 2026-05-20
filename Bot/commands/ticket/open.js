const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const { reopenTicket } = require('../../tickets/ticketService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Reopen a closed ticket.'),
  folder: 'ticket',

  async execute(interaction, { config, ticketState, saveConfig, saveTicketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const guildTickets = getGuildTickets(ticketState, guildId);
    const ticketData = guildTickets[channel.id];

    if (!ticketData) {
      return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    if (ticketData.state === 'open') {
      return interaction.reply({ embeds: [embedBuilder.error('Already Open', 'This ticket is already open.')], flags: MessageFlags.Ephemeral });
    }

    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const panelConfig = guildConfig.panels?.[ticketData.panelId];

    if (!panelConfig) {
      return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'The panel configuration no longer exists.')], flags: MessageFlags.Ephemeral });
    }

    // Only support/admin can reopen
    const member = interaction.member;
    const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
    const isAdmin = member.permissions.has('Administrator');

    if (!isSupport && !isAdmin) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can reopen tickets.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await reopenTicket(channel, member, guildConfig, panelConfig, ticketData, ticketState, saveTicketState);

    if (result.success) {
      await interaction.editReply({ embeds: [embedBuilder.success('Ticket Reopened', 'The ticket has been reopened.')] });
    } else {
      await interaction.editReply({ embeds: [embedBuilder.error('Reopen Failed', result.error || 'Unknown error')] });
    }
  },
};

