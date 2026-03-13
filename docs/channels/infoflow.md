---
summary: "Connect OpenClaw to Baidu Infoflow (如流)"
read_when:
  - You want to use OpenClaw with Infoflow
  - You need to configure an Infoflow bot
title: "Infoflow (如流)"
---

# Infoflow (如流)

Connect OpenClaw to [Baidu Infoflow](https://infoflow.baidu.com/) (如流), Baidu's enterprise messaging platform.

## Prerequisites

1. A Baidu Infoflow enterprise account with admin access
2. A bot application created in the Infoflow admin console
3. The following credentials from your bot configuration:
   - **App Key**
   - **App Secret**
   - **Access Token** (for webhook signature verification)
   - **Encoding AES Key** (for message decryption)

## Installation

```bash
openclaw plugin install @openclaw/infoflow
```

## Configuration

Add to your `openclaw.yaml`:

```yaml
channels:
  infoflow:
    enabled: true
    appKey: "your-app-key"
    appSecret: "your-app-secret"
    accessToken: "your-access-token"
    encodingAesKey: "your-encoding-aes-key"
    webhookPort: 3000
    webhookPath: "/infoflow/events"
    dmPolicy: pairing
    groupPolicy: allowlist
```

Or use the onboarding wizard:

```bash
openclaw setup
```

## Webhook Setup

1. Start the OpenClaw gateway:

   ```bash
   openclaw gateway run
   ```

2. Expose the webhook endpoint (e.g., via ngrok or a reverse proxy):

   ```bash
   ngrok http 3000
   ```

3. In the Infoflow admin console, set the callback URL to:

   ```
   https://your-domain.com/infoflow/events
   ```

4. The platform will send a verification request. OpenClaw will automatically respond to the challenge.

## Message Types

| Type            | Supported |
| --------------- | --------- |
| Text            | Yes       |
| Markdown        | Yes       |
| Image           | Partial   |
| File            | No        |
| Reactions       | No        |
| Thread replies  | No        |
| Message editing | No        |

## Multi-Account

To run multiple Infoflow bots:

```yaml
channels:
  infoflow:
    defaultAccount: bot1
    accounts:
      bot1:
        appKey: "key-1"
        appSecret: "secret-1"
        accessToken: "token-1"
        encodingAesKey: "aes-key-1"
        webhookPort: 3001
      bot2:
        appKey: "key-2"
        appSecret: "secret-2"
        accessToken: "token-2"
        encodingAesKey: "aes-key-2"
        webhookPort: 3002
```

## Security

- **Webhook verification**: Infoflow uses MD5 signature verification on webhook callbacks.
- **Message encryption**: Messages are AES-ECB encrypted; the Encoding AES Key is required for decryption.
- **DM pairing**: By default, users must pair before chatting with the bot (recommended).

## Troubleshooting

- **Webhook not receiving messages**: Ensure the callback URL is correctly configured and accessible from the internet.
- **Decryption errors**: Verify the Encoding AES Key matches the one in the Infoflow admin console.
- **Authentication failures**: Check that the App Key and App Secret are correct. The secret is MD5-hashed before authentication.

## API Reference

The Infoflow plugin uses the following Baidu Infoflow APIs:

- Token: `POST /api/v1/auth/app_access_token`
- Private message: `POST /api/v1/app/message/send`
- Group message: `POST /api/v1/robot/msg/groupmsgsend`

See the [Infoflow developer documentation](https://qy.baidu.com/doc/) for full API details.
