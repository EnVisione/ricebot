const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const { resolveVariables } = require('../../utils/variables');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim the current ticket.')
    .addUserOption((opt) => opt.setName('user').setDescription('User to claim on behalf of (defaults to you)')),
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

    if (ticketData.state === 'closed') {
      return interaction.reply({ embeds: [embedBuilder.error('Ticket Closed', 'Cannot claim a closed ticket.')], flags: MessageFlags.Ephemeral });
    }

    const guildConfig = getGuildConfig(config, guildId, guild.name);
    const panelConfig = guildConfig.panels?.[ticketData.panelId];

    if (!panelConfig) {
      return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'Panel config not found.')], flags: MessageFlags.Ephemeral });
    }

    if (!panelConfig.claimingOptions?.enabled) {
      return interaction.reply({ embeds: [embedBuilder.error('Claiming Disabled', 'Claiming is not enabled for this panel.')], flags: MessageFlags.Ephemeral });
    }

    // Caller must be support/admin to claim
    const callerIsSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
    const callerIsAdmin = member.permissions.has('Administrator');
    if (!callerIsSupport && !callerIsAdmin) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'You must be a support member to use this command.')], flags: MessageFlags.Ephemeral });
    }

    // Already claimed?
    if (ticketData.claimedBy) {
      if (!panelConfig.claimingOptions.overwriteExisting) {
        return interaction.reply({
          embeds: [embedBuilder.error('Already Claimed', `This ticket is already claimed by <@${ticketData.claimedBy}>.`)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // Defer reply BEFORE any async operations
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Target user - now safe to do async work
    const targetUser = interaction.options.getUser('user') || interaction.user;
    let targetMember;
    try {
      targetMember = await guild.members.fetch(targetUser.id);
    } catch {
      return interaction.editReply({ embeds: [embedBuilder.error('User Not Found', 'Could not fetch that user.')] });
    }

    // Check if target is support
    const isSupport = (panelConfig.supportRoles || []).some((rid) => targetMember.roles.cache.has(rid));
    const isAdmin = targetMember.permissions.has('Administrator');

    if (!isSupport && !isAdmin) {
      return interaction.editReply({ embeds: [embedBuilder.error('Not Support', 'Only support team members can claim tickets.')] });
    }

    ticketData.claimedBy = targetMember.id;
    ticketData.claimedAt = Date.now();
    saveTicketState();

    // If removeOthersSendOnClaim, update perms
    if (panelConfig.claimingOptions.removeOthersSendOnClaim) {
      for (const rid of panelConfig.supportRoles || []) {
        const role = guild.roles.cache.get(rid);
        if (role) {
          for (const [, m] of role.members) {
            if (m.id !== targetMember.id) {
              await channel.permissionOverwrites.edit(m.id, { SendMessages: false }, { reason: 'Ticket claimed' }).catch(() => {});
            }
          }
        }
      }
      await channel.permissionOverwrites.edit(targetMember.id, { SendMessages: true, ViewChannel: true }, { reason: 'Claimer' }).catch(() => {});
    }

    // Send claimed message
    const ctx = { claimer: targetMember.user.username };
    const claimedMsg = resolveVariables(panelConfig.claimingOptions.claimedMessage || 'This ticket has been claimed by {claimer}.', ctx);
    await channel.send({ embeds: [embedBuilder.info('Ticket Claimed', claimedMsg.replace('{claimer}', `<@${targetMember.id}>`))] });

    // Log
    if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logClaim) {
      const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🙋 Ticket Claimed')
          .addFields(
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
            { name: 'Claimed By', value: `<@${targetMember.id}>`, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    }

    await interaction.editReply({ embeds: [embedBuilder.success('Claimed', `Ticket claimed by <@${targetMember.id}>.`)] });
  },
};
