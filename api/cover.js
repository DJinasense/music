import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { verify } from './_lib/auth.js';

export default async function handler(req, res) {
  const payload = verify(req.query.t);
  if (!payload?.p?.startsWith('covers/')) return res.status(403).end();

  const blob = await get(payload.p, { access: 'private' }).catch(() => null);
  if (!blob || blob.statusCode !== 200) return res.status(404).end();

  res.setHeader('Content-Type', blob.blob.contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  Readable.fromWeb(blob.stream).pipe(res);
}
