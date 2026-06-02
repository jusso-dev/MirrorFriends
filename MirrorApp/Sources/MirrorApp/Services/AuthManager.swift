import Foundation
import Combine
import MirrorModel

// ===========================================================================
// Authentication.
//
// MirrorFriends supports Email / Apple / Google sign-in. The actual identity
// provider (Clerk recommended, or Convex Auth) issues a JWT that Convex
// validates server-side (see convex/auth.config.ts).
//
// This manager abstracts that flow behind a small surface:
//   - `signIn(...)` obtains a token from the provider.
//   - `currentToken()` (AuthTokenProvider) hands the token to the Convex client.
//
// To wire Clerk: implement `ClerkAuthBackend` using the Clerk iOS SDK on Darwin
// and the Clerk Android SDK on Android (Skip lets you bridge per-platform). For
// local development you can paste a JWT via `signInWithToken(_:)`.
// ===========================================================================

public enum AuthMethod: String, Sendable {
    case email, apple, google
}

public enum AuthState: Equatable, Sendable {
    case signedOut
    case authenticating
    case signedIn
    case error(String)
}

@MainActor
public final class AuthManager: ObservableObject, AuthTokenProvider {
    @Published public private(set) var state: AuthState = .signedOut

    private var token: String?
    private let backend: AuthBackend

    public init(backend: AuthBackend = StubAuthBackend()) {
        self.backend = backend
    }

    // AuthTokenProvider — called by the Convex client on every request.
    nonisolated public func currentToken() async -> String? {
        await MainActor.run { self.token }
    }

    public var isSignedIn: Bool { state == .signedIn }

    public func restoreSession() async {
        if let restored = await backend.restoreToken() {
            token = restored
            state = .signedIn
        }
    }

    public func signIn(method: AuthMethod, email: String? = nil, password: String? = nil) async {
        state = .authenticating
        do {
            let newToken = try await backend.signIn(method: method, email: email, password: password)
            token = newToken
            state = .signedIn
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    /// Dev convenience: sign in by pasting a JWT (e.g. from the Clerk dashboard).
    public func signInWithToken(_ jwt: String) {
        token = jwt
        state = .signedIn
    }

    public func signOut() async {
        await backend.signOut()
        token = nil
        state = .signedOut
    }
}

/// The pluggable identity backend. Conform to this with Clerk / Convex Auth.
public protocol AuthBackend: Sendable {
    func restoreToken() async -> String?
    func signIn(method: AuthMethod, email: String?, password: String?) async throws -> String
    func signOut() async
}

/// Placeholder backend used until a real provider is wired. It does NOT produce
/// a valid Convex JWT — replace with Clerk/Convex Auth before shipping. It lets
/// the UI and navigation be exercised end-to-end in development.
public struct StubAuthBackend: AuthBackend {
    public init() {}
    public func restoreToken() async -> String? { nil }
    public func signIn(method: AuthMethod, email: String?, password: String?) async throws -> String {
        // Surface a clear message rather than silently "succeeding".
        throw ConvexFunctionError.notConfigured
    }
    public func signOut() async {}
}
