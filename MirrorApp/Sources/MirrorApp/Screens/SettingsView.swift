import SwiftUI
import MirrorModel

// ===========================================================================
// Settings — privacy controls, AI usage estimate, data export, pause-all,
// delete account. Implements the user-facing privacy & safety requirements.
// ===========================================================================

struct SettingsView: View {
    @EnvironmentObject var app: AppState
    @State private var usage: AiUsageEstimate?
    @State private var paused = false
    @State private var error: String?
    @State private var showDeleteConfirm = false
    @State private var exporting = false
    @State private var exportText: String?

    var body: some View {
        Form {
            if let error { Section { ErrorBanner(message: error) } }

            Section("Privacy") {
                Toggle("Pause all Mirror conversations", isOn: $paused)
                    .onChange(of: paused) { newValue in
                        Task { try? await app.api.setMirrorPaused(newValue) }
                    }
                Text("When paused, your Mirror won't chat with any friends' Mirrors.")
                    .font(.caption2).foregroundColor(.secondary)
            }

            Section("AI usage estimate") {
                if let usage {
                    usageRow("Calls", "\(usage.calls)")
                    usageRow("Input tokens", "\(usage.inputTokens)")
                    usageRow("Output tokens", "\(usage.outputTokens)")
                    usageRow("Estimated cost", String(format: "$%.4f", usage.estimatedCostUsd))
                } else {
                    ProgressView()
                }
            }

            Section("Your data") {
                Button {
                    Task { await exportData() }
                } label: {
                    if exporting { ProgressView() } else { Label("Export my data", systemImage: "square.and.arrow.up") }
                }
                if let exportText {
                    ShareLink(item: exportText) {
                        Label("Share export", systemImage: "doc.text")
                    }
                }
            }

            Section {
                Button("Sign out") { Task { await app.signOut() } }
                Button("Delete account", role: .destructive) { showDeleteConfirm = true }
            }

            Section {
                Text("MirrorFriends v0.1.0")
                    .font(.caption2).foregroundColor(.secondary)
            }
        }
        .navigationTitle("Settings")
        .task { await load() }
        .alert("Delete account?", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Delete everything", role: .destructive) {
                Task {
                    try? await app.api.deleteAccount()
                    await app.signOut()
                }
            }
        } message: {
            Text("This permanently deletes your Mirror, memories, conversations and account. This cannot be undone.")
        }
    }

    private func usageRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundColor(.secondary)
        }
    }

    private func load() async {
        paused = app.currentUser?.mirrorPaused ?? false
        do { usage = try await app.api.getAiUsageEstimate() }
        catch { self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription }
    }

    private func exportData() async {
        exporting = true
        do {
            let data: JSONValue = try await app.api.client.query("settings:exportMyData")
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted]
            let raw = try encoder.encode(data)
            exportText = String(data: raw, encoding: .utf8)
        } catch {
            self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription
        }
        exporting = false
    }
}
