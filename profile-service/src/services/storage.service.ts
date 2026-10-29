import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";
import { AppError } from "../utils/appError.js";

let client: S3Client | undefined;

// Lazily create the R2 client; R2 speaks the S3 API at the account's own endpoint.
function getClient(): S3Client {
  if (!config.r2Configured) {
    throw new AppError("File storage is not configured", 503);
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  });
  return client;
}

// Upload a file to R2 and return its public URL.
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[profile-service] R2 upload failed:", error instanceof Error ? error.message : error);
    throw new AppError("Could not store the file. Please try again.", 502);
  }
  return `${config.r2.publicUrl}/${key}`;
}
