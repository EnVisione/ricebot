const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const { escalateTicket } = require('../../tickets/escalateService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('escalate')
    .setDescription('Escalate this ticket to another panel/team.')
    .addStringOption((opt) => opt.setName('target').setDescription('Escalation target name').setRequired(true).setAutocomplete(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason for escalation')),
  folder: 'ticket',

  async autocomplete(interaction, { config }) {
    const guildId = interaction.guildId;
    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const guildTickets = require('../../utils/ticketState').getGuildTickets(require('../../utils/ticketState').loadTicketState(), guildId);
    const ticketData = guildTickets[interaction.channel?.id];

    if (!ticketData) {
      return interaction.respond([]);
    }

    const panelConfig = guildConfig.panels?.[ticketData.panelId];
    if (!panelConfig) {
      return interaction.respond([]);
    }

    const targets = panelConfig.escalationOptions?.targets || [];
    const focused = interaction.options.getFocused().toLowerCase();

    const filtered = targets
      .filter((t) => t.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((t) => ({ name: t.name, value: t.name }));

    await interaction.respond(filtered);
  },

  async execute(interaction, { config, ticketState, saveConfig, saveTicketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const member = interaction.member;

    const guildTickets = getGuildTickets(ticketState, guildId);
    const ticketData = guildTickets[channel.id];

    if (!ticketData) {
      return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    if (ticketData.state === 'closed') {
      return interaction.reply({ embeds: [embedBuilder.error('Ticket Closed', 'Cannot escalate a closed ticket.')], flags: MessageFlags.Ephemeral });
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
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can escalate tickets.')], flags: MessageFlags.Ephemeral });
    }

    const targetName = interaction.options.getString('target', true);
    const reason = interaction.options.getString('reason');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await escalateTicket(interaction, targetName, reason, config, ticketState, saveConfig, saveTicketState);

    if (result.success) {
      await interaction.editReply({ embeds: [embedBuilder.success('Escalated', 'The ticket has been escalated.')] });
    } else {
      await interaction.editReply({ embeds: [embedBuilder.error('Escalation Failed', result.error)] });
    }
  },
};

