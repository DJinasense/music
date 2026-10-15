import { S3Client, HeadObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';

export const BUCKET = process.env.R2_BUCKET_NAME || 'ai-music';

let clientInstance = null;

export function getR2Client() {
  if (clientInstance) return clientInstance;

  const endpoint = process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 environment variables (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not configured.');
  }

  clientInstance = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return clientInstance;
}

// Proxy object for callers importing 'r2' directly
export const r2 = new Proxy({}, {
  get(target, prop) {
    const client = getR2Client();
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  }
});

export function getBucketName() {
  return BUCKET;
}

export async function headObject(key) {
  const client = getR2Client();
  return client.send(new HeadObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
}

export async function deleteObjects(keys) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (!list.length) return;
  const client = getR2Client();
  return client.send(new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: {
      Objects: list.map((k) => ({ Key: k })),
      Quiet: true,
    },
  }));
}
