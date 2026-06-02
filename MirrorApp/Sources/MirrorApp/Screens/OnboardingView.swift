import SwiftUI
import MirrorModel

// ===========================================================================
// Onboarding — collects the profile that seeds the user's Mirror, then calls
// `completeOnboarding` (which creates the Mirror + first behaviour version).
// ===========================================================================

struct OnboardingView: View {
    @EnvironmentObject var app: AppState

    @State private var name = ""
    @State private var nickname = ""
    @State private var bio = ""
    @State private var interests = ""
    @State private var work = ""
    @State private var communicationStyle = ""
    @State private var thingsToKnow = ""
    @State private var thingsToAvoid = ""
    @State private var boundaries = ""
    @State private var mirrorName = ""
    @State private var avatarEmoji = "🪞"
    @State private var submitting = false

    private let emojiChoices = ["🪞", "🌟", "🤖", "🧠", "😎", "🔮", "🦊", "🐙", "🌱", "🎯"]

    private func list(_ raw: String) -> [String] {
        raw.split(whereSeparator: { $0 == "," || $0 == "\n" })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Tell your Mirror about you")
                        .font(.headline)
                    Text("Your Mirror represents you to friends' Mirrors. You decide what's private and what's shareable later.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Section("About you") {
                    TextField("Name", text: $name)
                    TextField("Nickname (optional)", text: $nickname)
                    TextField("Short bio", text: $bio, axis: .vertical)
                        .lineLimit(2...4)
                }

                Section("Interests & work") {
                    TextField("Interests (comma separated)", text: $interests, axis: .vertical)
                        .lineLimit(1...3)
                    TextField("Work / projects", text: $work, axis: .vertical)
                        .lineLimit(1...3)
                }

                Section("Communication style") {
                    TextField("e.g. warm, concise, a bit playful", text: $communicationStyle)
                }

                Section("What your Mirror should know") {
                    TextField("Private context for your Mirror", text: $thingsToKnow, axis: .vertical)
                        .lineLimit(2...5)
                    Text("Kept private — only used to help your own Mirror understand you.")
                        .font(.caption2).foregroundColor(.secondary)
                }

                Section("What your Mirror should avoid") {
                    TextField("Topics or phrasings to avoid", text: $thingsToAvoid, axis: .vertical)
                        .lineLimit(1...4)
                }

                Section("Privacy boundaries") {
                    TextField("One per line", text: $boundaries, axis: .vertical)
                        .lineLimit(2...5)
                    Text("These become hard rules your Mirror won't cross.")
                        .font(.caption2).foregroundColor(.secondary)
                }

                Section("Your Mirror") {
                    TextField("Mirror name (optional)", text: $mirrorName)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(emojiChoices, id: \.self) { emoji in
                                Text(emoji)
                                    .font(.title)
                                    .padding(8)
                                    .background(avatarEmoji == emoji ? Color.accentColor.opacity(0.2) : Color.clear)
                                    .clipShape(Circle())
                                    .onTapGesture { avatarEmoji = emoji }
                            }
                        }
                    }
                }

                if let error = app.lastError {
                    Section { ErrorBanner(message: error) }
                }

                Section {
                    Button {
                        submit()
                    } label: {
                        if submitting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Create my Mirror").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || submitting)
                }
            }
            .navigationTitle("Welcome")
        }
    }

    private func submit() {
        submitting = true
        let input = OnboardingInput(
            name: name.trimmingCharacters(in: .whitespaces),
            nickname: nickname.isEmpty ? nil : nickname,
            bio: bio.isEmpty ? nil : bio,
            interests: list(interests),
            work: work.isEmpty ? nil : work,
            communicationStyle: communicationStyle.isEmpty ? nil : communicationStyle,
            thingsToKnow: thingsToKnow.isEmpty ? nil : thingsToKnow,
            thingsToAvoid: thingsToAvoid.isEmpty ? nil : thingsToAvoid,
            privacyBoundaries: list(boundaries),
            mirrorName: mirrorName.isEmpty ? nil : mirrorName,
            avatarEmoji: avatarEmoji
        )
        Task {
            await app.completeOnboarding(input)
            submitting = false
        }
    }
}
