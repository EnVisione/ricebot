const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { getGuildConfig } = require('../utils/config');
const { getGuildTickets } = require('../utils/ticketState');
const { buildOpenOverwrites } = require('./ticketPermissions');
const { resolveVariables, padTicketNumber } = require('../utils/variables');

async function escalateTicket(interaction, targetName, reason, config, ticketState, saveConfig, saveTicketState) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const guildId = guild.id;
  const member = interaction.member;

  const guildTickets = getGuildTickets(ticketState, guildId);
  const ticketData = guildTickets[channel.id];

  if (!ticketData) {
    return { success: false, error: 'This channel is not a ticket.' };
  }

  if (ticketData.state === 'closed') {
    return { success: false, error: 'Cannot escalate a closed ticket.' };
  }

  const guildConfig = getGuildConfig(config, guildId, guild.name);
  const currentPanel = guildConfig.panels?.[ticketData.panelId];

  if (!currentPanel) {
    return { success: false, error: 'Current panel config not found.' };
  }

  // Find escalation target
  const targets = currentPanel.escalationOptions?.targets || [];
  const target = targets.find((t) => t.name.toLowerCase() === targetName.toLowerCase());

  if (!target) {
    return { success: false, error: `Escalation target "${targetName}" not found. Available: ${targets.map((t) => t.name).join(', ') || 'none'}` };
  }

  const targetPanel = guildConfig.panels?.[target.panelId];
  if (!targetPanel) {
    return { success: false, error: `Target panel "${target.panelId}" not found.` };
  }

  // Move to target category
  if (target.categoryId) {
    try {
      await channel.setParent(target.categoryId, { reason: `Escalated by ${member.user.tag}` });
    } catch (e) {
      logger.warn(guildId, `Failed to move channel to category: ${e.message}`);
    }
  }

  // Fetch opener
  let openerMember;
  try {
    openerMember = await guild.members.fetch(ticketData.openedBy);
  } catch {
    openerMember = null;
  }

  // Update permissions for new panel
  if (openerMember) {
    const newOverwrites = buildOpenOverwrites(targetPanel, openerMember, guild);
    try {
      await channel.permissionOverwrites.set(newOverwrites, 'Escalated to new panel');
    } catch (e) {
      logger.warn(guildId, `Failed to set new permissions: ${e.message}`);
    }
  }

  // Update ticket state
  ticketData.escalatedFrom = ticketData.panelId;
  ticketData.panelId = target.panelId;
  ticketData.panelName = targetPanel.name;
  ticketData.escalatedTo = target.panelId;
  saveTicketState();

  // Rename if different pattern
  const ctx = {
    number: padTicketNumber(ticketData.number),
    rawNumber: String(ticketData.number),
    panelName: targetPanel.name,
  };
  const newName = resolveVariables(targetPanel.ticketOptions?.openedNamePattern || 'ticket-{number}', ctx)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 100);

  try {
    await channel.setName(newName, 'Escalated');
  } catch (e) {
    logger.warn(guildId, `Failed to rename on escalate: ${e.message}`);
  }

  // Send escalation embed
  const escalateEmbed = new EmbedBuilder()
    .setColor(0xf57f17)
    .setTitle('⬆️ Ticket Escalated')
    .setDescription(`This ticket has been escalated to **${targetPanel.name}**.`)
    .addFields(
      { name: 'Escalated By', value: `<@${member.id}>`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: true }
    )
    .setTimestamp();

  // Ping new support role
  let pingContent = '';
  if (target.supportRoleId) {
    pingContent = `<@&${target.supportRoleId}>`;
  } else {
    for (const rid of targetPanel.supportRoles || []) {
      pingContent += `<@&${rid}> `;
    }
  }

  await channel.send({ content: pingContent.trim() || undefined, embeds: [escalateEmbed] });

  // Log in old panel's log channel
  if (currentPanel.logOptions?.channelId && currentPanel.logOptions?.logEscalate) {
    try {
      const logChannel = guild.channels.cache.get(currentPanel.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xf57f17)
          .setTitle('⬆️ Ticket Escalated')
          .addFields(
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
            { name: 'From', value: currentPanel.name, inline: true },
            { name: 'To', value: targetPanel.name, inline: true },
            { name: 'Escalated By', value: `<@${member.id}>`, inline: true },
            { name: 'Reason', value: reason || 'None', inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      logger.warn(guildId, `Failed to send escalate log: ${e.message}`);
    }
  }

  // Log in new panel's log channel
  if (targetPanel.logOptions?.channelId && targetPanel.logOptions?.logEscalate) {
    try {
      const logChannel = guild.channels.cache.get(targetPanel.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xf57f17)
          .setTitle('⬆️ Ticket Received (Escalated)')
          .addFields(
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
            { name: 'From', value: currentPanel.name, inline: true },
            { name: 'Escalated By', value: `<@${member.id}>`, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      logger.warn(guildId, `Failed to send escalate log to new panel: ${e.message}`);
    }
  }

  return { success: true };
}

module.exports = {
  escalateTicket,
};

