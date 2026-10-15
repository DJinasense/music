import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, BUCKET } from './_lib/r2.js';
import { verify } from './_lib/auth.js';

export default async function handler(req, res) {
  const payload = verify(req.query.t);
  if (!payload?.p?.startsWith('covers/')) return res.status(403).end();

  const client = getR2Client();
  try {
    const s3Res = await client.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: payload.p,
    }));

    res.setHeader('Content-Type', s3Res.ContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    if (s3Res.Body.pipe) {
      s3Res.Body.pipe(res);
    } else if (s3Res.Body.transformToWebStream) {
      Readable.fromWeb(s3Res.Body.transformToWebStream()).pipe(res);
    } else {
      Readable.from(s3Res.Body).pipe(res);
    }
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).end();
    }
    console.error('Cover fetch error:', err);
    return res.status(404).end();
  }
}
