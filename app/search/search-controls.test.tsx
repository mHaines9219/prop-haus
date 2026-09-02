import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchControls } from './search-controls';

// The results-page search bar: text goes up as (query, engine), a moodboard
// goes up as FormData, and the AI engine detours through the prompt modal.

vi.mock('motion/react', async () => {
  const React = await import('react');
  const STRIP = new Set([
    'initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'whileFocus',
    'layout', 'layoutId', 'variants', 'onAnimationComplete',
  ]);
  type Plain = React.ComponentType<Record<string, unknown>>;
  const cache = new Map<string, Plain>();
  const motion = new Proxy({} as Record<string, Plain>, {
    get(_t, tag: string) {
      let C = cache.get(tag);
      if (!C) {
        C = React.forwardRef<HTMLElement, Record<string, unknown>>(function Plain(props, ref) {
          const clean = Object.fromEntries(Object.entries(props).filter(([k]) => !STRIP.has(k)));
          return React.createElement(tag, { ...clean, ref });
        }) as unknown as Plain;
        cache.set(tag, C);
      }
      return C;
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

const createObjectURL = vi.fn(() => 'blob:preview');
const revokeObjectURL = vi.fn();

beforeAll(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

const onText = vi.fn();
const onMultipart = vi.fn();

beforeEach(() => {
  onText.mockReset();
  onMultipart.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderControls(over: Partial<{ initialQuery: string; initialEngine: 'keyword' | 'ai' }> = {}) {
  return render(
    <SearchControls
      initialQuery={over.initialQuery ?? ''}
      initialEngine={over.initialEngine ?? 'keyword'}
      onText={onText}
      onMultipart={onMultipart}
    />,
  );
}

const searchBox = () => screen.getByRole('searchbox', { name: 'Search props' });
const submitButton = (container: HTMLElement) => container.querySelector('button[type=submit]') as HTMLButtonElement;
const fileInput = (container: HTMLElement) => container.querySelector('input[type=file]') as HTMLInputElement;
const png = (name = 'board.png') => new File(['png'], name, { type: 'image/png' });
const pdf = (name = 'deck.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });

describe('text search', () => {
  it('starts from the URL query in keyword mode', () => {
    const { container } = renderControls({ initialQuery: '70s apartment' });
    expect(searchBox()).toHaveValue('70s apartment');
    expect(searchBox()).toHaveAttribute('placeholder', 'Describe the scene. Try 70s bachelor apartment.');
    expect(submitButton(container)).toHaveTextContent('Search');
    expect(screen.getByRole('button', { name: 'Ask AI', pressed: false })).toBeInTheDocument();
    expect(screen.getByText('Exact metadata matches, instant. Attach a moodboard for vision search.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits the trimmed query as a keyword search', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.type(searchBox(), '  brass lamp  ');
    await user.click(submitButton(container));
    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith('brass lamp', 'keyword');
    expect(onMultipart).not.toHaveBeenCalled();
  });

  it('submits on Enter', async () => {
    const user = userEvent.setup();
    renderControls();
    await user.type(searchBox(), 'credenza{Enter}');
    expect(onText).toHaveBeenCalledWith('credenza', 'keyword');
  });

  it('ignores an empty or whitespace submit', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.click(submitButton(container));
    await user.type(searchBox(), '   ');
    await user.click(submitButton(container));
    expect(onText).not.toHaveBeenCalled();
  });

  it('remembers the engine and mode in localStorage', () => {
    renderControls({ initialEngine: 'ai' });
    expect(window.localStorage.getItem('prophaus.searchEngine')).toBe('ai');
    expect(window.localStorage.getItem('prophaus.searchMode')).toBe('haiku');
  });
});

describe('AI engine', () => {
  it('starts armed when the URL asked for AI', () => {
    const { container } = renderControls({ initialQuery: 'noir office', initialEngine: 'ai' });
    expect(screen.getByRole('button', { name: 'Ask AI', pressed: true })).toBeInTheDocument();
    expect(submitButton(container)).toHaveTextContent('Ask AI');
    expect(screen.getByText('Interprets your brief and curates a set.')).toBeInTheDocument();
  });

  it('opens the prompt modal instead of navigating when submitted with AI armed', async () => {
    const user = userEvent.setup();
    const { container } = renderControls({ initialQuery: 'noir office', initialEngine: 'ai' });
    await user.click(submitButton(container));
    expect(onText).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'AI set curation' });
    expect(within(dialog).getByLabelText('Inspiration')).toHaveValue('noir office');
  });

  it('passes the modal brief and budget up as an AI search and mirrors it into the box', async () => {
    const user = userEvent.setup();
    const { container } = renderControls({ initialQuery: 'noir office', initialEngine: 'ai' });
    await user.click(submitButton(container));
    const dialog = screen.getByRole('dialog');
    const brief = within(dialog).getByLabelText('Inspiration');
    await user.clear(brief);
    await user.type(brief, 'Noir detective office, 1940s');
    await user.type(within(dialog).getByLabelText(/Budget/), '2,500');
    await user.click(within(dialog).getByRole('button', { name: 'Curate my set' }));

    expect(onText).toHaveBeenCalledWith('Noir detective office, 1940s', 'ai', 2500);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(searchBox()).toHaveValue('Noir detective office, 1940s');
  });

  it('sends a null budget when the field is blank', async () => {
    const user = userEvent.setup();
    const { container } = renderControls({ initialQuery: 'loft', initialEngine: 'ai' });
    await user.click(submitButton(container));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Curate my set' }));
    expect(onText).toHaveBeenCalledWith('loft', 'ai', null);
  });

  it('arms the engine and opens the modal from the chip, and closing keeps it armed', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.click(screen.getByRole('button', { name: 'Ask AI', pressed: false }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask AI', pressed: true })).toBeInTheDocument();
    expect(submitButton(container)).toHaveTextContent('Ask AI');
    expect(window.localStorage.getItem('prophaus.searchEngine')).toBe('ai');
  });

  it('disarms the engine on a second chip click without a modal', async () => {
    const user = userEvent.setup();
    const { container } = renderControls({ initialEngine: 'ai' });
    await user.click(screen.getByRole('button', { name: 'Ask AI', pressed: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask AI', pressed: false })).toBeInTheDocument();
    expect(submitButton(container)).toHaveTextContent('Search');
    expect(window.localStorage.getItem('prophaus.searchEngine')).toBe('keyword');
  });
});

describe('moodboard attachments', () => {
  it('opens the picker from the Moodboard button', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    await user.click(screen.getByRole('button', { name: 'Attach a moodboard' }));
    expect(click.mock.instances[0]).toBe(fileInput(container));
  });

  it('accepts images and PDFs, many at once', () => {
    const { container } = renderControls();
    const input = fileInput(container);
    expect(input).toHaveAttribute('accept', 'image/*,application/pdf');
    expect(input).toHaveAttribute('multiple');
  });

  it('previews staged files and switches the bar into vision mode', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.upload(fileInput(container), [png(), pdf()]);

    expect(screen.getByRole('img', { name: 'board.png' })).toHaveAttribute('src', 'blob:preview');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('deck.pdf')).toBeInTheDocument();
    expect(searchBox()).toHaveAttribute('placeholder', 'Add a brief (optional).');
    expect(submitButton(container)).toHaveTextContent('Ask AI');
    expect(screen.queryByRole('button', { name: 'Ask AI', pressed: false })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Haiku', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sonnet', pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Haiku + Sonnet', pressed: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Text' })).not.toBeInTheDocument();
    expect(screen.getByText('fast vision')).toBeInTheDocument();
  });

  it('switches vision mode and shows its hint', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.upload(fileInput(container), png());
    await user.click(screen.getByRole('button', { name: 'Haiku + Sonnet' }));
    expect(screen.getByRole('button', { name: 'Haiku + Sonnet', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('highest fidelity')).toBeInTheDocument();
    expect(window.localStorage.getItem('prophaus.searchMode')).toBe('haiku-then-sonnet');
  });

  it('restores a saved vision mode', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('prophaus.searchMode', 'sonnet');
    const { container } = renderControls();
    await user.upload(fileInput(container), png());
    expect(screen.getByRole('button', { name: 'Sonnet', pressed: true })).toBeInTheDocument();
  });

  it('ignores an unknown saved mode', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('prophaus.searchMode', 'gpt');
    const { container } = renderControls();
    await user.upload(fileInput(container), png());
    expect(screen.getByRole('button', { name: 'Haiku', pressed: true })).toBeInTheDocument();
  });

  it('moves a saved text mode to haiku once a file is attached', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('prophaus.searchMode', 'text');
    const { container } = renderControls();
    await user.upload(fileInput(container), png());
    expect(screen.getByRole('button', { name: 'Haiku', pressed: true })).toBeInTheDocument();
    expect(window.localStorage.getItem('prophaus.searchMode')).toBe('haiku');
  });

  it('removes a staged file and revokes its preview', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.upload(fileInput(container), [png(), png('two.png')]);
    await user.click(screen.getByRole('button', { name: 'Remove board.png' }));
    expect(screen.queryByText('board.png')).not.toBeInTheDocument();
    expect(screen.getByText('two.png')).toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('returns to the text bar when the last file is removed', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.upload(fileInput(container), png());
    await user.click(screen.getByRole('button', { name: 'Remove board.png' }));
    expect(submitButton(container)).toHaveTextContent('Search');
    expect(screen.getByRole('button', { name: 'Ask AI', pressed: false })).toBeInTheDocument();
  });

  it('caps the stage at six files', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.upload(fileInput(container), Array.from({ length: 8 }, (_, i) => png(`b${i}.png`)));
    expect(screen.getAllByRole('img')).toHaveLength(6);
    expect(screen.queryByText('b6.png')).not.toBeInTheDocument();
  });

  it('accepts dropped files', () => {
    const { container } = renderControls();
    const zone = container.querySelector('form > div')!;
    fireEvent.drop(zone, { dataTransfer: { files: [png('dropped.png')] } });
    expect(screen.getByText('dropped.png')).toBeInTheDocument();
  });

  it('submits query, mode and files as FormData', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.upload(fileInput(container), [png(), pdf()]);
    await user.click(screen.getByRole('button', { name: 'Sonnet' }));
    await user.type(searchBox(), '  warm loft  ');
    await user.click(submitButton(container));

    expect(onText).not.toHaveBeenCalled();
    expect(onMultipart).toHaveBeenCalledTimes(1);
    const fd = onMultipart.mock.calls[0][0] as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('query')).toBe('warm loft');
    expect(fd.get('mode')).toBe('sonnet');
    expect((fd.getAll('files') as File[]).map((f) => f.name)).toEqual(['board.png', 'deck.pdf']);
  });

  it('omits the query key when the brief is blank', async () => {
    const user = userEvent.setup();
    const { container } = renderControls();
    await user.upload(fileInput(container), png());
    await user.click(submitButton(container));
    const fd = onMultipart.mock.calls[0][0] as FormData;
    expect(fd.has('query')).toBe(false);
    expect([...fd.keys()]).toEqual(['mode', 'files']);
  });

  it('routes files to multipart even with the AI engine armed', async () => {
    const user = userEvent.setup();
    const { container } = renderControls({ initialEngine: 'ai' });
    await user.upload(fileInput(container), png());
    await user.click(submitButton(container));
    expect(onMultipart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
