import request from 'supertest';
import { app } from '../../../server/src/index';

describe('POST /api/auth/register', () => {
  it('validates invitation code is required', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', password: 'password1' });
    expect(res.status).toBe(400);
  });

  it('validates password minimum strength', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ invitationCode: 'INV-TEST', username: 'user', password: '12' });
    expect(res.status).toBe(400);
  });

  it('validates username minimum length', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ invitationCode: 'INV-TEST', username: 'ab', password: 'password1' });
    expect(res.status).toBe(400);
  });
});
