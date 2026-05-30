import SwiftUI
import Photos
import PhotosUI
import UIKit
import AVFoundation
import UniformTypeIdentifiers

/// Discord-style inline attachment panel. Replaces the keyboard region when
/// the composer "+" is tapped: shows a grid of camera-roll recents with a
/// camera tile at the start, plus a bottom bar with **Photos** (full system
/// picker) and **Files** actions.
///
/// Multi-select: tapping a thumb toggles it into a pending selection map,
/// numbered in tap order with a Discord-blue badge + ring on the tile.
/// Tapping it again removes it (impossible to attach the same asset twice).
/// Tapping "Add" exports all selected assets and feeds them into the
/// composer's pending-attachments bar, where the user can add a caption
/// before sending — exactly like Discord.
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

    /// Asset localIdentifier → 1-based selection order. Drives the badge
    /// number, the selected-ring, and dedupe.
    @State private var selected: [String: Int] = [:]
    @State private var exporting = false

    private let columns: [GridItem] = Array(
        repeating: GridItem(.flexible(), spacing: 4), count: 3
    )

    var body: some View {
        VStack(spacing: 0) {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Floating pill bottom bar — Photos + Files in a single
            // capsule that hovers over the grid. When at least one tile is
            // selected, an "Add (N)" pill appears next to it.
            HStack(spacing: 10) {
                HStack(spacing: 0) {
                    pillButton(title: "Photos", systemImage: "photo.on.rectangle.angled") {
                        showSystemPhotos = true
                    }
                    Rectangle()
                        .fill(Theme.Colors.divider.opacity(0.6))
                        .frame(width: 1, height: 22)
                    pillButton(title: "Files", systemImage: "paperclip") {
                        showFilePicker = true
                    }
                }
                .background(
                    Capsule().fill(Theme.Colors.bgTertiary)
                )
                .overlay(
                    Capsule().stroke(Color.white.opacity(0.06), lineWidth: 0.5)
                )
                .shadow(color: .black.opacity(0.25), radius: 8, y: 3)

                if !selected.isEmpty {
                    Button {
                        Task { await commitSelection() }
                    } label: {
                        HStack(spacing: 6) {
                            if exporting {
                                ProgressView().tint(.white).scaleEffect(0.8)
                            } else {
                                Image(systemName: "paperplane.fill")
                                    .font(.system(size: 13, weight: .bold))
                            }
                            Text("Add (\(selected.count))")
                                .font(Theme.Fonts.bodyMedium)
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Capsule().fill(Theme.Colors.primary))
                        .shadow(color: Theme.Colors.primary.opacity(0.35), radius: 8, y: 3)
                    }
                    .buttonStyle(.plain)
                    .disabled(exporting)
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: selected.isEmpty)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
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
                        AssetThumb(
                            asset: asset,
                            selectionOrder: selected[asset.localIdentifier]
                        )
                        .aspectRatio(1, contentMode: .fit)
                        .onTapGesture { toggle(asset: asset) }
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

    /// Single segment of the floating Photos/Files pill.
    private func pillButton(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .semibold))
                Text(title).font(Theme.Fonts.bodyMedium)
            }
            .foregroundStyle(Theme.Colors.textPrimary)
            .padding(.horizontal, 18).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Selection

    private func toggle(asset: PHAsset) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let id = asset.localIdentifier
        if selected[id] != nil {
            // Deselect — renumber the rest to keep 1..N sequential.
            selected.removeValue(forKey: id)
            let ordered = selected.sorted(by: { $0.value < $1.value }).map(\.key)
            var renum: [String: Int] = [:]
            for (i, k) in ordered.enumerated() { renum[k] = i + 1 }
            selected = renum
        } else {
            let nextOrder = (selected.values.max() ?? 0) + 1
            selected[id] = nextOrder
        }
    }

    @MainActor
    private func commitSelection() async {
        guard !selected.isEmpty else { return }
        exporting = true
        defer { exporting = false }
        // Preserve user tap order.
        let orderedIDs = selected.sorted(by: { $0.value < $1.value }).map(\.key)
        let lookup = Dictionary(uniqueKeysWithValues: assets.map { ($0.localIdentifier, $0) })
        var urls: [URL] = []
        for id in orderedIDs {
            guard let asset = lookup[id] else { continue }
            if let url = await AttachmentsPicker.exportToTempURL(asset: asset) {
                urls.append(url)
            }
        }
        if !urls.isEmpty { onPickURLs(urls) }
        selected.removeAll()
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
    /// `nil` when not selected; otherwise the 1-based tap order.
    let selectionOrder: Int?
    @State private var image: UIImage?

    private var isSelected: Bool { selectionOrder != nil }

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            ZStack(alignment: .topTrailing) {
                // 1:1 square base — every asset, regardless of source aspect,
                // is center-cropped into the same square shape for a clean
                // Discord-style grid.
                ZStack(alignment: .bottomTrailing) {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Theme.Colors.bgTertiary)
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: side, height: side)
                            .clipped()
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
                .frame(width: side, height: side)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(isSelected ? Theme.Colors.primary : Color.clear, lineWidth: 2.5)
                )
                .scaleEffect(isSelected ? 0.94 : 1.0)
                .animation(.easeOut(duration: 0.12), value: isSelected)

                // Selection badge — Discord blue circle with the order
                // number so the user can see exactly what tap-order their
                // attachments will be in.
                if let order = selectionOrder {
                    ZStack {
                        Circle()
                            .fill(Theme.Colors.primary)
                            .frame(width: 22, height: 22)
                            .overlay(Circle().stroke(Color.white, lineWidth: 1.5))
                            .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        Text("\(order)")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundStyle(.white)
                    }
                    .padding(6)
                }
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .task { await loadThumb() }
    }

    @MainActor
    private func loadThumb() async {
        let opts = PHImageRequestOptions()
        opts.deliveryMode = .opportunistic
        opts.isNetworkAccessAllowed = true
        let target = CGSize(width: 400, height: 400)
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            var didResume = false
            PHImageManager.default().requestImage(for: asset, targetSize: target,
                                                   contentMode: .aspectFill, options: opts) { img, _ in
                if let img { Task { @MainActor in self.image = img } }
                if !didResume {
                    didResume = true
                    cont.resume()
                }
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
            let h = max(260, frame.height)
            self.lastHeight = h
        }
    }
}
