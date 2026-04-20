import SwiftUI
import Photos
import PhotosUI
import AVFoundation

/// Discord-style attach sheet: shows the user's most-recent camera-roll items
/// inline as a 3-column grid for instant selection, with a "More from Library"
/// fallback that opens the full PhotosPicker.
struct AttachmentsPicker: View {
    var onSend: ([URL]) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var assets: [PHAsset] = []
    @State private var selected: Set<String> = []
    @State private var thumbCache: [String: UIImage] = [:]
    @State private var authStatus: PHAuthorizationStatus = .notDetermined
    @State private var morePhotosItems: [PhotosPickerItem] = []
    @State private var sending = false

    var body: some View {
        VStack(spacing: 0) {
            // Sheet header
            HStack {
                Button("Cancel") { dismiss() }
                    .foregroundStyle(Theme.Colors.textSecondary)
                Spacer()
                Text("Recent")
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                Button {
                    Task { await sendSelected() }
                } label: {
                    if sending {
                        ProgressView().tint(Theme.Colors.primary)
                    } else {
                        Text("Send (\(selected.count))")
                            .foregroundStyle(selected.isEmpty ? Theme.Colors.textMuted : Theme.Colors.primary)
                    }
                }
                .disabled(selected.isEmpty || sending)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            Divider().background(Theme.Colors.divider)

            switch authStatus {
            case .notDetermined:
                permissionPrompt
            case .denied, .restricted:
                deniedView
            default:
                grid
            }
        }
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
        .task { await requestAndLoad() }
        .onChange(of: morePhotosItems) { _, items in
            Task { await sendFromPhotosPicker(items) }
        }
    }

    private var permissionPrompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 38))
                .foregroundStyle(Theme.Colors.textSecondary)
            Text("Allow Cubbly to access your photos to attach them inline.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            Button("Allow Photo Access") { Task { await requestAndLoad() } }
                .padding(.horizontal, 18).padding(.vertical, 10)
                .background(Theme.Colors.primary)
                .foregroundStyle(.white)
                .clipShape(Capsule())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var deniedView: some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.fill")
                .font(.system(size: 32)).foregroundStyle(Theme.Colors.textSecondary)
            Text("Photo access was denied.")
                .font(Theme.Fonts.bodyMedium)
                .foregroundStyle(Theme.Colors.textPrimary)
            Text("Open Settings to grant Cubbly access to your camera roll.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            PhotosPicker(selection: $morePhotosItems, maxSelectionCount: 10,
                         matching: .any(of: [.images, .videos])) {
                Text("Pick from Library Instead")
                    .padding(.horizontal, 18).padding(.vertical, 10)
                    .background(Theme.Colors.bgSecondary)
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
                // Open-full-library tile first
                PhotosPicker(selection: $morePhotosItems, maxSelectionCount: 10,
                             matching: .any(of: [.images, .videos])) {
                    ZStack {
                        Rectangle().fill(Theme.Colors.bgSecondary)
                        VStack(spacing: 4) {
                            Image(systemName: "photo.stack")
                                .font(.system(size: 22))
                                .foregroundStyle(Theme.Colors.textSecondary)
                            Text("Library")
                                .font(.custom("Nunito", size: 10).weight(.semibold))
                                .foregroundStyle(Theme.Colors.textSecondary)
                        }
                    }
                    .aspectRatio(1, contentMode: .fill)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }

                ForEach(assets, id: \.localIdentifier) { asset in
                    AssetThumb(asset: asset,
                               cached: thumbCache[asset.localIdentifier],
                               isSelected: selected.contains(asset.localIdentifier))
                        .onTapGesture {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            if selected.contains(asset.localIdentifier) {
                                selected.remove(asset.localIdentifier)
                            } else {
                                selected.insert(asset.localIdentifier)
                            }
                        }
                        .task {
                            if thumbCache[asset.localIdentifier] == nil {
                                let img = await Self.thumbnail(for: asset)
                                await MainActor.run { thumbCache[asset.localIdentifier] = img }
                            }
                        }
                }
            }
            .padding(8)
        }
    }

    // MARK: - Loading + permissions

    @MainActor
    private func requestAndLoad() async {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if status == .notDetermined {
            let granted = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            authStatus = granted
        } else {
            authStatus = status
        }
        if authStatus == .authorized || authStatus == .limited {
            loadAssets()
        }
    }

    private func loadAssets() {
        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opts.fetchLimit = 60
        let result = PHAsset.fetchAssets(with: opts)
        var arr: [PHAsset] = []
        result.enumerateObjects { a, _, _ in arr.append(a) }
        assets = arr
    }

    static func thumbnail(for asset: PHAsset, size: CGSize = CGSize(width: 280, height: 280)) async -> UIImage? {
        await withCheckedContinuation { cont in
            let options = PHImageRequestOptions()
            options.isNetworkAccessAllowed = true
            options.deliveryMode = .opportunistic
            PHImageManager.default().requestImage(for: asset,
                                                  targetSize: size,
                                                  contentMode: .aspectFill,
                                                  options: options) { img, _ in
                cont.resume(returning: img)
            }
        }
    }

    // MARK: - Sending

    @MainActor
    private func sendSelected() async {
        sending = true
        defer { sending = false }
        var urls: [URL] = []
        for id in selected {
            if let asset = assets.first(where: { $0.localIdentifier == id }),
               let url = await Self.exportToTempURL(asset: asset) {
                urls.append(url)
            }
        }
        guard !urls.isEmpty else { return }
        onSend(urls)
        dismiss()
    }

    @MainActor
    private func sendFromPhotosPicker(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        sending = true
        defer { sending = false }
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
        if !urls.isEmpty {
            onSend(urls)
            dismiss()
        }
    }

    static func exportToTempURL(asset: PHAsset) async -> URL? {
        if asset.mediaType == .image {
            return await withCheckedContinuation { cont in
                let opts = PHImageRequestOptions()
                opts.isNetworkAccessAllowed = true
                opts.version = .current
                PHImageManager.default().requestImageDataAndOrientation(for: asset, options: opts) { data, uti, _, _ in
                    guard let data else { cont.resume(returning: nil); return }
                    let ext = (uti?.contains("png") ?? false) ? "png" : "jpg"
                    let url = FileManager.default.temporaryDirectory
                        .appendingPathComponent("\(UUID().uuidString).\(ext)")
                    try? data.write(to: url)
                    cont.resume(returning: url)
                }
            }
        } else if asset.mediaType == .video {
            return await withCheckedContinuation { cont in
                let opts = PHVideoRequestOptions()
                opts.isNetworkAccessAllowed = true
                opts.deliveryMode = .highQualityFormat
                PHImageManager.default().requestAVAsset(forVideo: asset, options: opts) { avAsset, _, _ in
                    guard let urlAsset = avAsset as? AVURLAsset else { cont.resume(returning: nil); return }
                    let dest = FileManager.default.temporaryDirectory
                        .appendingPathComponent("\(UUID().uuidString).mov")
                    try? FileManager.default.copyItem(at: urlAsset.url, to: dest)
                    cont.resume(returning: dest)
                }
            }
        }
        return nil
    }
}

private struct AssetThumb: View {
    let asset: PHAsset
    let cached: UIImage?
    let isSelected: Bool

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let img = cached {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Rectangle().fill(Theme.Colors.bgSecondary)
            }
            if asset.mediaType == .video {
                HStack(spacing: 3) {
                    Image(systemName: "play.fill").font(.system(size: 9, weight: .bold))
                    Text(durationString)
                        .font(.custom("Nunito", size: 10).weight(.semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 5).padding(.vertical, 2)
                .background(Capsule().fill(.black.opacity(0.55)))
                .padding(4)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            }
            if isSelected {
                Circle().fill(Theme.Colors.primary)
                    .frame(width: 22, height: 22)
                    .overlay(Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white))
                    .padding(5)
            }
        }
        .aspectRatio(1, contentMode: .fill)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(isSelected ? Theme.Colors.primary : .clear, lineWidth: 2)
        )
        .contentShape(Rectangle())
    }

    private var durationString: String {
        let d = Int(asset.duration)
        return String(format: "%d:%02d", d / 60, d % 60)
    }
}

