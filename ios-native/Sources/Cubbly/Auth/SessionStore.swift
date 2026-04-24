import Foundation
import Supabase
import Auth

/// Observable wrapper around Supabase auth state. Drives RootView routing.
@MainActor
final class SessionStore: ObservableObject {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(userID: UUID)
    }

    @Published private(set) var state: State = .loading
    @Published private(set) var currentProfile: Profile?

    /// Convenience for views that need the current user's UUID.
    var currentUserID: UUID? {
        if case let .signedIn(userID) = state { return userID }
        return nil
    }

    private var authChangesTask: Task<Void, Never>?

    /// Called once at app launch from RootView.task.
    func bootstrap() async {
        // Listen for auth state changes for the rest of the session.
        authChangesTask?.cancel()
        authChangesTask = Task { [weak self] in
            for await change in SupabaseManager.shared.client.auth.authStateChanges {
                await self?.handle(event: change.event, session: change.session)
            }
        }

        // Resolve initial state.
        do {
            let session = try await SupabaseManager.shared.client.auth.session
            await handle(event: .signedIn, session: session)
        } catch {
            state = .signedOut
        }
    }

    private func handle(event: AuthChangeEvent, session: Session?) async {
        switch event {
        case .signedIn, .tokenRefreshed, .userUpdated, .initialSession:
            if let session {
                state = .signedIn(userID: session.user.id)
                await refreshProfile(userID: session.user.id)
                await PresenceService.shared.start(userID: session.user.id)
                // Flush any APNs token that arrived before sign-in completed,
                // and prompt for notification permission on first sign-in.
                APNsRegistrar.shared.flushIfNeeded()
                Task { _ = await NotificationService.shared.requestPermission() }
            } else {
                state = .signedOut
                await PresenceService.shared.stop()
            }
        case .signedOut:
            state = .signedOut
            currentProfile = nil
            await PresenceService.shared.stop()
        case .passwordRecovery, .mfaChallengeVerified, .userDeleted:
            break
        @unknown default:
            break
        }
    }

    private func refreshProfile(userID: UUID) async {
        do {
            currentProfile = try await ProfilesRepository().fetchProfile(userID: userID)
        } catch {
            print("[SessionStore] failed to load profile:", error)
        }
    }

    func signOut() async {
        try? await SupabaseManager.shared.client.auth.signOut()
    }
}
