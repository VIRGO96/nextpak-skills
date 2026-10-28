import { z } from 'zod';

// Only NEXT_PUBLIC_ values. They are inlined into the browser bundle at build time,
// so they must never hold secrets. Reference each one by its full literal name -
// Next.js only inlines `process.env.NEXT_PUBLIC_X`, not dynamic lookups.
export const publicEnv = z
  .object({ NEXT_PUBLIC_APP_URL: z.url() })
  .parse({ NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL });
