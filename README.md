# Posting-bot-

Discord bot for keeping code channels clean and sending code or referral submissions into records channels.

## What it does

- Lets moderators mark only the channels they need as code-only
- Lets moderators choose one records-only channel for codes and one for referrals
- Deletes normal chat from protected channels
- Lets members submit a code or referral from any channel with one simple command
- Lets admins restart the bot or run a configured update command from Discord
- Stores channel settings locally in `data/channels.json`

## Commands

- `!help`
- `!setcodechannel [#channel]`
- `!unsetcodechannel [#channel]`
- `!setcoderecordschannel [#channel]`
- `!unsetcoderecordschannel`
- `!setreferralrecordschannel [#channel]`
- `!unsetreferralrecordschannel`
- `!codechannels`
- `!code Name | CODE | optional-link`
- `!referral Name | https://link | optional short description`
- `!restartbot`
- `!updatebot`

If a protected channel is configured, members can also post a bare code directly as long as it is a single token made of letters, numbers, `_`, or `-`.

All `!code` and `!referral` submissions can be run in any channel. The bot sends each one into the correct configured records channel.

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env`
3. Add your Discord bot token to `DISCORD_TOKEN`
4. Optional: set `ADMIN_ROLE_IDS` to a comma-separated list of Discord role IDs allowed to use `!restartbot` and `!updatebot`
5. Optional: set `UPDATE_COMMAND` if you want `!updatebot` to run a server-side update command
6. Optional: set `RESTART_AFTER_UPDATE=true` if the bot should restart after a successful update
7. Optional: set `CHANNEL_STORE_DIR` if you want to store `channels.json` outside the default `./data` folder
8. Start the bot:
   - `npm start`

## Smooth hosting

Recommended default: **PM2**

1. Install PM2 on the host machine:
   - `npm install -g pm2`
2. Install dependencies:
   - `npm install`
3. Start with PM2:
   - `npx pm2 start ecosystem.config.cjs`
4. Save the PM2 process list:
   - `npx pm2 save`

Useful PM2 commands:

- `npx pm2 status`
- `npx pm2 logs posting-bot`
- `npx pm2 restart posting-bot`

You can also use Docker restart policies or systemd if you prefer.

## Updates and persistence

- Keep `UPDATE_COMMAND` simple and predictable, for example:
  - `git pull --ff-only && npm install --omit=dev`
- Only run `!updatebot` on the machine that is actually hosting the bot
- Keep `data/channels.json` (or your configured `CHANNEL_STORE_DIR`) on persistent storage or back it up before redeploys

## Discord bot permissions

The bot should have permission to:

- Read messages
- Send messages
- Manage messages
- View channels

Moderators need the **Manage Channels** permission to configure which channels are code-only.

The `!restartbot` and `!updatebot` commands require the configured admin role from `ADMIN_ROLE_IDS`, or else they fall back to the **Administrator** permission.
