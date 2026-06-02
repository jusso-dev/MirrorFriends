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

## Networking

`MirrorModel/ConvexClient.swift` uses `URLSession` (via SkipFoundation), which
transpiles cleanly to Android's networking stack. This is why the app talks to
Convex over its HTTP API (`/api/query|mutation|action`) rather than a native
client — one code path, both platforms.

### Optional: native `convex-swift` on iOS

If you want reactive subscriptions on iOS, add the
[`convex-swift`](https://github.com/get-convex/convex-swift) package and write a
small adapter conforming to `ConvexClient`, then inject it on Darwin only:

```swift
#if os(iOS) && !SKIP
let client: ConvexClient = ConvexMobileAdapter(deploymentUrl: AppConfig.convexURL)
#else
let client: ConvexClient = ConvexHTTPClient(deploymentUrl: AppConfig.convexURL, auth: auth)
#endif
```

The native client depends on a Rust/UniFFI core that Skip can't transpile, so it
must stay behind an iOS-only `#if`.
