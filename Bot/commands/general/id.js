const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');

function snowflakeToDate(id) {
  try {
    const epoch = (BigInt(id) >> 22n) + 1420070400000n;
    return new Date(Number(epoch));
  } catch {
    return null;
  }
}

function parseCustomEmoji(str) {
  const match = str.match(/<(a)?:(\w+):(\d+)>/);
  if (match) {
    return { animated: !!match[1], name: match[2], id: match[3] };
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id')
    .setDescription('Get IDs and creation dates for Discord entities.')
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to get ID for'))
    .addRoleOption((opt) => opt.setName('role').setDescription('Role to get ID for'))
    .addUserOption((opt) => opt.setName('user').setDescription('User to get ID for'))
    .addStringOption((opt) => opt.setName('emoji').setDescription('Custom emoji to get ID for (paste the emoji)')),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    const user = interaction.options.getUser('user');
    const emojiStr = interaction.options.getString('emoji');

    const fields = [];

    if (!channel && !role && !user && !emojiStr) {
      // Return guild ID
      const guild = interaction.guild;
      const created = snowflakeToDate(guild.id);
      fields.push({
        name: '🏠 Guild',
        value: `**Name:** ${guild.name}\n**ID:** \`${guild.id}\`\n**Created:** <t:${Math.floor(created.getTime() / 1000)}:F>`,
        inline: false,
      });
    }

    if (channel) {
      const created = snowflakeToDate(channel.id);
      fields.push({
        name: '📁 Channel',
        value: `**Name:** ${channel.name}\n**ID:** \`${channel.id}\`\n**Created:** <t:${Math.floor(created.getTime() / 1000)}:F>`,
        inline: false,
      });
    }

    if (role) {
      const created = snowflakeToDate(role.id);
      fields.push({
        name: '🎭 Role',
        value: `**Name:** ${role.name}\n**ID:** \`${role.id}\`\n**Created:** <t:${Math.floor(created.getTime() / 1000)}:F>\n**Position:** ${role.position}`,
        inline: false,
      });
    }

    if (user) {
      const created = snowflakeToDate(user.id);
      fields.push({
        name: '👤 User',
        value: `**Tag:** ${user.tag}\n**ID:** \`${user.id}\`\n**Created:** <t:${Math.floor(created.getTime() / 1000)}:F>`,
        inline: false,
      });
    }

    if (emojiStr) {
      const parsed = parseCustomEmoji(emojiStr);
      if (parsed) {
        const created = snowflakeToDate(parsed.id);
        fields.push({
          name: '😀 Emoji',
          value: `**Name:** ${parsed.name}\n**ID:** \`${parsed.id}\`\n**Animated:** ${parsed.animated ? 'Yes' : 'No'}\n**Created:** <t:${Math.floor(created.getTime() / 1000)}:F>`,
          inline: false,
        });
      } else {
        fields.push({
          name: '😀 Emoji',
          value: 'Unicode emojis don\'t have Discord IDs. Only custom server emojis have snowflake IDs.',
          inline: false,
        });
      }
    }

    const embed = embedBuilder.info('ID Lookup', 'Snowflake IDs and creation timestamps:');
    embed.addFields(fields);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

