const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { canUseDashboard } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverconfig')
    .setDescription('Configure server-wide bot settings.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('view').setDescription('View current server settings'))
    .addSubcommand((s) => s.setName('global-limit').setDescription('Set global ticket limit per user')
      .addIntegerOption((o) => o.setName('limit').setDescription('Max tickets').setRequired(true).setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('add-dashboard-role').setDescription('Add a dashboard role')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('remove-dashboard-role').setDescription('Remove a dashboard role')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('add-blacklist-role').setDescription('Add a blacklist role')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('remove-blacklist-role').setDescription('Remove a blacklist role')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('add-storage-category').setDescription('Add a storage category for channel recycling')
      .addChannelOption((o) => o.setName('category').setDescription('Category').setRequired(true).addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand((s) => s.setName('remove-storage-category').setDescription('Remove a storage category')
      .addChannelOption((o) => o.setName('category').setDescription('Category').setRequired(true).addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand((s) => s.setName('phantom-ping').setDescription('Configure phantom ping on member join')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Enable/disable').setRequired(true))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to ping in').addChannelTypes(ChannelType.GuildText))),
  folder: 'admin',

  async execute(interaction, { config, saveConfig: saveCfg }) {
    const guildId = interaction.guildId;
    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);

    if (!canUseDashboard(interaction, guildConfig)) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'You need Admin or Dashboard Role.')], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();
    const server = guildConfig.server;

    if (sub === 'view') {
      const dashRoles = (server.dashboardRoles || []).map((r) => `<@&${r}>`).join(', ') || 'None';
      const blRoles = (server.blacklistRoles || []).map((r) => `<@&${r}>`).join(', ') || 'None';
      const storageCats = (server.storageCategories || []).map((c) => `<#${c}>`).join(', ') || 'None';
      const pp = server.phantomPing?.enabled ? `✅ <#${server.phantomPing.channelId}>` : '❌ Disabled';

      const embed = embedBuilder.info('Server Configuration', '')
        .addFields(
          { name: 'Global Ticket Limit', value: String(server.globalTicketLimit || 1), inline: true },
          { name: 'Dashboard Roles', value: dashRoles, inline: false },
          { name: 'Blacklist Roles', value: blRoles, inline: false },
          { name: 'Storage Categories', value: storageCats, inline: false },
          { name: 'Phantom Ping', value: pp, inline: true }
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'global-limit') {
      server.globalTicketLimit = interaction.options.getInteger('limit', true);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Global Limit', `Set to ${server.globalTicketLimit}`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'add-dashboard-role') {
      const role = interaction.options.getRole('role', true);
      server.dashboardRoles = server.dashboardRoles || [];
      if (!server.dashboardRoles.includes(role.id)) {
        server.dashboardRoles.push(role.id);
        saveCfg();
      }
      return interaction.reply({ embeds: [embedBuilder.success('Dashboard Role Added', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove-dashboard-role') {
      const role = interaction.options.getRole('role', true);
      server.dashboardRoles = (server.dashboardRoles || []).filter((r) => r !== role.id);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Dashboard Role Removed', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'add-blacklist-role') {
      const role = interaction.options.getRole('role', true);
      server.blacklistRoles = server.blacklistRoles || [];
      if (!server.blacklistRoles.includes(role.id)) {
        server.blacklistRoles.push(role.id);
        saveCfg();
      }
      return interaction.reply({ embeds: [embedBuilder.success('Blacklist Role Added', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove-blacklist-role') {
      const role = interaction.options.getRole('role', true);
      server.blacklistRoles = (server.blacklistRoles || []).filter((r) => r !== role.id);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Blacklist Role Removed', `<@&${role.id}>`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'add-storage-category') {
      const category = interaction.options.getChannel('category', true);
      server.storageCategories = server.storageCategories || [];
      if (!server.storageCategories.includes(category.id)) {
        server.storageCategories.push(category.id);
        saveCfg();
      }
      return interaction.reply({ embeds: [embedBuilder.success('Storage Category Added', `<#${category.id}>`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove-storage-category') {
      const category = interaction.options.getChannel('category', true);
      server.storageCategories = (server.storageCategories || []).filter((c) => c !== category.id);
      saveCfg();
      return interaction.reply({ embeds: [embedBuilder.success('Storage Category Removed', `<#${category.id}>`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'phantom-ping') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const channel = interaction.options.getChannel('channel');

      server.phantomPing = server.phantomPing || { enabled: false, channelId: null };
      server.phantomPing.enabled = enabled;

      if (channel) {
        server.phantomPing.channelId = channel.id;
      }

      if (enabled && !server.phantomPing.channelId) {
        return interaction.reply({ embeds: [embedBuilder.error('Missing Channel', 'Specify a channel to enable phantom ping.')], flags: MessageFlags.Ephemeral });
      }

      saveCfg();
      return interaction.reply({
        embeds: [embedBuilder.success('Phantom Ping', enabled ? `Enabled in <#${server.phantomPing.channelId}>` : 'Disabled')],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({ embeds: [embedBuilder.error('Unknown', `Subcommand ${sub} not implemented.`)], flags: MessageFlags.Ephemeral });
  },
};

