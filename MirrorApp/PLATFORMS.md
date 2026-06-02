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

### Android note

`ConvexMobile` ships an Apple-platform binary (a Rust/UniFFI core), so it
compiles for the iOS/macOS targets directly. For the Android build, Convex
provides a native Kotlin client
([`convex-mobile`](https://github.com/get-convex/convex-mobile)) with the same
function-call surface. Bridge it behind `ConvexService` using Skip's native
interop (`#if SKIP` / a Kotlin shim) — `MirrorAPI` and every screen stay
unchanged because they only depend on `ConvexService`.
