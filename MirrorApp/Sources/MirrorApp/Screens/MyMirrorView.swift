import SwiftUI
import MirrorModel

// ===========================================================================
// My Mirror — view & edit the Mirror profile, see the active behaviour, and
// reach Memory + Settings. Saving regenerates behaviour on the backend.
// ===========================================================================

struct MyMirrorView: View {
    @EnvironmentObject var app: AppState
    @State private var my: MyMirror?
    @State private var loading = true
    @State private var error: String?

    // Editable state.
    @State private var name = ""
    @State private var personality = ""
    @State private var communicationStyle = ""
    @State private var interests = ""
    @State private var goals = ""
    @State private var boundaries = ""
    @State private var saving = false
    @State private var savedFlash = false

    private func list(_ raw: String) -> [String] {
        raw.split(whereSeparator: { $0 == "," || $0 == "\n" })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { ErrorBanner(message: error) } }

                Section("Profile") {
                    TextField("Mirror name", text: $name)
                    TextField("Personality", text: $personality, axis: .vertical)
                        .lineLimit(1...4)
                    TextField("Communication style", text: $communicationStyle, axis: .vertical)
                        .lineLimit(1...3)
                }

                Section("Interests") {
                    TextField("Comma separated", text: $interests, axis: .vertical)
                        .lineLimit(1...3)
                }

                Section("Goals") {
                    TextField("Comma separated", text: $goals, axis: .vertical)
                        .lineLimit(1...3)
                }

                Section("Boundaries") {
                    TextField("One per line", text: $boundaries, axis: .vertical)
                        .lineLimit(1...4)
                    Text("Hard rules your Mirror won't cross.")
                        .font(.caption2).foregroundColor(.secondary)
                }

                if let behaviour = my?.behaviour {
                    Section("Active behaviour v\(Int(behaviour.version))") {
                        Text(behaviour.systemPrompt)
                            .font(.caption).foregroundColor(.secondary)
                        if !behaviour.privacyRules.isEmpty {
                            DisclosureGroup("Privacy rules") {
                                ForEach(behaviour.privacyRules, id: \.self) { rule in
                                    Label(rule, systemImage: "lock").font(.caption)
                                }
                            }
                        }
                    }
                }

                Section {
                    NavigationLink {
                        MemoryView()
                    } label: {
                        Label("Manage memory", systemImage: "brain")
                    }
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label("Settings & privacy", systemImage: "gearshape")
                    }
                }

                Section {
                    Button {
                        save()
                    } label: {
                        if saving {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text(savedFlash ? "Saved ✓" : "Save changes").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(saving)

                    Button("Regenerate behaviour") {
                        Task {
                            try? await app.api.generateMirrorBehaviour()
                            await load()
                        }
                    }
                }
            }
            .navigationTitle("My Mirror")
            .task { await load() }
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            let result = try await app.api.getMyMirror()
            my = result
            let m = result.mirror
            name = m.name
            personality = m.personality ?? ""
            communicationStyle = m.communicationStyle ?? ""
            interests = m.interests.joined(separator: ", ")
            goals = m.goals.joined(separator: ", ")
            boundaries = m.boundaries.joined(separator: "\n")
        } catch {
            self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription
        }
        loading = false
    }

    private func save() {
        saving = true
        var update = MirrorProfileUpdate()
        update.name = name
        update.personality = personality
        update.communicationStyle = communicationStyle
        update.interests = list(interests)
        update.goals = list(goals)
        update.boundaries = list(boundaries)
        Task {
            do {
                try await app.api.updateMirrorProfile(update)
                await app.reloadMirror()
                savedFlash = true
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                savedFlash = false
            } catch {
                self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription
            }
            saving = false
        }
    }
}
