Plan to fix the personal notes image moving system:

1. Replace the current native HTML image drag behavior with a custom pointer-based move system
   - Holding on an inline note image will start a real move interaction.
   - The image will follow the pointer visually while dragging.
   - This avoids browser/contenteditable native drag bugs that make images duplicate, refuse to move, or drop in the wrong place.

2. Add accurate drop placement inside the note body
   - While dragging, calculate the caret/drop position under the pointer using `caretRangeFromPoint` / `caretPositionFromPoint`.
   - Dropping above text inserts the image before that text.
   - Dropping under text inserts it after that text.
   - Dropping next to text inserts it at that inline caret position where possible.
   - Dropping in empty note space appends it cleanly at the nearest valid position.

3. Make inline images behave like movable note objects
   - Images already inside the note will be movable, not copied.
   - Dragging one image will remove it from its old position and insert it at the new position.
   - The note body HTML will update immediately after the move so autosave persists the new layout.

4. Preserve attachment encryption and reload persistence
   - Keep using `data-att-id` references instead of saving blob URLs.
   - Keep hydration on note load so moved images still reappear correctly after refresh, desktop restart, or switching notes.
   - Keep non-image attachments in the normal attachment strip.

5. Polish interaction behavior
   - Add a visible insertion marker while dragging so the user can see where the image will land.
   - Prevent accidental text selection while dragging an image.
   - Keep normal typing, pasting, attaching, deleting, and formatting behavior intact.

Technical details:
- Main file: `src/components/app/NotesView.tsx`.
- The current `draggable=true` + `onDrop` implementation will be replaced for inline images because native drag inside `contenteditable` is unreliable.
- New logic will use pointer events on inline media elements, a temporary drag ghost, a drop marker, and direct DOM node movement followed by `setBody(bodyRef.current.innerHTML)` and `dirty.current = true`.