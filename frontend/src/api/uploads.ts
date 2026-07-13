import { supabase } from '@/lib/supabaseClient';

export interface UploadResult {
  url: string;
  mediaType: 'image';
}

const BUCKET = 'uploads';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_BYTES = 5 * 1024 * 1024;

// Ports backend/src/services/uploads.service.ts + uploads.controller.ts. The
// old Express endpoint proxied a multipart POST through multer to local
// disk; Storage lets the browser upload directly, so this replaces the
// fetch('/api/uploads', ...) call entirely rather than adding a new Edge
// Function hop. RLS (20260713000000_uploads_storage_bucket.sql) enforces
// that a user can only write into their own `<uid>/` prefix.
export async function uploadImage(file: File): Promise<UploadResult> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Only JPEG, PNG, WebP, or GIF images.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Image too large. Max 5 MB.');
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error('Not authenticated');

  const ext = EXT_BY_MIME[file.type] ?? '.bin';
  const path = `${userData.user.id}/${crypto.randomUUID()}${ext}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: publicUrl.publicUrl, mediaType: 'image' };
}
