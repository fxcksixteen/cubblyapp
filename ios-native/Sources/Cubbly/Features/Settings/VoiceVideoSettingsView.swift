import SwiftUI

/// iOS-appropriate subset of the desktop "Voice & Video" settings screen:
/// output route (speaker vs. natural), input/output volume sliders, AEC and
/// noise-suppression toggles. Persisted via `CallSettings.shared` and applied
/// to the live call where possible.
struct VoiceVideoSettingsView: View {
    @ObservedObject var settings = CallSettings.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    section(title: "OUTPUT") {
                        Toggle(isOn: $settings.speakerOutput) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Use speaker").font(.cubbly(15, .semibold)).foregroundStyle(.white)
                                Text("Force speakerphone instead of earpiece. Bluetooth/AirPods always win.")
                                    .font(.cubbly(12, .regular))
                                    .foregroundStyle(Theme.Colors.textSecondary)
                            }
                        }
                        .tint(Theme.Colors.primary)

                        sliderRow(label: "Output volume",
                                  value: Binding(get: { settings.outputVolume }, set: { settings.outputVolume = $0 }),
                                  range: 0...200,
                                  format: { "\(Int($0))%" })
                    }

                    section(title: "INPUT") {
                        sliderRow(label: "Input volume",
                                  value: Binding(get: { settings.inputVolume }, set: { settings.inputVolume = $0 }),
                                  range: 0...200,
                                  format: { "\(Int($0))%" })
                    }

                    section(title: "VOICE PROCESSING") {
                        Toggle(isOn: $settings.echoCancellation) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Echo cancellation").font(.cubbly(15, .semibold)).foregroundStyle(.white)
                                Text("Recommended. Removes the sound of others' voices from your mic.")
                                    .font(.cubbly(12, .regular))
                                    .foregroundStyle(Theme.Colors.textSecondary)
                            }
                        }
                        .tint(Theme.Colors.primary)

                        Toggle(isOn: $settings.noiseSuppression) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Noise suppression").font(.cubbly(15, .semibold)).foregroundStyle(.white)
                                Text("Recommended. Reduces background noise like keyboards and fans. Applies on next call.")
                                    .font(.cubbly(12, .regular))
                                    .foregroundStyle(Theme.Colors.textSecondary)
                            }
                        }
                        .tint(Theme.Colors.primary)
                    }

                    section(title: "VIDEO") {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Camera off").font(.cubbly(15, .semibold)).foregroundStyle(Theme.Colors.textSecondary)
                            Text("Outgoing video isn't supported in v0.1.0. You can still see other people's cameras and screenshares.")
                                .font(.cubbly(12, .regular))
                                .foregroundStyle(Theme.Colors.textSecondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .padding(20)
            }
            .background(Theme.Colors.bgPrimary.ignoresSafeArea())
            .navigationTitle("Voice & Video")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.foregroundStyle(Theme.Colors.primary)
                }
            }
        }
    }

    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.cubbly(11, .bold))
                .foregroundStyle(Theme.Colors.textSecondary)
                .textCase(.uppercase)
            content()
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.Colors.bgSecondary))
    }

    private func sliderRow(label: String, value: Binding<Double>, range: ClosedRange<Double>, format: @escaping (Double) -> String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.cubbly(14, .semibold)).foregroundStyle(.white)
                Spacer()
                Text(format(value.wrappedValue)).font(.cubbly(13, .semibold)).foregroundStyle(Theme.Colors.textSecondary)
            }
            Slider(value: value, in: range).tint(Theme.Colors.primary)
        }
    }
}
