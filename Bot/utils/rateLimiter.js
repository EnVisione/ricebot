// In-memory rate limiter with namespaced buckets
// Action keys: 'ticket:open', 'rr:toggle', 'channel:rename'

const buckets = new Map();

function now() {
  return Date.now();
}

// Check rate limit and consume if allowed
// Returns { allowed: bool, remainingMs: number }
function checkRateLimit(userId, actionKey, cooldownMs) {
  const key = `${userId}:${actionKey}`;
  const last = buckets.get(key);
  const t = now();

  if (last && t - last < cooldownMs) {
    return { allowed: false, remainingMs: cooldownMs - (t - last) };
  }

  buckets.set(key, t);
  return { allowed: true, remainingMs: 0 };
}

// Legacy alias for backwards compatibility
function checkAndConsume(key, cooldownMs) {
  const last = buckets.get(key);
  const t = now();
  if (last && t - last < cooldownMs) {
    return { ok: false, remainingMs: cooldownMs - (t - last) };
  }
  buckets.set(key, t);
  return { ok: true, remainingMs: 0 };
}

// Format remaining time for user-facing messages
function formatRemainingTime(remainingMs) {
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${seconds}s`;
}

// Clear all rate limits for a user (e.g., on admin override)
function clearUserLimits(userId) {
  for (const key of buckets.keys()) {
    if (key.startsWith(`${userId}:`)) {
      buckets.delete(key);
    }
  }
}

// Cooldown constants
const COOLDOWNS = {
  TICKET_OPEN: 15000,     // 15 seconds
  RR_TOGGLE: 3000,        // 3 seconds
  CHANNEL_RENAME: 600000, // 10 minutes (Discord's 2 per 10 min limit)
};

module.exports = {
  checkRateLimit,
  checkAndConsume,
  formatRemainingTime,
  clearUserLimits,
  COOLDOWNS,
};
