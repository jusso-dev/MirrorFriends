import SwiftUI
import MirrorModel

// ===========================================================================
// Home — Mirror profile card, friend count, recent activity, latest summary.
// ===========================================================================

struct HomeView: View {
    @EnvironmentObject var app: AppState
    @State private var friends: [FriendSummary] = []
    @State private var conversations: [ConversationSummary] = []
    @State private var unread = 0
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let error { ErrorBanner(message: error) }

                    mirrorCard

                    HStack(spacing: 12) {
                        statTile(value: "\(friends.count)", label: "Friends", icon: "person.2")
                        statTile(value: "\(conversations.count)", label: "Chats", icon: "bubble.left")
                        statTile(value: "\(unread)", label: "Unread", icon: "bell")
                    }

                    latestSummarySection
                    recentActivitySection
                }
                .padding()
            }
            .navigationTitle("Home")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private var mirrorCard: some View {
        CardView {
            HStack(spacing: 12) {
                Text(app.mirror?.emoji ?? "🪞").font(.system(size: 44))
                VStack(alignment: .leading, spacing: 2) {
                    Text(app.mirror?.name ?? "Your Mirror").font(.title3).bold()
                    if let style = app.mirror?.communicationStyle, !style.isEmpty {
                        Text(style).font(.caption).foregroundColor(.secondary)
                    }
                }
                Spacer()
            }
            if let interests = app.mirror?.interests, !interests.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack { ForEach(interests, id: \.self) { Chip(text: $0) } }
                }
            }
            if let profile = app.mirror?.shareableProfile, !profile.isEmpty {
                Text(profile).font(.footnote).foregroundColor(.secondary)
            }
        }
    }

    private func statTile(value: String, label: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon).foregroundColor(.accentColor)
            Text(value).font(.title3).bold()
            Text(label).font(.caption).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var latestSummarySection: some View {
        Group {
            if let latest = conversations.first(where: { $0.conversation.summary != nil }) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Latest conversation").font(.headline)
                    CardView {
                        Text("\(app.mirror?.name ?? "Your Mirror") × \(latest.friendMirrorName)")
                            .font(.subheadline).bold()
                        Text(latest.conversation.summary ?? "")
                            .font(.footnote).foregroundColor(.secondary)
                        Text(latest.conversation.createdAt.asRelativeDate)
                            .font(.caption2).foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    private var recentActivitySection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Recent Mirror activity").font(.headline)
            if loading {
                ProgressView()
            } else if conversations.isEmpty {
                EmptyStateView(
                    icon: "sparkles",
                    title: "No conversations yet",
                    message: "Add a friend and your Mirrors will start chatting daily."
                )
            } else {
                ForEach(conversations.prefix(5)) { item in
                    HStack {
                        Text(item.friendMirrorEmoji ?? "🪞")
                        VStack(alignment: .leading) {
                            Text(item.friendMirrorName).font(.subheadline)
                            Text(item.conversation.summary ?? statusText(item.conversation.status))
                                .font(.caption).foregroundColor(.secondary).lineLimit(2)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 4)
                    Divider()
                }
            }
        }
    }

    private func statusText(_ status: ConversationStatus) -> String {
        switch status {
        case .pending: return "Generating…"
        case .complete: return "Conversation ready"
        case .failed: return "Couldn't generate"
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            async let f = app.api.listMyFriends()
            async let c = app.api.listMirrorConversations(limit: 20)
            async let u = app.api.unreadCount()
            friends = try await f
            conversations = try await c
            unread = try await u
            await app.reloadMirror()
        } catch {
            self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription
        }
        loading = false
    }
}
