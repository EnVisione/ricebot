const { MessageFlags } = require('discord.js');
const embedBuilder = require('../utils/embedBuilder');
const { getGuildConfig } = require('../utils/config');
const { isBlacklisted } = require('../utils/permissions');
const logger = require('../utils/logger');

async function handleRRButton(interaction, config, saveConfig) {
  const guildId = interaction.guildId;
  const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
  const rrConfig = guildConfig.reactionRoles;

  // Stale panel check
  if (rrConfig.panelMessageId && interaction.message.id !== rrConfig.panelMessageId) {
    return interaction.reply({
      embeds: [embedBuilder.warning('Outdated Panel', 'This panel is outdated. Please use the latest panel posted by an admin.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Blacklist check
  if (isBlacklisted(interaction.member, guildConfig)) {
    return interaction.reply({
      embeds: [embedBuilder.error('Blacklisted', 'You are not allowed to use reaction roles.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Extract role ID from customId: rr:{roleId}
  const roleId = interaction.customId.replace('rr:', '');

  // Find role config
  const roleConfig = (rrConfig.roles || []).find((r) => r.roleId === roleId);
  if (!roleConfig) {
    return interaction.reply({
      embeds: [embedBuilder.error('Role Not Found', 'This role is no longer configured.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Defer before network calls
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Fetch role
  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    return interaction.editReply({
      embeds: [embedBuilder.error('Role Not Found', 'This role no longer exists in the server.')],
    });
  }

  const member = interaction.member;
  const hasRole = member.roles.cache.has(roleId);

  // Handle exclusive groups
  const exclusiveGroups = rrConfig.exclusiveGroups || [];
  const memberGroup = exclusiveGroups.find((g) => g.roleIds?.includes(roleId));
  const removedRoles = [];

  if (memberGroup && !hasRole) {
    // Remove other roles in this group
    for (const otherRoleId of memberGroup.roleIds) {
      if (otherRoleId !== roleId && member.roles.cache.has(otherRoleId)) {
        try {
          await member.roles.remove(otherRoleId, 'Exclusive group toggle');
          const otherRole = interaction.guild.roles.cache.get(otherRoleId);
          if (otherRole) removedRoles.push(otherRole.name);
        } catch (e) {
          logger.warn(guildId, `Failed to remove exclusive group role: ${e.message}`);
        }
      }
    }
  }

  try {
    if (hasRole) {
      await member.roles.remove(roleId, 'Reaction role toggle');

      const desc = `Removed: **${role.name}**`;
      const embed = embedBuilder.success('Role Removed', desc);
      addCurrentRoles(embed, member, rrConfig);

      return interaction.editReply({ embeds: [embed] });
    } else {
      await member.roles.add(roleId, 'Reaction role toggle');

      let desc = `Added: **${role.name}**`;
      if (removedRoles.length) {
        desc += `\nRemoved (exclusive): ${removedRoles.map((n) => `**${n}**`).join(', ')}`;
      }

      const embed = embedBuilder.success('Role Added', desc);
      addCurrentRoles(embed, member, rrConfig);

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (e) {
    logger.error(guildId, `Failed to toggle role: ${e.message}`, e);
    return interaction.editReply({
      embeds: [embedBuilder.error('Failed', 'Could not modify roles. Check bot permissions and role hierarchy.')],
    });
  }
}

async function handleRRDropdown(interaction, config, saveConfig) {
  const guildId = interaction.guildId;
  const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
  const rrConfig = guildConfig.reactionRoles;

  // Stale panel check
  if (rrConfig.panelMessageId && interaction.message.id !== rrConfig.panelMessageId) {
    return interaction.reply({
      embeds: [embedBuilder.warning('Outdated Panel', 'This panel is outdated. Please use the latest panel.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Blacklist check
  if (isBlacklisted(interaction.member, guildConfig)) {
    return interaction.reply({
      embeds: [embedBuilder.error('Blacklisted', 'You are not allowed to use reaction roles.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const selected = interaction.values[0];
  if (!selected) {
    return interaction.reply({
      embeds: [embedBuilder.info('No Selection', 'No role selected.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const roleId = selected;
  const roleConfig = (rrConfig.roles || []).find((r) => r.roleId === roleId);
  if (!roleConfig) {
    return interaction.reply({
      embeds: [embedBuilder.error('Role Not Found', 'This role is no longer configured.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Defer before network calls
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    return interaction.editReply({
      embeds: [embedBuilder.error('Role Not Found', 'This role no longer exists.')],
    });
  }

  const member = interaction.member;
  const hasRole = member.roles.cache.has(roleId);

  // Handle exclusive groups
  const exclusiveGroups = rrConfig.exclusiveGroups || [];
  const memberGroup = exclusiveGroups.find((g) => g.roleIds?.includes(roleId));
  const removedRoles = [];

  if (memberGroup && !hasRole) {
    for (const otherRoleId of memberGroup.roleIds) {
      if (otherRoleId !== roleId && member.roles.cache.has(otherRoleId)) {
        try {
          await member.roles.remove(otherRoleId, 'Exclusive group toggle');
          const otherRole = interaction.guild.roles.cache.get(otherRoleId);
          if (otherRole) removedRoles.push(otherRole.name);
        } catch (e) {
          logger.warn(guildId, `Failed to remove exclusive group role: ${e.message}`);
        }
      }
    }
  }

  try {
    if (hasRole) {
      await member.roles.remove(roleId, 'Reaction role dropdown toggle');

      const embed = embedBuilder.success('Role Removed', `Removed: **${role.name}**`);
      addCurrentRoles(embed, member, rrConfig);
      return interaction.editReply({ embeds: [embed] });
    } else {
      await member.roles.add(roleId, 'Reaction role dropdown toggle');

      let desc = `Added: **${role.name}**`;
      if (removedRoles.length) {
        desc += `\nRemoved (exclusive): ${removedRoles.map((n) => `**${n}**`).join(', ')}`;
      }

      const embed = embedBuilder.success('Role Added', desc);
      addCurrentRoles(embed, member, rrConfig);
      return interaction.editReply({ embeds: [embed] });
    }
  } catch (e) {
    logger.error(guildId, `Failed to toggle role: ${e.message}`, e);
    return interaction.editReply({
      embeds: [embedBuilder.error('Failed', 'Could not modify roles. Check bot permissions.')],
    });
  }
}

function addCurrentRoles(embed, member, rrConfig) {
  const managedRoleIds = (rrConfig.roles || []).map((r) => r.roleId);
  const current = managedRoleIds.filter((rid) => member.roles.cache.has(rid));

  if (current.length) {
    embed.addFields({
      name: 'Your Current Roles',
      value: current.map((rid) => `<@&${rid}>`).join(', '),
      inline: false,
    });
  }
}

module.exports = {
  handleRRButton,
  handleRRDropdown,
};

