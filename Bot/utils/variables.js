function padTicketNumber(n) {
  return String(n).padStart(4, '0');
}

function formatUTCDate(d) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatUTCTime(d) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatUTCDateTime(d) {
  return `${formatUTCDate(d)} ${formatUTCTime(d)}`;
}

// Format milliseconds to human-readable duration like "2h 14m"
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

// Build full context object from available data
function buildContext(options = {}) {
  const now = new Date();
  const ctx = {};

  // User info
  if (options.user) {
    ctx.username = options.user.username;
    ctx.usertag = options.user.tag || `${options.user.username}#0`;
    ctx.userid = options.user.id;
    ctx.usermention = `<@${options.user.id}>`;
  }

  // Ticket number
  if (options.number !== undefined) {
    ctx.number = padTicketNumber(options.number);
    ctx.rawNumber = String(options.number);
  }

  // Panel/guild info
  if (options.panelName) ctx.panelName = options.panelName;
  if (options.guildName) ctx.guildName = options.guildName;
  if (options.guildId) ctx.guildId = options.guildId;

  // Channel info (post-creation)
  if (options.channel) {
    ctx.channelName = options.channel.name;
    ctx.channelId = options.channel.id;
    ctx.channelMention = `<#${options.channel.id}>`;
  }

  // Time variables
  ctx.date = formatUTCDate(now);
  ctx.time = formatUTCTime(now);
  ctx.datetime = formatUTCDateTime(now);
  ctx.timestamp = `<t:${Math.floor(now.getTime() / 1000)}:F>`;

  // Claimer
  if (options.claimer) {
    ctx.claimer = options.claimer.username || options.claimer;
    ctx.claimermention = options.claimer.id ? `<@${options.claimer.id}>` : ctx.claimer;
  }

  // Closer
  if (options.closer) {
    ctx.closer = options.closer.username || options.closer;
    ctx.closermention = options.closer.id ? `<@${options.closer.id}>` : ctx.closer;
  }

  // Duration (for close messages/logs)
  if (options.openedAt) {
    const durationMs = now.getTime() - options.openedAt;
    ctx.duration = formatDuration(durationMs);
    ctx.openedAt = `<t:${Math.floor(options.openedAt / 1000)}:F>`;
  }

  // Time remaining (for auto-close warning)
  if (options.remainingMs !== undefined) {
    ctx.time = formatDuration(options.remainingMs);
  }

  return ctx;
}

function resolveVariables(template, context) {
  if (!template || typeof template !== 'string') return template;
  // Unknown variables are left as-is (not stripped)
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key) && context[key] !== undefined && context[key] !== null) {
      return String(context[key]);
    }
    return match; // Leave unknown variables as {variable}
  });
}

module.exports = {
  padTicketNumber,
  formatUTCDate,
  formatUTCTime,
  formatUTCDateTime,
  formatDuration,
  buildContext,
  resolveVariables,
};
