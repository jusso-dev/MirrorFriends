import Foundation

// ===========================================================================
// A small Codable JSON value.
//
// `JSONValue` is the platform-neutral representation of Convex function
// arguments and dynamic responses. MirrorAPI builds `[String: JSONValue]`
// argument maps; ConvexService converts them to whatever the underlying native
// client wants (ConvexEncodable on iOS, a JSON string for the Kotlin bridge on
// Android). It is also used to decode the dynamic data-export blob.
// ===========================================================================

public indirect enum JSONValue: Codable, Sendable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else if let o = try? c.decode([String: JSONValue].self) {
            self = .object(o)
        } else {
            self = .null
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

// MARK: - Builders (used by MirrorAPI)

public extension JSONValue {
    static func str(_ value: String) -> JSONValue { .string(value) }
    static func num(_ value: Double) -> JSONValue { .number(value) }
    static func num(_ value: Int) -> JSONValue { .number(Double(value)) }
    static func flag(_ value: Bool) -> JSONValue { .bool(value) }
    static func strings(_ values: [String]) -> JSONValue { .array(values.map { .string($0) }) }
}

// MARK: - JSON string conversion (the cross-platform client boundary)

public extension JSONValue {
    /// Encode this value to a compact JSON string.
    func jsonString() -> String {
        guard let data = try? JSONEncoder().encode(self),
              let s = String(data: data, encoding: .utf8) else { return "null" }
        return s
    }

    /// Encode an argument map `{ ... }` to a JSON object string.
    static func argsJSONString(_ args: [String: JSONValue]) -> String {
        JSONValue.object(args).jsonString()
    }

    /// Decode a `Decodable` value from a JSON string (used by the Android path).
    static func decode<T: Decodable>(_ type: T.Type, fromJSONString json: String) throws -> T {
        let data = Data(json.utf8)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
