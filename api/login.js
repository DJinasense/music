import { checkPassword, createSession } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!checkPassword(req.body?.password)) {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return res.status(401).json({ error: 'Incorrect password' });
    }
    return res.status(200).json({ token: createSession() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
