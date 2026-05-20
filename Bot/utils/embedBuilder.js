const { EmbedBuilder } = require('discord.js');
const { resolveVariables, buildContext } = require('./variables');

const COLORS = {
  success: 0x57f287,
  error: 0xed4245,
  info: 0x5865f2,
  warning: 0xfee75c,
  logBase: 0x2b2d31,
  // Log event colors
  open: 0x57f287,    // green
  close: 0xed4245,   // red
  claim: 0x5865f2,   // blue
  delete: 0x95a5a6,  // grey
  escalate: 0xe67e22, // orange
  rename: 0x9b59b6,  // purple
  addRemove: 0xfee75c, // yellow
};

function base() {
  return new EmbedBuilder().setTimestamp(new Date());
}

function success(title, description) {
  return base().setColor(COLORS.success).setTitle(`✅ ${title}`).setDescription(description || null);
}

function error(title, description) {
  return base().setColor(COLORS.error).setTitle(`❌ ${title}`).setDescription(description || null);
}

function info(title, description) {
  return base().setColor(COLORS.info).setTitle(`ℹ️ ${title}`).setDescription(description || null);
}

function warning(title, description) {
  return base().setColor(COLORS.warning).setTitle(`⚠️ ${title}`).setDescription(description || null);
}

// Log embed with event-based coloring
function log(event, fields = []) {
  const eventTitles = {
    open: '🎫 Ticket Opened',
    close: '🔒 Ticket Closed',
    claim: '🙋 Ticket Claimed',
    unclaim: '👤 Ticket Unclaimed',
    delete: '🗑️ Ticket Deleted',
    escalate: '📤 Ticket Escalated',
    rename: '✏️ Ticket Renamed',
    add: '➕ User/Role Added',
    remove: '➖ User/Role Removed',
    reopen: '🔓 Ticket Reopened',
  };

  const color = COLORS[event] || COLORS.logBase;
  const title = eventTitles[event] || `📋 ${event}`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp(new Date());

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

// Ticket opening embed - built entirely from config
function ticket(panelConfig, ticketData, opener) {
  const to = panelConfig.ticketOptions || {};

  const ctx = buildContext({
    user: opener,
    number: ticketData.number,
    panelName: panelConfig.name,
    guildName: ticketData.guildName,
    guildId: ticketData.guildId,
  });

  const title = resolveVariables(to.openMessageEmbedTitle || 'Ticket #{number}', ctx);
  const description = resolveVariables(to.openMessage || 'Support will be with you shortly.', ctx);
  const color = to.openMessageEmbedColor || 0x5865f2;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: `Panel: ${panelConfig.name}` });

  // Add opener info
  embed.addFields({ name: 'Opened By', value: `<@${opener.id}>`, inline: true });

  return embed;
}

// Ticket closed embed
function ticketClosed(panelConfig, ticketData, closedBy) {
  const ctx = buildContext({
    user: closedBy,
    closer: closedBy,
    number: ticketData.number,
    panelName: panelConfig.name,
    openedAt: ticketData.openedAt,
  });

  return new EmbedBuilder()
    .setColor(COLORS.close)
    .setTitle('🔒 Ticket Closed')
    .setDescription(`This ticket has been closed by <@${closedBy.id}>.`)
    .addFields(
      { name: 'Duration', value: ctx.duration || 'N/A', inline: true },
      { name: 'Opened At', value: ctx.openedAt || 'N/A', inline: true }
    )
    .setTimestamp(new Date());
}

// Transcript header embed
function transcriptHeader(ticketData, panelConfig) {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`📜 Transcript: ${ticketData.ticketId}`)
    .addFields(
      { name: 'Panel', value: panelConfig.name, inline: true },
      { name: 'Opened By', value: `<@${ticketData.openedBy}>`, inline: true },
      { name: 'Closed By', value: ticketData.closedBy ? `<@${ticketData.closedBy}>` : 'N/A', inline: true }
    )
    .setTimestamp(new Date());
}

module.exports = {
  COLORS,
  base,
  success,
  error,
  info,
  warning,
  log,
  ticket,
  ticketClosed,
  transcriptHeader,
};
