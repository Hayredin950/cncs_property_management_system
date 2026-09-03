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
    it('returns 200 and list of categories', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Furniture' },
        { id: 'cat-2', name: 'Lab Equipment' },
      ];
      vi.mocked(prisma.category.findMany).mockResolvedValueOnce(mockCategories as never);

      const res = await request(app).get('/categories');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].name).toBe('Furniture');
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
});