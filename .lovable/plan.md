## Plan

Fix the call handshake so pickup cannot devolve into both clients repeatedly creating offers and leaving the caller stuck on Ringing.

## What I’ll change

1. **Make the caller/callee roles deterministic**
   - Only the original caller or the existing call host should respond to `ready-for-offer` by creating an offer.
   - The receiver who clicked Accept must not auto-promote itself into an offerer just because it receives a stray `ready-for-offer`.

2. **Stop the offer-reset loop shown in the logs**
   - Remove/guard the path where `ready-for-offer` closes the current PC and creates a fresh offer repeatedly while the call is already being accepted.
   - Deduplicate repeated `ready-for-offer` signals per call event + sender so retries re-send the same pending offer instead of tearing down the PC.

3. **Make Accept answer reliably**
   - If an offer arrives before Accept, keep it and answer it after Accept.
   - If Accept happens before the offer arrives, keep `acceptedIncomingCallRef` active and answer the next offer instead of becoming the offerer.

4. **Fix caller UI state after pickup**
   - `peer-accepted` should move the caller out of visible “Ringing” immediately, while still waiting for actual ICE to mark the call fully connected.
   - The outgoing ringing sound remains stopped on `peer-accepted` / `answer`.

5. **Patch release prep only**
   - Add a short user-facing changelog bullet for the desktop patch.
   - Do not publish/deploy the web app.

## Technical notes

- Primary file: `src/contexts/VoiceContext.tsx`.
- Likely no backend migration needed.
- The root issue in your logs is offer glare: after pickup, both sides keep receiving `ready-for-offer`, both sides generate local offers, no clean `answer` lands, and ICE stays `new`, so the caller UI never reaches connected.