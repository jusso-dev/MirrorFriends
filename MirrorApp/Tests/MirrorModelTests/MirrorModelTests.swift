import XCTest
@testable import MirrorModel

// ===========================================================================
// Model-layer tests. These exercise pure logic (encoding, JSON values, arg
// building) with no network, so they run on both iOS and Android under Skip.
// ===========================================================================

final class MirrorModelTests: XCTestCase {

    func testMemoryDecoding() throws {
        let json = """
        {
          "_id": "mem123",
          "userId": "u1",
          "mirrorId": "m1",
          "type": "goal",
          "visibility": "private",
          "content": "Ship the MVP",
          "archived": false,
          "createdAt": 1700000000000,
          "updatedAt": 1700000000000
        }
        """.data(using: .utf8)!
        let memory = try JSONDecoder().decode(Memory.self, from: json)
        XCTAssertEqual(memory.id, "mem123")
        XCTAssertEqual(memory.type, .goal)
        XCTAssertEqual(memory.visibility, .private)
        XCTAssertFalse(memory.archived)
    }

    func testJSONValueRoundTrip() throws {
        let value = JSONValue.object([
            "name": .string("Justin"),
            "interests": .array([.string("ai"), .string("mobile")]),
            "count": .number(3),
            "active": .bool(true),
        ])
        let data = try JSONEncoder().encode(value)
        let roundTrip = try JSONDecoder().decode(JSONValue.self, from: data)
        guard case let .object(obj) = roundTrip else { return XCTFail("expected object") }
        XCTAssertEqual(obj["name"], .string("Justin"))
        XCTAssertEqual(obj["interests"], .array([.string("ai"), .string("mobile")]))
        XCTAssertEqual(obj["active"], .bool(true))
    }

    func testCurrentUserNullMirror() throws {
        let json = """
        { "user": { "_id": "u1", "onboardingComplete": false, "mirrorPaused": false }, "mirror": null }
        """.data(using: .utf8)!
        let current = try JSONDecoder().decode(CurrentUser.self, from: json)
        XCTAssertEqual(current.user.id, "u1")
        XCTAssertNil(current.mirror)
    }

    func testConversationTypeRawValues() {
        XCTAssertEqual(ConversationType.weeklySummary.rawValue, "weekly_summary")
        XCTAssertEqual(NotificationType.dailyConversationReady.rawValue, "daily_conversation_ready")
    }
}
