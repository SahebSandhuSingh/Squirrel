/**
 * Photo upload service (Dev A). The same presigned flow as the Social service:
 *   POST /v1/media/uploads → PUT the bytes to upload_url → POST /v1/media/{id}/complete
 *   → the backend's moderation decides; GET /v1/media/{id} until it does.
 * Photos are resized on the device first (≤ 1600 px, JPEG) — never uploaded at full resolution —
 * and nothing is treated as visible until the backend reports it approved.
 *
 * Not live yet: every call rejects with EndpointUnavailableError('media') until the backend ships
 * (api/availability.ts). There is no simulated upload in any mode.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { campusApi } from '@/api/campus';
import type { MediaItem, MediaPurpose, UploadRequest } from '@/api/campus/types';

export const MAX_EDGE_PX = 1600;
export const THUMB_EDGE_PX = 480;
const JPEG_QUALITY = 0.8;

export type PreparedPhoto = { uri: string; thumbUri: string; width: number; height: number; bytes: number; blob: Blob; mime: 'image/jpeg' };

async function render(uri: string, w: number, h: number, edge: number, compress: number) {
  const scale = Math.min(1, edge / Math.max(w, h));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize(w >= h ? { width: Math.round(w * scale) } : { height: Math.round(h * scale) });
  const ref = await ctx.renderAsync();
  return ref.saveAsync({ format: SaveFormat.JPEG, compress });
}

/** Downscale and re-encode a picked image; returns the upload blob and a small preview. */
export async function preparePhoto(asset: { uri: string; width: number; height: number }): Promise<PreparedPhoto> {
  const full = await render(asset.uri, asset.width, asset.height, MAX_EDGE_PX, JPEG_QUALITY);
  const thumb = await render(full.uri, full.width, full.height, THUMB_EDGE_PX, 0.7);
  const blob = await (await fetch(full.uri)).blob();
  return { uri: full.uri, thumbUri: thumb.uri, width: full.width, height: full.height, bytes: blob.size, blob, mime: 'image/jpeg' };
}

/** PUT with progress (fetch can't report upload progress). */
function put(url: string, headers: Record<string, string>, body: Blob, onProgress: (f: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(body);
  });
}

export async function uploadPhoto(photo: PreparedPhoto, purpose: MediaPurpose, context: UploadRequest['context'], onProgress: (f: number) => void, signal?: AbortSignal): Promise<MediaItem> {
  const ticket = await campusApi.createUpload({ purpose, content_type: photo.mime, byte_size: photo.bytes, context });
  await put(ticket.upload_url, ticket.headers, photo.blob, onProgress, signal);
  return campusApi.completeUpload(ticket.media_id);
}

export const getMedia = (mediaId: string) => campusApi.media(mediaId);

/** Poll moderation with backoff until approved/rejected or the budget runs out (then: still processing). */
export async function waitForModeration(mediaId: string, signal?: AbortSignal, budgetMs = 60_000): Promise<MediaItem> {
  const t0 = Date.now();
  let wait = 1000;
  let last = await getMedia(mediaId);
  while (!signal?.aborted && last.moderation !== 'approved' && last.moderation !== 'rejected' && Date.now() - t0 < budgetMs) {
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(5000, wait * 1.6);
    last = await getMedia(mediaId);
  }
  return last;
}

export const isVisible = (m: MediaItem | null | undefined) => !!m && m.status === 'ready' && m.moderation === 'approved';
