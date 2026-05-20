const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { formatDuration } = require('../utils/variables');

async function fetchMessages(channel, limit = 1000) {
  const messages = [];
  let lastId = null;

  while (messages.length < limit) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    messages.push(...batch.values());
    lastId = batch.last().id;

    if (batch.size < 100) break;
  }

  return messages.reverse().slice(0, limit);
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function markdownToHtml(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // User mentions
  html = html.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@User</span>');
  // Role mentions
  html = html.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@Role</span>');
  // Channel mentions
  html = html.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel</span>');
  // Newlines
  html = html.replace(/\n/g, '<br>');

  return html;
}

function buildHtmlTranscript(messages, ticketData, guildName) {
  const participants = new Set();
  participants.add(ticketData.openedBy);
  for (const m of messages) {
    if (!m.author.bot) participants.add(m.author.id);
  }

  const duration = ticketData.closedAt
    ? formatDuration(ticketData.closedAt - ticketData.openedAt)
    : formatDuration(Date.now() - ticketData.openedAt);

  const openedDate = new Date(ticketData.openedAt).toISOString();
  const closedDate = ticketData.closedAt ? new Date(ticketData.closedAt).toISOString() : 'N/A';

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Transcript - ${escapeHtml(ticketData.ticketId)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #36393f; color: #dcddde; line-height: 1.5; }
.container { max-width: 900px; margin: 0 auto; padding: 20px; }
.header { background: #2f3136; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
.header h1 { color: #fff; font-size: 1.5em; margin-bottom: 10px; }
.header-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.header-info div { background: #202225; padding: 10px; border-radius: 4px; }
.header-info label { color: #72767d; font-size: 0.8em; display: block; }
.header-info span { color: #fff; }
.messages { display: flex; flex-direction: column; gap: 4px; }
.message { display: flex; padding: 10px 15px; }
.message:hover { background: #32353b; }
.avatar { width: 40px; height: 40px; border-radius: 50%; background: #5865f2; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; flex-shrink: 0; margin-right: 15px; }
.content { flex: 1; min-width: 0; }
.author { display: flex; align-items: baseline; gap: 8px; }
.author-name { color: #fff; font-weight: 500; }
.timestamp { color: #72767d; font-size: 0.75em; }
.text { color: #dcddde; word-wrap: break-word; }
.text code { background: #2f3136; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
.text pre { background: #2f3136; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 5px 0; }
.text pre code { padding: 0; background: none; }
.mention { background: rgba(88, 101, 242, 0.3); color: #dee0fc; padding: 0 2px; border-radius: 3px; }
.attachments { margin-top: 5px; }
.attachment { color: #00aff4; text-decoration: none; display: block; }
.attachment:hover { text-decoration: underline; }
.embed { background: #2f3136; border-left: 4px solid #5865f2; padding: 10px; margin-top: 5px; border-radius: 4px; }
.embed-title { color: #fff; font-weight: 500; }
.embed-desc { color: #dcddde; font-size: 0.9em; }
.footer { text-align: center; color: #72767d; font-size: 0.8em; margin-top: 20px; padding: 20px; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>📜 Transcript: ${escapeHtml(ticketData.ticketId)}</h1>
<div class="header-info">
<div><label>Server</label><span>${escapeHtml(guildName)}</span></div>
<div><label>Panel</label><span>${escapeHtml(ticketData.panelName)}</span></div>
<div><label>Opened By</label><span>${escapeHtml(ticketData.openedByTag)}</span></div>
<div><label>Opened At</label><span>${openedDate}</span></div>
<div><label>Closed At</label><span>${closedDate}</span></div>
<div><label>Duration</label><span>${duration}</span></div>
<div><label>Messages</label><span>${messages.length}</span></div>
<div><label>Participants</label><span>${participants.size}</span></div>
</div>
</div>
<div class="messages">
`;

  for (const msg of messages) {
    const initial = msg.author.username.charAt(0).toUpperCase();
    const timestamp = msg.createdAt.toISOString().replace('T', ' ').slice(0, 19);

    html += `<div class="message">
<div class="avatar">${initial}</div>
<div class="content">
<div class="author">
<span class="author-name">${escapeHtml(msg.author.username)}</span>
<span class="timestamp">${timestamp}</span>
</div>
<div class="text">${markdownToHtml(msg.content)}</div>
`;

    // Attachments
    if (msg.attachments.size > 0) {
      html += '<div class="attachments">';
      for (const [, att] of msg.attachments) {
        html += `<a class="attachment" href="${escapeHtml(att.url)}" target="_blank">📎 ${escapeHtml(att.name)}</a>`;
      }
      html += '</div>';
    }

    // Embeds
    for (const embed of msg.embeds) {
      html += '<div class="embed">';
      if (embed.title) html += `<div class="embed-title">${escapeHtml(embed.title)}</div>`;
      if (embed.description) html += `<div class="embed-desc">${markdownToHtml(embed.description)}</div>`;
      html += '</div>';
    }

    html += `</div></div>
`;
  }

  html += `</div>
<div class="footer">Generated on ${new Date().toISOString()}</div>
</div>
</body>
</html>`;

  return html;
}

function buildTxtTranscript(messages, ticketData, guildName) {
  const lines = [];
  lines.push(`=== Transcript: ${ticketData.ticketId} ===`);
  lines.push(`Server: ${guildName}`);
  lines.push(`Panel: ${ticketData.panelName}`);
  lines.push(`Opened By: ${ticketData.openedByTag}`);
  lines.push(`Opened At: ${new Date(ticketData.openedAt).toISOString()}`);
  lines.push(`Closed At: ${ticketData.closedAt ? new Date(ticketData.closedAt).toISOString() : 'N/A'}`);
  lines.push(`Messages: ${messages.length}`);
  lines.push('');
  lines.push('='.repeat(50));
  lines.push('');

  for (const msg of messages) {
    const timestamp = msg.createdAt.toISOString().replace('T', ' ').slice(0, 19);
    lines.push(`[${timestamp}] ${msg.author.username}: ${msg.content}`);

    for (const [, att] of msg.attachments) {
      lines.push(`  [Attachment: ${att.url}]`);
    }
  }

  lines.push('');
  lines.push(`=== Generated on ${new Date().toISOString()} ===`);

  return lines.join('\n');
}

async function sendTranscript(channel, ticketData, panelConfig, guild) {
  const guildId = guild.id;
  const format = panelConfig.transcriptOptions?.format || 'html';
  const transcriptChannelId = panelConfig.transcriptOptions?.channelId;

  if (!transcriptChannelId) {
    logger.warn(guildId, 'No transcript channel configured');
    return;
  }

  const transcriptChannel = guild.channels.cache.get(transcriptChannelId);
  if (!transcriptChannel) {
    logger.warn(guildId, `Transcript channel ${transcriptChannelId} not found`);
    return;
  }

  const messages = await fetchMessages(channel);

  let content;
  let filename;
  const date = new Date().toISOString().slice(0, 10);

  if (format === 'txt') {
    content = buildTxtTranscript(messages, ticketData, guild.name);
    filename = `transcript-${ticketData.ticketId}-${date}.txt`;
  } else {
    content = buildHtmlTranscript(messages, ticketData, guild.name);
    filename = `transcript-${ticketData.ticketId}-${date}.html`;
  }

  const buffer = Buffer.from(content, 'utf8');
  const attachment = new AttachmentBuilder(buffer, { name: filename });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📜 Ticket Transcript')
    .addFields(
      { name: 'Ticket', value: ticketData.ticketId, inline: true },
      { name: 'Panel', value: ticketData.panelName, inline: true },
      { name: 'Opened By', value: `<@${ticketData.openedBy}>`, inline: true },
      { name: 'Messages', value: String(messages.length), inline: true }
    )
    .setTimestamp();

  await transcriptChannel.send({ embeds: [embed], files: [attachment] });

  return { filename, messageCount: messages.length };
}

module.exports = {
  fetchMessages,
  buildHtmlTranscript,
  buildTxtTranscript,
  sendTranscript,
};

