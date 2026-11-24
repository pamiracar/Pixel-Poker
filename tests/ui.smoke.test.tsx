// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/ui/App';
import { loadHistory, loadStats } from '../src/storage/storage';
import { SETTINGS_KEY } from '../src/storage/settings';

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
const next = () => screen.queryByRole('button', { name: /next hand|rebuy/i });
/** Starts the next hand. A passive human can bust, in which case the UI first offers a rebuy. */
function startNextHand() {
  fireEvent.click(next()!);
  if (screen.queryByRole('button', { name: /^rebuy/i })) fireEvent.click(screen.getByRole('button', { name: /^rebuy/i }));
  if (screen.queryByRole('button', { name: /next hand/i })) fireEvent.click(screen.getByRole('button', { name: /next hand/i }));
}
/** Plays one hand as a passive human (check/call); `viaKeyboard` uses the C shortcut instead of the button. */
async function playHand(viaKeyboard = false) {
  for (let i = 0; i < 120; i++) {
    if (next()) return;
    const btn = screen.queryByRole('button', { name: /^(check|call)/i });
    if (btn) { if (viaKeyboard) fireEvent.keyDown(window, { key: 'c' }); else fireEvent.click(btn); }
    else await advance(2500);
  }
  throw new Error('hand did not finish');
}

describe('UI smoke test (jsdom)', () => {
  it('menu -> play two hands -> stats and history are stored -> replay opens', async () => {
    render(<App />);
    fireEvent.pointerDown(window);                         // audio unlock must not throw without Web Audio
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('img', { name: /HAND #1/ })).toBeTruthy();

    await playHand();
    expect(screen.getByRole('status').textContent).toMatch(/wins \d+/);
    expect(loadHistory(localStorage)).toHaveLength(1);
    expect(loadStats(localStorage).all.hands).toBe(1);

    startNextHand();
    expect(screen.getByRole('img', { name: /HAND #2/ })).toBeTruthy();
    await playHand(true);                                  // keyboard shortcut path
    expect(loadHistory(localStorage)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Leave table' }));
    expect(screen.getByRole('dialog', { name: 'Leave table' }).textContent).toMatch(/Net result: [+-]?\d+ chips/);
    fireEvent.click(screen.getByRole('button', { name: 'Main menu' }));

    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    expect(screen.getByText('Hands played').nextSibling?.textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(screen.getByText('Hands played').nextSibling?.textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    fireEvent.click(screen.getByRole('button', { name: 'Hand history' }));
    fireEvent.click(screen.getByRole('button', { name: /^#2 / }));
    expect(screen.getByText(/Blinds 10\/20/)).toBeTruthy();
    for (let i = 0; i < 40 && !screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'); i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Last' }).hasAttribute('disabled')).toBe(true);
  }, 60000);

  it('settings survive a reload and invalid settings block Play', () => {
    const first = render(<App />);
    fireEvent.change(screen.getByLabelText(/Animation speed/), { target: { value: 'off' } });
    fireEvent.change(screen.getByLabelText(/Bots/), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText('Music'));
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).anim).toBe('off');
    first.unmount();
    render(<App />);
    expect((screen.getByLabelText(/Animation speed/) as HTMLSelectElement).value).toBe('off');
    expect((screen.getByLabelText(/Bots/) as HTMLSelectElement).value).toBe('5');
    expect((screen.getByLabelText('Music') as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByLabelText(/Starting stack/), { target: { value: '100' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' }).hasAttribute('disabled')).toBe(true);
    // the invalid value is not persisted
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).table.startingStack).toBe(1000);
  });

  it('starts with animations off when the OS asks for reduced motion', () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    render(<App />);
    expect((screen.getByLabelText(/Animation speed/) as HTMLSelectElement).value).toBe('off');
  });
});
