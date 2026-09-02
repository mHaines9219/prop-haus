import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ItemGallery } from './item-gallery';

// Item-detail gallery: hero well plus up to eight thumbnail toggles.

const imgs = (n: number) => Array.from({ length: n }, (_, i) => `https://x.test/${i + 1}.jpg`);
const hero = () => screen.getByRole('img', { name: 'Lamp' });

describe('ItemGallery', () => {
  it('renders one hero and no thumbnails for a single image', () => {
    render(<ItemGallery images={imgs(1)} name="Lamp" />);
    expect(hero()).toHaveAttribute('src', 'https://x.test/1.jpg');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows the name on a bare plate when there are no images', () => {
    render(<ItemGallery images={[]} name="Lamp" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Lamp')).toBeInTheDocument();
  });

  it('renders a pressed thumbnail per image and switches the hero on click', async () => {
    render(<ItemGallery images={imgs(3)} name="Lamp" />);
    const thumbs = screen.getAllByRole('button', { name: /View image/ });
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Lamp thumbnail 2' })).toBeInTheDocument();

    await userEvent.click(thumbs[1]);
    expect(hero()).toHaveAttribute('src', 'https://x.test/2.jpg');
    expect(thumbs[1]).toHaveAttribute('aria-pressed', 'true');
    expect(thumbs[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('is keyboard operable', async () => {
    render(<ItemGallery images={imgs(2)} name="Lamp" />);
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'View image 2' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(hero()).toHaveAttribute('src', 'https://x.test/2.jpg');
  });

  it('caps the strip at eight thumbnails', () => {
    render(<ItemGallery images={imgs(11)} name="Lamp" />);
    expect(screen.getAllByRole('button', { name: /View image/ })).toHaveLength(8);
  });
});
