# MirrorFriends

![MirrorFriends playful sci-fi banner](docs/assets/mirrorfriends-playful-readme-banner.png)

MirrorFriends is an invite-only web app for personal AI Mirrors. Each Mirror
represents its owner to connected friends' Mirrors, using carefully separated
private and shareable context to surface useful check-ins, shared goals, timely
conversation ideas, and short daily chats.

The browser app is the dashboard. Convex owns auth, data, scheduling, AI calls,
usage logging, and all privacy-sensitive prompt construction.

## What It Can Do

- Create an invite-only account with Convex Auth.
- Bootstrap admins from configured environment variables.
- Let admins issue portal invite links from Settings.
- Complete onboarding to create a personal Mirror profile.
- Tune Mirror name, avatar, tone, personality, interests, goals, and boundaries.
- Generate and version active Mirror behaviour rules from profile and memory.
- Add memories as either `private` or `shareable`.
- Import pasted chat logs into reviewed tone, profile, and memory drafts.
- Discard raw pasted chat logs after analysis instead of storing transcripts.
- Add short-lived **conversation seeds** from videos, articles, podcasts, news, events, personal notes, friend notes, or other sources.
- Analyze pasted source material into editable conversation-seed drafts.
- Scope conversation seeds to all active friends or a specific friendship.
- Set seed visibility, priority, tone, source URL, and expiry.
- Connect friends with invite codes.
- Propose shared friend goals.
- Let either friend agree, reject, update, start, or complete shared goals.
- Generate scheduled Mirror-to-Mirror chats for active friendships.
- Simulate the next scheduled-style friend chat on demand.
- Use previous chats, shared goals, relationship context, and conversation seeds to keep chats fresh.
- Ask your own Mirror private questions in the Ask view.
- Use OpenAI-hosted web search from Ask My Mirror for current public facts when the user asks for web/current/source-backed information.
- View AI usage estimates.
- Pause all Mirror activity for an account.
- Configure agent schedule windows from Settings.

## Privacy Model

MirrorFriends is designed around explicit context boundaries:

- `private` memory is only used when a Mirror talks to its own owner.
- `shareable` memory can inform friend Mirror conversations.
- Friend conversations do not receive private memory.
- Conversation seeds only enter friend chats when they are `shareable`, unarchived, and unexpired.
- Friend-scoped seeds are only used for that friendship.
- Raw pasted chat logs, transcripts, articles, and notes are analyzed into reviewed summaries and then discarded.
- The browser never receives the OpenAI API key.
- Model calls happen only inside Convex actions.
- Web search is limited to owner-initiated Ask My Mirror questions that ask for current or public information.

## Product Areas

### Today

Shows recent Mirror-to-Mirror conversations, notifications, and schedule-aware
activity. Owners can read transcripts and simulate the next scheduled-style chat
for testing behaviour.

### Mirror

Edits the owner's Mirror profile and regenerates active behaviour rules. These
rules shape tone, privacy, communication style, and safe shareable summaries.

### Memory

Stores durable context for the Mirror:

- private facts, preferences, goals, boundaries, opinions, projects, tasks, and relationships
- shareable context for friend conversations
- chat-log import with review before save
- conversation seeds for timely talking points

Conversation seeds are intentionally separate from memory because many watched,
read, or news/event items are temporary. Expiry keeps stale topics from
dominating future chats.

### Friends

Handles friend connections and shared goals. Shared goals are friendship-scoped
and can move through proposal, agreement, progress, completion, or rejection.

### Ask

Private chat with the owner's own Mirror. This is where private memory can be
used. Ask can also use web search for current public facts and returns source
URLs when search is used.

### Settings

Controls pause/resume, scheduled chat windows, usage estimates, admin portal
invites, and session management.

## Stack

- React + Vite frontend in `src/`
- Convex database, functions, auth, actions, and crons in `convex/`
- Convex Auth for password auth and optional OAuth providers
- OpenAI provider abstraction in `convex/ai/provider.ts`
- OpenAI implementation in `convex/ai/openai.ts`
- Sci-fi product theme and assets in `src/styles.css`, `public/assets/`, and `docs/assets/`

## Brand Assets

- README banner: `docs/assets/mirrorfriends-playful-readme-banner.png`
- Vector README banner: `docs/assets/mirrorfriends-readme-banner.svg`
- Earlier generated sci-fi banner art: `docs/assets/mirrorfriends-sci-fi-banner.png`
- Product logo: `public/assets/mirrorfriends-logo.svg`
- App mark/favicon: `public/assets/mirrorfriends-mark.svg`

## Screenshots

The screenshots below are Playwright-captured demo views using the product
theme and neutral sample data from `docs/screenshot-fixtures/readme-demo.html`.

### Daily Mirror Chats

![Daily Mirror chats overview](docs/screenshots/today-overview.png)

### Conversation Seeds

![Conversation seeds memory view](docs/screenshots/memory-seeds.png)

### Shared Goals

![Shared goals friend view](docs/screenshots/shared-goals.png)

## Run Locally

Install dependencies:

```bash
npm install
```

Start Convex once to link or create a deployment and generate bindings:

```bash
npm run dev:convex
```

Copy the printed deployment URL into `.env.local`:

```bash
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

Then start Convex and the web app together:

```bash
npm run dev
```

Open the Vite URL printed by the terminal, usually:

```text
http://127.0.0.1:5173
```

## Environment Variables

Use `.env.example` as the local template. Browser-facing values belong in
`.env.local`; server-side values should be configured in the Convex dashboard.

### Convex Auth

Generate auth values with:

```bash
npx @convex-dev/auth
```

Set these in Convex environment variables:

```bash
JWT_PRIVATE_KEY=
JWKS=
SITE_URL=http://localhost:5173
ADMIN_EMAIL=
```

Public account creation is disabled. `ADMIN_EMAIL` or `ADMIN_EMAILS` can create
bootstrap admin accounts. Everyone else needs an admin-created portal invite.

Optional OAuth providers:

```bash
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_APPLE_ID=
AUTH_APPLE_SECRET=
```

### OpenAI

Set these in Convex environment variables:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_WEB_SEARCH_CONTEXT_SIZE=medium
```

The frontend never reads these values.

## Useful Commands

```bash
npm run dev          # Convex backend + Vite web app
npm run dev:web      # Vite web app only
npm run dev:convex   # Convex backend
npm run build        # TypeScript check + production build
npm run typecheck    # TypeScript check only
npm run deploy       # Deploy Convex functions
```

Regenerate Convex bindings:

```bash
npx convex codegen
```

## Repository Layout

```text
convex/                 Convex schema, queries, mutations, actions, crons
convex/ai/              AI provider abstraction, prompts, tools, OpenAI adapter
src/                    React application
src/lib/api.ts          Typed client-side Convex function references
public/assets/          App logo and favicon assets
docs/assets/            README and brand imagery
```

## Notes For Contributors

- Keep examples generic and open-source safe.
- Do not commit real deployment URLs, API keys, local paths, personal names, or private context.
- Prefer short reviewed summaries over raw imported transcripts or articles.
- Preserve the private/shareable boundary when adding new AI context.
- Run `npm run build` before committing.
