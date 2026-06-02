import Foundation

// ===========================================================================
// MirrorAPI — a typed facade over the Convex function surface, built on
// ConvexService. Arguments are platform-neutral `[String: JSONValue]` maps so
// the same calls work on iOS (ConvexMobile) and Android (the Kotlin bridge).
// Numeric arguments are sent as numbers (float64) to match `v.number()`.
// ===========================================================================

public struct OnboardingInput: Sendable {
    public var name: String
    public var nickname: String?
    public var bio: String?
    public var interests: [String]
    public var work: String?
    public var communicationStyle: String?
    public var thingsToKnow: String?
    public var thingsToAvoid: String?
    public var privacyBoundaries: [String]
    public var mirrorName: String?
    public var avatarEmoji: String?

    public init(
        name: String,
        nickname: String? = nil,
        bio: String? = nil,
        interests: [String] = [],
        work: String? = nil,
        communicationStyle: String? = nil,
        thingsToKnow: String? = nil,
        thingsToAvoid: String? = nil,
        privacyBoundaries: [String] = [],
        mirrorName: String? = nil,
        avatarEmoji: String? = nil
    ) {
        self.name = name
        self.nickname = nickname
        self.bio = bio
        self.interests = interests
        self.work = work
        self.communicationStyle = communicationStyle
        self.thingsToKnow = thingsToKnow
        self.thingsToAvoid = thingsToAvoid
        self.privacyBoundaries = privacyBoundaries
        self.mirrorName = mirrorName
        self.avatarEmoji = avatarEmoji
    }
}

public struct MirrorProfileUpdate: Sendable {
    public var name: String?
    public var avatarEmoji: String?
    public var personality: String?
    public var communicationStyle: String?
    public var interests: [String]?
    public var goals: [String]?
    public var boundaries: [String]?
    public var thingsToKnow: String?
    public var thingsToAvoid: String?
    public init() {}
}

// Small response shapes.
public struct InviteCodeResponse: Codable, Sendable { public var inviteCode: String }
public struct AcceptInviteResponse: Codable, Sendable {
    public var friendshipId: String
    public var alreadyFriends: Bool
}
public struct AskResponse: Codable, Sendable { public var answer: String }
public struct GenerateConversationResponse: Codable, Sendable { public var conversationId: String }

public struct MirrorAPI: Sendable {
    public let service: ConvexService
    public init(service: ConvexService) { self.service = service }

    // MARK: Queries

    public func getCurrentUser() async throws -> CurrentUser? {
        try await service.query("users:getCurrentUser")
    }

    public func getMyMirror() async throws -> MyMirror {
        try await service.query("mirrors:getMyMirror")
    }

    public func listMyMemories(
        visibility: MemoryVisibility? = nil,
        type: MemoryType? = nil,
        includeArchived: Bool = false
    ) async throws -> [Memory] {
        var args: [String: JSONValue] = ["includeArchived": .flag(includeArchived)]
        if let v = visibility { args["visibility"] = .str(v.rawValue) }
        if let t = type { args["type"] = .str(t.rawValue) }
        return try await service.query("memories:listMyMemories", args: args)
    }

    public func listMyFriends() async throws -> [FriendSummary] {
        try await service.query("friends:listMyFriends")
    }

    public func listMirrorConversations(limit: Int? = nil) async throws -> [ConversationSummary] {
        var args: [String: JSONValue] = [:]
        if let l = limit { args["limit"] = .num(l) }
        return try await service.query("conversations:listMirrorConversations", args: args)
    }

    public func listConversationMessages(conversationId: String) async throws -> ConversationThread {
        try await service.query(
            "conversations:listConversationMessages",
            args: ["conversationId": .str(conversationId)]
        )
    }

    public func listAssistantMessages(limit: Int = 50) async throws -> [AssistantMessage] {
        try await service.query(
            "conversations:listAssistantMessages",
            args: ["limit": .num(limit)]
        )
    }

    public func listNotifications(unreadOnly: Bool = false) async throws -> [AppNotification] {
        try await service.query(
            "notifications:listNotifications",
            args: ["unreadOnly": .flag(unreadOnly)]
        )
    }

    public func unreadCount() async throws -> Int {
        let value: Double = try await service.query("notifications:unreadCount")
        return Int(value)
    }

    public func getAiUsageEstimate() async throws -> AiUsageEstimate {
        try await service.query("settings:getAiUsageEstimate")
    }

    public func exportMyData() async throws -> JSONValue {
        try await service.query("settings:exportMyData")
    }

    // MARK: Mutations

    @discardableResult
    public func completeOnboarding(_ input: OnboardingInput) async throws -> OnboardingResult {
        var args: [String: JSONValue] = [
            "name": .str(input.name),
            "interests": .strings(input.interests),
            "privacyBoundaries": .strings(input.privacyBoundaries),
        ]
        if let v = input.nickname { args["nickname"] = .str(v) }
        if let v = input.bio { args["bio"] = .str(v) }
        if let v = input.work { args["work"] = .str(v) }
        if let v = input.communicationStyle { args["communicationStyle"] = .str(v) }
        if let v = input.thingsToKnow { args["thingsToKnow"] = .str(v) }
        if let v = input.thingsToAvoid { args["thingsToAvoid"] = .str(v) }
        if let v = input.mirrorName { args["mirrorName"] = .str(v) }
        if let v = input.avatarEmoji { args["avatarEmoji"] = .str(v) }
        return try await service.mutation("users:completeOnboarding", args: args)
    }

    public func updateMirrorProfile(_ update: MirrorProfileUpdate) async throws {
        var args: [String: JSONValue] = [:]
        if let v = update.name { args["name"] = .str(v) }
        if let v = update.avatarEmoji { args["avatarEmoji"] = .str(v) }
        if let v = update.personality { args["personality"] = .str(v) }
        if let v = update.communicationStyle { args["communicationStyle"] = .str(v) }
        if let v = update.interests { args["interests"] = .strings(v) }
        if let v = update.goals { args["goals"] = .strings(v) }
        if let v = update.boundaries { args["boundaries"] = .strings(v) }
        if let v = update.thingsToKnow { args["thingsToKnow"] = .str(v) }
        if let v = update.thingsToAvoid { args["thingsToAvoid"] = .str(v) }
        try await service.mutationVoid("mirrors:updateMirrorProfile", args: args)
    }

    @discardableResult
    public func addMemory(type: MemoryType, visibility: MemoryVisibility, content: String) async throws -> String {
        try await service.mutation("memories:addMemory", args: [
            "type": .str(type.rawValue),
            "visibility": .str(visibility.rawValue),
            "content": .str(content),
        ])
    }

    public func updateMemory(
        memoryId: String,
        type: MemoryType? = nil,
        visibility: MemoryVisibility? = nil,
        content: String? = nil
    ) async throws {
        var args: [String: JSONValue] = ["memoryId": .str(memoryId)]
        if let t = type { args["type"] = .str(t.rawValue) }
        if let v = visibility { args["visibility"] = .str(v.rawValue) }
        if let c = content { args["content"] = .str(c) }
        try await service.mutationVoid("memories:updateMemory", args: args)
    }

    public func archiveMemory(memoryId: String, archived: Bool = true) async throws {
        try await service.mutationVoid("memories:archiveMemory", args: [
            "memoryId": .str(memoryId), "archived": .flag(archived),
        ])
    }

    public func deleteMemory(memoryId: String) async throws {
        try await service.mutationVoid("memories:deleteMemory", args: ["memoryId": .str(memoryId)])
    }

    public func createFriendInvite() async throws -> InviteCodeResponse {
        try await service.mutation("friends:createFriendInvite")
    }

    public func acceptFriendInvite(code: String) async throws -> AcceptInviteResponse {
        try await service.mutation("friends:acceptFriendInvite", args: ["inviteCode": .str(code)])
    }

    public func pauseFriendship(friendshipId: String, paused: Bool) async throws {
        try await service.mutationVoid("friends:pauseFriendship", args: [
            "friendshipId": .str(friendshipId), "paused": .flag(paused),
        ])
    }

    public func removeFriendship(friendshipId: String, block: Bool = false) async throws {
        try await service.mutationVoid("friends:removeFriendship", args: [
            "friendshipId": .str(friendshipId), "block": .flag(block),
        ])
    }

    public func markNotificationRead(notificationId: String) async throws {
        try await service.mutationVoid("notifications:markNotificationRead", args: [
            "notificationId": .str(notificationId),
        ])
    }

    public func setMirrorPaused(_ paused: Bool) async throws {
        try await service.mutationVoid("settings:setMirrorPaused", args: ["paused": .flag(paused)])
    }

    public func deleteAccount() async throws {
        try await service.mutationVoid("settings:deleteAccount")
    }

    // MARK: Actions

    public func generateMirrorBehaviour() async throws {
        try await service.actionVoid("mirrors:generateMirrorBehaviour")
    }

    public func askMyMirror(question: String) async throws -> AskResponse {
        try await service.action("conversations:askMyMirror", args: ["question": .str(question)])
    }

    public func generateConversationNow(friendshipId: String) async throws -> GenerateConversationResponse {
        try await service.action(
            "conversations:generateConversationNow",
            args: ["friendshipId": .str(friendshipId)]
        )
    }
}

public struct OnboardingResult: Codable, Sendable {
    public var userId: String
    public var mirrorId: String
}
