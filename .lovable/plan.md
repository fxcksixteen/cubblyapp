I’ll undo the bad UI behavior and fix the recovered-file path directly.

Plan:
1. Restore Insert button visibility so it only appears for attachments whose metadata says they are an image, video, or PDF.
2. Tighten `insertExistingAttIntoBody` so it only inserts confirmed images/videos/PDFs; unknown files will not be inserted as generic attachment links.
3. Keep the data-layer byte sniffing in `NotesContext.tsx`, but improve it where needed so recovered encrypted/raw attachments get classified as image/video/PDF and renamed with the correct extension before the attachment strip renders.
4. Ensure downloads use the corrected filename and MIME, so recovered images no longer download as a generic `file` when they are recognized.
5. Verify the UI logic by checking the attachment strip code: media/PDF attachments show Insert, non-media files only show Download/Delete.

Technical details:
- `NotesView.tsx` should render `<InlineAttachment>` with Insert only when `isInsertableAtt(att)` is true.
- The generic attachment row should show `Uninsert` only for already-inlined attachments, otherwise no Insert button.
- `insertExistingAttIntoBody` should fail with a toast if sniffing still cannot confirm image/video/PDF, instead of adding an inline generic link.
- `NotesContext.tsx` remains the source of truth for recovered attachment metadata classification.