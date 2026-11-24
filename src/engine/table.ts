import { PokerGame } from './game';
import type { Card } from './types';
import { cryptoRandomInt, type RandomInt } from './deck';
import { visibleState } from './view';
import { randomBot, makeBot, thinkTimeMs, type BotDecider } from '../bots/botBrain';
import { PERSONALITIES, assignBots, type Archetype, type BotProfile } from '../bots/personalities';

export interface TableConfig {
  botCount: number; startingStack: number; smallBlind: number; bigBlind: number;
  rng?: RandomInt; deckProvider?: () => Card[];
  /** Picks the decision function for each bot seat (personalities arrive in Milestone 5). */
  deciderFor?: (id: number) => BotDecider;
  /** Test/simulation: seat 0 is also a bot. */
  humanAsBot?: boolean;
  /** Equity simulation samples per bot decision (default 120; tests use fewer). */
  botSamples?: number;
  /** Force archetypes in seat order (tests); default is a random assignment. */
  archetypes?: Archetype[];
}

/**
 * Cash-game session on top of PokerGame: seat 0 is the human, seats 1.. are bots.
 * Busted bots rebuy automatically; the human must rebuy explicitly.
 * No game rules live here.
 */
export class Table {
  readonly game: PokerGame;
  /** Cumulative chips each seat has bought in (initial stack + rebuys). */
  readonly buyIns: number[];
  private readonly rnd: RandomInt;
  private readonly deciders: BotDecider[];
  private readonly humanAsBot: boolean;
  private readonly startingStack: number;
  /** Bot identity per seat (undefined for the human seat). The archetype is never shown in the UI. */
  readonly profiles: (BotProfile | undefined)[];

  constructor(cfg: TableConfig) {
    if (cfg.botCount < 3 || cfg.botCount > 5) throw new Error('Bot count must be 3-5');
    this.rnd = cfg.rng ?? cryptoRandomInt;
    this.humanAsBot = cfg.humanAsBot ?? false;
    this.startingStack = cfg.startingStack;
    const n = cfg.botCount + 1;
    const bots = assignBots(this.humanAsBot ? n : cfg.botCount, this.rnd, cfg.archetypes);
    this.profiles = this.humanAsBot ? bots : [undefined, ...bots];
    this.game = new PokerGame({
      stacks: Array<number>(n).fill(cfg.startingStack), smallBlind: cfg.smallBlind, bigBlind: cfg.bigBlind,
      names: this.profiles.map((pr) => pr?.name ?? 'You'),
      rng: this.rnd, ...(cfg.deckProvider ? { deckProvider: cfg.deckProvider } : {}),
    });
    this.buyIns = Array<number>(n).fill(cfg.startingStack);
    this.deciders = Array.from({ length: n }, (_, id) => {
      const pr = this.profiles[id];
      return cfg.deciderFor?.(id) ?? (pr ? makeBot(PERSONALITIES[pr.archetype], { samples: cfg.botSamples ?? 120 }) : randomBot);
    });
  }

  isBot(id: number): boolean { return id !== 0 || this.humanAsBot; }
  get isHumanTurn(): boolean { return !this.humanAsBot && this.game.isBetting && this.game.toAct === 0; }
  /** Net result in chips (stack minus everything bought in). */
  net(id: number): number { return (this.game.players[id]?.stack ?? 0) - (this.buyIns[id] ?? 0); }

  rebuyHuman(): void { this.rebuy(0); }
  private rebuy(id: number): void {
    this.game.rebuy(id, this.startingStack);
    this.buyIns[id] = (this.buyIns[id] ?? 0) + this.startingStack;
  }

  /** Auto-rebuys busted bots, then deals the next hand and lets bots act until the human's turn. */
  nextHand(): void {
    this.beginHand();
    this.runBots();
  }

  /** Rebuys busted bots and deals, without letting bots act (the UI paces bot turns itself). */
  beginHand(): void {
    for (const p of this.game.players) {
      if (p.stack === 0 && this.isBot(p.id)) this.rebuy(p.id);
    }
    if ((this.game.players[0]?.stack ?? 0) === 0) throw new Error('Human is out of chips: rebuy or leave the table');
    this.game.startHand();
  }

  /** Milliseconds a bot should "think" before acting (UI timer). */
  thinkTime(id: number): number { return thinkTimeMs(visibleState(this.game, id), this.rnd); }

  /** One bot decision. Returns false when it is not a bot's turn. */
  stepBot(): boolean {
    const id = this.game.toAct;
    if (!this.game.isBetting || id < 0 || !this.isBot(id)) return false;
    const view = visibleState(this.game, id);
    this.game.act(id, this.deciders[id]!(view, this.rnd));
    return true;
  }

  /** Runs bots synchronously until the human must act or the hand ends (the UI adds think time). */
  runBots(): void { while (this.stepBot()) { /* keep going */ } }

  /** Human action; bots then respond until it is the human's turn again or the hand ends. */
  humanAct(a: Parameters<PokerGame['act']>[1]): void {
    this.submitHuman(a);
    this.runBots();
  }

  /** Human action only; bots are stepped separately by the UI. */
  submitHuman(a: Parameters<PokerGame['act']>[1]): void { this.game.act(0, a); }
}
