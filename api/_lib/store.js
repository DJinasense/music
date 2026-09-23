import { get, put, list, BlobPreconditionFailedError } from '@vercel/blob';
import { sign } from './auth.js';

const MANIFEST = 'data/tracks.json';

export async function readManifest() {
  const result = await get(MANIFEST, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return { tracks: [], etag: null };
  const text = await new Response(result.stream).text();
  // Reads can come back with a weak ETag (W/"…") once the file is compressed in
  // transit; conditional writes only accept the strong form.
  return { tracks: JSON.parse(text), etag: result.blob.etag.replace(/^W\//, '') };
}

async function writeManifest(tracks, etag) {
  await put(MANIFEST, JSON.stringify(tracks, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    ...(etag ? { ifMatch: etag } : {}),
  });
}

// Read-modify-write with optimistic locking, so concurrent edits never clobber each other.
export async function mutateTracks(fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { tracks, etag } = await readManifest();
    const next = await fn(structuredClone(tracks));
    try {
      await writeManifest(next, etag);
      return next;
    } catch (err) {
      if (!(err instanceof BlobPreconditionFailedError)) throw err;
    }
  }
  throw new Error('Track list is busy, please retry');
}

// Shape sent to browsers: no storage paths, only short-lived signed stream links.
export function publicTrack(t) {
  const audioExp = Date.now() + 6 * 60 * 60 * 1000;
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    youtubeId: t.youtubeId || null,
    stream: `/api/stream?t=${sign({ p: t.audioPath, exp: audioExp })}`,
    cover: t.coverPath ? `/api/cover?t=${sign({ p: t.coverPath })}` : null,
  };
}

export function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Files in storage that no track points at (e.g. from an interrupted upload).
// Anything newer than `graceMs` is left alone in case an upload is still being published.
export async function storageReport(graceMs = 5 * 60 * 1000) {
  const { tracks } = await readManifest();
  const used = new Set(tracks.flatMap((t) => [t.audioPath, t.coverPath]).filter(Boolean));
  let cursor, blobs = [];
  do {
    const page = await list({ cursor, limit: 1000 });
    blobs = blobs.concat(page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const cutoff = Date.now() - graceMs;
  const orphans = blobs.filter((b) =>
    /^(audio|covers)\//.test(b.pathname) && !used.has(b.pathname) && new Date(b.uploadedAt).getTime() < cutoff);
  return {
    usedBytes: blobs.reduce((s, b) => s + b.size, 0),
    fileCount: blobs.length,
    orphans,
    orphanBytes: orphans.reduce((s, b) => s + b.size, 0),
  };
}
