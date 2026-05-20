const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function defaultPanelConfig(name) {
  return {
    name: name || 'Support',
    style: 'button',
    panelEmbed: {
      title: 'Open a ticket',
      description: 'Click below to open a ticket.',
      color: 0x5865f2,
      thumbnailUrl: null,
      imageUrl: null,
      footerText: null,
      footerIconUrl: null,
    },
    buttonLabel: 'Open Ticket',
    buttonEmoji: '🎫',
    buttonStyle: 'Primary',
    // Ticket form options - shown in modal when opening ticket
    ticketForm: {
      enabled: true,
      askDescription: true,
      descriptionLabel: 'Describe your issue',
      descriptionPlaceholder: 'Please describe your issue in detail...',
      descriptionRequired: true,
      // Category options for dropdown
      categories: [
        { label: 'Official Server', value: 'official-server', emoji: '🖥️' },
        { label: 'Bug Report', value: 'bug-report', emoji: '🐛' },
        { label: 'Help', value: 'help', emoji: '❓' },
        { label: 'Other', value: 'other', emoji: '📝' },
      ],
      // Issue type options for dropdown
      issueTypes: [
        { label: 'Overstars', value: 'overstars', emoji: '⭐' },
        { label: 'IWS', value: 'iws', emoji: '🌤️' },
        { label: 'Discord', value: 'discord', emoji: '💬' },
      ],
    },
    ticketOptions: {
      categoryId: null,
      openedNamePattern: '✅┃{username}-{category}-{issue}',
      closedNamePattern: '❌┃{username}-{category}-{issue}',
      ticketCounter: 0,
      maxPerUser: 3,
      openMessage: '**Issue Description:**\n{description}\n\nThanks for reaching out! A staff member will be with you shortly.',
      openMessageEmbedTitle: 'Ticket #{number} - {category}',
      openMessageEmbedColor: 0x5865f2,
      closeAskMessage: 'Are you sure you want to close this ticket?',
      twoStepClose: false,
      mentionUser: true,
      mentionSupport: true,
      openedRolesAdd: [],
      openedRolesRemove: [],
      closedRolesAdd: [],
      closedRolesRemove: [],
      privateThread: false,
      privateThreadName: 'staff-notes-{number}',
      privateThreadAutoAddTeam: true,
      pingRoles: [],
    },
    permissionOptions: {
      supportTeam: {
        opened: { viewChannel: true, sendMessages: true, readMessageHistory: true, attachFiles: true, embedLinks: true },
        closed: { viewChannel: true, sendMessages: false, readMessageHistory: true },
      },
      user: {
        opened: { viewChannel: true, sendMessages: true, readMessageHistory: true, attachFiles: true },
        closed: { viewChannel: true, sendMessages: false, readMessageHistory: true },
      },
      additionalRoles: [],
      everyone: {
        opened: { viewChannel: false },
        closed: { viewChannel: false },
      },
    },
    claimingOptions: {
      enabled: true,
      onlyClaimerCanClose: false,
      onlyClaimerCanAct: false,
      removeOthersSendOnClaim: false,
      claimedMessage: 'This ticket has been claimed by {claimer}.',
      overwriteExisting: true,
    },
    transcriptOptions: {
      channelId: null,
      sendOnClose: true,
      sendOnDelete: true,
      format: 'html',
      includeAttachments: true,
      dmOpenerOnClose: true,
    },
    logOptions: {
      channelId: null,
      logOpen: true,
      logClose: true,
      logDelete: true,
      logClaim: true,
      logRename: true,
      logEscalate: true,
      logAddRemove: true,
    },
    escalationOptions: {
      targets: [],
    },
    supportRoles: [],
    automationOptions: {
      autoCloseEnabled: false,
      autoCloseHours: 24,
      autoCloseWarningMinutes: 30,
      autoCloseMessage: 'This ticket will be closed in {time} due to inactivity.',
      autoCloseBypassTwoStep: true,
      autoMessageEnabled: false,
      autoMessageDelayMinutes: 60,
      autoMessageText: 'A staff member will be with you shortly!',
    },
    postedAt: null,
    postedChannelId: null,
  };
}

function defaultGuildConfig(guildName) {
  return {
    meta: {
      configVersion: 2,
      guildName: guildName || 'Unknown',
    },
    server: {
      dashboardRoles: [],
      blacklistRoles: [],
      globalTicketLimit: 3,
      commandPrefix: '/',
      storageCategories: [],
      phantomPing: {
        enabled: false,
        channelId: null,
      },
    },
    panels: {},
    reactionRoles: {
      channelId: null,
      panelMessageId: null,
      style: 'button',
      embedTitle: 'Choose your roles (click buttons below):',
      embedDescription: '🌤️ **IWS** — Updates, changelogs, and modpack announcements\n⭐ **Over Stars** — Updates, changelogs, and modpack announcements\n🌌 **Server Member** — Server status pings, restarts, wipes, and event notices\n📊 **Polls** — Vote on features, configs, packs, and community decisions\n👀 **Sneak Peeks** — Early previews and behind-the-scenes content',
      embedColor: 0xffffff,
      embedThumbnailUrl: null,
      embedImageUrl: null,
      embedFooterText: null,
      compact: false,
      roles: [
        { roleId: '1449279860609519831', label: 'IWS', emoji: '🌤️', style: 'Secondary', description: 'Immersed With Shaders updates' },
        { roleId: '1449279753805758606', label: 'Over Stars', emoji: '⭐', style: 'Secondary', description: 'Over Stars updates' },
        { roleId: '1447113319017086986', label: 'Server Member', emoji: '🌌', style: 'Secondary', description: 'Server status notifications' },
        { roleId: '1449280018109694094', label: 'Polls', emoji: '📊', style: 'Secondary', description: 'Community polls' },
        { roleId: '1478780540957102141', label: 'Sneak Peeks', emoji: '👀', style: 'Secondary', description: 'Early previews and behind-the-scenes content' },
      ],
      exclusiveGroups: [],
    },
  };
}

// Deep merge: applies defaults to existing object without overwriting existing values
function deepMerge(target, defaults) {
  if (!target || typeof target !== 'object') return { ...defaults };
  if (!defaults || typeof defaults !== 'object') return target;

  const result = { ...target };
  for (const key of Object.keys(defaults)) {
    if (result[key] === undefined) {
      result[key] = defaults[key];
    } else if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
      result[key] = deepMerge(result[key], defaults[key]);
    }
  }
  return result;
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    logger.error(null, 'Failed to load config.json', e);
    return {};
  }
}

// Write queue to prevent race conditions
let writeQueue = Promise.resolve();

// Export writeQueue for graceful shutdown
function getWriteQueue() {
  return writeQueue;
}

function saveConfig(config) {
  writeQueue = writeQueue.then(() => {
    return new Promise((resolve) => {
      try {
        // Atomic write: write to temp file, then rename
        const tempPath = CONFIG_PATH + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(config, null, 2));
        fs.renameSync(tempPath, CONFIG_PATH);
      } catch (e) {
        logger.error(null, 'Failed to save config.json', e);
      }
      resolve();
    });
  });
}

function getGuildConfig(config, guildId, guildName) {
  if (!config[guildId]) {
    config[guildId] = defaultGuildConfig(guildName);
    saveConfig(config);
  }
  // Deep merge to fill in any missing defaults
  const defaults = defaultGuildConfig(guildName || config[guildId].meta?.guildName);
  config[guildId] = deepMerge(config[guildId], defaults);
  return config[guildId];
}

function getTicketConfig(config, guildId, panelId) {
  const guildConfig = getGuildConfig(config, guildId);
  const panel = guildConfig.panels?.[panelId];
  if (!panel) return null;
  // Merge panel with defaults
  return deepMerge(panel, defaultPanelConfig(panel.name));
}

function getRRConfig(config, guildId) {
  const guildConfig = getGuildConfig(config, guildId);
  return guildConfig.reactionRoles;
}

function ensurePanel(config, guildId, panelId, panelName) {
  const guildConfig = config[guildId];
  if (!guildConfig.panels[panelId]) {
    guildConfig.panels[panelId] = defaultPanelConfig(panelName);
  } else {
    // Merge with defaults
    guildConfig.panels[panelId] = deepMerge(guildConfig.panels[panelId], defaultPanelConfig(guildConfig.panels[panelId].name));
  }
  return guildConfig.panels[panelId];
}

// Startup validation - logs warnings for misconfigured guilds
function validateConfig(config) {
  for (const [guildId, guildConfig] of Object.entries(config)) {
    const guildName = guildConfig.meta?.guildName || guildId;

    // Version check
    if (guildConfig.meta?.configVersion !== 2) {
      logger.warn(guildId, `Config version mismatch for ${guildName} - may need migration`);
    }

    // Check panels
    for (const [panelId, panel] of Object.entries(guildConfig.panels || {})) {
      if (!panel.ticketOptions?.categoryId) {
        logger.warn(guildId, `Panel "${panel.name}" has no category set`);
      }
      if (!panel.supportRoles || panel.supportRoles.length === 0) {
        logger.warn(guildId, `Panel "${panel.name}" has no support roles`);
      }
    }

    // Check RR
    const rr = guildConfig.reactionRoles;
    if (rr?.roles?.length > 0 && !rr.channelId) {
      logger.warn(guildId, 'Reaction roles configured but no channel set');
    }
  }
}

module.exports = {
  defaultPanelConfig,
  defaultGuildConfig,
  loadConfig,
  saveConfig,
  getGuildConfig,
  getTicketConfig,
  getRRConfig,
  ensurePanel,
  validateConfig,
  deepMerge,
  getWriteQueue,
  CONFIG_PATH,
};
