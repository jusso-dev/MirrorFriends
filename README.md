# MirrorFriends 🪞

Create an AI version of yourself — a **Mirror** — teach it about you, connect
with friends, and let your Mirrors talk to each other daily.

MirrorFriends is a cross-platform mobile app (iOS + Android via **Skip.dev** /
Swift / SwiftUI) backed entirely by **Convex** (database, queries, mutations,
actions, cron jobs). All AI runs server-side through a provider abstraction;
the app never talks to OpenAI directly.

---

## Repository layout

```
.
├── convex/                     # Convex backend (the full backend — no Node/PG/Redis)
│   ├── schema.ts               # All tables + indexes
│   ├── auth.ts / auth.config.ts# Auth helpers (Clerk or Convex Auth)
│   ├── users.ts                # getCurrentUser, ensureUser, completeOnboarding
│   ├── mirrors.ts              # Mirror profile + behaviour generation
│   ├── memories.ts             # Private/shareable memory system
│   ├── friends.ts              # Invites + friendships
│   ├── conversations.ts        # Mirror-to-Mirror chat, Ask My Mirror, weekly summary
│   ├── notifications.ts        # Notification records
│   ├── settings.ts             # Privacy controls, export, delete account
│   ├── flags.ts                # Feature flags
│   ├── ai_internal.ts          # AI usage logging
│   ├── crons.ts                # Scheduled functions
│   ├── cron_runners.ts         # Cron fan-out logic
│   └── ai/
│       ├── provider.ts         # AIProvider abstraction (+ usage logging)
│       ├── openai.ts           # OpenAIProvider implementation
│       ├── prompts.ts          # Reusable prompt builders (privacy-enforcing)
│       └── tools.ts            # Internal tool system (memory.search, etc.)
│
└── MirrorApp/                  # Skip.dev cross-platform app
    ├── Package.swift           # SPM manifest (Skip plugin)
    ├── Skip.env                # Skip product config
    └── Sources/
        ├── MirrorModel/        # Shared model layer (Codable models + Convex client)
        └── MirrorApp/          # SwiftUI app (screens + view models)
```

---

## How it works

- **Each user owns exactly one Mirror.** Onboarding creates it and seeds memory.
- **Memory is split by visibility.** `private` memory only ever informs the
  owner's own Mirror; `shareable` memory feeds a cached, AI-safe
  `shareableProfile` that is the *only* thing exposed to friends' Mirrors.
- **Behaviour is derived, versioned state.** Editing your profile/memory
  regenerates a new `mirrorBehaviours` version (the old ones are kept for audit).
- **A daily cron** creates a short (4–8 message) Mirror-to-Mirror conversation
  for every active friendship, then notifies both users.
- **Ask My Mirror** is the one place private memory is used — your Mirror is
  talking to *you*.

Privacy/safety rules are enforced in **two layers**: the data-access layer
(internal queries only ever return shareable data across a Mirror boundary) and
the prompt-construction layer (`convex/ai/prompts.ts`). See
[docs/PRIVACY.md](docs/PRIVACY.md).

---

## Backend setup (Convex)

### 1. Install + initialize

```bash
npm install
npx convex dev          # links/creates a Convex project and generates convex/_generated
```

`npx convex dev` watches `convex/` and pushes functions to your dev deployment.
It also generates `convex/_generated/` (gitignored here — it's created locally).

### 2. Environment variables

Set these in the **Convex dashboard → Settings → Environment Variables**
(see `.env.example`):

```
OPENAI_API_KEY=sk-...           # required for AI features
OPENAI_MODEL=gpt-4o-mini        # optional override

# If using Clerk auth:
CLERK_JWT_ISSUER_DOMAIN=https://your-app.clerk.accounts.dev
```

> The app **never** receives `OPENAI_API_KEY`. All model calls happen inside
> Convex actions via the `AIProvider` abstraction.

### 3. Typecheck

```bash
npx tsc --noEmit
```

### 4. Try the pipeline

From the dashboard or CLI you can exercise the daily conversation generator
without waiting for the cron:

```bash
# Generate a conversation for a friendship (must be signed in as a member):
npx convex run conversations:generateConversationNow '{"friendshipId":"<id>"}'

# Force the daily fan-out:
npx convex run cron_runners:runDailyMirrorConversations
```

---

## Auth

MirrorFriends supports **Email / Apple / Google**. Two interchangeable backends:

1. **Clerk (recommended)** — supports all three providers out of the box.
   - Create a Clerk app, add a JWT template named `convex`.
   - Set `CLERK_JWT_ISSUER_DOMAIN` in Convex.
   - Wire the Clerk SDK in the app's `AuthManager` (`AuthBackend`), returning the
     session JWT from `signIn(...)`.
2. **Convex Auth** — omit the Clerk env var; Convex Auth issues its own JWTs.

Every Convex function validates the caller via `convex/auth.ts` helpers
(`requireUser`, `requireUserAndMirror`, …). There is no path that trusts a
client-supplied user id.

> For quick local testing before wiring a provider, the Auth screen has a
> "Developer sign-in" that accepts a pasted JWT (e.g. from the Clerk dashboard).

---

## Mobile app setup (Skip.dev)

Skip builds native iOS and Android apps from the shared Swift sources.

### Prerequisites (macOS)

```bash
brew install skiptools/skip/skip
skip checkup            # verifies Xcode, Android SDK, Gradle, JDK
```

### Configure the deployment URL

Set your Convex deployment URL (from `npx convex dev`) in
`MirrorApp/Sources/MirrorApp/Services/AppConfig.swift` (or inject `CONVEX_URL`
via the build's Info.plist):

```swift
public static let fallbackConvexURL = "https://your-deployment.convex.cloud"
```

### Run

```bash
cd MirrorApp
skip init --version            # if you need to (re)generate platform projects
swift build                    # builds + transpiles
# iOS:     open the generated Darwin/*.xcodeproj and run, or `skip run`
# Android: skip launches the Gradle build for the Android target
```

The Swift sources under `Sources/` are the single source of truth; Skip
transpiles `MirrorModel` and `MirrorApp` to Kotlin for the Android build. See
[MirrorApp/PLATFORMS.md](MirrorApp/PLATFORMS.md) for details on the per-platform
shells and the optional native `convex-swift` client.

### Tests

```bash
cd MirrorApp
swift test                     # runs MirrorModelTests on both Swift + (via Skip) JVM
```

---

## Screens

Auth · Onboarding · Home · My Mirror · Memory · Friends · Mirror Conversation ·
Ask My Mirror · Settings. (See `MirrorApp/Sources/MirrorApp/Screens/`.)

---

## MVP acceptance criteria → where it lives

| # | Criterion | Implementation |
|---|-----------|----------------|
| 1 | Sign up | `users:ensureUser`, `AuthView` |
| 2 | Complete onboarding | `users:completeOnboarding`, `OnboardingView` |
| 3 | Create a Mirror | created inside `completeOnboarding` |
| 4 | Add memories | `memories:addMemory`, `MemoryView` |
| 5 | Create invite code | `friends:createFriendInvite` |
| 6 | Accept invite | `friends:acceptFriendInvite` |
| 7 | Mirrors become friends | `friendships` row, status `active` |
| 8 | Daily cron generates a conversation | `crons.ts` → `cron_runners` → `conversations:generateDailyMirrorConversation` |
| 9 | Both users view it | `conversations:listMirrorConversations` / `listConversationMessages` |
| 10 | Ask own Mirror | `conversations:askMyMirror`, `AskMyMirrorView` |
| 11 | Behaviour regenerates on change | `mirrors:generateBehaviourForMirror` triggered by profile/memory edits |
| 12 | AI usage logged | `ai_internal:logAiUsage` on every model call |
| 13 | Privacy enforced | data-access + prompt layers (see docs/PRIVACY.md) |

---

## Intentionally NOT built (per spec)

Group chats · voice · video · payments · public feed · marketplace · vector
memory · admin dashboard. The schema and provider/tool abstractions are
structured so these can be added later (e.g. the `memories.embedding` field +
commented vector index for semantic memory).
