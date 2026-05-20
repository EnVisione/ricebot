const { PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

const PERM_MAP = {
  viewChannel: PermissionFlagsBits.ViewChannel,
  sendMessages: PermissionFlagsBits.SendMessages,
  readMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  attachFiles: PermissionFlagsBits.AttachFiles,
  embedLinks: PermissionFlagsBits.EmbedLinks,
  manageMessages: PermissionFlagsBits.ManageMessages,
  addReactions: PermissionFlagsBits.AddReactions,
};

function permObjectToOverwrite(permObj) {
  const allow = [];
  const deny = [];

  for (const [key, val] of Object.entries(permObj)) {
    const flag = PERM_MAP[key];
    if (!flag) continue;
    if (val === true) allow.push(flag);
    else if (val === false) deny.push(flag);
  }

  return { allow, deny };
}

function buildOpenOverwrites(panelConfig, member, guild) {
  const po = panelConfig.permissionOptions;
  const overwrites = [];

  // @everyone deny view
  const everyonePerms = permObjectToOverwrite(po.everyone?.opened || { viewChannel: false });
  overwrites.push({
    id: guild.id,
    allow: everyonePerms.allow,
    deny: everyonePerms.deny,
  });

  // Ticket opener
  const userPerms = permObjectToOverwrite(po.user?.opened || { viewChannel: true, sendMessages: true, readMessageHistory: true });
  overwrites.push({
    id: member.id,
    allow: userPerms.allow,
    deny: userPerms.deny,
  });

  // Support roles
  const supportPerms = permObjectToOverwrite(po.supportTeam?.opened || { viewChannel: true, sendMessages: true, readMessageHistory: true });
  for (const rid of panelConfig.supportRoles || []) {
    overwrites.push({
      id: rid,
      allow: supportPerms.allow,
      deny: supportPerms.deny,
    });
  }

  // Additional roles
  for (const ar of po.additionalRoles || []) {
    const arPerms = permObjectToOverwrite(ar.opened || {});
    overwrites.push({
      id: ar.roleId,
      allow: arPerms.allow,
      deny: arPerms.deny,
    });
  }

  // Bot itself
  overwrites.push({
    id: guild.members.me.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.CreatePrivateThreads,
    ],
  });

  return overwrites;
}

function buildCloseOverwrites(panelConfig, member, guild, addedUsers, addedRoles) {
  const po = panelConfig.permissionOptions;
  const overwrites = [];

  // @everyone deny view
  const everyonePerms = permObjectToOverwrite(po.everyone?.closed || { viewChannel: false });
  overwrites.push({
    id: guild.id,
    allow: everyonePerms.allow,
    deny: everyonePerms.deny,
  });

  // Ticket opener - closed perms
  const userPerms = permObjectToOverwrite(po.user?.closed || { viewChannel: true, sendMessages: false, readMessageHistory: true });
  overwrites.push({
    id: member.id,
    allow: userPerms.allow,
    deny: userPerms.deny,
  });

  // Support roles - closed perms
  const supportPerms = permObjectToOverwrite(po.supportTeam?.closed || { viewChannel: true, sendMessages: false, readMessageHistory: true });
  for (const rid of panelConfig.supportRoles || []) {
    overwrites.push({
      id: rid,
      allow: supportPerms.allow,
      deny: supportPerms.deny,
    });
  }

  // Additional roles - closed perms
  for (const ar of po.additionalRoles || []) {
    const arPerms = permObjectToOverwrite(ar.closed || {});
    overwrites.push({
      id: ar.roleId,
      allow: arPerms.allow,
      deny: arPerms.deny,
    });
  }

  // Added users - closed perms
  for (const uid of addedUsers || []) {
    overwrites.push({
      id: uid,
      allow: userPerms.allow,
      deny: userPerms.deny,
    });
  }

  // Added roles - closed perms
  for (const rid of addedRoles || []) {
    overwrites.push({
      id: rid,
      allow: supportPerms.allow,
      deny: supportPerms.deny,
    });
  }

  // Bot itself
  overwrites.push({
    id: guild.members.me.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
    ],
  });

  return overwrites;
}

function validateHierarchy(guild, panelConfig) {
  const warnings = [];
  const botRole = guild.members.me.roles.highest;

  for (const rid of panelConfig.supportRoles || []) {
    const role = guild.roles.cache.get(rid);
    if (!role) {
      warnings.push(`Support role ${rid} not found`);
      continue;
    }
    if (role.position >= botRole.position) {
      warnings.push(`Bot is below support role "${role.name}" — cannot manage permissions`);
    }
  }

  return warnings;
}

module.exports = {
  buildOpenOverwrites,
  buildCloseOverwrites,
  validateHierarchy,
  permObjectToOverwrite,
  PERM_MAP,
};

