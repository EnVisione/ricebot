function isHexColor(str) {
  if (typeof str !== 'string') return false;
  // Accept #RRGGBB or #RGB
  return /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(str);
}

function parseHexColor(str) {
  if (!isHexColor(str)) return null;
  let s = str.startsWith('#') ? str.slice(1) : str;
  // Expand #RGB to #RRGGBB
  if (s.length === 3) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  return parseInt(s, 16);
}

function isValidUrl(str) {
  if (!str) return false;
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Sanitize channel name for Discord requirements
function sanitizeChannelName(str, fallback = 'ticket') {
  if (!str) return fallback;
  const sanitized = str
    .toLowerCase()
    .replace(/\s+/g, '-')           // spaces to dashes
    .replace(/[^a-z0-9-_]/g, '')    // strip invalid chars (removes non-ASCII)
    .replace(/-+/g, '-')            // collapse multiple dashes
    .replace(/^-|-$/g, '')          // trim leading/trailing dashes
    .slice(0, 100);                 // max 100 chars

  // If sanitized result is empty (all non-ASCII chars), use fallback
  return sanitized || fallback;
}

// Check for unknown variables in template
function validateVariableTemplate(str) {
  const knownVars = new Set([
    'username', 'usertag', 'userid', 'usermention',
    'number', 'rawNumber',
    'panelName', 'guildName', 'guildId',
    'channelName', 'channelId', 'channelMention',
    'date', 'time', 'datetime', 'timestamp',
    'claimer', 'claimermention', 'closer', 'closermention',
    'duration', 'openedAt',
  ]);

  const matches = str.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  const unknown = [];

  for (const match of matches) {
    const varName = match.slice(1, -1);
    if (!knownVars.has(varName)) {
      unknown.push(varName);
    }
  }

  return { valid: unknown.length === 0, unknownVars: unknown };
}

// Validate snowflake ID format
function isValidSnowflake(str) {
  return /^\d{17,20}$/.test(str);
}

// Parse emoji from string (handles both custom and unicode)
function parseEmoji(str) {
  if (!str) return null;

  // Custom emoji: <:name:id> or <a:name:id>
  const customMatch = str.match(/^<(a)?:(\w+):(\d+)>$/);
  if (customMatch) {
    return {
      animated: !!customMatch[1],
      name: customMatch[2],
      id: customMatch[3],
      isCustom: true,
    };
  }

  // Unicode emoji - just return as-is
  if (str.length <= 8) {
    return {
      name: str,
      id: null,
      isCustom: false,
    };
  }

  return null;
}

// Decode snowflake to timestamp
function snowflakeToTimestamp(snowflake) {
  try {
    const timestamp = Number((BigInt(snowflake) >> 22n) + 1420070400000n);
    return new Date(timestamp);
  } catch {
    return null;
  }
}

module.exports = {
  isHexColor,
  parseHexColor,
  isValidUrl,
  sanitizeChannelName,
  validateVariableTemplate,
  isValidSnowflake,
  parseEmoji,
  snowflakeToTimestamp,
};
