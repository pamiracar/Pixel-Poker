import { useEffect, useState } from 'react';
import type { Action, LegalActions } from '../engine/game';
import { snapBet, sizingPresets } from './sizing';

interface Props { legal: LegalActions; pot: number; currentBet: number; myBet: number; phase: string; bigBlind: number; smallBlind: number; onAct: (a: Action) => void }

export function ActionBar({ legal: L, pot, currentBet, myBet, phase, bigBlind, smallBlind, onAct }: Props) {
  const step = Math.max(1, smallBlind);
  const [amt, setAmt] = useState(L.minRaiseTo);
  useEffect(() => setAmt(L.minRaiseTo), [L.minRaiseTo, L.maxRaiseTo, L.playerId]);
  const canSize = L.canBet || L.canRaise;
  const set = (v: number) => setAmt(snapBet(v, L.minRaiseTo, L.maxRaiseTo, step));
  const presets = canSize ? sizingPresets({ phase, currentBet, myBet, bigBlind, pot, min: L.minRaiseTo, max: L.maxRaiseTo, step }) : [];
  const raise = () => onAct({ type: L.canBet ? 'bet' : 'raise', amount: snapBet(amt, L.minRaiseTo, L.maxRaiseTo, step) });
  const callOrCheck = () => onAct({ type: L.canCheck ? 'check' : 'call' });
  const odds = L.canCall && L.callAmount > 0 ? `pot odds ${(pot / L.callAmount).toFixed(1)}:1 · need ${Math.round((100 * L.callAmount) / (pot + L.callAmount))}%` : '';

  // Keyboard shortcuts: F fold, C check/call, R bet/raise.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'f' && L.canFold) onAct({ type: 'fold' });
      else if (k === 'c') callOrCheck();
      else if (k === 'r' && canSize) raise();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="actionbar">
      <div className="sizing">
        <button disabled={!canSize} onClick={() => set(L.minRaiseTo)}>Min</button>
        {presets.map((p) => <button key={p.label} onClick={() => setAmt(p.to)}>{p.label}</button>)}
        <button disabled={!L.canAllIn} onClick={() => onAct({ type: 'allin' })}>All-in</button>
        <input type="range" aria-label="bet amount" disabled={!canSize} min={L.minRaiseTo} max={L.maxRaiseTo} step={step} value={amt} onChange={(e) => set(Number(e.target.value))} />
        <input type="number" aria-label="bet amount value" disabled={!canSize} min={L.minRaiseTo} max={L.maxRaiseTo} value={amt} onChange={(e) => setAmt(Number(e.target.value))} onBlur={() => set(amt)} />
      </div>
      <div className="main-actions">
        <button className="b-fold" disabled={!L.canFold} onClick={() => onAct({ type: 'fold' })}>Fold (F)</button>
        <button className="b-call" onClick={callOrCheck}>{L.canCheck ? 'Check (C)' : `Call ${L.callAmount} (C)`}{odds && <small>{odds}</small>}</button>
        <button className="b-raise" disabled={!canSize} onClick={raise}>{L.canBet ? 'Bet' : 'Raise to'} {snapBet(amt, L.minRaiseTo, L.maxRaiseTo, step)} (R)</button>
      </div>
    </div>
  );
}
