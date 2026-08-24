import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

// Self-hosted, S3-compatible object storage (RustFS recommended — see wayfinder
// issue #10). Coded against the generic S3 API so the backend stays swappable.
export const s3 = new S3Client({
	endpoint: process.env.S3_ENDPOINT,
	region: process.env.S3_REGION || 'auto',
	forcePathStyle: true,
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? ''
	}
});

export const BUCKET = process.env.S3_BUCKET ?? 'technikpool';
// Base URL the stored object is reachable at (e.g. a reverse-proxied path to
// the S3-compatible server, or a CDN in front of it).
export const PUBLIC_URL_BASE =
	process.env.S3_PUBLIC_URL_BASE ?? `${process.env.S3_ENDPOINT}/${BUCKET}`;

// Called once at server startup (see hooks.server.ts) — not per upload.
export async function ensureBucket() {
	try {
		await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
	} catch (error) {
		const name = (error as { name?: string }).name;
		if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
			console.error(`Could not ensure S3 bucket "${BUCKET}" exists:`, error);
		}
	}
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
	await s3.send(
		new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
	);
	return `${PUBLIC_URL_BASE}/${key}`;
}
