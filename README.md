# ReelNotifier backend

Node.js/Express backend for receiving Instagram Direct webhooks, saving inbound messages, and creating deduplicated Reel subscriptions. It uses PostgreSQL/Prisma and BullMQ/Redis. **Creator monitoring and Part 2 detection are not implemented.** The monitoring worker is intentionally a no-op extension point; it does not scrape Instagram or poll unsupported endpoints.

## Architecture and reliability

- Express preserves the exact JSON request bytes and validates `X-Hub-Signature-256` using `META_APP_SECRET` before accepting webhook POSTs. Echoes and unsupported event types are ignored safely.
- Each inbound message, its sender record, and an `OutboxEvent` are committed in one PostgreSQL transaction. The endpoint acknowledges only after that transaction succeeds; Redis availability is not required for the initial acknowledgement.
- The worker claims outbox rows using PostgreSQL `FOR UPDATE SKIP LOCKED`, publishes BullMQ jobs, then marks the rows dispatched. Queue failures release the row for retry. A 30-second recovery scan also republishes jobs for messages still lacking `processedAt`, including jobs that exhausted their BullMQ retries.
- BullMQ job IDs are deterministic. Incoming processing is idempotent: it can be retried after partially creating subscriptions because database constraints prevent duplicate Reel identities and per-user subscriptions.
- A normalized Reel record is shared by shortcode or media ID. `ReelTracking` rows are individual user subscriptions. One outbox event schedules creator monitoring per shared Reel, regardless of subscriber count.
- Potential notification deliveries have a unique `(detectedReelId, trackingId)` key and an atomic `pending → sending` claim. If Meta returns an explicit API failure, the job may retry. If the connection times out after a request, the delivery remains `sending` to avoid sending a duplicate DM on an ambiguous outcome; reconcile these rare cases manually.
- `/api/*` is protected by `x-api-key` and rate limited. `/health` checks PostgreSQL and Redis.

The webhook parser supports `ig_reel` and `reel` attachments. It also recognizes an `ig_post` attachment as a Reel when its URL is a Reel permalink or Meta supplies a Reel media product type. Media IDs are retained where supplied; a permalink is never inferred from a bare ID. Raw attachment objects are stored in `attachmentData` for debugging. Meta documents Reel attachment URLs, titles, and video IDs in its [Instagram Messaging changelog](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/changelog/) and attachment fields in the [Instagram webhook reference](https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram).

## Prerequisites and local setup

- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- A Meta app using Instagram Messaging with a Facebook Page linked to the Instagram Professional account

```sh
npm install
Copy-Item .env.example .env
```

Set the local connection URLs, `API_ADMIN_KEY`, `META_VERIFY_TOKEN`, and `META_APP_SECRET`. Set `META_PAGE_ACCESS_TOKEN` when testing outbound messages. Start PostgreSQL and Redis, then initialize the database:

```sh
npm run db:generate
npm run db:migrate:dev
npm run dev
```

Run the background workers in another terminal:

```sh
npm run worker
```

Run the automated suite:

```sh
npm test
```

Tests use mocks for PostgreSQL, Redis/BullMQ, and Meta requests. They verify transactional outbox behavior, recovery, attachment payloads, duplicate handling, shared subscriptions, and the Render YAML structure. They do not replace a live PostgreSQL/Redis or real Instagram test.

## Environment variables

See [.env.example](.env.example).

- `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`: Meta app configuration. The verify token is an arbitrary value you create and enter both in Render and Meta; it is not an API token.
- `META_PAGE_ACCESS_TOKEN`: Page token used by the worker for Instagram Direct Send API requests. Never use an app token or Instagram Login token here.
- `META_PAGE_ID`, `INSTAGRAM_ACCOUNT_ID`, `META_GRAPH_API_VERSION`: linked Page/Instagram account IDs and Graph API version.
- `DATABASE_URL`, `REDIS_URL`: PostgreSQL and Redis-compatible connection URLs.
- `API_ADMIN_KEY`: secret for development/admin REST routes.

### Getting the Page Access Token with Facebook Login

1. In the Meta app, configure Facebook Login for the app and sign in as a Facebook user who has the required Page task (including `MESSAGING`) on the ReelNotifier Page.
2. Request a User Access Token with the permissions needed for the configured features, then call `GET /me/accounts?fields=id,name,access_token` (or the equivalent versioned Graph API URL) using that token.
3. Select the Page with ID `1471732602688156` and put its returned `access_token` value into `META_PAGE_ACCESS_TOKEN`. Keep it only in the local `.env` or Render secret settings. Meta's [Page Messages reference](https://developers.facebook.com/docs/graph-api/reference/page/messages) requires a Page access token and the correct Page messaging task.

Do not paste tokens into source code, tickets, logs, or shell history. The app sends the token in the HTTP Authorization header and redacts credentials from logs.

## Meta permissions: development and production

For the Facebook Login flow used here, the current app permissions listed in the original project configuration are not sufficient for the full receive/send path. The messaging integration requires `pages_messaging` and `instagram_manage_messages`; webhook/Page subscription setup requires `pages_manage_metadata`. `pages_show_list` is needed to list Pages and retrieve their Page tokens, and `pages_read_engagement` is used by Page setup/read operations. Keep `instagram_basic` for the linked professional account. See Meta's [Page Conversations permissions](https://developers.facebook.com/docs/graph-api/reference/page/conversations) and [Page webhook requirements](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages).

In **Development mode**, only app-role users (admins, developers, testers) can exercise permissions that do not have Advanced Access. This is suitable for initial testing with accounts added to the app. For **production use by people without an app role**, request App Review/Advanced Access for the permissions and features actually used, complete any Business verification requirements Meta applies, and move the app to the appropriate live state. Meta describes this distinction in its [App Review documentation](https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction). Check the App Dashboard for the access level and review status of this specific app.

## Webhook setup and local testing

Expose port 3000 through an HTTPS tunnel, for example:

```sh
ngrok http 3000
```

In the Meta Developer Dashboard, configure the Instagram messaging webhook callback as `https://YOUR-TUNNEL/webhooks/instagram`, enter the exact `META_VERIFY_TOKEN` value, and subscribe the app/account to the messaging field. Configure the linked Page/account and app permissions for the selected app mode.

Verify the GET callback locally:

```sh
curl "http://localhost:3000/webhooks/instagram?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=challenge123"
```

For POST webhooks, Meta signs the original bytes. Express captures them before JSON parsing, and signature validation compares the supplied `X-Hub-Signature-256` against the HMAC using `META_APP_SECRET`. Example payload fixtures are in [tests/fixtures](tests/fixtures).

## REST endpoints

All `/api/*` endpoints require `x-api-key: $API_ADMIN_KEY`.

```sh
curl http://localhost:3000/health
curl -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/users
curl -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/messages
curl -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/trackings
curl -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/trackings/TRACKING_ID
curl -X POST http://localhost:3000/api/trackings -H "content-type: application/json" -H "x-api-key: $API_ADMIN_KEY" -d '{"instagramUserId":"17890000000000001","originalReelUrl":"https://www.instagram.com/reel/ABC123/"}'
curl -X POST http://localhost:3000/api/trackings -H "content-type: application/json" -H "x-api-key: $API_ADMIN_KEY" -d '{"instagramUserId":"17890000000000001","mediaId":"18000000000000001"}'
curl -X DELETE -H "x-api-key: $API_ADMIN_KEY" http://localhost:3000/api/trackings/TRACKING_ID
```

## Render deployment

The [Render Blueprint](render.yaml) defines a web service, a background worker, PostgreSQL, Redis-compatible Key Value, and a shared environment group. The group generates `API_ADMIN_KEY` once and shares it between the services. `DATABASE_URL` and `REDIS_URL` in both services refer to the same managed resources. Web-only secrets (`META_VERIFY_TOKEN`, `META_APP_SECRET`) and the worker-only Page token are set once on their respective service.

The web service runs `npm run db:migrate` as its pre-deploy command, then starts the API with `npm start`. Render documents pre-deploy commands as the recommended place for migrations; the Blueprint uses a paid `starter` compute plan, which supports this command. See [Render's Blueprint reference](https://render.com/docs/blueprint-spec). Configure secret values through the Blueprint prompt or Render's service settings; do not add them to `render.yaml`.

Set Meta's callback to the deployed HTTPS service URL plus `/webhooks/instagram`, use the web service's `META_VERIFY_TOKEN`, and subscribe to messaging events. `/health` is the Render health-check path. For a manual deployment, set the same environment variables on both services, run `npm ci && npm run db:generate`, execute `npm run db:migrate` as a one-time pre-deploy/release step, then run `npm start` for the web service and `npm run worker` for the worker.

## Implemented versus unsupported

Implemented: signed webhook verification and durable persistence, supported message parsing, raw attachment storage, text/attachment Reel-reference extraction, shared Reel identity and per-user subscriptions, transactional outbox/recovery, protected REST routes, Page-token text messaging, and Render deployment configuration.

Not implemented: creator upload monitoring, Part 2 matching, creator identity lookup, automated notifications based on detected parts, or scraping. No monitoring job claims success; it logs that the supported integration is not configured. Outbound messaging is only available to eligible conversations under Meta's messaging policies and does not authorize unsolicited DMs.
