import SwiftUI
import MirrorModel

// ===========================================================================
// Mirror conversations — list of Mirror-to-Mirror threads, drill into messages.
// ===========================================================================

struct ConversationListView: View {
    @EnvironmentObject var app: AppState
    @State private var items: [ConversationSummary] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { ErrorBanner(message: error) }
                if loading {
                    ProgressView()
                } else if items.isEmpty {
                    EmptyStateView(
                        icon: "bubble.left.and.bubble.right",
                        title: "No conversations yet",
                        message: "Your Mirrors will chat automatically once you have active friends."
                    )
                } else {
                    ForEach(items) { item in
                        NavigationLink {
                            ConversationDetailView(item: item)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(item.friendMirrorEmoji ?? "🪞")
                                    Text("\(app.mirror?.name ?? "You") × \(item.friendMirrorName)")
                                        .font(.subheadline).bold()
                                    Spacer()
                                    statusBadge(item.conversation.status)
                                }
                                Text(item.conversation.summary ?? "Tap to read")
                                    .font(.caption).foregroundColor(.secondary).lineLimit(2)
                                Text(item.conversation.createdAt.asRelativeDate)
                                    .font(.caption2).foregroundColor(.secondary)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
            .navigationTitle("Conversations")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    @ViewBuilder
    private func statusBadge(_ status: ConversationStatus) -> some View {
        switch status {
        case .pending: Chip(text: "Generating", systemImage: "hourglass")
        case .complete: EmptyView()
        case .failed: Chip(text: "Failed", systemImage: "exclamationmark.triangle")
        }
    }

    private func load() async {
        loading = true
        error = nil
        do { items = try await app.api.listMirrorConversations() }
        catch { self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription }
        loading = false
    }
}

struct ConversationDetailView: View {
    @EnvironmentObject var app: AppState
    let item: ConversationSummary
    @State private var thread: ConversationThread?
    @State private var loading = true
    @State private var error: String?

    // The caller's own Mirror id, to decide message alignment.
    private var myMirrorId: String? { app.mirror?.id }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let error { ErrorBanner(message: error) }
                if let summary = item.conversation.summary {
                    CardView { Text(summary).font(.footnote) }
                }
                if loading {
                    ProgressView()
                } else if let thread {
                    ForEach(thread.messages) { message in
                        messageBubble(message)
                    }
                }
            }
            .padding()
        }
        .navigationTitle(item.friendMirrorName)
        .task { await load() }
    }

    private func messageBubble(_ message: MirrorMessage) -> some View {
        let isMine = message.senderMirrorId == myMirrorId
        return HStack {
            if isMine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 2) {
                Text(isMine ? (app.mirror?.name ?? "My Mirror") : item.friendMirrorName)
                    .font(.caption2).foregroundColor(.secondary)
                Text(message.content)
                    .padding(10)
                    .background(isMine ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            if !isMine { Spacer(minLength: 40) }
        }
    }

    private func load() async {
        loading = true
        error = nil
        do { thread = try await app.api.listConversationMessages(conversationId: item.conversation.id) }
        catch { self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription }
        loading = false
    }
}
