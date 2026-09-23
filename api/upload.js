import { handleUpload } from '@vercel/blob/client';
import { isAdmin } from './_lib/auth.js';

// Issues short-lived tokens so the admin browser uploads files straight to
// private Blob storage (no 4.5 MB serverless body limit).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not signed in' });

  try {
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname) => {
        if (/^audio\/[^/]+$/.test(pathname)) {
          return {
            allowedContentTypes: ['audio/*'],
            maximumSizeInBytes: 500 * 1024 * 1024,
            addRandomSuffix: true,
          };
        }
        if (/^covers\/[^/]+$/.test(pathname)) {
          return {
            allowedContentTypes: ['image/*'],
            maximumSizeInBytes: 20 * 1024 * 1024,
            addRandomSuffix: true,
          };
        }
        throw new Error('Invalid upload path');
      },
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
}
