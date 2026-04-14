
-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Users can upload chat attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

-- Allow anyone to view chat attachments (public bucket)
CREATE POLICY "Chat attachments are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-attachments');
