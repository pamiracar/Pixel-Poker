import { useEffect, useMemo, useState } from 'react';
import { audio } from '../audio/engine';
import { TableScreen } from './TableScreen';
import { StatsScreen } from './StatsScreen';
import { HistoryPanel } from './HistoryPanel';
import { loadHistory, browserStore } from '../storage/storage';
import { isValidTableSettings, loadSettings, saveSettings, type TableSettings } from '../storage/settings';
import type { AnimSpeed } from './anim';
import { PixelText } from './pixel/PixelText';

type Screen = 'menu' | 'table' | 'stats' | 'history';
const prefersReducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function App() {
  const store = useMemo(() => browserStore(), []);
  // Settings persist across reloads; people who ask their OS for reduced motion start with animations off.
  const [initial] = useState(() => loadSettings(store, prefersReducedMotion()));
  const [settings, setSettings] = useState<TableSettings>(initial.table);
  const [anim, setAnim] = useState<AnimSpeed>(initial.anim);
  const [sound, setSound] = useState(initial.sound);
  const [autoDeal, setAutoDeal] = useState(initial.autoDeal);
  const [screen, setScreen] = useState<Screen>('menu');
  const [sessionId, setSessionId] = useState('');
  useEffect(() => { saveSettings(store, { table: isValidTableSettings(settings) ? settings : initial.table, anim, sound, autoDeal }); }, [store, settings, anim, sound, autoDeal, initial.table]);
  useEffect(() => { audio.setSettings(sound); }, [sound]);
  // Browsers only allow audio after a user gesture: unlock on the first click or key press.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  if (screen === 'table') {
    return <TableScreen settings={settings} anim={anim} sound={sound} onSoundChange={setSound} autoDeal={autoDeal} store={store} sessionId={sessionId} onExit={() => setScreen('menu')} />;
  }
  if (screen === 'stats') return <div className="screen"><StatsScreen store={store} onBack={() => setScreen('menu')} /></div>;
  if (screen === 'history') return <div className="screen"><HistoryPanel hands={loadHistory(store)} onClose={() => setScreen('menu')} /></div>;

  const num = (k: keyof TableSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setSettings({ ...settings, [k]: Number(e.target.value) });
  const valid = isValidTableSettings(settings);
  return (
    <div className="menu-page">
      <main className="menu">
        <h1 className="title"><PixelText text="PIXEL POKER" scale={5} /></h1>
        <p className="subtitle"><PixelText text="TEXAS HOLD'EM VS BOTS" scale={2} /></p>

        <h2 className="sect">Game</h2>
        <label>Bots (3-5)
          <select value={settings.botCount} onChange={(e) => setSettings({ ...settings, botCount: Number(e.target.value) })}>
            {[3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>Starting stack <input type="number" value={settings.startingStack} onChange={num('startingStack')} /></label>
        <label>Small blind <input type="number" value={settings.smallBlind} onChange={num('smallBlind')} /></label>
        <label>Big blind <input type="number" value={settings.bigBlind} onChange={num('bigBlind')} /></label>
        <label>Auto-deal next hand <input type="checkbox" checked={autoDeal} onChange={(e) => setAutoDeal(e.target.checked)} /></label>
        {!valid && <p className="muted" role="alert">Use whole numbers: blinds above 0 (BB &ge; SB) and a stack of at least 10 big blinds.</p>}

        <h2 className="sect">Display and sound</h2>
        <label>Animation speed
          <select value={anim} onChange={(e) => setAnim(e.target.value as AnimSpeed)}>
            <option value="normal">Normal</option><option value="fast">Fast</option><option value="off">Off</option>
          </select>
        </label>
        <label>Sound effects <input type="checkbox" checked={sound.sfxOn} onChange={(e) => setSound({ ...sound, sfxOn: e.target.checked })} /></label>
        <label>Effects volume <input type="range" min={0} max={100} value={sound.sfxVolume} onChange={(e) => setSound({ ...sound, sfxVolume: Number(e.target.value) })} /></label>
        <label>Music <input type="checkbox" checked={sound.musicOn} onChange={(e) => setSound({ ...sound, musicOn: e.target.checked })} /></label>
        <label>Music volume <input type="range" min={0} max={100} value={sound.musicVolume} onChange={(e) => setSound({ ...sound, musicVolume: Number(e.target.value) })} /></label>

        <button className="primary" disabled={!valid} onClick={() => { setSessionId(`s${Date.now()}`); setScreen('table'); }}>Play</button>
        <div className="row">
          <button onClick={() => setScreen('stats')}>Statistics</button>
          <button onClick={() => setScreen('history')}>Hand history</button>
        </div>
        <p className="muted keys">Keys: F fold &middot; C check/call &middot; R raise</p>
      </main>
    </div>
  );
}
