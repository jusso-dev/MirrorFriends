# Platform builds (Skip.dev)

The Swift sources under `Sources/` are the single source of truth. Skip
transpiles them to Kotlin for Android and compiles them natively for iOS.

## Generating / refreshing the platform shells

`skip init` creates two sibling folders alongside `Package.swift`:

- `Darwin/` — the iOS app shell + generated `*.xcodeproj`. Open it in Xcode (or
  `skip run`) to build and run on a simulator/device. Set your signing team in
  `Skip.env` (`DEVELOPMENT_TEAM`).
- `Android/` — a Gradle project (`settings.gradle.kts`, `app/`, transpiled
  Kotlin under `build/`). Built automatically by the Skip Gradle plugin; launch
  with `skip run` or from Android Studio.

These shells are environment- and signing-specific, so regenerate them locally
with `skip init` rather than relying on checked-in copies. The
`PRODUCT_BUNDLE_IDENTIFIER`, version, and team come from `Skip.env`.

## Networking — native Convex SDK

`MirrorModel/ConvexService.swift` wraps the native
[`convex-swift`](https://github.com/get-convex/convex-swift) SDK (`ConvexMobile`).
It maintains a live WebSocket, handles reconnection and auth refresh, and decodes
results for us. One-shot reads use `query(...)` (first value of a subscription);
screens that want live updates can use `subscribe(...)`.

The whole app is written against the `MirrorAPI` facade, so the SDK is referenced
in exactly one place (`ConvexService`).

### Android bridge (implemented)

`ConvexMobile` ships an Apple-platform Rust/UniFFI binary, so it compiles for
iOS/macOS directly. For Android, `ConvexService` delegates to a hand-written
Kotlin bridge over the native Convex Android SDK:

- `Sources/MirrorModel/ConvexService.swift` — the iOS path (`#if !SKIP`) uses
  ConvexMobile; the Android path (`#if SKIP`) calls `AndroidConvexBridge`.
- `Sources/MirrorModel/AndroidConvexBridge.kt` — plain Kotlin wrapping
  `dev.convex.android.ConvexClientWithAuth`. It exposes a **JSON-string-only**
  surface (`query/mutation/action(name, argsJson) -> String`, `login/logout`) so
  nothing generic, Combine, or Kotlin `Flow` has to cross the Skip boundary.
  Results come back as JSON text and are decoded into the shared Codable models
  with `JSONDecoder` on both platforms.
- `Sources/MirrorModel/Skip/skip.yml` — declares the Android Gradle deps
  (`dev.convex:android-convexmobile`, kotlinx-serialization, kotlinx-coroutines).

`MirrorAPI` and every screen are platform-agnostic: they build neutral
`[String: JSONValue]` argument maps and depend only on `ConvexService`.

**Three things to confirm on a Mac at first `skip build`** (each is a one-liner,
flagged in `AndroidConvexBridge.kt`):
1. The Kotlin `package` of `AndroidConvexBridge.kt` must match the package Skip
   generates for the `MirrorModel` module (check the generated sources).
2. The Android `Context` accessor (`ProcessInfo.processInfo.androidContext`) —
   adjust if your Skip version exposes the app Context differently. It's only
   needed to satisfy the Convex `login(context)` signature; the token provider
   ignores it.
3. That your Skip version reads `build.dependencies` from `skip.yml`; if not, add
   the same Maven coordinates to the generated Android module's `build.gradle.kts`.

### Convex Auth on native

Both platforms sign in by calling the Convex Auth `auth:signIn` action (email +
password → `{ token, refreshToken }`) and feeding the token to `ConvexService`
(`ConvexAuthBackend.swift`). The token then flows to the native client's auth
provider (ConvexMobile on iOS, the Kotlin `TokenAuthProvider` on Android).
