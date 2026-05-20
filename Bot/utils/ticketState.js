const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

const TICKETS_PATH = path.join(__dirname, '..', 'tickets.json');

function loadTicketState() {
  try {
    if (!fs.existsSync(TICKETS_PATH)) return {};
    return JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
  } catch (e) {
    logger.error(null, 'Failed to load tickets.json', e);
    return {};
  }
}

// Write queue to prevent race conditions
let writeQueue = Promise.resolve();

// Export writeQueue for graceful shutdown
function getWriteQueue() {
  return writeQueue;
}

function saveTicketState(state) {
  writeQueue = writeQueue.then(() => {
    return new Promise((resolve) => {
      try {
        // Atomic write: write to temp file, then rename
        const tempPath = TICKETS_PATH + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
        fs.renameSync(tempPath, TICKETS_PATH);
      } catch (e) {
        logger.error(null, 'Failed to save tickets.json', e);
      }
      resolve();
    });
  });
}

function getGuildTickets(ticketState, guildId) {
  if (!ticketState[guildId]) ticketState[guildId] = {};
  return ticketState[guildId];
}

// Get a specific ticket, returns null if doesn't exist
function getTicketState(ticketState, guildId, channelId) {
  const guildTickets = getGuildTickets(ticketState, guildId);
  return guildTickets[channelId] || null;
}

// Set/merge ticket data (doesn't overwrite entire record)
function setTicketState(ticketState, guildId, channelId, data) {
  const guildTickets = getGuildTickets(ticketState, guildId);
  if (!guildTickets[channelId]) {
    guildTickets[channelId] = data;
  } else {
    Object.assign(guildTickets[channelId], data);
  }
  return guildTickets[channelId];
}

// Remove a ticket (called on delete)
function removeTicketState(ticketState, guildId, channelId) {
  const guildTickets = getGuildTickets(ticketState, guildId);
  delete guildTickets[channelId];
}

// Count open tickets for a user across ALL panels (for global limit)
function getOpenTicketsByUser(ticketState, guildId, userId) {
  const guildTickets = getGuildTickets(ticketState, guildId);
  return Object.values(guildTickets).filter(
    (t) => t.state === 'open' && t.openedBy === userId
  );
}

// Count open tickets for a user on a SPECIFIC panel (for per-panel limit)
function getOpenTicketsByUserAndPanel(ticketState, guildId, userId, panelId) {
  const guildTickets = getGuildTickets(ticketState, guildId);
  return Object.values(guildTickets).filter(
    (t) => t.state === 'open' && t.openedBy === userId && t.panelId === panelId
  );
}

// Update lastActivityAt - called from messageCreate event
function updateActivity(ticketState, guildId, channelId, saveStateFn) {
  const ticket = getTicketState(ticketState, guildId, channelId);
  if (ticket && ticket.state === 'open') {
    ticket.lastActivityAt = Date.now();
    // Reset warning sent if activity after warning
    if (ticket.warningSent) {
      ticket.warningSent = false;
    }
    if (saveStateFn) saveStateFn();
    return true;
  }
  return false;
}

// Cleanup old closed tickets (default: 30 days)
function cleanupOldTickets(ticketState, maxAgeDays = 30) {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let cleanedCount = 0;

  for (const guildId of Object.keys(ticketState)) {
    const guildTickets = ticketState[guildId];
    for (const channelId of Object.keys(guildTickets)) {
      const ticket = guildTickets[channelId];
      // Only clean up closed tickets
      if (ticket.state === 'closed' && ticket.closedAt) {
        if (now - ticket.closedAt > maxAgeMs) {
          delete guildTickets[channelId];
          cleanedCount++;
        }
      }
    }
    // Remove empty guild entries
    if (Object.keys(guildTickets).length === 0) {
      delete ticketState[guildId];
    }
  }

  return cleanedCount;
}

module.exports = {
  loadTicketState,
  saveTicketState,
  getGuildTickets,
  getTicketState,
  setTicketState,
  removeTicketState,
  getOpenTicketsByUser,
  getOpenTicketsByUserAndPanel,
  updateActivity,
  cleanupOldTickets,
  getWriteQueue,
  TICKETS_PATH,
};
