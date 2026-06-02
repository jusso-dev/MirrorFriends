import Foundation

// ===========================================================================
// MirrorAPI — a typed facade over the Convex function surface.
//
// Every backend call the app makes goes through here, so function names and
// argument shapes live in exactly one place and stay in sync with the Convex
// modules under /convex.
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
    public let client: ConvexClient
    public init(client: ConvexClient) { self.client = client }

    // MARK: Queries

    public func getCurrentUser() async throws -> CurrentUser? {
        try await client.query("users:getCurrentUser")
    }

    public func getMyMirror() async throws -> MyMirror {
        try await client.query("mirrors:getMyMirror")
    }

    public func listMyMemories(
        visibility: MemoryVisibility? = nil,
        type: MemoryType? = nil,
        includeArchived: Bool = false
    ) async throws -> [Memory] {
        var args = ConvexArgs()
        if let v = visibility { args.set("visibility", .string(v.rawValue)) }
        if let t = type { args.set("type", .string(t.rawValue)) }
        args.set("includeArchived", .bool(includeArchived))
        return try await client.query("memories:listMyMemories", args: args)
    }

    public func listMyFriends() async throws -> [FriendSummary] {
        try await client.query("friends:listMyFriends")
    }

    public func listMirrorConversations(limit: Int? = nil) async throws -> [ConversationSummary] {
        var args = ConvexArgs()
        if let l = limit { args.set("limit", .number(Double(l))) }
        return try await client.query("conversations:listMirrorConversations", args: args)
    }

    public func listConversationMessages(conversationId: String) async throws -> ConversationThread {
        var args = ConvexArgs()
        args.set("conversationId", .string(conversationId))
        return try await client.query("conversations:listConversationMessages", args: args)
    }

    public func listAssistantMessages(limit: Int = 50) async throws -> [AssistantMessage] {
        var args = ConvexArgs()
        args.set("limit", .number(Double(limit)))
        return try await client.query("conversations:listAssistantMessages", args: args)
    }

    public func listNotifications(unreadOnly: Bool = false) async throws -> [AppNotification] {
        var args = ConvexArgs()
        args.set("unreadOnly", .bool(unreadOnly))
        return try await client.query("notifications:listNotifications", args: args)
    }

    public func unreadCount() async throws -> Int {
        try await client.query("notifications:unreadCount")
    }

    public func getAiUsageEstimate() async throws -> AiUsageEstimate {
        try await client.query("settings:getAiUsageEstimate")
    }

    // MARK: Mutations

    @discardableResult
    public func ensureUser() async throws -> String {
        try await client.mutation("users:ensureUser")
    }

    public func completeOnboarding(_ input: OnboardingInput) async throws -> OnboardingResult {
        var args = ConvexArgs()
        args.set("name", .string(input.name))
        if let v = input.nickname { args.set("nickname", .string(v)) }
        if let v = input.bio { args.set("bio", .string(v)) }
        args.set("interests", .of(input.interests))
        if let v = input.work { args.set("work", .string(v)) }
        if let v = input.communicationStyle { args.set("communicationStyle", .string(v)) }
        if let v = input.thingsToKnow { args.set("thingsToKnow", .string(v)) }
        if let v = input.thingsToAvoid { args.set("thingsToAvoid", .string(v)) }
        args.set("privacyBoundaries", .of(input.privacyBoundaries))
        if let v = input.mirrorName { args.set("mirrorName", .string(v)) }
        if let v = input.avatarEmoji { args.set("avatarEmoji", .string(v)) }
        return try await client.mutation("users:completeOnboarding", args: args)
    }

    @discardableResult
    public func updateMirrorProfile(_ update: MirrorProfileUpdate) async throws -> ConvexVoid {
        var args = ConvexArgs()
        if let v = update.name { args.set("name", .string(v)) }
        if let v = update.avatarEmoji { args.set("avatarEmoji", .string(v)) }
        if let v = update.personality { args.set("personality", .string(v)) }
        if let v = update.communicationStyle { args.set("communicationStyle", .string(v)) }
        if let v = update.interests { args.set("interests", .of(v)) }
        if let v = update.goals { args.set("goals", .of(v)) }
        if let v = update.boundaries { args.set("boundaries", .of(v)) }
        if let v = update.thingsToKnow { args.set("thingsToKnow", .string(v)) }
        if let v = update.thingsToAvoid { args.set("thingsToAvoid", .string(v)) }
        return try await client.mutation("mirrors:updateMirrorProfile", args: args)
    }

    @discardableResult
    public func addMemory(type: MemoryType, visibility: MemoryVisibility, content: String) async throws -> String {
        var args = ConvexArgs()
        args.set("type", .string(type.rawValue))
        args.set("visibility", .string(visibility.rawValue))
        args.set("content", .string(content))
        return try await client.mutation("memories:addMemory", args: args)
    }

    @discardableResult
    public func updateMemory(
        memoryId: String,
        type: MemoryType? = nil,
        visibility: MemoryVisibility? = nil,
        content: String? = nil
    ) async throws -> ConvexVoid {
        var args = ConvexArgs()
        args.set("memoryId", .string(memoryId))
        if let t = type { args.set("type", .string(t.rawValue)) }
        if let v = visibility { args.set("visibility", .string(v.rawValue)) }
        if let c = content { args.set("content", .string(c)) }
        return try await client.mutation("memories:updateMemory", args: args)
    }

    @discardableResult
    public func archiveMemory(memoryId: String, archived: Bool = true) async throws -> ConvexVoid {
        var args = ConvexArgs()
        args.set("memoryId", .string(memoryId))
        args.set("archived", .bool(archived))
        return try await client.mutation("memories:archiveMemory", args: args)
    }

    @discardableResult
    public func deleteMemory(memoryId: String) async throws -> ConvexVoid {
        var args = ConvexArgs()
        args.set("memoryId", .string(memoryId))
        return try await client.mutation("memories:deleteMemory", args: args)
    }

    public func createFriendInvite() async throws -> InviteCodeResponse {
        try await client.mutation("friends:createFriendInvite")
    }

    public func acceptFriendInvite(code: String) async throws -> AcceptInviteResponse {
        var args = ConvexArgs()
        args.set("inviteCode", .string(code))
        return try await client.mutation("friends:acceptFriendInvite", args: args)
    }

    @discardableResult
    public func pauseFriendship(friendshipId: String, paused: Bool) async throws -> ConvexVoid {
        var args = ConvexArgs()
        args.set("friendshipId", .string(friendshipId))
        args.set("paused", .bool(paused))
        return try await client.mutation("friends:pauseFriendship", args: args)
    }

    @discardableResult
    public func removeFriendship(friendshipId: String, block: Bool = false) async throws -> ConvexVoid {
        var args = ConvexArgs()
        args.set("friendshipId", .string(friendshipId))
        args.set("block", .bool(block))
        return try await client.mutation("friends:removeFriendship", args: args)
    }

    @discardableResult
    public func markNotificationRead(notificationId: String) async throws -> ConvexVoid {
        var args = ConvexArgs()
        args.set("notificationId", .string(notificationId))
        return try await client.mutation("notifications:markNotificationRead", args: args)
    }

    @discardableResult
    public func setMirrorPaused(_ paused: Bool) async throws -> ConvexVoid {
        var args = ConvexArgs()
        args.set("paused", .bool(paused))
        return try await client.mutation("settings:setMirrorPaused", args: args)
    }

    @discardableResult
    public func deleteAccount() async throws -> ConvexVoid {
        try await client.mutation("settings:deleteAccount")
    }

    // MARK: Actions

    @discardableResult
    public func generateMirrorBehaviour() async throws -> ConvexVoid {
        try await client.action("mirrors:generateMirrorBehaviour")
    }

    public func askMyMirror(question: String) async throws -> AskResponse {
        var args = ConvexArgs()
        args.set("question", .string(question))
        return try await client.action("conversations:askMyMirror", args: args)
    }

    public func generateConversationNow(friendshipId: String) async throws -> GenerateConversationResponse {
        var args = ConvexArgs()
        args.set("friendshipId", .string(friendshipId))
        return try await client.action("conversations:generateConversationNow", args: args)
    }
}

public struct OnboardingResult: Codable, Sendable {
    public var userId: String
    public var mirrorId: String
}
