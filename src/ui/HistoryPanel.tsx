import { useEffect, useMemo, useState } from 'react';
import type { HandRecord } from '../stats/history';
import { exportHistoryJson } from '../stats/history';
import { buildReplay } from '../stats/replay';
import { CardView } from './CardView';
import { PixelText } from './pixel/PixelText';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function ReplayView({ rec, onBack }: { rec: HandRecord; onBack: () => void }) {
  const steps = useMemo(() => buildReplay(rec), [rec]);
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => setI((x) => { if (x >= steps.length - 1) { setAuto(false); return x; } return x + 1; }), 900);
    return () => window.clearInterval(id);
  }, [auto, steps.length]);
  const s = steps[i]!;
  return (
    <div className="panel">
      <div className="panel-head"><PixelText text={`HAND #${rec.id}`} scale={3} /><button onClick={onBack}>Back to list</button></div>
      <div className="replay-label" aria-live="polite">{i + 1}/{steps.length} · {s.label}</div>
      <div className="board">{[0, 1, 2, 3, 4].map((k) => (s.board[k] ? <CardView key={k} card={s.board[k]} small /> : <div key={k} className="card slot small" />))}</div>
      <div className="muted">Pot: {s.pot}</div>
      <table className="replay-table">
        <tbody>
          {s.players.map((p) => (
            <tr key={p.id} className={`${p.folded ? 'out' : ''}${s.actingId === p.id ? ' acting' : ''}`}>
              <td>{p.name} <span className="muted">{p.position}</span></td>
              <td>{p.stack}{p.allIn ? ' (all-in)' : ''}</td>
              <td>{p.bet > 0 ? `bet ${p.bet}` : ''}{p.folded ? 'folded' : ''}</td>
              <td className="hole">{p.hole ? p.hole.map((c, k) => <CardView key={k} card={c} small />) : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="main-actions">
        <button onClick={() => { setAuto(false); setI(0); }} disabled={i === 0}>First</button>
        <button onClick={() => { setAuto(false); setI((x) => Math.max(0, x - 1)); }} disabled={i === 0}>Prev</button>
        <button onClick={() => setAuto((a) => !a)} disabled={i >= steps.length - 1}>{auto ? 'Pause' : 'Auto play'}</button>
        <button onClick={() => { setAuto(false); setI((x) => Math.min(steps.length - 1, x + 1)); }} disabled={i >= steps.length - 1}>Next</button>
        <button onClick={() => { setAuto(false); setI(steps.length - 1); }} disabled={i >= steps.length - 1}>Last</button>
      </div>
    </div>
  );
}

/** Last hands as a list; selecting one opens the step-by-step replay. */
export function HistoryPanel({ hands, onClose }: { hands: HandRecord[]; onClose: () => void }) {
  const [sel, setSel] = useState<HandRecord | null>(null);
  if (sel) return <ReplayView rec={sel} onBack={() => setSel(null)} />;
  const list = [...hands].reverse().slice(0, 50);
  return (
    <div className="panel">
      <div className="panel-head"><PixelText text="HAND HISTORY" scale={3} /><button onClick={onClose}>Close</button></div>
      <div className="main-actions">
        <button disabled={hands.length === 0} onClick={() => download('pixel-poker-history.json', exportHistoryJson(hands))}>Export JSON</button>
        <span className="muted">{hands.length} hands stored (max 500), showing the latest {list.length}</span>
      </div>
      {list.length === 0 && <p className="muted">No hands played yet.</p>}
      <ul className="hand-list">
        {list.map((h) => (
          <li key={h.id}>
            <button onClick={() => setSel(h)}>
              #{h.id} · {h.humanNet >= 0 ? '+' : ''}{h.humanNet} · {h.winners.map((w) => `${h.players.find((p) => p.id === w.id)?.name ?? '?'}${w.hand ? ` (${w.hand})` : ''}`).join(', ')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
