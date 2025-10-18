import { z } from "zod";

const baseShapeSchema = z
  .object({
    id: z.string(),
    typeName: z.literal("shape"),
    type: z.string(),
    parentId: z.string().optional(),
    index: z.union([z.string(), z.number()]).optional(),
  })
  .catchall(z.any());

export const jsonShapeSchema = baseShapeSchema;

export const shapeMetadataSchema = z.object({
  shape: jsonShapeSchema,
  updatedAt: z.number().int().nonnegative(),
  updatedBy: z.string().nullable(),
});

export type JsonShape = z.infer<typeof jsonShapeSchema>;
export type ShapeMetadata = z.infer<typeof shapeMetadataSchema>;
