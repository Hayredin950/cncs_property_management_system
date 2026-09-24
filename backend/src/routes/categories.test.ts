import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import { prisma } from '../lib/prisma.js';

process.env.JWT_SECRET = 'test_jwt_secret';

vi.mock('../lib/prisma.js', () => {
  return {
    prisma: {
      category: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
});

function createToken(payload: { id: string; role: 'ADMIN' | 'STAFF' }) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe('Category Endpoints', () => {
  const adminToken = createToken({ id: 'admin-1', role: 'ADMIN' });
  const staffToken = createToken({ id: 'staff-1', role: 'STAFF' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /categories', () => {
    it('returns 200 and list of categories with their item counts', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Furniture', _count: { items: 3 } },
        { id: 'cat-2', name: 'Lab Equipment', _count: { items: 0 } },
      ];
      vi.mocked(prisma.category.findMany).mockResolvedValueOnce(mockCategories as never);

      const res = await request(app).get('/categories');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].name).toBe('Furniture');
      // The count is flattened into the response; Prisma's `_count` envelope
      // must not leak through.
      expect(res.body[0].itemCount).toBe(3);
      expect(res.body[1].itemCount).toBe(0);
      expect(res.body[0]._count).toBeUndefined();
    });
  });

  describe('POST /categories', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/categories')
        .send({ name: 'Vehicles' });

      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated as STAFF', async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Vehicles' });

      expect(res.status).toBe(403);
    });

    it('returns 400 when name is empty', async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '   ' });

      expect(res.status).toBe(400);
    });

    it('returns 409 when category already exists', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce({
        id: 'cat-1',
        name: 'Furniture',
      } as never);

      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Furniture' });

      expect(res.status).toBe(409);
    });

    it('returns 201 and creates category when valid admin request', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.category.create).mockResolvedValueOnce({
        id: 'cat-new',
        name: 'Vehicles',
      } as never);

      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Vehicles' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Vehicles');
    });
  });

  describe('PUT /categories/:id', () => {
    it('returns 403 when authenticated as STAFF', async () => {
      const res = await request(app)
        .put('/categories/cat-1')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown category', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .put('/categories/missing')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(404);
    });

    it('returns 200 for a no-op rename without touching the row', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce({
        id: 'cat-1',
        name: 'Furniture',
      } as never);

      const res = await request(app)
        .put('/categories/cat-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Furniture' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Furniture');
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('returns 409 when the new name is taken', async () => {
      vi.mocked(prisma.category.findUnique)
        .mockResolvedValueOnce({ id: 'cat-1', name: 'Furniture' } as never)
        .mockResolvedValueOnce({ id: 'cat-2', name: 'Vehicles' } as never);

      const res = await request(app)
        .put('/categories/cat-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Vehicles' });

      expect(res.status).toBe(409);
    });

    it('returns 200 and renames the category', async () => {
      vi.mocked(prisma.category.findUnique)
        .mockResolvedValueOnce({ id: 'cat-1', name: 'Furniture' } as never)
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.category.update).mockResolvedValueOnce({
        id: 'cat-1',
        name: 'Office Furniture',
      } as never);

      const res = await request(app)
        .put('/categories/cat-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Office Furniture' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Office Furniture');
    });
  });

  describe('DELETE /categories/:id', () => {
    it('returns 403 when authenticated as STAFF', async () => {
      const res = await request(app)
        .delete('/categories/cat-1')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown category', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .delete('/categories/missing')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 409 and names the count when the category is in use', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce({
        id: 'cat-1',
        name: 'Furniture',
        _count: { items: 4 },
      } as never);

      const res = await request(app)
        .delete('/categories/cat-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('4 items');
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('returns 200 and deletes an empty category', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce({
        id: 'cat-1',
        name: 'Furniture',
        _count: { items: 0 },
      } as never);
      vi.mocked(prisma.category.delete).mockResolvedValueOnce({
        id: 'cat-1',
        name: 'Furniture',
      } as never);

      const res = await request(app)
        .delete('/categories/cat-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });
  });
});