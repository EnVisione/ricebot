# RiceBot - Discord Ticket & Reaction Roles System

A fully featured Discord bot for ticket management and reaction roles, with comprehensive admin configuration via slash commands.

## Features

### Ticket System
- **Multi-panel support** - Create multiple independent ticket panels
- **Configurable naming patterns** - Use variables like `{number}`, `{username}`
- **Two-step close** - Optional confirmation before closing
- **Claiming system** - Staff can claim tickets with permission restrictions
- **Private staff threads** - Auto-created threads for staff-only discussion
- **Role changes on open/close** - Automatically add/remove roles from ticket openers
- **Transcripts** - HTML or TXT format, sent on close/delete, optionally DM'd to opener
- **Auto-close** - Close inactive tickets with configurable warning
- **Auto-message** - Send delayed messages in new tickets
- **Escalation** - Move tickets between panels
- **Logging** - Comprehensive logging for all ticket actions

### Reaction Roles
- **Button or dropdown style** - Choose how users select roles
- **Exclusive groups** - Picking one role removes others in the group
- **Customizable embed** - Title, description, color, images, footer
- **Compact mode** - Smaller buttons for cleaner appearance

### Administration
- **Dashboard roles** - Grant non-admins access to configuration commands
- **Blacklist roles** - Block certain roles from using the bot
- **Config export/import** - Backup and restore configuration
- **Panel cloning** - Duplicate panel configs for quick setup
- **Channel recycling** - Reuse channels to avoid 500-channel limit

## Commands

### General
- `/help [commands|setup|faq]` - Help information
- `/ping` - Bot latency
- `/debug` - Permission audit and config status
- `/permissionlevel [user]` - Check permission level
- `/id [channel|role|user|emoji]` - Get IDs and creation timestamps

### Ticket Operations
- `/close` - Close ticket
- `/open` - Reopen closed ticket
- `/delete` - Delete ticket channel
- `/rename <name>` - Rename ticket
- `/transcript [channel] [lines]` - Generate transcript
- `/add <user|role>` - Add user/role to ticket
- `/remove <user|role>` - Remove user/role from ticket
- `/claim [user]` - Claim ticket
- `/unclaim` - Unclaim ticket
- `/closerequest` - Send close confirmation
- `/escalate <target> [reason]` - Move to another panel
- `/automation <start|stop>` - Pause/resume automations

### Admin - Ticket Configuration
- `/ticketadmin panel create|delete|view|category|support|remove-support`
- `/ticketadmin panel embed-thumbnail|embed-image|embed-footer|embed-footer-icon`
- `/ticketadmin channels log|transcript`
- `/ticketadmin log-events set|view` - Toggle individual log events
- `/ticketadmin settings limit|global|twostep|claiming|autoclose`
- `/ticketadmin settings private-thread|thread-name` - Staff thread settings
- `/ticketadmin roles dashboard|blacklist|opened-add|closed-add|ping`
- `/ticketadmin messages open|embed-title|embed-color|close-ask`
- `/ticketadmin naming opened|closed`
- `/ticketadmin transcript on-close|on-delete|format|dm-opener`
- `/ticketadmin escalate add-target|remove-target|list-targets`

### Admin - Reaction Roles
- `/rradmin set-channel|set-style`
- `/rradmin set-embed-title|set-embed-description|set-embed-color|set-embed-thumbnail|set-embed-image|set-embed-footer`
- `/rradmin set-compact`
- `/rradmin add-role|remove-role|set-role-label|set-role-emoji`
- `/rradmin set-role-description|set-role-style` - Dropdown descriptions, button styles
- `/rradmin reorder` - Reorder role positions
- `/rradmin create-exclusive-group|delete-exclusive-group|add-role-to-group|remove-role-from-group`
- `/rradmin refresh-panel|view|reset`

### Admin - Server Configuration
- `/serverconfig view`
- `/serverconfig global-limit`
- `/serverconfig add-dashboard-role|remove-dashboard-role`
- `/serverconfig add-blacklist-role|remove-blacklist-role`
- `/serverconfig add-storage-category|remove-storage-category`
- `/serverconfig phantom-ping`

### Admin - Panel Management
- `/panelmanager list|create|clone|rename|delete`
- `/panelmanager set-count`
- `/panelmanager export|import`

### Admin - Other
- `/panel` - Post ticket or reaction role panels
- `/pp` - Toggle phantom ping
- `/setup` - Interactive setup wizard for first-time configuration

## Setup

1. Copy `.env.example` to `.env` and fill in:
   ```
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_client_id
   GUILD_ID=your_guild_id
   DEBUG=false
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Deploy commands:
   ```bash
   node deploy-commands.js
   ```

4. Start the bot:
   ```bash
   node index.js
   ```

5. Configure a ticket panel:
   ```
   /panelmanager create name:Support
   /ticketadmin panel category category:#tickets
   /ticketadmin panel support role:@Support Team
   /ticketadmin channels log channel:#ticket-logs
   /panel
   ```

## Variable Substitution

Use these variables in naming patterns and messages:

| Variable | Description |
|----------|-------------|
| `{username}` | Discord username |
| `{usertag}` | Full user tag |
| `{userid}` | User ID |
| `{usermention}` | @mention |
| `{number}` | Zero-padded ticket number (0001) |
| `{rawNumber}` | Unpadded ticket number |
| `{panelName}` | Panel name |
| `{guildName}` | Server name |
| `{timestamp}` | Discord timestamp |
| `{duration}` | Ticket duration (e.g., "2h 14m") |

## File Structure

```
Bot/
├── index.js                    # Entry point, event handling
├── deploy-commands.js          # Command registration
├── config.json                 # Guild configuration (auto-generated)
├── tickets.json                # Ticket state (auto-generated)
├── commands/
│   ├── admin/                  # Admin commands
│   ├── general/                # General commands
│   ├── panel/                  # Panel posting
│   └── ticket/                 # Ticket operations
├── tickets/
│   ├── ticketService.js        # Core CRUD operations
│   ├── ticketPermissions.js    # Permission handling
│   ├── ticketPanelBuilder.js   # Panel embed building
│   ├── closeHandler.js         # Close/reopen handling
│   ├── claimHandler.js         # Claim handling
│   ├── escalateService.js      # Escalation handling
│   ├── automationService.js    # Background automation
│   └── transcriptService.js    # Transcript generation
├── reactionroles/
│   ├── rrBuilder.js            # RR panel building
│   └── rrHandler.js            # Role toggle handling
└── utils/
    ├── config.js               # Config management
    ├── ticketState.js          # Ticket state management
    ├── permissions.js          # Permission checks
    ├── variables.js            # Variable substitution
    ├── embedBuilder.js         # Embed presets
    ├── logger.js               # Logging
    ├── rateLimiter.js          # Rate limiting
    └── validator.js            # Input validation
```

## License

MIT
