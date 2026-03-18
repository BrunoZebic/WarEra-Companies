import { gunzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only so the module can be imported in test
vi.mock("server-only", () => ({}));

// Mock env before importing r2
vi.mock("@/lib/env", () => ({
  getR2ArchiveConfig: () => ({
    accountId: "test-account",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    bucketName: "test-bucket",
    archivePrefix: "archives",
  }),
}));

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send(...args: unknown[]) {
      return mockSend(...args);
    }
  },
  PutObjectCommand: class MockPutObjectCommand {
    [key: string]: unknown;
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params);
    }
  },
}));

const { uploadGzippedNdjson } = await import("./r2");

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ ETag: '"abc123"' });
});

describe("uploadGzippedNdjson", () => {
  it("uploads a Buffer body (not a stream)", async () => {
    const rows = [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }];

    await uploadGzippedNdjson({ key: "test/rows.ndjson.gz", rows });

    expect(mockSend).toHaveBeenCalledOnce();
    const params = mockSend.mock.calls[0][0] as {
      Body: unknown;
      Key: string;
      ContentEncoding: string;
    };

    expect(params.Body).toBeInstanceOf(Buffer);
    expect(params.Key).toBe("test/rows.ndjson.gz");
    expect(params.ContentEncoding).toBe("gzip");
  });

  it("produces valid gzip-compressed NDJSON matching the input rows", async () => {
    const rows = [{ id: 1, val: "x" }, { id: 2, val: "y" }];

    await uploadGzippedNdjson({ key: "test/rows.ndjson.gz", rows });

    const uploadedBody = mockSend.mock.calls[0][0].Body as Buffer;
    const decompressed = gunzipSync(uploadedBody).toString("utf8");
    const lines = decompressed.split("\n").filter(Boolean);

    expect(lines).toHaveLength(rows.length);
    expect(JSON.parse(lines[0])).toEqual({ id: 1, val: "x" });
    expect(JSON.parse(lines[1])).toEqual({ id: 2, val: "y" });
  });

  it("reports sizeBytes matching the compressed buffer length", async () => {
    const rows = [{ a: 1 }, { b: 2 }];

    const result = await uploadGzippedNdjson({
      key: "test/rows.ndjson.gz",
      rows,
    });

    const uploadedBody = mockSend.mock.calls[0][0].Body as Buffer;
    expect(result.sizeBytes).toBe(uploadedBody.byteLength);
  });

  it("returns the etag from the S3 response", async () => {
    mockSend.mockResolvedValue({ ETag: '"etag-value"' });

    const result = await uploadGzippedNdjson({
      key: "test/rows.ndjson.gz",
      rows: [{ id: 1 }],
    });

    expect(result.etag).toBe('"etag-value"');
  });

  it("handles an async iterable of rows", async () => {
    async function* asyncRows() {
      yield { id: 1 };
      yield { id: 2 };
      yield { id: 3 };
    }

    const result = await uploadGzippedNdjson({
      key: "test/async.ndjson.gz",
      rows: asyncRows(),
    });

    const uploadedBody = mockSend.mock.calls[0][0].Body as Buffer;
    const lines = gunzipSync(uploadedBody).toString("utf8").split("\n").filter(Boolean);

    expect(lines).toHaveLength(3);
    expect(result.sizeBytes).toBe(uploadedBody.byteLength);
  });

  it("propagates upload errors and does not swallow them", async () => {
    mockSend.mockRejectedValue(new Error("R2 network failure"));

    await expect(
      uploadGzippedNdjson({ key: "test/rows.ndjson.gz", rows: [{ id: 1 }] }),
    ).rejects.toThrow("R2 network failure");
  });

  it("handles an empty row set and uploads a valid empty gzip", async () => {
    const result = await uploadGzippedNdjson({
      key: "test/empty.ndjson.gz",
      rows: [],
    });

    const uploadedBody = mockSend.mock.calls[0][0].Body as Buffer;
    expect(uploadedBody).toBeInstanceOf(Buffer);
    expect(uploadedBody.byteLength).toBeGreaterThan(0); // gzip header overhead

    const decompressed = gunzipSync(uploadedBody).toString("utf8");
    expect(decompressed).toBe("");
    expect(result.sizeBytes).toBe(uploadedBody.byteLength);
  });
});
