

# Plan: Fix Theme Colors, Chat Scroll, GIF Alignment & Favorites

## Issues to Fix

### 1. Cubbly theme grey colors → dark brown
All hardcoded grey hex values used for hover/active states need to use CSS variables so the cubbly theme applies correctly:
- `hover:bg-[#2e3035]` (message hover in ChatView) → `hover:bg-[var(--app-hover)]`
- `bg-[#404249]` (active items in DMSidebar, AppLayout, FriendsView) → `bg-[var(--app-active)]`
- `hover:bg-[#35373c]` (hover states everywhere) → `hover:bg-[var(--app-hover)]`
- `bg-[#383a40]` (input backgrounds) → `bg-[var(--app-input)]`
- `bg-[#2b2d31]`, `bg-[#1e1f22]`, etc. in ChatView attachment areas → use CSS variables

**Files:** `ChatView.tsx`, `DMSidebar.tsx`, `AppLayout.tsx`, `FriendsView.tsx`, `ProfilePopup.tsx`, `SearchBar.tsx`, `GifPicker.tsx`

### 2. Chat scroll during voice call
The auto-scroll `useEffect` on line 85-87 of ChatView fires on every `conversationCallEvents` change, and `audioLevel` updates in VoiceContext cause re-renders that lock scrolling. Fix:
- Remove `conversationCallEvents` from the scroll dependency array
- Only auto-scroll on new messages (track message count), not on every render
- Use a `userHasScrolledUp` flag — skip auto-scroll if user scrolled away from bottom

### 3. GIF button alignment
The GIF icon (`h-6 w-6`) is slightly taller than the send button (`h-5 w-5`). Fix by making them consistent and adding `flex items-center` alignment to both button wrappers.

### 4. GIF Favorites System
- Create a new `gif_favorites` database table: `id`, `user_id`, `gif_id`, `gif_url`, `gif_preview_url`, `title`, `created_at`
- Add RLS policies for authenticated users to manage their own favorites
- Add a "Favorites" category tab (first position) in GifPicker
- On hover over any GIF, show a heart/star button in the upper-right corner
- Clicking it toggles favorite status (insert/delete from `gif_favorites`)
- When "Favorites" tab is active, fetch from the database instead of Giphy API

**New table migration:**
```sql
CREATE TABLE public.gif_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gif_id text NOT NULL,
  gif_url text NOT NULL,
  gif_preview_url text NOT NULL,
  title text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, gif_id)
);
ALTER TABLE public.gif_favorites ENABLE ROW LEVEL SECURITY;
-- Users can manage their own favorites
CREATE POLICY "Users can view own favorites" ON public.gif_favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can add favorites" ON public.gif_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove favorites" ON public.gif_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

## Files Changed
- `src/components/app/ChatView.tsx` — theme vars, scroll fix, GIF button alignment
- `src/components/app/GifPicker.tsx` — favorites tab, hover favorite button, theme vars
- `src/components/app/DMSidebar.tsx` — theme vars
- `src/components/app/FriendsView.tsx` — theme vars
- `src/components/app/ProfilePopup.tsx` — theme vars
- `src/components/app/SearchBar.tsx` — theme vars
- `src/pages/AppLayout.tsx` — theme vars
- DB migration for `gif_favorites` table

