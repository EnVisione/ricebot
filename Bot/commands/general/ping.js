const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Show latency and uptime.'),
  async execute(interaction, { client }) {
    const start = Date.now();
    await interaction.reply({ embeds: [embedBuilder.info('Pinging…', 'Measuring latency…')], flags: MessageFlags.Ephemeral });

    const apiPing = Date.now() - start;
    const wsPing = client.ws.ping;

    let colorEmbed;
    if (apiPing < 150) colorEmbed = embedBuilder.success('Pong', '');
    else if (apiPing < 350) colorEmbed = embedBuilder.warning('Pong', '');
    else colorEmbed = embedBuilder.error('Pong', '');

    const uptimeMs = client.uptime || 0;
    const uptimeSec = Math.floor(uptimeMs / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;

    colorEmbed
      .setDescription(`WS ping: **${wsPing >= 0 ? wsPing + 'ms' : 'calculating...'}**\nAPI ping: **${apiPing}ms**\nUptime: **${h}h ${m}m ${s}s**`);

    await interaction.editReply({ embeds: [colorEmbed] });
  },
};

