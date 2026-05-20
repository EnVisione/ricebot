const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');

// Default role configuration
const DEFAULT_ROLE_IDS = {
  iws: '1449279860609519831',
  overstars: '1449279753805758606',
  serverMember: '1447113319017086986',
  polls: '1449280018109694094',
  sneakPeeks: '1478780540957102141',
};

const DEFAULT_BUTTONS = [
  { id: `rr:${DEFAULT_ROLE_IDS.iws}`, label: 'IWS', emoji: '🌤️', roleId: DEFAULT_ROLE_IDS.iws, style: ButtonStyle.Secondary },
  { id: `rr:${DEFAULT_ROLE_IDS.overstars}`, label: 'Over Stars', emoji: '⭐', roleId: DEFAULT_ROLE_IDS.overstars, style: ButtonStyle.Secondary },
  { id: `rr:${DEFAULT_ROLE_IDS.serverMember}`, label: 'Server Member', emoji: '🌌', roleId: DEFAULT_ROLE_IDS.serverMember, style: ButtonStyle.Secondary },
  { id: `rr:${DEFAULT_ROLE_IDS.polls}`, label: 'Polls', emoji: '📊', roleId: DEFAULT_ROLE_IDS.polls, style: ButtonStyle.Secondary },
  { id: `rr:${DEFAULT_ROLE_IDS.sneakPeeks}`, label: 'Sneak Peeks', emoji: '👀', roleId: DEFAULT_ROLE_IDS.sneakPeeks, style: ButtonStyle.Secondary },
];

function buildDefaultPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('Choose your roles (click buttons below):')
    .setDescription(
      '🌤️ **IWS** — Updates, changelogs, and modpack announcements\n' +
      '⭐ **Over Stars** — Updates, changelogs, and modpack announcements\n' +
      '🌌 **Server Member** — Server status pings, restarts, wipes, and event notices\n' +
      '📊 **Polls** — Vote on features, configs, packs, and community decisions\n' +
      '👀 **Sneak Peeks** — Early previews and behind-the-scenes content'
    )
    .setColor(0xffffff);
}

function buildDefaultPanelComponents() {
  const row = new ActionRowBuilder();

  for (const btn of DEFAULT_BUTTONS) {
    const button = new ButtonBuilder()
      .setCustomId(btn.id)
      .setLabel(btn.label)
      .setEmoji(btn.emoji)
      .setStyle(btn.style);

    row.addComponents(button);
  }

  return [row];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rrdefault')
    .setDescription('Post the default reaction roles panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  folder: 'admin',

  async execute(interaction, { config, saveConfig }) {
    const guildId = interaction.guildId;
    const guildConfig = config[guildId] || (config[guildId] = {});
    const rr = guildConfig.reactionRoles || (guildConfig.reactionRoles = {});

    // Build and post the default panel
    const embed = buildDefaultPanelEmbed();
    const components = buildDefaultPanelComponents();

    try {
      const msg = await interaction.channel.send({ embeds: [embed], components });

      // Update config to store the default roles for the handler
      rr.roles = DEFAULT_BUTTONS.map((btn) => ({
        roleId: btn.roleId,
        label: btn.label,
        emoji: btn.emoji,
        style: 'Secondary',
      }));
      rr.panelMessageId = msg.id;
      rr.channelId = interaction.channel.id;
      rr.embedTitle = 'Choose your roles (click buttons below):';
      rr.embedColor = 0xffffff;
      rr.style = 'button';
      saveConfig();

      return interaction.reply({
        embeds: [embedBuilder.success('Default Panel Posted', `[Jump to panel](${msg.url})\n\nThe default reaction roles have been configured and posted.`)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      return interaction.reply({
        embeds: [embedBuilder.error('Failed to Post', `Could not post panel: ${e.message}`)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

