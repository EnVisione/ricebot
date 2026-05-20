const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename the current ticket.')
    .addStringOption((opt) => opt.setName('name').setDescription('New ticket name').setRequired(true)),
  folder: 'ticket',

  async execute(interaction, { config, ticketState, saveConfig, saveTicketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const guildTickets = getGuildTickets(ticketState, guildId);
    const ticketData = guildTickets[channel.id];

    if (!ticketData) {
      return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    const panelConfig = guildConfig.panels?.[ticketData.panelId];

    if (!panelConfig) {
      return interaction.reply({ embeds: [embedBuilder.error('Panel Not Found', 'The panel configuration no longer exists.')], flags: MessageFlags.Ephemeral });
    }

    // Only support/admin can rename
    const member = interaction.member;
    const isSupport = (panelConfig.supportRoles || []).some((rid) => member.roles.cache.has(rid));
    const isAdmin = member.permissions.has('Administrator');

    if (!isSupport && !isAdmin) {
      return interaction.reply({ embeds: [embedBuilder.error('No Permission', 'Only support team members can rename tickets.')], flags: MessageFlags.Ephemeral });
    }

    let newName = interaction.options.getString('name', true);
    newName = newName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 100);

    if (!newName) {
      return interaction.reply({ embeds: [embedBuilder.error('Invalid Name', 'The name must contain alphanumeric characters.')], flags: MessageFlags.Ephemeral });
    }

    // Rate limit check: 2 renames per 10 minutes
    const now = Date.now();
    ticketData.renameHistory = ticketData.renameHistory || [];
    const recentRenames = ticketData.renameHistory.filter((r) => now - r.changedAt < 600000);

    if (recentRenames.length >= 2) {
      const oldest = recentRenames[0];
      const waitMs = 600000 - (now - oldest.changedAt);
      const waitSecs = Math.ceil(waitMs / 1000);
      return interaction.reply({
        embeds: [embedBuilder.error('Rate Limited', `You can only rename twice per 10 minutes. Please wait ${waitSecs} seconds.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await channel.setName(newName, `Renamed by ${member.user.tag}`);
      ticketData.ticketId = newName;
      ticketData.renameHistory.push({ name: newName, changedBy: member.id, changedAt: now });
      saveTicketState();

      // Log if enabled
      if (panelConfig.logOptions?.channelId && panelConfig.logOptions?.logRename) {
        const logChannel = interaction.guild.channels.cache.get(panelConfig.logOptions.channelId);
        if (logChannel) {
          const { EmbedBuilder } = require('discord.js');
          const logEmbed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('✏️ Ticket Renamed')
            .addFields(
              { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
              { name: 'New Name', value: newName, inline: true },
              { name: 'Renamed By', value: `<@${member.id}>`, inline: true }
            )
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }
      }

      await interaction.editReply({ embeds: [embedBuilder.success('Renamed', `Ticket renamed to **${newName}**.`)] });
    } catch (e) {
      logger.error(guildId, `Failed to rename ticket: ${e.message}`, e);
      await interaction.editReply({ embeds: [embedBuilder.error('Rename Failed', e.message)] });
    }
  },
};

