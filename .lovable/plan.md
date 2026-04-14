

## Plan: Fix Multiple UI/UX Issues

### Issues to Address

1. **Cubbly logo in far-left sidebar** — Currently showing the square logo inside a circle. Need to use the logo as the circle itself (clip it to a circle, no background container showing).

2. **Bigger mic/deafen/settings icons** — Currently 18px, increase to ~20-22px with larger tap targets.

3. **Messages SVG icon on friend hover** — The "Message" button in FriendsView uses `MessageSquare` from lucide-react. Replace with the custom `messages.svg` icon.

4. **Sending messages doesn't work** — The RLS policy requires `auth.uid() = sender_id` AND the user must be a participant. Need to debug: likely the insert is failing silently or the error isn't surfaced. Will add proper error logging and check if the conversation_participants entry exists for the current user.

5. **Upload file icon lag** — The `folderFileIcon` SVG in the attach menu isn't preloaded. Add it to the preload list (already done for mic/headphone icons in DMSidebar but not for ChatView).

6. **Search bar too small** — Increase height from `h-7` to `h-9`, increase font size, make it more prominent.

7. **Chat page header showing friend tabs** — The `renderHeader()` in AppLayout shows friend tabs for ALL non-DM views. When on a chat route, it shows `@username` but the issue is the header still renders friend tabs when it shouldn't. Fix: the DM header should show the recipient's avatar, status indicator, display name, and call/video buttons on the right.

8. **Chat header for DM conversations** — Add recipient profile picture + status dot + display name on left, and call + video call buttons on the far right.

### Technical Changes

**`src/components/app/ServerSidebar.tsx`**
- Change the home button to use `object-cover` + `rounded-full` directly on the image, remove the container background so the logo IS the circle.

**`src/components/app/DMSidebar.tsx`**
- Increase icon sizes from `h-[18px] w-[18px]` to `h-5 w-5` (20px)
- Increase button padding from `p-1.5` to `p-2`

**`src/components/app/FriendsView.tsx`**
- Replace `MessageSquare` lucide icon with the custom `messages.svg` for the DM button on friend hover

**`src/hooks/useMessages.ts`**
- Add `console.error` on insert failure to debug
- Ensure the error from supabase insert is properly logged

**`src/components/app/ChatView.tsx`**
- Preload `folderFileIcon` at module level (same pattern as DMSidebar)
- Add error logging for send failures

**`src/components/app/SearchBar.tsx`**
- Increase height from `h-7` to `h-9`
- Increase text from `text-xs` to `text-sm`
- Make icon slightly larger

**`src/pages/AppLayout.tsx`**
- Update `renderHeader()` for DM views: show avatar circle + status dot + display name on left, Phone and Video icons on far right
- Import `Phone`, `Video` from lucide-react

### Files Modified
- `src/components/app/ServerSidebar.tsx`
- `src/components/app/DMSidebar.tsx`
- `src/components/app/FriendsView.tsx`
- `src/components/app/ChatView.tsx`
- `src/components/app/SearchBar.tsx`
- `src/hooks/useMessages.ts`
- `src/pages/AppLayout.tsx`

