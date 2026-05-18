import { useAuthStore } from '@/stores/auth';

export interface UploadResult {
  url: string;
  mediaType: 'image';
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', headers, body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as UploadResult;
}
