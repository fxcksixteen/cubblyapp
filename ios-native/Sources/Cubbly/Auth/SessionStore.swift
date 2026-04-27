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

    /// Weak singleton so non-View code (CallStore, signaling) can read the
    /// current profile/display name without dependency injection plumbing.
    private(set) static weak var shared: SessionStore?

    init() { Self.shared = self }

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
                // Bootstrap call signaling now that we have a user id.
                await CallStore.shared.attach(client: SupabaseManager.shared.client, userId: session.user.id)
                // Flush any APNs token that arrived before sign-in completed,
                // ask for permission on first launch, AND re-register every
                // launch if already authorized so APNs always hands us a token.
                APNsRegistrar.shared.flushIfNeeded()
                Task {
                    await NotificationService.shared.registerForRemoteIfAuthorized()
                    _ = await NotificationService.shared.requestPermission()
                }
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
        // Tear down anything that holds onto the user's session before we
        // clear auth, so the UI can route to Login immediately and we don't
        // leave realtime sockets / a live call dangling.
        await CallStore.shared.endCall()
        await PresenceService.shared.stop()
        currentProfile = nil

        // Force the UI to flip to .signedOut RIGHT NOW. The auth-change
        // stream will fire shortly after and confirm — but if the network
        // is flaky, the local-scope sign-out below still kills the session.
        state = .signedOut

        // `.local` scope clears the session on this device even if the
        // server call can't reach Supabase (offline, etc.). Without this,
        // a slow network leaves the user "signed in" until the request
        // times out, which is the bug the user was hitting.
        try? await SupabaseManager.shared.client.auth.signOut(scope: .local)
    }

    /// Optimistically updates the cached profile's status so views (the You
    /// tab, status dot in headers, etc.) reflect the change immediately
    /// without waiting for a profile re-fetch.
    func setLocalStatus(_ status: String) {
        if var profile = currentProfile {
            profile.status = status
            currentProfile = profile
        }
    }

    /// Force a fresh profile reload from the backend.
    func reloadProfile() async {
        guard let userID = currentUserID else { return }
        await refreshProfile(userID: userID)
    }
}
