I found two high-risk areas matching your reports:

1. The call crash is consistent with call heartbeat RPC calls being treated like normal Promises in places where the client returns a builder-like object. In the heartbeat interval paths this can throw `...rpc(...).catch is not a function`, exactly matching the crash text.
2. Chat history is currently merging call-event rows directly into the visible message timeline and only fetching 50 message rows at a time. With heavy call history, call pills can flood/interrupt the timeline and make “true message history” feel missing or incorrectly ordered.

Plan for v0.2.28 hotfix:

1. Bump release metadata
   - Update `package.json` version to `0.2.28`.
   - Update `package-lock.json` root/package version to `0.2.28` so Electron builder/publish uses the correct artifact metadata.

2. Stop the `D.rpc(...).catch is not a function` crash completely
   - Add a small safe async helper around call RPC execution in the call contexts instead of chaining `.catch()` directly on RPC results.
   - Replace all call heartbeat interval usages like `supabase.rpc(...).catch(...)` with `void safeHeartbeat(...)` / `try await ...` style.
   - Apply this in both:
     - `src/contexts/VoiceContext.tsx`
     - `src/contexts/GroupCallContext.tsx`
   - Keep existing start/accept behavior, but make RPC failures non-fatal and logged instead of crashing the UI.

3. Make call start/answer resilient so pressing call/accept cannot crash the app
   - Wrap group and 1:1 call start/accept heartbeat calls with the same safe helper.
   - Ensure `call_events` inserts are awaited or safely handled so local UI does not assume a call row exists if the insert failed.
   - Keep the outgoing/incoming signaling flow intact, but prevent uncaught Promise/builder errors from reaching the app error boundary.

4. Fix call pill history pollution in web/desktop chat threads
   - Stop letting every loaded historical call event compete with messages in the chat timeline.
   - Only render call-event pills that belong within the currently loaded message window, plus the latest genuinely ongoing/rejoinable call.
   - This preserves the current live-call/rejoin UI, but prevents old/stale call rows from taking over scrollback and hiding usable message history.
   - Use stable keys for chat timeline items instead of array indexes where call pills/dividers are interleaved, so React does not recycle the wrong rows while scrolling/paginating.

5. Tighten stale ongoing call cleanup without damaging history
   - Keep stale ongoing call sweeps, but make them best-effort and safe.
   - Do not visually demote/insert extra duplicate ongoing call pills in the chat timeline beyond the newest active one.
   - Ensure ended/missed call records remain visible only when they fall naturally in the loaded history range.

6. Verify affected flows after implementation
   - Inspect all `.rpc()` call sites in web/desktop call code to confirm no unsafe `.catch()` remains.
   - Run the project test command available in the environment, focused on catching TypeScript/runtime regressions.
   - Confirm package versions are aligned at `0.2.28`.

Expected result:
- Starting voice chat on web/desktop no longer crashes.
- Accepting an incoming call no longer crashes with `D.rpc(...).catch is not a function`.
- Chat scrollback shows real messages normally again instead of being dominated/misordered by call pills.
- Live/rejoin call pill behavior remains, but historical call pills are bounded to the actual loaded history window.
- Desktop build metadata is ready for your `BUILD_TARGET=electron` / electron-builder v0.2.28 release command.