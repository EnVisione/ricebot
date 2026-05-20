const fs = require('node:fs');
const path = require('node:path');

const LOG_FILE = path.join(__dirname, '..', 'errors.log');
const LOG_DIR = path.join(__dirname, '..');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_BACKUP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function format(level, guildId, message) {
  const gid = guildId || 'global';
  return `[${timestamp()}] [${level.padEnd(5, ' ')}] [${gid}] ${message}`;
}

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        // Create backup with timestamp
        const backupName = `errors.log.${Date.now()}.bak`;
        const backupPath = path.join(LOG_DIR, backupName);
        fs.renameSync(LOG_FILE, backupPath);

        // Cleanup old backups (older than 7 days)
        const files = fs.readdirSync(LOG_DIR);
        const now = Date.now();
        for (const file of files) {
          if (file.startsWith('errors.log.') && file.endsWith('.bak')) {
            const match = file.match(/errors\.log\.(\d+)\.bak/);
            if (match) {
              const fileTime = parseInt(match[1], 10);
              if (now - fileTime > MAX_BACKUP_AGE_MS) {
                fs.unlinkSync(path.join(LOG_DIR, file));
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to rotate errors.log', e);
  }
}

function log(level, guildId, message, error) {
  const line = format(level, guildId, message);
  if (level === 'ERROR') {
    console.error(line);
    if (error) {
      console.error(error.stack || error);
    }
    try {
      rotateLogIfNeeded();
      const errLine = error ? `${line}\n${error.stack || error}` : line;
      fs.appendFileSync(LOG_FILE, `${errLine}\n`);
    } catch (e) {
      console.error('Failed to write errors.log', e);
    }
    return;
  }
  if (level === 'WARN') {
    console.warn(line);
    return;
  }
  if (level === 'DEBUG' && process.env.DEBUG !== 'true') return;
  console.log(line);
}

module.exports = {
  debug: (guildId, message) => log('DEBUG', guildId, message),
  info: (guildId, message) => log('INFO', guildId, message),
  warn: (guildId, message) => log('WARN', guildId, message),
  error: (guildId, message, error) => log('ERROR', guildId, message, error),
};

