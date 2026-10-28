# Express API: Vitest + Supertest

Feature: notes API. Acceptance criteria: logged-in users create notes (title 1-200 chars) and can read
only their own. Tests were written first, run against an empty `buildApp()` (RED), then implemented.

Setup: `npm i -D vitest supertest @types/supertest`. The app module exports a factory and never
calls `listen()`, so tests import it directly (see `node-express-standards`).

## Contents

- `tests/notes.test.ts`
- RED: output before the route existed
- GREEN: after implementing
- Minimal app used for the run

### `tests/notes.test.ts`

```ts
// Acceptance criteria -> test cases. Written before the route existed.
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';

let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  app = buildApp(); // fresh in-memory state per test = isolated tests
});

const asUser = (id: string) => ({ Authorization: `Bearer test-${id}` });

describe('POST /api/v1/notes', () => {
  it('201 creates a note for the logged-in user', async () => {
    const res = await request(app).post('/api/v1/notes').set(asUser('a')).send({ title: 'Hi' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: 'Hi', ownerId: 'a' });
  });

  it.each([
    ['missing title', {}],
    ['empty title', { title: '' }],
    ['wrong type', { title: 123 }],
    ['too long', { title: 'x'.repeat(201) }],
  ])('400 on %s', async (_label, body) => {
    const res = await request(app).post('/api/v1/notes').set(asUser('a')).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 on malformed JSON (JSON error, not an HTML page)', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set(asUser('a'))
      .set('Content-Type', 'application/json')
      .send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a token', async () => {
    const res = await request(app).post('/api/v1/notes').send({ title: 'Hi' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/notes/:id', () => {
  it('403 when user B reads user A note (ownership)', async () => {
    const created = await request(app).post('/api/v1/notes').set(asUser('a')).send({ title: 'A' });
    const res = await request(app).get(`/api/v1/notes/${created.body.data.id}`).set(asUser('b'));
    expect(res.status).toBe(403);
  });

  it('404 for an unknown id', async () => {
    const res = await request(app).get('/api/v1/notes/does-not-exist').set(asUser('a'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND'); // without this line it passed on the stub
  });
});
```

### RED: output before the route existed

```text
 × 201 creates a note for the logged-in user
 × 400 on missing title
 ...
 × 403 when user B reads user A note (ownership)
AssertionError: expected 404 to be 201 // Object.is equality
Tests  8 failed | 1 passed (9)
```

The one test that passed was the 404 case: an Express app with no routes also returns 404. That is
a test proving nothing, so it was tightened to check `error.code === 'NOT_FOUND'`, and then it failed too.

### GREEN: after implementing

```text
Test Files  1 passed (1)
     Tests  9 passed (9)
```

### Minimal app used for the run

Shown only so the example is complete. Real projects follow `node-express-standards`
(Zod validation, AppError classes, Pino).

```ts
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

type Note = { id: string; title: string; ownerId: string };
const fail = (status: number, code: string) => Object.assign(new Error(code), { status, code });

// Test-only auth: "Bearer test-<userId>". Real apps verify a JWT/session here.
const auth: RequestHandler = (req, res, next) => {
  const m = /^Bearer test-(\w+)$/.exec(req.get('authorization') ?? '');
  if (!m) return next(fail(401, 'UNAUTHORIZED'));
  res.locals.userId = m[1];
  next();
};

export function buildApp() {
  const notes = new Map<string, Note>(); // per-app store keeps tests isolated
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.post('/api/v1/notes', auth, (req, res) => {
    const title = req.body?.title;
    if (typeof title !== 'string' || title.length < 1 || title.length > 200) {
      throw fail(400, 'VALIDATION_ERROR');
    }
    const note = { id: randomUUID(), title, ownerId: res.locals.userId };
    notes.set(note.id, note);
    res.status(201).json({ data: note });
  });

  app.get('/api/v1/notes/:id', auth, (req, res) => {
    const note = notes.get(String(req.params.id));
    if (!note) throw fail(404, 'NOT_FOUND');
    if (note.ownerId !== res.locals.userId) throw fail(403, 'FORBIDDEN');
    res.json({ data: note });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = err.status ?? 500;
    const code = err.type === 'entity.parse.failed' ? 'VALIDATION_ERROR' : (err.code ?? 'INTERNAL');
    res.status(status).json({ error: { code } });
  };
  app.use(onError);
  return app;
}
```
