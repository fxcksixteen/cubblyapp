Plan:

1. Move recovered-file classification into the notes data flow
   - Add byte-signature MIME detection in `NotesContext.tsx`, where the encrypted attachment bytes can be downloaded/decrypted with the current vault key.
   - When `listRecoverableAttachmentsForNote(noteId)` returns recovered files, it will classify each recovered object before the UI receives it.
   - This avoids relying on the attachment strip rendering first and then hoping a later effect updates it.

2. Classify existing generic attachments on note load
   - During note normalization/decryption, detect attachments with generic MIME/name values like `application/octet-stream`, `Attachment abc123`, or no extension.
   - For those, download/decrypt the file, sniff the actual bytes, and update the attachment object to `image/png`, `image/jpeg`, `image/webp`, `video/mp4`, `application/pdf`, etc.
   - Add the correct file extension to the display/download name when missing.

3. Make Insert button logic depend on classified metadata only
   - Keep Insert buttons limited to images, videos, and PDFs.
   - Remove the delayed UI-only classification path as the main source of truth.
   - If a file is still truly unknown after sniffing, it remains a normal downloadable attachment with no Insert button.

4. Persist the correction back into the encrypted note
   - Once a recovered attachment is classified, save the updated attachment metadata in the note’s encrypted payload.
   - This makes the fix permanent so the same files don’t show up as generic `file` again after refresh.

5. Preserve the security fix
   - Keep recovery scoped to the current signed-in user and the current note only.
   - Do not reintroduce the old global attachment listing behavior that showed files across notes.