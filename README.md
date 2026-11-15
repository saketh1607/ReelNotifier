# ReelNotifier backend

Node.js/Express backend for receiving Instagram Direct webhook events, storing messages in PostgreSQL, and queueing processing with BullMQ/Redis. This phase does **not** monitor creators or detect Part 2 Reels. The monitoring worker is a safe extension point and performs no scraping or polling.

## Architecture

- Express accepts Meta verification requests and signature-validated event notifications.
- Prisma stores senders and messages. `messageId` is unique; a deterministic content hash is used when Meta omits a message ID.
- BullMQ queues message processing, tracking creation, future creator monitoring, and notification delivery. Workers retry up to five times with exponential backoff.
- The message worker extracts Reel URLs from text and creates tracking requests. Shared attachment metadata is retained when provided; unavailable URLs remain unavailable.
- `/api/*` is protected by `x-api-key` and rate limited. `/health` checks PostgreSQL and Redis.
- The Instagram send service uses the Facebook Login Page messages edge at `graph.facebook.com/{version}/{PAGE_ID}/messages`, with a Page access token in the Authorization header.

The code handles Instagram webhook `entry[].messaging[]` events and the documented `entry[].changes[].value` message form. It supports `ig_reel`, `ig_post`, `reel`, and legacy/unknown attachment types without assuming a permalink exists.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- A Meta app configured for Instagram Messaging and a Page access token with the required messaging access

## Local setup

```sh
npm install
Copy-Item .env.example .env
```

Set `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `API_ADMIN_KEY`, `DATABASE_URL`, and `REDIS_URL` in `.env`. Never commit `.env`. Configure a local Postgres database and Redis server, then:

```sh
npm run db:generate
npm run db:migrate:dev
npm run dev
```

Run workers in another terminal:

```sh
npm run worker
```

Run automated unit tests with `npm test`. Tests mock the Meta HTTP API. Database persistence should also be verified against a configured PostgreSQL instance by posting a signed webhook and checking `/api/messages`.

## Environment variables

See [.env.example](.env.example). `META_GRAPH_API_VERSION` controls all Graph API calls. `API_ADMIN_KEY` protects internal development/admin endpoints. The supplied Page and Instagram account IDs are defaults from the project configuration; change them only when using another connected account.

## Webhook setup and local testing

Expose port 3000 over HTTPS with a tunnel such as ngrok:

```sh
ngrok http 3000
```

In Meta Developer Dashboard, configure the Instagram messaging webhook callback as `https://YOUR-TUNNEL/webhooks/instagram`, enter the same value as `META_VERIFY_TOKEN`, and subscribe the app/account to the `messages` field. Ensure app roles/permissions and the account connection are configured for the selected development or live mode. Send a DM to `@reelnotifier`; then query stored messages using the admin API.

Test verification directly:

```sh
curl "http://localhost:3000/webhooks/instagram?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=challenge123"
```

The POST endpoint validates `X-Hub-Signature-256` over the exact request bytes using `META_APP_SECRET`. Requests without a valid signature are rejected. See [tests/fixtures/instagram-message.json](tests/fixtures/instagram-message.json) for an example event shape.

## API examples

```sh
curl http://localhost:3000/health
curl -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/users
curl -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/messages
curl -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/trackings
curl -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/trackings/TRACKING_ID
curl -X POST http://localhost:3000/api/trackings -H "content-type: application/json" -H "x-api-key: $API_ADMIN_KEY" -d '{"instagramUserId":"17890000000000001","originalReelUrl":"https://www.instagram.com/reel/ABC123/"}'
curl -X DELETE -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/trackings/TRACKING_ID
```

## Render deployment

`render.yaml` defines a web service, worker service, PostgreSQL, and Redis-compatible Key Value service. Deploy the Blueprint and configure the Meta values in Render's environment settings. The web start command applies Prisma migrations before starting Express; both services need matching database and Redis URLs. Add `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, and `API_ADMIN_KEY` securely. Render resource plans and availability may affect cost; select plans appropriate to your account.

Set the Meta callback URL to the deployed HTTPS URL plus `/webhooks/instagram`, use the configured verify token, and subscribe to messaging events. Health check path is `/health`. For manual deployment, build with `npm ci && npm run db:generate`, run `npm run db:migrate` once, then start the web process with `npm start` and a separate background worker with `npm run worker`.

## Meta configuration and limitations

The connected Facebook Page is used for the Send API endpoint. The Page access token must be valid and authorized for Instagram messaging. Meta app mode, app review/advanced access, Page task access, connected account state, webhook subscription and messaging window policies govern real delivery. This backend does not send unsolicited messages and should only reply when the conversation is eligible under Meta's messaging rules.

The backend stores incoming events before acknowledging them, then queues work. Database/Redis availability is required for reliable webhook acknowledgement. Queue jobs are idempotent by their stored message/tracking IDs where applicable. The actual Graph API response is returned by the messaging service; credentials are never included in logs.

## Implemented and future work

Implemented: webhook verification/signature checking, incoming message parsing and persistence, duplicate handling, Reel link extraction, protected admin endpoints, Prisma models, BullMQ workers/queues, Graph API text messaging, health checks, and Render configuration.

Requires Meta dashboard configuration and actual Instagram testing: webhook field subscriptions, app mode and permission approval, Page access token validity, message receipt, and outbound replies. Automated tests cover parser behavior, verification, signature validation, API error handling, and retry policy. A live PostgreSQL/Redis integration test and a real Instagram delivery test require configured services/Meta credentials.

Future: a supported creator-monitoring data source and Part 2 detection logic. No Instagram scraping or unsupported monitoring is implemented.
