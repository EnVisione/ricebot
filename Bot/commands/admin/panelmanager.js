const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig, defaultPanelConfig, deepMerge } = require('../../utils/config');
const { canUseDashboard } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panelmanager')
    .setDescription('Manage ticket panels.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('list').setDescription('List all panels'))
    .addSubcommand((s) => s.setName('create').setDescription('Create a new panel')
      .addStringOption((o) => o.setName('name').setDescription('Panel name').setRequired(true)))
    .addSubcommand((s) => s.setName('clone').setDescription('Clone an existing panel')
      .addStringOption((o) => o.setName('source').setDescription('Source panel name').setRequired(true))
      .addStringOption((o) => o.setName('name').setDescription('New panel name').setRequired(true)))
    .addSubcommand((s) => s.setName('rename').setDescription('Rename a panel')
      .addStringOption((o) => o.setName('panel').setDescription('Panel name').setRequired(true))
      .addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true)))
    .addSubcommand((s) => s.setName('delete').setDescription('Delete a panel')
      .addStringOption((o) => o.setName('panel').setDescription('Panel name').setRequired(true)))
    .addSubcommand((s) => s.setName('set-count').setDescription('Set ticket counter for a panel')
      .addIntegerOption((o) => o.setName('number').setDescription('Counter value').setRequired(true).setMinValue(0))
      .addStringOption((o) => o.setName('panel').setDescription('Panel name')))
    .addSubcommand((s) => s.setName('export').setDescription('Export all config as JSON'))
    .addSubcommand((s) => s.setName('import').setDescription('Import config from JSON')
      .addStringOption((o) => o.setName('data').setDescription('JSON data').setRequired(true))),
  folder: 'admin',

  async execute(interaction, { config, saveConfig: saveCfg }) {
    const guildId = interaction.guildId;
    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);

    if (!canUseDashboard(interaction, guildConfig)) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'You need Admin or Dashboard Role.')], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();
    guildConfig.panels = guildConfig.panels || {};

    if (sub === 'list') {
      const panelIds = Object.keys(guildConfig.panels);
      if (panelIds.length === 0) {
        return interaction.reply({ embeds: [embedBuilder.info('No Panels', 'Create one with `/panelmanager create`.')], flags: MessageFlags.Ephemeral });
      }

      const lines = panelIds.map((pid) => {
        const p = guildConfig.panels[pid];
        const cat = p.ticketOptions?.categoryId ? '✅' : '❌';
        const sup = (p.supportRoles?.length || 0) > 0 ? '✅' : '❌';
        return `**${p.name}** - Category: ${cat} Support: ${sup} Counter: ${p.ticketOptions?.ticketCounter || 0}`;
      });

      return interaction.reply({ embeds: [embedBuilder.info('Panels', lines.join('\n'))], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'create') {
      const name = interaction.options.getString('name', true);

      // Check for duplicate name
      const existing = Object.values(guildConfig.panels).find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        return interaction.reply({ embeds: [embedBuilder.error('Duplicate Name', `A panel named "${name}" already exists.`)], flags: MessageFlags.Ephemeral });
      }

      const panelId = `panel_${Date.now()}`;
      guildConfig.panels[panelId] = defaultPanelConfig(name);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Panel Created', `**${name}** created.`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'clone') {
      const sourceName = interaction.options.getString('source', true);
      const newName = interaction.options.getString('name', true);

      const sourceEntry = Object.entries(guildConfig.panels).find(([, p]) => p.name.toLowerCase() === sourceName.toLowerCase());
      if (!sourceEntry) {
        return interaction.reply({ embeds: [embedBuilder.error('Not Found', `Panel "${sourceName}" not found.`)], flags: MessageFlags.Ephemeral });
      }

      // Check for duplicate name
      const existing = Object.values(guildConfig.panels).find((p) => p.name.toLowerCase() === newName.toLowerCase());
      if (existing) {
        return interaction.reply({ embeds: [embedBuilder.error('Duplicate Name', `A panel named "${newName}" already exists.`)], flags: MessageFlags.Ephemeral });
      }

      // Deep clone the source panel
      const newPanelId = `panel_${Date.now()}`;
      const cloned = JSON.parse(JSON.stringify(sourceEntry[1]));
      cloned.name = newName;
      cloned.ticketOptions.ticketCounter = 0; // Reset counter
      cloned.postedAt = null;
      cloned.postedChannelId = null;

      guildConfig.panels[newPanelId] = cloned;
      saveCfg();

      return interaction.reply({
        embeds: [embedBuilder.success('Panel Cloned', `**${newName}** cloned from **${sourceName}**.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'rename') {
      const panelName = interaction.options.getString('panel', true);
      const newName = interaction.options.getString('name', true);

      const entry = Object.entries(guildConfig.panels).find(([, p]) => p.name.toLowerCase() === panelName.toLowerCase());
      if (!entry) {
        return interaction.reply({ embeds: [embedBuilder.error('Not Found', `Panel "${panelName}" not found.`)], flags: MessageFlags.Ephemeral });
      }

      entry[1].name = newName;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Renamed', `**${panelName}** → **${newName}**`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'delete') {
      const panelName = interaction.options.getString('panel', true);

      const entry = Object.entries(guildConfig.panels).find(([, p]) => p.name.toLowerCase() === panelName.toLowerCase());
      if (!entry) {
        return interaction.reply({ embeds: [embedBuilder.error('Not Found', `Panel "${panelName}" not found.`)], flags: MessageFlags.Ephemeral });
      }

      delete guildConfig.panels[entry[0]];
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Deleted', `**${panelName}** deleted.`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set-count') {
      const number = interaction.options.getInteger('number', true);
      const panelName = interaction.options.getString('panel');

      let panel;
      const panelIds = Object.keys(guildConfig.panels);

      if (panelName) {
        const entry = Object.entries(guildConfig.panels).find(([, p]) => p.name.toLowerCase() === panelName.toLowerCase());
        if (!entry) {
          return interaction.reply({ embeds: [embedBuilder.error('Not Found', `Panel "${panelName}" not found.`)], flags: MessageFlags.Ephemeral });
        }
        panel = entry[1];
      } else if (panelIds.length === 1) {
        panel = guildConfig.panels[panelIds[0]];
      } else {
        return interaction.reply({ embeds: [embedBuilder.error('Specify Panel', 'Multiple panels exist.')], flags: MessageFlags.Ephemeral });
      }

      panel.ticketOptions.ticketCounter = number;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Counter Set', `${panel.name}: ${number}`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'export') {
      const exportData = {
        meta: guildConfig.meta,
        server: guildConfig.server,
        panels: guildConfig.panels,
        reactionRoles: guildConfig.reactionRoles,
      };

      const json = JSON.stringify(exportData, null, 2);

      // If too long, truncate
      if (json.length > 1900) {
        return interaction.reply({
          content: `\`\`\`json\n${json.slice(0, 1800)}...\n\`\`\`\n**Config too large for Discord.** Contact support for full export.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({ content: `\`\`\`json\n${json}\n\`\`\``, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'import') {
      const data = interaction.options.getString('data', true);

      // Security: limit input size
      if (data.length > 50000) {
        return interaction.reply({ embeds: [embedBuilder.error('Too Large', 'Import data exceeds 50,000 characters.')], flags: MessageFlags.Ephemeral });
      }

      try {
        const parsed = JSON.parse(data);

        // Security: must be a plain object
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return interaction.reply({ embeds: [embedBuilder.error('Invalid Format', 'Must be a JSON object.')], flags: MessageFlags.Ephemeral });
        }

        // Whitelist allowed top-level keys
        const allowedKeys = ['meta', 'server', 'panels', 'reactionRoles'];
        for (const key of Object.keys(parsed)) {
          if (!allowedKeys.includes(key)) {
            delete parsed[key];
          }
        }

        // Validate structure
        if (!parsed.panels && !parsed.server && !parsed.reactionRoles) {
          return interaction.reply({ embeds: [embedBuilder.error('Invalid Data', 'Must contain panels, server, or reactionRoles.')], flags: MessageFlags.Ephemeral });
        }

        // Validate snowflake IDs in panels
        if (parsed.panels) {
          for (const [, panel] of Object.entries(parsed.panels)) {
            if (panel.ticketOptions?.categoryId && !/^\d{17,19}$/.test(panel.ticketOptions.categoryId)) {
              panel.ticketOptions.categoryId = null;
            }
            if (panel.logOptions?.channelId && !/^\d{17,19}$/.test(panel.logOptions.channelId)) {
              panel.logOptions.channelId = null;
            }
            if (panel.transcriptOptions?.channelId && !/^\d{17,19}$/.test(panel.transcriptOptions.channelId)) {
              panel.transcriptOptions.channelId = null;
            }
            // Validate supportRoles array
            if (panel.supportRoles) {
              panel.supportRoles = panel.supportRoles.filter((r) => /^\d{17,19}$/.test(r));
            }
          }
        }

        // Merge carefully
        if (parsed.server) {
          guildConfig.server = deepMerge(guildConfig.server, parsed.server);
        }
        if (parsed.panels) {
          for (const [pid, panel] of Object.entries(parsed.panels)) {
            guildConfig.panels[pid] = deepMerge(guildConfig.panels[pid] || {}, panel);
          }
        }
        if (parsed.reactionRoles) {
          guildConfig.reactionRoles = deepMerge(guildConfig.reactionRoles, parsed.reactionRoles);
        }

        saveCfg();
        return interaction.reply({ embeds: [embedBuilder.success('Imported', 'Config has been imported/merged.')], flags: MessageFlags.Ephemeral });
      } catch (e) {
        return interaction.reply({ embeds: [embedBuilder.error('Parse Error', `Invalid JSON: ${e.message}`)], flags: MessageFlags.Ephemeral });
      }
    }

    return interaction.reply({ embeds: [embedBuilder.error('Unknown', `Subcommand ${sub} not implemented.`)], flags: MessageFlags.Ephemeral });
  },
};

