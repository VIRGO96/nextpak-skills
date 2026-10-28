# Playwright: journey test, config, MCP evidence

## Contents

- Test (one journey + one edge case)
- Playwright MCP run (no test file yet)

## Test (one journey + one edge case)

Level 2 change = the first test only. Level 3 = add edge-case tests like the second one
(failed network), plus double submit / refresh / expired session where they apply.

### `e2e/invite.spec.ts`

```ts
import { test, expect } from '@playwright/test';

// Journey for the changed feature: open page -> invite -> see it in the list.
test('admin invites a teammate', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('sara@example.com');
  await page.getByRole('button', { name: 'Send invite' }).click();

  // Web-first assertions retry until true. No waitForTimeout.
  await expect(page.getByRole('status')).toHaveText('Invite sent');
  await expect(page.getByRole('list', { name: 'Pending invites' })).toContainText('sara@example.com');

  // Evidence for the PR.
  await page.screenshot({ path: testInfo.outputPath('invite-sent.png'), fullPage: true });
});

// Edge-case pass (high-risk changes): failed network.
test('shows an error and allows retry when the API fails', async ({ page }) => {
  await page.route('**/api/invites', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/');
  await page.getByLabel('Email').fill('sara@example.com');
  await page.getByRole('button', { name: 'Send invite' }).click();

  await expect(page.getByRole('alert')).toHaveText(/could not send invite/i);
  await expect(page.getByRole('button', { name: 'Send invite' })).toBeEnabled();
});
```

### `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node fixture/server.mjs', // your app: 'npm run dev' or 'npm run start'
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
```

Commands:

```bash
npm i -D @playwright/test && npx playwright install chromium
npx playwright test                 # runs e2e/, starts the app via webServer
npx playwright test --ui            # debug locally
npx playwright show-report          # HTML report; traces for failed retries
```

Verified output:

```text
Running 2 tests using 2 workers
  ok 1 [chromium] › e2e/invite.spec.ts › shows an error and allows retry when the API fails
  ok 2 [chromium] › e2e/invite.spec.ts › admin invites a teammate
  2 passed (4.0s)
```

Logged-in tests: create the session once in a setup project and reuse it with `storageState`
(see playwright.dev/docs/auth). Don't log in through the UI in every test.

## Playwright MCP run (no test file yet)

Prompt template. Fill in the brackets, keep the structure:

```text
Using Playwright MCP:
1. Open [URL] and sign in as [test account] (password from .env.test, never print it).
2. Do the journey: [step], [step], [step].
3. After each step, check: [what must be visible]. Use browser_snapshot to find elements by role/name.
4. Save screenshots to qa-evidence/[ticket]-[step].png with browser_take_screenshot.
5. At the end, read browser_console_messages and browser_network_requests.
Report as a table: step | expected | actual | pass/fail, then console errors and failed (4xx/5xx) requests.
Do not change any data outside this test account.
```

Edge-case pass (Level 3), add to the prompt as needed:

```text
Then repeat with these edge cases and report each one separately:
- Double-click the submit button: only one [record/request] must be created.
- Reload the page on step [n]: flow must resume or restart cleanly.
- Sign in as [second test user] and open [URL of the first user's record]: must show 403/not found.
- Block [API path] to fail (or stop the API) and submit: error shown, retry possible.
- Clear cookies mid-flow and continue: must go to login, no data lost or shown.
```

PR evidence block:

```markdown
### QA evidence (risk level 2: changes the invite form)
- Journey: admin invites teammate: PASS (qa-evidence/invite-sent.png)
- Console errors: none. Failed requests: none.
- Automated: `npm test` 13 passed, `npx playwright test` 2 passed (output below)
```
