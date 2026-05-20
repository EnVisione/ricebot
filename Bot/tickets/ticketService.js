const { ChannelType, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { buildOpenOverwrites, buildCloseOverwrites } = require('./ticketPermissions');
const { buildTicketOpenEmbed, buildTicketOpenComponents } = require('./ticketPanelBuilder');
const { resolveVariables, padTicketNumber } = require('../utils/variables');
const { checkAndConsume } = require('../utils/rateLimiter');
const { isBlacklisted } = require('../utils/permissions');
const { getGuildTickets } = require('../utils/ticketState');
const embedBuilder = require('../utils/embedBuilder');

async function createTicket(interaction, panelId, panelConfig, guildConfig, config, ticketState, saveConfig, saveTicketState) {
  const guild = interaction.guild;
  const member = interaction.member;
  const guildId = guild.id;

  // Blacklist check
  if (isBlacklisted(member, guildConfig)) {
    return { success: false, error: 'You are blocked from opening tickets.' };
  }

  const guildTickets = getGuildTickets(ticketState, guildId);
  const to = panelConfig.ticketOptions;

  // Ghost record cleanup: check for open tickets where the channel no longer exists
  const ghostRecords = [];
  for (const [channelId, t] of Object.entries(guildTickets)) {
    if (t.openedBy === member.id && t.state === 'open') {
      const existingChannel = guild.channels.cache.get(channelId);
      if (!existingChannel) {
        // Channel was deleted outside the bot - mark as ghost record
        ghostRecords.push(channelId);
      }
    }
  }
  // Clean up ghost records
  for (const channelId of ghostRecords) {
    delete guildTickets[channelId];
    logger.warn(guildId, `Cleaned up ghost ticket record for deleted channel ${channelId}`);
  }
  if (ghostRecords.length > 0) {
    saveTicketState();
  }

  // Global limit check
  const globalLimit = guildConfig.server?.globalTicketLimit ?? 1;
  let userOpenCount = 0;
  for (const t of Object.values(guildTickets)) {
    if (t.openedBy === member.id && t.state === 'open') userOpenCount++;
  }
  if (userOpenCount >= globalLimit) {
    return { success: false, error: `You already have ${userOpenCount} open ticket(s). Global limit is ${globalLimit}.` };
  }

  // Per-panel limit check
  const panelLimit = to.maxPerUser ?? 1;
  let userPanelCount = 0;
  for (const t of Object.values(guildTickets)) {
    if (t.openedBy === member.id && t.panelId === panelId && t.state === 'open') userPanelCount++;
  }
  if (userPanelCount >= panelLimit) {
    return { success: false, error: `You already have ${userPanelCount} open ticket(s) on this panel. Limit is ${panelLimit}.` };
  }

  // Rate limit check
  const rlKey = `${guildId}:${member.id}:openTicket`;
  const rl = checkAndConsume(rlKey, 15000);
  if (!rl.ok) {
    const secs = Math.ceil(rl.remainingMs / 1000);
    return { success: false, error: `Please wait ${secs} seconds before opening another ticket.` };
  }

  // Category check
  if (!to.categoryId) {
    return { success: false, error: 'No category configured for this panel. Ask an admin to run /ticketadmin set-category.' };
  }

  // Use cache first, then fetch to handle freshly created categories
  let category = guild.channels.cache.get(to.categoryId);
  if (!category) {
    try {
      category = await guild.channels.fetch(to.categoryId);
    } catch {
      category = null;
    }
  }
  if (!category) {
    return { success: false, error: `Category ${to.categoryId} not found.` };
  }

  // Increment counter
  to.ticketCounter = (to.ticketCounter || 0) + 1;
  const ticketNumber = to.ticketCounter;

  const ctx = {
    username: member.user.username,
    usertag: member.user.tag,
    userid: member.user.id,
    number: padTicketNumber(ticketNumber),
    rawNumber: String(ticketNumber),
    panelName: panelConfig.name,
    guildName: guild.name,
    guildId: guild.id,
  };

  const channelName = resolveVariables(to.openedNamePattern || 'ticket-{number}', ctx)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 100);

  // Build permission overwrites
  const overwrites = buildOpenOverwrites(panelConfig, member, guild);

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: to.categoryId,
      permissionOverwrites: overwrites,
      reason: `Ticket opened by ${member.user.tag}`,
    });
  } catch (e) {
    logger.error(guildId, `Failed to create ticket channel: ${e.message}`, e);
    if (e.code === 30013) {
      return { success: false, error: 'Server has reached the 500 channel limit.' };
    }
    return { success: false, error: `Failed to create channel: ${e.message}` };
  }

  // Save ticket state
  const now = Date.now();
  const ticketData = {
    ticketId: channelName,
    number: ticketNumber,
    panelId,
    panelName: panelConfig.name,
    state: 'open',
    openedBy: member.id,
    openedByTag: member.user.tag,
    openedAt: now,
    closedBy: null,
    closedAt: null,
    claimedBy: null,
    claimedAt: null,
    lastActivityAt: now,
    addedUsers: [],
    addedRoles: [],
    escalatedFrom: null,
    escalatedTo: null,
    automationsPaused: false,
    privateThreadId: null,
    renameHistory: [],
    warningSent: false,
    autoMessageSentAt: null,
  };

  guildTickets[channel.id] = ticketData;
  saveTicketState();
  saveConfig();

  // Build and send opening message
  ctx.channelId = channel.id;
  ctx.channelName = channel.name;
  ctx.channelMention = `<#${channel.id}>`;

  const { embed } = buildTicketOpenEmbed(panelConfig, ticketNumber, member, guild.name);
  const components = buildTicketOpenComponents(panelConfig);

  // Mention content
  let mentions = '';
  if (to.mentionUser) mentions += `<@${member.id}> `;
  if (to.mentionSupport) {
    for (const rid of panelConfig.supportRoles || []) {
      mentions += `<@&${rid}> `;
    }
  }
  for (const rid of to.pingRoles || []) {
    mentions += `<@&${rid}> `;
  }

  try {
    await channel.send({ content: mentions.trim() || undefined, embeds: [embed], components });
  } catch (e) {
    logger.error(guildId, `Failed to send opening message: ${e.message}`, e);
  }

  // Private thread
  if (to.privateThread) {
    try {
      const threadName = resolveVariables(to.privateThreadName || 'staff-notes-{number}', ctx);
      const thread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration: 10080,
        type: ChannelType.PrivateThread,
        reason: 'Staff notes thread',
      });
      ticketData.privateThreadId = thread.id;

      if (to.privateThreadAutoAddTeam) {
        for (const rid of panelConfig.supportRoles || []) {
          const role = guild.roles.cache.get(rid);
          if (role) {
            for (const [, m] of role.members) {
              await thread.members.add(m.id).catch(() => {});
            }
          }
        }
      }
      saveTicketState();
    } catch (e) {
      logger.warn(guildId, `Failed to create private thread: ${e.message}`);
    }
  }

  // Apply opened roles
  try {
    for (const rid of to.openedRolesAdd || []) {
      await member.roles.add(rid, 'Ticket opened').catch(() => {});
    }
    for (const rid of to.openedRolesRemove || []) {
      await member.roles.remove(rid, 'Ticket opened').catch(() => {});
    }
  } catch (e) {
    logger.warn(guildId, `Failed to modify opener roles: ${e.message}`);
  }

  // Log
  if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logOpen) {
    try {
      const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🎫 Ticket Opened')
          .addFields(
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
            { name: 'Opened By', value: `<@${member.id}>`, inline: true },
            { name: 'Panel', value: panelConfig.name, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      logger.warn(guildId, `Failed to send log: ${e.message}`);
    }
  }

  return { success: true, channel };
}

/**
 * Create a ticket with form data (category, issue type, description)
 */
async function createTicketWithForm(interaction, panelId, panelConfig, guildConfig, config, ticketState, saveConfig, saveTicketState, formData) {
  const guild = interaction.guild;
  const member = interaction.member;
  const guildId = guild.id;

  // Blacklist check
  if (isBlacklisted(member, guildConfig)) {
    return { success: false, error: 'You are blocked from opening tickets.' };
  }

  const guildTickets = getGuildTickets(ticketState, guildId);
  const to = panelConfig.ticketOptions;

  // Ghost record cleanup
  const ghostRecords = [];
  for (const [channelId, t] of Object.entries(guildTickets)) {
    if (t.openedBy === member.id && t.state === 'open') {
      const existingChannel = guild.channels.cache.get(channelId);
      if (!existingChannel) {
        ghostRecords.push(channelId);
      }
    }
  }
  for (const channelId of ghostRecords) {
    delete guildTickets[channelId];
    logger.warn(guildId, `Cleaned up ghost ticket record for deleted channel ${channelId}`);
  }
  if (ghostRecords.length > 0) {
    saveTicketState();
  }

  // Global limit check
  const globalLimit = guildConfig.server?.globalTicketLimit ?? 3;
  let userOpenCount = 0;
  for (const t of Object.values(guildTickets)) {
    if (t.openedBy === member.id && t.state === 'open') userOpenCount++;
  }
  if (userOpenCount >= globalLimit) {
    return { success: false, error: `You already have ${userOpenCount} open ticket(s). Maximum is ${globalLimit}.` };
  }

  // Per-panel limit check
  const panelLimit = to.maxPerUser ?? 3;
  let userPanelCount = 0;
  for (const t of Object.values(guildTickets)) {
    if (t.openedBy === member.id && t.panelId === panelId && t.state === 'open') userPanelCount++;
  }
  if (userPanelCount >= panelLimit) {
    return { success: false, error: `You already have ${userPanelCount} open ticket(s) on this panel. Limit is ${panelLimit}.` };
  }

  // Rate limit check
  const rlKey = `${guildId}:${member.id}:openTicket`;
  const rl = checkAndConsume(rlKey, 15000);
  if (!rl.ok) {
    const secs = Math.ceil(rl.remainingMs / 1000);
    return { success: false, error: `Please wait ${secs} seconds before opening another ticket.` };
  }

  // Category check
  if (!to.categoryId) {
    return { success: false, error: 'No category configured for this panel. Ask an admin to run /ticketadmin panel category.' };
  }

  let category = guild.channels.cache.get(to.categoryId);
  if (!category) {
    try {
      category = await guild.channels.fetch(to.categoryId);
    } catch {
      category = null;
    }
  }
  if (!category) {
    return { success: false, error: `Category ${to.categoryId} not found.` };
  }

  // Increment counter
  to.ticketCounter = (to.ticketCounter || 0) + 1;
  const ticketNumber = to.ticketCounter;

  // Get labels for category and issue
  const ticketForm = panelConfig.ticketForm || {};
  const categoryLabel = formData.category
    ? (ticketForm.categories?.find(c => c.value === formData.category)?.label || formData.category)
    : 'general';
  const issueLabel = formData.issueType
    ? (ticketForm.issueTypes?.find(i => i.value === formData.issueType)?.label || formData.issueType)
    : 'support';

  const ctx = {
    username: member.user.username,
    usertag: member.user.tag,
    userid: member.user.id,
    number: padTicketNumber(ticketNumber),
    rawNumber: String(ticketNumber),
    panelName: panelConfig.name,
    guildName: guild.name,
    guildId: guild.id,
    category: categoryLabel.toLowerCase().replace(/\s+/g, '-'),
    issue: issueLabel.toLowerCase().replace(/\s+/g, '-'),
    description: formData.description || '',
  };

  // Build channel name with new pattern
  // Discord channel names support certain Unicode characters including ✅ and ❌
  let channelName = resolveVariables(to.openedNamePattern || '✅┃{username}-{category}-{issue}', ctx);

  // Sanitize channel name (allow alphanumeric, hyphens, underscores, and specific Unicode)
  channelName = channelName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_✅❌┃]/g, '')
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .slice(0, 100);

  // Build permission overwrites
  const overwrites = buildOpenOverwrites(panelConfig, member, guild);

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: to.categoryId,
      permissionOverwrites: overwrites,
      reason: `Ticket opened by ${member.user.tag} - ${categoryLabel}/${issueLabel}`,
    });
  } catch (e) {
    logger.error(guildId, `Failed to create ticket channel: ${e.message}`, e);
    if (e.code === 30013) {
      return { success: false, error: 'Server has reached the 500 channel limit.' };
    }
    return { success: false, error: `Failed to create channel: ${e.message}` };
  }

  // Save ticket state with form data
  const now = Date.now();
  const ticketData = {
    ticketId: channelName,
    number: ticketNumber,
    panelId,
    panelName: panelConfig.name,
    state: 'open',
    openedBy: member.id,
    openedByTag: member.user.tag,
    openedAt: now,
    closedBy: null,
    closedAt: null,
    claimedBy: null,
    claimedAt: null,
    lastActivityAt: now,
    addedUsers: [],
    addedRoles: [],
    escalatedFrom: null,
    escalatedTo: null,
    automationsPaused: false,
    privateThreadId: null,
    renameHistory: [],
    warningSent: false,
    autoMessageSentAt: null,
    // Form data
    formCategory: formData.category,
    formCategoryLabel: categoryLabel,
    formIssueType: formData.issueType,
    formIssueLabel: issueLabel,
    formDescription: formData.description,
  };

  guildTickets[channel.id] = ticketData;
  saveTicketState();
  saveConfig();

  // Build and send opening message with description
  ctx.channelId = channel.id;
  ctx.channelName = channel.name;
  ctx.channelMention = `<#${channel.id}>`;

  const openMessage = resolveVariables(to.openMessage || '**Issue Description:**\n{description}\n\nThanks for reaching out!', ctx);

  const embed = new EmbedBuilder()
    .setTitle(resolveVariables(to.openMessageEmbedTitle || 'Ticket #{number} - {category}', ctx))
    .setColor(to.openMessageEmbedColor || 0x5865f2)
    .setDescription(openMessage)
    .addFields(
      { name: '📁 Category', value: categoryLabel, inline: true },
      { name: '🏷️ Issue Type', value: issueLabel, inline: true },
      { name: '👤 Opened By', value: `<@${member.id}>`, inline: true }
    )
    .setTimestamp();

  const components = buildTicketOpenComponents(panelConfig);

  // Mention content
  let mentions = '';
  if (to.mentionUser) mentions += `<@${member.id}> `;
  if (to.mentionSupport) {
    for (const rid of panelConfig.supportRoles || []) {
      mentions += `<@&${rid}> `;
    }
  }
  for (const rid of to.pingRoles || []) {
    mentions += `<@&${rid}> `;
  }

  try {
    await channel.send({ content: mentions.trim() || undefined, embeds: [embed], components });
  } catch (e) {
    logger.error(guildId, `Failed to send opening message: ${e.message}`, e);
  }

  // Private thread (same as original)
  if (to.privateThread) {
    try {
      const threadName = resolveVariables(to.privateThreadName || 'staff-notes-{number}', ctx);
      const thread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration: 10080,
        type: ChannelType.PrivateThread,
        reason: 'Staff notes thread',
      });
      ticketData.privateThreadId = thread.id;

      if (to.privateThreadAutoAddTeam) {
        for (const rid of panelConfig.supportRoles || []) {
          const role = guild.roles.cache.get(rid);
          if (role) {
            for (const [, m] of role.members) {
              await thread.members.add(m.id).catch(() => {});
            }
          }
        }
      }
      saveTicketState();
    } catch (e) {
      logger.warn(guildId, `Failed to create private thread: ${e.message}`);
    }
  }

  // Apply opened roles
  try {
    for (const rid of to.openedRolesAdd || []) {
      await member.roles.add(rid, 'Ticket opened').catch(() => {});
    }
    for (const rid of to.openedRolesRemove || []) {
      await member.roles.remove(rid, 'Ticket opened').catch(() => {});
    }
  } catch (e) {
    logger.warn(guildId, `Failed to modify opener roles: ${e.message}`);
  }

  // Log
  if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logOpen) {
    try {
      const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🎫 Ticket Opened')
          .addFields(
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
            { name: 'Opened By', value: `<@${member.id}>`, inline: true },
            { name: 'Panel', value: panelConfig.name, inline: true },
            { name: 'Category', value: categoryLabel, inline: true },
            { name: 'Issue Type', value: issueLabel, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      logger.warn(guildId, `Failed to send log: ${e.message}`);
    }
  }

  return { success: true, channel };
}

async function closeTicket(channel, closedBy, guildConfig, panelConfig, ticketData, ticketState, saveTicketState, saveConfig, options = {}) {
  const guild = channel.guild;
  const guildId = guild.id;
  const to = panelConfig.ticketOptions;

  // Update state
  ticketData.state = 'closed';
  ticketData.closedBy = closedBy.id;
  ticketData.closedAt = Date.now();

  // Get opener info for channel name
  let openerUsername = 'user';
  try {
    const opener = await guild.members.fetch(ticketData.openedBy);
    openerUsername = opener.user.username;
  } catch {
    openerUsername = ticketData.openedByTag?.split('#')[0] || 'user';
  }

  // Rename channel with form data if available
  const ctx = {
    username: openerUsername,
    number: padTicketNumber(ticketData.number),
    rawNumber: String(ticketData.number),
    panelName: panelConfig.name,
    category: ticketData.formCategoryLabel?.toLowerCase().replace(/\s+/g, '-') || 'general',
    issue: ticketData.formIssueLabel?.toLowerCase().replace(/\s+/g, '-') || 'support',
  };

  let closedName = resolveVariables(to.closedNamePattern || '❌┃{username}-{category}-{issue}', ctx);

  // Sanitize channel name (allow alphanumeric, hyphens, underscores, and specific Unicode)
  closedName = closedName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_✅❌┃]/g, '')
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .slice(0, 100);

  // Check rename rate limit (2 per 10 min)
  const now = Date.now();
  const recentRenames = (ticketData.renameHistory || []).filter((r) => now - r.changedAt < 600000);
  if (recentRenames.length < 2) {
    try {
      await channel.setName(closedName, 'Ticket closed');
      ticketData.renameHistory = ticketData.renameHistory || [];
      ticketData.renameHistory.push({ name: closedName, changedBy: closedBy.id, changedAt: now });
    } catch (e) {
      logger.warn(guildId, `Failed to rename ticket on close: ${e.message}`);
    }
  }

  // Fetch opener member
  let openerMember;
  try {
    openerMember = await guild.members.fetch(ticketData.openedBy);
  } catch {
    openerMember = null;
  }

  // Apply closed permissions
  if (openerMember) {
    const overwrites = buildCloseOverwrites(panelConfig, openerMember, guild, ticketData.addedUsers, ticketData.addedRoles);
    try {
      await channel.permissionOverwrites.set(overwrites, 'Ticket closed');
    } catch (e) {
      logger.warn(guildId, `Failed to set closed permissions: ${e.message}`);
    }

    // Apply closed roles
    try {
      for (const rid of to.closedRolesAdd || []) {
        await openerMember.roles.add(rid, 'Ticket closed').catch(() => {});
      }
      for (const rid of to.closedRolesRemove || []) {
        await openerMember.roles.remove(rid, 'Ticket closed').catch(() => {});
      }
    } catch (e) {
      logger.warn(guildId, `Failed to modify opener roles on close: ${e.message}`);
    }
  }

  // Send close embed
  const closeEmbed = embedBuilder.info('Ticket Closed', `This ticket was closed by <@${closedBy.id}>.`);
  closeEmbed.addFields(
    { name: 'Opened By', value: `<@${ticketData.openedBy}>`, inline: true },
    { name: 'Duration', value: formatDuration(ticketData.closedAt - ticketData.openedAt), inline: true }
  );

  const reopenRow = require('discord.js').ActionRowBuilder
    ? new (require('discord.js').ActionRowBuilder)().addComponents(
        new (require('discord.js').ButtonBuilder)()
          .setCustomId('ticket:reopen')
          .setLabel('Reopen')
          .setEmoji('🔓')
          .setStyle(require('discord.js').ButtonStyle.Success),
        new (require('discord.js').ButtonBuilder)()
          .setCustomId('ticket:delete')
          .setLabel('Delete')
          .setEmoji('🗑️')
          .setStyle(require('discord.js').ButtonStyle.Danger)
      )
    : null;

  try {
    await channel.send({ embeds: [closeEmbed], components: reopenRow ? [reopenRow] : [] });
  } catch (e) {
    logger.warn(guildId, `Failed to send close embed: ${e.message}`);
  }

  saveTicketState();

  // Transcript if enabled
  let transcriptAttachment = null;
  if (panelConfig.transcriptOptions?.sendOnClose && !options.skipTranscript) {
    const transcriptService = require('./transcriptService');
    try {
      transcriptAttachment = await transcriptService.sendTranscript(channel, ticketData, panelConfig, guild);
    } catch (e) {
      logger.warn(guildId, `Failed to send transcript on close: ${e.message}`);
    }
  }

  // DM opener transcript if enabled
  if (panelConfig.transcriptOptions?.dmOpenerOnClose && openerMember) {
    try {
      const transcriptService = require('./transcriptService');
      const dm = await openerMember.createDM();

      // Generate transcript for DM if not already generated
      if (!transcriptAttachment) {
        const messages = await transcriptService.fetchMessages(channel, 1000);
        const format = panelConfig.transcriptOptions?.format || 'html';
        const date = new Date().toISOString().slice(0, 10);

        let content;
        let filename;
        if (format === 'txt') {
          content = transcriptService.buildTxtTranscript(messages, ticketData, guild.name);
          filename = `transcript-${ticketData.ticketId}-${date}.txt`;
        } else {
          content = transcriptService.buildHtmlTranscript(messages, ticketData, guild.name);
          filename = `transcript-${ticketData.ticketId}-${date}.html`;
        }

        const { AttachmentBuilder } = require('discord.js');
        transcriptAttachment = new AttachmentBuilder(Buffer.from(content, 'utf8'), { name: filename });
      }

      const dmEmbed = embedBuilder.info(
        '📜 Ticket Closed - Transcript',
        `Your ticket **${ticketData.ticketId}** in **${guild.name}** has been closed.\n\nAttached is a copy of the transcript for your records.`
      );
      dmEmbed.addFields(
        { name: 'Category', value: ticketData.formCategoryLabel || 'General', inline: true },
        { name: 'Issue Type', value: ticketData.formIssueLabel || 'Support', inline: true },
        { name: 'Duration', value: formatDuration(ticketData.closedAt - ticketData.openedAt), inline: true }
      );

      await dm.send({ embeds: [dmEmbed], files: transcriptAttachment ? [transcriptAttachment] : [] });
    } catch (e) {
      logger.warn(guildId, `Failed to DM transcript to opener: ${e.message}`);
    }
  }

  // Log
  if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logClose) {
    try {
      const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🔒 Ticket Closed')
          .addFields(
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
            { name: 'Closed By', value: `<@${closedBy.id}>`, inline: true },
            { name: 'Opened By', value: `<@${ticketData.openedBy}>`, inline: true },
            { name: 'Duration', value: formatDuration(ticketData.closedAt - ticketData.openedAt), inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      logger.warn(guildId, `Failed to send close log: ${e.message}`);
    }
  }

  return { success: true };
}

async function reopenTicket(channel, reopenedBy, guildConfig, panelConfig, ticketData, ticketState, saveTicketState) {
  const guild = channel.guild;
  const guildId = guild.id;
  const to = panelConfig.ticketOptions;

  ticketData.state = 'open';
  ticketData.closedBy = null;
  ticketData.closedAt = null;
  ticketData.lastActivityAt = Date.now();
  ticketData.warningSent = false;

  // Get opener info for channel name
  let openerUsername = 'user';
  try {
    const opener = await guild.members.fetch(ticketData.openedBy);
    openerUsername = opener.user.username;
  } catch {
    openerUsername = ticketData.openedByTag?.split('#')[0] || 'user';
  }

  // Rename back to opened pattern with form data
  const ctx = {
    username: openerUsername,
    number: padTicketNumber(ticketData.number),
    rawNumber: String(ticketData.number),
    panelName: panelConfig.name,
    category: ticketData.formCategoryLabel?.toLowerCase().replace(/\s+/g, '-') || 'general',
    issue: ticketData.formIssueLabel?.toLowerCase().replace(/\s+/g, '-') || 'support',
  };

  let openedName = resolveVariables(to.openedNamePattern || '✅┃{username}-{category}-{issue}', ctx);

  // Sanitize channel name (allow alphanumeric, hyphens, underscores, and specific Unicode)
  openedName = openedName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_✅❌┃]/g, '')
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .slice(0, 100);

  const now = Date.now();
  const recentRenames = (ticketData.renameHistory || []).filter((r) => now - r.changedAt < 600000);
  if (recentRenames.length < 2) {
    try {
      await channel.setName(openedName, 'Ticket reopened');
      ticketData.renameHistory.push({ name: openedName, changedBy: reopenedBy.id, changedAt: now });
    } catch (e) {
      logger.warn(guildId, `Failed to rename ticket on reopen: ${e.message}`);
    }
  }

  // Fetch opener
  let openerMember;
  try {
    openerMember = await guild.members.fetch(ticketData.openedBy);
  } catch {
    openerMember = null;
  }

  // Apply open permissions
  if (openerMember) {
    const overwrites = buildOpenOverwrites(panelConfig, openerMember, guild);
    try {
      await channel.permissionOverwrites.set(overwrites, 'Ticket reopened');
    } catch (e) {
      logger.warn(guildId, `Failed to set open permissions: ${e.message}`);
    }

    // Reverse closed role changes
    try {
      for (const rid of to.closedRolesRemove || []) {
        await openerMember.roles.add(rid, 'Ticket reopened').catch(() => {});
      }
      for (const rid of to.closedRolesAdd || []) {
        await openerMember.roles.remove(rid, 'Ticket reopened').catch(() => {});
      }
    } catch (e) {
      logger.warn(guildId, `Failed to modify opener roles on reopen: ${e.message}`);
    }
  }

  // Send reopen embed
  const reopenEmbed = embedBuilder.success('Ticket Reopened', `This ticket was reopened by <@${reopenedBy.id}>.`);
  try {
    await channel.send({ embeds: [reopenEmbed] });
  } catch (e) {
    logger.warn(guildId, `Failed to send reopen embed: ${e.message}`);
  }

  saveTicketState();

  // Log
  if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logOpen) {
    try {
      const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🔓 Ticket Reopened')
          .addFields(
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
            { name: 'Reopened By', value: `<@${reopenedBy.id}>`, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      logger.warn(guildId, `Failed to send reopen log: ${e.message}`);
    }
  }

  return { success: true };
}

async function deleteTicket(channel, deletedBy, guildConfig, panelConfig, ticketData, ticketState, saveTicketState) {
  const guild = channel.guild;
  const guildId = guild.id;

  // Transcript if enabled
  if (panelConfig.transcriptOptions?.sendOnDelete) {
    const transcriptService = require('./transcriptService');
    await transcriptService.sendTranscript(channel, ticketData, panelConfig, guild).catch((e) => {
      logger.warn(guildId, `Failed to send transcript on delete: ${e.message}`);
    });
  }

  // Log before deletion
  if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logDelete) {
    try {
      const logChannel = guild.channels.cache.get(panelConfig.logOptions.channelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x99aab5)
          .setTitle('🗑️ Ticket Deleted')
          .addFields(
            { name: 'Ticket ID', value: ticketData.ticketId, inline: true },
            { name: 'Deleted By', value: `<@${deletedBy.id}>`, inline: true },
            { name: 'Opened By', value: `<@${ticketData.openedBy}>`, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      logger.warn(guildId, `Failed to send delete log: ${e.message}`);
    }
  }

  // Remove from state
  const guildTickets = getGuildTickets(ticketState, guildId);
  delete guildTickets[channel.id];
  saveTicketState();

  // Delete channel
  try {
    await channel.delete('Ticket deleted');
  } catch (e) {
    if (e.code !== 10003) { // Unknown Channel
      logger.warn(guildId, `Failed to delete channel: ${e.message}`);
    }
  }

  return { success: true };
}

function formatDuration(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

module.exports = {
  createTicket,
  createTicketWithForm,
  closeTicket,
  reopenTicket,
  deleteTicket,
  formatDuration,
};

