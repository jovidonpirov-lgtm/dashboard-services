import { z } from "zod";

export const workSchema = z.object({
  todo: z.string().max(12000).optional(),
  comment: z.string().max(12000).optional(),
  state: z.string().max(1000).optional(),
  agency: z.string().max(2000).optional(),
  responsible: z.string().max(2000).optional(),
  owner: z.string().max(1000).optional(),
  deadline: z.string().max(2000).optional(),
  revisedDeadline: z.string().max(4000).optional(),
  sources: z
    .array(
      z.object({
        file: z.string().max(500),
        sheet: z.string().max(200),
        row: z.number().int().positive(),
        cells: z.record(z.string(), z.string().nullable()),
      }),
    )
    .max(20)
    .optional(),
});
export type ServiceWork = z.infer<typeof workSchema>;
