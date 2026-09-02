import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAutoResizeTextarea } from './use-auto-resize-textarea';

// Grow-with-content textarea: min/max height clamps, reset, and window resize.

function Harness({ minHeight, maxHeight, expose }: { minHeight: number; maxHeight?: number; expose: (fn: (reset?: boolean) => void) => void }) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight, maxHeight });
  expose(adjustHeight);
  return <textarea ref={textareaRef} aria-label="t" onChange={() => adjustHeight()} />;
}

function mount(minHeight: number, maxHeight?: number) {
  let adjust: (reset?: boolean) => void = () => {};
  const utils = render(<Harness minHeight={minHeight} maxHeight={maxHeight} expose={(fn) => (adjust = fn)} />);
  const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
  const setScrollHeight = (n: number) => Object.defineProperty(ta, 'scrollHeight', { value: n, configurable: true });
  return { ta, setScrollHeight, adjust: (reset?: boolean) => act(() => adjust(reset)), ...utils };
}

describe('useAutoResizeTextarea', () => {
  it('is a no-op without an attached element', () => {
    const { result } = renderHook(() => useAutoResizeTextarea({ minHeight: 40 }));
    expect(result.current.textareaRef.current).toBeNull();
    expect(() => result.current.adjustHeight()).not.toThrow();
  });

  it('starts at the minimum height', () => {
    const { ta } = mount(40);
    expect(ta.style.height).toBe('40px');
  });

  it('grows to the content height on input', () => {
    const { ta, setScrollHeight } = mount(40);
    setScrollHeight(120);
    fireEvent.change(ta, { target: { value: 'many\nlines\nof\ntext' } });
    expect(ta.style.height).toBe('120px');
  });

  it('never drops below the minimum or exceeds the maximum', () => {
    const { ta, setScrollHeight, adjust } = mount(40, 100);
    setScrollHeight(10);
    adjust();
    expect(ta.style.height).toBe('40px');
    setScrollHeight(500);
    adjust();
    expect(ta.style.height).toBe('100px');
  });

  it('resets to the minimum when asked', () => {
    const { ta, setScrollHeight, adjust } = mount(40);
    setScrollHeight(300);
    adjust();
    expect(ta.style.height).toBe('300px');
    adjust(true);
    expect(ta.style.height).toBe('40px');
  });

  it('re-measures on window resize and stops after unmount', () => {
    const { ta, setScrollHeight, unmount } = mount(40);
    setScrollHeight(90);
    act(() => {
      fireEvent(window, new Event('resize'));
    });
    expect(ta.style.height).toBe('90px');
    unmount();
    setScrollHeight(200);
    act(() => {
      fireEvent(window, new Event('resize'));
    });
    expect(ta.style.height).toBe('90px');
  });

  it('re-applies a changed minimum height', () => {
    const { ta, rerender } = mount(40);
    rerender(<Harness minHeight={64} expose={() => {}} />);
    expect(ta.style.height).toBe('64px');
  });
});
