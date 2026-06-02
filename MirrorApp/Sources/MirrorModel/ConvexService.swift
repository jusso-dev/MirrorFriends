import Foundation
#if !SKIP
import Combine
import ConvexMobile
#endif

// ===========================================================================
// Convex client — cross-platform.
//
// `ConvexService` exposes one API to the app (MirrorAPI) and has two backends:
//
//   • iOS / macOS (#if !SKIP): the native Swift SDK `ConvexMobile`.
//   • Android (#if SKIP):      a hand-written Kotlin bridge (AndroidConvexBridge.kt)
//                              over the native Kotlin SDK `dev.convex.android`.
//
// The boundary between Swift and the Android Kotlin bridge is JSON strings only
// (arguments in, result JSON out). This deliberately avoids passing Swift
// generics / Combine / Kotlin Flow across the Skip transpilation boundary —
// results are decoded into the shared Codable models with `JSONDecoder` on
// whichever platform we're on.
//
// All function arguments are built as a platform-neutral `[String: JSONValue]`
// map by MirrorAPI; this service converts them to the native arg type.
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

/// Holds the current auth token (JWT). Backed by an actor so it is safe to
/// mutate from any context. On iOS the token is read by the ConvexMobile
/// AuthProvider during `login()`; on Android it is handed to the Kotlin bridge.
public actor TokenStore {
    private var token: String?
    public init(token: String? = nil) { self.token = token }
    public func get() -> String? { token }
    public func set(_ newValue: String?) { token = newValue }
}

#if !SKIP
/// A token-based ConvexMobile `AuthProvider` (iOS). The auth result type is the
/// JWT string itself; the provider just hands the stored token to Convex.
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
    public func logout() async throws { await store.set(nil) }
    public func extractIdToken(from authResult: String) -> String { authResult }
}
#endif

public final class ConvexService: @unchecked Sendable {
    public let tokenStore: TokenStore

    #if !SKIP
    public let client: ConvexClientWithAuth<String>
    #else
    private let bridge: AndroidConvexBridge
    #endif

    public init(deploymentUrl: String, tokenStore: TokenStore = TokenStore()) {
        self.tokenStore = tokenStore
        #if !SKIP
        self.client = ConvexClientWithAuth(
            deploymentUrl: deploymentUrl,
            authProvider: TokenAuthProvider(store: tokenStore)
        )
        #else
        self.bridge = AndroidConvexBridge(deploymentUrl: deploymentUrl)
        #endif
    }

    // MARK: Auth

    @discardableResult
    public func login() async -> Bool {
        let token = await tokenStore.get()
        #if !SKIP
        if case .success = await client.login() { return true }
        return false
        #else
        return await bridge.login(token: token)
        #endif
    }

    @discardableResult
    public func loginFromCache() async -> Bool {
        #if !SKIP
        if case .success = await client.loginFromCache() { return true }
        return false
        #else
        let token = await tokenStore.get()
        return await bridge.login(token: token)
        #endif
    }

    public func logout() async {
        #if !SKIP
        await client.logout()
        #else
        await bridge.logout()
        #endif
        await tokenStore.set(nil)
    }

    // MARK: Function calls

    public func query<T: Decodable>(_ name: String, args: [String: JSONValue] = [:]) async throws -> T {
        #if !SKIP
        for try await value in client.subscribe(to: name, with: iosArgs(args), yielding: T.self).values {
            return value
        }
        throw ConvexServiceError.noValue
        #else
        let json = try await bridge.query(name: name, argsJson: JSONValue.argsJSONString(args))
        return try JSONValue.decode(T.self, fromJSONString: json)
        #endif
    }

    @discardableResult
    public func mutation<T: Decodable>(_ name: String, args: [String: JSONValue] = [:]) async throws -> T {
        #if !SKIP
        return try await client.mutation(name, with: iosArgs(args))
        #else
        let json = try await bridge.mutation(name: name, argsJson: JSONValue.argsJSONString(args))
        return try JSONValue.decode(T.self, fromJSONString: json)
        #endif
    }

    public func mutationVoid(_ name: String, args: [String: JSONValue] = [:]) async throws {
        #if !SKIP
        try await client.mutation(name, with: iosArgs(args))
        #else
        _ = try await bridge.mutation(name: name, argsJson: JSONValue.argsJSONString(args))
        #endif
    }

    @discardableResult
    public func action<T: Decodable>(_ name: String, args: [String: JSONValue] = [:]) async throws -> T {
        #if !SKIP
        return try await client.action(name, with: iosArgs(args))
        #else
        let json = try await bridge.action(name: name, argsJson: JSONValue.argsJSONString(args))
        return try JSONValue.decode(T.self, fromJSONString: json)
        #endif
    }

    public func actionVoid(_ name: String, args: [String: JSONValue] = [:]) async throws {
        #if !SKIP
        try await client.action(name, with: iosArgs(args))
        #else
        _ = try await bridge.action(name: name, argsJson: JSONValue.argsJSONString(args))
        #endif
    }

    #if !SKIP
    // Convert the neutral arg map to ConvexMobile's `[String: ConvexEncodable?]`.
    // Our argument values are flat: strings, bools, numbers, and string arrays.
    private func iosArgs(_ args: [String: JSONValue]) -> [String: ConvexEncodable?] {
        var out: [String: ConvexEncodable?] = [:]
        for (key, value) in args {
            out[key] = Self.toConvexEncodable(value)
        }
        return out
    }

    private static func toConvexEncodable(_ value: JSONValue) -> ConvexEncodable? {
        switch value {
        case .null: return nil
        case .bool(let b): return b
        case .number(let n): return n
        case .string(let s): return s
        case .array(let a):
            // Argument arrays are always arrays of strings.
            return a.compactMap { item -> String? in
                if case let .string(s) = item { return s }
                return nil
            }
        case .object(let o):
            // Nested objects (e.g. Convex Auth's `params`) map to a nested
            // ConvexEncodable dictionary.
            var d: [String: ConvexEncodable?] = [:]
            for (key, val) in o { d[key] = toConvexEncodable(val) }
            return d
        }
    }
    #endif
}

/// Best-effort human-readable message for a thrown Convex error.
public func friendlyMessage(_ error: Error) -> String {
    #if !SKIP
    if let clientError = error as? ClientError {
        switch clientError {
        case .ConvexError(let data):
            if let parsed = parseConvexErrorData(data) { return parsed }
            return data
        default:
            return String(describing: clientError)
        }
    }
    #endif
    if let serviceError = error as? ConvexServiceError, let desc = serviceError.errorDescription {
        return desc
    }
    if let localized = error as? LocalizedError, let desc = localized.errorDescription {
        return desc
    }
    return "\(error)"
}

private func parseConvexErrorData(_ data: String) -> String? {
    guard let value = try? JSONValue.decode(JSONValue.self, fromJSONString: data) else { return nil }
    if case let .object(obj) = value, case let .string(message)? = obj["message"] {
        return message
    }
    if case let .string(message) = value { return message }
    return nil
}
