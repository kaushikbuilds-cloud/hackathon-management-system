-- =============================================================================
-- Storage buckets. All objects are read/written by the Next.js server with the
-- service role after permission checks; private files are served through
-- short-lived signed URLs. No storage.objects policies are granted to clients.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('branding',            'branding',            true,  2097152,  array['image/png', 'image/jpeg']),
  ('participant-photos',  'participant-photos',  false, 2097152,  array['image/png', 'image/jpeg']),
  ('id-cards',            'id-cards',            false, 52428800, array['application/pdf']),
  ('support-attachments', 'support-attachments', false, 5242880,  array['image/png', 'image/jpeg', 'application/pdf', 'text/plain'])
on conflict (id) do nothing;
