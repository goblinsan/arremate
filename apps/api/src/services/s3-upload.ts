import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Resolves S3 configuration from environment variables.
 * Throws if required variables are missing.
 */
function getS3Config() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_DOCUMENTS_BUCKET;

  if (!region || !bucket) {
    throw new Error('Missing AWS_REGION or S3_DOCUMENTS_BUCKET environment variables');
  }

  const expiresIn = Number(process.env.S3_UPLOAD_URL_EXPIRY_SECONDS ?? 300);

  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('S3_UPLOAD_URL_EXPIRY_SECONDS must be a positive number');
  }

  return { region, bucket, expiresIn };
}

/**
 * Generates a pre-signed S3 PUT URL that the browser can use to upload a
 * document directly to S3 without exposing permanent AWS credentials.
 *
 * @param s3Key   - The S3 object key (path within the bucket).
 * @param contentType - MIME type of the file being uploaded.
 * @returns Object with the pre-signed uploadUrl, the s3Key, and the expiry ISO timestamp.
 */
export async function generateUploadUrl(
  s3Key: string,
  contentType: string,
): Promise<{ uploadUrl: string; s3Key: string; expiresAt: string }> {
  const { region, bucket, expiresIn } = getS3Config();

  const client = new S3Client({ region });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return { uploadUrl, s3Key, expiresAt };
}
