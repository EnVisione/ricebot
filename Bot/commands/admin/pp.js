const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig, saveConfig } = require('../../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pp')
    .setDescription('Toggle phantom ping on member join (admin only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/disable phantom ping').setRequired(true))
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to phantom ping in (defaults to current)')),

  async execute(interaction, { config }) {
    const enabled = interaction.options.getBoolean('enabled', true);
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);
    guildConfig.server.phantomPing = {
      enabled,
      channelId: enabled ? channel.id : guildConfig.server.phantomPing?.channelId || channel.id,
    };

    saveConfig(config);

    const status = enabled ? `Enabled. Channel: <#${guildConfig.server.phantomPing.channelId}>` : 'Disabled.';
    await interaction.reply({ embeds: [embedBuilder.success('Phantom ping updated', status)], flags: MessageFlags.Ephemeral });
  },
};

