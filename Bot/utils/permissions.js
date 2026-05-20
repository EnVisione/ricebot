const { PermissionFlagsBits } = require('discord.js');

function isGuildOwner(interaction) {
  return interaction.guild && interaction.user && interaction.guild.ownerId === interaction.user.id;
}

function isAdmin(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

function hasDashboardRole(member, guildConfig) {
  const roles = guildConfig?.server?.dashboardRoles || [];
  if (!roles.length) return false;
  return roles.some((rid) => member.roles.cache.has(rid));
}

function isBlacklisted(member, guildConfig) {
  const bl = guildConfig?.server?.blacklistRoles || [];
  if (!bl.length) return false;
  return bl.some((rid) => member.roles.cache.has(rid));
}

function canUseDashboard(interaction, guildConfig) {
  if (isGuildOwner(interaction)) return true;
  if (isAdmin(interaction)) return true;
  return hasDashboardRole(interaction.member, guildConfig);
}

// Check if member is on the support team for a specific panel
function isSupportTeam(member, panelConfig) {
  const supportRoles = panelConfig?.supportRoles || [];
  if (!supportRoles.length) return false;
  return supportRoles.some((rid) => member.roles.cache.has(rid));
}

// Get permission level for a member
function getPermissionLevel(member, guildConfig) {
  if (!member || !member.guild) return 'user';

  // Guild owner
  if (member.guild.ownerId === member.id) return 'owner';

  // Admin permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 'admin';

  // Check if support on any panel
  const panels = Object.values(guildConfig?.panels || {});
  for (const panel of panels) {
    if (isSupportTeam(member, panel)) return 'support';
  }

  // Check dashboard role
  if (hasDashboardRole(member, guildConfig)) return 'support';

  return 'user';
}

// Check if member can act on a ticket (considering claiming restrictions)
function canActOnTicket(member, ticketData, panelConfig) {
  // Admin always can
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // Guild owner always can
  if (member.guild.ownerId === member.id) return true;

  // Ticket opener can always act on their own ticket
  if (ticketData.openedBy === member.id) return true;

  // Check support team
  if (!isSupportTeam(member, panelConfig)) return false;

  // Check claiming restrictions
  if (panelConfig.claimingOptions?.onlyClaimerCanAct) {
    if (ticketData.claimedBy && ticketData.claimedBy !== member.id) {
      return false;
    }
  }

  return true;
}

// Validate bot hierarchy against roles it needs to manage
function validateBotHierarchy(guild, panelConfig, rrConfig) {
  const violations = [];
  const botMember = guild.members.me;
  if (!botMember) return violations;

  const botHighestRole = botMember.roles.highest;

  // Check support roles
  for (const roleId of panelConfig?.supportRoles || []) {
    const role = guild.roles.cache.get(roleId);
    if (role && role.position >= botHighestRole.position) {
      violations.push({ type: 'support', role: role.name, roleId });
    }
  }

  // Check RR roles
  for (const rrRole of rrConfig?.roles || []) {
    const role = guild.roles.cache.get(rrRole.roleId);
    if (role && role.position >= botHighestRole.position) {
      violations.push({ type: 'reactionrole', role: role.name, roleId: rrRole.roleId });
    }
  }

  // Check opened/closed role changes
  const rolesToCheck = [
    ...(panelConfig?.ticketOptions?.openedRolesAdd || []),
    ...(panelConfig?.ticketOptions?.openedRolesRemove || []),
    ...(panelConfig?.ticketOptions?.closedRolesAdd || []),
    ...(panelConfig?.ticketOptions?.closedRolesRemove || []),
  ];

  for (const roleId of rolesToCheck) {
    const role = guild.roles.cache.get(roleId);
    if (role && role.position >= botHighestRole.position) {
      violations.push({ type: 'rolechange', role: role.name, roleId });
    }
  }

  return violations;
}

module.exports = {
  isGuildOwner,
  isAdmin,
  hasDashboardRole,
  canUseDashboard,
  isBlacklisted,
  isSupportTeam,
  getPermissionLevel,
  canActOnTicket,
  validateBotHierarchy,
};
