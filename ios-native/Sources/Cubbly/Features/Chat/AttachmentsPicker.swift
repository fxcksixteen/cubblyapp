import SwiftUI
import Photos
import PhotosUI
import UIKit

/// Discord-style attach sheet — UIKit-backed PhotoKit grid wrapped via
/// `UIViewControllerRepresentable`. Uses `PHCachingImageManager` for fast
/// thumbnails and a `PHPhotoLibraryChangeObserver` so newly granted access
/// or new photos appear without a full re-render race.
struct AttachmentsPicker: View {
    var onSend: ([URL]) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var authStatus: PHAuthorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    @State private var selectedAssets: [PHAsset] = []
    @State private var morePhotosItems: [PhotosPickerItem] = []
    @State private var sending = false

    var body: some View {
        VStack(spacing: 0) {
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
                    if sending { ProgressView().tint(Theme.Colors.primary) }
                    else {
                        Text("Send (\(selectedAssets.count))")
                            .foregroundStyle(selectedAssets.isEmpty ? Theme.Colors.textMuted : Theme.Colors.primary)
                    }
                }
                .disabled(selectedAssets.isEmpty || sending)
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
                PhotoGridRepresentable(
                    selectedAssets: $selectedAssets
                )
            }
        }
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
        .task { await requestIfNeeded() }
        .onChange(of: morePhotosItems) { _, items in
            Task { await sendFromPhotosPicker(items) }
        }
    }

    private var permissionPrompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 38)).foregroundStyle(Theme.Colors.textSecondary)
            Text("Allow Cubbly to access your photos to attach them inline.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 24)
            Button("Allow Photo Access") { Task { await requestIfNeeded(force: true) } }
                .padding(.horizontal, 18).padding(.vertical, 10)
                .background(Theme.Colors.primary)
                .foregroundStyle(.white)
                .clipShape(Capsule())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var deniedView: some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.fill").font(.system(size: 32)).foregroundStyle(Theme.Colors.textSecondary)
            Text("Photo access was denied.")
                .font(Theme.Fonts.bodyMedium)
                .foregroundStyle(Theme.Colors.textPrimary)
            Text("Open Settings to grant Cubbly access to your camera roll.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 24)
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

    @MainActor
    private func requestIfNeeded(force: Bool = false) async {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if current == .notDetermined || force {
            let next = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            authStatus = next
        } else {
            authStatus = current
        }
    }

    @MainActor
    private func sendSelected() async {
        sending = true
        defer { sending = false }
        var urls: [URL] = []
        for asset in selectedAssets {
            if let url = await Self.exportToTempURL(asset: asset) { urls.append(url) }
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
        if !urls.isEmpty { onSend(urls); dismiss() }
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

// MARK: - UIKit grid

struct PhotoGridRepresentable: UIViewControllerRepresentable {
    @Binding var selectedAssets: [PHAsset]

    func makeUIViewController(context: Context) -> PhotoGridViewController {
        let vc = PhotoGridViewController()
        vc.onSelectionChanged = { assets in
            DispatchQueue.main.async { selectedAssets = assets }
        }
        return vc
    }

    func updateUIViewController(_ uiViewController: PhotoGridViewController, context: Context) {}
}

final class PhotoGridViewController: UIViewController, UICollectionViewDataSource, UICollectionViewDelegate, PHPhotoLibraryChangeObserver {
    var onSelectionChanged: (([PHAsset]) -> Void)?

    private var collectionView: UICollectionView!
    private var fetchResult: PHFetchResult<PHAsset>?
    private let imageManager = PHCachingImageManager()
    private var selectedIDs: [String] = []
    private var selectedAssets: [PHAsset] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(Theme.Colors.bgPrimary)

        let layout = UICollectionViewFlowLayout()
        let spacing: CGFloat = 4
        let cols: CGFloat = 3
        let totalSpacing = spacing * (cols - 1)
        let itemSize = (UIScreen.main.bounds.width - totalSpacing - 8) / cols
        layout.itemSize = CGSize(width: itemSize, height: itemSize)
        layout.minimumInteritemSpacing = spacing
        layout.minimumLineSpacing = spacing
        layout.sectionInset = UIEdgeInsets(top: 8, left: 4, bottom: 8, right: 4)

        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.backgroundColor = .clear
        collectionView.dataSource = self
        collectionView.delegate = self
        collectionView.register(PhotoGridCell.self, forCellWithReuseIdentifier: "cell")
        collectionView.allowsMultipleSelection = true
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(collectionView)
        NSLayoutConstraint.activate([
            collectionView.topAnchor.constraint(equalTo: view.topAnchor),
            collectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            collectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            collectionView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        PHPhotoLibrary.shared().register(self)
        loadAssets()
    }

    deinit { PHPhotoLibrary.shared().unregisterChangeObserver(self) }

    private func loadAssets() {
        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opts.fetchLimit = 200
        fetchResult = PHAsset.fetchAssets(with: opts)
        collectionView.reloadData()
    }

    // MARK: PHPhotoLibraryChangeObserver

    func photoLibraryDidChange(_ changeInstance: PHChange) {
        DispatchQueue.main.async { [weak self] in self?.loadAssets() }
    }

    // MARK: DataSource

    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        fetchResult?.count ?? 0
    }

    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "cell", for: indexPath) as! PhotoGridCell
        guard let asset = fetchResult?.object(at: indexPath.item) else { return cell }
        cell.assetID = asset.localIdentifier
        cell.isVideo = asset.mediaType == .video
        cell.duration = asset.duration
        cell.isAssetSelected = selectedIDs.contains(asset.localIdentifier)

        let target = CGSize(width: 240, height: 240)
        imageManager.requestImage(for: asset, targetSize: target, contentMode: .aspectFill, options: nil) { img, _ in
            if cell.assetID == asset.localIdentifier { cell.imageView.image = img }
        }
        return cell
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        guard let asset = fetchResult?.object(at: indexPath.item) else { return }
        if let idx = selectedIDs.firstIndex(of: asset.localIdentifier) {
            selectedIDs.remove(at: idx)
            selectedAssets.remove(at: idx)
        } else {
            selectedIDs.append(asset.localIdentifier)
            selectedAssets.append(asset)
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        collectionView.reloadItems(at: [indexPath])
        onSelectionChanged?(selectedAssets)
    }
}

final class PhotoGridCell: UICollectionViewCell {
    let imageView = UIImageView()
    private let overlay = UIView()
    private let checkmark = UIImageView(image: UIImage(systemName: "checkmark.circle.fill"))
    private let videoBadge = UILabel()

    var assetID: String?
    var isVideo: Bool = false { didSet { updateVideo() } }
    var duration: TimeInterval = 0 { didSet { updateVideo() } }
    var isAssetSelected: Bool = false { didSet { updateSelection() } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        contentView.backgroundColor = UIColor(Theme.Colors.bgSecondary)
        contentView.layer.cornerRadius = 6
        contentView.clipsToBounds = true

        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(imageView)

        overlay.backgroundColor = UIColor(Theme.Colors.primary).withAlphaComponent(0.25)
        overlay.isHidden = true
        overlay.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(overlay)

        checkmark.tintColor = .white
        checkmark.backgroundColor = UIColor(Theme.Colors.primary)
        checkmark.layer.cornerRadius = 11
        checkmark.layer.masksToBounds = true
        checkmark.contentMode = .center
        checkmark.isHidden = true
        checkmark.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(checkmark)

        videoBadge.font = .systemFont(ofSize: 10, weight: .bold)
        videoBadge.textColor = .white
        videoBadge.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        videoBadge.textAlignment = .center
        videoBadge.layer.cornerRadius = 4
        videoBadge.layer.masksToBounds = true
        videoBadge.isHidden = true
        videoBadge.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(videoBadge)

        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: contentView.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            imageView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),

            overlay.topAnchor.constraint(equalTo: contentView.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),

            checkmark.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 5),
            checkmark.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -5),
            checkmark.widthAnchor.constraint(equalToConstant: 22),
            checkmark.heightAnchor.constraint(equalToConstant: 22),

            videoBadge.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -4),
            videoBadge.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -4),
            videoBadge.heightAnchor.constraint(equalToConstant: 16),
            videoBadge.widthAnchor.constraint(greaterThanOrEqualToConstant: 32),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    override func prepareForReuse() {
        super.prepareForReuse()
        imageView.image = nil
        isAssetSelected = false
    }

    private func updateSelection() {
        overlay.isHidden = !isAssetSelected
        checkmark.isHidden = !isAssetSelected
        contentView.layer.borderWidth = isAssetSelected ? 2 : 0
        contentView.layer.borderColor = UIColor(Theme.Colors.primary).cgColor
    }

    private func updateVideo() {
        guard isVideo else { videoBadge.isHidden = true; return }
        videoBadge.isHidden = false
        let d = Int(duration)
        videoBadge.text = String(format: " %d:%02d ", d / 60, d % 60)
    }
}
