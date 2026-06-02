import SwiftUI

// ===========================================================================
// App entry point. The single AppState is created here and injected as an
// EnvironmentObject for all screens.
// ===========================================================================

@main
struct MirrorFriendsApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(appState)
                .task {
                    await appState.bootstrap()
                }
        }
    }
}
