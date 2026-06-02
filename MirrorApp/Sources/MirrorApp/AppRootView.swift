import SwiftUI

// ===========================================================================
// Root router: launching -> auth -> onboarding -> main tabs.
// ===========================================================================

struct AppRootView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        Group {
            switch app.phase {
            case .launching:
                LaunchView()
            case .signedOut:
                AuthView()
            case .onboarding:
                OnboardingView()
            case .ready:
                MainTabView()
            }
        }
        .animation(.default, value: app.phase)
    }
}

struct LaunchView: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("🪞")
                .font(.system(size: 64))
            Text("MirrorFriends")
                .font(.title).bold()
            ProgressView()
        }
    }
}

// MARK: - Main tab bar

struct MainTabView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            FriendsView()
                .tabItem { Label("Friends", systemImage: "person.2") }
            ConversationListView()
                .tabItem { Label("Chats", systemImage: "bubble.left.and.bubble.right") }
            AskMyMirrorView()
                .tabItem { Label("Ask", systemImage: "sparkles") }
            MyMirrorView()
                .tabItem { Label("Mirror", systemImage: "person.crop.circle") }
        }
    }
}
