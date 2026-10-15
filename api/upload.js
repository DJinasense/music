import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, BUCKET } from './_lib/r2.js';
import { isAdmin } from './_lib/auth.js';

// Issues short-lived presigned S3/R2 PUT URLs so the admin browser uploads
// files directly to Cloudflare R2 (no 4.5 MB serverless body limits).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not signed in' });

  const { filename, contentType, type } = req.body || {};
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const prefix = type === 'cover' ? 'covers' : 'audio';
  const cleanExt = (filename.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanBase = filename.slice(0, filename.lastIndexOf('.') > 0 ? filename.lastIndexOf('.') : undefined)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'file';

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const key = `${prefix}/${cleanBase}-${Date.now().toString(36)}-${randomSuffix}${cleanExt ? '.' + cleanExt : ''}`;

  try {
    const client = getR2Client();
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType || (type === 'cover' ? 'image/jpeg' : 'audio/mpeg'),
    });

    // 15-minute upload window for direct client-to-R2 upload
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });

    return res.status(200).json({
      uploadUrl,
      pathname: key,
    });
  } catch (err) {
    console.error('R2 Presign Error:', err);
    return res.status(500).json({ error: err.message || 'Could not generate upload URL' });
  }
}
