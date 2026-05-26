## Plan

1. **Put theme backgrounds behind the app for real**
   - Change the Space/Sky/Snowy/Hills fixed background layers to a negative z-index and ensure the root app surface creates the safe stacking context.
   - This keeps stars/clouds/snow visually behind the app instead of competing with modals and sidebars.

2. **Stop inline modals from inheriting broken app/sidebar stacking**
   - Move custom popups like **SettingsModal** and **CreateServerModal** into a React portal mounted to `document.body`.
   - This prevents them from being clipped or squeezed by the left sidebar / app layout containers.

3. **Raise popup layers consistently**
   - Give app popups a dedicated high z-index layer above theme backgrounds and app chrome.
   - Keep Radix dialogs, popovers, context menus, tooltips, and the custom settings/create-server modals on that layer.

4. **Verify against the reported screenshots**
   - Check the Settings popup opens centered/full size over Space theme.
   - Check the plus server popup opens centered and readable, not trapped in the server rail.
   - Confirm the Space background remains visible behind the app but no longer covers or distorts UI.