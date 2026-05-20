const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig, defaultPanelConfig } = require('../../utils/config');
const { canUseDashboard } = require('../../utils/permissions');
const { parseHexColor } = require('../../utils/validator');

function getPanelOrReject(guildConfig, panelName) {
  const panels = guildConfig.panels || {};
  const panelIds = Object.keys(panels);
  if (panelName) {
    const entry = Object.entries(panels).find(([, p]) => p.name.toLowerCase() === panelName.toLowerCase());
    if (!entry) return { error: `Panel "${panelName}" not found.` };
    return { panelId: entry[0], panel: entry[1] };
  }
  if (panelIds.length === 0) return { error: 'No panels exist. Use /ticketadmin panel create first.' };
  if (panelIds.length === 1) return { panelId: panelIds[0], panel: panels[panelIds[0]] };
  return { error: `Multiple panels exist. Specify: ${Object.values(panels).map((p) => p.name).join(', ')}` };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketadmin')
    .setDescription('Configure the ticket system.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup((g) => g.setName('panel').setDescription('Panel management')
      .addSubcommand((s) => s.setName('create').setDescription('Create panel')
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setRequired(true)))
      .addSubcommand((s) => s.setName('delete').setDescription('Delete panel')
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setRequired(true)))
      .addSubcommand((s) => s.setName('view').setDescription('View config')
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('category').setDescription('Set category')
        .addChannelOption((o) => o.setName('category').setDescription('Category').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('support').setDescription('Add support role')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('remove-support').setDescription('Remove support role')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('embed-thumbnail').setDescription('Set panel embed thumbnail')
        .addStringOption((o) => o.setName('url').setDescription('Image URL (or "none" to remove)').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('embed-image').setDescription('Set panel embed image')
        .addStringOption((o) => o.setName('url').setDescription('Image URL (or "none" to remove)').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('embed-footer').setDescription('Set panel embed footer')
        .addStringOption((o) => o.setName('text').setDescription('Footer text (or "none" to remove)').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('embed-footer-icon').setDescription('Set panel embed footer icon')
        .addStringOption((o) => o.setName('url').setDescription('Icon URL (or "none" to remove)').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('Panel name').setAutocomplete(true))))
    .addSubcommandGroup((g) => g.setName('channels').setDescription('Channel settings')
      .addSubcommand((s) => s.setName('log').setDescription('Set log channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('transcript').setDescription('Set transcript channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name').setAutocomplete(true))))
    .addSubcommandGroup((g) => g.setName('log-events').setDescription('Per-event log toggles')
      .addSubcommand((s) => s.setName('set').setDescription('Toggle a specific log event')
        .addStringOption((o) => o.setName('event').setDescription('Event type').setRequired(true).addChoices(
          { name: 'Open', value: 'logOpen' },
          { name: 'Close', value: 'logClose' },
          { name: 'Delete', value: 'logDelete' },
          { name: 'Claim', value: 'logClaim' },
          { name: 'Rename', value: 'logRename' },
          { name: 'Escalate', value: 'logEscalate' },
          { name: 'Add/Remove User', value: 'logAddRemove' }
        ))
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enable this event').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('view').setDescription('View log event settings')
        .addStringOption((o) => o.setName('panel').setDescription('Panel name').setAutocomplete(true))))
    .addSubcommandGroup((g) => g.setName('settings').setDescription('Ticket settings')
      .addSubcommand((s) => s.setName('limit').setDescription('Set max tickets per user')
        .addIntegerOption((o) => o.setName('max').setDescription('Max').setRequired(true).setMinValue(1).setMaxValue(10))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('global').setDescription('Set global limit')
        .addIntegerOption((o) => o.setName('limit').setDescription('Limit').setRequired(true).setMinValue(1).setMaxValue(20)))
      .addSubcommand((s) => s.setName('twostep').setDescription('Toggle two-step close')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('claiming').setDescription('Toggle claiming')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('autoclose').setDescription('Configure auto-close')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true))
        .addIntegerOption((o) => o.setName('hours').setDescription('Hours').setMinValue(1).setMaxValue(720))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('private-thread').setDescription('Toggle private staff threads')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('thread-name').setDescription('Set private thread name pattern')
        .addStringOption((o) => o.setName('pattern').setDescription('Pattern (use {number})').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name'))))
    .addSubcommandGroup((g) => g.setName('roles').setDescription('Role settings')
      .addSubcommand((s) => s.setName('dashboard').setDescription('Add dashboard role')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
      .addSubcommand((s) => s.setName('blacklist').setDescription('Add blacklist role')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
      .addSubcommand((s) => s.setName('opened-add').setDescription('Role to add on ticket open')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('closed-add').setDescription('Role to add on ticket close')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('ping').setDescription('Add ping role')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name'))))
    .addSubcommandGroup((g) => g.setName('messages').setDescription('Message settings')
      .addSubcommand((s) => s.setName('open').setDescription('Set opening message')
        .addStringOption((o) => o.setName('message').setDescription('Message').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('embed-title').setDescription('Set opening embed title')
        .addStringOption((o) => o.setName('title').setDescription('Title').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('embed-color').setDescription('Set opening embed color')
        .addStringOption((o) => o.setName('color').setDescription('Hex color').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('close-ask').setDescription('Set close confirmation message')
        .addStringOption((o) => o.setName('message').setDescription('Message').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name'))))
    .addSubcommandGroup((g) => g.setName('naming').setDescription('Channel naming')
      .addSubcommand((s) => s.setName('opened').setDescription('Set opened name pattern')
        .addStringOption((o) => o.setName('pattern').setDescription('Pattern (use {number})').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('closed').setDescription('Set closed name pattern')
        .addStringOption((o) => o.setName('pattern').setDescription('Pattern (use {number})').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name'))))
    .addSubcommandGroup((g) => g.setName('transcript').setDescription('Transcript settings')
      .addSubcommand((s) => s.setName('on-close').setDescription('Send transcript on close')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('on-delete').setDescription('Send transcript on delete')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('format').setDescription('Set transcript format')
        .addStringOption((o) => o.setName('format').setDescription('Format').setRequired(true).addChoices({ name: 'HTML', value: 'html' }, { name: 'TXT', value: 'txt' }))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
      .addSubcommand((s) => s.setName('dm-opener').setDescription('DM transcript to opener')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Panel name'))))
    .addSubcommandGroup((g) => g.setName('escalate').setDescription('Escalation settings')
      .addSubcommand((s) => s.setName('add-target').setDescription('Add escalation target')
        .addStringOption((o) => o.setName('name').setDescription('Target name').setRequired(true))
        .addStringOption((o) => o.setName('target-panel').setDescription('Target panel name').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('panel').setDescription('Source panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('remove-target').setDescription('Remove escalation target')
        .addStringOption((o) => o.setName('name').setDescription('Target name').setRequired(true))
        .addStringOption((o) => o.setName('panel').setDescription('Source panel name').setAutocomplete(true)))
      .addSubcommand((s) => s.setName('list-targets').setDescription('List escalation targets')
        .addStringOption((o) => o.setName('panel').setDescription('Panel name').setAutocomplete(true)))),
  folder: 'admin',

  async execute(interaction, { config, saveConfig: saveCfg }) {
    const guildId = interaction.guildId;
    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);

    if (!canUseDashboard(interaction, guildConfig)) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'You need Admin or Dashboard Role.')], flags: MessageFlags.Ephemeral });
    }

    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (group === 'panel') {
      if (sub === 'create') {
        const name = interaction.options.getString('name', true);
        const panelId = `panel_${Date.now()}`;
        guildConfig.panels = guildConfig.panels || {};
        guildConfig.panels[panelId] = defaultPanelConfig(name);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Panel Created', `**${name}**`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'delete') {
        const name = interaction.options.getString('name', true);
        const entry = Object.entries(guildConfig.panels || {}).find(([, p]) => p.name.toLowerCase() === name.toLowerCase());
        if (!entry) return interaction.reply({ embeds: [embedBuilder.error('Not Found', `"${name}"`)] , flags: MessageFlags.Ephemeral });
        delete guildConfig.panels[entry[0]];
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Deleted', `**${name}**`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'view') {
        const panelName = interaction.options.getString('name');
        const result = getPanelOrReject(guildConfig, panelName);
        if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
        const p = result.panel;
        const to = p.ticketOptions;
        const fields = [
          { name: 'Category', value: to.categoryId ? `<#${to.categoryId}>` : 'Not set', inline: true },
          { name: 'Support', value: (p.supportRoles?.length || 0) > 0 ? p.supportRoles.map(r => `<@&${r}>`).join(' ') : 'None', inline: true },
          { name: 'Log', value: p.logOptions?.channelId ? `<#${p.logOptions.channelId}>` : 'Not set', inline: true },
        ];
        return interaction.reply({ embeds: [embedBuilder.info(`Panel: ${p.name}`, '').addFields(fields)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'category') {
        const category = interaction.options.getChannel('category', true);
        const panelName = interaction.options.getString('name');
        const result = getPanelOrReject(guildConfig, panelName);
        if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
        result.panel.ticketOptions.categoryId = category.id;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Category Set', `**${category.name}**`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'support') {
        const role = interaction.options.getRole('role', true);
        const panelName = interaction.options.getString('name');
        const result = getPanelOrReject(guildConfig, panelName);
        if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
        result.panel.supportRoles = result.panel.supportRoles || [];
        if (!result.panel.supportRoles.includes(role.id)) result.panel.supportRoles.push(role.id);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Support Role Added', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'remove-support') {
        const role = interaction.options.getRole('role', true);
        const panelName = interaction.options.getString('name');
        const result = getPanelOrReject(guildConfig, panelName);
        if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
        result.panel.supportRoles = result.panel.supportRoles || [];
        const idx = result.panel.supportRoles.indexOf(role.id);
        if (idx === -1) {
          return interaction.reply({ embeds: [embedBuilder.error('Not Found', `<@&${role.id}> is not a support role.`)], flags: MessageFlags.Ephemeral });
        }
        result.panel.supportRoles.splice(idx, 1);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Support Role Removed', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'embed-thumbnail') {
        const url = interaction.options.getString('url', true);
        const panelName = interaction.options.getString('name');
        const result = getPanelOrReject(guildConfig, panelName);
        if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
        result.panel.panelEmbed.thumbnailUrl = url.toLowerCase() === 'none' ? null : url;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Thumbnail Set', url.toLowerCase() === 'none' ? 'Removed' : url)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'embed-image') {
        const url = interaction.options.getString('url', true);
        const panelName = interaction.options.getString('name');
        const result = getPanelOrReject(guildConfig, panelName);
        if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
        result.panel.panelEmbed.imageUrl = url.toLowerCase() === 'none' ? null : url;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Image Set', url.toLowerCase() === 'none' ? 'Removed' : url)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'embed-footer') {
        const text = interaction.options.getString('text', true);
        const panelName = interaction.options.getString('name');
        const result = getPanelOrReject(guildConfig, panelName);
        if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
        result.panel.panelEmbed.footerText = text.toLowerCase() === 'none' ? null : text;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Footer Set', text.toLowerCase() === 'none' ? 'Removed' : text)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'embed-footer-icon') {
        const url = interaction.options.getString('url', true);
        const panelName = interaction.options.getString('name');
        const result = getPanelOrReject(guildConfig, panelName);
        if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
        result.panel.panelEmbed.footerIconUrl = url.toLowerCase() === 'none' ? null : url;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Footer Icon Set', url.toLowerCase() === 'none' ? 'Removed' : url)], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === 'channels') {
      const panelName = interaction.options.getString('panel');
      const result = getPanelOrReject(guildConfig, panelName);
      if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
      if (sub === 'log') {
        const channel = interaction.options.getChannel('channel', true);
        result.panel.logOptions.channelId = channel.id;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Log Channel', `<#${channel.id}>`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'transcript') {
        const channel = interaction.options.getChannel('channel', true);
        result.panel.transcriptOptions.channelId = channel.id;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Transcript Channel', `<#${channel.id}>`)], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === 'log-events') {
      const panelName = interaction.options.getString('panel');
      const result = getPanelOrReject(guildConfig, panelName);
      if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });

      if (sub === 'set') {
        const event = interaction.options.getString('event', true);
        const enabled = interaction.options.getBoolean('enabled', true);
        result.panel.logOptions[event] = enabled;
        saveCfg();
        const eventName = event.replace('log', '');
        return interaction.reply({ embeds: [embedBuilder.success('Log Event Updated', `${eventName}: ${enabled ? '? Enabled' : '? Disabled'}`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'view') {
        const lo = result.panel.logOptions;
        const events = [
          `Open: ${lo.logOpen !== false ? '?' : '?'}`,
          `Close: ${lo.logClose !== false ? '?' : '?'}`,
          `Delete: ${lo.logDelete !== false ? '?' : '?'}`,
          `Claim: ${lo.logClaim !== false ? '?' : '?'}`,
          `Rename: ${lo.logRename !== false ? '?' : '?'}`,
          `Escalate: ${lo.logEscalate !== false ? '?' : '?'}`,
          `Add/Remove: ${lo.logAddRemove !== false ? '?' : '?'}`,
        ].join('\n');
        return interaction.reply({ embeds: [embedBuilder.info('Log Events', `**Panel: ${result.panel.name}**\n\n${events}`)], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === 'settings') {
      if (sub === 'global') {
        guildConfig.server.globalTicketLimit = interaction.options.getInteger('limit', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Global Limit', `${guildConfig.server.globalTicketLimit}`)], flags: MessageFlags.Ephemeral });
      }
      const panelName = interaction.options.getString('panel');
      const result = getPanelOrReject(guildConfig, panelName);
      if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
      if (sub === 'limit') {
        result.panel.ticketOptions.maxPerUser = interaction.options.getInteger('max', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Max Per User', `${result.panel.ticketOptions.maxPerUser}`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'twostep') {
        result.panel.ticketOptions.twoStepClose = interaction.options.getBoolean('enabled', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Two-Step', result.panel.ticketOptions.twoStepClose ? 'Enabled' : 'Disabled')], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'claiming') {
        result.panel.claimingOptions.enabled = interaction.options.getBoolean('enabled', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Claiming', result.panel.claimingOptions.enabled ? 'Enabled' : 'Disabled')], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'autoclose') {
        result.panel.automationOptions.autoCloseEnabled = interaction.options.getBoolean('enabled', true);
        result.panel.automationOptions.autoCloseHours = interaction.options.getInteger('hours') || 24;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Auto-Close', result.panel.automationOptions.autoCloseEnabled ? `${result.panel.automationOptions.autoCloseHours}h` : 'Disabled')], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'private-thread') {
        result.panel.ticketOptions.privateThread = interaction.options.getBoolean('enabled', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Private Thread', result.panel.ticketOptions.privateThread ? 'Enabled' : 'Disabled')], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'thread-name') {
        const pattern = interaction.options.getString('pattern', true);
        result.panel.ticketOptions.privateThreadName = pattern;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Thread Name Pattern', pattern)], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === 'roles') {
      const role = interaction.options.getRole('role', true);
      if (sub === 'dashboard') {
        guildConfig.server.dashboardRoles = guildConfig.server.dashboardRoles || [];
        if (!guildConfig.server.dashboardRoles.includes(role.id)) guildConfig.server.dashboardRoles.push(role.id);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Dashboard Role', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'blacklist') {
        guildConfig.server.blacklistRoles = guildConfig.server.blacklistRoles || [];
        if (!guildConfig.server.blacklistRoles.includes(role.id)) guildConfig.server.blacklistRoles.push(role.id);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Blacklist Role', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
      }
      // Panel-specific role settings
      const panelName = interaction.options.getString('panel');
      const result = getPanelOrReject(guildConfig, panelName);
      if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
      if (sub === 'opened-add') {
        result.panel.ticketOptions.openedRolesAdd = result.panel.ticketOptions.openedRolesAdd || [];
        if (!result.panel.ticketOptions.openedRolesAdd.includes(role.id)) result.panel.ticketOptions.openedRolesAdd.push(role.id);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Opened Role Add', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'closed-add') {
        result.panel.ticketOptions.closedRolesAdd = result.panel.ticketOptions.closedRolesAdd || [];
        if (!result.panel.ticketOptions.closedRolesAdd.includes(role.id)) result.panel.ticketOptions.closedRolesAdd.push(role.id);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Closed Role Add', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'ping') {
        result.panel.ticketOptions.pingRoles = result.panel.ticketOptions.pingRoles || [];
        if (!result.panel.ticketOptions.pingRoles.includes(role.id)) result.panel.ticketOptions.pingRoles.push(role.id);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Ping Role', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === 'messages') {
      const panelName = interaction.options.getString('panel');
      const result = getPanelOrReject(guildConfig, panelName);
      if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
      if (sub === 'open') {
        result.panel.ticketOptions.openMessage = interaction.options.getString('message', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Open Message', 'Updated.')], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'embed-title') {
        result.panel.ticketOptions.openMessageEmbedTitle = interaction.options.getString('title', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Embed Title', result.panel.ticketOptions.openMessageEmbedTitle)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'embed-color') {
        const colorStr = interaction.options.getString('color', true);
        const color = parseHexColor(colorStr);
        if (color === null) return interaction.reply({ embeds: [embedBuilder.error('Invalid Color', 'Use hex format like #5865f2.')], flags: MessageFlags.Ephemeral });
        result.panel.ticketOptions.openMessageEmbedColor = color;
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Embed Color', colorStr)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'close-ask') {
        result.panel.ticketOptions.closeAskMessage = interaction.options.getString('message', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Close Ask Message', 'Updated.')], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === 'naming') {
      const panelName = interaction.options.getString('panel');
      const result = getPanelOrReject(guildConfig, panelName);
      if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
      if (sub === 'opened') {
        result.panel.ticketOptions.openedNamePattern = interaction.options.getString('pattern', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Opened Name', result.panel.ticketOptions.openedNamePattern)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'closed') {
        result.panel.ticketOptions.closedNamePattern = interaction.options.getString('pattern', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Closed Name', result.panel.ticketOptions.closedNamePattern)], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === 'transcript') {
      const panelName = interaction.options.getString('panel');
      const result = getPanelOrReject(guildConfig, panelName);
      if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });
      if (sub === 'on-close') {
        result.panel.transcriptOptions.sendOnClose = interaction.options.getBoolean('enabled', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Transcript On Close', result.panel.transcriptOptions.sendOnClose ? 'Enabled' : 'Disabled')], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'on-delete') {
        result.panel.transcriptOptions.sendOnDelete = interaction.options.getBoolean('enabled', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Transcript On Delete', result.panel.transcriptOptions.sendOnDelete ? 'Enabled' : 'Disabled')], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'format') {
        result.panel.transcriptOptions.format = interaction.options.getString('format', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Transcript Format', result.panel.transcriptOptions.format.toUpperCase())], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'dm-opener') {
        result.panel.transcriptOptions.dmOpenerOnClose = interaction.options.getBoolean('enabled', true);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('DM Opener', result.panel.transcriptOptions.dmOpenerOnClose ? 'Enabled' : 'Disabled')], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === 'escalate') {
      const panelName = interaction.options.getString('panel');
      const result = getPanelOrReject(guildConfig, panelName);
      if (result.error) return interaction.reply({ embeds: [embedBuilder.error('Error', result.error)], flags: MessageFlags.Ephemeral });

      result.panel.escalationOptions = result.panel.escalationOptions || { targets: [] };
      const targets = result.panel.escalationOptions.targets;

      if (sub === 'add-target') {
        const name = interaction.options.getString('name', true);
        const targetPanelName = interaction.options.getString('target-panel', true);

        // Find target panel
        const targetEntry = Object.entries(guildConfig.panels).find(
          ([, p]) => p.name.toLowerCase() === targetPanelName.toLowerCase()
        );
        if (!targetEntry) {
          return interaction.reply({ embeds: [embedBuilder.error('Not Found', `Panel "${targetPanelName}" not found.`)], flags: MessageFlags.Ephemeral });
        }

        const [targetPanelId, targetPanel] = targetEntry;

        // Check for duplicate name
        if (targets.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
          return interaction.reply({ embeds: [embedBuilder.error('Exists', `Target "${name}" already exists.`)], flags: MessageFlags.Ephemeral });
        }

        targets.push({
          name,
          panelId: targetPanelId,
          categoryId: targetPanel.ticketOptions?.categoryId,
          supportRoleId: targetPanel.supportRoles?.[0] || null,
        });
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Target Added', `Escalation target "${name}" ? panel "${targetPanel.name}" added.`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'remove-target') {
        const name = interaction.options.getString('name', true);
        const idx = targets.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
        if (idx === -1) {
          return interaction.reply({ embeds: [embedBuilder.error('Not Found', `Target "${name}" not found.`)], flags: MessageFlags.Ephemeral });
        }
        targets.splice(idx, 1);
        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Target Removed', `Escalation target "${name}" removed.`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'list-targets') {
        if (targets.length === 0) {
          return interaction.reply({ embeds: [embedBuilder.info('No Targets', 'No escalation targets configured.')], flags: MessageFlags.Ephemeral });
        }
        const list = targets.map((t) => `� **${t.name}** ? Panel ID: \`${t.panelId}\``).join('\n');
        return interaction.reply({ embeds: [embedBuilder.info('Escalation Targets', list)], flags: MessageFlags.Ephemeral });
      }
    }

    return interaction.reply({ embeds: [embedBuilder.error('Unknown', `${group}/${sub}`)], flags: MessageFlags.Ephemeral });
  },

  async autocomplete(interaction, { config }) {
    const guildId = interaction.guildId;
    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const focused = interaction.options.getFocused().toLowerCase();
    const focusedOption = interaction.options.getFocused(true);

    // Autocomplete panel names
    if (focusedOption.name === 'name' || focusedOption.name === 'panel' || focusedOption.name === 'target-panel') {
      const panels = Object.values(guildConfig.panels || {});
      const filtered = panels
        .filter((p) => p.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((p) => ({ name: p.name, value: p.name }));
      return interaction.respond(filtered);
    }

    return interaction.respond([]);
  },
};
