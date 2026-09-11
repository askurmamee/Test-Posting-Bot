# Posting-bot-

Discord bot for keeping sweepstakes casino and Free SC channels code-only.

## What it does

- Lets moderators mark a text channel as a `casino` or `freesc` code-only channel
- Deletes normal chat from protected channels
- Lets members submit codes with simple bot commands
- Stores channel settings locally in `data/channels.json`

## Commands

- `!help`
- `!setcodechannel <casino|freesc> [#channel]`
- `!unsetcodechannel [#channel]`
- `!codechannels`
- `!casino <CODE>`
- `!freesc <CODE>`

If a protected channel is configured, members can also post a bare code directly as long as it is a single token made of letters, numbers, `_`, or `-`.

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env`
3. Add your Discord bot token to `DISCORD_TOKEN`
4. Start the bot:
   - `npm start`

## Discord bot permissions

The bot should have permission to:

- Read messages
- Send messages
- Manage messages
- View channels

Moderators need the **Manage Channels** permission to configure which channels are code-only.
