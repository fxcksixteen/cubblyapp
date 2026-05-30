import SwiftUI
import Photos
import PhotosUI
import UIKit
import AVFoundation
import UniformTypeIdentifiers

/// Discord-style inline attachment panel. Replaces the keyboard region when
/// the composer "+" is tapped: shows a grid of camera-roll recents with a
/// camera tile at the start, plus a bottom bar with **Photos** (full system
/// picker) and **Files** actions. Selecting a recent feeds straight back into
/// the chat composer's pending attachments (so the user can add a caption
/// before sending), mirroring Discord / Cubbly web + desktop.
struct InlineAttachPanel: View {
    /// Pixel height to occupy. Matches the keyboard height the composer just
    /// gave up; falls back to a Discord-like 300pt minimum.
    let height: CGFloat
    var onPickURLs: ([URL]) -> Void

    @State private var assets: [PHAsset] = []
    // IMPORTANT: do NOT call PHPhotoLibrary.authorizationStatus(...) here as
    // a default value — SwiftUI evaluates @State initializers off the main
    // thread on first render and PhotoKit's main-thread assertion crashes
    // the app in release builds on iOS 18+. Read it inside `.task` instead.
    @State private var authStatus: PHAuthorizationStatus = .notDetermined
    @State private var showCamera = false
    @State private var showSystemPhotos = false
    @State private var showFilePicker = false
    @State private var systemPicked: [PhotosPickerItem] = []

    private let columns: [GridItem] = Array(
        repeating: GridItem(.flexible(), spacing: 4), count: 3
    )

    var body: some View {
        VStack(spacing: 0) {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Bottom action bar — only "Photos" and "Files" per spec
            // (Poll lives elsewhere in the composer menu on iOS).
            HStack(spacing: 14) {
                actionPill(title: "Photos", systemImage: "photo.on.rectangle.angled") {
                    showSystemPhotos = true
                }
                actionPill(title: "Files", systemImage: "paperclip") {
                    showFilePicker = true
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Theme.Colors.bgPrimary)
            .overlay(Rectangle().fill(Theme.Colors.divider).frame(height: 1), alignment: .top)
        }
        .frame(height: height)
        .background(Theme.Colors.bgSecondary)
        .task { await ensureAuthAndLoad() }
        .sheet(isPresented: $showCamera) {
            CameraPickerRep { url in
                showCamera = false
                if let url { onPickURLs([url]) }
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $showSystemPhotos,
                      selection: $systemPicked,
                      maxSelectionCount: 10,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: systemPicked) { _, items in
            guard !items.isEmpty else { return }
            Task { await loadAndForward(items: items) }
        }
        .fileImporter(isPresented: $showFilePicker,
                      allowedContentTypes: [.item],
                      allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls):
                let copied: [URL] = urls.compactMap { src in
                    let didStart = src.startAccessingSecurityScopedResource()
                    defer { if didStart { src.stopAccessingSecurityScopedResource() } }
                    let dest = FileManager.default.temporaryDirectory
                        .appendingPathComponent("\(UUID().uuidString)-\(src.lastPathComponent)")
                    do {
                        try FileManager.default.copyItem(at: src, to: dest)
                        return dest
                    } catch {
                        print("[InlineAttach] file copy failed:", error)
                        return nil
                    }
                }
                if !copied.isEmpty { onPickURLs(copied) }
            case .failure(let err):
                print("[InlineAttach] file picker failed:", err)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch authStatus {
        case .notDetermined:
            permissionPrompt
        case .denied, .restricted:
            deniedView
        default:
            ScrollView {
                LazyVGrid(columns: columns, spacing: 4) {
                    // First tile is the camera — visually a "photo tile" so it
                    // feels like one of the user's library entries.
                    CameraTile { showCamera = true }
                        .aspectRatio(1, contentMode: .fit)
                    ForEach(assets, id: \.localIdentifier) { asset in
                        AssetThumb(asset: asset)
                            .aspectRatio(1, contentMode: .fit)
                            .onTapGesture { Task { await pickAsset(asset) } }
                    }
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 6)
            }
        }
    }

    private var permissionPrompt: some View {
        VStack(spacing: 10) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 32)).foregroundStyle(Theme.Colors.textSecondary)
            Text("Allow Cubbly to access your photos to attach them inline.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 24)
            Button("Allow Photo Access") {
                Task {
                    let next = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
                    await MainActor.run { authStatus = next }
                    await loadRecents()
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 10)
            .background(Theme.Colors.primary)
            .foregroundStyle(.white)
            .clipShape(Capsule())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var deniedView: some View {
        VStack(spacing: 8) {
            Image(systemName: "lock.fill").font(.system(size: 26))
                .foregroundStyle(Theme.Colors.textSecondary)
            Text("Photo access denied — use Photos or Files below.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func actionPill(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 15, weight: .semibold))
                Text(title).font(Theme.Fonts.bodyMedium)
            }
            .foregroundStyle(Theme.Colors.textPrimary)
            .padding(.horizontal, 16).padding(.vertical, 9)
            .frame(maxWidth: .infinity)
            .background(Theme.Colors.bgTertiary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @MainActor
    private func ensureAuthAndLoad() async {
        let current = await MainActor.run { PHPhotoLibrary.authorizationStatus(for: .readWrite) }
        if current == .notDetermined {
            let next = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            await MainActor.run { authStatus = next }
        } else {
            authStatus = current
        }
        await loadRecents()
    }

    @MainActor
    private func loadRecents() async {
        guard authStatus == .authorized || authStatus == .limited else { return }
        // Run the PhotoKit fetch on a background queue so we never block the
        // main thread on first appearance (which was contributing to the
        // perceived "crash" when opening the attach panel on slower devices).
        let arr: [PHAsset] = await withCheckedContinuation { cont in
            DispatchQueue.global(qos: .userInitiated).async {
                let opts = PHFetchOptions()
                opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
                opts.fetchLimit = 120
                let result = PHAsset.fetchAssets(with: opts)
                var out: [PHAsset] = []
                result.enumerateObjects { a, _, _ in out.append(a) }
                cont.resume(returning: out)
            }
        }
        assets = arr
    }

    @MainActor
    private func pickAsset(_ asset: PHAsset) async {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if let url = await AttachmentsPicker.exportToTempURL(asset: asset) {
            onPickURLs([url])
        }
    }

    @MainActor
    private func loadAndForward(items: [PhotosPickerItem]) async {
        defer { systemPicked = [] }
        var urls: [URL] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self) {
                let ext = item.supportedContentTypes.first?.preferredFilenameExtension ?? "bin"
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("\(UUID().uuidString).\(ext)")
                try? data.write(to: url)
                urls.append(url)
            }
        }
        if !urls.isEmpty { onPickURLs(urls) }
    }
}

// MARK: - Tiles

private struct CameraTile: View {
    var onTap: () -> Void
    var body: some View {
        Button(action: onTap) {
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Theme.Colors.bgTertiary)
                Image(systemName: "camera.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct AssetThumb: View {
    let asset: PHAsset
    @State private var image: UIImage?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Theme.Colors.bgTertiary)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            if asset.mediaType == .video {
                let d = Int(asset.duration)
                Text(String(format: " %d:%02d ", d / 60, d % 60))
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .background(Color.black.opacity(0.55))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .padding(4)
            }
        }
        .clipped()
        .task { await loadThumb() }
    }

    @MainActor
    private func loadThumb() async {
        let opts = PHImageRequestOptions()
        opts.deliveryMode = .opportunistic
        opts.isNetworkAccessAllowed = true
        let target = CGSize(width: 280, height: 280)
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            PHImageManager.default().requestImage(for: asset, targetSize: target,
                                                   contentMode: .aspectFill, options: opts) { img, _ in
                if let img { Task { @MainActor in self.image = img } }
                cont.resume()
            }
        }
    }
}

// MARK: - Camera

private struct CameraPickerRep: UIViewControllerRepresentable {
    var onPicked: (URL?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.mediaTypes = ["public.image", "public.movie"]
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onPicked: onPicked) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPicked: (URL?) -> Void
        init(onPicked: @escaping (URL?) -> Void) { self.onPicked = onPicked }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true) { self.onPicked(nil) }
        }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            picker.dismiss(animated: true) {
                if let videoURL = info[.mediaURL] as? URL {
                    let dest = FileManager.default.temporaryDirectory
                        .appendingPathComponent("\(UUID().uuidString).mov")
                    try? FileManager.default.copyItem(at: videoURL, to: dest)
                    self.onPicked(dest)
                    return
                }
                if let img = info[.originalImage] as? UIImage,
                   let data = img.jpegData(compressionQuality: 0.9) {
                    let dest = FileManager.default.temporaryDirectory
                        .appendingPathComponent("\(UUID().uuidString).jpg")
                    try? data.write(to: dest)
                    self.onPicked(dest)
                    return
                }
                self.onPicked(nil)
            }
        }
    }
}

// MARK: - Keyboard height tracking (singleton, last-seen height)

/// Caches the last-seen software-keyboard height so the inline attach panel
/// can come up at the exact same height the keyboard was. iOS exposes this
/// only via UIResponder notifications, so we observe globally once.
@MainActor
final class KeyboardHeightTracker: ObservableObject {
    static let shared = KeyboardHeightTracker()
    @Published private(set) var lastHeight: CGFloat = 300

    private init() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: UIResponder.keyboardWillShowNotification,
                       object: nil, queue: .main) { [weak self] note in
            guard let self,
                  let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
            else { return }
            // Subtract the bottom safe area inset — the attach panel sits
            // above the home-indicator inset already.
            let h = max(260, frame.height)
            self.lastHeight = h
        }
    }
}
