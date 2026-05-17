import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer();

export const handlers = {
  registerSuccess: () =>
    http.post('/api/auth/register', () =>
      HttpResponse.json({ message: 'Registration successful.' }, { status: 201 }),
    ),
  registerDuplicate: () =>
    http.post('/api/auth/register', () =>
      HttpResponse.json({ error: 'Email already registered' }, { status: 409 }),
    ),
  verifyOk: () =>
    http.get('/api/auth/verify', () =>
      HttpResponse.json({ message: 'Email verified successfully' }),
    ),
  verifyBad: () =>
    http.get('/api/auth/verify', () =>
      HttpResponse.json({ error: 'Invalid or expired verification link' }, { status: 400 }),
    ),
  loginOk: () =>
    http.post('/api/auth/login', async () =>
      HttpResponse.json({
        token: 'fake-jwt',
        user: { id: 'u1', email: 'jane@example.com', name: 'Jane', city: 'Phoenix', state: 'AZ' },
      }),
    ),
  loginUnverified: () =>
    http.post('/api/auth/login', () =>
      HttpResponse.json({ error: 'Please verify your email before logging in' }, { status: 403 }),
    ),
};
