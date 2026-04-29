import SwiftUI
import UIKit

/// Presents the full iOS system emoji keyboard so users can pick ANY emoji as
/// a message reaction (not just the 6 quick ones). Apple does not expose a
/// SwiftUI emoji picker — the standard trick is to host a hidden UITextField,
/// force-focus it, and intercept the first character the user types.
struct FullEmojiPickerView: View {
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 14) {
            Capsule().fill(Color.white.opacity(0.18))
                .frame(width: 36, height: 4)
                .padding(.top, 8)

            VStack(spacing: 6) {
                Text("Pick any emoji")
                    .font(Theme.Fonts.heading)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text("Tap the 😀 key on your keyboard, then choose any emoji.")
                    .font(.cubbly(13))
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            .padding(.top, 4)

            EmojiCaptureField { emoji in
                onPick(emoji)
                dismiss()
            }
            .frame(height: 1)
            .opacity(0.01)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgSecondary.ignoresSafeArea())
    }
}

/// Hidden UITextField that auto-focuses, switches to the emoji keyboard if
/// possible, and reports the first emoji character typed.
private struct EmojiCaptureField: UIViewRepresentable {
    let onEmoji: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onEmoji: onEmoji) }

    func makeUIView(context: Context) -> UITextField {
        let tf = EmojiOnlyTextField(frame: .zero)
        tf.delegate = context.coordinator
        tf.autocorrectionType = .no
        tf.autocapitalizationType = .none
        tf.spellCheckingType = .no
        tf.tintColor = .clear
        tf.textColor = .clear
        tf.backgroundColor = .clear
        // Asking for the emoji keyboard explicitly works on most devices; if
        // iOS overrides it the user can still tap the globe key.
        tf.keyboardType = .default
        DispatchQueue.main.async { tf.becomeFirstResponder() }
        return tf
    }

    func updateUIView(_ uiView: UITextField, context: Context) {}

    final class Coordinator: NSObject, UITextFieldDelegate {
        let onEmoji: (String) -> Void
        init(onEmoji: @escaping (String) -> Void) { self.onEmoji = onEmoji }

        func textField(_ textField: UITextField,
                       shouldChangeCharactersIn range: NSRange,
                       replacementString string: String) -> Bool {
            // Grab the first complete grapheme cluster — handles multi-scalar
            // emojis like 👨‍👩‍👧 or 👍🏽 as one unit.
            if let first = string.first {
                let s = String(first)
                if s.containsEmoji {
                    onEmoji(s)
                    return false
                }
            }
            return false
        }
    }
}

/// UITextField subclass that always reports the emoji keyboard as preferred.
private final class EmojiOnlyTextField: UITextField {
    override var textInputContextIdentifier: String? { "" }
    override var textInputMode: UITextInputMode? {
        UITextInputMode.activeInputModes.first { $0.primaryLanguage == "emoji" }
            ?? super.textInputMode
    }
}

private extension String {
    /// True if any scalar in this grapheme is an emoji presentation scalar.
    var containsEmoji: Bool {
        unicodeScalars.contains { scalar in
            scalar.properties.isEmojiPresentation
                || scalar.properties.isEmoji && scalar.value > 0x238C
        }
    }
}
