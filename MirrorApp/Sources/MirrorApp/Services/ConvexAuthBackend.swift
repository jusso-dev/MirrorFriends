import Foundation
import MirrorModel

// ===========================================================================
// ConvexAuthBackend — Convex Auth (@convex-dev/auth) sign-in for native clients.
//
// Flow (matches Convex Auth's React Native token flow):
//   - Email/password: call the `auth:signIn` action with
//       { provider: "password", params: { email, password, flow } }
//     which returns { tokens: { token, refreshToken } }.
//   - Store the access token (handed to Convex via the ConvexService token
//     store + login) and persist the refresh token to exchange for fresh access
//     tokens on relaunch via `auth:signIn` with { refreshToken }.
//   - Sign out: call `auth:signOut` (invalidates the session) and clear caches.
//
// OAuth (Apple/Google) needs a browser redirect; wire an in-app web auth session
// to complete it. Email/password works end-to-end without extra setup.
// ===========================================================================

public final class ConvexAuthBackend: AuthBackend, @unchecked Sendable {
    private let service: ConvexService
    private let defaults: UserDefaults
    private let refreshTokenKey = "mirrorfriends.convexAuth.refreshToken"

    public init(service: ConvexService, defaults: UserDefaults = .standard) {
        self.service = service
        self.defaults = defaults
    }

    // MARK: AuthBackend

    public func restoreToken() async -> String? {
        guard let refreshToken = defaults.string(forKey: refreshTokenKey) else { return nil }
        do {
            let tokens = try await exchangeRefreshToken(refreshToken)
            persist(tokens)
            return tokens.token
        } catch {
            // Refresh token invalid/expired — force a fresh sign-in.
            defaults.removeObject(forKey: refreshTokenKey)
            return nil
        }
    }

    public func signIn(
        method: AuthMethod,
        email: String?,
        password: String?,
        createAccount: Bool
    ) async throws -> String {
        switch method {
        case .email:
            guard let email, let password, !email.isEmpty, !password.isEmpty else {
                throw AuthBackendError.missingCredentials
            }
            let tokens = try await passwordSignIn(
                email: email, password: password, flow: createAccount ? "signUp" : "signIn"
            )
            persist(tokens)
            return tokens.token
        case .apple, .google:
            // Requires an OAuth redirect flow; not wired in this MVP.
            throw AuthBackendError.oauthNotConfigured
        }
    }

    public func signOut() async {
        // Best-effort server-side invalidation; ignore failures.
        _ = try? await service.actionVoid("auth:signOut")
        defaults.removeObject(forKey: refreshTokenKey)
    }

    // MARK: Convex Auth calls

    private func passwordSignIn(email: String, password: String, flow: String) async throws -> Tokens {
        let args: [String: JSONValue] = [
            "provider": .str("password"),
            "params": .object([
                "email": .str(email),
                "password": .str(password),
                "flow": .str(flow),
            ]),
        ]
        let result: SignInResult = try await service.action("auth:signIn", args: args)
        guard let tokens = result.tokens else { throw AuthBackendError.noTokens }
        return tokens
    }

    private func exchangeRefreshToken(_ refreshToken: String) async throws -> Tokens {
        let args: [String: JSONValue] = ["refreshToken": .str(refreshToken)]
        let result: SignInResult = try await service.action("auth:signIn", args: args)
        guard let tokens = result.tokens else { throw AuthBackendError.noTokens }
        return tokens
    }

    private func persist(_ tokens: Tokens) {
        defaults.set(tokens.refreshToken, forKey: refreshTokenKey)
    }

    // MARK: Response shapes

    private struct SignInResult: Codable {
        var tokens: Tokens?
    }
}

/// Convex Auth token pair returned by the `auth:signIn` action.
public struct Tokens: Codable, Sendable {
    public var token: String
    public var refreshToken: String
}
