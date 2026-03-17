import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PassThrough } from "node:stream";
import { createGzip } from "node:zlib";

import { getR2ArchiveConfig } from "@/lib/env";

export type ArchiveObjectResult = {
  key: string;
  sizeBytes: number;
  etag: string | null;
};

let r2Client: S3Client | null = null;

function getR2Client() {
  if (!r2Client) {
    const config = getR2ArchiveConfig();

    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return r2Client;
}

export async function uploadJsonObject(input: {
  key: string;
  content: unknown;
  contentType?: string;
}) {
  const config = getR2ArchiveConfig();
  const body = Buffer.from(JSON.stringify(input.content, null, 2), "utf8");
  const response = await getR2Client().send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: input.key,
      Body: body,
      ContentType: input.contentType ?? "application/json",
    }),
  );

  return {
    key: input.key,
    sizeBytes: body.byteLength,
    etag: response.ETag ?? null,
  } satisfies ArchiveObjectResult;
}

export async function uploadGzippedNdjson(input: {
  key: string;
  rows: AsyncIterable<unknown> | Iterable<unknown>;
}) {
  const config = getR2ArchiveConfig();
  const gzip = createGzip();
  const bodyStream = new PassThrough();
  let sizeBytes = 0;

  bodyStream.on("data", (chunk: Buffer) => {
    sizeBytes += chunk.length;
  });

  gzip.pipe(bodyStream);

  const uploadPromise = getR2Client().send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: input.key,
      Body: bodyStream,
      ContentType: "application/x-ndjson",
      ContentEncoding: "gzip",
    }),
  );

  try {
    for await (const row of input.rows) {
      gzip.write(`${JSON.stringify(row)}\n`, "utf8");
    }

    gzip.end();

    const response = await uploadPromise;

    return {
      key: input.key,
      sizeBytes,
      etag: response.ETag ?? null,
    } satisfies ArchiveObjectResult;
  } catch (error) {
    gzip.destroy(error instanceof Error ? error : undefined);
    throw error;
  }
}
