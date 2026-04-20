import SwiftUI

struct CubblyTextField: View {
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var isSecure: Bool = false

    var body: some View {
        Group {
            if isSecure {
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
