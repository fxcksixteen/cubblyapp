import Foundation
import CallKit
import AVFoundation
import UIKit

/// Bridges Cubbly voice calls into iOS CallKit. Reporting an active call to
/// CallKit is what makes iOS:
///   - paint the green pill in the system status bar while the app is in
///     the background or another app is foreground
///   - show the call on the lock screen
///   - automatically take audio focus
/// Tapping the green pill reopens our app, and our `CallStore` flow stays
/// the same (we don't drive WebRTC from CallKit, we only mirror state).
@MainActor
final class CallKitService: NSObject {
    static let shared = CallKitService()

    private let provider: CXProvider
    private let controller = CXCallController()

    private(set) var currentCallUUID: UUID?

    override init() {
        // iOS 14+: use the localizedName initializer so the system call UI
        // says "Cubbly Audio" instead of the generic "App". Required for the
        // full-screen incoming call UI to render correctly when reported.
        let config = CXProviderConfiguration(localizedName: "Cubbly")
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true
        if let img = UIImage(named: "cubbly-nobg") {
            config.iconTemplateImageData = img.pngData()
        }
        self.provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    /// Report an outgoing call (we initiated it). Triggers the green pill
    /// once the call actually connects.
    func startOutgoing(handleName: String) {
        endActiveCallIfNeeded()
        let id = UUID()
        currentCallUUID = id
        let handle = CXHandle(type: .generic, value: handleName)
        let action = CXStartCallAction(call: id, handle: handle)
        action.contactIdentifier = handleName
        let tx = CXTransaction(action: action)
        controller.request(tx) { err in
            if let err = err { print("[CallKit] startOutgoing failed:", err) }
        }
    }

    /// Mark the outgoing call as connected (so iOS shows the green pill).
    func reportConnected() {
        guard let id = currentCallUUID else { return }
        provider.reportOutgoingCall(with: id, connectedAt: Date())
    }

    /// Report an incoming call (peer is ringing us). Will display the
    /// system incoming-call UI.
    func reportIncoming(handleName: String, completion: @escaping (Error?) -> Void) {
        endActiveCallIfNeeded()
        let id = UUID()
        currentCallUUID = id
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handleName)
        update.localizedCallerName = handleName
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        provider.reportNewIncomingCall(with: id, update: update, completion: completion)
    }

    /// End the CallKit-tracked call (clears the green pill).
    func endActiveCallIfNeeded() {
        guard let id = currentCallUUID else { return }
        let action = CXEndCallAction(call: id)
        let tx = CXTransaction(action: action)
        controller.request(tx) { _ in }
        currentCallUUID = nil
    }

    /// Mute toggle reflected to CallKit (so the system honors it).
    func setMuted(_ muted: Bool) {
        guard let id = currentCallUUID else { return }
        let action = CXSetMutedCallAction(call: id, muted: muted)
        let tx = CXTransaction(action: action)
        controller.request(tx) { _ in }
    }
}

extension CallKitService: CXProviderDelegate {
    nonisolated func providerDidReset(_ provider: CXProvider) {}

    nonisolated func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        Task { @MainActor in await CallStore.shared.acceptIncoming() }
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        Task { @MainActor in
            CallKitService.shared.currentCallUUID = nil
            await CallStore.shared.endCall()
        }
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        Task { @MainActor in
            if CallStore.shared.isMuted != action.isMuted {
                CallStore.shared.toggleMute()
            }
        }
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        Task { @MainActor in CallStore.shared.reapplyAudioSession() }
    }

    nonisolated func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}
