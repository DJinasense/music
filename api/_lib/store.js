import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getR2Client, BUCKET } from './r2.js';
import { sign } from './auth.js';

const MANIFEST = 'data/tracks.json';

export async function readManifest() {
  const r2 = getR2Client();
  try {
    const res = await r2.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: MANIFEST,
    }));
    const text = await res.Body.transformToString();
    return { tracks: JSON.parse(text), etag: res.ETag ? res.ETag.replace(/"/g, '') : null };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return { tracks: [], etag: null };
    }
    console.error('Error reading manifest from R2:', err);
    return { tracks: [], etag: null };
  }
}

async function writeManifest(tracks) {
  const r2 = getR2Client();
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: MANIFEST,
    Body: JSON.stringify(tracks, null, 2),
    ContentType: 'application/json',
  }));
}

export async function mutateTracks(fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { tracks } = await readManifest();
    const next = await fn(structuredClone(tracks));
    try {
      await writeManifest(next);
      return next;
    } catch (err) {
      console.error('Error mutating tracks:', err);
      if (attempt === 3) throw err;
    }
  }
  throw new Error('Track list is busy, please retry');
}

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

export async function storageReport(graceMs = 5 * 60 * 1000) {
  const { tracks } = await readManifest();
  const used = new Set(tracks.flatMap((t) => [t.audioPath, t.coverPath]).filter(Boolean));
  const r2 = getR2Client();

  let isTruncated = true;
  let continuationToken = undefined;
  let allObjects = [];

  while (isTruncated) {
    const res = await r2.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
    }));
    if (res.Contents) {
      allObjects = allObjects.concat(res.Contents);
    }
    isTruncated = res.IsTruncated;
    continuationToken = res.NextContinuationToken;
  }

  const cutoff = Date.now() - graceMs;
  const orphans = allObjects.filter((b) =>
    /^(audio|covers)\//.test(b.Key) &&
    !used.has(b.Key) &&
    new Date(b.LastModified).getTime() < cutoff
  ).map(b => ({ pathname: b.Key, size: b.Size }));

  return {
    usedBytes: allObjects.reduce((s, b) => s + (b.Size || 0), 0),
    fileCount: allObjects.length,
    orphans,
    orphanBytes: orphans.reduce((s, b) => s + (b.size || 0), 0),
  };
}
