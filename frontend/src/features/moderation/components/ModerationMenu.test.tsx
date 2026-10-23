import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/tests/render';
import { server, handlers } from '@/tests/msw-server';
import { ModerationMenu } from './ModerationMenu';

describe('ModerationMenu', () => {
  it('renders an icon-only "More actions" trigger and reveals Report + Block on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ModerationMenu targetType="announcement" targetId="a1" authorId="u-author" authorName="Garcia" />,
    );

    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: /report this post/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /block garcia/i })).toBeInTheDocument();
  });

  it('does not offer a Block item on a DM message target', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ModerationMenu targetType="message" targetId="m1" authorId="u-author" authorName="Garcia" />,
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByRole('menuitem', { name: /report this message/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /block/i })).not.toBeInTheDocument();
  });

  it('omits the Block item entirely when the author has been removed (null authorId/authorName)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ModerationMenu targetType="comment" targetId="c1" authorId={null} authorName={null} />,
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByRole('menuitem', { name: /report this comment/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /block/i })).not.toBeInTheDocument();
  });

  it('closes on outside click and on Escape, returning focus to the trigger on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ModerationMenu targetType="announcement" targetId="a1" authorId="u-author" authorName="Garcia" />
        <button type="button">outside</button>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'More actions' });

    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('opens ReportModal with a content-type-specific title when Report is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ModerationMenu targetType="comment" targetId="c1" authorId="u-author" authorName="Garcia" />,
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: /report this comment/i }));

    expect(screen.getByRole('dialog', { name: /report this comment/i })).toBeInTheDocument();
  });

  it('fires the block mutation and reports the resolved canonical family id back to the caller', async () => {
    server.use(handlers.moderationCreateBlock({
      blockerFamilyId: 'f-me',
      blockedFamilyId: 'f-garcia-canonical',
      createdAt: '2026-09-04T00:00:00Z',
    }));
    const onBlocked = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ModerationMenu targetType="announcement" targetId="a1" authorId="u-author" authorName="Garcia" onBlocked={onBlocked} />,
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: /block garcia/i }));

    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalledWith('f-garcia-canonical'));
    // Menu closes immediately on tap, before the mutation even resolves.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('ModerationMenu within a menu panel', () => {
  it('exposes the panel with role="menu" containing menuitem-role children', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ModerationMenu targetType="announcement" targetId="a1" authorId="u-author" authorName="Garcia" />,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));

    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').length).toBe(2);
  });
});
