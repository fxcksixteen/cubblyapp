# Make Ultra Actually Ultra

Right now Ultra is the default for every user but under the hood it behaves the same as Clarity — same bitrate ladder, same encoder settings, only `contentHint = "detail"` and `maintain-resolution` degradation. So "Ultra" is a label, not a real quality tier.

This plan makes Ultra the objectively best screenshare mode, so the default experience for everyone is the highest quality Cubbly can deliver, while Clarity and Motion remain the specialized alternatives for text or fast motion.

## What changes

**1. Ultra gets its own bitrate ladder (~30% above Discord parity)**
`VoiceContext.tsx` `resBitrateBase`:

| Res    | Clarity/Motion (now) | Ultra (new)          |
|--------|----------------------|-----------------------|
| 480p   | 1.0 Mbps             | 1.5 Mbps              |
| 720p30 | 2.5 Mbps             | 3.5 Mbps              |
| 720p60 | 3.0 Mbps             | 4.5 Mbps              |
| 1080p30| 4.5 Mbps             | 6.0 Mbps              |
| 1080p60| 7.5 Mbps             | 10 Mbps               |
| 1440p30| 8.0 Mbps             | 11 Mbps               |
| 1440p60| 12 Mbps              | 16 Mbps               |

**2. Ultra uses VP9 temporal scalability (`L1T3`)**
Adds `scalabilityMode: "L1T3"` on the sender encoding when the negotiated codec is VP9/AV1. Under packet loss, the decoder drops the enhancement layer instead of the whole frame — so framerate stays stable without the picture turning to mush. Clarity/Motion stay on single-layer.

**3. Ultra degradation = `balanced`**
Instead of "maintain-resolution" (Clarity) or "maintain-framerate" (Motion), Ultra sets `degradationPreference = "balanced"` so WebRTC trades res *and* fps proportionally when the network dips — which is what actually looks best for mixed content.

**4. Ultra keeps `contentHint = "detail"`**
Same as today (sharpness-biased), but combined with the higher bitrate + temporal layers it no longer needs to sacrifice framerate.

**5. Adaptive-bitrate floor raised for Ultra**
The adaptive loop (v0.4.4) drops as low as 40% of the ceiling. For Ultra we raise the floor to 60%, so even under sustained loss Ultra never falls below Clarity-tier bandwidth. Ceiling recovery step also bumped from 15% to 20%.

**6. Opus audio stays 256 kbps stereo for all presets** (already correct).

**7. Settings copy updated**
`VoiceVideoSettings.tsx`: Ultra description becomes "Maximum quality — higher bitrate, VP9 temporal layers, best possible picture. Recommended for everyone." Keep the "Rec." badge.

**8. Changelog**
One-line v0.4.4 bullet: "Ultra screenshare preset is now the true top tier — higher bitrate ceiling and VP9 temporal layers for a sharper, smoother picture under any network."

## Files touched

- `src/contexts/VoiceContext.tsx` — bitrate table branch on `opt === "ultra"`, `scalabilityMode` in `applyScreenBitrate`, `degradationPreference` branch, adaptive-loop floor/step branch
- `src/components/app/settings/VoiceVideoSettings.tsx` — Ultra description
- `src/lib/changelog.ts` — one bullet

No version bump, no backend changes, no new dependencies.
