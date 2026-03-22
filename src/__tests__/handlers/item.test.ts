import { describe, expect, it, vi } from 'vitest';
import { createItemHandler, getAllItemsHandler, getItemHandler } from '../../handlers/item.js';
import { MemoryStorage } from '../../storage/memory.js';
import type { CreateItemRequest } from '../../types/item.js';

const validCreatePayload = {
  subject: 'AP Biology',
  itemType: 'multiple-choice' as const,
  difficulty: 3,
  content: {
    question: 'What is photosynthesis?',
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 'A',
    explanation: 'Photosynthesis is the process...',
  },
  metadata: {
    author: 'test-author',
    status: 'draft' as const,
    tags: ['biology', 'photosynthesis'],
  },
  securityLevel: 'standard' as const,
} satisfies CreateItemRequest;

describe('Item Handlers', () => {
  describe('getAllItemsHandler', () => {
    it('should return all items with total count', async () => {
      const createResult = await createItemHandler(validCreatePayload);
      expect(createResult.body).toHaveProperty('id');
      if (!('id' in createResult.body)) {
        throw new Error('Item creation failed');
      }

      const result = await getAllItemsHandler();

      expect(result?.statusCode).toBe(200);
      expect(result?.body).toMatchObject({
        total: expect.any(Number),
        items: expect.any(Array),
      });
      const body = result?.body as { items: unknown[]; total: number };
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.total).toBeGreaterThanOrEqual(1);
    });

    it('should return 500 when storage fails', async () => {
      const spy = vi
        .spyOn(MemoryStorage.prototype, 'listItems')
        .mockRejectedValueOnce(new Error('storage unavailable'));

      try {
        const result = await getAllItemsHandler();

        expect(result?.statusCode).toBe(500);
        expect(result?.body).toEqual({ error: 'Internal server error' });
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('createItemHandler', () => {
    it('should create an item successfully', async () => {
      const itemData = {
        subject: 'AP Biology',
        itemType: 'multiple-choice',
        difficulty: 3,
        content: {
          question: 'What is photosynthesis?',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'A',
          explanation: 'Photosynthesis is the process...',
        },
        metadata: {
          author: 'test-author',
          status: 'draft',
          tags: ['biology', 'photosynthesis'],
        },
        securityLevel: 'standard',
      } satisfies CreateItemRequest;

      const result = await createItemHandler(itemData);

      expect(result.statusCode).toBe(201);
      expect(result.body).toHaveProperty('id');
      if ('subject' in result.body) {
        expect(result.body.subject).toBe('AP Biology');
      }
      if ('metadata' in result.body) {
        expect(result.body.metadata).toHaveProperty('author', 'test-author');
      }
    });

    it('should return 400 when validation fails', async () => {
      const invalid = { ...validCreatePayload, subject: '' };

      const result = await createItemHandler(invalid);

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Invalid input');
    });

    it('should return 500 when storage fails', async () => {
      const spy = vi
        .spyOn(MemoryStorage.prototype, 'createItem')
        .mockRejectedValueOnce(new Error('storage unavailable'));

      try {
        const result = await createItemHandler(validCreatePayload);

        expect(result.statusCode).toBe(500);
        expect(result.body).toEqual({ error: 'Internal server error' });
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('getItemHandler', () => {
    it('should return 404 for non-existent item', async () => {
      const result = await getItemHandler('non-existent-id');

      expect(result.statusCode).toBe(404);
      expect(result.body).toHaveProperty('error');
      if ('error' in result.body) {
        expect(result.body.error).toBe('Item not found');
      }
    });

    it('should return 500 when id validation fails', async () => {
      const result = await getItemHandler('');

      expect(result.statusCode).toBe(500);
      expect(result.body).toEqual({ error: 'Internal server error' });
    });

    it('should return 500 when storage fails', async () => {
      const spy = vi.spyOn(MemoryStorage.prototype, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

      try {
        const result = await getItemHandler('any-id');

        expect(result.statusCode).toBe(500);
        expect(result.body).toEqual({ error: 'Internal server error' });
      } finally {
        spy.mockRestore();
      }
    });

    it('should retrieve an existing item', async () => {
      const itemData = {
        subject: 'AP Calculus',
        itemType: 'free-response',
        difficulty: 4,
        content: {
          question: 'Calculate the derivative...',
          options: ['42', '0'],
          correctAnswer: '42',
          explanation: 'Using the chain rule...',
        },
        metadata: {
          author: 'test-author',
          status: 'approved',
          tags: ['calculus', 'derivatives'],
        },
        securityLevel: 'standard',
      } satisfies CreateItemRequest;

      const createResult = await createItemHandler(itemData);
      expect(createResult.body).toHaveProperty('id');
      if (!('id' in createResult.body)) {
        throw new Error('Item creation failed');
      }
      const itemId = createResult.body.id;

      const getResult = await getItemHandler(itemId);

      expect(getResult.statusCode).toBe(200);
      expect(getResult.body).toHaveProperty('id', itemId);
      if ('subject' in getResult.body) {
        expect(getResult.body.subject).toBe('AP Calculus');
      }
    });
  });
});
