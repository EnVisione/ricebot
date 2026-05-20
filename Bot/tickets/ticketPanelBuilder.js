const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { resolveVariables, padTicketNumber } = require('../utils/variables');

function buildTicketPanelEmbed(panelConfig) {
  const pe = panelConfig.panelEmbed;
  const embed = new EmbedBuilder();

  if (pe.title) embed.setTitle(pe.title);
  if (pe.description) embed.setDescription(pe.description);
  if (pe.color) embed.setColor(pe.color);
  if (pe.thumbnailUrl) embed.setThumbnail(pe.thumbnailUrl);
  if (pe.imageUrl) embed.setImage(pe.imageUrl);
  if (pe.footerText) embed.setFooter({ text: pe.footerText, iconURL: pe.footerIconUrl || undefined });

  return embed;
}

function buildTicketPanelComponents(panelId, panelConfig) {
  const style = panelConfig.style || 'button';

  if (style === 'dropdown') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ticket:open:${panelId}`)
      .setPlaceholder(panelConfig.buttonLabel || 'Open Ticket')
      .addOptions({
        label: panelConfig.buttonLabel || 'Open Ticket',
        value: 'open',
        description: 'Click to open a new ticket',
        emoji: panelConfig.buttonEmoji || '🎫',
      });

    return [new ActionRowBuilder().addComponents(menu)];
  }

  // Button mode
  const styleMap = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger,
  };

  const btn = new ButtonBuilder()
    .setCustomId(`ticket:open:${panelId}`)
    .setLabel(panelConfig.buttonLabel || 'Open Ticket')
    .setStyle(styleMap[panelConfig.buttonStyle] || ButtonStyle.Primary);

  if (panelConfig.buttonEmoji) {
    btn.setEmoji(panelConfig.buttonEmoji);
  }

  return [new ActionRowBuilder().addComponents(btn)];
}

function buildTicketOpenEmbed(panelConfig, ticketNumber, opener, guildName) {
  const to = panelConfig.ticketOptions;
  const ctx = {
    username: opener.user.username,
    usertag: opener.user.tag,
    userid: opener.user.id,
    usermention: `<@${opener.user.id}>`,
    number: padTicketNumber(ticketNumber),
    rawNumber: String(ticketNumber),
    panelName: panelConfig.name,
    guildName,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toISOString().slice(11, 16),
    datetime: new Date().toISOString().slice(0, 16).replace('T', ' '),
    timestamp: `<t:${Math.floor(Date.now() / 1000)}:F>`,
    openedAt: `<t:${Math.floor(Date.now() / 1000)}:F>`,
  };

  const title = resolveVariables(to.openMessageEmbedTitle || 'Ticket #{number}', ctx);
  const description = resolveVariables(to.openMessage || 'Thanks for reaching out!', ctx);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(to.openMessageEmbedColor || 0x5865f2)
    .setTimestamp();

  return { embed, ctx };
}

function buildTicketOpenComponents(panelConfig) {
  const rows = [];

  const row1 = new ActionRowBuilder();
  row1.addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  if (panelConfig.claimingOptions?.enabled) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:claim')
        .setLabel('Claim')
        .setEmoji('🙋')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  rows.push(row1);
  return rows;
}

module.exports = {
  buildTicketPanelEmbed,
  buildTicketPanelComponents,
  buildTicketOpenEmbed,
  buildTicketOpenComponents,
};

