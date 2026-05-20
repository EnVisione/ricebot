const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const { closeTicket } = require('../../tickets/ticketService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket.'),
  folder: 'ticket',

  async execute(interaction, { config, ticketState, saveConfig, saveTicketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const guildTickets = getGuildTickets(ticketState, guildId);
    const ticketData = guildTickets[channel.id];

    if (!ticketData) {
      return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    if (ticketData.state === 'closed') {
      return interaction.reply({ embeds: [embedBuilder.error('Already Closed', 'This ticket is already closed.')], flags: MessageFlags.Ephemeral });
    }

    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const panelConfig = guildConfig.panels?.[ticketData.panelId];

    if (!panelConfig) {
      return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'The panel configuration no longer exists.')], flags: MessageFlags.Ephemeral });
    }

    // Permission check
    const member = interaction.member;
    const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
    const isOpener = ticketData.openedBy === member.id;
    const isAdmin = member.permissions.has('Administrator');

    if (!isSupport && !isOpener && !isAdmin) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'You don\'t have permission to close this ticket.')], flags: MessageFlags.Ephemeral });
    }

    // Claimer check
    if (panelConfig.claimingOptions?.onlyClaimerCanClose && ticketData.claimedBy && ticketData.claimedBy !== member.id && !isAdmin) {
      return interaction.reply({
        embeds: [embedBuilder.error('Claimer Only', `Only the claimer (<@${ticketData.claimedBy}>) can close this ticket.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await closeTicket(channel, member, guildConfig, panelConfig, ticketData, ticketState, saveTicketState, saveConfig);

    if (result.success) {
      await interaction.editReply({ embeds: [embedBuilder.success('Ticket Closed', 'The ticket has been closed.')] });
    } else {
      await interaction.editReply({ embeds: [embedBuilder.error('Close Failed', result.error || 'Unknown error')] });
    }
  },
};

