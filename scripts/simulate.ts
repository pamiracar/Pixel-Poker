// Console end-to-end run: `npm run simulate`. Five random bots play 50 hands.
import { Table } from '../src/engine/table';
import { seededRandomInt, cardToString } from '../src/engine/deck';
import { categoryName } from '../src/engine/handEvaluator';

const t = new Table({ botCount: 4, startingStack: 1000, smallBlind: 10, bigBlind: 20, humanAsBot: true, botSamples: 30, rng: seededRandomInt(2024) });
for (let h = 1; h <= 50; h++) {
  t.nextHand();
  const o = t.game.outcome!;
  const winners = Object.entries(o.payouts).map(([id, amt]) => {
    const hand = o.hands[Number(id)];
    return `${t.game.players[Number(id)]!.name} +${amt}${hand ? ` (${categoryName(hand)})` : ''}`;
  });
  if (h <= 8 || h % 10 === 0) console.log(`#${h} board [${t.game.board.map(cardToString).join(' ')}] ${o.showdown ? 'showdown' : 'fold-win'}: ${winners.join(', ')}`);
}
console.log('Archetypes:', t.profiles.map((p) => `${p!.name}=${p!.archetype}`).join(' '));
console.log('Final stacks:', t.game.players.map((p) => `${p.name}=${p.stack} (rebuys ${p.rebuys}, net ${t.net(p.id)})`).join(' | '));
