import { describe, expect, it } from 'vitest';
import { evaluateBest, categoryName } from '../src/engine/handEvaluator';
import { createDeck, parseCards, seededRandomInt, shuffle, cardToString } from '../src/engine/deck';
import { HandCategory as H } from '../src/engine/types';

const ev = (s: string) => evaluateBest(parseCards(s));
const beats = (a: string, b: string) => expect(ev(a).score).toBeGreaterThan(ev(b).score);
const ties = (a: string, b: string) => expect(ev(a).score).toBe(ev(b).score);

describe('categories', () => {
  it.each([
    ['As Ks Qs Js Ts', H.StraightFlush, 'Royal Flush'],
    ['9h 8h 7h 6h 5h', H.StraightFlush, 'Straight Flush'],
    ['9s 9h 9d 9c 2s', H.FourOfAKind, 'Four of a Kind'],
    ['9s 9h 9d 2c 2s', H.FullHouse, 'Full House'],
    ['As 9s 7s 4s 2s', H.Flush, 'Flush'],
    ['9s 8h 7d 6c 5s', H.Straight, 'Straight'],
    ['9s 9h 9d 6c 2s', H.ThreeOfAKind, 'Three of a Kind'],
    ['9s 9h 6d 6c 2s', H.TwoPair, 'Two Pair'],
    ['9s 9h 7d 6c 2s', H.Pair, 'One Pair'],
    ['As 9h 7d 6c 2s', H.HighCard, 'High Card'],
  ])('%s', (cards, cat, name) => {
    const r = ev(cards);
    expect(r.category).toBe(cat);
    expect(categoryName(r)).toBe(name);
  });
  it('orders every category above the previous one', () => {
    const order = ['As 9h 7d 6c 2s', '9s 9h 7d 6c 2s', '9s 9h 6d 6c 2s', '9s 9h 9d 6c 2s', '9s 8h 7d 6c 5s',
      'As 9s 7s 4s 2s', '9s 9h 9d 2c 2s', '9s 9h 9d 9c 2s', '9h 8h 7h 6h 5h', 'As Ks Qs Js Ts'];
    for (let i = 1; i < order.length; i++) beats(order[i]!, order[i - 1]!);
  });
});

describe('straights and wheel', () => {
  it('wheel A-2-3-4-5 is a straight with five high', () => expect(ev('As 2h 3d 4c 5s').category).toBe(H.Straight));
  it('six-high straight beats the wheel', () => beats('2s 3h 4d 5c 6s', 'As 2h 3d 4c 5s'));
  it('broadway beats king-high straight', () => beats('As Kh Qd Jc Ts', 'Ks Qh Jd Tc 9s'));
  it('wheel beats trips', () => beats('As 2h 3d 4c 5s', '9s 9h 9d 6c 2s'));
  it('steel wheel is a straight flush, not royal', () => {
    const r = ev('As 2s 3s 4s 5s');
    expect(r.category).toBe(H.StraightFlush);
    expect(r.isRoyal).toBe(false);
  });
  it('no wraparound straight (Q-K-A-2-3)', () => expect(ev('Qs Kh Ad 2c 3s').category).toBe(H.HighCard));
  it('wheel is found from 7 cards', () => expect(ev('As 2h 3d 4c 5s Kd Kc').category).toBe(H.Straight));
});

describe('kickers and ties', () => {
  it('pair kicker decides', () => beats('As Ah Kd 5c 2s', 'Ad Ac Qd 5h 2c'));
  it('second kicker decides', () => beats('As Ah Kd Qc 2s', 'Ad Ac Kh Jc 9s'));
  it('two pair: higher pair, then lower pair, then kicker', () => {
    beats('Ks Kh 2d 2c As', 'Qs Qh Jd Jc As');
    beats('Ks Kh 5d 5c 2s', 'Kd Kc 4h 4s As');
    beats('Ks Kh 5d 5c Ac', 'Kd Kc 5h 5s Qd');
  });
  it('full house: trips rank first, then pair', () => {
    beats('3s 3h 3d 2c 2s', '2s 2h 2d Ac As');
    beats('3s 3h 3d Ac As', '3d 3c 3h Kc Ks');
  });
  it('quads kicker decides', () => beats('9s 9h 9d 9c As', '9s 9h 9d 9c Ks'));
  it('flush compares card by card', () => beats('Ah Kh 9h 4h 2h', 'As Ks 9s 3s 2s'));
  it('identical ranks in different suits tie', () => ties('As Kh 9d 5c 2s', 'Ad Ks 9h 5s 2c'));
  it('suits never break ties', () => ties('9s 9h 7d 6c 2s', '9d 9c 7h 6s 2d'));
});

describe('7-card selection', () => {
  it('picks the best five out of seven', () => expect(ev('As Ad Ac Kh Kd 2c 3s').category).toBe(H.FullHouse));
  it('plays the board when it is the best hand (all five from board)', () => {
    const board = 'As Ks Qs Js Ts';
    ties(`${board} 2h 3d`, `${board} 4c 5c`);
    expect(ev(`${board} 2h 3d`).isRoyal).toBe(true);
  });
  it('board straight: hole pair does not help', () => ties('2s 3h 4d 5c 6s Ah Ad', '2s 3h 4d 5c 6s Kh Kd'));
  it('three pair on 7 cards plays two best pairs + best kicker', () => {
    expect(ev('As Ah Kd Kc Qs Qh 2d').category).toBe(H.TwoPair);
    beats('As Ah Kd Kc Qs Qh 2d', 'As Ah Kd Kc 2s 3h 4d');
  });
  it('flush beats straight when both are available', () => expect(ev('2s 3s 4s 5s 9s 6h 7d').category).toBe(H.Flush));
  it('rejects wrong card counts', () => expect(() => evaluateBest(parseCards('As Ks Qs Js'))).toThrow());
  it('returns the 5 best cards', () => expect(ev('As Ad Ac Kh Kd 2c 3s').best).toHaveLength(5));
});

describe('deck and shuffle', () => {
  it('has 52 unique cards', () => {
    const d = createDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d.map(cardToString)).size).toBe(52);
  });
  it('shuffle keeps all cards and does not mutate the input', () => {
    const d = createDeck();
    const s = shuffle(d, seededRandomInt(1));
    expect(s.map(cardToString).sort()).toEqual(d.map(cardToString).sort());
    expect(d.map(cardToString)).toEqual(createDeck().map(cardToString));
  });
  it('same seed gives same order, different seed differs', () => {
    const a = shuffle(createDeck(), seededRandomInt(42)).map(cardToString);
    const b = shuffle(createDeck(), seededRandomInt(42)).map(cardToString);
    const c = shuffle(createDeck(), seededRandomInt(43)).map(cardToString);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('crypto shuffle works by default', () => expect(shuffle(createDeck())).toHaveLength(52));
});
