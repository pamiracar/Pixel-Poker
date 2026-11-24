import { useEffect, useRef, useState } from 'react';
import type { Phase, PokerGame, Player } from '../engine/game';
import { categoryName, evaluateBest } from '../engine/handEvaluator';
import { CardView, FlipCard } from './CardView';
import { ActionBar } from './ActionBar';
import { ChipLayer } from './ChipLayer';
import { Stage } from './Stage';
import { PixelText } from './pixel/PixelText';
import { Avatar, ChipStack } from './pixel/Sprites';
import { useTable, type Settings } from './useTable';
import { useGameSounds } from './useGameSounds';
import { useLagged } from './useLagged';
import type { AudioSettings } from '../audio/engine';
import { HistoryPanel } from './HistoryPanel';
import { buildHandRecord } from '../stats/history';
import { loadHistory, recordHand, type KVStore } from '../storage/storage';
import { FELT_H, FELT_W, betPosition, cardKey, lastActionLabels, planBetFlights, planFlights, seatPosition, speedFactor, winningCardKeys, type AnimSpeed, type Flight, type FlightState } from './anim';
import { pixelRoundRect, polygonCss } from './shape';

const FELT_CLIP = polygonCss(pixelRoundRect(FELT_W, FELT_H, 250, 200, 8));
const RAIL_CLIP = polygonCss(pixelRoundRect(FELT_W + 24, FELT_H + 24, 262, 212, 8));
const LAG_MS = 700;

function Seat({ g, p, n, avatar, lit, winner, factor, label }: { g: PokerGame; p: Player; n: number; avatar: number; lit: Set<string>; winner: boolean; factor: number; label?: string }) {
  const pos = seatPosition(p.id, n);
  const hero = p.id === 0;
  const showdown = g.phase === 'PAYOUT' && !!g.outcome?.showdown;
  const faceUp = hero || (showdown && p.inHand && !p.folded);
  const big = faceUp;                 // revealed cards are shown at the player's card size so they are easy to read
  const wins = g.phase === 'PAYOUT' && (g.outcome?.payouts[p.id] ?? 0) > 0;
  const stack = useLagged(p.stack, wins ? LAG_MS * factor : 0);   // winnings count up when the chips arrive
  const kind = !label ? '' : label.startsWith('FOLD') ? 'fold' : label.startsWith('CHECK') ? 'check' : label.startsWith('CALL') ? 'call' : 'aggr';
  return (
    <div className={`seat${big ? ' hero' : ''}${g.toAct === p.id ? ' active' : ''}${p.folded || !p.inHand ? ' out' : ''}${winner ? ' winner' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
      <div className="hole">
        {p.inHand && [0, 1].map((i) => {
          const c = p.hole[i];
          const deal = { dx: ((50 - pos.x) / 100) * FELT_W, dy: ((50 - pos.y) / 100) * FELT_H, i: p.id * 2 + i };
          return <CardView key={`${g.handsPlayed}-${i}`} card={c} small={!big} hero={big} hidden={!faceUp} dim={p.folded || (showdown && !!c && !lit.has(cardKey(c)) && !p.folded)}
            lit={showdown && !!c && lit.has(cardKey(c))} deal={factor > 0 ? deal : undefined} />;
        })}
      </div>
      <div className="plate">
        <Avatar index={avatar} scale={5} />
        <div className="info">
          <span className="nameline"><PixelText text={p.name} scale={2} />
            {g.sbSeat === p.id && <span className="badge"><PixelText text="SB" scale={1} /></span>}
            {g.bbSeat === p.id && <span className="badge"><PixelText text="BB" scale={1} /></span>}
          </span>
          <span className="stackline"><PixelText text={stack} scale={2} />{p.allIn && <PixelText text=" ALL-IN" scale={1} />}</span>
        </div>
        {g.dealer === p.id && <span className="puck" title="Dealer"><PixelText text="D" scale={2} /></span>}
      </div>
      {label && <div className={`tag tag-${kind}`}>{label}</div>}
    </div>
  );
}

function BetSpot({ p, n, factor }: { p: Player; n: number; factor: number }) {
  const shown = useLagged(p.bet, LAG_MS * factor);              // the pile appears when the thrown chips land
  if (shown <= 0) return null;
  const pos = betPosition(p.id, n);
  return (
    <div className="betspot" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
      <ChipStack amount={shown} scale={2} /><span className="betlabel"><PixelText text={shown} scale={2} /></span>
    </div>
  );
}

export function TableScreen({ settings, anim, sound, onSoundChange, autoDeal, store, sessionId, onExit }: {
  settings: Settings; anim: AnimSpeed; sound: AudioSettings; onSoundChange: (s: AudioSettings) => void; autoDeal: boolean; store: KVStore; sessionId: string; onExit: () => void;
}) {
  const { table, version, nextHand, act, rebuy } = useTable(settings);
  const [leaving, setLeaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const flightState = useRef<FlightState | null>(null);
  const betState = useRef<{ hand: number; bets: number[] } | null>(null);
  const nextId = useRef(0);
  const recorded = useRef(0);
  const g = table.game;
  useGameSounds(g, version);
  const n = g.players.length;
  const me = g.players[0]!;
  const factor = speedFactor[anim];
  const legal = table.isHumanTurn ? g.legalActions() : null;
  const o = g.outcome;
  const potGathered = g.pot - g.players.reduce((sum, p) => sum + p.bet, 0);   // chips already collected in the middle
  const potShown = useLagged(potGathered, LAG_MS * factor);
  const lit = g.phase === 'PAYOUT' ? winningCardKeys(o) : new Set<string>();
  const showdown = g.phase === 'PAYOUT' && !!o?.showdown;
  const labels = lastActionLabels(g.actionLog, g.phase);
  const handName = me.inHand && !me.folded && g.board.length >= 3 ? categoryName(evaluateBest([...me.hole, ...g.board])) : null;
  const autoMs = anim === 'normal' ? 4200 : anim === 'fast' ? 2600 : 1600;

  useEffect(() => { document.documentElement.dataset.anim = anim; }, [anim]);

  // Every finished hand is stored once (history, all-time and session statistics).
  useEffect(() => {
    if (g.phase !== 'PAYOUT' || !g.outcome || recorded.current === g.handsPlayed) return;
    recorded.current = g.handsPlayed;
    recordHand(store, sessionId, (id) => buildHandRecord(g, { sessionId, id, timestamp: Date.now() }));
  }, [g, version, store, sessionId]);

  // Optional auto-deal after a short pause (not while the player must rebuy).
  useEffect(() => {
    if (!autoDeal || g.phase !== 'PAYOUT' || me.stack === 0) return;
    const id = window.setTimeout(nextHand, autoMs);
    return () => window.clearTimeout(id);
  }, [autoDeal, g.phase, g.handsPlayed, me.stack, nextHand, autoMs]);

  // Chip flights: thrown on bets, gathered into the pot when a street ends, slid to the winners at payout.
  useEffect(() => {
    const plan = planFlights(flightState.current, { hand: g.handsPlayed, phase: g.phase as Phase, totals: g.players.map((p) => p.totalBet) },
      g.phase === 'PAYOUT' && g.outcome ? g.outcome.payouts : null, factor);
    flightState.current = { hand: g.handsPlayed, phase: g.phase, gathered: plan.gathered };
    const bets = g.players.map((p) => p.bet);
    const betPlan = planBetFlights(betState.current, { hand: g.handsPlayed, bets }, factor);
    betState.current = { hand: g.handsPlayed, bets };
    const all = [...betPlan, ...plan.flights];
    if (all.length === 0) return;
    const added = all.map((f) => ({ ...f, id: ++nextId.current }));
    setFlights((cur) => [...cur, ...added]);
    window.setTimeout(() => setFlights((cur) => cur.filter((f) => !added.some((a) => a.id === f.id))), 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return (
    <Stage>
      <div className="sr-only" aria-live="polite">{legal ? 'Your turn' : ''}</div>
      <div className="topbar">
        <PixelText text={`HAND #${g.handsPlayed}  ${g.phase}`} scale={3} />
        <span className="hint">{handName && <PixelText text={`YOU HAVE ${handName}`} scale={2} />}</span>
        <span className="toggles">
          <button aria-pressed={sound.sfxOn} onClick={() => onSoundChange({ ...sound, sfxOn: !sound.sfxOn })}>SFX {sound.sfxOn ? 'ON' : 'OFF'}</button>
          <button aria-pressed={sound.musicOn} onClick={() => onSoundChange({ ...sound, musicOn: !sound.musicOn })}>MUSIC {sound.musicOn ? 'ON' : 'OFF'}</button>
          <button onClick={() => setShowHistory(true)}>History</button>
          <button onClick={() => setLeaving(true)}>Leave table</button>
        </span>
      </div>

      <div className="tablewrap">
        <div className="rail" style={{ clipPath: RAIL_CLIP }} />
        <div className="felt-bg" style={{ clipPath: FELT_CLIP }} />
        <div className="felt">
          {g.players.map((p) => (
            <Seat key={p.id} g={g} p={p} n={n} avatar={table.profiles[p.id]?.avatar ?? -1} lit={lit} factor={factor} label={labels[p.id]}
              winner={g.phase === 'PAYOUT' && (o?.payouts[p.id] ?? 0) > 0} />
          ))}
          {g.players.map((p) => <BetSpot key={`bet-${p.id}`} p={p} n={n} factor={factor} />)}
          <div className="center">
            <div className="board">
              {[0, 1, 2, 3, 4].map((i) => {
                const c = g.board[i];
                return c ? <FlipCard key={`${g.handsPlayed}-${i}-${cardKey(c)}`} card={c} delayMs={i < 3 ? i * 120 : 0} factor={factor}
                  lit={lit.has(cardKey(c))} dim={showdown && !lit.has(cardKey(c))} /> : <div key={i} className="card slot" />;
              })}
            </div>
            <div className="potrow">
              {potShown > 0 && <ChipStack amount={potShown} scale={2} />}
              <div className="pot"><PixelText text={`POT ${g.pot}`} scale={2} /></div>
            </div>
          </div>
          <ChipLayer flights={flights} speed={factor} />
        </div>
      </div>

      <div className="dock">
        {legal ? <ActionBar legal={legal} pot={g.pot} currentBet={g.currentBet} myBet={me.bet} phase={g.phase} bigBlind={g.bigBlind} smallBlind={g.smallBlind} onAct={act} />
          : g.phase === 'PAYOUT' && o ? (
            <div className="result" role="status">
              <div>
                {Object.entries(o.payouts).map(([id, amt]) => {
                  const h = o.hands[Number(id)];
                  return <div key={id}>{g.players[Number(id)]!.name} wins {amt}{h ? ` with ${categoryName(h)}` : ''}</div>;
                })}
                {!o.showdown && <div className="muted">No showdown</div>}
              </div>
              <div className="nextwrap">
                {me.stack === 0 ? <button onClick={rebuy}>Rebuy {settings.startingStack}</button> : <button onClick={nextHand}>Next hand</button>}
                {autoDeal && me.stack > 0 && <span className="autobar" style={{ animationDuration: `${autoMs}ms` }} />}
              </div>
            </div>
          ) : (
            <div className="waiting">{g.toAct >= 0 && g.players[g.toAct] ? <PixelText text={`${g.players[g.toAct]!.name} IS THINKING...`} scale={2} /> : null}</div>
          )}
      </div>

      {showHistory && (
        <div className="modal" role="dialog" aria-label="Hand history">
          <div className="modal-box wide"><HistoryPanel hands={loadHistory(store)} onClose={() => setShowHistory(false)} /></div>
        </div>
      )}
      {leaving && (
        <div className="modal" role="dialog" aria-label="Leave table">
          <div className="modal-box">
            <PixelText text="LEAVING THE TABLE" scale={3} />
            <p>Total bought in: {table.buyIns[0]} · Cash out: {me.stack}</p>
            <p>Net result: {table.net(0) >= 0 ? '+' : ''}{table.net(0)} chips</p>
            <button onClick={onExit}>Main menu</button>
            <button onClick={() => setLeaving(false)}>Keep playing</button>
          </div>
        </div>
      )}
    </Stage>
  );
}
