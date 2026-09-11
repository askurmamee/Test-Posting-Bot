# Posting-bot-

Discord bot for keeping code channels clean and sending code or referral submissions into records channels.

## What it does

- Lets moderators mark a text channel as a `casino` or `freesc` code-only channel
- Lets moderators choose one records-only channel for codes and one for referrals
- Deletes normal chat from protected channels
- Lets members submit a code or referral from any channel with one command
- Stores channel settings locally in `data/channels.json`

## Commands

- `!help`
- `!setcodechannel <casino|freesc> [#channel]`
- `!unsetcodechannel [#channel]`
- `!setcoderecordschannel [#channel]`
- `!unsetcoderecordschannel`
- `!setreferralrecordschannel [#channel]`
- `!unsetreferralrecordschannel`
- `!codechannels`
- `!code Name | CODE | optional-link`
- `!referral Name | https://link | optional short description`

Legacy aliases still work:

- `!casino Name | CODE | optional-link`
- `!freesc Name | CODE | optional-link`

If a protected channel is configured, members can also post a bare code directly as long as it is a single token made of letters, numbers, `_`, or `-`.

All `!code`, `!casino`, `!freesc`, and `!referral` submissions can be run in any channel. The bot sends each one into the correct configured records channel.

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
