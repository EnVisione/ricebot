const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unclaim')
    .setDescription('Unclaim the current ticket.'),
  folder: 'ticket',

  async execute(interaction, { config, ticketState, saveTicketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const guild = interaction.guild;
    const member = interaction.member;

    const guildTickets = getGuildTickets(ticketState, guildId);
    const ticketData = guildTickets[channel.id];

    if (!ticketData) {
      return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    const guildConfig = getGuildConfig(config, guildId, guild.name);
    const panelConfig = guildConfig.panels?.[ticketData.panelId];

    if (!panelConfig) {
      return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'Panel config not found.')], flags: MessageFlags.Ephemeral });
    }

    if (!ticketData.claimedBy) {
      return interaction.reply({ embeds: [embedBuilder.error('Not Claimed', 'This ticket is not claimed.')], flags: MessageFlags.Ephemeral });
    }

    const isAdmin = member.permissions.has('Administrator');
    const isClaimer = ticketData.claimedBy === member.id;

    if (!isClaimer && !isAdmin) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only the claimer or an admin can unclaim.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Restore perms if they were modified
    if (panelConfig.claimingOptions?.removeOthersSendOnClaim) {
      for (const rid of panelConfig.supportRoles || []) {
        const role = guild.roles.cache.get(rid);
        if (role) {
          for (const [, m] of role.members) {
            await channel.permissionOverwrites.edit(m.id, { SendMessages: true, ViewChannel: true }, { reason: 'Ticket unclaimed' }).catch(() => {});
          }
        }
      }
    }

    ticketData.claimedBy = null;
    ticketData.claimedAt = null;
    saveTicketState();

    await channel.send({ embeds: [embedBuilder.info('Ticket Unclaimed', `This ticket was unclaimed by <@${member.id}>.`)] });

    await interaction.editReply({ embeds: [embedBuilder.success('Unclaimed', 'The ticket has been unclaimed.')] });
  },
};

