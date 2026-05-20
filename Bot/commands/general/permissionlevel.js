const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { isGuildOwner, isAdmin, hasDashboardRole, isBlacklisted } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permissionlevel')
    .setDescription('Check your or another user\'s permission level.')
    .addUserOption((opt) => opt.setName('user').setDescription('User to check (defaults to you)')),

  async execute(interaction, { config }) {
    // Defer reply first before any async operations
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return interaction.editReply({ embeds: [embedBuilder.error('User Not Found', 'Could not fetch that user.')] });
    }

    const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);

    let levelName = 'Regular User';
    let levelDesc = 'Can open tickets and use reaction roles.';

    // Build a fake interaction object for permission checks
    const fakeInteraction = {
      guild: interaction.guild,
      user: targetUser,
      member,
      memberPermissions: member.permissions,
    };

    if (interaction.guild.ownerId === targetUser.id) {
      levelName = '🔱 Guild Owner';
      levelDesc = 'All actions permitted regardless of role config.';
    } else if (isAdmin(fakeInteraction)) {
      levelName = '🛡️ Administrator';
      levelDesc = 'Can use all bot commands including admin configuration.';
    } else if (hasDashboardRole(member, guildConfig)) {
      levelName = '📋 Dashboard Role';
      levelDesc = 'Can configure tickets and reaction roles via /ticketadmin and /rradmin.';
    }

    const blacklisted = isBlacklisted(member, guildConfig);

    const embed = embedBuilder.info('Permission Level', `**User:** ${targetUser.tag}\n**Level:** ${levelName}\n\n${levelDesc}`);

    if (blacklisted) {
      embed.addFields({ name: '🚫 Blacklisted', value: 'This user is blocked from opening tickets.', inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

