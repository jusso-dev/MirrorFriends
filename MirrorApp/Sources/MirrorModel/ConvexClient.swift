import Foundation

// ===========================================================================
// Convex client.
//
// MirrorFriends talks to Convex over its HTTP API (`/api/query`, `/api/mutation`,
// `/api/action`). This path works identically on iOS and Android through Skip's
// SkipFoundation URLSession support, and keeps OpenAI/API keys entirely on the
// backend — the app only ever invokes named Convex functions.
//
// On iOS you may optionally swap in the native `convex-swift` package
// (ConvexMobile) for reactive subscriptions; conform it to `ConvexClient` and
// inject it instead. The rest of the app is written against this protocol.
// ===========================================================================

/// Supplies the current auth bearer token (Clerk JWT or Convex Auth token).
public protocol AuthTokenProvider: Sendable {
    func currentToken() async -> String?
}

/// No-auth provider for local/dev usage against a deployment without auth gating.
public struct NoAuthProvider: AuthTokenProvider {
    public init() {}
    public func currentToken() async -> String? { nil }
}

public enum ConvexFunctionError: Error, LocalizedError, Sendable {
    case http(status: Int, body: String)
    case backend(message: String, code: String?)
    case decoding(String)
    case transport(String)
    case notConfigured

    public var errorDescription: String? {
        switch self {
        case .http(let status, let body): return "HTTP \(status): \(body)"
        case .backend(let message, _): return message
        case .decoding(let detail): return "Decoding failed: \(detail)"
        case .transport(let detail): return "Network error: \(detail)"
        case .notConfigured: return "Convex client is not configured."
        }
    }

    /// Backend error code if the server threw a structured ConvexError.
    public var code: String? {
        if case let .backend(_, code) = self { return code }
        return nil
    }
}

/// The surface the app is written against.
public protocol ConvexClient: Sendable {
    func query<T: Decodable>(_ path: String, args: ConvexArgs) async throws -> T
    func mutation<T: Decodable>(_ path: String, args: ConvexArgs) async throws -> T
    func action<T: Decodable>(_ path: String, args: ConvexArgs) async throws -> T
}

public extension ConvexClient {
    func query<T: Decodable>(_ path: String) async throws -> T {
        try await query(path, args: .empty)
    }
    func mutation<T: Decodable>(_ path: String) async throws -> T {
        try await mutation(path, args: .empty)
    }
    func action<T: Decodable>(_ path: String) async throws -> T {
        try await action(path, args: .empty)
    }
}

// MARK: - HTTP implementation

public final class ConvexHTTPClient: ConvexClient, @unchecked Sendable {
    private let deploymentURL: URL
    private let auth: AuthTokenProvider
    private let session: URLSession

    public init(
        deploymentUrl: String,
        auth: AuthTokenProvider = NoAuthProvider(),
        session: URLSession = .shared
    ) {
        // Normalise: strip trailing slash.
        let trimmed = deploymentUrl.hasSuffix("/")
            ? String(deploymentUrl.dropLast())
            : deploymentUrl
        self.deploymentURL = URL(string: trimmed) ?? URL(string: "https://invalid.convex.cloud")!
        self.auth = auth
        self.session = session
    }

    public func query<T: Decodable>(_ path: String, args: ConvexArgs) async throws -> T {
        try await call(endpoint: "query", path: path, args: args)
    }

    public func mutation<T: Decodable>(_ path: String, args: ConvexArgs) async throws -> T {
        try await call(endpoint: "mutation", path: path, args: args)
    }

    public func action<T: Decodable>(_ path: String, args: ConvexArgs) async throws -> T {
        try await call(endpoint: "action", path: path, args: args)
    }

    // The shared request/response pipeline.
    private func call<T: Decodable>(endpoint: String, path: String, args: ConvexArgs) async throws -> T {
        let url = deploymentURL.appendingPathComponent("api").appendingPathComponent(endpoint)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = await auth.currentToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let body = RequestBody(path: path, args: args.json, format: "json")
        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ConvexFunctionError.transport(error.localizedDescription)
        }

        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw ConvexFunctionError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }

        // Decode the Convex envelope.
        let envelope: ResponseEnvelope
        do {
            envelope = try JSONDecoder().decode(ResponseEnvelope.self, from: data)
        } catch {
            throw ConvexFunctionError.decoding("envelope: \(error.localizedDescription)")
        }

        if envelope.status != "success" {
            let (message, code) = Self.extractError(envelope)
            throw ConvexFunctionError.backend(message: message, code: code)
        }

        // Re-encode the dynamic `value` and decode into the requested type.
        let value = envelope.value ?? .null
        // Handle `Void`-like responses gracefully when T can decode from null/object.
        let valueData: Data
        do {
            valueData = try JSONEncoder().encode(value)
        } catch {
            throw ConvexFunctionError.decoding("value re-encode: \(error.localizedDescription)")
        }
        do {
            return try JSONDecoder().decode(T.self, from: valueData)
        } catch {
            throw ConvexFunctionError.decoding("value as \(T.self): \(error.localizedDescription)")
        }
    }

    // Pull a human message + optional code out of a ConvexError payload.
    private static func extractError(_ envelope: ResponseEnvelope) -> (String, String?) {
        if case let .object(obj)? = envelope.errorData {
            var message = "Something went wrong."
            var code: String? = nil
            if case let .string(m)? = obj["message"] { message = m }
            if case let .string(c)? = obj["code"] { code = c }
            return (message, code)
        }
        return (envelope.errorMessage ?? "Something went wrong.", nil)
    }

    private struct RequestBody: Encodable {
        let path: String
        let args: JSONValue
        let format: String
    }

    private struct ResponseEnvelope: Decodable {
        let status: String
        let value: JSONValue?
        let errorMessage: String?
        let errorData: JSONValue?
    }
}

/// A decodable that tolerates an empty/`null`/`{ ok: true }` Convex response,
/// for mutations that return nothing meaningful.
public struct ConvexVoid: Decodable, Sendable {
    public init(from decoder: Decoder) throws {}
    public init() {}
}
