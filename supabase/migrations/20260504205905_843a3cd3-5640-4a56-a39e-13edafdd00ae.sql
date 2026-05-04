
-- Per-user key material (for PIN-derived AES key)
CREATE TABLE public.notes_keys (
  user_id uuid PRIMARY KEY,
  salt text NOT NULL,                   -- base64 random salt (>=16 bytes)
  verifier_iv text NOT NULL,            -- base64 IV used for the verifier
  verifier_ciphertext text NOT NULL,    -- AES-GCM(known plaintext) — proves PIN
  kdf text NOT NULL DEFAULT 'pbkdf2-sha256',
  iterations integer NOT NULL DEFAULT 250000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notes_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notes key" ON public.notes_keys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notes key" ON public.notes_keys
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notes key" ON public.notes_keys
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notes key" ON public.notes_keys
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_notes_keys_updated
  BEFORE UPDATE ON public.notes_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Encrypted notes (title + body + attachments live inside the ciphertext)
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  iv text NOT NULL,                     -- base64 12-byte AES-GCM IV
  ciphertext text NOT NULL,             -- base64 ciphertext of JSON {title, html, attachments:[{path,iv,name,size,type}]}
  byte_size integer NOT NULL DEFAULT 0, -- approximate plaintext length (encrypted on client)
  pinned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notes_user_updated ON public.notes(user_id, updated_at DESC);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notes" ON public.notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notes" ON public.notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notes" ON public.notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notes" ON public.notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_notes_updated
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Private storage bucket for encrypted attachments. Files live under {user_id}/{uuid}.bin
INSERT INTO storage.buckets (id, name, public) VALUES ('notes-attachments', 'notes-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Notes attachments — users read own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'notes-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Notes attachments — users upload own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'notes-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Notes attachments — users update own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'notes-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Notes attachments — users delete own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'notes-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
