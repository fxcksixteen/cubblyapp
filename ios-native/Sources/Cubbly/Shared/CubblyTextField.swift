import SwiftUI

struct CubblyTextField: View {
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var isSecure: Bool = false
    /// When true and `isSecure` is true, shows a tappable eye icon to toggle
    /// password visibility (matches the web app login UX).
    var showPasswordToggle: Bool = false

    @State private var revealed: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if isSecure && !revealed {
                    SecureField("", text: $text, prompt: prompt)
                } else {
                    TextField("", text: $text, prompt: prompt)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .font(Theme.Fonts.body)
            .foregroundStyle(Theme.Colors.textPrimary)

            if isSecure && showPasswordToggle {
                Button {
                    revealed.toggle()
                } label: {
                    Image(systemName: revealed ? "eye.slash.fill" : "eye.fill")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .background(Theme.Colors.bgFloating)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .stroke(Theme.Colors.border, lineWidth: 1)
        )
    }

    private var prompt: Text {
        Text(placeholder).foregroundStyle(Theme.Colors.textMuted)
    }
}
