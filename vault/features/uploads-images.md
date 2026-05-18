---
slug: uploads-images
title: Image uploads for announcements (and future avatars)
owner: engineering
collaborators: [design]
status: shipped
priority: P1
created: 2026-05-18
target: 2026-05-18
links:
  kanban: "[[kanban/engineering]]"
---

# Image uploads

Closes the last Phase 2 gap and unlocks announcement images. One backend endpoint, one frontend picker, integrated into the existing announcement composer. Family avatars and DM attachments are deferred.

## Acceptance criteria

- [x] `POST /api/uploads` accepts multipart image upload (JPEG / PNG / WebP / GIF), max 5 MB.
- [x] Returns `{ url, mediaType: 'image' }`.
- [x] Uploaded files are served at `/uploads/<filename>` (static).
- [x] AnnouncementComposer has a "Add image" affordance; on upload the post is submitted with `mediaUrl` set.
- [x] AnnouncementCard renders an image when `mediaUrl + mediaType === 'image'`.
- [x] Auth required; rate-limited by the existing global limiter.
- [x] Tests: backend rejects non-image MIME with 400; rejects > 5 MB with 413; happy path returns a working URL. Frontend smoke: composer fires the upload then the create call.

---

## Engineering — Acceptance

### Backend

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/api/uploads` | multipart `file` | 201 `{ url, mediaType }` |

- Multer disk storage in `backend/uploads/` (gitignored).
- Filename: `<crypto.randomUUID()>.<ext>`.
- Static: `app.use('/uploads', express.static('uploads'))`.
- Mime allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Size limit: 5 MB.
- Auth: behind the same `authenticate` middleware as the rest of /api.

### Frontend

- `api/uploads.ts` — `uploadImage(file: File): Promise<{ url; mediaType: 'image' }>` (FormData fetch; reads JWT from auth store).
- `features/feed/components/ImagePicker.tsx` — file `<input>` styled as a pill; calls `uploadImage`, returns the URL via callback.
- `AnnouncementComposer.tsx` (patch) — adds the picker; if an image is attached, includes `mediaUrl` + `mediaType: 'image'` in the create payload.
- `AnnouncementCard.tsx` (patch) — when mediaUrl + mediaType==='image', renders an `<img>` with `alt=""` (decorative; consider future a11y pass to caption).

### Test plan

Backend (`tests/uploads.test.ts`):
- happy path: upload a 1×1 PNG, get 201 + URL, GET the URL returns 200 with correct content-type.
- wrong mime: upload `text/plain` → 400.
- too big: upload a 6 MB blob → 413.
- unauth: no JWT → 401.

Frontend (existing AnnouncementComposer.test.tsx augmented or sibling):
- selecting an image fires the upload, then the create-announcement call carries `mediaUrl`.

---

## Design — Spec

Picker is a pill button labelled "Add image" that opens the OS file picker. Once an image is attached, show a small thumbnail above the textarea with an X to remove. Same brand-primary pill on the upload action.

---

*Shipped 2026-05-18.*
