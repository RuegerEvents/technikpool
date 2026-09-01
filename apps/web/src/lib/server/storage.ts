import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	CreateBucketCommand,
	PutBucketPolicyCommand,
	DeleteObjectCommand
} from '@aws-sdk/client-s3';

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

// Everything under this prefix is world-readable — the browser loads these
// straight from the object store, so nothing that needs a session may be
// written here. Product photos and manufacturer logos qualify: Product and
// Manufacturer are a global catalogue, not org-scoped.
export const PUBLIC_PREFIX = 'product-images';

// Grants anonymous s3:GetObject on the public prefix and nothing else: other
// keys in the bucket stay 403, and the bucket itself cannot be listed, so the
// object names are not enumerable.
const publicReadPolicy = JSON.stringify({
	Version: '2012-10-17',
	Statement: [
		{
			Sid: 'PublicReadProductImages',
			Effect: 'Allow',
			Principal: { AWS: ['*'] },
			Action: ['s3:GetObject'],
			Resource: [`arn:aws:s3:::${BUCKET}/${PUBLIC_PREFIX}/*`]
		}
	]
});

// Called once at server startup (see hooks.server.ts) — not per upload. Both
// commands are idempotent, so this also repairs a bucket whose policy was
// dropped, and a fresh deployment needs no manual setup in the S3 console.
export async function ensureBucket() {
	try {
		await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
	} catch (error) {
		const name = (error as { name?: string }).name;
		if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
			console.error(`Could not ensure S3 bucket "${BUCKET}" exists:`, error);
			return;
		}
	}

	try {
		await s3.send(new PutBucketPolicyCommand({ Bucket: BUCKET, Policy: publicReadPolicy }));
	} catch (error) {
		// Without this the uploads land fine and then render as broken images, so
		// it is worth saying out loud rather than failing silently at display time.
		console.error(
			`Could not make "${BUCKET}/${PUBLIC_PREFIX}/" publicly readable — uploaded images will not load:`,
			error
		);
	}
}

// Returns the key it wrote, which is also what gets stored: the address a
// browser loads it from is `imageSrc()`'s job (see $lib/images), resolved
// against PUBLIC_S3_URL_BASE at render time. Storing the full URL instead would
// pin every existing row to whatever host the store happened to be on the day
// it was uploaded.
export async function putObject(key: string, body: Uint8Array, contentType: string) {
	await s3.send(
		new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
	);
	return key;
}

/** Reads an object for server-side composition without exposing the S3 origin. */
export async function getObject(key: string) {
	const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
	if (!result.Body) throw new Error(`S3 object "${key}" has no body`);
	return {
		bytes: await result.Body.transformToByteArray(),
		contentType: result.ContentType ?? 'application/octet-stream'
	};
}

export async function deleteObject(key: string) {
	await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
