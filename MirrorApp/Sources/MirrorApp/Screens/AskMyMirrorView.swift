import SwiftUI
import MirrorModel

// ===========================================================================
// Ask My Mirror — chat-style UI for asking your own Mirror questions. This is
// the one context where the Mirror may draw on private memory (handled
// server-side in conversations:askMyMirror).
// ===========================================================================

struct AskMyMirrorView: View {
    @EnvironmentObject var app: AppState
    @State private var messages: [AssistantMessage] = []
    @State private var draft = ""
    @State private var sending = false
    @State private var error: String?

    private let suggestions = [
        "What did you and my friends' Mirrors talk about?",
        "Find collaboration ideas with a friend.",
        "What should I follow up on?",
        "Summarise my Mirror activity this week.",
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 10) {
                            if let error { ErrorBanner(message: error) }

                            if messages.isEmpty {
                                EmptyStateView(
                                    icon: "sparkles",
                                    title: "Ask your Mirror",
                                    message: "Your Mirror knows you — ask it anything."
                                )
                                ForEach(suggestions, id: \.self) { s in
                                    Button {
                                        draft = s
                                        send()
                                    } label: {
                                        Text(s).font(.footnote)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }

                            ForEach(messages) { message in
                                bubble(message).id(message.id)
                            }
                            if sending {
                                HStack { ProgressView(); Text("Thinking…").font(.caption).foregroundColor(.secondary) }
                            }
                        }
                        .padding()
                    }
                    .onChange(of: messages.count) { _ in
                        if let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                }

                Divider()
                HStack {
                    TextField("Ask your Mirror…", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...4)
                    Button {
                        send()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill").font(.title2)
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || sending)
                }
                .padding()
            }
            .navigationTitle("Ask \(app.mirror?.name ?? "My Mirror")")
            .task { await load() }
        }
    }

    private func bubble(_ message: AssistantMessage) -> some View {
        HStack {
            if message.isUser { Spacer(minLength: 40) }
            Text(message.content)
                .padding(10)
                .background(message.isUser ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            if !message.isUser { Spacer(minLength: 40) }
        }
    }

    private func load() async {
        do { messages = try await app.api.listAssistantMessages() }
        catch { /* first run may be empty */ }
    }

    private func send() {
        let question = draft.trimmingCharacters(in: .whitespaces)
        guard !question.isEmpty else { return }
        draft = ""
        sending = true
        error = nil
        // Optimistically show the user's message.
        let optimistic = AssistantMessage(
            id: "local-\(UUID().uuidString)",
            userId: app.currentUser?.id ?? "",
            mirrorId: app.mirror?.id ?? "",
            role: "user",
            content: question,
            createdAt: Date().timeIntervalSince1970 * 1000
        )
        messages.append(optimistic)
        Task {
            do {
                _ = try await app.api.askMyMirror(question: question)
                // Reload to get the persisted user + mirror messages in order.
                messages = try await app.api.listAssistantMessages()
            } catch {
                self.error = friendlyMessage(error)
            }
            sending = false
        }
    }
}
