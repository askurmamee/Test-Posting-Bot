# Posting-bot-

Discord bot for keeping sweepstakes casino and Free SC channels code-only.

## What it does

- Lets moderators mark a text channel as a `casino` or `freesc` code-only channel
- Lets moderators choose one records-only channel where the bot saves all freebies
- Deletes normal chat from protected channels
- Lets members submit a name, code, link, and short description from any channel
- Stores channel settings locally in `data/channels.json`

## Commands

- `!help`
- `!setcodechannel <casino|freesc> [#channel]`
- `!unsetcodechannel [#channel]`
- `!setrecordschannel [#channel]`
- `!unsetrecordschannel`
- `!codechannels`
- `!casino Name | CODE | https://link | short description`
- `!freesc Name | CODE | https://link | short description`

If a protected channel is configured, members can also post a bare code directly as long as it is a single token made of letters, numbers, `_`, or `-`.

All `!casino` and `!freesc` submissions can be run in any channel. The bot sends the finished freebie entry into the configured records channel.

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
