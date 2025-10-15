import { z } from "zod";

export const jsonRectangleSchema = z.object({
  id: z.string(),
  parentId: z.string(),
  index: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number().optional(),
  props: z.object({
    w: z.number(),
    h: z.number(),
    fill: z.string().optional(),
    stroke: z.string().optional(),
  }).passthrough(),
});

export const shapeMetadataSchema = z.object({
  shape: jsonRectangleSchema,
  updatedAt: z.number().int().nonnegative(),
  updatedBy: z.string().nullable(),
});

export type JsonRectangle = z.infer<typeof jsonRectangleSchema>;
export type ShapeMetadata = z.infer<typeof shapeMetadataSchema>;
