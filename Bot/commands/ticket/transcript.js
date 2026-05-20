const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');
const { getGuildTickets } = require('../../utils/ticketState');
const transcriptService = require('../../tickets/transcriptService');
const { isAdmin } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Generate a transcript of the current channel.')
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to send the transcript to'))
    .addIntegerOption((opt) => opt.setName('lines').setDescription('Number of messages to include (1-1000)').setMinValue(1).setMaxValue(1000)),
  folder: 'ticket',

  async execute(interaction, { config, ticketState }) {
    const channel = interaction.channel;
    const guildId = interaction.guildId;
    const member = interaction.member;

    const guildTickets = getGuildTickets(ticketState, guildId);
    const ticketData = guildTickets[channel.id];

    // Allow in non-ticket channels if admin
    if (!ticketData && !isAdmin(interaction)) {
      return interaction.reply({ embeds: [embedBuilder.error('Not a Ticket', 'This channel is not a ticket. Only admins can generate transcripts in non-ticket channels.')], flags: MessageFlags.Ephemeral });
    }

    const guildConfig = getGuildConfig(config, guildId, interaction.guild?.name);
    let panelConfig = null;

    if (ticketData) {
      panelConfig = guildConfig.panels?.[ticketData.panelId];
    }

    const targetChannel = interaction.options.getChannel('channel') || channel;
    const lines = interaction.options.getInteger('lines') || 1000;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const messages = await transcriptService.fetchMessages(channel, lines);

      const format = panelConfig?.transcriptOptions?.format || 'html';
      const date = new Date().toISOString().slice(0, 10);
      const ticketId = ticketData?.ticketId || channel.name;

      let content;
      let filename;

      if (format === 'txt') {
        content = transcriptService.buildTxtTranscript(
          messages,
          ticketData || { ticketId, panelName: 'N/A', openedByTag: 'N/A', openedAt: Date.now() },
          interaction.guild.name
        );
        filename = `transcript-${ticketId}-${date}.txt`;
      } else {
        content = transcriptService.buildHtmlTranscript(
          messages,
          ticketData || { ticketId, panelName: 'N/A', openedByTag: 'N/A', openedAt: Date.now() },
          interaction.guild.name
        );
        filename = `transcript-${ticketId}-${date}.html`;
      }

      const buffer = Buffer.from(content, 'utf8');
      const attachment = new AttachmentBuilder(buffer, { name: filename });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📜 Transcript Generated')
        .addFields(
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          { name: 'Messages', value: String(messages.length), inline: true },
          { name: 'Format', value: format.toUpperCase(), inline: true }
        )
        .setTimestamp();

      if (targetChannel.id === channel.id) {
        // Send to current channel
        await channel.send({ embeds: [embed], files: [attachment] });
        await interaction.editReply({ embeds: [embedBuilder.success('Transcript Sent', 'The transcript has been posted in this channel.')] });
      } else {
        // Send to target channel
        await targetChannel.send({ embeds: [embed], files: [attachment] });
        await interaction.editReply({ embeds: [embedBuilder.success('Transcript Sent', `The transcript has been sent to <#${targetChannel.id}>.`)] });
      }
    } catch (e) {
      await interaction.editReply({ embeds: [embedBuilder.error('Transcript Failed', e.message)] });
    }
  },
};

