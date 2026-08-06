import SwiftUI

/// iOS-appropriate subset of the desktop "Voice & Video" settings screen:
/// output route (speaker vs. natural), input/output volume sliders, AEC and
/// noise-suppression toggles. Persisted via `CallSettings.shared` and applied
/// to the live call where possible.
struct VoiceVideoSettingsView: View {
    @ObservedObject var settings = CallSettings.shared
    @StateObject private var micTest = MicTestEngine()
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

                        micTestSection
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
            .onDisappear { micTest.stopAll() }
        }
    }

    /// Discord-style "Let's Check" mic test: record up to 10s, watch a live
    /// level meter, then play it back.
    @ViewBuilder
    private var micTestSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("MIC TEST")
                .font(.cubbly(11, .bold))
                .foregroundStyle(Theme.Colors.textSecondary)
                .padding(.top, 8)

            Text("Hear what you sound like before you call. Records for up to 10 seconds, then plays it back.")
                .font(.cubbly(12, .regular))
                .foregroundStyle(Theme.Colors.textSecondary)

            // Level meter (always visible; lights up while recording)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.Colors.bgTertiary)
                    Capsule()
                        .fill(LinearGradient(colors: [.green, .yellow, .red],
                                             startPoint: .leading, endPoint: .trailing))
                        .frame(width: geo.size.width * CGFloat(micTest.level))
                        .animation(.linear(duration: 0.08), value: micTest.level)
                }
            }
            .frame(height: 10)

            HStack(spacing: 10) {
                switch micTest.phase {
                case .idle:
                    micButton(label: "Test Mic", icon: "mic.fill", tint: Theme.Colors.primary) {
                        micTest.startRecording()
                    }
                case .recording:
                    micButton(label: "Stop (\(Int(10 - micTest.elapsed))s)", icon: "stop.fill", tint: .red) {
                        micTest.stopRecording()
                    }
                case .recorded:
                    micButton(label: "Play", icon: "play.fill", tint: .green) {
                        micTest.playRecording()
                    }
                    micButton(label: "Re-record", icon: "arrow.clockwise", tint: Theme.Colors.primary) {
                        micTest.startRecording()
                    }
                case .playing:
                    micButton(label: "Stop", icon: "stop.fill", tint: .red) {
                        micTest.stopPlayback()
                    }
                }
            }
        }
    }

    private func micButton(label: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 13, weight: .bold))
                Text(label).font(.cubbly(13, .semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Capsule().fill(tint))
        }
        .buttonStyle(.plain)
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
