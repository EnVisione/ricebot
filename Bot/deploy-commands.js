require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const logger = require('./utils/logger');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function loadCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  if (!fs.existsSync(commandsDir)) return [];

  const files = walk(commandsDir);
  const commands = [];
  const loaded = [];
  const failed = [];

  for (const file of files) {
    const relative = path.relative(commandsDir, file);
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const cmd = require(file);
      if (!cmd?.data?.toJSON) {
        console.log(`  ⚠️ Skipped: ${relative} (no data.toJSON)`);
        continue;
      }
      commands.push(cmd.data.toJSON());
      loaded.push(cmd.data.name);
    } catch (e) {
      console.error(`  ❌ Failed to load: ${relative}`);
      console.error(`     ${e.message}`);
      failed.push(relative);
    }
  }

  console.log(`\n✅ Loaded commands: ${loaded.join(', ')}`);
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.join(', ')}`);
  }

  return commands;
}

(async () => {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  const deployGlobal = process.env.DEPLOY_GLOBAL === 'true';

  if (!token || !clientId) {
    throw new Error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  }

  if (!deployGlobal && !guildId) {
    throw new Error('Missing GUILD_ID in .env (or set DEPLOY_GLOBAL=true for global deployment)');
  }

  console.log('Loading commands...\n');
  const commands = loadCommands();

  const rest = new REST({ version: '10' }).setToken(token);

  if (deployGlobal) {
    console.log(`\nDeploying ${commands.length} commands globally...`);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Deployed ${commands.length} commands globally`);
    logger.info(null, `Deployed ${commands.length} commands globally`);
  } else {
    console.log(`\nDeploying ${commands.length} commands to guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`✅ Deployed ${commands.length} commands to guild ${guildId}`);
    logger.info(null, `Deployed ${commands.length} commands to guild ${guildId}`);
  }
})();