import Foundation
import Combine
import ConvexMobile

// ===========================================================================
// Convex client — native SDK (ConvexMobile / convex-swift).
//
// All backend access goes through `ConvexService`, a thin wrapper over the
// native `ConvexClientWithAuth`. The SDK keeps a live WebSocket and handles
// reconnection, auth refresh, and decoding for us. The mobile app only ever
// invokes named Convex functions — no API keys ever reach the client.
//
//   - `query`    : one-shot read (takes the first value from a subscription).
//   - `subscribe`: reactive stream for screens that want live updates.
//   - `mutation` / `action`: async/await, return decoded results.
// ===========================================================================

public enum ConvexServiceError: Error, LocalizedError {
    case noValue
    case notAuthenticated

    public var errorDescription: String? {
        switch self {
        case .noValue: return "No value returned from the server."
        case .notAuthenticated: return "You are not signed in."
        }
    }
}

/// Holds the current auth token (JWT). The `AuthProvider` reads from it during
/// `login()`. Backed by an actor so it is safe to mutate from any context.
public actor TokenStore {
    private var token: String?
    public init(token: String? = nil) { self.token = token }
    public func get() -> String? { token }
    public func set(_ newValue: String?) { token = newValue }
}

/// A token-based `AuthProvider`. The auth result type `T` is simply the JWT
/// string. Plug a real IdP (Clerk / Auth0) in by setting the token via the
/// `TokenStore` (see AuthManager); this provider just hands it to Convex.
public final class TokenAuthProvider: AuthProvider {
    public typealias T = String
    private let store: TokenStore

    public init(store: TokenStore) { self.store = store }

    public func login(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
        guard let token = await store.get() else {
            onIdToken(nil)
            throw ConvexServiceError.notAuthenticated
        }
        onIdToken(token)
        return token
    }

    public func loginFromCache(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
        try await login(onIdToken: onIdToken)
    }

    public func logout() async throws {
        await store.set(nil)
    }

    public func extractIdToken(from authResult: String) -> String { authResult }
}

public final class ConvexService: @unchecked Sendable {
    public let client: ConvexClientWithAuth<String>
    public let tokenStore: TokenStore

    public init(deploymentUrl: String, tokenStore: TokenStore = TokenStore()) {
        self.tokenStore = tokenStore
        self.client = ConvexClientWithAuth(
            deploymentUrl: deploymentUrl,
            authProvider: TokenAuthProvider(store: tokenStore)
        )
    }

    // MARK: Auth passthrough

    @discardableResult
    public func login() async -> Result<String, Error> {
        await client.login()
    }

    @discardableResult
    public func loginFromCache() async -> Result<String, Error> {
        await client.loginFromCache()
    }

    public func logout() async {
        await client.logout()
    }

    // MARK: Function calls

    /// One-shot query: subscribe and return the first emitted value.
    public func query<T: Decodable>(_ name: String, args: [String: ConvexEncodable?]? = nil) async throws -> T {
        for try await value in client.subscribe(to: name, with: args, yielding: T.self).values {
            return value
        }
        throw ConvexServiceError.noValue
    }

    /// Reactive subscription for screens that want live updates.
    public func subscribe<T: Decodable>(
        to name: String,
        args: [String: ConvexEncodable?]? = nil,
        yielding: T.Type = T.self
    ) -> AnyPublisher<T, ClientError> {
        client.subscribe(to: name, with: args, yielding: T.self)
    }

    @discardableResult
    public func mutation<T: Decodable>(_ name: String, args: [String: ConvexEncodable?]? = nil) async throws -> T {
        try await client.mutation(name, with: args)
    }

    public func mutationVoid(_ name: String, args: [String: ConvexEncodable?]? = nil) async throws {
        try await client.mutation(name, with: args)
    }

    @discardableResult
    public func action<T: Decodable>(_ name: String, args: [String: ConvexEncodable?]? = nil) async throws -> T {
        try await client.action(name, with: args)
    }

    public func actionVoid(_ name: String, args: [String: ConvexEncodable?]? = nil) async throws {
        try await client.action(name, with: args)
    }
}

/// Best-effort human-readable message for a thrown Convex error. Unwraps a
/// structured `ConvexError({ code, message })` thrown by the backend when present.
public func friendlyMessage(_ error: Error) -> String {
    if let clientError = error as? ClientError {
        switch clientError {
        case .ConvexError(let data):
            // `data` is the JSON-encoded value passed to `new ConvexError(...)`.
            if let parsed = parseConvexErrorData(data) { return parsed }
            return data
        default:
            return String(describing: clientError)
        }
    }
    if let localized = error as? LocalizedError, let desc = localized.errorDescription {
        return desc
    }
    return error.localizedDescription
}

private func parseConvexErrorData(_ data: String) -> String? {
    guard let jsonData = data.data(using: .utf8),
          let value = try? JSONDecoder().decode(JSONValue.self, from: jsonData) else { return nil }
    if case let .object(obj) = value, case let .string(message)? = obj["message"] {
        return message
    }
    if case let .string(message) = value { return message }
    return nil
}
