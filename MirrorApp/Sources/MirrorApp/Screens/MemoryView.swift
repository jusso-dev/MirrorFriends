import SwiftUI
import MirrorModel

// ===========================================================================
// Memory — add / edit / archive memory entries, with private vs shareable
// visibility surfaced prominently (it's the core privacy control).
// ===========================================================================

struct MemoryView: View {
    @EnvironmentObject var app: AppState
    @State private var memories: [Memory] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showAdd = false
    @State private var showArchived = false

    var body: some View {
        List {
            if let error { ErrorBanner(message: error) }

            Toggle("Show archived", isOn: $showArchived)
                .onChange(of: showArchived) { _ in Task { await load() } }

            if loading {
                ProgressView()
            } else if memories.isEmpty {
                EmptyStateView(
                    icon: "brain",
                    title: "No memories yet",
                    message: "Add facts, goals, preferences and boundaries to teach your Mirror."
                )
            } else {
                ForEach(memories) { memory in
                    NavigationLink {
                        MemoryEditView(memory: memory) { await load() }
                    } label: {
                        memoryRow(memory)
                    }
                }
            }
        }
        .navigationTitle("Memory")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showAdd) {
            MemoryEditView(memory: nil) { await load() }
        }
        .task { await load() }
    }

    private func memoryRow(_ memory: Memory) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Label(memory.type.label, systemImage: memory.type.icon)
                    .font(.caption).foregroundColor(.accentColor)
                Spacer()
                Chip(
                    text: memory.visibility.label,
                    systemImage: memory.visibility == .private ? "lock" : "person.2"
                )
            }
            Text(memory.content)
                .font(.subheadline)
                .foregroundColor(memory.archived ? .secondary : .primary)
                .strikethrough(memory.archived)
        }
        .padding(.vertical, 2)
    }

    private func load() async {
        loading = true
        error = nil
        do {
            memories = try await app.api.listMyMemories(includeArchived: showArchived)
        } catch {
            self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription
        }
        loading = false
    }
}

// MARK: - Add / edit a memory

struct MemoryEditView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss

    let memory: Memory?
    let onDone: () async -> Void

    @State private var type: MemoryType
    @State private var visibility: MemoryVisibility
    @State private var content: String
    @State private var saving = false
    @State private var error: String?

    init(memory: Memory?, onDone: @escaping () async -> Void) {
        self.memory = memory
        self.onDone = onDone
        _type = State(initialValue: memory?.type ?? .fact)
        _visibility = State(initialValue: memory?.visibility ?? .private)
        _content = State(initialValue: memory?.content ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { ErrorBanner(message: error) } }

                Section("Content") {
                    TextField("What should your Mirror remember?", text: $content, axis: .vertical)
                        .lineLimit(3...8)
                }

                Section("Type") {
                    Picker("Type", selection: $type) {
                        ForEach(MemoryType.allCases, id: \.self) { t in
                            Text(t.label).tag(t)
                        }
                    }
                }

                Section("Visibility") {
                    Picker("Visibility", selection: $visibility) {
                        ForEach(MemoryVisibility.allCases, id: \.self) { v in
                            Text(v.label).tag(v)
                        }
                    }
                    .pickerStyle(.segmented)
                    Text(visibility.explanation)
                        .font(.caption).foregroundColor(.secondary)
                }

                Section {
                    Button {
                        save()
                    } label: {
                        if saving {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text(memory == nil ? "Add memory" : "Save").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(content.trimmingCharacters(in: .whitespaces).isEmpty || saving)

                    if let memory {
                        Button(memory.archived ? "Unarchive" : "Archive", role: .destructive) {
                            Task {
                                try? await app.api.archiveMemory(memoryId: memory.id, archived: !memory.archived)
                                await onDone()
                                dismiss()
                            }
                        }
                    }
                }
            }
            .navigationTitle(memory == nil ? "New memory" : "Edit memory")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func save() {
        saving = true
        Task {
            do {
                if let memory {
                    try await app.api.updateMemory(
                        memoryId: memory.id, type: type, visibility: visibility, content: content
                    )
                } else {
                    try await app.api.addMemory(type: type, visibility: visibility, content: content)
                }
                await onDone()
                dismiss()
            } catch {
                self.error = (error as? ConvexFunctionError)?.errorDescription ?? error.localizedDescription
            }
            saving = false
        }
    }
}
