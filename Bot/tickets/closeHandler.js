const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../utils/embedBuilder');
const { closeTicket, reopenTicket, deleteTicket } = require('./ticketService');
const { getGuildConfig } = require('../utils/config');
const { getGuildTickets } = require('../utils/ticketState');
const logger = require('../utils/logger');

async function handleCloseButton(interaction, config, ticketState, saveConfig, saveTicketState) {
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
    return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'The panel configuration for this ticket no longer exists.')], flags: MessageFlags.Ephemeral });
  }

  // Check permission
  const member = interaction.member;
  const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
  const isOpener = ticketData.openedBy === member.id;
  const isAdmin = member.permissions.has('Administrator');

  if (!isSupport && !isOpener && !isAdmin) {
    return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'You don\'t have permission to close this ticket.')], flags: MessageFlags.Ephemeral });
  }

  // Check if claimer-only close is enabled
  if (panelConfig.claimingOptions?.onlyClaimerCanClose && ticketData.claimedBy && ticketData.claimedBy !== member.id && !isAdmin) {
    return interaction.reply({ embeds: [embedBuilder.error('Claimer Only', `Only the claimer (<@${ticketData.claimedBy}>) can close this ticket.`)], flags: MessageFlags.Ephemeral });
  }

  // Two-step close
  if (panelConfig.ticketOptions?.twoStepClose) {
    const embed = embedBuilder.warning('Confirm Close', panelConfig.ticketOptions.closeAskMessage || 'Are you sure you want to close this ticket?');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:close_confirm').setLabel('Confirm').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:close_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // Direct close
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await closeTicket(channel, member, guildConfig, panelConfig, ticketData, ticketState, saveTicketState, saveConfig);

  if (result.success) {
    await interaction.editReply({ embeds: [embedBuilder.success('Ticket Closed', 'The ticket has been closed.')] });
  } else {
    await interaction.editReply({ embeds: [embedBuilder.error('Close Failed', result.error || 'Unknown error')] });
  }
}

async function handleCloseConfirm(interaction, config, ticketState, saveConfig, saveTicketState) {
  const channel = interaction.channel;
  const guildId = interaction.guildId;
  const guildTickets = getGuildTickets(ticketState, guildId);
  const ticketData = guildTickets[channel.id];

  if (!ticketData || ticketData.state === 'closed') {
    return interaction.reply({ embeds: [embedBuilder.error('Invalid State', 'This ticket is not open.')], flags: MessageFlags.Ephemeral });
  }

  const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
  const panelConfig = guildConfig.panels?.[ticketData.panelId];

  if (!panelConfig) {
    return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'Panel config not found.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Delete the confirm message
  try {
    await interaction.message.delete();
  } catch {}

  const result = await closeTicket(channel, interaction.member, guildConfig, panelConfig, ticketData, ticketState, saveTicketState, saveConfig);

  if (result.success) {
    await interaction.editReply({ embeds: [embedBuilder.success('Ticket Closed', 'The ticket has been closed.')] });
  } else {
    await interaction.editReply({ embeds: [embedBuilder.error('Close Failed', result.error || 'Unknown error')] });
  }
}

async function handleCloseCancel(interaction) {
  try {
    await interaction.message.delete();
  } catch {}
  await interaction.reply({ embeds: [embedBuilder.info('Cancelled', 'Close request cancelled.')], flags: MessageFlags.Ephemeral });
}

async function handleReopenButton(interaction, config, ticketState, saveConfig, saveTicketState) {
  const channel = interaction.channel;
  const guildId = interaction.guildId;
  const guildTickets = getGuildTickets(ticketState, guildId);
  const ticketData = guildTickets[channel.id];

  if (!ticketData) {
    return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
  }

  if (ticketData.state === 'open') {
    return interaction.reply({ embeds: [embedBuilder.error('Already Open', 'This ticket is already open.')], flags: MessageFlags.Ephemeral });
  }

  const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
  const panelConfig = guildConfig.panels?.[ticketData.panelId];

  if (!panelConfig) {
    return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'Panel config not found.')], flags: MessageFlags.Ephemeral });
  }

  // Only support/admin can reopen
  const member = interaction.member;
  const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
  const isAdmin = member.permissions.has('Administrator');

  if (!isSupport && !isAdmin) {
    return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can reopen tickets.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await reopenTicket(channel, member, guildConfig, panelConfig, ticketData, ticketState, saveTicketState);

  if (result.success) {
    await interaction.editReply({ embeds: [embedBuilder.success('Ticket Reopened', 'The ticket has been reopened.')] });
  } else {
    await interaction.editReply({ embeds: [embedBuilder.error('Reopen Failed', result.error || 'Unknown error')] });
  }
}

async function handleDeleteButton(interaction, config, ticketState, saveConfig, saveTicketState) {
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

  // Only support/admin can delete
  const member = interaction.member;
  const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
  const isAdmin = member.permissions.has('Administrator');

  if (!isSupport && !isAdmin) {
    return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can delete tickets.')], flags: MessageFlags.Ephemeral });
  }

  // Confirm deletion
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:delete_confirm').setLabel('Confirm Delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    embeds: [embedBuilder.warning('Confirm Deletion', 'Are you sure you want to **permanently delete** this ticket? This cannot be undone.')],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleDeleteConfirm(interaction, config, ticketState, saveConfig, saveTicketState) {
  const channel = interaction.channel;
  const guildId = interaction.guildId;
  const guildTickets = getGuildTickets(ticketState, guildId);
  const ticketData = guildTickets[channel.id];

  if (!ticketData) {
    return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
  }

  const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
  const panelConfig = guildConfig.panels?.[ticketData.panelId];

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await deleteTicket(channel, interaction.member, guildConfig, panelConfig, ticketData, ticketState, saveTicketState);

  // Can't edit reply since channel will be deleted, but try anyway
  await interaction.editReply({ embeds: [embedBuilder.success('Deleting...', 'The ticket is being deleted.')] }).catch(() => {});
}

async function handleDeleteCancel(interaction) {
  await interaction.update({ embeds: [embedBuilder.info('Cancelled', 'Deletion cancelled.')], components: [] });
}

module.exports = {
  handleCloseButton,
  handleCloseConfirm,
  handleCloseCancel,
  handleReopenButton,
  handleDeleteButton,
  handleDeleteConfirm,
  handleDeleteCancel,
};
