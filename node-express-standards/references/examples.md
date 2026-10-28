# Reference code (Express 5 + TypeScript + Zod + Pino)

Copy and adapt. Each block matches a rule in `SKILL.md`. Type-checked with `tsc --strict` against
Express 5.3, Zod 4.6, pino 10, pino-http 11, helmet 8, express-rate-limit 8, jsonwebtoken 9, multer 2.5;
`tests/security.test.ts` runs green with Vitest + Supertest. Lines starting with `//` that show a call
(e.g. `// authRouter.post(...)`) are usage hints, not part of the file.

## Contents

- config/env.ts
- lib/logger.ts
- lib/errors.ts
- middleware/validate.ts
- middleware/errorHandler.ts
- app.ts
- server.ts (graceful shutdown)
- Rate limiting on auth routes
- middleware/auth.ts (JWT + roles)
- Webhooks (raw body + signature + idempotency)
- lib/http.ts (outbound calls: timeouts and SSRF)
- middleware/upload.ts (file upload limits)
- A feature module (users)
- tests/users.test.ts (Supertest, written before the code)
- tests/security.test.ts (auth, webhook and SSRF checks)

## config/env.ts

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  // Optional: only services that receive webhooks. The webhook route fails closed without it.
  WEBHOOK_SECRET: z.string().min(16).optional(),
  // Number of proxies in front of the app (load balancer = 1). 0 = not behind a proxy.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // The logger depends on env, so console is the only option here.
  console.error(
    'Invalid environment variables:\n' +
      parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'),
  );
  process.exit(1);
}

export const env = parsed.data;
```

## lib/logger.ts

```ts
import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
  // Pretty output only for local dev; production stays JSON.
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
```

## lib/errors.ts

```ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, 'VALIDATION_ERROR', 'Invalid request', details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, 'FORBIDDEN', message);
  }
}
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}
```

## middleware/validate.ts

```ts
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../lib/errors';

type Schemas = { body?: z.ZodType; params?: z.ZodType; query?: z.ZodType };

export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, res, next) => {
    const validated: Record<string, unknown> = {};
    const issues: { in: string; path: string; message: string }[] = [];

    for (const key of ['body', 'params', 'query'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (result.success) {
        validated[key] = result.data;
      } else {
        for (const i of result.error.issues) {
          issues.push({ in: key, path: i.path.join('.'), message: i.message });
        }
      }
    }

    if (issues.length) return next(new ValidationError(issues));
    // Express 5: req.query is a read-only getter, so store parsed values here.
    res.locals.validated = validated;
    next();
  };
```

## middleware/errorHandler.ts

```ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFoundError } from '../lib/errors';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
};

// Must have 4 params so Express treats it as an error handler. Register last.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) req.log.error({ err }, err.message);
    else req.log.warn({ code: err.code }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  // body-parser errors: malformed JSON or payload too large
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON', requestId } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large', requestId } });
    return;
  }

  // Unknown error: log everything, tell the client nothing internal.
  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId },
  });
};
```

## app.ts

```ts
import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import { usersRouter } from './modules/users/users.routes';
import { webhooksRouter } from './modules/webhooks/webhooks.routes';

export function createApp() {
  const app = express();

  // Behind a load balancer, req.ip (rate limits, audit logs) is only right if this matches the real
  // number of proxies. Never `true`: then any client can fake its IP with X-Forwarded-For.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        // Reuse the caller's id only if it looks like an id (stops log injection and huge headers).
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  // Webhooks need the raw body for signature checks, so mount them before express.json().
  app.use('/webhooks', webhooksRouter);
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // /readyz should also check DB and other dependencies.

  app.use('/api/v1/users', usersRouter);

  app.use(notFound);
  app.use(errorHandler); // always last
  return app;
}
```

## server.ts (graceful shutdown)

```ts
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server started');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    // await db.close(); await queue.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
```

## Rate limiting on auth routes

```ts
import { rateLimit } from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// authRouter.post('/login', authLimiter, validate({ body: LoginBody }), login);
```

The limiter keys on `req.ip`. Behind a load balancer that is only the real client IP when
`trust proxy` matches the number of proxies (see `app.ts`). Otherwise every user shares one bucket,
or attackers rotate `X-Forwarded-For` to get unlimited tries.

## middleware/auth.ts (JWT + roles)

```ts
// Lets TypeScript know about req.user (set by requireAuth).
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: 'user' | 'admin' };
    }
  }
}
export {};
```

```ts
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';

type Role = 'user' | 'admin';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return next(new UnauthorizedError());
  try {
    // Pin the algorithm: never let the token header choose it.
    // jwt.decode() does NOT check the signature - never use it for auth.
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    // Require exp, or a token without one is valid forever.
    if (typeof payload === 'string' || !payload.sub || !payload.exp) throw new Error('missing claims');
    req.user = { id: payload.sub, role: payload.role === 'admin' ? 'admin' : 'user' };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

// Function-level authorization: every admin/staff route (or the whole admin router) uses this.
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };

// adminRouter.use(requireAuth, requireRole('admin'));
```

The first block is `src/types/express.d.ts`. Tokens from an identity provider (Auth0, Cognito, Keycloak):
verify with their JWKS and also pass `audience` and `issuer` to `jwt.verify`.

## Webhooks (raw body + signature + idempotency)

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router, type RequestHandler } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

const TOLERANCE_SECONDS = 300; // reject old timestamps so a captured request can't be replayed

export function sign(secret: string, timestamp: string, rawBody: Buffer): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

// Generic HMAC-SHA256 check. Prefer the provider's SDK when it has one (e.g. stripe.webhooks.constructEvent).
export const verifySignature: RequestHandler = (req, _res, next) => {
  const invalid = () => next(new AppError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature'));
  if (!env.WEBHOOK_SECRET) return invalid(); // fail closed when the secret is not configured
  const timestamp = req.get('x-webhook-timestamp') ?? '';
  const signature = req.get('x-webhook-signature') ?? '';
  const raw: unknown = req.body;
  if (!Buffer.isBuffer(raw) || !/^\d+$/.test(timestamp)) return invalid();
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return invalid();

  const expected = Buffer.from(sign(env.WEBHOOK_SECRET, timestamp, raw));
  const given = Buffer.from(signature);
  // timingSafeEqual throws on different lengths, so check length first. Never compare with ===.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return invalid();
  next();
};

export const webhooksRouter = Router();

webhooksRouter.post(
  '/payments',
  express.raw({ type: 'application/json', limit: '1mb' }), // raw Buffer, not parsed JSON
  verifySignature,
  async (req, res) => {
    const event = JSON.parse((req.body as Buffer).toString('utf8')) as { id: string; type: string };
    // Providers retry: process each event id once (unique index on processed_events.event_id),
    // answer 2xx fast, and push slow work to a queue.
    // if (await repo.eventSeen(event.id)) return res.json({ data: { status: 'duplicate' } });
    req.log.info({ eventId: event.id, type: event.type }, 'webhook received');
    res.json({ data: { status: 'ok' } });
  },
);
```

Same idea for client calls that create payments or orders: accept an `Idempotency-Key` header, store
key + user + response, and on a repeat return the stored response instead of charging twice.

## lib/http.ts (outbound calls: timeouts and SSRF)

```ts
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { AppError } from './errors';

// Every outbound call gets a timeout. Node fetch otherwise waits up to ~5 minutes (undici defaults).
export function fetchWithTimeout(url: string | URL, init: RequestInit = {}, ms = 10_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms), redirect: 'manual' });
}

const blocked = new BlockList();
const v4: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
];
const v6: [string, number][] = [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]];
for (const [net, prefix] of v4) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of v6) blocked.addSubnet(net, prefix, 'ipv6');
// BlockList also matches IPv4-mapped IPv6 (::ffff:127.0.0.1) against the IPv4 rules.

// SSRF guard for user-supplied URLs (webhook targets, "import from URL", avatar URLs...).
// Blocks loopback, private ranges and cloud metadata (169.254.169.254). Keep redirects off:
// a public URL can redirect to an internal one.
export async function assertPublicUrl(raw: string): Promise<URL> {
  const bad = (message: string) => new AppError(400, 'INVALID_URL', message);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw bad('Invalid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw bad('URL must be http(s)');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw bad('URL host cannot be resolved');
  for (const a of addresses) {
    if (blocked.check(a.address, a.family === 6 ? 'ipv6' : 'ipv4')) {
      throw bad('URL points to an internal address');
    }
  }
  return url;
}
```

The DNS check has a small race (DNS rebinding). For strict cases, send outbound traffic through an
egress proxy that blocks private ranges.

## middleware/upload.ts (file upload limits)

```ts
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../lib/errors';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

// multer 2.x (1.x has known DoS CVEs). Always set limits; memoryStorage only for small files.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
}).single('file');

// Maps multer errors to our error shape. The client controls mimetype and originalname:
// check magic bytes (e.g. the file-type package) before storing, never use originalname as a path.
export const uploadAvatar: RequestHandler = (req, res, next) => {
  avatarUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'PAYLOAD_TOO_LARGE', 'File too large'));
    }
    if (err) return next(new AppError(400, 'INVALID_UPLOAD', 'Invalid upload'));
    if (!req.file) return next(new AppError(400, 'INVALID_UPLOAD', 'A png, jpeg or webp file is required'));
    next();
  });
};
```

## A feature module (users)

### users.schema.ts

```ts
import { z } from 'zod';

// Zod 4 style. On Zod 3 use z.string().uuid() and z.object({...}).strict().
export const UserIdParams = z.object({ id: z.uuid() });

// strictObject rejects unknown fields like "role": "admin" (mass assignment).
export const UpdateUserBody = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(20).optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserBody>;
```

### users.routes.ts

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { UpdateUserBody, UserIdParams } from './users.schema';
import * as controller from './users.controller';

export const usersRouter = Router();

usersRouter.get('/:id', requireAuth, validate({ params: UserIdParams }), controller.getUser);
usersRouter.patch(
  '/:id',
  requireAuth,
  validate({ params: UserIdParams, body: UpdateUserBody }),
  controller.updateUser,
);
```

### users.controller.ts

```ts
import type { RequestHandler } from 'express';
import * as service from './users.service';

// No try/catch: Express 5 forwards rejected promises to errorHandler.
export const getUser: RequestHandler = async (req, res) => {
  const { id } = res.locals.validated.params;
  const user = await service.getUser(req.user!, id);
  res.json({ data: user });
};

export const updateUser: RequestHandler = async (req, res) => {
  const { params, body } = res.locals.validated;
  const user = await service.updateUser(req.user!, params.id, body);
  res.json({ data: user });
};
```

### users.service.ts (ownership check lives here)

```ts
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import * as repo from './users.repository';
import type { UpdateUserInput } from './users.schema';

type Actor = { id: string; role: 'user' | 'admin' };

function assertCanAccess(actor: Actor, userId: string) {
  if (actor.role !== 'admin' && actor.id !== userId) throw new ForbiddenError();
}

const toDto = (u: repo.UserRow) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone });

export async function getUser(actor: Actor, id: string) {
  assertCanAccess(actor, id);
  const user = await repo.findById(id);
  if (!user) throw new NotFoundError('User');
  return toDto(user); // never return password_hash or internal columns
}

export async function updateUser(actor: Actor, id: string, input: UpdateUserInput) {
  assertCanAccess(actor, id);
  const user = await repo.update(id, input);
  if (!user) throw new NotFoundError('User');
  return toDto(user);
}
```

## tests/users.test.ts (Supertest, written before the code)

```ts
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { tokenFor, seedUser } from './helpers';

const app = createApp();

describe('PATCH /api/v1/users/:id', () => {
  it('updates own profile', async () => {
    const user = await seedUser();
    const res = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    expect(res.body.data).not.toHaveProperty('password_hash');
  });

  it('rejects unknown fields (mass assignment)', async () => {
    const user = await seedUser();
    const res = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without a token', async () => {
    const user = await seedUser();
    const res = await request(app).patch(`/api/v1/users/${user.id}`).send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it("returns 403 when editing another user's profile", async () => {
    const [a, b] = [await seedUser(), await seedUser()];
    const res = await request(app)
      .patch(`/api/v1/users/${b.id}`)
      .set('Authorization', `Bearer ${tokenFor(a)}`)
      .send({ name: 'hacked' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for a malformed id', async () => {
    const user = await seedUser();
    const res = await request(app)
      .patch('/api/v1/users/not-a-uuid')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ name: 'x' });
    expect(res.status).toBe(400);
  });
});
```

## tests/security.test.ts (auth, webhook and SSRF checks)

```ts
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { assertPublicUrl } from '../src/lib/http';
import { sign } from '../src/modules/webhooks/webhooks.routes';

// Needs JWT_SECRET and WEBHOOK_SECRET in the test env (.env.test or the test runner config).
const app = createApp();
const USER_URL = '/api/v1/users/00000000-0000-4000-8000-000000000000';

describe('requireAuth', () => {
  it('rejects a token without exp', async () => {
    const token = jwt.sign({ sub: 'u1' }, env.JWT_SECRET, { algorithm: 'HS256' });
    const res = await request(app).get(USER_URL).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned (alg none) token', async () => {
    const token = jwt.sign({ sub: 'u1' }, '', { algorithm: 'none', expiresIn: '5m' });
    const res = await request(app).get(USER_URL).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /webhooks/payments', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' });
  const now = () => String(Math.floor(Date.now() / 1000));
  const post = (payload: string, ts: string, sig: string) =>
    request(app)
      .post('/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('x-webhook-timestamp', ts)
      .set('x-webhook-signature', sig)
      .send(payload);

  it('accepts a valid signature', async () => {
    const ts = now();
    const res = await post(body, ts, sign(env.WEBHOOK_SECRET!, ts, Buffer.from(body)));
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body and an old timestamp', async () => {
    const ts = now();
    const sig = sign(env.WEBHOOK_SECRET!, ts, Buffer.from(body));
    expect((await post(body.replace('evt_1', 'evt_2'), ts, sig)).status).toBe(400);
    const old = String(Number(now()) - 3600);
    expect((await post(body, old, sign(env.WEBHOOK_SECRET!, old, Buffer.from(body)))).status).toBe(400);
  });
});

describe('assertPublicUrl (SSRF)', () => {
  it.each([
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.5',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'file:///etc/passwd',
  ])('blocks %s', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('allows a public IP', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/')).resolves.toBeInstanceOf(URL);
  });
});
```
