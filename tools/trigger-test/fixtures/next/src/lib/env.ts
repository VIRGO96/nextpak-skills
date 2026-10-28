import 'server-only'; // build error if a Client Component imports this file
import { z } from 'zod';

const ServerEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
});

const parsed = ServerEnv.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a clear message; never print the values themselves.
  throw new Error(
    'Invalid server environment variables:\n' +
      parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'),
  );
}

export const env = parsed.data;
