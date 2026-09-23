# Music Vault — music.dgrvip.net

A single, centered streaming-only music player, plus a password-protected admin studio for uploading tracks.

- `index.html`: the public player
- `admin.html`: the admin studio at `/admin` (upload, edit, reorder, delete)
- `api/`: Vercel serverless functions
  - `login.js`: checks `ADMIN_PASSWORD` and returns a signed session token
  - `tracks.js`: lists tracks (public) and adds, edits, or deletes them (admin)
  - `upload.js`: issues short-lived tokens so the browser uploads straight to Blob storage
  - `stream.js`: streams audio in small signed byte ranges, so there are no public file URLs
  - `cover.js`: serves cover art
  - `storage.js`: storage usage for the admin meter, and cleanup of leftover uploads (admin)
- `vendor/blob-client.js`: bundled `@vercel/blob/client`, built from `vendor-src/` with `npm run build:vendor`

## Where the music lives

Audio, covers, and the track list (`data/tracks.json`) are kept in a **private Vercel Blob store** (`music-vault`).
Nothing is kept in the browser or in this repo. You can upload from any machine: go to `/admin` and sign in.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Purpose |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Set automatically when the Blob store is connected |
| `ADMIN_PASSWORD` | Admin studio password |
| `SESSION_SECRET` | Random string used to sign sessions and stream links. Changing it signs everyone out. |

Redeploy after you change a variable.

## Working on another machine

```bash
git clone https://github.com/Djinasense/music.git
cd music
npm install
npx vercel link        # choose the existing "ai-music" project
npx vercel env pull    # optional, for `npm run dev`
```

Deploy with `npx vercel --prod`, or connect the GitHub repo in Vercel (Project → Settings → Git) so every push to `main` deploys automatically.

## About "un-downloadable"

The player has no download button and no public file URLs. Stream links expire and hand out only 2 MB pieces, and opening a link in a tab is refused.
That stops casual saving. No website can fully stop someone who records their own sound card or uses developer tools.
