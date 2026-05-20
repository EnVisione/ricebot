const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const { isGuildOwner, isAdmin, hasDashboardRole, isBlacklisted } = require('../../utils/permissions');

const CRITICAL_PERMS = [
  'ManageChannels',
  'ManageRoles',
  'ViewChannel',
  'SendMessages',
  'ManageMessages',
  'CreatePrivateThreads',
  'EmbedLinks',
  'AttachFiles',
  'ReadMessageHistory',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debug')
    .setDescription('Show debug info for this channel and bot permissions.'),

  async execute(interaction, { config, ticketState }) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const me = guild.members.me;
    const guildConfig = getGuildConfig(config, guild.id, guild.name);
    const guildTickets = getGuildTickets(ticketState, guild.id);

    const lines = [];

    // Guild Info
    lines.push('**== Guild Info ==**');
    lines.push(`Guild ID: \`${guild.id}\``);
    lines.push(`Guild Name: ${guild.name}`);
    lines.push(`Member Count: ${guild.memberCount}`);
    lines.push(`Bot Joined: <t:${Math.floor(me.joinedTimestamp / 1000)}:F>`);
    lines.push('');

    // Channel Info
    lines.push('**== Channel Info ==**');
    lines.push(`Channel ID: \`${channel.id}\``);
    lines.push(`Type: ${ChannelType[channel.type] || channel.type}`);
    lines.push(`Category: ${channel.parent?.name || 'None'} (\`${channel.parentId || 'N/A'}\`)`);

    const ticket = guildTickets[channel.id];
    if (ticket) {
      lines.push(`**This is a ticket channel**`);
      lines.push(`  State: ${ticket.state}`);
      lines.push(`  Panel: ${ticket.panelName} (\`${ticket.panelId}\`)`);
      lines.push(`  Opened By: <@${ticket.openedBy}>`);
      lines.push(`  Claimed By: ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'}`);
    } else {
      lines.push('This is not a ticket channel.');
    }
    lines.push('');

    // Bot Permissions
    lines.push('**== Bot Permissions (This Channel) ==**');
    const perms = channel.permissionsFor(me);
    for (const p of CRITICAL_PERMS) {
      const has = perms?.has(p);
      const icon = has ? '✅' : '❌';
      lines.push(`${icon} ${p}`);
    }
    lines.push('');

    // Role Hierarchy
    lines.push('**== Bot Role Hierarchy ==**');
    const botRole = me.roles.highest;
    lines.push(`Bot's highest role: ${botRole.name} (position ${botRole.position})`);

    const allSupportRoles = new Set();
    for (const p of Object.values(guildConfig.panels || {})) {
      for (const rid of p.supportRoles || []) allSupportRoles.add(rid);
    }
    for (const r of guildConfig.reactionRoles?.roles || []) {
      if (r.roleId) allSupportRoles.add(r.roleId);
    }

    for (const rid of allSupportRoles) {
      const role = guild.roles.cache.get(rid);
      if (!role) {
        lines.push(`⚠️ Role \`${rid}\` not found`);
        continue;
      }
      const below = role.position >= botRole.position;
      lines.push(`${below ? '⚠️' : '✅'} ${role.name} (pos ${role.position})${below ? ' — bot cannot manage' : ''}`);
    }
    lines.push('');

    // Your Permission Level
    lines.push('**== Your Permission Level ==**');
    const member = interaction.member;
    if (isGuildOwner(interaction)) {
      lines.push('🔱 Guild Owner — all actions permitted');
    } else if (isAdmin(interaction)) {
      lines.push('🛡️ Administrator — all bot commands permitted');
    } else if (hasDashboardRole(member, guildConfig)) {
      lines.push('📋 Dashboard Role — can configure tickets/RR');
    } else {
      lines.push('👤 Regular User — standard permissions');
    }
    if (isBlacklisted(member, guildConfig)) {
      lines.push('🚫 **You are blacklisted** from opening tickets');
    }
    lines.push('');

    // Config Completeness
    lines.push('**== Config Completeness ==**');
    for (const [pid, p] of Object.entries(guildConfig.panels || {})) {
      const catOk = !!p.ticketOptions?.categoryId;
      const suppOk = (p.supportRoles?.length || 0) > 0;
      lines.push(`Panel "${p.name}": Category ${catOk ? '✅' : '❌'} | Support ${suppOk ? '✅' : '❌'}`);
    }

    // Debug mode raw config
    if (process.env.DEBUG === 'true') {
      lines.push('');
      lines.push('**== Raw Config (DEBUG) ==**');
      const sanitized = JSON.stringify(guildConfig, null, 2).slice(0, 800);
      lines.push('```json\n' + sanitized + '\n```');
    }

    const content = lines.join('\n');
    if (content.length > 4000) {
      // Split into chunks
      await interaction.reply({ content: '```\n' + content.slice(0, 1900) + '\n```', flags: MessageFlags.Ephemeral });
      await interaction.followUp({ content: '```\n' + content.slice(1900, 3800) + '\n```', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  },
};

