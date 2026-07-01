Plan:

1. **Undo the bad currency conversion for motion gradient names**
   - Keep normal shop items single-currency only.
   - Restore the older motion gradients that were coin-priced back to coins instead of gems:
     - Aurora, Rainbow, Galaxy, Inferno, Glacier, Emerald Wave.
   - Keep the newer premium motion gradients as gem-only, but lower the non-icon ones back into a reasonable range instead of the inflated 900–1000+ range.
   - Set the two top icon/name motion items exactly as requested:
     - **Bow: 1,200 gems**
     - **Hello Kitty: 1,500 gems**

2. **Restore wiped owned shop items**
   - Reinsert missing inventory rows from real purchase history so users get back items they paid coins/gems for.
   - This specifically fixes items removed by the previous cleanup, including bought animated themes/name colors like Space, Sky Dusk, Snowy Drift, Moonlit Hills, Aurora, and Glacier.
   - Do this as a safe backend data repair: only add missing ownership where there is an existing purchase/gift record; don’t delete anything.

3. **Stop the same inventory-loss mistake from happening again**
   - Leave Honey perks as “not free shop cosmetics,” but don’t use any cleanup that removes items someone actually bought with coins.
   - Make equip logic continue requiring ownership only, not Honey.

4. **Tilt the Hello Kitty icon like Bow**
   - Update the rendered Hello Kitty PNG transform in both real display names and shop previews so it has the same tilted/placed feel as the Bow icon.

5. **Verify after implementation**
   - Query the backend catalog to confirm motion gradient currencies/prices are correct.
   - Query your inventory repair to confirm missing purchased items are restored.
   - Check the shop code path still shows active items and uses coins vs gems correctly.