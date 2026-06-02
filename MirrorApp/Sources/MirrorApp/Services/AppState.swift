import Foundation
import Combine
import MirrorModel

// ===========================================================================
// AppState — the root observable orchestrator. Owns the native Convex service,
// the API facade, and the auth manager; exposes the current routing phase and
// the signed-in user/Mirror. Screens read from here and call its methods.
// ===========================================================================

public enum AppPhase: Equatable, Sendable {
    case launching
    case signedOut
    case onboarding
    case ready
}

@MainActor
public final class AppState: ObservableObject {
    @Published public private(set) var phase: AppPhase = .launching
    @Published public private(set) var currentUser: User?
    @Published public private(set) var mirror: Mirror?
    @Published public var lastError: String?

    public let service: ConvexService
    public let auth: AuthManager
    public let api: MirrorAPI

    public init(makeBackend: ((ConvexService) -> AuthBackend)? = nil) {
        let service = ConvexService(deploymentUrl: AppConfig.convexURL)
        self.service = service
        self.api = MirrorAPI(service: service)
        let backend = makeBackend?(service) ?? ConvexAuthBackend(service: service)
        self.auth = AuthManager(service: service, backend: backend)
    }

    /// Called once on launch. Restores any session and routes accordingly.
    public func bootstrap() async {
        await auth.restoreSession()
        if auth.isSignedIn {
            await loadSession()
        } else {
            phase = .signedOut
        }
    }

    /// Sign in (or sign up) then load the session.
    public func signIn(
        method: AuthMethod,
        email: String? = nil,
        password: String? = nil,
        createAccount: Bool = false
    ) async {
        lastError = nil
        await auth.signIn(method: method, email: email, password: password, createAccount: createAccount)
        if auth.isSignedIn {
            await loadSession()
        } else if case let .error(message) = auth.state {
            lastError = message
        }
    }

    public func signInWithToken(_ jwt: String) async {
        await auth.signInWithToken(jwt)
        if auth.isSignedIn { await loadSession() }
    }

    public func signOut() async {
        await auth.signOut()
        currentUser = nil
        mirror = nil
        phase = .signedOut
    }

    /// Load the signed-in user (Convex Auth has already provisioned the row) and
    /// decide between onboarding and ready.
    public func loadSession() async {
        do {
            try await refreshUser()
        } catch {
            lastError = friendlyMessage(error)
            phase = .signedOut
        }
    }

    public func refreshUser() async throws {
        let current = try await api.getCurrentUser()
        currentUser = current?.user
        mirror = current?.mirror
        if let user = current?.user, user.onboardingComplete, current?.mirror != nil {
            phase = .ready
        } else {
            phase = .onboarding
        }
    }

    public func completeOnboarding(_ input: OnboardingInput) async {
        do {
            _ = try await api.completeOnboarding(input)
            try await refreshUser()
        } catch {
            lastError = friendlyMessage(error)
        }
    }

    /// Refresh the cached mirror (after profile edits).
    public func reloadMirror() async {
        do {
            let my = try await api.getMyMirror()
            mirror = my.mirror
        } catch {
            // Non-fatal; keep the stale copy.
        }
    }
}
