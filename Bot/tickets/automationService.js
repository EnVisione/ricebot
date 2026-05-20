const logger = require('../utils/logger');
const { loadConfig, saveConfig, getGuildConfig } = require('../utils/config');
const { loadTicketState, saveTicketState, getGuildTickets } = require('../utils/ticketState');
const { closeTicket } = require('./ticketService');
const { resolveVariables } = require('../utils/variables');

let intervalId = null;
let client = null;
let configRef = null;
let ticketStateRef = null;

function startAutomation(discordClient, config, ticketState) {
  client = discordClient;
  configRef = config;
  ticketStateRef = ticketState;

  if (intervalId) clearInterval(intervalId);

  // Run every 5 minutes
  intervalId = setInterval(() => runAutomationCycle(), 5 * 60 * 1000);
  logger.info(null, 'Automation service started (5 min interval)');

  // Run once on startup after a short delay
  setTimeout(() => runAutomationCycle(), 10000);
}

function stopAutomation() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info(null, 'Automation service stopped');
  }
}

async function runAutomationCycle() {
  if (!client || !configRef || !ticketStateRef) return;

  const now = Date.now();

  for (const [guildId, guildTickets] of Object.entries(ticketStateRef)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const guildConfig = getGuildConfig(configRef, guildId, guild.name);

    for (const [channelId, ticketData] of Object.entries(guildTickets)) {
      if (ticketData.state !== 'open') continue;
      if (ticketData.automationsPaused) continue;

      const panelConfig = guildConfig.panels?.[ticketData.panelId];
      if (!panelConfig) continue;

      const ao = panelConfig.automationOptions;
      if (!ao) continue;

      const channel = guild.channels.cache.get(channelId);
      if (!channel) continue;

      // Auto-close logic
      if (ao.autoCloseEnabled) {
        const closeThresholdMs = (ao.autoCloseHours || 24) * 60 * 60 * 1000;
        const warningThresholdMs = closeThresholdMs - (ao.autoCloseWarningMinutes || 30) * 60 * 1000;
        const inactiveMs = now - (ticketData.lastActivityAt || ticketData.openedAt);

        if (inactiveMs >= closeThresholdMs) {
          // Auto-close
          logger.info(guildId, `Auto-closing ticket ${ticketData.ticketId} due to inactivity`);

          try {
            const botMember = guild.members.me;
            await closeTicket(
              channel,
              botMember,
              guildConfig,
              panelConfig,
              ticketData,
              ticketStateRef,
              () => saveTicketState(ticketStateRef),
              () => saveConfig(configRef),
              { skipTranscript: false }
            );
          } catch (e) {
            logger.error(guildId, `Failed to auto-close ticket: ${e.message}`, e);
          }
        } else if (inactiveMs >= warningThresholdMs && !ticketData.warningSent) {
          // Send warning
          const remainingMs = closeThresholdMs - inactiveMs;
          const remainingMins = Math.ceil(remainingMs / 60000);

          const ctx = { time: `${remainingMins} minute(s)` };
          const warningMsg = resolveVariables(ao.autoCloseMessage || 'This ticket will be closed in {time} due to inactivity.', ctx);

          try {
            await channel.send({ content: `⚠️ ${warningMsg}` });
            ticketData.warningSent = true;
            saveTicketState(ticketStateRef);
          } catch (e) {
            logger.warn(guildId, `Failed to send auto-close warning: ${e.message}`);
          }
        }
      }

      // Auto-message logic
      if (ao.autoMessageEnabled && !ticketData.autoMessageSentAt) {
        const delayMs = (ao.autoMessageDelayMinutes || 60) * 60 * 1000;
        const openedMs = now - ticketData.openedAt;

        if (openedMs >= delayMs) {
          try {
            await channel.send({ content: ao.autoMessageText || 'A staff member will be with you shortly!' });
            ticketData.autoMessageSentAt = now;
            saveTicketState(ticketStateRef);
          } catch (e) {
            logger.warn(guildId, `Failed to send auto-message: ${e.message}`);
          }
        }
      }
    }
  }
}

function updateActivity(guildId, channelId, ticketState) {
  const guildTickets = ticketState[guildId];
  if (!guildTickets) return;

  const ticketData = guildTickets[channelId];
  if (!ticketData || ticketData.state !== 'open') return;

  ticketData.lastActivityAt = Date.now();
  ticketData.warningSent = false; // Reset warning on activity
}

module.exports = {
  startAutomation,
  stopAutomation,
  updateActivity,
};

