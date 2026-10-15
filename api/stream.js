import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, BUCKET } from './_lib/r2.js';
import { verify } from './_lib/auth.js';

// Serve audio in capped byte ranges. Browsers' audio players request more as
// they go, but opening the link directly only ever yields a small fragment.
const CHUNK = 2 * 1024 * 1024;

export default async function handler(req, res) {
  const payload = verify(req.query.t);
  if (!payload?.p?.startsWith('audio/')) return res.status(403).end('Link expired');

  // Block opening the stream in a tab / "Save link as" (navigations, not media loads)
  if (req.headers['sec-fetch-dest'] === 'document') return res.status(403).end('Streaming only');

  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const start = m && m[1] ? parseInt(m[1], 10) : 0;
  const wanted = m && m[2] ? parseInt(m[2], 10) : Infinity;
  const end = Math.min(wanted, start + CHUNK - 1);

  const client = getR2Client();

  try {
    const s3Res = await client.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: payload.p,
      Range: `bytes=${start}-${end}`,
    }));

    res.statusCode = s3Res.ContentRange ? 206 : 200;
    res.setHeader('Content-Type', s3Res.ContentType || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    if (s3Res.ContentRange) res.setHeader('Content-Range', s3Res.ContentRange);
    if (s3Res.ContentLength) res.setHeader('Content-Length', s3Res.ContentLength);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (s3Res.Body.pipe) {
      s3Res.Body.pipe(res);
    } else if (s3Res.Body.transformToWebStream) {
      Readable.fromWeb(s3Res.Body.transformToWebStream()).pipe(res);
    } else {
      Readable.from(s3Res.Body).pipe(res);
    }
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 416 || err.name === 'InvalidRange') {
      return res.status(416).end();
    }
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).end();
    }
    console.error('Audio stream error:', err);
    return res.status(502).end();
  }
}
