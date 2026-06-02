import Foundation

// ===========================================================================
// MirrorFriends shared model layer.
//
// These Codable types mirror the Convex schema (convex/schema.ts). They are
// used by both the iOS and Android builds (via Skip transpilation). Convex
// returns document ids as opaque strings and `_creationTime`/timestamps as
// numbers (milliseconds since epoch), modelled here as Double.
// ===========================================================================

// MARK: - Enums

public enum MemoryType: String, Codable, CaseIterable, Sendable {
    case fact, preference, goal, project, relationship, boundary, opinion, task

    public var label: String {
        switch self {
        case .fact: return "Fact"
        case .preference: return "Preference"
        case .goal: return "Goal"
        case .project: return "Project"
        case .relationship: return "Relationship"
        case .boundary: return "Boundary"
        case .opinion: return "Opinion"
        case .task: return "Task idea"
        }
    }

    public var icon: String {
        switch self {
        case .fact: return "info.circle"
        case .preference: return "heart"
        case .goal: return "target"
        case .project: return "hammer"
        case .relationship: return "person.2"
        case .boundary: return "hand.raised"
        case .opinion: return "bubble.left"
        case .task: return "checklist"
        }
    }
}

public enum MemoryVisibility: String, Codable, CaseIterable, Sendable {
    case `private`
    case shareable

    public var label: String {
        switch self {
        case .private: return "Private"
        case .shareable: return "Shareable"
        }
    }

    public var explanation: String {
        switch self {
        case .private:
            return "Only used to help your own Mirror understand you. Never shared."
        case .shareable:
            return "Safe summary that connected friends' Mirrors may see."
        }
    }
}

public enum FriendshipStatus: String, Codable, Sendable {
    case pending, active, paused, blocked
}

public enum ConversationType: String, Codable, Sendable {
    case daily, manual
    case weeklySummary = "weekly_summary"
}

public enum ConversationStatus: String, Codable, Sendable {
    case pending, complete, failed
}

public enum NotificationType: String, Codable, Sendable {
    case friendJoined = "friend_joined"
    case dailyConversationReady = "daily_conversation_ready"
    case weeklySummaryReady = "weekly_summary_ready"
}

// MARK: - Core documents

public struct User: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var email: String?
    public var name: String?
    public var nickname: String?
    public var bio: String?
    public var onboardingComplete: Bool
    public var mirrorPaused: Bool

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case email, name, nickname, bio, onboardingComplete, mirrorPaused
    }

    public var displayName: String { nickname ?? name ?? "You" }
}

public struct Mirror: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var ownerUserId: String
    public var name: String
    public var avatarEmoji: String?
    public var personality: String?
    public var communicationStyle: String?
    public var interests: [String]
    public var goals: [String]
    public var boundaries: [String]
    public var thingsToKnow: String?
    public var thingsToAvoid: String?
    public var shareableProfile: String?
    public var behaviourVersion: Double

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case ownerUserId, name, avatarEmoji, personality, communicationStyle
        case interests, goals, boundaries, thingsToKnow, thingsToAvoid
        case shareableProfile, behaviourVersion
    }

    public var emoji: String { avatarEmoji ?? "🪞" }
}

public struct MirrorBehaviour: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var mirrorId: String
    public var version: Double
    public var systemPrompt: String
    public var communicationRules: [String]
    public var privacyRules: [String]
    public var active: Bool

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case mirrorId, version, systemPrompt, communicationRules, privacyRules, active
    }
}

public struct Memory: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var userId: String
    public var mirrorId: String
    public var type: MemoryType
    public var visibility: MemoryVisibility
    public var content: String
    public var archived: Bool
    public var createdAt: Double
    public var updatedAt: Double

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case userId, mirrorId, type, visibility, content, archived, createdAt, updatedAt
    }
}

public struct Friendship: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var userAId: String
    public var userBId: String
    public var mirrorAId: String
    public var mirrorBId: String
    public var status: FriendshipStatus
    public var createdAt: Double
    public var lastConversationAt: Double?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case userAId, userBId, mirrorAId, mirrorBId, status, createdAt, lastConversationAt
    }
}

/// Hydrated friend row returned by `friends:listMyFriends`.
public struct FriendSummary: Codable, Identifiable, Sendable, Hashable {
    public var friendship: Friendship
    public var friendUser: FriendUserInfo?
    public var friendMirror: FriendMirrorInfo?

    public var id: String { friendship.id }

    public struct FriendUserInfo: Codable, Sendable, Hashable {
        public let id: String
        public var name: String
        public var nickname: String?
        enum CodingKeys: String, CodingKey { case id = "_id"; case name, nickname }
    }
    public struct FriendMirrorInfo: Codable, Sendable, Hashable {
        public let id: String
        public var name: String
        public var avatarEmoji: String?
        enum CodingKeys: String, CodingKey { case id = "_id"; case name, avatarEmoji }
    }
}

public struct MirrorConversation: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var friendshipId: String
    public var type: ConversationType
    public var status: ConversationStatus
    public var summary: String?
    public var createdAt: Double

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case friendshipId, type, status, summary, createdAt
    }
}

/// Hydrated conversation row returned by `conversations:listMirrorConversations`.
public struct ConversationSummary: Codable, Identifiable, Sendable, Hashable {
    public var conversation: MirrorConversation
    public var friendshipId: String
    public var friendMirrorName: String
    public var friendMirrorEmoji: String?

    public var id: String { conversation.id }
}

public struct MirrorMessage: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var conversationId: String
    public var senderMirrorId: String
    public var receiverMirrorId: String
    public var content: String
    public var createdAt: Double

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case conversationId, senderMirrorId, receiverMirrorId, content, createdAt
    }
}

public struct AssistantMessage: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var userId: String
    public var mirrorId: String
    public var role: String // "user" | "mirror"
    public var content: String
    public var createdAt: Double

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case userId, mirrorId, role, content, createdAt
    }

    public var isUser: Bool { role == "user" }
}

public struct AppNotification: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public var userId: String
    public var type: NotificationType
    public var title: String
    public var body: String
    public var read: Bool
    public var relatedId: String?
    public var createdAt: Double

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case userId, type, title, body, read, relatedId, createdAt
    }
}

// MARK: - Composite responses

/// Response of `users:getCurrentUser`.
public struct CurrentUser: Codable, Sendable {
    public var user: User
    public var mirror: Mirror?
}

/// Response of `mirrors:getMyMirror`.
public struct MyMirror: Codable, Sendable {
    public var mirror: Mirror
    public var behaviour: MirrorBehaviour?
}

/// Response of `conversations:listConversationMessages`.
public struct ConversationThread: Codable, Sendable {
    public var conversation: MirrorConversation
    public var messages: [MirrorMessage]
}

/// Response of `settings:getAiUsageEstimate`. Counts are modelled as `Double`
/// because Convex `v.number()` is float64; format them as integers in the UI.
public struct AiUsageEstimate: Codable, Sendable {
    public var calls: Double
    public var inputTokens: Double
    public var outputTokens: Double
    public var estimatedCostUsd: Double
}
