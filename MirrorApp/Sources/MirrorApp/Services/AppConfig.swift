import Foundation

// ===========================================================================
// App configuration.
//
// The Convex deployment URL is read (in priority order) from:
//   1. The CONVEX_URL Info.plist key (set per-build in Skip.env / xcconfig).
//   2. A compile-time fallback below (handy for local dev).
//
// Replace the fallback with your deployment URL, e.g.
//   https://your-deployment.convex.cloud
// ===========================================================================

public enum AppConfig {
    public static let fallbackConvexURL = "https://YOUR-DEPLOYMENT.convex.cloud"

    public static var convexURL: String {
        if let fromPlist = Bundle.main.object(forInfoDictionaryKey: "CONVEX_URL") as? String,
           !fromPlist.isEmpty,
           !fromPlist.contains("YOUR-DEPLOYMENT") {
            return fromPlist
        }
        return fallbackConvexURL
    }

    /// Whether a real deployment URL has been configured.
    public static var isConfigured: Bool {
        !convexURL.contains("YOUR-DEPLOYMENT")
    }
}
