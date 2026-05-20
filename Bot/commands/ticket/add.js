const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const { permObjectToOverwrite } = require('../../tickets/ticketPermissions');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a user or role to this ticket.')
    .addUserOption((opt) => opt.setName('user').setDescription('User to add'))
    .addRoleOption((opt) => opt.setName('role').setDescription('Role to add')),
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
      return interaction.reply({ embeds: [embedBuilder.error('Missing Option', 'Provide a user or role to add.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    const userPerms = panelConfig.permissionOptions?.user?.opened || { viewChannel: true, sendMessages: true, readMessageHistory: true };
    const permOverwrite = permObjectToOverwrite(userPerms);

    if (targetUser) {
      // Validation
      if (targetUser.id === guild.members.me.id) {
        return interaction.editReply({ embeds: [embedBuilder.error('Invalid', 'Cannot add the bot itself.')] });
      }
      if (targetUser.id === ticketData.openedBy) {
        return interaction.editReply({ embeds: [embedBuilder.error('Invalid', 'This user is already the ticket opener.')] });
      }
      if (ticketData.addedUsers.includes(targetUser.id)) {
        return interaction.editReply({ embeds: [embedBuilder.error('Already Added', 'This user is already in the ticket.')] });
      }

      try {
        await channel.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        }, { reason: `Added by ${member.user.tag}` });

        ticketData.addedUsers.push(targetUser.id);
        saveTicketState();

        await interaction.editReply({ embeds: [embedBuilder.success('User Added', `<@${targetUser.id}> has been added to this ticket.`)] });

        // Log
        if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logAddRemove) {
          const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle('➕ User Added to Ticket')
              .addFields(
                { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
                { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Added By', value: `<@${member.id}>`, inline: true }
              )
              .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
          }
        }
      } catch (e) {
        logger.error(guildId, `Failed to add user: ${e.message}`, e);
        await interaction.editReply({ embeds: [embedBuilder.error('Failed', e.message)] });
      }
    }

    if (targetRole) {
      // Validation
      if (targetRole.id === guild.id) {
        return interaction.editReply({ embeds: [embedBuilder.error('Invalid', 'Cannot add @everyone.')] });
      }
      if (targetRole.managed) {
        return interaction.editReply({ embeds: [embedBuilder.error('Invalid', 'Cannot add managed/bot roles.')] });
      }
      if (ticketData.addedRoles.includes(targetRole.id)) {
        return interaction.editReply({ embeds: [embedBuilder.error('Already Added', 'This role is already in the ticket.')] });
      }

      try {
        await channel.permissionOverwrites.edit(targetRole.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        }, { reason: `Added by ${member.user.tag}` });

        ticketData.addedRoles.push(targetRole.id);
        saveTicketState();

        await interaction.editReply({ embeds: [embedBuilder.success('Role Added', `<@&${targetRole.id}> has been added to this ticket.`)] });

        // Log
        if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logAddRemove) {
          const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle('➕ Role Added to Ticket')
              .addFields(
                { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
                { name: 'Role', value: `<@&${targetRole.id}>`, inline: true },
                { name: 'Added By', value: `<@${member.id}>`, inline: true }
              )
              .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
          }
        }
      } catch (e) {
        logger.error(guildId, `Failed to add role: ${e.message}`, e);
        await interaction.editReply({ embeds: [embedBuilder.error('Failed', e.message)] });
      }
    }
  },
};

