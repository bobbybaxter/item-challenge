import { z } from 'zod';

export const idSchema = z.string().min(1).max(255);

export const createItemSchema = z.object({
  subject: z.string().min(1).max(255),
  itemType: z.enum(['multiple-choice', 'free-response', 'essay']),
  difficulty: z.number().min(1).max(5),
  content: z.object({
    question: z.string().min(1),
    options: z.array(z.string()).min(2).max(4),
    correctAnswer: z.string().min(1),
    explanation: z.string().min(1),
  }),
  metadata: z.object({
    author: z.string().min(1).max(255),
    status: z.enum(['draft', 'review', 'approved', 'archived']),
    tags: z.array(z.string()).min(1).max(255),
  }),
  securityLevel: z.enum(['standard', 'secure', 'highly-secure']),
});

export type CreateItemRequest = z.infer<typeof createItemSchema>;
