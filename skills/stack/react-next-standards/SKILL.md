---
name: react-next-standards
description: Use when building or changing React frontend code in a Next.js App Router or React + Vite project - adding a page, route, layout, component, form, Server Action, Route Handler, data fetching or caching, a TanStack Query hook, loading, empty or error states, auth redirects, env vars, images, accessibility or hydration fixes, including bug fixes and refactors. Triggers - build a settings page, add validation to this form, create this component, add a filter to the dashboard, fix this hydration error, add a Server Action, fix this Next.js page. Keywords - React, Next.js, Vite, use client, use server, Server Components, useActionState, useOptimistic, Zod, proxy.ts, next/image, error.tsx, loading.tsx, NEXT_PUBLIC_, VITE_. For what to test and the tests-first process use testing-qa. Not for React Native apps or Node/Express backend services.
metadata:
  author: NextPak AI Team
  version: 0.2.1
---

# React + Next.js Standards

Rules for every change in a React frontend (Next.js App Router or React + Vite). Goal: passes review and QA first time.

## 0. Before writing code

1. Read the project's `AGENTS.md` / `CLAUDE.md` and any doc for the area you touch.
2. **Detect the project type and versions** from `package.json`:
   - `next` + an `app/` (or `src/app/`) folder = Next.js App Router. Only `pages/` = Pages Router:
     follow its existing patterns; App Router rules (Server Components, Server Actions) don't apply.
   - `vite` + `react` = plain React SPA. There is no server: everything runs in the browser.
   - Next.js 16+ ships its own docs in `node_modules/next/dist/docs/` (`01-app/02-guides/` has
     authentication, data-security, caching, forms). When unsure about an API, read those (they match
     the installed version) instead of guessing from memory. Next 16 renamed `middleware.ts` to `proxy.ts`.
3. Look at 1-2 existing features and **match their patterns** (folder layout, data fetching, form
   library, styling, test setup). If the project uses React Hook Form, SWR, Redux, Jest, MUI... keep
   using it. Never add a second library for the same job.
4. The defaults below apply to new projects, or to code that has no pattern yet.

## CRITICAL: stay inside the ticket's scope

- **Never change an existing component's props, an existing route/URL, a Server Action's signature
  or return shape, or how existing API responses/errors are handled** unless the ticket says so.
  Other pages, tests and the backend depend on them. New code can use the conventions below.
- **Don't move, rename or delete existing files** to fit the structure below. Put new code in the new
  structure; refactoring old code is its own ticket.
- Don't "upgrade while you're there" (Next/React versions, ESLint config, styling system, state library).
- If a rule would need a big change, do the minimum and list the rest under "Follow-ups".

## 1. Default stack (new projects)

| Job | Use |
|---|---|
| Framework | Next.js App Router (current major) or React + Vite, TypeScript `strict` |
| Validation | Zod - one schema shared by the form and the server |
| Server state | Next: Server Components + Server Actions. Vite / client islands: TanStack Query |
| Client state | `useState` / `useReducer`, lifted state, URL search params. Context for low-frequency values (theme, current user) |
| Tests | Vitest (or the project's Jest) + React Testing Library + user-event; Playwright for E2E |
| Deep performance rules | Vercel's `vercel-react-best-practices` skill (see section 11) |

## 2. Project structure (by feature)

```
src/
  app/                      # Next: routes only - page/layout/loading/error/route files
    projects/page.tsx       #   thin: fetch via DAL, render feature components
  features/<feature>/
    components/             # UI for this feature (+ colocated *.test.tsx)
    hooks/                  # client hooks (TanStack Query, UI logic)
    actions.ts              # Next: 'use server' actions (thin)
    data.ts                 # Next: Data Access Layer, import 'server-only'
    schema.ts               # Zod schemas + inferred types + DTO types
  components/ui/            # shared, feature-agnostic UI (Button, Dialog...)
  lib/                      # env, auth, api-client, errors
e2e/                        # Playwright specs
```

- Route files stay thin. Features don't import other features' internals; shared code goes to
  `components/ui` or `lib`. Vite: same `features/` layout.

## 3. Server vs Client Components (Next.js)

- Components are **Server Components by default**. Add `'use client'` only when the component needs
  state, effects, event handlers or browser APIs.
- Keep `'use client'` at the **leaves**: a page stays a Server Component and renders a small client
  `<DeleteButton>` or `<Form>`, instead of marking the whole page as client.
- Pass **only the fields the client needs** (DTOs). Never pass a raw DB row or user object to a
  Client Component; everything in props ends up in the browser.
- Server-only modules (DB, secrets, DAL) start with `import 'server-only'` so a client import fails the build.

## 4. Data fetching and caching

- **Next.js:** fetch in Server Components through a **Data Access Layer** (`data.ts`, `server-only`)
  that checks auth and returns DTOs. Never `fetch` your own Route Handlers from Server Components.
- **No waterfalls:** start independent requests together (`Promise.all`), or split into components
  with their own `<Suspense>` so each streams independently.
- **Caching depends on the version and config. Check `next.config` first:**
  - `cacheComponents: true` (+ `partialPrefetching`; both on in new Next 16 apps): nothing is cached
    unless you add `'use cache'` + `cacheLife()` (+ `cacheTag()`). Uncached or runtime data (`cookies()`,
    `headers()`, `searchParams`) must sit inside `<Suspense>` (a `loading.tsx` counts).
  - Without it, follow the project's existing `fetch` cache / `revalidate` options.
  - Never put per-user data in a shared cache. After a mutation, revalidate (`revalidatePath`,
    `revalidateTag` / `updateTag`) so the user sees their change.
- **Vite / client components:** server state goes through **TanStack Query** (`useQuery` /
  `useMutation`, query keys defined next to the hook, invalidate after mutations). No `useEffect` +
  `fetch` + `useState` for server data.
- All HTTP calls from the browser go through one `apiFetch` helper (section 7).

## 5. Forms, Server Actions and "never trust the client"

- One Zod schema in `schema.ts`, used by the form (instant feedback) **and** the server (the real check).
- **Every Server Action is a public POST endpoint.** Even if the page checks login, the action must,
  in this order: (1) validate input with the schema (`safeParse`), (2) check the user is signed in,
  (3) check the user may act on **this** record (ownership/role), (4) mutate, (5) revalidate,
  (6) return a small result. Put 2-4 in the DAL so they can't be skipped.
- Take `ownerId`, `role`, `price`, `userId` from the session or DB, **never from form fields or props**.
  Hidden inputs and `.bind()` arguments are user input too: validate them.
- Expected errors (validation, not allowed) are **returned** as `{ status: 'error', message, fieldErrors }`
  and shown with `useActionState`. Unexpected errors are thrown and reach `error.tsx`.
- Return only what the UI needs, never the DB record. Disable submit while `pending` (no double submit).
- **Where auth checks go:** `proxy.ts` (was `middleware.ts`) = optimistic cookie check + redirect only,
  never the real authorization. **Layouts don't re-run on client navigation**, so never rely on a layout
  check. The real checks live in the DAL, every Server Action and every Route Handler.
- Vite: same schema on the client; the backend API must validate again (see the backend skill).

## 6. Environment variables

- **Next.js:** only `NEXT_PUBLIC_*` values reach the browser, inlined at build time. **Never put a
  secret in a `NEXT_PUBLIC_` variable.** Secrets are read only in server-only code (`lib/env.ts`,
  validated with Zod, `import 'server-only'`).
- **Vite:** only `VITE_*` values are exposed, and **everything exposed is public**. A Vite app has no
  place to keep secrets; they belong to the backend. Type them in `src/vite-env.d.ts`.
- Every new variable goes in `.env.example` and the PR description. `.env*.local` is never committed.

## 7. Errors, loading and empty states

- **Every async UI has 4 states: loading, empty, error, success.** QA checks all four.
- Next.js: add `loading.tsx` and `error.tsx` to every route segment that fetches data. `error.tsx` is a
  Client Component (`'use client'`) with a "Try again" button (`retry` prop in Next 16.3+; older
  versions use `reset`). Use `notFound()` + `not-found.tsx` for missing records.
- Vite: wrap routes in an error boundary (project's or `react-error-boundary`); handle `isPending`/`isError`/empty.
- **Consistent API errors:** `apiFetch` turns non-2xx responses into an `ApiError(status, code,
  message, requestId)` matching the backend shape `{ error: { code, message, requestId } }`. Map 401 to
  sign-in, 403 to "no access", 5xx to a generic message. **Never render raw server/stack text.**
- Component-level boundary in Next 16.3+: `catchError` from `next/error` (handles `redirect`/`notFound`).
- `try/catch` around code that can call `redirect()`, `notFound()` or `cookies()`: call
  `unstable_rethrow(err)` first in the `catch`, or you swallow Next.js internals.

## 8. Accessibility basics (QA checks these)

- Semantic HTML first: `<button>` for actions, `<a>`/`<Link>` for navigation, `<main>`, `<nav>`,
  headings in order. No clickable `<div>`.
- Every input has a visible `<label htmlFor>`; placeholders are not labels. Errors are linked with
  `aria-describedby` and the field gets `aria-invalid`.
- Messages that appear after an action use `role="status"` (polite) or `role="alert"`.
- Everything works with the keyboard (Tab, Enter, Space, Esc for dialogs) with a visible focus style.
- Images: meaningful `alt` (`alt=""` if decorative). Icon-only buttons get `aria-label`.

## 9. Performance basics

- No request waterfalls (section 4). Avoid huge client bundles: keep `'use client'` at leaves.
- Next.js: `next/image` for images (with `width`/`height` or `fill` + `sizes`); the LCP/hero image gets
  `fetchPriority="high"` (Next 16 deprecated `priority`; see qa-pitfalls). `next/font` for fonts,
  `next/link` for internal links. `next/dynamic` for heavy client-only parts (charts, editors, maps).
  Vite: `React.lazy` + `<Suspense>`.
- Avoid unnecessary re-renders: keep state close to where it's used, don't put fast-changing values in
  Context, derive values during render instead of syncing with `useEffect`, stable `key`s (never the index
  for lists that change). Don't sprinkle `useMemo`/`useCallback`; follow the project (React Compiler may be on).

## 10. Bugs QA finds most often (details + verified code: [references/qa-pitfalls.md](references/qa-pitfalls.md))

- **Hydration mismatch:** no `Date.now()`, `Math.random()`, `toLocaleString()` without locale + zone, or
  `window`/`localStorage` reads during render. Browser-only values go in `useEffect`. No `<div>` in `<p>`.
- **Dates and time zones:** store/send ISO UTC; format with `Intl.DateTimeFormat(locale, { timeZone })`
  using the user's zone. "Today" filters use the user's day boundaries.
- **Optimistic updates roll back:** `useOptimistic` (Server Actions) or TanStack `onMutate` + `onError`
  restore + `onSettled` invalidate. Show the error; never leave the fake value on screen.
- **XSS:** `dangerouslySetInnerHTML` only with sanitized HTML (DOMPurify). User links: allow only
  `http:`/`https:`. React's escaping does not cover these.
- **Double submit:** every submit/delete button is disabled while pending; the server stays idempotent
  where duplicates hurt (payments, invites).

## 11. Reuse Vercel's skill for deep performance rules

Vercel's `vercel-react-best-practices` skill (MIT, github.com/vercel-labs/agent-skills) has 70 rules in
8 priority categories (waterfalls and bundle size first). Don't copy them; install it next to this skill:
`npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices` (pick the agent with
`-a claude-code` or `-a antigravity`).

If it conflicts with the project's patterns or this skill, **the project and this skill win**.

## 12. TypeScript

- `strict: true`. **No `any`** (use `unknown` and narrow), no `@ts-ignore`, no `as` casts to silence errors.
- Data types come from the schema (`z.infer`) or a DTO type, not hand-copied interfaces.

## 13. Testing (React/Next specifics)

The **`testing-qa` skill owns the process**: tests first, watch them fail, risk levels for browser
checks, edge cases, evidence. Load it for every behavior change. React/Next specifics:

- RTL queries like a user: `getByRole` (with `name`) > `getByLabelText` > `getByText`; `getByTestId`
  last. `userEvent.setup()`, not `fireEvent`. Cover loading, empty, error and success states.
- Pass Server Actions into Client Components as props, so form tests can use a `vi.fn()` action.
- Per Server Action: invalid input, signed-out, **another user's record**, happy path. Mock only
  `next/headers`, `next/cache` and external services; the DAL and schema run for real.
- Async Server Components can't be rendered in Vitest: test their DAL/actions in unit tests and the
  page in Playwright, against a production build (`next build && next start`).
- Setup and full examples: [references/testing.md](references/testing.md).

## Definition of done (check before saying "done")

- [ ] Matches existing project patterns; no duplicate libraries added
- [ ] No existing component props, routes or action/API shapes changed; no files moved or deleted
- [ ] `'use client'` only on leaves that need it; no raw DB objects or secrets passed to the client
- [ ] Every Server Action / mutation re-validates input and checks auth **and** ownership on the server
- [ ] Loading, empty and error states exist for every async UI (`loading.tsx`/`error.tsx` in Next)
- [ ] Labels, keyboard use, alt text and semantic elements checked
- [ ] No hydration warnings in the browser console; dates formatted with an explicit zone
- [ ] Optimistic UI rolls back on error; submit buttons disabled while pending
- [ ] No `NEXT_PUBLIC_`/`VITE_` secrets; new env vars in `.env.example`
- [ ] No `any`, no `@ts-ignore`, no `console.log` left in committed code
- [ ] `testing-qa` followed (tests first, RED shown, risk level); `lint`, `typecheck`, tests green (output pasted)

## Red flags: stop and fix

- `'use client'` at the top of a `page.tsx` or `layout.tsx` "to make it work"
- A Server Action that uses `formData` without `safeParse`, or never calls auth
- A query by `id` with no ownership check (user A can open user B's data by changing the id)
- `useEffect(() => { fetch(...) }, [])` for server data
- A secret or API key in a `NEXT_PUBLIC_` / `VITE_` variable
- A spinner with no error or empty state; `error.message` from the server rendered to the user
- `dangerouslySetInnerHTML` with unsanitized data; auth checked only in `proxy.ts` or a layout
- `suppressHydrationWarning` added to make a hydration error go away
- "Tests pass" without showing the command output

## Reference code

Working, type-checked and tested templates (load only the one you need):
- [references/shared-lib.md](references/shared-lib.md): env validation, error classes, action result type, auth, `apiFetch`
- [references/nextjs-feature.md](references/nextjs-feature.md): schema, DAL, Server Actions, page, loading/error, form, Route Handler
- [references/client-fetching-vite.md](references/client-fetching-vite.md): TanStack Query hook + 4 states, Vite setup, `VITE_` env
- [references/testing.md](references/testing.md): Vitest/RTL/Playwright setup, form, action, query and E2E tests
- [references/qa-pitfalls.md](references/qa-pitfalls.md): hydration, dates/zones, optimistic rollback, XSS, auth placement, LCP
