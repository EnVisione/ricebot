const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig, saveConfig } = require('../../utils/config');
const { canUseDashboard } = require('../../utils/permissions');
const { parseHexColor, isValidUrl } = require('../../utils/validator');
const { buildRRPanel } = require('../../reactionroles/rrBuilder');
const { checkRateLimit } = require('../../utils/rateLimiter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rradmin')
    .setDescription('Configure reaction roles.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Channel & style
    .addSubcommand((sub) => sub.setName('set-channel').setDescription('Set RR panel channel.')
      .addChannelOption((opt) => opt.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((sub) => sub.setName('set-style').setDescription('Set panel style.')
      .addStringOption((opt) => opt.setName('style').setDescription('Style').setRequired(true).addChoices({ name: 'Button', value: 'button' }, { name: 'Dropdown', value: 'dropdown' })))
    // Embed customization
    .addSubcommand((sub) => sub.setName('set-embed-title').setDescription('Set embed title.')
      .addStringOption((opt) => opt.setName('title').setDescription('Title').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-embed-description').setDescription('Set embed description.')
      .addStringOption((opt) => opt.setName('description').setDescription('Description').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-embed-color').setDescription('Set embed color.')
      .addStringOption((opt) => opt.setName('color').setDescription('Hex color').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-embed-thumbnail').setDescription('Set thumbnail URL.')
      .addStringOption((opt) => opt.setName('url').setDescription('URL').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-embed-image').setDescription('Set image URL.')
      .addStringOption((opt) => opt.setName('url').setDescription('URL').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-embed-footer').setDescription('Set footer text.')
      .addStringOption((opt) => opt.setName('text').setDescription('Footer text').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-compact').setDescription('Toggle compact mode.')
      .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enabled').setRequired(true)))
    // Role management
    .addSubcommand((sub) => sub.setName('add-role').setDescription('Add a role to the panel.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true))
      .addStringOption((opt) => opt.setName('label').setDescription('Button/dropdown label').setRequired(true))
      .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji'))
      .addStringOption((opt) => opt.setName('description').setDescription('Dropdown description'))
      .addStringOption((opt) => opt.setName('style').setDescription('Button style').addChoices(
        { name: 'Primary', value: 'Primary' },
        { name: 'Secondary', value: 'Secondary' },
        { name: 'Success', value: 'Success' },
        { name: 'Danger', value: 'Danger' }
      )))
    .addSubcommand((sub) => sub.setName('remove-role').setDescription('Remove a role from the panel.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-role-label').setDescription('Edit a role\'s label.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true))
      .addStringOption((opt) => opt.setName('label').setDescription('New label').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-role-emoji').setDescription('Edit a role\'s emoji.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true))
      .addStringOption((opt) => opt.setName('emoji').setDescription('New emoji').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-role-description').setDescription('Edit a role\'s dropdown description.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true))
      .addStringOption((opt) => opt.setName('description').setDescription('Dropdown description').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-role-style').setDescription('Edit a role\'s button style.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true))
      .addStringOption((opt) => opt.setName('style').setDescription('Button style').setRequired(true).addChoices(
        { name: 'Primary (Blue)', value: 'Primary' },
        { name: 'Secondary (Grey)', value: 'Secondary' },
        { name: 'Success (Green)', value: 'Success' },
        { name: 'Danger (Red)', value: 'Danger' }
      )))
    .addSubcommand((sub) => sub.setName('reorder').setDescription('Move a role to a new position.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to move').setRequired(true))
      .addIntegerOption((opt) => opt.setName('position').setDescription('New position (1-based)').setRequired(true).setMinValue(1).setMaxValue(25)))
    // Exclusive groups
    .addSubcommand((sub) => sub.setName('create-exclusive-group').setDescription('Create an exclusive group.')
      .addStringOption((opt) => opt.setName('name').setDescription('Group name').setRequired(true)))
    .addSubcommand((sub) => sub.setName('delete-exclusive-group').setDescription('Delete an exclusive group.')
      .addStringOption((opt) => opt.setName('name').setDescription('Group name').setRequired(true)))
    .addSubcommand((sub) => sub.setName('add-role-to-group').setDescription('Add role to exclusive group.')
      .addStringOption((opt) => opt.setName('group').setDescription('Group name').setRequired(true))
      .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((sub) => sub.setName('remove-role-from-group').setDescription('Remove role from exclusive group.')
      .addStringOption((opt) => opt.setName('group').setDescription('Group name').setRequired(true))
      .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true)))
    // Refresh & view
    .addSubcommand((sub) => sub.setName('refresh-panel').setDescription('Re-post the RR panel.'))
    .addSubcommand((sub) => sub.setName('view').setDescription('View RR configuration.'))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Reset RR config to defaults.')),
  folder: 'admin',

  async execute(interaction, { config, saveConfig: saveCfg }) {
    const guildId = interaction.guildId;
    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const rr = guildConfig.reactionRoles;

    if (!canUseDashboard(interaction, guildConfig)) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'You need Admin or a Dashboard Role.')], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    // SET CHANNEL
    if (sub === 'set-channel') {
      const channel = interaction.options.getChannel('channel', true);
      rr.channelId = channel.id;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Channel Set', `RR panel will post to <#${channel.id}>.`)], flags: MessageFlags.Ephemeral });
    }

    // SET STYLE
    if (sub === 'set-style') {
      const style = interaction.options.getString('style', true);
      rr.style = style;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Style Set', `Panel style: ${style}`)], flags: MessageFlags.Ephemeral });
    }

    // EMBED CUSTOMIZATION
    if (sub === 'set-embed-title') {
      rr.embedTitle = interaction.options.getString('title', true);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Title Set', `Title: ${rr.embedTitle}`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set-embed-description') {
      rr.embedDescription = interaction.options.getString('description', true);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Description Set', 'Embed description updated.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set-embed-color') {
      const colorStr = interaction.options.getString('color', true);
      const color = parseHexColor(colorStr);
      if (color === null) return interaction.reply({ embeds: [embedBuilder.error('Invalid Color', 'Use hex format like #ffffff.')], flags: MessageFlags.Ephemeral });
      rr.embedColor = color;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Color Set', `Color: \`${colorStr}\``)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set-embed-thumbnail') {
      const url = interaction.options.getString('url', true);
      if (!isValidUrl(url)) return interaction.reply({ embeds: [embedBuilder.error('Invalid URL', 'Provide a valid http/https URL.')], flags: MessageFlags.Ephemeral });
      rr.embedThumbnailUrl = url;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Thumbnail Set', 'Thumbnail URL updated.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set-embed-image') {
      const url = interaction.options.getString('url', true);
      if (!isValidUrl(url)) return interaction.reply({ embeds: [embedBuilder.error('Invalid URL', 'Provide a valid http/https URL.')], flags: MessageFlags.Ephemeral });
      rr.embedImageUrl = url;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Image Set', 'Image URL updated.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set-embed-footer') {
      rr.embedFooterText = interaction.options.getString('text', true);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Footer Set', `Footer: ${rr.embedFooterText}`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set-compact') {
      rr.compact = interaction.options.getBoolean('enabled', true);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Compact Mode', rr.compact ? 'Enabled' : 'Disabled')], flags: MessageFlags.Ephemeral });
    }

    // ADD ROLE
    if (sub === 'add-role') {
      const role = interaction.options.getRole('role', true);
      const label = interaction.options.getString('label', true);
      const emoji = interaction.options.getString('emoji');
      const description = interaction.options.getString('description');
      const style = interaction.options.getString('style') || 'Secondary';

      if (rr.roles.length >= 25) {
        return interaction.reply({ embeds: [embedBuilder.error('Limit Reached', 'Maximum 25 roles.')], flags: MessageFlags.Ephemeral });
      }

      if (rr.roles.some((r) => r.roleId === role.id)) {
        return interaction.reply({ embeds: [embedBuilder.error('Already Added', 'This role is already in the panel.')], flags: MessageFlags.Ephemeral });
      }

      rr.roles.push({ roleId: role.id, label, emoji, description, style });
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Role Added', `<@&${role.id}> added with label "${label}".`)], flags: MessageFlags.Ephemeral });
    }

    // REMOVE ROLE
    if (sub === 'remove-role') {
      const role = interaction.options.getRole('role', true);
      const idx = rr.roles.findIndex((r) => r.roleId === role.id);
      if (idx === -1) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Role not in panel.')], flags: MessageFlags.Ephemeral });
      rr.roles.splice(idx, 1);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Role Removed', `<@&${role.id}> removed.`)], flags: MessageFlags.Ephemeral });
    }

    // SET ROLE LABEL
    if (sub === 'set-role-label') {
      const role = interaction.options.getRole('role', true);
      const label = interaction.options.getString('label', true);
      const entry = rr.roles.find((r) => r.roleId === role.id);
      if (!entry) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Role not in panel.')], flags: MessageFlags.Ephemeral });
      entry.label = label;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Label Updated', `<@&${role.id}> label: "${label}"`)], flags: MessageFlags.Ephemeral });
    }

    // SET ROLE EMOJI
    if (sub === 'set-role-emoji') {
      const role = interaction.options.getRole('role', true);
      const emoji = interaction.options.getString('emoji', true);
      const entry = rr.roles.find((r) => r.roleId === role.id);
      if (!entry) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Role not in panel.')], flags: MessageFlags.Ephemeral });
      entry.emoji = emoji;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Emoji Updated', `<@&${role.id}> emoji: ${emoji}`)], flags: MessageFlags.Ephemeral });
    }

    // SET ROLE DESCRIPTION (for dropdown mode)
    if (sub === 'set-role-description') {
      const role = interaction.options.getRole('role', true);
      const description = interaction.options.getString('description', true);
      const entry = rr.roles.find((r) => r.roleId === role.id);
      if (!entry) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Role not in panel.')], flags: MessageFlags.Ephemeral });
      entry.description = description;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Description Updated', `<@&${role.id}> description: "${description}"`)], flags: MessageFlags.Ephemeral });
    }

    // SET ROLE STYLE (for button mode)
    if (sub === 'set-role-style') {
      const role = interaction.options.getRole('role', true);
      const style = interaction.options.getString('style', true);
      const entry = rr.roles.find((r) => r.roleId === role.id);
      if (!entry) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Role not in panel.')], flags: MessageFlags.Ephemeral });
      entry.style = style;
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Style Updated', `<@&${role.id}> style: ${style}`)], flags: MessageFlags.Ephemeral });
    }

    // REORDER ROLE
    if (sub === 'reorder') {
      const role = interaction.options.getRole('role', true);
      const newPosition = interaction.options.getInteger('position', true);

      const currentIdx = rr.roles.findIndex((r) => r.roleId === role.id);
      if (currentIdx === -1) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Role not in panel.')], flags: MessageFlags.Ephemeral });

      const targetIdx = Math.min(Math.max(newPosition - 1, 0), rr.roles.length - 1);

      // Remove from current position and insert at new position
      const [roleEntry] = rr.roles.splice(currentIdx, 1);
      rr.roles.splice(targetIdx, 0, roleEntry);

      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Role Reordered', `<@&${role.id}> moved to position ${targetIdx + 1}.`)], flags: MessageFlags.Ephemeral });
    }

    // EXCLUSIVE GROUPS
    if (sub === 'create-exclusive-group') {
      const name = interaction.options.getString('name', true);
      rr.exclusiveGroups = rr.exclusiveGroups || [];
      if (rr.exclusiveGroups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
        return interaction.reply({ embeds: [embedBuilder.error('Already Exists', 'Group already exists.')], flags: MessageFlags.Ephemeral });
      }
      rr.exclusiveGroups.push({ name, roleIds: [] });
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Group Created', `Exclusive group "${name}" created.`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'delete-exclusive-group') {
      const name = interaction.options.getString('name', true);
      const idx = (rr.exclusiveGroups || []).findIndex((g) => g.name.toLowerCase() === name.toLowerCase());
      if (idx === -1) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Group not found.')], flags: MessageFlags.Ephemeral });
      rr.exclusiveGroups.splice(idx, 1);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Group Deleted', `Group "${name}" deleted.`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'add-role-to-group') {
      const groupName = interaction.options.getString('group', true);
      const role = interaction.options.getRole('role', true);
      const group = (rr.exclusiveGroups || []).find((g) => g.name.toLowerCase() === groupName.toLowerCase());
      if (!group) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Group not found.')], flags: MessageFlags.Ephemeral });
      if (!group.roleIds.includes(role.id)) group.roleIds.push(role.id);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Role Added to Group', `<@&${role.id}> added to "${groupName}".`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove-role-from-group') {
      const groupName = interaction.options.getString('group', true);
      const role = interaction.options.getRole('role', true);
      const group = (rr.exclusiveGroups || []).find((g) => g.name.toLowerCase() === groupName.toLowerCase());
      if (!group) return interaction.reply({ embeds: [embedBuilder.error('Not Found', 'Group not found.')], flags: MessageFlags.Ephemeral });
      group.roleIds = group.roleIds.filter((r) => r !== role.id);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Role Removed from Group', `<@&${role.id}> removed from "${groupName}".`)], flags: MessageFlags.Ephemeral });
    }

    // REFRESH PANEL
    if (sub === 'refresh-panel') {
      // Rate limit: 30 second cooldown
      const rl = checkRateLimit(interaction.user.id, 'rr:refresh', 30000);
      if (!rl.allowed) {
        const secs = Math.ceil(rl.remainingMs / 1000);
        return interaction.reply({ embeds: [embedBuilder.error('Cooldown', `Please wait ${secs} seconds before refreshing again.`)], flags: MessageFlags.Ephemeral });
      }

      const channelId = rr.channelId || interaction.channel.id;
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ embeds: [embedBuilder.error('Channel Not Found', 'Set a channel first.')], flags: MessageFlags.Ephemeral });

      if (rr.roles.length === 0) {
        return interaction.reply({ embeds: [embedBuilder.error('No Roles', 'Add roles first with /rradmin add-role.')], flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { embed, components } = buildRRPanel(rr, guildId);
      const msg = await channel.send({ embeds: [embed], components });
      rr.panelMessageId = msg.id;
      rr.channelId = channel.id;
      saveCfg();

      await interaction.editReply({ embeds: [embedBuilder.success('Panel Posted', `[Jump to panel](${msg.url})`)] });
      return;
    }

    // VIEW
    if (sub === 'view') {
      const fields = [
        { name: 'Channel', value: rr.channelId ? `<#${rr.channelId}>` : 'Not set', inline: true },
        { name: 'Style', value: rr.style || 'button', inline: true },
        { name: 'Roles', value: String(rr.roles?.length || 0), inline: true },
        { name: 'Exclusive Groups', value: String(rr.exclusiveGroups?.length || 0), inline: true },
        { name: 'Compact', value: rr.compact ? 'Yes' : 'No', inline: true },
      ];

      if (rr.roles?.length > 0) {
        const roleList = rr.roles.slice(0, 10).map((r, idx) => {
          const emoji = r.emoji ? `${r.emoji} ` : '';
          const style = r.style ? ` [${r.style}]` : '';
          return `${idx + 1}. ${emoji}<@&${r.roleId}> — ${r.label}${style}`;
        }).join('\n');
        fields.push({ name: 'Configured Roles', value: roleList, inline: false });

        if (rr.roles.length > 10) {
          fields.push({ name: '', value: `*...and ${rr.roles.length - 10} more*`, inline: false });
        }
      }

      // Show exclusive groups with their roles
      if (rr.exclusiveGroups?.length > 0) {
        const groupList = rr.exclusiveGroups.map((g) => {
          const roleCount = g.roleIds?.length || 0;
          const roles = roleCount > 0
            ? g.roleIds.slice(0, 3).map((id) => `<@&${id}>`).join(', ') + (roleCount > 3 ? ` +${roleCount - 3}` : '')
            : '*empty*';
          return `**${g.name}**: ${roles}`;
        }).join('\n');
        fields.push({ name: 'Exclusive Groups (selecting one removes others)', value: groupList, inline: false });
      }

      const embed = embedBuilder.info('Reaction Roles Config', 'Current configuration:').addFields(fields);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // RESET
    if (sub === 'reset') {
      guildConfig.reactionRoles = {
        channelId: null,
        panelMessageId: null,
        style: 'button',
        embedTitle: 'Choose Your Roles',
        embedDescription: 'Select roles below.',
        embedColor: 0xffffff,
        embedThumbnailUrl: null,
        embedImageUrl: null,
        embedFooterText: null,
        compact: false,
        roles: [],
        exclusiveGroups: [],
      };
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Reset', 'Reaction roles config has been reset.')], flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ embeds: [embedBuilder.error('Unknown Subcommand', `"${sub}" not implemented.`)], flags: MessageFlags.Ephemeral });
  },
};

