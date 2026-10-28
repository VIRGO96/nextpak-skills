# Review comment templates and report format

Labels follow [Conventional Comments](https://conventionalcomments.org/):

```text
label (decoration): subject

discussion
```

Decorations used here: `blocking`, `non-blocking`, `if-minor` (fix only if the change is small).

## Contents

- Finding templates
- Report format (default output to the developer)
- Posting to GitHub (only when the developer asks)
- Sources

## Finding templates

**Bug / security / breaking change (must-fix)**
```text
issue (blocking): <one-line problem>
<path>:<line>
What: <what the code does wrong>
Scenario: <who does what, and what goes wrong - concrete input and result>
Fix: <the change you suggest; short snippet if it helps>
```

**Required small change (must-fix)**
```text
todo (blocking): Revert unrelated reformat of <path>
<path>:1-<n>
What: the whole file was reformatted (quotes, semicolons) but the ticket doesn't touch it.
Scenario: another open branch edits this file and gets a conflict on every line; a real change hidden
in the reformat would pass review unseen.
Fix: git checkout origin/develop -- <path>; do the reformat as its own PR if wanted.
```

**Missing validation**
```text
issue (blocking): <field> is written to the DB without validation
<path>:<line>
What: req.body.<field> goes straight into <update call>; no schema checks type, required fields or extra keys.
Scenario: a client sends { "<field>": "x" } or { "<field>": { "<unexpected>": 1 } } and it is stored as is,
breaking <consumer> / letting the client set <field it shouldn't>.
Fix: add a Zod schema (.strict()) for the body and validate in the route; add a 400 test.
```

**Missing test (must-fix for an acceptance criterion or a new endpoint's 401/403 case; several
missing criteria = one finding listing them)**
```text
issue (blocking): No test for "<acceptance criterion>" (or: criteria 2, 3 and 4)
<test file or "no test file">
What: the criterion is implemented at <path>:<line> but no test exercises it.
Scenario: a later change removes the check and every test still passes.
Fix: add a test that <does X> and expects <status/result> (see testing-qa).
```

**Should-fix**
```text
suggestion (non-blocking): <improvement>
<path>:<line>
What / why: <the problem and the principle behind it>
Fix: <change>
```

**Nit / question / praise**
```text
nitpick (non-blocking): `data` -> `order` would say what this holds. <path>:<line>
question (non-blocking): Should an archived order still accept a new address? The ticket doesn't say. <path>:<line>
praise: The repository query takes both id and userId - good, it can't leak across users. <path>:<line>
```

## Report format (default output to the developer)

```markdown
## Review: <PR title> (#<n>) - <Request changes | Approve with suggestions | Approve>

**Summary:** <1-3 sentences: what the PR does, the main problems>
**Ticket:** <id/link> - criteria met: <x of y> (partly met = not met)
**CI:** <green / red / not run>

### Must-fix (blocking)
1. issue (blocking): ...

### Should-fix (non-blocking)
1. suggestion (non-blocking): ...

### Nits
1. nitpick (non-blocking): ...

### Questions (blocking questions go under Must-fix)
1. question (non-blocking): ...

### Good
- praise: ...

### Checked / not checked
- Checked: <passes done, files read, tests run>
- Not checked: <what and why>

### Recurring (for docs-keeper)
- <finding type> - seen before in <where>; suggest <lint rule / test / doc rule>
```

CI mode appends one last line: `REVIEW_RESULT: blocking=<n> should_fix=<n> nit=<n>`

## Posting to GitHub (only when the developer asks)

Summary review ([gh pr review](https://cli.github.com/manual/gh_pr_review)):
```bash
gh pr review 42 --request-changes --body-file review.md
gh pr review 42 --approve --body "Approve with suggestions: see 2 non-blocking comments."
gh pr review 42 --comment --body-file review.md      # CI, or reviewing your own PR
```

Inline comments in one review ([REST: create a review](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request)).
`line` is the line number in the new file (`side: RIGHT`); use `start_line` for a range. Write the JSON
to a file and pass it with `--input` (passing an array with `-f` turns it into a string):

```bash
cat > review.json <<'EOF'
{
  "event": "REQUEST_CHANGES",
  "body": "2 blocking findings, details inline.",
  "comments": [
    { "path": "src/routes/orders.js", "line": 24, "side": "RIGHT",
      "body": "issue (blocking): Any logged-in user can change another user's order address\n\nScenario: ..." }
  ]
}
EOF
gh api repos/{owner}/{repo}/pulls/42/reviews --method POST --input review.json
```

Leave out `commit_id` to review the latest commit. Without `event` the review stays `PENDING`.
After posting, open the PR and check the comments landed on the right lines.

GitHub review events ([about PR reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews)):
Comment = feedback without approval; Approve = ready to merge; Request changes = must be addressed
before merge. Authors can't approve their own PR.

## Sources

- Conventional Comments: https://conventionalcomments.org/
- Google eng-practices, reviewer guide: https://google.github.io/eng-practices/review/reviewer/
  (standard, looking-for, speed, comments pages)
- GitHub docs, PR reviews: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews
- GitHub REST, reviews: https://docs.github.com/en/rest/pulls/reviews
- gh CLI: https://cli.github.com/manual/gh_pr_review
- obra/superpowers receiving-code-review (MIT): https://github.com/obra/superpowers/tree/main/skills/receiving-code-review
