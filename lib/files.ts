import { randomUUID } from "node:crypto";
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileDatabase, readStore } from "./storage";
import {
  fileTypes,
  uploadSchema,
  validFileSignature,
  type FileEntry,
} from "./file-model";
let client: S3Client | undefined;
function s3() {
  if (
    !process.env.S3_BUCKET ||
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY ||
    !process.env.S3_ENDPOINT
  )
    throw new Error("Хранилище файлов пока не настроено.");
  return (client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  }));
}
const bucket = () => process.env.S3_BUCKET!;
async function db() {
  const sql = await fileDatabase();
  await sql`CREATE TABLE IF NOT EXISTS service_files (id uuid PRIMARY KEY, service_id text NOT NULL, name text NOT NULL, size integer NOT NULL, mime text NOT NULL, state text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now())`;
  return sql;
}
async function serviceExists(id: string) {
  return (await readStore()).services.some((s) => s.id === id);
}
export async function listFiles(serviceId?: string): Promise<FileEntry[]> {
  const sql = await db();
  const store = await readStore();
  const services = new Map(store.services.map((s) => [s.id, s.name]));
  const rows = serviceId
    ? await sql`SELECT * FROM service_files WHERE state='ready' AND service_id=${serviceId} ORDER BY created_at DESC`
    : await sql`SELECT * FROM service_files WHERE state='ready' ORDER BY created_at DESC`;
  return rows
    .filter((r) => services.has(r.service_id))
    .map((r) => ({
      id: r.id,
      serviceId: r.service_id,
      serviceName: services.get(r.service_id)!,
      name: r.name,
      size: r.size,
      mime: r.mime,
      createdAt: new Date(r.created_at).toISOString(),
    }));
}
export async function prepareUpload(input: unknown) {
  const data = uploadSchema.parse(input);
  if (!(await serviceExists(data.serviceId)))
    throw new Error("Сначала сохраните услугу.");
  const client = s3(),
    sql = await db();
  const id = randomUUID(),
    mime = fileTypes[data.name.split(".").at(-1)!.toLowerCase()];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(928415)`;
    const [used] =
      await tx`SELECT COALESCE(sum(size),0)::bigint AS bytes FROM service_files WHERE state='ready' OR created_at > now()-interval '1 day'`;
    if (Number(used.bytes) + data.size > 1024 * 1024 * 1024)
      throw new Error("Лимит файлов 1 ГБ заполнен. Удалите ненужные вложения.");
    const [count] =
      await tx`SELECT count(*)::int AS n FROM service_files WHERE service_id=${data.serviceId} AND (state='ready' OR created_at > now()-interval '10 minutes')`;
    if (count.n >= 20)
      throw new Error("К одной услуге можно прикрепить до 20 файлов.");
    await tx`INSERT INTO service_files(id,service_id,name,size,mime) VALUES(${id},${data.serviceId},${data.name},${data.size},${mime})`;
  });
  try {
    const post = await createPresignedPost(client, {
      Bucket: bucket(),
      Key: `staging/${id}`,
      Expires: 120,
      Fields: { "Content-Type": mime },
      Conditions: [
        ["content-length-range", data.size, data.size],
        ["eq", "$Content-Type", mime],
      ],
    });
    return { id, ...post };
  } catch (error) {
    await sql`DELETE FROM service_files WHERE id=${id}`;
    throw error;
  }
}
export async function completeUpload(id: string) {
  const sql = await db();
  const [row] = await sql`SELECT * FROM service_files WHERE id=${id}`;
  if (!row || !(await serviceExists(row.service_id)))
    throw new Error("Услуга или загрузка не найдена.");
  if (row.state === "ready") return;
  const source = `staging/${id}`;
  const head = await s3().send(
    new HeadObjectCommand({ Bucket: bucket(), Key: source }),
  );
  const first = await s3().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: source,
      Range: "bytes=0-15",
      IfMatch: head.ETag,
    }),
  );
  if (
    head.ContentLength !== row.size ||
    head.ContentType !== row.mime ||
    !validFileSignature(await first.Body!.transformToByteArray(), row.mime)
  ) {
    await deleteFile(id);
    throw new Error(
      "Содержимое файла не соответствует выбранному формату или размеру.",
    );
  }
  // Freeze the validated object under a key that no upload URL can overwrite.
  await s3().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      Key: `files/${id}`,
      CopySource: `${bucket()}/${source}`,
      CopySourceIfMatch: head.ETag,
      ContentType: row.mime,
      MetadataDirective: "REPLACE",
    }),
  );
  await sql`UPDATE service_files SET state='ready' WHERE id=${id}`;
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: source }));
}
export async function deleteFile(id: string) {
  const sql = await db();
  await s3().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: `files/${id}` }),
  );
  await s3().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: `staging/${id}` }),
  );
  await sql`DELETE FROM service_files WHERE id=${id}`;
}
export async function fileUrl(id: string, download: boolean) {
  const entry = (await listFiles()).find((f) => f.id === id);
  if (!entry) return null;
  const inline =
    !download &&
    ["application/pdf", "image/png", "image/jpeg"].includes(entry.mime);
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: `files/${id}`,
      ResponseContentType: entry.mime,
      ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename="document"; filename*=UTF-8''${encodeURIComponent(entry.name).replace(/'/g, "%27")}`,
    }),
    { expiresIn: 300 },
  );
}
