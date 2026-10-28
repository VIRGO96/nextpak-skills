import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionState } from '@/lib/action-state';
import { FavoriteButton } from './favorite-button';

describe('FavoriteButton', () => {
  it('flips at once, then rolls back and explains when the server refuses', async () => {
    let finish!: (r: ActionState) => void;
    const action = vi.fn(() => new Promise<ActionState>((r) => (finish = r)));
    const user = userEvent.setup();
    render(<FavoriteButton projectName="Alpha" favorite={false} action={action} />);

    const button = screen.getByRole('button', { name: 'Favorite Alpha' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true'); // optimistic

    finish({ status: 'error', message: 'You do not have access to this item.' });
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access');
    expect(button).toHaveAttribute('aria-pressed', 'false'); // rolled back
    expect(action).toHaveBeenCalledOnce();
  });
});
