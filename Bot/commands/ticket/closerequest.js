const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('closerequest')
    .setDescription('Send a close request to the ticket opener.'),
  folder: 'ticket',

  async execute(interaction, { config, ticketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const member = interaction.member;

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
      return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'Panel config not found.')], flags: MessageFlags.Ephemeral });
    }

    // Only support/admin can send close request
    const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
    const isAdmin = member.permissions.has('Administrator');

    if (!isSupport && !isAdmin) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can send close requests.')], flags: MessageFlags.Ephemeral });
    }

    const closeAskMsg = panelConfig.ticketOptions?.closeAskMessage || 'Are you sure you want to close this ticket?';

    const embed = embedBuilder.warning('Close Request', closeAskMsg);
    embed.setFooter({ text: `Requested by ${member.user.tag}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:close_confirm').setLabel('Confirm Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:close_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    // Send visible to channel (not ephemeral)
    await channel.send({ content: `<@${ticketData.openedBy}>`, embeds: [embed], components: [row] });

    await interaction.reply({ embeds: [embedBuilder.success('Request Sent', 'Close request has been sent.')], flags: MessageFlags.Ephemeral });
  },
};

