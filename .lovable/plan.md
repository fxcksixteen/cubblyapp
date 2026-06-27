## Root cause

v0.3.21 added a Low-Power Mode style block in `src/index.css` that does:

```css
html.cubbly-low-power *, *::before, *::after {
  filter: none !important;
}
```

The whole icon system (sidebar items, message composer +/GIF/send, voice/headphone/settings in the user panel, context-menu entries, status indicators) ships black-fill SVGs that are rendered as `<img>` and recolored with Tailwind's `invert` utility (which compiles to `filter: invert(...)`). The blanket `filter: none !important` wipes that out, so every icon renders as its raw black-on-dark source — exactly what the screenshots show.

It's not just icons either: anything relying on a CSS `filter` for color (e.g. the red `remove-user` / `block-user` hue-rotate filter in DM menus, certain badge tints) collapses to black under low-power. This is silently active for any user with Hardware Acceleration disabled in v0.3.21.

## Fix for v0.3.22

Scope the low-power filter reset so it only strips decorative blurs/glows, never icon recoloring:

1. In `src/index.css`, replace the universal `filter: none !important` rule with one that excludes `img` and `svg` elements (and anything explicitly opted in via a `cubbly-keep-filter` escape hatch, matching the existing `cubbly-keep-shadow` pattern).
2. Keep `backdrop-filter: none !important` — that one is safe and is what actually buys the FPS.
3. Leave `box-shadow`, transition, and animation rules unchanged.

No component code changes needed; the icons themselves are fine.

## Verification

- With HA off (low-power class active): sidebar Friends/Notes/Shop icons, composer +/GIF/send, mic/headphone/settings, status dots, and red destructive menu icons all render in their normal colors.
- With HA on: no visual change vs. v0.3.21.
- Build typechecks; no other files touched.

## Changelog (v0.3.22)

- Fixed icons appearing black/invisible when Hardware Acceleration is off.

No version bump or other behavior changes in this patch.