/**
 * Diagnostic script for RiceBot
 * Run this on the server: node diagnose.js
 */

const fs = require('fs');
const path = require('path');

console.log('=== RiceBot Diagnostics ===\n');

// Check Node version
console.log('Node version:', process.version);

// Check if discord.js is installed
try {
  const djs = require('discord.js');
  console.log('discord.js version:', djs.version);
  console.log('MessageFlags available:', !!djs.MessageFlags);
  console.log('MessageFlags.Ephemeral:', djs.MessageFlags?.Ephemeral);
} catch (e) {
  console.error('❌ discord.js not found:', e.message);
}

console.log('\n=== Command Files ===\n');

// Check all command files
const commandsDir = './commands';
const folders = ['admin', 'general', 'panel', 'ticket'];

let totalCommands = 0;
let loadedCommands = 0;
let failedCommands = [];

for (const folder of folders) {
  const dir = path.join(commandsDir, folder);
  if (!fs.existsSync(dir)) {
    console.log(`⚠️ Folder not found: ${dir}`);
    continue;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    totalCommands++;
    const filePath = path.join(dir, file);
    try {
      const cmd = require('./' + filePath.replace(/\\/g, '/'));
      if (cmd?.data?.name && typeof cmd.execute === 'function') {
        console.log(`✅ ${folder}/${file} -> /${cmd.data.name}`);
        loadedCommands++;
      } else {
        console.log(`⚠️ ${folder}/${file} - missing data.name or execute()`);
        failedCommands.push(`${folder}/${file} (missing exports)`);
      }
    } catch (e) {
      console.log(`❌ ${folder}/${file} - ${e.message}`);
      failedCommands.push(`${folder}/${file} (${e.message})`);
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`Total files: ${totalCommands}`);
console.log(`Loaded: ${loadedCommands}`);
console.log(`Failed: ${failedCommands.length}`);

if (failedCommands.length > 0) {
  console.log('\nFailed commands:');
  failedCommands.forEach(f => console.log(`  - ${f}`));
}

// Check specific files that have been modified
console.log('\n=== Key File Checks ===\n');

// Check ping.js for MessageFlags usage
try {
  const pingContent = fs.readFileSync('./commands/general/ping.js', 'utf8');
  const hasMessageFlagsImport = pingContent.includes('MessageFlags');
  const hasEphemeralTrue = pingContent.includes('ephemeral: true');
  const hasFlagsMessageFlags = pingContent.includes('flags: MessageFlags');

  console.log('ping.js:');
  console.log(`  - Has MessageFlags import: ${hasMessageFlagsImport ? '✅' : '❌'}`);
  console.log(`  - Uses deprecated ephemeral: true: ${hasEphemeralTrue ? '❌ (should be fixed)' : '✅ (good)'}`);
  console.log(`  - Uses flags: MessageFlags: ${hasFlagsMessageFlags ? '✅' : '❌'}`);
} catch (e) {
  console.log('❌ Could not read ping.js:', e.message);
}

// Check setup.js for deferReply
try {
  const setupContent = fs.readFileSync('./commands/admin/setup.js', 'utf8');
  const hasDeferReply = setupContent.includes('deferReply');
  const hasEditReply = setupContent.includes('editReply');

  console.log('\nsetup.js:');
  console.log(`  - Has deferReply: ${hasDeferReply ? '✅' : '❌'}`);
  console.log(`  - Has editReply: ${hasEditReply ? '✅' : '❌'}`);
} catch (e) {
  console.log('❌ Could not read setup.js:', e.message);
}

console.log('\n=== Diagnostics Complete ===');

