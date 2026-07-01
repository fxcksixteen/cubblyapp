I’ll fix this cleanly with one source of truth in the backend and make the UI stop showing dual-currency items.

## Plan

1. **Normalize every shop item to exactly one purchase currency**
   - Coin-only items: keep `price`, clear `price_gems`, ensure `gems_only` is false/missing.
   - Gem-only items: set `price = 0`, set `price_gems`, ensure `gems_only = true`.
   - No item will be directly buyable with both coins and gems.

2. **Reprice the whole catalog into sane tiers**
   - **Coins-only:** static name colors, regular gradients, regular badges, classic/static themes, non-premium animated themes.
   - **Gems-only:** premium themes and motion gradient name colors.
   - Premium animated themes will no longer sit at cheap/flat accidental prices.
   - Motion name colors will be priced relative to Bow being a premium 1,500-gem item, with higher-quality effects above that where appropriate.

3. **Add the two new motion gradient name colors**
   - **Cotton Candy:** light baby pink + light baby blue + white animated sweep.
   - **Hello Kitty:** cute premium pink/white/red motion gradient treatment.
   - Both will be **gems-only**, because they’re motion gradient cosmetics and higher-value than normal gradients.

4. **Fix gift-only gem pricing for coin-only items**
   - Direct purchase stays coin-only.
   - When gifting a coin-only item, the backend will calculate a gem gift price from the coin price server-side.
   - The client will only display that gem gift price inside gift flows, not as a normal shop purchase option.

5. **Fix shop UI purchase buttons**
   - Coin-only cards show only a coin buy button plus gift button.
   - Gem-only cards show only a gem buy button plus gift button.
   - No normal item card will show both coin and gem purchase buttons.

6. **Fix gift item pickers**
   - Chat gift picker will include both gem-only items and coin-only items.
   - Coin-only items will show their calculated gift gem price only in the gift modal.
   - Gift cards in chat will keep displaying the actual gems paid.

7. **Verify**
   - Check the database catalog for zero dual-currency active items.
   - Check shop sorting and buttons visually.
   - Check direct purchase and gift flows use the correct currency rules.