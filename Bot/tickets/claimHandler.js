const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const embedBuilder = require('../utils/embedBuilder');
const { getGuildConfig } = require('../utils/config');
const { getGuildTickets } = require('../utils/ticketState');
const { resolveVariables } = require('../utils/variables');
const logger = require('../utils/logger');

async function handleClaimButton(interaction, config, ticketState, saveConfig, saveTicketState) {
  const channel = interaction.channel;
  const guildId = interaction.guildId;
  const guildTickets = getGuildTickets(ticketState, guildId);
  const ticketData = guildTickets[channel.id];

  if (!ticketData) {
    return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
  }

  if (ticketData.state === 'closed') {
    return interaction.reply({ embeds: [embedBuilder.error('Ticket Closed', 'Cannot claim a closed ticket.')], flags: MessageFlags.Ephemeral });
  }

  const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
  const panelConfig = guildConfig.panels?.[ticketData.panelId];

  if (!panelConfig) {
    return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'Panel config not found.')], flags: MessageFlags.Ephemeral });
  }

  if (!panelConfig.claimingOptions?.enabled) {
    return interaction.reply({ embeds: [embedBuilder.error('Claiming Disabled', 'Claiming is not enabled for this panel.')], flags: MessageFlags.Ephemeral });
  }

  const member = interaction.member;
  const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
  const isAdmin = member.permissions.has('Administrator');

  if (!isSupport && !isAdmin) {
    return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can claim tickets.')], flags: MessageFlags.Ephemeral });
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Update state
  ticketData.claimedBy = member.id;
  ticketData.claimedAt = Date.now();
  saveTicketState();

  // If onlyClaimerCanAct, remove send from other support
  if (panelConfig.claimingOptions.removeOthersSendOnClaim) {
    const guild = interaction.guild;
    for (const rid of panelConfig.supportRoles || []) {
      const role = guild.roles.cache.get(rid);
      if (role) {
        for (const [, m] of role.members) {
          if (m.id !== member.id) {
            await channel.permissionOverwrites.edit(m.id, { SendMessages: false }, { reason: 'Ticket claimed' }).catch(() => {});
          }
        }
      }
    }
    // Ensure claimer can send
    await channel.permissionOverwrites.edit(member.id, { SendMessages: true, ViewChannel: true }, { reason: 'Claimer' }).catch(() => {});
  }

  // Send claimed message
  const ctx = {
    claimer: member.user.username,
    claimermention: `<@${member.id}>`,
  };
  const claimedMsg = resolveVariables(panelConfig.claimingOptions.claimedMessage || 'This ticket has been claimed by {claimer}.', ctx);

  await channel.send({ embeds: [embedBuilder.info('Ticket Claimed', claimedMsg.replace('{claimer}', `<@${member.id}>`))] });
  // Log
  if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logClaim) {
    try {
      const logChannel = interaction.guild.channels.cache.get(panelConfig.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🙋 Ticket Claimed')
          .addFields(
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
            { name: 'Claimed By', value: `<@${member.id}>`, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      logger.warn(guildId, `Failed to send claim log: ${e.message}`);
    }
  }

  await interaction.editReply({ embeds: [embedBuilder.success('Claimed', 'You have claimed this ticket.')] });
}

async function handleUnclaimButton(interaction, config, ticketState, saveConfig, saveTicketState) {
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
    return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'Panel config not found.')], flags: MessageFlags.Ephemeral });
  }

  if (!ticketData.claimedBy) {
    return interaction.reply({ embeds: [embedBuilder.error('Not Claimed', 'This ticket is not claimed.')], flags: MessageFlags.Ephemeral });
  }

  const member = interaction.member;
  const isAdmin = member.permissions.has('Administrator');
  const isClaimer = ticketData.claimedBy === member.id;

  if (!isClaimer && !isAdmin) {
    return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only the claimer or an admin can unclaim.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Restore send perms to support if they were removed
  if (panelConfig.claimingOptions?.removeOthersSendOnClaim) {
    const guild = interaction.guild;
    for (const rid of panelConfig.supportRoles || []) {
      const role = guild.roles.cache.get(rid);
      if (role) {
        for (const [, m] of role.members) {
          await channel.permissionOverwrites.edit(m.id, { SendMessages: true, ViewChannel: true }, { reason: 'Ticket unclaimed' }).catch(() => {});
        }
      }
    }
  }

  const oldClaimer = ticketData.claimedBy;
  ticketData.claimedBy = null;
  ticketData.claimedAt = null;
  saveTicketState();

  await channel.send({ embeds: [embedBuilder.info('Ticket Unclaimed', `This ticket was unclaimed by <@${member.id}>.`)] });

  await interaction.editReply({ embeds: [embedBuilder.success('Unclaimed', 'The ticket has been unclaimed.')] });
}

module.exports = {
  handleClaimButton,
  handleUnclaimButton,
};
