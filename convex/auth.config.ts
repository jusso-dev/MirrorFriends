// ---------------------------------------------------------------------------
// Auth configuration.
//
// MirrorFriends supports two interchangeable auth backends. Both resolve to a
// single `users` row via the identity `subject`, so the rest of the codebase
// is auth-provider agnostic (see convex/auth.ts -> getAuthenticatedUser).
//
// 1. Clerk (recommended if it integrates cleanly with Skip + Convex Swift):
//    Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard and configure a JWT
//    template named "convex" in Clerk. Clerk supports Email, Apple and Google.
//
// 2. Convex Auth: omit the Clerk provider; Convex Auth issues its own JWTs.
//
// The providers array below is read by Convex to validate incoming JWTs.
// ---------------------------------------------------------------------------

const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: clerkDomain
    ? [
        {
          domain: clerkDomain,
          applicationID: "convex",
        },
      ]
    : [],
};
