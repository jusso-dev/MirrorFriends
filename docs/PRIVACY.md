# Privacy & Safety model

MirrorFriends enforces its privacy rules at **two independent layers** so a bug
in one does not leak data.

## The core invariant

> A Mirror may use **private** memory only when speaking to its **own owner**.
> When two Mirrors talk, only **shareable** material crosses the boundary.

## Layer 1 — Data access

Internal queries are visibility-aware and default to the safe option:

- `memories.getMemoriesForMirror` / `searchMemories` accept a `visibility`
  filter. Cross-Mirror callers always pass `"shareable"`.
- `friends.getFriendshipContext` returns the *other* Mirror's
  `shareableProfile` and interests only — never its memories.
- `conversations.getMirrorSideContext` (used for daily chats) reads only
  `shareable`, non-archived memory via the `by_mirror_visibility` index.
- The owner-only context (`conversations.getAskMyMirrorContext`) is the single
  internal query that returns `private` memory, and it is reachable only by the
  authenticated owner.

## Layer 2 — Prompt construction

`convex/ai/prompts.ts` is the single source of truth for what the model sees:

- `buildConversationPrompt` (Mirror-to-Mirror) is passed only shareable
  profiles/highlights and embeds the non-negotiable `CORE_PERSONA_RULES`.
- `buildAskMyMirrorPrompt` (owner-only) is the one builder that accepts private
  memory.
- Every generated `mirrorBehaviours.systemPrompt` re-encodes: *the Mirror is not
  the human, speaks in the third person, never reveals private memory, never
  makes commitments.*

## Enforced product rules

| Rule | Where |
|------|-------|
| Mirror can't reveal private memory to another Mirror | data + prompt layers |
| Mirror can't impersonate the user | persona rules + behaviour system prompt |
| Mirror can't make commitments for the user | persona rules |
| Mirror can't message humans automatically | no such code path exists |
| Mirror can't contact non-friends | generation only iterates `active` friendships |
| Users can pause Mirror activity | `users.mirrorPaused` (global) + friendship `paused` |
| Users can delete Mirror / memories / account | `mirrors:deleteMyMirror`, `memories:deleteMemory`, `settings:deleteAccount` |
| Friendships can be blocked | `friends:removeFriendship` with `block: true` |

## Auth

Every public function resolves the caller through `convex/authz.ts`
(`requireUser` / `requireUserAndMirror`), which map the Convex Auth identity to a
`users` row via `getAuthUserId(ctx)`. Client-supplied ids are never trusted;
ownership is asserted before any read/write of another row.
