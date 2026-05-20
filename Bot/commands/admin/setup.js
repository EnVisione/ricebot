const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig, defaultPanelConfig, saveConfig, deepMerge } = require('../../utils/config');
const { isValidSnowflake } = require('../../utils/validator');
const { validateBotHierarchy } = require('../../utils/permissions');
const { buildRRPanel } = require('../../reactionroles/rrBuilder');
const logger = require('../../utils/logger');

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const sessions = new Map();
const SESSION_TIMEOUT = 600000; // 10 minutes

const STEPS = [
  'welcome',
  'panelName',
  'category',
  'supportRole',
  'logChannel',
  'quickSettings',
  'rrChannel',
  'rrRoles',
  'review',
];

function createSession(guildId, userId, mode = 'full') {
  const key = `${guildId}:${userId}`;

  // Clear any existing session
  destroySession(guildId, userId);

  const session = {
    guildId,
    userId,
    mode, // 'full', 'tickets', 'rr', 'reconfig'
    currentStep: 0,
    ticketData: {
      panelName: null,
      panelId: null,
      categoryId: null,
      supportRoleId: null,
      logChannelId: null,
      twoStepClose: false,
      transcriptOnClose: false,
      dmTranscript: false,
      mentionUser: true,
      mentionSupport: true,
    },
    rrData: {
      channelId: null,
      roles: [],
    },
    warnings: [],
    expiresAt: Date.now() + SESSION_TIMEOUT,
    timeoutHandle: setTimeout(() => {
      sessions.delete(key);
      logger.debug(guildId, `Setup session expired for ${userId}`);
    }, SESSION_TIMEOUT),
  };

  sessions.set(key, session);
  return session;
}

function getSession(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const session = sessions.get(key);

  if (session) {
    // Reset timeout on access
    clearTimeout(session.timeoutHandle);
    session.expiresAt = Date.now() + SESSION_TIMEOUT;
    session.timeoutHandle = setTimeout(() => {
      sessions.delete(key);
    }, SESSION_TIMEOUT);
  }

  return session;
}

function destroySession(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const session = sessions.get(key);
  if (session) {
    clearTimeout(session.timeoutHandle);
    sessions.delete(key);
  }
}

// ============================================================================
// STEP RENDERERS
// ============================================================================

function getProgressFooter(step, totalSteps = 8) {
  const stepName = STEPS[step] || 'Setup';
  const stepLabels = {
    welcome: 'Welcome',
    panelName: 'Ticket Setup',
    category: 'Ticket Setup',
    supportRole: 'Ticket Setup',
    logChannel: 'Ticket Setup',
    quickSettings: 'Ticket Setup',
    rrChannel: 'Reaction Roles',
    rrRoles: 'Reaction Roles',
    review: 'Review',
  };
  return `Step ${step} of ${totalSteps} — ${stepLabels[stepName] || 'Setup'}`;
}

function renderWelcome(session) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎉 Welcome to RiceBot Setup')
    .setDescription(
      'This wizard will guide you through setting up:\n' +
      '• 🎫 **Ticket System** — support channels, logging, transcripts\n' +
      '• 🎭 **Reaction Roles** — self-assignable role buttons\n\n' +
      'You can set up one or both. All settings can be changed later\n' +
      'using `/ticketadmin`, `/rradmin`, `/serverconfig`, and `/panelmanager`.\n\n' +
      'Press a button below to get started.'
    )
    .setFooter({ text: 'Setup will expire after 10 minutes of inactivity' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:welcome:full')
      .setLabel('Setup Everything')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup:welcome:tickets')
      .setLabel('Tickets Only')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:welcome:rr')
      .setLabel('Reaction Roles Only')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

function renderPanelName(session) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 Step 1 of 8 — Create Your First Panel')
    .setDescription(
      'Panels are independent ticket configurations. Most servers only need one\n' +
      '(e.g. "Support"), but you can create more later using `/panelmanager`.\n\n' +
      '**What should your first panel be called?**\n' +
      'Examples: Support, Help Desk, Bug Reports, Appeals'
    )
    .setFooter({ text: getProgressFooter(1) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:panelName:modal')
      .setLabel('Set Panel Name')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup:panelName:default')
      .setLabel('Use Default (Support)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:back')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  return { embeds: [embed], components: [row] };
}

function renderCategory(session) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📁 Step 2 of 8 — Ticket Category')
    .setDescription(
      'Ticket channels are created inside a Discord category.\n' +
      'You should create a category like "📋 TICKETS" in your server first.\n\n' +
      '⚠️ **The bot needs Manage Channels permission on this category.**\n\n' +
      'If you haven\'t created one yet, you can skip and set this later with:\n' +
      '`/ticketadmin panel category`\n\n' +
      '*To get a Category ID: Right-click the category → Copy ID*\n' +
      '*(Enable Developer Mode in Settings → Advanced if you don\'t see this)*'
    )
    .setFooter({ text: getProgressFooter(2) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:category:modal')
      .setLabel('Set Category')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup:category:skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:back')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderSupportRole(session) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('👥 Step 3 of 8 — Support Team Role')
    .setDescription(
      'This role is given access to all ticket channels automatically.\n' +
      'Staff with this role can see, respond to, and manage tickets.\n\n' +
      'You can add multiple support roles later using:\n' +
      '`/ticketadmin panel support role:@YourRole`\n\n' +
      '*To get a Role ID: Right-click the role → Copy ID*'
    )
    .setFooter({ text: getProgressFooter(3) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:supportRole:modal')
      .setLabel('Set Support Role')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup:supportRole:skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:back')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderLogChannel(session) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 Step 4 of 8 — Log Channel')
    .setDescription(
      'Ticket actions (opened, closed, claimed, deleted) are logged here.\n' +
      'Choose a private channel only staff can see — like `#ticket-logs`.\n\n' +
      'This is optional but **strongly recommended** for accountability.\n' +
      'Set later with: `/ticketadmin channels log channel:#channel`\n\n' +
      '*To get a Channel ID: Right-click the channel → Copy ID*'
    )
    .setFooter({ text: getProgressFooter(4) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:logChannel:modal')
      .setLabel('Set Log Channel')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup:logChannel:skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:back')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderQuickSettings(session) {
  const t = session.ticketData;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚙️ Step 5 of 8 — Quick Settings')
    .setDescription(
      'Configure key behaviors for your ticket system.\n' +
      'All of these can be changed later via `/ticketadmin settings`.\n\n' +
      'Click toggles to change, then **Continue** when ready.'
    )
    .setFooter({ text: getProgressFooter(5) });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:settings:twoStep')
      .setLabel(t.twoStepClose ? 'Two-Step Close: On ✅' : 'Two-Step Close: Off')
      .setStyle(t.twoStepClose ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:settings:transcript')
      .setLabel(t.transcriptOnClose ? 'Auto Transcript: On ✅' : 'Auto Transcript: Off')
      .setStyle(t.transcriptOnClose ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:settings:dmTranscript')
      .setLabel(t.dmTranscript ? 'DM Transcript: On ✅' : 'DM Transcript: Off')
      .setStyle(t.dmTranscript ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:settings:mentionUser')
      .setLabel(t.mentionUser ? 'Mention User: On ✅' : 'Mention User: Off')
      .setStyle(t.mentionUser ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:settings:mentionSupport')
      .setLabel(t.mentionSupport ? 'Mention Support: On ✅' : 'Mention Support: Off')
      .setStyle(t.mentionSupport ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:next')
      .setLabel('Continue →')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup:back')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

function renderRRChannel(session) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎭 Step 6 of 8 — Reaction Roles')
    .setDescription(
      'Reaction roles let members self-assign roles by clicking buttons.\n' +
      'First, choose which channel the role panel should be posted in.\n\n' +
      'This is typically a public channel like `#roles` or `#self-roles`.\n' +
      'Set later with: `/rradmin set-channel channel:#channel`\n\n' +
      '*To get a Channel ID: Right-click the channel → Copy ID*'
    )
    .setFooter({ text: getProgressFooter(6) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:rrChannel:modal')
      .setLabel('Set Channel')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup:rrChannel:skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:back')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderRRRoles(session) {
  const roles = session.rrData.roles;
  const rolesText = roles.length > 0
    ? roles.map((r) => `${r.emoji || '•'} ${r.label}`).join(', ')
    : '*No roles added yet*';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('➕ Step 7 of 8 — Add Your First Role')
    .setDescription(
      'Add at least one role to the panel. You can add more later using:\n' +
      '`/rradmin add-role role:@Role label:Label emoji:🎮`\n\n' +
      'For now, add one role to get started, or skip to do this later.\n\n' +
      `**Roles added:** ${rolesText}`
    )
    .setFooter({ text: getProgressFooter(7) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:rrRoles:modal')
      .setLabel('Add a Role')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup:next')
      .setLabel('Continue →')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('setup:back')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderReview(session) {
  const t = session.ticketData;
  const r = session.rrData;

  let hasWarnings = false;
  const lines = [];

  lines.push('**🎫 TICKET SYSTEM**');
  lines.push(`  Panel Name:     ${t.panelName || 'Support'}`);

  if (t.categoryId) {
    lines.push(`  Category:       <#${t.categoryId}>`);
  } else {
    lines.push(`  Category:       ⚠️ Not Set — tickets won't create until set`);
    hasWarnings = true;
  }

  if (t.supportRoleId) {
    lines.push(`  Support Role:   <@&${t.supportRoleId}>`);
  } else {
    lines.push(`  Support Role:   ⚠️ Not Set`);
    hasWarnings = true;
  }

  if (t.logChannelId) {
    lines.push(`  Log Channel:    <#${t.logChannelId}>`);
  } else {
    lines.push(`  Log Channel:    *Not set*`);
  }

  lines.push(`  Two-Step Close: ${t.twoStepClose ? 'On' : 'Off'}`);
  lines.push(`  Auto Transcript: ${t.transcriptOnClose ? 'On' : 'Off'}`);
  lines.push(`  DM Transcript:  ${t.dmTranscript ? 'On' : 'Off'}`);
  lines.push('');

  lines.push('**🎭 REACTION ROLES**');
  if (r.channelId) {
    lines.push(`  Channel:        <#${r.channelId}>`);
  } else {
    lines.push(`  Channel:        *Not set*`);
  }

  if (r.roles.length > 0) {
    const roleList = r.roles.map((ro) => `${ro.emoji || '•'} ${ro.label}`).join(', ');
    lines.push(`  Roles:          ${roleList}`);
  } else {
    lines.push(`  Roles:          *None added*`);
  }

  if (session.warnings.length > 0) {
    lines.push('');
    lines.push('**⚠️ WARNINGS**');
    for (const w of session.warnings) {
      lines.push(`  • ${w}`);
    }
    hasWarnings = true;
  }

  lines.push('');
  lines.push('Press **Confirm** to save this configuration and post your panels.');

  const embed = new EmbedBuilder()
    .setColor(hasWarnings ? 0xfee75c : 0x57f287)
    .setTitle('✅ Step 8 of 8 — Review Your Setup')
    .setDescription(lines.join('\n'))
    .setFooter({ text: getProgressFooter(8) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:confirm')
      .setLabel('✅ Confirm & Apply')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('setup:back')
      .setLabel('← Go Back')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

function renderStep(session) {
  const step = STEPS[session.currentStep];

  switch (step) {
    case 'welcome': return renderWelcome(session);
    case 'panelName': return renderPanelName(session);
    case 'category': return renderCategory(session);
    case 'supportRole': return renderSupportRole(session);
    case 'logChannel': return renderLogChannel(session);
    case 'quickSettings': return renderQuickSettings(session);
    case 'rrChannel': return renderRRChannel(session);
    case 'rrRoles': return renderRRRoles(session);
    case 'review': return renderReview(session);
    default: return renderWelcome(session);
  }
}

// ============================================================================
// RECONFIG MENU
// ============================================================================

function renderReconfigMenu(guildConfig) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚙️ RiceBot Configuration')
    .setDescription(
      'Your server is already configured. Select a section to reconfigure,\n' +
      'or run `/setup fresh` to completely reset and redo first-time setup.'
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('setup:reconfig:menu')
    .setPlaceholder('Select a section...')
    .addOptions([
      { label: '🎫 Ticket Panels', description: 'Manage panels, categories, roles', value: 'panels' },
      { label: '📋 Logging & Transcripts', description: 'Log channel, transcript settings', value: 'logging' },
      { label: '⚙️ Ticket Behaviors', description: 'Close settings, claiming, auto-close', value: 'behaviors' },
      { label: '🎭 Reaction Roles', description: 'Channel, roles, style', value: 'rr' },
      { label: '🌐 Server Settings', description: 'Global limits, dashboard roles', value: 'server' },
      { label: '📊 View Full Config', description: 'See all current settings', value: 'view' },
      { label: '🔄 Start Fresh', description: 'Wipe config and restart wizard', value: 'reset' },
    ]);

  const row = new ActionRowBuilder().addComponents(menu);

  return { embeds: [embed], components: [row] };
}

// ============================================================================
// APPLY SETUP
// ============================================================================

async function applySetup(session, interaction, config, saveConfigFn) {
  const guildId = session.guildId;
  const guild = interaction.guild;
  const guildConfig = getGuildConfig(config, guildId, guild.name);

  const results = { successes: [], failures: [] };

  try {
    // 1. Create panel
    const panelName = session.ticketData.panelName || 'Support';
    const panelId = panelName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const panelConfig = defaultPanelConfig(panelName);
    panelConfig.ticketOptions.categoryId = session.ticketData.categoryId;
    panelConfig.ticketOptions.twoStepClose = session.ticketData.twoStepClose;
    panelConfig.ticketOptions.mentionUser = session.ticketData.mentionUser;
    panelConfig.ticketOptions.mentionSupport = session.ticketData.mentionSupport;
    panelConfig.transcriptOptions.sendOnClose = session.ticketData.transcriptOnClose;
    panelConfig.transcriptOptions.dmOpenerOnClose = session.ticketData.dmTranscript;
    panelConfig.logOptions.channelId = session.ticketData.logChannelId;

    if (session.ticketData.supportRoleId) {
      panelConfig.supportRoles = [session.ticketData.supportRoleId];
    }

    guildConfig.panels[panelId] = panelConfig;
    results.successes.push(`Created panel: ${panelName}`);

    // 2. Set RR config
    if (session.rrData.channelId) {
      guildConfig.reactionRoles.channelId = session.rrData.channelId;
    }
    if (session.rrData.roles.length > 0) {
      guildConfig.reactionRoles.roles = session.rrData.roles;
    }

    // 3. Validate hierarchy
    const violations = validateBotHierarchy(guild, panelConfig, guildConfig.reactionRoles);
    if (violations.length > 0) {
      for (const v of violations) {
        results.failures.push(`Role hierarchy issue: ${v.role} (${v.type})`);
      }
    }

    // 4. Save config
    saveConfigFn();
    results.successes.push('Configuration saved');

    // 5. Post RR panel if configured
    if (session.rrData.channelId && session.rrData.roles.length > 0) {
      try {
        const rrChannel = guild.channels.cache.get(session.rrData.channelId);
        if (rrChannel) {
          const { embed, components } = buildRRPanel(guildConfig.reactionRoles, guildId);
          const msg = await rrChannel.send({ embeds: [embed], components });
          guildConfig.reactionRoles.panelMessageId = msg.id;
          saveConfigFn();
          results.successes.push(`Posted reaction roles panel in <#${rrChannel.id}>`);
        }
      } catch (e) {
        results.failures.push(`Failed to post RR panel: ${e.message}`);
      }
    }

    // 6. Post setup summary (non-ephemeral)
    try {
      const summaryEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ RiceBot Setup Complete')
        .setDescription(
          `**Ticket Panel:** ${panelName}\n` +
          `**Category:** ${session.ticketData.categoryId ? `<#${session.ticketData.categoryId}>` : 'Not set'}\n` +
          `**Support Role:** ${session.ticketData.supportRoleId ? `<@&${session.ticketData.supportRoleId}>` : 'Not set'}\n` +
          `**Log Channel:** ${session.ticketData.logChannelId ? `<#${session.ticketData.logChannelId}>` : 'Not set'}\n` +
          `**RR Roles:** ${session.rrData.roles.length} configured`
        )
        .setFooter({ text: `Configured by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.channel.send({ embeds: [summaryEmbed] });
    } catch (e) {
      logger.warn(guildId, `Failed to post setup summary: ${e.message}`);
    }

  } catch (e) {
    results.failures.push(`Error: ${e.message}`);
    logger.error(guildId, 'Setup apply error', e);
  }

  return results;
}

// ============================================================================
// MODALS
// ============================================================================

function buildPanelNameModal() {
  return new ModalBuilder()
    .setCustomId('setup:modal:panelName')
    .setTitle('Panel Name')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Panel Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Support')
          .setMaxLength(32)
          .setRequired(true)
      )
    );
}

function buildCategoryModal() {
  return new ModalBuilder()
    .setCustomId('setup:modal:category')
    .setTitle('Ticket Category')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('categoryId')
          .setLabel('Category ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Right-click category → Copy ID')
          .setRequired(true)
      )
    );
}

function buildSupportRoleModal() {
  return new ModalBuilder()
    .setCustomId('setup:modal:supportRole')
    .setTitle('Support Role')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('roleId')
          .setLabel('Role ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Right-click role → Copy ID')
          .setRequired(true)
      )
    );
}

function buildLogChannelModal() {
  return new ModalBuilder()
    .setCustomId('setup:modal:logChannel')
    .setTitle('Log Channel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channelId')
          .setLabel('Channel ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Right-click channel → Copy ID')
          .setRequired(true)
      )
    );
}

function buildRRChannelModal() {
  return new ModalBuilder()
    .setCustomId('setup:modal:rrChannel')
    .setTitle('Reaction Roles Channel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channelId')
          .setLabel('Channel ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Right-click channel → Copy ID')
          .setRequired(true)
      )
    );
}

function buildRRRoleModal() {
  return new ModalBuilder()
    .setCustomId('setup:modal:rrRole')
    .setTitle('Add Reaction Role')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('roleId')
          .setLabel('Role ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Right-click role → Copy ID')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Button Label')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Gamer')
          .setMaxLength(25)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('emoji')
          .setLabel('Emoji (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('🎮')
          .setRequired(false)
      )
    );
}

// ============================================================================
// HANDLERS
// ============================================================================

async function handleButton(interaction, config, saveConfigFn) {
  const customId = interaction.customId;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  // Cancel
  if (customId === 'setup:cancel') {
    destroySession(guildId, userId);
    return interaction.update({
      embeds: [embedBuilder.info('Setup Cancelled', 'Run `/setup` again anytime.')],
      components: [],
    });
  }

  // Welcome mode selection
  if (customId.startsWith('setup:welcome:')) {
    const mode = customId.split(':')[2];
    const session = createSession(guildId, userId, mode);

    if (mode === 'rr') {
      session.currentStep = STEPS.indexOf('rrChannel');
    } else {
      session.currentStep = STEPS.indexOf('panelName');
    }

    return interaction.update(renderStep(session));
  }

  // Get session
  let session = getSession(guildId, userId);
  if (!session) {
    return interaction.reply({
      embeds: [embedBuilder.error('Session Expired', '⏰ Your setup session expired after 10 minutes. Run `/setup` again.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Back navigation
  if (customId === 'setup:back') {
    if (session.currentStep > 0) {
      session.currentStep--;
      // Skip RR steps if mode is tickets only
      if (session.mode === 'tickets' && STEPS[session.currentStep] === 'rrRoles') {
        session.currentStep = STEPS.indexOf('quickSettings');
      }
    }
    return interaction.update(renderStep(session));
  }

  // Next navigation
  if (customId === 'setup:next') {
    session.currentStep++;
    // Skip ticket steps if mode is RR only
    if (session.mode === 'rr' && session.currentStep < STEPS.indexOf('rrChannel')) {
      session.currentStep = STEPS.indexOf('rrChannel');
    }
    // Skip RR steps if mode is tickets only
    if (session.mode === 'tickets' && STEPS[session.currentStep] === 'rrChannel') {
      session.currentStep = STEPS.indexOf('review');
    }
    return interaction.update(renderStep(session));
  }

  // Confirm
  if (customId === 'setup:confirm') {
    await interaction.deferUpdate();
    const results = await applySetup(session, interaction, config, saveConfigFn);
    destroySession(guildId, userId);

    const successText = results.successes.join('\n• ');
    const failText = results.failures.length > 0 ? '\n\n**Issues:**\n• ' + results.failures.join('\n• ') : '';

    const doneEmbed = new EmbedBuilder()
      .setColor(results.failures.length > 0 ? 0xfee75c : 0x57f287)
      .setTitle('🎉 Setup Complete!')
      .setDescription(
        `**Completed:**\n• ${successText}${failText}\n\n` +
        '**Next Steps:**\n' +
        '1. Run `/panel` to post your ticket panel\n' +
        '2. Run `/debug` to verify permissions\n' +
        '3. Run `/help setup` to see the checklist'
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup:done:panel')
        .setLabel('Post Ticket Panel Now')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('setup:done:close')
        .setLabel('Done')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.editReply({ embeds: [doneEmbed], components: [row] });
  }

  // Done buttons
  if (customId === 'setup:done:close') {
    return interaction.update({
      embeds: [embedBuilder.success('Setup Complete', 'You can close this message.')],
      components: [],
    });
  }

  if (customId === 'setup:done:panel') {
    await interaction.deferUpdate();

    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const panelIds = Object.keys(guildConfig.panels || {});

    if (panelIds.length === 0) {
      return interaction.editReply({
        embeds: [embedBuilder.error('No Panels', 'No ticket panels configured. Run /ticketadmin panel create first.')],
        components: [],
      });
    }

    // Post the first panel
    const panelId = panelIds[0];
    const panelConfig = guildConfig.panels[panelId];

    const { buildTicketPanelEmbed, buildTicketPanelComponents } = require('../../tickets/ticketPanelBuilder');
    const embed = buildTicketPanelEmbed(panelConfig);
    const components = buildTicketPanelComponents(panelId, panelConfig);

    try {
      await interaction.channel.send({ embeds: [embed], components });
      panelConfig.postedAt = Date.now();
      panelConfig.postedChannelId = interaction.channel.id;
      saveConfigFn();

      return interaction.editReply({
        embeds: [embedBuilder.success('Panel Posted', `Ticket panel **${panelConfig.name}** has been posted in this channel!`)],
        components: [],
      });
    } catch (e) {
      return interaction.editReply({
        embeds: [embedBuilder.error('Failed to Post', `Could not post panel: ${e.message}`)],
        components: [],
      });
    }
  }

  // Modal triggers
  if (customId === 'setup:panelName:modal') {
    return interaction.showModal(buildPanelNameModal());
  }
  if (customId === 'setup:panelName:default') {
    session.ticketData.panelName = 'Support';
    session.ticketData.panelId = 'support';
    session.currentStep++;
    return interaction.update(renderStep(session));
  }
  if (customId === 'setup:category:modal') {
    return interaction.showModal(buildCategoryModal());
  }
  if (customId === 'setup:category:skip') {
    session.ticketData.categoryId = null;
    session.warnings.push('No ticket category set — run /ticketadmin panel category');
    session.currentStep++;
    return interaction.update(renderStep(session));
  }
  if (customId === 'setup:supportRole:modal') {
    return interaction.showModal(buildSupportRoleModal());
  }
  if (customId === 'setup:supportRole:skip') {
    session.ticketData.supportRoleId = null;
    session.warnings.push('No support role set — run /ticketadmin panel support');
    session.currentStep++;
    return interaction.update(renderStep(session));
  }
  if (customId === 'setup:logChannel:modal') {
    return interaction.showModal(buildLogChannelModal());
  }
  if (customId === 'setup:logChannel:skip') {
    session.ticketData.logChannelId = null;
    session.currentStep++;
    return interaction.update(renderStep(session));
  }
  if (customId === 'setup:rrChannel:modal') {
    return interaction.showModal(buildRRChannelModal());
  }
  if (customId === 'setup:rrChannel:skip') {
    session.rrData.channelId = null;
    session.currentStep++;
    return interaction.update(renderStep(session));
  }
  if (customId === 'setup:rrRoles:modal') {
    return interaction.showModal(buildRRRoleModal());
  }

  // Settings toggles
  if (customId.startsWith('setup:settings:')) {
    const setting = customId.split(':')[2];
    switch (setting) {
      case 'twoStep':
        session.ticketData.twoStepClose = !session.ticketData.twoStepClose;
        break;
      case 'transcript':
        session.ticketData.transcriptOnClose = !session.ticketData.transcriptOnClose;
        break;
      case 'dmTranscript':
        session.ticketData.dmTranscript = !session.ticketData.dmTranscript;
        break;
      case 'mentionUser':
        session.ticketData.mentionUser = !session.ticketData.mentionUser;
        break;
      case 'mentionSupport':
        session.ticketData.mentionSupport = !session.ticketData.mentionSupport;
        break;
    }
    return interaction.update(renderStep(session));
  }

  return interaction.reply({
    embeds: [embedBuilder.error('Unknown Action', `Button ${customId} not handled.`)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleModal(interaction, config, saveConfigFn) {
  const customId = interaction.customId;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const session = getSession(guildId, userId);
  if (!session) {
    return interaction.reply({
      embeds: [embedBuilder.error('Session Expired', 'Run `/setup` again.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (customId === 'setup:modal:panelName') {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name || name.length > 32) {
      return interaction.reply({
        embeds: [embedBuilder.error('Invalid Name', 'Name must be 1-32 characters.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    session.ticketData.panelName = name;
    session.ticketData.panelId = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    session.currentStep++;
    return interaction.update(renderStep(session));
  }

  if (customId === 'setup:modal:category') {
    const categoryId = interaction.fields.getTextInputValue('categoryId').trim();
    if (!isValidSnowflake(categoryId)) {
      return interaction.reply({
        embeds: [embedBuilder.error('Invalid ID', 'That doesn\'t look like a valid category ID.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Defer BEFORE any async work
    await interaction.deferUpdate();

    try {
      const channel = await interaction.guild.channels.fetch(categoryId);
      if (!channel || channel.type !== ChannelType.GuildCategory) {
        return interaction.editReply({
          embeds: [embedBuilder.error('Not a Category', 'That channel exists but isn\'t a category. Please try again.')],
          components: renderStep(session).components,
        });
      }
      session.ticketData.categoryId = categoryId;
      session.currentStep++;
      return interaction.editReply(renderStep(session));
    } catch (e) {
      return interaction.editReply({
        embeds: [embedBuilder.error('Not Found', 'Category not found. Check the ID and try again.')],
        components: renderStep(session).components,
      });
    }
  }

  if (customId === 'setup:modal:supportRole') {
    const roleId = interaction.fields.getTextInputValue('roleId').trim();
    if (!isValidSnowflake(roleId)) {
      return interaction.reply({
        embeds: [embedBuilder.error('Invalid ID', 'That doesn\'t look like a valid role ID.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Defer BEFORE any async work
    await interaction.deferUpdate();

    try {
      const role = await interaction.guild.roles.fetch(roleId);
      if (!role) {
        return interaction.editReply({
          embeds: [embedBuilder.error('Not Found', 'Role not found. Please try again.')],
          components: renderStep(session).components,
        });
      }

      // Check hierarchy
      const botMember = interaction.guild.members.me;
      if (role.position >= botMember.roles.highest.position) {
        session.warnings.push(`Bot role is below ${role.name} — may have permission issues`);
      }

      session.ticketData.supportRoleId = roleId;
      session.currentStep++;
      return interaction.editReply(renderStep(session));
    } catch (e) {
      return interaction.editReply({
        embeds: [embedBuilder.error('Error', `Failed to fetch role: ${e.message}`)],
        components: renderStep(session).components,
      });
    }
  }

  if (customId === 'setup:modal:logChannel') {
    const channelId = interaction.fields.getTextInputValue('channelId').trim();
    if (!isValidSnowflake(channelId)) {
      return interaction.reply({
        embeds: [embedBuilder.error('Invalid ID', 'That doesn\'t look like a valid channel ID.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Defer BEFORE any async work
    await interaction.deferUpdate();

    try {
      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.editReply({
          embeds: [embedBuilder.error('Not a Text Channel', 'That isn\'t a text channel. Please try again.')],
          components: renderStep(session).components,
        });
      }
      session.ticketData.logChannelId = channelId;
      session.currentStep++;
      return interaction.editReply(renderStep(session));
    } catch (e) {
      return interaction.editReply({
        embeds: [embedBuilder.error('Not Found', 'Channel not found. Please try again.')],
        components: renderStep(session).components,
      });
    }
  }

  if (customId === 'setup:modal:rrChannel') {
    const channelId = interaction.fields.getTextInputValue('channelId').trim();
    if (!isValidSnowflake(channelId)) {
      return interaction.reply({
        embeds: [embedBuilder.error('Invalid ID', 'That doesn\'t look like a valid channel ID.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Defer BEFORE any async work
    await interaction.deferUpdate();

    try {
      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.editReply({
          embeds: [embedBuilder.error('Not a Text Channel', 'That isn\'t a text channel. Please try again.')],
          components: renderStep(session).components,
        });
      }
      session.rrData.channelId = channelId;
      session.currentStep++;
      return interaction.editReply(renderStep(session));
    } catch (e) {
      return interaction.editReply({
        embeds: [embedBuilder.error('Not Found', 'Channel not found. Please try again.')],
        components: renderStep(session).components,
      });
    }
  }

  if (customId === 'setup:modal:rrRole') {
    const roleId = interaction.fields.getTextInputValue('roleId').trim();
    const label = interaction.fields.getTextInputValue('label').trim();
    const emoji = interaction.fields.getTextInputValue('emoji')?.trim() || null;

    if (!isValidSnowflake(roleId)) {
      return interaction.reply({
        embeds: [embedBuilder.error('Invalid ID', 'That doesn\'t look like a valid role ID.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!label || label.length > 25) {
      return interaction.reply({
        embeds: [embedBuilder.error('Invalid Label', 'Label must be 1-25 characters.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Defer BEFORE any async work
    await interaction.deferUpdate();

    try {
      const role = await interaction.guild.roles.fetch(roleId);
      if (!role) {
        return interaction.editReply({
          embeds: [embedBuilder.error('Not Found', 'Role not found. Please try again.')],
          components: renderStep(session).components,
        });
      }

      session.rrData.roles.push({
        roleId,
        label,
        emoji,
        style: 'Secondary',
      });

      // Stay on the same step to allow adding more roles
      return interaction.editReply(renderStep(session));
    } catch (e) {
      return interaction.editReply({
        embeds: [embedBuilder.error('Error', `Failed to fetch role: ${e.message}`)],
        components: renderStep(session).components,
      });
    }
  }

  return interaction.reply({
    embeds: [embedBuilder.error('Unknown Modal', `Modal ${customId} not handled.`)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleReconfig(interaction, config, saveConfigFn) {
  const value = interaction.values[0];
  const guildId = interaction.guildId;
  const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);

  if (value === 'view') {
    // Show full config view
    const panels = Object.values(guildConfig.panels || {});
    const rr = guildConfig.reactionRoles;

    const lines = [];
    lines.push('**🎫 TICKET PANELS**');
    if (panels.length === 0) {
      lines.push('  *No panels configured*');
    } else {
      for (const p of panels) {
        lines.push(`  **${p.name}**`);
        lines.push(`    Category: ${p.ticketOptions.categoryId ? `<#${p.ticketOptions.categoryId}>` : 'Not set'}`);
        lines.push(`    Support: ${p.supportRoles.length > 0 ? p.supportRoles.map((r) => `<@&${r}>`).join(', ') : 'Not set'}`);
        lines.push(`    Log: ${p.logOptions.channelId ? `<#${p.logOptions.channelId}>` : 'Not set'}`);
      }
    }

    lines.push('');
    lines.push('**🎭 REACTION ROLES**');
    lines.push(`  Channel: ${rr.channelId ? `<#${rr.channelId}>` : 'Not set'}`);
    lines.push(`  Roles: ${rr.roles?.length || 0} configured`);
    lines.push(`  Style: ${rr.style}`);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📊 Current Configuration')
      .setDescription(lines.join('\n'));

    return interaction.update({ embeds: [embed], components: [] });
  }

  if (value === 'reset') {
    // Confirmation required
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⚠️ Reset Configuration?')
      .setDescription(
        'This will delete all ticket panels, reaction role settings, and server configuration.\n\n' +
        '**This cannot be undone!**\n\n' +
        'Are you sure you want to reset?'
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup:reset:confirm')
        .setLabel('Yes, Reset Everything')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('setup:reset:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({ embeds: [embed], components: [row] });
  }

  // Other reconfig options would go here...
  return interaction.update({
    embeds: [embedBuilder.info('Coming Soon', `Reconfigure ${value} is not yet implemented. Use the individual commands like /ticketadmin, /rradmin.`)],
    components: [],
  });
}

// ============================================================================
// COMMAND
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Interactive setup wizard for RiceBot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  folder: 'admin',

  async execute(interaction, { config, saveConfig: saveConfigFn }) {
    // Defer reply immediately to prevent 3-second timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);

    // Check if this is first-time setup
    // Show wizard if: no panels OR only unconfigured panels (no category AND no support roles)
    const panels = Object.values(guildConfig.panels || {});
    const hasConfiguredPanels = panels.some((p) =>
      p.ticketOptions?.categoryId || (p.supportRoles?.length > 0)
    );
    const hasRRConfig = guildConfig.reactionRoles?.roles?.length > 0;
    const hasServerConfig = guildConfig.server?.dashboardRoles?.length > 0;

    const isFirstTimeSetup = !hasConfiguredPanels && !hasRRConfig && !hasServerConfig;

    if (!isFirstTimeSetup) {
      // Show reconfig menu
      return interaction.editReply({
        ...renderReconfigMenu(guildConfig),
      });
    }

    // Start fresh wizard
    const session = createSession(guildId, interaction.user.id, 'full');
    return interaction.editReply({
      ...renderStep(session),
    });
  },

  // Export handlers for index.js routing
  handleButton,
  handleModal,
  handleReconfig,
  getSession,
  destroySession,
};

