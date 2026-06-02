import Foundation
import ConvexMobile

// ===========================================================================
// MirrorAPI — a typed facade over the Convex function surface, built on the
// native ConvexService. Function names and argument shapes live here in one
// place and stay in sync with the Convex modules under /convex.
//
// Numeric arguments are sent as `Double` so they match the backend's
// `v.number()` (float64) validators.
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
        var args: [String: ConvexEncodable?] = ["includeArchived": includeArchived]
        if let v = visibility { args["visibility"] = v.rawValue }
        if let t = type { args["type"] = t.rawValue }
        return try await service.query("memories:listMyMemories", args: args)
    }

    public func listMyFriends() async throws -> [FriendSummary] {
        try await service.query("friends:listMyFriends")
    }

    public func listMirrorConversations(limit: Int? = nil) async throws -> [ConversationSummary] {
        var args: [String: ConvexEncodable?] = [:]
        if let l = limit { args["limit"] = Double(l) }
        return try await service.query("conversations:listMirrorConversations", args: args)
    }

    public func listConversationMessages(conversationId: String) async throws -> ConversationThread {
        try await service.query(
            "conversations:listConversationMessages",
            args: ["conversationId": conversationId]
        )
    }

    public func listAssistantMessages(limit: Int = 50) async throws -> [AssistantMessage] {
        try await service.query(
            "conversations:listAssistantMessages",
            args: ["limit": Double(limit)]
        )
    }

    public func listNotifications(unreadOnly: Bool = false) async throws -> [AppNotification] {
        try await service.query(
            "notifications:listNotifications",
            args: ["unreadOnly": unreadOnly]
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
    public func ensureUser() async throws -> String {
        try await service.mutation("users:ensureUser")
    }

    @discardableResult
    public func completeOnboarding(_ input: OnboardingInput) async throws -> OnboardingResult {
        var args: [String: ConvexEncodable?] = [
            "name": input.name,
            "interests": input.interests,
            "privacyBoundaries": input.privacyBoundaries,
        ]
        if let v = input.nickname { args["nickname"] = v }
        if let v = input.bio { args["bio"] = v }
        if let v = input.work { args["work"] = v }
        if let v = input.communicationStyle { args["communicationStyle"] = v }
        if let v = input.thingsToKnow { args["thingsToKnow"] = v }
        if let v = input.thingsToAvoid { args["thingsToAvoid"] = v }
        if let v = input.mirrorName { args["mirrorName"] = v }
        if let v = input.avatarEmoji { args["avatarEmoji"] = v }
        return try await service.mutation("users:completeOnboarding", args: args)
    }

    public func updateMirrorProfile(_ update: MirrorProfileUpdate) async throws {
        var args: [String: ConvexEncodable?] = [:]
        if let v = update.name { args["name"] = v }
        if let v = update.avatarEmoji { args["avatarEmoji"] = v }
        if let v = update.personality { args["personality"] = v }
        if let v = update.communicationStyle { args["communicationStyle"] = v }
        if let v = update.interests { args["interests"] = v }
        if let v = update.goals { args["goals"] = v }
        if let v = update.boundaries { args["boundaries"] = v }
        if let v = update.thingsToKnow { args["thingsToKnow"] = v }
        if let v = update.thingsToAvoid { args["thingsToAvoid"] = v }
        try await service.mutationVoid("mirrors:updateMirrorProfile", args: args)
    }

    @discardableResult
    public func addMemory(type: MemoryType, visibility: MemoryVisibility, content: String) async throws -> String {
        try await service.mutation("memories:addMemory", args: [
            "type": type.rawValue,
            "visibility": visibility.rawValue,
            "content": content,
        ])
    }

    public func updateMemory(
        memoryId: String,
        type: MemoryType? = nil,
        visibility: MemoryVisibility? = nil,
        content: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = ["memoryId": memoryId]
        if let t = type { args["type"] = t.rawValue }
        if let v = visibility { args["visibility"] = v.rawValue }
        if let c = content { args["content"] = c }
        try await service.mutationVoid("memories:updateMemory", args: args)
    }

    public func archiveMemory(memoryId: String, archived: Bool = true) async throws {
        try await service.mutationVoid("memories:archiveMemory", args: [
            "memoryId": memoryId, "archived": archived,
        ])
    }

    public func deleteMemory(memoryId: String) async throws {
        try await service.mutationVoid("memories:deleteMemory", args: ["memoryId": memoryId])
    }

    public func createFriendInvite() async throws -> InviteCodeResponse {
        try await service.mutation("friends:createFriendInvite")
    }

    public func acceptFriendInvite(code: String) async throws -> AcceptInviteResponse {
        try await service.mutation("friends:acceptFriendInvite", args: ["inviteCode": code])
    }

    public func pauseFriendship(friendshipId: String, paused: Bool) async throws {
        try await service.mutationVoid("friends:pauseFriendship", args: [
            "friendshipId": friendshipId, "paused": paused,
        ])
    }

    public func removeFriendship(friendshipId: String, block: Bool = false) async throws {
        try await service.mutationVoid("friends:removeFriendship", args: [
            "friendshipId": friendshipId, "block": block,
        ])
    }

    public func markNotificationRead(notificationId: String) async throws {
        try await service.mutationVoid("notifications:markNotificationRead", args: [
            "notificationId": notificationId,
        ])
    }

    public func setMirrorPaused(_ paused: Bool) async throws {
        try await service.mutationVoid("settings:setMirrorPaused", args: ["paused": paused])
    }

    public func deleteAccount() async throws {
        try await service.mutationVoid("settings:deleteAccount")
    }

    // MARK: Actions

    public func generateMirrorBehaviour() async throws {
        try await service.actionVoid("mirrors:generateMirrorBehaviour")
    }

    public func askMyMirror(question: String) async throws -> AskResponse {
        try await service.action("conversations:askMyMirror", args: ["question": question])
    }

    public func generateConversationNow(friendshipId: String) async throws -> GenerateConversationResponse {
        try await service.action(
            "conversations:generateConversationNow",
            args: ["friendshipId": friendshipId]
        )
    }
}

public struct OnboardingResult: Codable, Sendable {
    public var userId: String
    public var mirrorId: String
}
