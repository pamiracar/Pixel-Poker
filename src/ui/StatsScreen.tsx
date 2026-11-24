import { useState } from 'react';
import { PixelText } from './pixel/PixelText';
import { balanceChartPath, summarize, type StatsData } from '../stats/stats';
import { observedProfiles } from '../stats/history';
import { loadHistory, loadStats, resetStats, clearHistory, type KVStore } from '../storage/storage';

function Chart({ series }: { series: number[] }) {
  const { path, zeroY, min, max } = balanceChartPath(series, 640, 160);
  return (
    <figure className="chart">
      <svg className="px chart-svg" viewBox="0 0 640 160" preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label={`Balance over ${series.length} hands, from ${min} to ${max} chips`}>
        <rect width={640} height={160} fill="#0006" />
        <line x1={0} x2={640} y1={zeroY} y2={zeroY} stroke="#fff6" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke="#f2c14e" strokeWidth={2} />
      </svg>
      <figcaption className="muted">Balance over time (chips): {min} to {max}</figcaption>
    </figure>
  );
}

export function StatsScreen({ store, onBack }: { store: KVStore; onBack: () => void }) {
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<'session' | 'all'>('session');
  const [confirm, setConfirm] = useState<'stats' | 'history' | null>(null);
  void tick;
  const stored = loadStats(store);
  const data: StatsData = tab === 'all' ? stored.all : stored.session?.stats ?? stored.all;
  const sessionData = tab === 'session' && stored.session ? stored.session.stats : tab === 'session' ? null : stored.all;
  const s = summarize(sessionData ?? { ...stored.all, hands: 0, wins: 0, net: 0, vpip: 0, pfr: 0, showdowns: 0, showdownWins: 0, biggestPot: 0, bestHand: null, actions: { fold: 0, check: 0, call: 0, raise: 0 }, balance: [] });
  const hands = loadHistory(store);
  const profiles = observedProfiles(hands.filter((h) => h.sessionId === stored.session?.id));
  const tiles: [string, string][] = [
    ['Hands played', String(s.hands)], ['Hands won', `${s.wins} (${s.winPct}%)`], ['Net result', `${s.net >= 0 ? '+' : ''}${s.net}`],
    ['VPIP', `${s.vpipPct}%`], ['PFR', `${s.pfrPct}%`], ['Went to showdown', `${s.showdownPct}%`], ['Won at showdown', `${s.showdownWinPct}%`],
    ['Biggest pot won', String(s.biggestPot)], ['Best hand', s.bestHand],
    ['Fold / call / raise', `${s.foldPct}% / ${s.callPct}% / ${s.raisePct}%`],
  ];
  return (
    <div className="panel">
      <div className="panel-head"><PixelText text="STATISTICS" scale={3} /><button onClick={onBack}>Back</button></div>
      <div className="main-actions">
        <button aria-pressed={tab === 'session'} onClick={() => setTab('session')}>This session</button>
        <button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>All time</button>
      </div>
      <div className="tiles">{tiles.map(([k, v]) => <div key={k} className="tile"><span className="muted">{k}</span><strong>{v}</strong></div>)}</div>
      {s.hands > 0
        ? <Chart series={(sessionData ?? data).balance} />
        : <p className="muted">No hands played yet. Play a few hands and your results, win rate and balance chart will show up here.</p>}
      {tab === 'session' && profiles.length > 0 && (
        <>
          <h3>Bot profiles (observed)</h3>
          <table className="replay-table"><tbody>
            {profiles.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.hands} hands</td><td>VPIP {p.vpipPct}%</td><td>PFR {p.pfrPct}%</td></tr>)}
          </tbody></table>
        </>
      )}
      <div className="main-actions">
        {confirm === null && <><button onClick={() => setConfirm('stats')}>Reset statistics</button><button onClick={() => setConfirm('history')}>Clear hand history</button></>}
        {confirm !== null && (
          <>
            <span>{confirm === 'stats' ? 'Reset ALL statistics (session and all time)?' : 'Delete the stored hand history?'}</span>
            <button onClick={() => { if (confirm === 'stats') resetStats(store); else clearHistory(store); setConfirm(null); setTick((t) => t + 1); }}>Yes, do it</button>
            <button onClick={() => setConfirm(null)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
