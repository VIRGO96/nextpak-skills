# React component: React Testing Library + user-event (Vitest)

Feature: invite form. Criteria: send an invite by email; empty email shows an error and sends
nothing; double click sends one request; a failed request shows an error and allows retry.

Setup: `npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`.
Add `import '@testing-library/jest-dom/vitest';` to a setup file (`test.setupFiles` in `vitest.config.ts`).
Jest: same test code, use `jest.fn()` instead of `vi.fn()` and `testEnvironment: 'jsdom'`.

Rules this example follows (Testing Library guiding principles):
- Query like a user: `getByRole` > `getByLabelText` > `getByText` > `getByTestId` (last resort).
- Use `userEvent.setup()` + `await user.click(...)`, not `fireEvent`.
- `findBy...` for things that appear later (async). Never `setTimeout` in a test.
- Assert what the user sees (`role="alert"`, button disabled), not component state or props.

## Contents

- `tests/InviteForm.test.tsx`
- RED: output against an empty `<form />`
- GREEN
- `src/InviteForm.tsx`

### `tests/InviteForm.test.tsx`

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteForm } from '../src/InviteForm';

afterEach(cleanup);

describe('InviteForm', () => {
  it('sends the invite and shows a success message', async () => {
    const user = userEvent.setup();
    const onInvite = vi.fn().mockResolvedValue(undefined);
    render(<InviteForm onInvite={onInvite} />);

    await user.type(screen.getByLabelText(/email/i), 'sara@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    expect(onInvite).toHaveBeenCalledWith('sara@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent(/invite sent/i);
  });

  it('shows a validation error and does not call the API for an empty email', async () => {
    const user = userEvent.setup();
    const onInvite = vi.fn();
    render(<InviteForm onInvite={onInvite} />);

    await user.click(screen.getByRole('button', { name: /send invite/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/email is required/i);
    expect(onInvite).not.toHaveBeenCalled();
  });

  it('double click sends only one request (button disabled while pending)', async () => {
    const user = userEvent.setup();
    const onInvite = vi.fn(() => new Promise<void>(() => {})); // never resolves
    render(<InviteForm onInvite={onInvite} />);

    await user.type(screen.getByLabelText(/email/i), 'sara@example.com');
    await user.dblClick(screen.getByRole('button', { name: /send invite/i }));

    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  });

  it('shows the server error when the request fails', async () => {
    const user = userEvent.setup();
    const onInvite = vi.fn().mockRejectedValue(new Error('Network down'));
    render(<InviteForm onInvite={onInvite} />);

    await user.type(screen.getByLabelText(/email/i), 'sara@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send invite/i);
    expect(screen.getByRole('button', { name: /send invite/i })).toBeEnabled(); // can retry
  });
});
```

### RED: output against an empty `<form />`

```text
 × sends the invite and shows a success message
 × shows a validation error and does not call the API for an empty email
 × double click sends only one request (button disabled while pending)
 × shows the server error when the request fails
TestingLibraryElementError: Unable to find a label with the text of: /email/i
Tests  4 failed (4)
```

### GREEN

```text
Tests  4 passed (4)
```

### `src/InviteForm.tsx`

```tsx
import { useState, type FormEvent } from 'react';

type Props = { onInvite: (email: string) => Promise<void> };

export function InviteForm({ onInvite }: Props) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (state === 'pending') return;
    if (!email.trim()) return setError('Email is required');
    setError('');
    setState('pending');
    try {
      await onInvite(email.trim());
      setState('sent');
    } catch {
      setError('Could not send invite. Try again.');
      setState('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="invite-email">Email</label>
      <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" disabled={state === 'pending'}>
        {state === 'pending' ? 'Sending...' : 'Send invite'}
      </button>
      {error && <p role="alert">{error}</p>}
      {state === 'sent' && <p role="status">Invite sent</p>}
    </form>
  );
}
```
