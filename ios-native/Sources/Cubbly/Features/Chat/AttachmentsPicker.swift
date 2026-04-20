import SwiftUI
import PhotosUI

/// Camera-roll picker presented from the chat composer when the user taps
/// the "+" button. Mirrors the desktop attach flow — multi-select images +
/// videos with a clean grid preview, then a "Send" CTA.
struct AttachmentsPicker: View {
    var onSend: ([PhotosPickerItem]) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selection: [PhotosPickerItem] = []
    @State private var thumbnails: [UIImage] = []

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Cancel") { dismiss() }
                    .foregroundStyle(Theme.Colors.textSecondary)
                Spacer()
                Text("Attach")
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                Button("Send") {
                    onSend(selection)
                    dismiss()
                }
                .foregroundStyle(selection.isEmpty ? Theme.Colors.textMuted : Theme.Colors.primary)
                .disabled(selection.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider().background(Theme.Colors.divider)

            ScrollView {
                if thumbnails.isEmpty {
                    PhotosPicker(
                        selection: $selection,
                        maxSelectionCount: 10,
                        matching: .any(of: [.images, .videos])
                    ) {
                        VStack(spacing: 10) {
                            Image(systemName: "photo.on.rectangle.angled")
                                .font(.system(size: 40))
                                .foregroundStyle(Theme.Colors.textSecondary)
                            Text("Select photos or videos")
                                .font(Theme.Fonts.bodyMedium)
                                .foregroundStyle(Theme.Colors.textPrimary)
                            Text("Tap to open your camera roll")
                                .font(Theme.Fonts.bodySmall)
                                .foregroundStyle(Theme.Colors.textSecondary)
                        }
                        .frame(maxWidth: .infinity, minHeight: 320)
                        .background(Theme.Colors.bgSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .padding(16)
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                        ForEach(Array(thumbnails.enumerated()), id: \.offset) { _, img in
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 110, height: 110)
                                .clipped()
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                    }
                    .padding(12)

                    PhotosPicker(
                        selection: $selection,
                        maxSelectionCount: 10,
                        matching: .any(of: [.images, .videos])
                    ) {
                        Label("Change selection", systemImage: "photo.stack")
                            .font(Theme.Fonts.bodySmall)
                            .foregroundStyle(Theme.Colors.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Theme.Colors.bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .padding(.horizontal, 16)
                            .padding(.bottom, 16)
                    }
                }
            }
        }
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
        .onChange(of: selection) { _, items in
            Task { await loadThumbnails(items) }
        }
    }

    private func loadThumbnails(_ items: [PhotosPickerItem]) async {
        var out: [UIImage] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                out.append(img)
            }
        }
        await MainActor.run { thumbnails = out }
    }
}
