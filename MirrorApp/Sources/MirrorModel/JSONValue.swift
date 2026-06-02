import Foundation

// ===========================================================================
// A minimal JSON value type used to build Convex function arguments in a
// type-safe, Codable, Skip-compatible way (Skip cannot transpile `[String: Any]`).
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

// Ergonomic builders.
public extension JSONValue {
    static func of(_ value: String) -> JSONValue { .string(value) }
    static func of(_ value: Bool) -> JSONValue { .bool(value) }
    static func of(_ value: Int) -> JSONValue { .number(Double(value)) }
    static func of(_ value: Double) -> JSONValue { .number(value) }
    static func of(_ values: [String]) -> JSONValue { .array(values.map { .string($0) }) }
}

/// Convenience for the common "object of named arguments" case.
public struct ConvexArgs: Sendable {
    public private(set) var fields: [String: JSONValue]
    public init(_ fields: [String: JSONValue] = [:]) { self.fields = fields }
    public mutating func set(_ key: String, _ value: JSONValue) { fields[key] = value }
    public var json: JSONValue { .object(fields) }

    public static let empty = ConvexArgs()
}
