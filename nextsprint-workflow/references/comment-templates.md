# Comment templates (HTML)

NextSprint renders comments and descriptions as HTML. Use `<p>`, `<ul>`, `<li>`, `<strong>`, `<em>`,
`<code>`, `<br>`. Never Markdown. Keep each comment short: a lead should read it in 10 seconds.

Rules for every comment:
- One comment per event (started, plan ready, blocked, unblocked, scope change, PR opened).
- Start with a bold event word so the card history scans easily.
- End with `<p><em>Posted by AI agent on behalf of the assignee.</em></p>` so readers know an agent
  wrote it (agent-disclosure practice from Linear's Agent Interaction Guidelines).
- No secrets, `.env` values, tokens, raw stack traces, full logs, or customer data. Summarize errors
  ("500 on POST /orders when cart is empty") and point to where the details live (PR, Sentry issue id).
- `@Name` notifies that board member. Mention only the person who must act; leads, managers and client
  contacts only with the developer's OK.

## Started

```html
<p><strong>Started</strong></p>
<ul>
  <li><strong>Branch:</strong> <code>feat/order-export-csv</code></li>
  <li><strong>Plan:</strong> add CSV export endpoint, add Export button on Orders page, tests for both.</li>
  <li><strong>Open questions:</strong> should cancelled orders be included?</li>
</ul>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## Rework started (card came back from QA)

```html
<p><strong>Rework started</strong></p>
<ul>
  <li><strong>QA reported:</strong> export ignores the date filter.</li>
  <li><strong>Plan:</strong> pass filter params to the export query, add a test for filtered export.</li>
</ul>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## Plan / spec ready

```html
<p><strong>Plan ready</strong></p>
<ul>
  <li><strong>Goal:</strong> managers can download filtered orders as CSV.</li>
  <li><strong>Out of scope:</strong> Excel format, scheduled exports.</li>
  <li><strong>Risks / gaps:</strong> large exports may time out; will stream the file.</li>
</ul>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## Blocked

```html
<p><strong>Blocked</strong></p>
<ul>
  <li><strong>What:</strong> payment webhook item cannot be finished.</li>
  <li><strong>Why:</strong> staging webhook secret is not configured, so signature checks fail.</li>
  <li><strong>Needed:</strong> @Name please add the staging webhook secret to the staging environment.</li>
  <li><strong>Meanwhile:</strong> continuing with the refund UI items.</li>
</ul>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

(Name the missing secret, never paste its value.)

## Unblocked

```html
<p><strong>Unblocked</strong>: staging webhook secret added; resuming the webhook item.</p>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## Scope change agreed

```html
<p><strong>Scope change</strong>: added "export includes cancelled orders" after confirming with @Name.</p>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## PR opened (dev done)

```html
<p><strong>PR opened - dev done</strong></p>
<ul>
  <li><strong>PR:</strong> <a href="https://github.com/org/repo/pull/123">#123</a></li>
  <li><strong>Changed:</strong> CSV export endpoint, Export button, date-filter support.</li>
  <li><strong>Tests:</strong> <code>npm test</code> 48 passed, 0 failed; lint and typecheck clean; Playwright export flow passed.</li>
  <li><strong>QA please check:</strong> export with and without filters; 5k+ orders.</li>
  <li><strong>Not done / limits:</strong> none.</li>
</ul>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## Need reproduction info (bug card)

```html
<p><strong>Need reproduction info before fixing</strong></p>
<p>Could not reproduce yet. Please add:</p>
<ul>
  <li>Steps to reproduce (exact clicks / requests)</li>
  <li>Expected result and actual result</li>
  <li>Environment: app or API version, browser/device, staging or production</li>
  <li>How often it happens, and a screenshot or Sentry issue id if available</li>
</ul>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## Out-of-scope bug noted (on the current card)

```html
<p><strong>Found an unrelated bug</strong>: created a separate card "Orders page: pagination resets after filter" instead of fixing it in this PR.</p>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## New bug card (`create_task` description)

Title: short, describes the problem, not the fix, e.g. `Orders page: pagination resets after applying a filter`.
Labels: `BUG` if the board has it. List: the board's backlog (or bug-inbox) list. No assignee or
priority unless the developer says so.

```html
<p><strong>Found while working on:</strong> "Order export CSV" card.</p>
<p><strong>Steps to reproduce</strong></p>
<ol>
  <li>Open Orders, go to page 3.</li>
  <li>Apply the status filter "Shipped".</li>
</ol>
<p><strong>Expected:</strong> filtered results, page 1, pagination still works.</p>
<p><strong>Actual:</strong> list shows page 3 of the unfiltered results.</p>
<p><strong>Environment:</strong> staging, Chrome desktop. Happens every time.</p>
<p><strong>Notes:</strong> likely the page state is not reset on filter change (not investigated further).</p>
<p><em>Posted by AI agent on behalf of the assignee.</em></p>
```

## Pending board updates (shown to the developer when the MCP is down)

```text
Pending board updates (NextSprint was not reachable):
1. Card "Order export CSV": move to "dev done"
2. Same card: attach link https://github.com/org/repo/pull/123
3. Same card: post "PR opened" comment (HTML below)
```
