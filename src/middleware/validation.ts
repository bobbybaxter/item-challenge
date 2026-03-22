import { ZodSchema } from "zod";

export function validateInput<T>(schema: ZodSchema<T>, data: T): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error("Invalid input");
  }
  return result.data;
}
