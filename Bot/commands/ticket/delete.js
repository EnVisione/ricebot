const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const { deleteTicket } = require('../../tickets/ticketService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete the current ticket.'),
  folder: 'ticket',

  async execute(interaction, { config, ticketState, saveConfig, saveTicketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const guildTickets = getGuildTickets(ticketState, guildId);
    const ticketData = guildTickets[channel.id];

    if (!ticketData) {
      return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const panelConfig = guildConfig.panels?.[ticketData.panelId];

    if (!panelConfig) {
      return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'The panel configuration no longer exists.')], flags: MessageFlags.Ephemeral });
    }

    // Only support/admin can delete
    const member = interaction.member;
    const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
    const isAdmin = member.permissions.has('Administrator');

    if (!isSupport && !isAdmin) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can delete tickets.')], flags: MessageFlags.Ephemeral });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:delete_confirm').setLabel('Confirm Delete').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [embedBuilder.warning('Confirm Deletion', 'Are you sure you want to **permanently delete** this ticket? This cannot be undone.')],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};

