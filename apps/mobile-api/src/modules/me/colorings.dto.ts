import { z } from "zod";

export const createColoringSchema = z.object({
  bookId: z.string().min(1),
  pageId: z.string().optional(),
  pageIndex: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  progress: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["in_progress", "finished"]).optional(),
});
export type CreateColoringDto = z.infer<typeof createColoringSchema>;

export const updateColoringSchema = z.object({
  imageUrl: z.string().url().optional(),
  progress: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["in_progress", "finished"]).optional(),
});
export type UpdateColoringDto = z.infer<typeof updateColoringSchema>;
