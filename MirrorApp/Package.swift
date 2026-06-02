// swift-tools-version: 5.9
import PackageDescription
import Foundation

// ---------------------------------------------------------------------------
// MirrorFriends — Skip.dev cross-platform app package.
//
// Two modules:
//   - MirrorModel : the shared Swift model layer (Codable models + the Convex
//                   client abstraction). Pure logic, no UI.
//   - MirrorApp   : the SwiftUI app (screens + view models).
//
// Skip transpiles both modules to Kotlin for the Android build. The Darwin
// (iOS) and Android folders contain the native app shells produced by
// `skip init`; the Swift sources here are the single source of truth.
// ---------------------------------------------------------------------------

let package = Package(
    name: "mirror-app",
    defaultLocalization: "en",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "MirrorApp", type: .dynamic, targets: ["MirrorApp"]),
        .library(name: "MirrorModel", type: .dynamic, targets: ["MirrorModel"]),
    ],
    dependencies: [
        .package(url: "https://source.skip.tools/skip.git", from: "1.1.0"),
        .package(url: "https://source.skip.tools/skip-ui.git", from: "1.0.0"),
        .package(url: "https://source.skip.tools/skip-foundation.git", from: "1.0.0"),
        .package(url: "https://source.skip.tools/skip-model.git", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "MirrorApp",
            dependencies: [
                "MirrorModel",
                .product(name: "SkipUI", package: "skip-ui"),
            ],
            resources: [.process("Resources")],
            plugins: [.plugin(name: "skipstone", package: "skip")]
        ),
        .target(
            name: "MirrorModel",
            dependencies: [
                .product(name: "SkipFoundation", package: "skip-foundation"),
                .product(name: "SkipModel", package: "skip-model"),
            ],
            plugins: [.plugin(name: "skipstone", package: "skip")]
        ),
        .testTarget(
            name: "MirrorModelTests",
            dependencies: [
                "MirrorModel",
                .product(name: "SkipTest", package: "skip"),
            ],
            plugins: [.plugin(name: "skipstone", package: "skip")]
        ),
    ]
)
