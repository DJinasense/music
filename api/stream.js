import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
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

  let blob;
  try {
    blob = await get(payload.p, { access: 'private', headers: { range: `bytes=${start}-${end}` } });
  } catch (err) {
    if (/416/.test(err.message)) return res.status(416).end();
    console.error(err);
    return res.status(502).end();
  }
  if (!blob) return res.status(404).end();

  const h = blob.headers;
  res.statusCode = h.get('content-range') ? 206 : 200;
  res.setHeader('Content-Type', blob.blob.contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  if (h.get('content-range')) res.setHeader('Content-Range', h.get('content-range'));
  if (h.get('content-length')) res.setHeader('Content-Length', h.get('content-length'));
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  Readable.fromWeb(blob.stream).pipe(res);
}
