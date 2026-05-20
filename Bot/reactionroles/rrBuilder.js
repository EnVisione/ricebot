const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle } = require('discord.js');

function buildRREmbed(rrConfig) {
  const embed = new EmbedBuilder();

  if (rrConfig.embedTitle) embed.setTitle(rrConfig.embedTitle);
  if (rrConfig.embedDescription) embed.setDescription(rrConfig.embedDescription);
  if (rrConfig.embedColor) embed.setColor(rrConfig.embedColor);
  if (rrConfig.embedThumbnailUrl) embed.setThumbnail(rrConfig.embedThumbnailUrl);
  if (rrConfig.embedImageUrl) embed.setImage(rrConfig.embedImageUrl);

  const footerParts = [];
  if (rrConfig.embedFooterText) footerParts.push(rrConfig.embedFooterText);
  if (rrConfig.compact) footerParts.push('(Compact mode)');
  if (footerParts.length) embed.setFooter({ text: footerParts.join(' • ') });

  return embed;
}

function buildRRComponents(rrConfig, guildId) {
  const roles = rrConfig.roles || [];
  const style = rrConfig.style || 'button';

  if (style === 'dropdown') {
    if (roles.length === 0) return [];

    const options = roles.slice(0, 25).map((r) => {
      const opt = {
        label: r.label || 'Role',
        value: r.roleId,
      };
      if (r.description) opt.description = r.description;
      if (r.emoji) opt.emoji = r.emoji;
      return opt;
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`rr:dropdown:${guildId}`)
      .setPlaceholder('Select a role...')
      .setMinValues(0)
      .setMaxValues(1)
      .addOptions(options);

    return [new ActionRowBuilder().addComponents(menu)];
  }

  // Button mode
  const styleMap = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger,
  };

  const rows = [];
  const rolesChunked = [];

  for (let i = 0; i < roles.length && i < 25; i += 5) {
    rolesChunked.push(roles.slice(i, i + 5));
  }

  for (const chunk of rolesChunked) {
    const row = new ActionRowBuilder();

    for (const r of chunk) {
      const btn = new ButtonBuilder()
        .setCustomId(`rr:${r.roleId}`)
        .setLabel(r.label || 'Role')
        .setStyle(rrConfig.compact ? ButtonStyle.Secondary : (styleMap[r.style] || ButtonStyle.Secondary));

      if (r.emoji) btn.setEmoji(r.emoji);

      row.addComponents(btn);
    }

    rows.push(row);
  }

  return rows;
}

function buildRRPanel(rrConfig, guildId) {
  const embed = buildRREmbed(rrConfig);
  const components = buildRRComponents(rrConfig, guildId);
  return { embed, components };
}

module.exports = {
  buildRREmbed,
  buildRRComponents,
  buildRRPanel,
};

