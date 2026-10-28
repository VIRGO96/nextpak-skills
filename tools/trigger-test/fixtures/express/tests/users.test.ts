import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import * as db from '../src/db';

const app = createApp();

beforeEach(() => db.reset());

describe('GET /api/v1/users/me', () => {
  it('returns the current user', async () => {
    const res = await request(app).get('/api/v1/users/me').set('Authorization', 'Bearer token-alice');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });
});
