import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/tests/render';
import { server } from '@/tests/msw-server';
import { ImagePicker } from './ImagePicker';
import type { UploadResult } from '@/api/uploads';

describe('ImagePicker', () => {
  it('uploads the chosen file and calls onAttached with the URL', async () => {
    server.use(
      http.post('/api/uploads', () =>
        HttpResponse.json({ url: '/uploads/abc.png', mediaType: 'image' }, { status: 201 }),
      ),
    );

    let attachedResult: UploadResult | null = null;
    renderWithProviders(
      <ImagePicker
        attached={null}
        onAttached={(r) => { attachedResult = r; }}
      />,
    );

    const user = userEvent.setup();
    const file = new File([new Uint8Array([0])], 'a.png', { type: 'image/png' });
    const input = screen.getByLabelText(/upload image/i) as HTMLInputElement;
    await user.upload(input, file);

    // Wait for the mutation to resolve.
    await screen.findByRole('button', { name: /add image/i });
    expect(attachedResult).toEqual({ url: '/uploads/abc.png', mediaType: 'image' });
  });

  it('shows the thumbnail and clears via remove button', async () => {
    const attached: UploadResult = { url: '/uploads/abc.png', mediaType: 'image' };
    let cleared = false;
    const { container } = renderWithProviders(
      <ImagePicker attached={attached} onAttached={(r) => { if (r === null) cleared = true; }} />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.src).toContain('/uploads/abc.png');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /remove image/i }));
    expect(cleared).toBe(true);
  });
});
