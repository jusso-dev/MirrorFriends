import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import Apple from "@auth/core/providers/apple";

// ---------------------------------------------------------------------------
// Convex Auth configuration.
//
// Providers:
//   - Password : email + password (the primary native sign-in path). Supports
//                "signIn" and "signUp" flows.
//   - Google / Apple : OAuth. These require a browser redirect, so on mobile
//     they need an in-app web auth session; configure the client secrets via
//     AUTH_GOOGLE_ID/SECRET and AUTH_APPLE_ID/SECRET env vars to enable them.
//
// The exported `signIn`/`signOut` actions are what the mobile app calls
// (action "auth:signIn" / "auth:signOut"). For the Password provider, signIn
// returns `{ tokens: { token, refreshToken } }`, which the native client stores
// and feeds back to Convex (see the app's ConvexAuthBackend).
//
// Required env vars (set via `npx @convex-dev/auth` and the dashboard):
//   JWT_PRIVATE_KEY, JWKS, SITE_URL, CONVEX_SITE_URL
// ---------------------------------------------------------------------------

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google, Apple],
});
