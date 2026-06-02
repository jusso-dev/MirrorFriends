import SwiftUI
import MirrorModel

// ===========================================================================
// Auth screen — Email / Apple / Google. The buttons drive AuthManager, which
// delegates to the configured identity backend (Clerk / Convex Auth).
// ===========================================================================

struct AuthView: View {
    @EnvironmentObject var app: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var showTokenField = false
    @State private var devToken = ""

    private var isAuthenticating: Bool { app.auth.state == .authenticating }

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("🪞").font(.system(size: 72))
            VStack(spacing: 4) {
                Text("MirrorFriends").font(.largeTitle).bold()
                Text("Create an AI version of yourself,\nand let your Mirrors meet.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }

            if let error = app.lastError {
                ErrorBanner(message: error)
            }
            if case let .error(message) = app.auth.state {
                ErrorBanner(message: message)
            }

            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)

                Button {
                    Task { await app.signIn(method: .email, email: email, password: password) }
                } label: {
                    Text("Continue with Email").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(email.isEmpty || isAuthenticating)

                Button {
                    Task { await app.signIn(method: .apple) }
                } label: {
                    Label("Continue with Apple", systemImage: "apple.logo")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    Task { await app.signIn(method: .google) }
                } label: {
                    Label("Continue with Google", systemImage: "globe")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal)

            if isAuthenticating { ProgressView() }

            Spacer()

            // Developer escape hatch: paste a JWT to exercise the app before a
            // real auth provider is wired. Hidden behind a tap.
            Button(showTokenField ? "Hide developer sign-in" : "Developer sign-in") {
                showTokenField.toggle()
            }
            .font(.caption)
            .foregroundColor(.secondary)

            if showTokenField {
                VStack(spacing: 8) {
                    TextField("Paste a JWT", text: $devToken)
                        .textFieldStyle(.roundedBorder)
                    Button("Use token") {
                        Task { await app.signInWithToken(devToken) }
                    }
                    .disabled(devToken.isEmpty)
                }
                .padding(.horizontal)
            }
        }
        .padding()
    }
}
