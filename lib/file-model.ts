import { z } from "zod";
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const fileTypes: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
export const uploadSchema = z.object({
  serviceId: z.string().min(1).max(64),
  name: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .refine((n) => !/[\x00-\x1f\/\\]/.test(n), "Некорректное имя файла.")
    .refine(
      (n) => !!fileTypes[n.split(".").at(-1)!.toLowerCase()],
      "Разрешены PDF, DOC, DOCX, PNG и JPG.",
    ),
  size: z
    .number()
    .int()
    .min(1)
    .max(MAX_FILE_SIZE, "Файл должен быть не больше 20 МБ."),
});
export type FileEntry = {
  id: string;
  serviceId: string;
  serviceName: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
};
export function validFileSignature(bytes: Uint8Array, mime: string) {
  const hex = [...bytes.slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (mime === "application/pdf")
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (mime === "image/png") return hex === "89504e470d0a1a0a";
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "application/msword") return hex === "d0cf11e0a1b11ae1";
  return mime === fileTypes.docx && hex.startsWith("504b0304");
}
