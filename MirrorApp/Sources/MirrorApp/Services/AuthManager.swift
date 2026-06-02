import Foundation
import Combine
import MirrorModel

// ===========================================================================
// Authentication.
//
// MirrorFriends supports Email / Apple / Google sign-in. An identity provider
// (Clerk recommended, or Convex Auth / Auth0) issues a JWT that Convex
// validates server-side (convex/auth.config.ts).
//
// The flow with the native Convex SDK:
//   1. `AuthBackend.signIn(...)` obtains a JWT from the IdP.
//   2. We store it in the SDK's `TokenStore`.
//   3. `ConvexService.login()` activates it on the live connection (the
//      ConvexMobile AuthProvider reads the token from the store).
//
// To wire Clerk: implement `AuthBackend` with the Clerk SDK on Darwin / the
// Clerk Android SDK on Android, returning the session JWT. For local dev you can
// paste a JWT via `signInWithToken(_:)`.
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
public final class AuthManager: ObservableObject {
    @Published public private(set) var state: AuthState = .signedOut

    private let service: ConvexService
    private let backend: AuthBackend

    public init(service: ConvexService, backend: AuthBackend = StubAuthBackend()) {
        self.service = service
        self.backend = backend
    }

    public var isSignedIn: Bool { state == .signedIn }

    /// Attempt to restore a cached session on launch.
    public func restoreSession() async {
        guard let token = await backend.restoreToken() else {
            state = .signedOut
            return
        }
        await service.tokenStore.set(token)
        if case .success = await service.loginFromCache() {
            state = .signedIn
        } else {
            state = .signedOut
        }
    }

    public func signIn(method: AuthMethod, email: String? = nil, password: String? = nil) async {
        state = .authenticating
        do {
            let token = try await backend.signIn(method: method, email: email, password: password)
            await activate(token)
        } catch {
            state = .error(friendlyMessage(error))
        }
    }

    /// Dev convenience: sign in by pasting a JWT (e.g. from the Clerk dashboard).
    public func signInWithToken(_ jwt: String) async {
        await activate(jwt)
    }

    private func activate(_ token: String) async {
        await service.tokenStore.set(token)
        switch await service.login() {
        case .success:
            state = .signedIn
        case .failure(let error):
            state = .error(friendlyMessage(error))
        }
    }

    public func signOut() async {
        await service.logout()
        await backend.signOut()
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
/// a valid Convex JWT — replace with Clerk/Convex Auth before shipping. The
/// "Developer sign-in" on the Auth screen (paste a JWT) lets you exercise the
/// full app end-to-end against a real deployment in the meantime.
public struct StubAuthBackend: AuthBackend {
    public init() {}
    public func restoreToken() async -> String? { nil }
    public func signIn(method: AuthMethod, email: String?, password: String?) async throws -> String {
        throw ConvexServiceError.notAuthenticated
    }
    public func signOut() async {}
}
