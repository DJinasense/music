import { isAdmin } from './_lib/auth.js';
import { storageReport } from './_lib/store.js';
import { deleteObjects } from './_lib/r2.js';

const LIMIT_BYTES = 10 * 1024 ** 3; // Cloudflare R2 standard tier: 10 GB

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not signed in' });

  try {
    if (req.method === 'POST' && req.body?.action === 'cleanup') {
      const { orphans } = await storageReport();
      if (orphans.length) await deleteObjects(orphans.map((b) => b.pathname));
    } else if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const r = await storageReport();
    return res.status(200).json({
      usedBytes: r.usedBytes,
      limitBytes: LIMIT_BYTES,
      fileCount: r.fileCount,
      orphanCount: r.orphans.length,
      orphanBytes: r.orphanBytes,
    });
  } catch (err) {
    console.error('Storage report error:', err);
    return res.status(500).json({ error: err.message });
  }
}
