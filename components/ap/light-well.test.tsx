import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LightWell } from './light-well';

// The signature image treatment: cutout plate + multiply vs photo lighten,
// the reveal-on-load fade, and the bare name plate when there is no image.

describe('LightWell', () => {
  it('defaults to a cutout plate with multiply blend inside a 4:5 well', () => {
    const { container } = render(<LightWell src="https://x.test/a.jpg" alt="A lamp" />);
    expect(container.firstElementChild).toHaveClass('aspect-[4/5]', 'border', 'bg-card');
    expect(container.querySelector('.bg-plate')).not.toBeNull();
    const img = screen.getByRole('img', { name: 'A lamp' });
    expect(img).toHaveAttribute('src', 'https://x.test/a.jpg');
    expect(img).toHaveClass('object-contain', 'mix-blend-multiply');
  });

  it('uses lighten blend and cover fit in photo mode', () => {
    const { container } = render(<LightWell src="https://x.test/a.jpg" alt="Room" mode="photo" sizes="50vw" />);
    expect(container.querySelector('.bg-plate')).toBeNull();
    const img = screen.getByRole('img', { name: 'Room' });
    expect(img).toHaveClass('object-cover', '[mix-blend-mode:lighten]');
    expect(img).toHaveAttribute('sizes', '50vw');
  });

  it('fades the image in once it loads', () => {
    render(<LightWell src="https://x.test/a.jpg" alt="A" />);
    const img = screen.getByRole('img');
    const fader = img.closest('.transition-opacity')!;
    expect(fader).toHaveClass('opacity-0');
    fireEvent.load(img);
    expect(fader).toHaveClass('opacity-100');
  });

  it('shows the name on the plate when there is no src', () => {
    const { container } = render(<LightWell alt="A" name="Walnut credenza" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.bg-plate')).not.toBeNull();
    expect(screen.getByText('Walnut credenza')).toBeInTheDocument();
  });

  it('shows a bare plate when there is no src and no name', () => {
    const { container } = render(<LightWell alt="A" src="" />);
    expect(container.querySelector('.bg-plate')).not.toBeNull();
    expect(container.textContent).toBe('');
  });

  it('falls back to the name plate when the image fails to load', () => {
    render(<LightWell src="https://x.test/broken.jpg" alt="A" name="Broken piece" />);
    expect(screen.queryByText('Broken piece')).toBeNull();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Broken piece')).toBeInTheDocument();
  });

  it('fills its parent instead of holding the aspect ratio when fill is set', () => {
    const { container } = render(<LightWell src="https://x.test/a.jpg" alt="A" fill lit className="mx-auto" />);
    expect(container.firstElementChild).toHaveClass('h-full', 'w-full', 'mx-auto');
    expect(container.firstElementChild).not.toHaveClass('aspect-[4/5]');
  });
});
