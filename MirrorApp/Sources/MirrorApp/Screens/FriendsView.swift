import SwiftUI
import MirrorModel

// ===========================================================================
// Friends — list connections, create/share an invite code, accept a code,
// pause / resume / remove, and manually trigger a Mirror chat.
// ===========================================================================

struct FriendsView: View {
    @EnvironmentObject var app: AppState
    @State private var friends: [FriendSummary] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showInvite = false
    @State private var showAccept = false

    var body: some View {
        NavigationStack {
            List {
                if let error { ErrorBanner(message: error) }

                Section {
                    Button { showInvite = true } label: {
                        Label("Invite a friend", systemImage: "person.badge.plus")
                    }
                    Button { showAccept = true } label: {
                        Label("Accept an invite code", systemImage: "qrcode.viewfinder")
                    }
                }

                Section("Your connections") {
                    if loading {
                        ProgressView()
                    } else if friends.isEmpty {
                        EmptyStateView(
                            icon: "person.2",
                            title: "No friends yet",
                            message: "Invite someone — once they accept, your Mirrors will chat daily."
                        )
                    } else {
                        ForEach(friends) { friend in
                            FriendRow(friend: friend) { await load() }
                        }
                    }
                }
            }
            .navigationTitle("Friends")
            .refreshable { await load() }
            .task { await load() }
            .sheet(isPresented: $showInvite) { InviteSheet() }
            .sheet(isPresented: $showAccept) { AcceptInviteSheet { await load() } }
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            friends = try await app.api.listMyFriends()
        } catch {
            self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription
        }
        loading = false
    }
}

struct FriendRow: View {
    @EnvironmentObject var app: AppState
    let friend: FriendSummary
    let onChange: () async -> Void
    @State private var working = false

    private var isPaused: Bool { friend.friendship.status == .paused }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(friend.friendMirror?.avatarEmoji ?? "🪞").font(.title2)
                VStack(alignment: .leading) {
                    Text(friend.friendUser?.name ?? "Friend").font(.subheadline).bold()
                    Text(friend.friendMirror?.name ?? "Their Mirror")
                        .font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                if isPaused {
                    Chip(text: "Paused", systemImage: "pause")
                }
            }
            HStack(spacing: 8) {
                Button {
                    Task {
                        working = true
                        _ = try? await app.api.generateConversationNow(friendshipId: friend.friendship.id)
                        working = false
                        await onChange()
                    }
                } label: {
                    Label("Chat now", systemImage: "bubble.left.and.bubble.right")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .disabled(working || isPaused)

                Button {
                    Task {
                        try? await app.api.pauseFriendship(friendshipId: friend.friendship.id, paused: !isPaused)
                        await onChange()
                    }
                } label: {
                    Label(isPaused ? "Resume" : "Pause", systemImage: isPaused ? "play" : "pause")
                        .font(.caption)
                }
                .buttonStyle(.bordered)

                Button(role: .destructive) {
                    Task {
                        try? await app.api.removeFriendship(friendshipId: friend.friendship.id, block: false)
                        await onChange()
                    }
                } label: {
                    Label("Remove", systemImage: "trash").font(.caption)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
    }
}

struct InviteSheet: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var code: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if let code {
                    Text("Share this code").font(.headline)
                    Text(code)
                        .font(.system(size: 40, weight: .bold, design: .monospaced))
                        .padding()
                        .background(Color.accentColor.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    ShareLink(item: "Connect your Mirror with mine on MirrorFriends — code: \(code)") {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.borderedProminent)
                } else if let error {
                    ErrorBanner(message: error)
                } else {
                    ProgressView("Creating invite…")
                }
                Spacer()
            }
            .padding()
            .navigationTitle("Invite a friend")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .task {
                do { code = try await app.api.createFriendInvite().inviteCode }
                catch { self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription }
            }
        }
    }
}

struct AcceptInviteSheet: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    let onAccepted: () async -> Void
    @State private var code = ""
    @State private var working = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { ErrorBanner(message: error) } }
                Section("Enter invite code") {
                    TextField("e.g. ABCD2345", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
                Section {
                    Button {
                        accept()
                    } label: {
                        if working { ProgressView().frame(maxWidth: .infinity) }
                        else { Text("Connect Mirrors").frame(maxWidth: .infinity) }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(code.isEmpty || working)
                }
            }
            .navigationTitle("Accept invite")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func accept() {
        working = true
        Task {
            do {
                _ = try await app.api.acceptFriendInvite(code: code.trimmingCharacters(in: .whitespaces))
                await onAccepted()
                dismiss()
            } catch {
                self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription
            }
            working = false
        }
    }
}
