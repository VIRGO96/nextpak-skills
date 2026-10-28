import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionState } from '@/lib/action-state';
import { ProjectForm } from './project-form';

function setup(result: ActionState = { status: 'success', message: 'Project created.' }) {
  const action = vi.fn<(prev: ActionState, formData: FormData) => Promise<ActionState>>(
    async () => result,
  );
  const user = userEvent.setup();
  render(<ProjectForm action={action} />);
  return { action, user };
}

describe('ProjectForm', () => {
  it('submits valid input and announces success', async () => {
    const { action, user } = setup();

    await user.type(screen.getByLabelText('Name'), 'Website redesign');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Project created.');
    expect(action).toHaveBeenCalledOnce();
    const formData = action.mock.calls[0][1];
    expect(formData.get('name')).toBe('Website redesign');
  });

  it('shows a field error and does not call the server when name is empty', async () => {
    const { action, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Create project' }));

    const name = screen.getByLabelText('Name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Name is required');
    expect(action).not.toHaveBeenCalled();
  });

  it('shows errors returned by the server', async () => {
    const { user } = setup({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { name: ['Name is already taken'] },
    });

    await user.type(screen.getByLabelText('Name'), 'Duplicate');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText('Name is already taken')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Please fix the highlighted fields.');
  });

  it('can be completed with the keyboard only', async () => {
    const { action, user } = setup();

    await user.tab();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await user.keyboard('Roadmap{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Project created.');
    expect(action).toHaveBeenCalledOnce();
  });
});
