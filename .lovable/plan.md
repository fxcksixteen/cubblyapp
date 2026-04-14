
Goal: fix the hero CTA layout so the version text sits directly under the Download button only, while the Download and Open in Browser buttons stay aligned on the same row/level.

Plan:
1. Update `src/components/HeroSection.tsx` CTA structure.
   - Keep the two main buttons inside one shared horizontal desktop layout.
   - Wrap only the Download button in its own small vertical container with the version text beneath it.
   - Leave the Open in Browser button as a separate sibling, not grouped with the version text.

2. Align the buttons properly.
   - Use a layout that aligns the top of both button elements so they stay visually level.
   - Avoid centering the whole CTA group in a way that causes the Download button to shift upward relative to the browser button.

3. Preserve responsive behavior.
   - On larger screens: buttons remain side by side, version stays under Download only.
   - On smaller screens: stack cleanly without losing the “version belongs to Download” relationship.

Technical details:
- Current problem: the version text is outside the individual Download button column, so it ends up centered under both CTAs.
- Intended structure:
```text
CTA row
├─ Download column
│  ├─ Download button
│  └─ Version text
└─ Open in Browser button
```
- Likely implementation:
  - outer wrapper: horizontal flex/grid on `sm+`
  - download wrapper: `flex flex-col items-center gap-1.5`
  - browser button: sibling with `self-start` or equivalent so both button tops align

Expected result:
- Version text appears directly under only the Download button.
- Download and Open in Browser stay on the same visual level.
- No change to the rest of the hero content styling unless needed for spacing polish.
