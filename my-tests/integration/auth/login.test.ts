import request from 'supertest';
import { app } from '../../../server/src/index';

describe('POST /api/auth/login', () => {
  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'test' });
    expect(res.status).toBe(400);
  });
});
