import { head, del } from '@vercel/blob';
import { isAdmin } from './_lib/auth.js';
import { readManifest, mutateTracks, publicTrack, youtubeId } from './_lib/store.js';

const clean = (v, max = 120) => String(v ?? '').trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const { tracks } = await readManifest();
      // Briefly cache the public list at the edge; admin requests add ?fresh=… to skip it
      if (!req.query.fresh) res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.status(200).json(tracks.map(publicTrack));
    }

    if (!isAdmin(req)) return res.status(401).json({ error: 'Not signed in' });

    // Add a track after its files were uploaded directly to Blob storage
    if (req.method === 'POST') {
      const { title, artist, youtubeUrl, audioPath, coverPath } = req.body || {};
      if (!clean(title)) return res.status(400).json({ error: 'Title is required' });
      if (!/^audio\//.test(audioPath || '')) return res.status(400).json({ error: 'Audio file is required' });
      if (coverPath && !/^covers\//.test(coverPath)) return res.status(400).json({ error: 'Bad cover path' });

      // Confirm the uploads really exist before publishing them
      await head(audioPath);
      if (coverPath) await head(coverPath);

      const track = {
        id: 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: clean(title),
        artist: clean(artist) || 'DGR VIP',
        youtubeId: youtubeId(youtubeUrl),
        audioPath,
        coverPath: coverPath || null,
        createdAt: new Date().toISOString(),
      };
      let tracks;
      try {
        tracks = await mutateTracks((list) => [...list, track]);
      } catch (err) {
        // Don't leave the just-uploaded files behind if publishing failed
        await del([audioPath, coverPath].filter(Boolean)).catch(() => {});
        throw err;
      }
      return res.status(200).json(tracks.map(publicTrack));
    }

    // Edit details or move a track up/down
    if (req.method === 'PATCH') {
      const { id, title, artist, youtubeUrl, move } = req.body || {};
      const tracks = await mutateTracks((list) => {
        const i = list.findIndex((t) => t.id === id);
        if (i === -1) throw Object.assign(new Error('Track not found'), { status: 404 });
        if (title !== undefined && clean(title)) list[i].title = clean(title);
        if (artist !== undefined) list[i].artist = clean(artist) || 'DGR VIP';
        if (youtubeUrl !== undefined) list[i].youtubeId = youtubeId(youtubeUrl);
        if (move === 'up' || move === 'down') {
          const j = move === 'up' ? i - 1 : i + 1;
          if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
      });
      return res.status(200).json(tracks.map(publicTrack));
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      let removed = null;
      const tracks = await mutateTracks((list) => {
        removed = list.find((t) => t.id === id);
        return list.filter((t) => t.id !== id);
      });
      if (removed) {
        await del([removed.audioPath, removed.coverPath].filter(Boolean)).catch((e) => console.error(e));
      }
      return res.status(200).json(tracks.map(publicTrack));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ error: err.message || 'Server error' });
  }
}
