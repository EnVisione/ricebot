const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a user or role from this ticket.')
    .addUserOption((opt) => opt.setName('user').setDescription('User to remove'))
    .addRoleOption((opt) => opt.setName('role').setDescription('Role to remove')),
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

    const targetUser = interaction.options.getUser('user');
    const targetRole = interaction.options.getRole('role');

    if (!targetUser && !targetRole) {
      return interaction.reply({ embeds: [embedBuilder.error('Missing Option', 'Provide a user or role to remove.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    if (targetUser) {
      // Warning if removing opener
      const isOpener = targetUser.id === ticketData.openedBy;

      try {
        await channel.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: false,
        }, { reason: `Removed by ${member.user.tag}` });

        // Remove from addedUsers if present
        const idx = ticketData.addedUsers.indexOf(targetUser.id);
        if (idx !== -1) ticketData.addedUsers.splice(idx, 1);
        saveTicketState();

        let msg = `<@${targetUser.id}> has been removed from this ticket.`;
        if (isOpener) msg = `⚠️ **Warning:** You removed the ticket opener. ${msg}`;

        await interaction.editReply({ embeds: [embedBuilder.success('User Removed', msg)] });

        // Log
        if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logAddRemove) {
          const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle('➖ User Removed from Ticket')
              .addFields(
                { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
                { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Removed By', value: `<@${member.id}>`, inline: true }
              )
              .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
          }
        }
      } catch (e) {
        logger.error(guildId, `Failed to remove user: ${e.message}`, e);
        await interaction.editReply({ embeds: [embedBuilder.error('Failed', e.message)] });
      }
    }

    if (targetRole) {
      // Check hierarchy
      const botRole = guild.members.me.roles.highest;
      if (targetRole.position >= botRole.position) {
        return interaction.editReply({ embeds: [embedBuilder.error('Hierarchy Error', 'Bot cannot manage this role (it\'s higher or equal in hierarchy).')] });
      }

      try {
        await channel.permissionOverwrites.edit(targetRole.id, {
          ViewChannel: false,
        }, { reason: `Removed by ${member.user.tag}` });

        // Remove from addedRoles if present
        const idx = ticketData.addedRoles.indexOf(targetRole.id);
        if (idx !== -1) ticketData.addedRoles.splice(idx, 1);
        saveTicketState();

        await interaction.editReply({ embeds: [embedBuilder.success('Role Removed', `<@&${targetRole.id}> has been removed from this ticket.`)] });

        // Log
        if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logAddRemove) {
          const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle('➖ Role Removed from Ticket')
              .addFields(
                { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
                { name: 'Role', value: `<@&${targetRole.id}>`, inline: true },
                { name: 'Removed By', value: `<@${member.id}>`, inline: true }
              )
              .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
          }
        }
      } catch (e) {
        logger.error(guildId, `Failed to remove role: ${e.message}`, e);
        await interaction.editReply({ embeds: [embedBuilder.error('Failed', e.message)] });
      }
    }
  },
};

