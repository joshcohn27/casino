import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import PlayingCard from "../../shared/components/Card";
import type { Card as SharedCard } from "../../shared/lib/cards";
import { formatMoney, addChipToStack, type ChipDenomination, buildChipStackFromAmount, popLastChip, BTN_NEUTRAL, BTN_GOLD } from "../../shared/lib/money";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import { sortByPower, type SortMode } from "../../shared/lib/handSort";
import { SlideBtn } from "../../shared/components/SlideBtn";
import ConfirmDialog from "../../shared/components/ConfirmDialog";
import { defaultBet, defaultToggle } from "../../shared/state/settings";
import { JACKPOT_BET, LINKED_TICK_MS, MUST_HIT_BY, TIER_NAMES, advanceLinkedTables, awardTopHand, placeBet, readJackpot, writeJackpot, type Meters, type OtherWin } from "../../shared/state/tableJackpot";
import { makeRng } from "../../shared/state/progressiveMeter";
import { TableContext, useBetRecorder } from "../../shared/state/sessionContext";
import { resultLineClass } from "../../shared/lib/resultTone";

// ─── Game types (preserved) ───────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣" | "🃏";
type Rank =
    | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
    | "J" | "Q" | "K" | "A" | "JOKER";

type Card = { rank: Rank; suit: Suit; id: string };

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

type Stage = "betting" | "setting" | "showdown";

type FrontEval = {
    category: "High Card" | "Pair";
    score: number[];
    label: string;
};

type FiveEval = {
    category:
        | "High Card" | "Pair" | "Two Pair" | "Trips"
        | "Straight" | "Flush" | "Full House" | "Quads"
        | "Straight Flush" | "Royal Flush" | "Five Aces";
    score: number[];
    label: string;
    usedJoker: boolean;
};

type SplitEval = {
    front: Card[];
    back: Card[];
    frontEval: FrontEval;
    backEval: FiveEval;
    scoreVector: number[];
};

type FortuneCategory =
    | "Natural 7 Card Straight Flush" | "Royal Flush + Royal Match" | "Wild 7 Card Straight Flush"
    | "5 Aces" | "Royal Flush" | "Straight Flush" | "4 of a Kind"
    | "Full House" | "Flush" | "3 of a Kind" | "Straight"
    | "Three Pair" | "No Fortune";

type FortuneResult = {
    category: FortuneCategory;
    multiplier: number;
};

// ─── UI type ──────────────────────────────────────────────────────────────────

type BetSpotId = "main" | "fortune" | "aceHigh";

// ─── Game constants (preserved) ───────────────────────────────────────────────

const SUITS: Exclude<Suit, "🃏">[] = ["♠", "♥", "♦", "♣"];
const RANKS: Exclude<Rank, "JOKER">[] = [
    "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

const VALUE: Record<Exclude<Rank, "JOKER">, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

const MAIN_MIN = 5;
const SIDE_MIN = 0;

const FORTUNE_PAYTABLE_1: Record<Exclude<FortuneCategory, "No Fortune">, number> = {
    "Natural 7 Card Straight Flush": 5000,
    "Royal Flush + Royal Match": 1000,
    "Wild 7 Card Straight Flush": 750,
    "5 Aces": 250,
    "Royal Flush": 100,
    "Straight Flush": 50,
    "4 of a Kind": 20,
    "Full House": 5,
    "Flush": 4,
    "3 of a Kind": 3,
    "Straight": 2,
    "Three Pair": 0,
};

const ACE_HIGH_PAYTABLE = {
    dealerAceHighNoJoker: 5,
    dealerAceHighWithJoker: 15,
    bothAceHigh: 40,
};

// ─── Game pure functions (preserved byte-for-byte) ────────────────────────────

function isJoker(card: Card) {
    return card.rank === "JOKER";
}

function clampBet(n: number, min: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.floor(n / 2.5) * 2.5);
}

function shuffle<T>(items: T[]) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function createDeck(): Card[] {
    const out: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            out.push({ rank, suit, id: `${rank}${suit}` });
        }
    }
    out.push({ rank: "JOKER", suit: "🃏", id: "JOKER" });
    return shuffle(out);
}

// ─── The deal: seven stacks of seven ──────────────────────────────────────────
// As at a real table: the shuffled deck is set out in seven stacks of seven (the last 4 cards
// are not used), and a number from 1 to 7 says which stack is the dealer's. The stacks go
// round in a fixed order: the dealer, then seat 7 on the dealer's far left, round to seat 1 on
// the dealer's right. There is no seat 4.

export const SEATS = [1, 2, 3, 5, 6, 7] as const;
export type Seat = (typeof SEATS)[number];
const DEAL_ROUND: ("dealer" | Seat)[] = ["dealer", 7, 6, 5, 3, 2, 1];
const SEAT_KEY = "casino-paigow-seat";

/** Which stack (1 to 7) goes to a place at the table, when the dealer's stack is number n. */
function stackFor(place: "dealer" | Seat, n: number) {
    return ((n - 1 + DEAL_ROUND.indexOf(place)) % 7) + 1;
}
const stackCards = (deck: Card[], stack: number) => deck.slice((stack - 1) * 7, stack * 7);


function valueOf(card: Card) {
    if (card.rank === "JOKER") return 15;
    return VALUE[card.rank];
}

function combinations<T>(arr: T[], k: number): T[][] {
    const out: T[][] = [];
    const path: T[] = [];
    function dfs(start: number) {
        if (path.length === k) { out.push([...path]); return; }
        for (let i = start; i < arr.length; i++) {
            path.push(arr[i]); dfs(i + 1); path.pop();
        }
    }
    dfs(0);
    return out;
}

function labelValue(v: number) {
    if (v === 14) return "Ace";
    if (v === 13) return "King";
    if (v === 12) return "Queen";
    if (v === 11) return "Jack";
    return String(v);
}

function countValues(values: number[]) {
    const map = new Map<number, number>();
    for (const v of values) { map.set(v, (map.get(v) || 0) + 1); }
    return [...map.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return b[0] - a[0];
    });
}

function paiGowStraightScore(values: number[]): number | null {
    const uniq = [...new Set(values)].sort((a, b) => b - a);
    const set = new Set(uniq);
    if ([14, 13, 12, 11, 10].every((v) => set.has(v))) return 100;
    if ([14, 5, 4, 3, 2].every((v) => set.has(v))) return 99;
    for (let hi = 13; hi >= 5; hi--) {
        const seq = [hi, hi - 1, hi - 2, hi - 3, hi - 4];
        if (seq.every((v) => set.has(v))) return hi;
    }
    return null;
}

function evaluateNaturalFive(cards: Card[]): FiveEval {
    const values = cards.map((c) => valueOf(c)).sort((a, b) => b - a);
    const suits = cards.map((c) => c.suit);
    const flush = suits.every((s) => s === suits[0]);
    const straightScore = paiGowStraightScore(values);
    const counts = countValues(values);

    if (counts.length === 1 && counts[0][0] === 14 && counts[0][1] === 5) {
        return { category: "Five Aces", score: [10, 14], label: "Five Aces", usedJoker: false };
    }
    if (flush && straightScore === 100) {
        return { category: "Royal Flush", score: [9, 100], label: "Royal Flush", usedJoker: false };
    }
    if (flush && straightScore !== null) {
        return {
            category: "Straight Flush", score: [8, straightScore],
            label: straightScore === 99 ? "Wheel Straight Flush" : "Straight Flush", usedJoker: false,
        };
    }
    if (counts[0][1] === 4) {
        return { category: "Quads", score: [7, counts[0][0], counts[1][0]], label: `Four ${labelValue(counts[0][0])}s`, usedJoker: false };
    }
    if (counts[0][1] === 3 && counts[1][1] === 2) {
        return {
            category: "Full House", score: [6, counts[0][0], counts[1][0]],
            label: `${labelValue(counts[0][0])}s Full of ${labelValue(counts[1][0])}s`, usedJoker: false,
        };
    }
    if (flush) {
        return { category: "Flush", score: [5, ...values], label: `${labelValue(values[0])}-High Flush`, usedJoker: false };
    }
    if (straightScore !== null) {
        return {
            category: "Straight", score: [4, straightScore],
            label: straightScore === 99 ? "Wheel Straight" : straightScore === 100 ? "Ace-High Straight" : `${labelValue(straightScore)}-High Straight`, usedJoker: false,
        };
    }
    if (counts[0][1] === 3) {
        const kickers = counts.slice(1).map(([v]) => v).sort((a, b) => b - a);
        return { category: "Trips", score: [3, counts[0][0], ...kickers], label: `Three ${labelValue(counts[0][0])}s`, usedJoker: false };
    }
    if (counts[0][1] === 2 && counts[1][1] === 2) {
        const highPair = Math.max(counts[0][0], counts[1][0]);
        const lowPair = Math.min(counts[0][0], counts[1][0]);
        return {
            category: "Two Pair", score: [2, highPair, lowPair, counts[2][0]],
            label: `${labelValue(highPair)}s and ${labelValue(lowPair)}s`, usedJoker: false,
        };
    }
    if (counts[0][1] === 2) {
        const kickers = counts.slice(1).map(([v]) => v).sort((a, b) => b - a);
        return { category: "Pair", score: [1, counts[0][0], ...kickers], label: `Pair of ${labelValue(counts[0][0])}s`, usedJoker: false };
    }
    return { category: "High Card", score: [0, ...values], label: `${labelValue(values[0])} High`, usedJoker: false };
}

function compareVectors(a: number[], b: number[]) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const av = a[i] ?? -1; const bv = b[i] ?? -1;
        if (av > bv) return 1; if (av < bv) return -1;
    }
    return 0;
}

function compareFive(a: FiveEval, b: FiveEval) { return compareVectors(a.score, b.score); }

function evaluateFive(cards: Card[]): FiveEval {
    const jokerCount = cards.filter(isJoker).length;
    if (jokerCount === 0) return evaluateNaturalFive(cards);
    if (jokerCount > 1) {
        return evaluateNaturalFive(
            cards.map((c) => (isJoker(c) ? { rank: "A", suit: "♠", id: "JX" } : c)) as Card[]
        );
    }
    const nonJoker = cards.filter((c) => !isJoker(c));
    let best: FiveEval | null = null;
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            const replacement: Card = { rank, suit, id: `REP-${rank}${suit}` };
            const replaced = [...nonJoker, replacement];
            const natural = evaluateNaturalFive(replaced);
            const replacementIsAce = rank === "A";
            const allowedAsWild =
                natural.category === "Straight" || natural.category === "Flush" ||
                natural.category === "Straight Flush" || natural.category === "Royal Flush";
            const valid = replacementIsAce || allowedAsWild || natural.category === "Five Aces";
            if (!valid) continue;
            const candidate: FiveEval = { ...natural, usedJoker: true };
            if (!best || compareFive(candidate, best) > 0) best = candidate;
        }
    }
    if (!best) {
        const fallback = evaluateNaturalFive([...nonJoker, { rank: "A", suit: "♠", id: "REP-A♠" }]);
        return { ...fallback, usedJoker: true };
    }
    return best;
}

function evaluateFront(cards: Card[]): FrontEval {
    const values = cards.map((c) => (isJoker(c) ? 14 : valueOf(c))).sort((a, b) => b - a);
    if (values[0] === values[1]) {
        return { category: "Pair", score: [1, values[0]], label: `Pair of ${labelValue(values[0])}s` };
    }
    return { category: "High Card", score: [0, values[0], values[1]], label: `${labelValue(values[0])}-${labelValue(values[1])}` };
}

function compareFront(a: FrontEval, b: FrontEval) { return compareVectors(a.score, b.score); }

function isLegalSplit(back: FiveEval, front: FrontEval) {
    if (
        back.category === "Trips" || back.category === "Straight" || back.category === "Flush" ||
        back.category === "Full House" || back.category === "Quads" || back.category === "Straight Flush" ||
        back.category === "Royal Flush" || back.category === "Five Aces" || back.category === "Two Pair"
    ) return true;
    if (back.category === "Pair") {
        if (front.category === "High Card") return true;
        // the same pair in both hands is legal: it is how four of a kind is split
        return (back.score[1] ?? 0) >= (front.score[1] ?? 0);
    }
    if (back.category === "High Card") {
        if (front.category === "Pair") return false;
        const backTop = [back.score[1] ?? 0, back.score[2] ?? 0];
        const frontTop = [front.score[1] ?? 0, front.score[2] ?? 0];
        return compareVectors(backTop, frontTop) > 0;
    }
    return true;
}

function buildSplit(front: Card[], allCards: Card[]): SplitEval {
    const frontIds = new Set(front.map((c) => c.id));
    const back = allCards.filter((c) => !frontIds.has(c.id));
    const frontEval = evaluateFront(front);
    const backEval = evaluateFive(back);
    return { front, back, frontEval, backEval, scoreVector: [...backEval.score, ...frontEval.score] };
}

// ─── Dealer house way ────────────────────────────────────────────────────────
// How the dealer sets seven cards. This follows the MGM Grand house way as published by
// Wizard of Odds (wizardofodds.com/games/pai-gow-poker/house-way/mgm/). The joker is an ace
// unless it fills a straight or flush.
//
//   No pair          highest card behind, next two in front
//   One pair         pair behind, two highest others in front
//   Two pair         low is 2-6, medium 7-10, high J-K.
//                    low + low: split unless holding an ace or king (the one place this departs
//                    from MGM, which never splits two low pairs). low + medium, low + high, medium + medium:
//                    split unless holding an ace. medium + high, high + high, aces + any: split.
//   Three pair       highest pair in front
//   Three of a kind  keep together, except aces: one ace in front
//   Two threes       a pair from the higher three in front
//   Straight/flush   keep it behind with the two highest cards that leave it whole in front.
//                    With a pair: pair in front if the straight or flush survives.
//                    With an ace and a pair of 10s to kings: ace in front, pair behind, unless
//                    the straight or flush can be kept with the ace in front.
//                    With two pair: two pair rules, but two low pairs play the straight or
//                    flush unless an ace can go in front. With three of a kind: pair in front.
//   Full house       pair in front, three behind. Exception: pair of 2s with an ace and king
//                    plays ace-king in front. With two pair: higher pair in front.
//   Four of a kind   2-6 keep together. 7-10 split unless an ace can go in front.
//                    Jacks to aces split. With a pair or three as well: keep the four together
//                    and play the pair in front, except four aces, which split unless the
//                    pair is kings.
//   Five aces        two aces in front, unless a pair of kings can go in front.

/** A card's rank for setting the hand: the joker counts as an ace. */
function houseValue(card: Card) {
    return isJoker(card) ? 14 : valueOf(card);
}

const MADE_HANDS = ["Straight", "Flush", "Straight Flush", "Royal Flush"];

/** Every legal way to keep a straight, flush or better-of-that-family in the High hand, best Low hand first. */
function madeHandSplits(cards: Card[]): SplitEval[] {
    const out: { split: SplitEval; score: number[] }[] = [];
    for (const front of combinations(cards, 2)) {
        const split = buildSplit(front, cards);
        if (!MADE_HANDS.includes(split.backEval.category) || !isLegalSplit(split.backEval, split.frontEval)) continue;
        out.push({ split, score: [...split.frontEval.score, ...split.backEval.score] });
    }
    return out.sort((x, y) => compareVectors(y.score, x.score)).map((x) => x.split);
}

/** The two cards the house way puts in the Low hand. */
function houseWayFront(cards: Card[]): Card[] {
    const byRank = [...cards].sort((x, y) => houseValue(y) - houseValue(x) || (isJoker(x) ? 1 : 0) - (isJoker(y) ? 1 : 0));
    const groupMap = new Map<number, Card[]>();
    for (const card of byRank) groupMap.set(houseValue(card), [...(groupMap.get(houseValue(card)) ?? []), card]);
    const groups = [...groupMap.entries()].map(([value, group]) => ({ value, cards: group }));
    const ofSize = (n: number) => groups.filter((g) => g.cards.length === n).sort((x, y) => y.value - x.value);
    const fives = ofSize(5), quads = ofSize(4), trips = ofSize(3), pairs = ofSize(2);
    const singles = ofSize(1).map((g) => g.cards[0]);
    const hasAce = singles.some((c) => houseValue(c) === 14);
    const top2 = (list: Card[]) => list.slice(0, 2);
    const made = madeHandSplits(cards);
    const kings = pairs.find((p) => p.value === 13);

    // five aces
    if (fives.length > 0) return kings ? kings.cards : fives[0].cards.slice(0, 2);

    // four of a kind
    if (quads.length > 0) {
        const four = quads[0];
        if (four.value === 14) return kings ? kings.cards : four.cards.slice(0, 2);
        if (trips.length > 0) return trips[0].cards.slice(0, 2);
        if (pairs.length > 0) return pairs[0].cards;
        if (four.value <= 6) return top2(singles);
        if (four.value <= 10 && hasAce) return top2(singles);
        return four.cards.slice(0, 2);
    }

    // full houses
    if (trips.length === 2) return trips[0].cards.slice(0, 2);
    if (trips.length === 1 && pairs.length === 2) return pairs[0].cards;
    if (trips.length === 1 && pairs.length === 1) {
        const king = singles.find((c) => houseValue(c) === 13);
        const ace = singles.find((c) => houseValue(c) === 14);
        if (pairs[0].value === 2 && ace && king) return [ace, king];
        return pairs[0].cards;
    }

    // three of a kind
    if (trips.length === 1) {
        const three = trips[0];
        const pairInFront = made.find((m) => m.frontEval.category === "Pair");
        if (pairInFront) return pairInFront.front;
        if (three.value === 14) return [three.cards[0], singles[0]];
        return top2(singles);
    }

    // three pair
    if (pairs.length === 3) return pairs[0].cards;

    // two pair
    if (pairs.length === 2) {
        const [high, low] = pairs;
        const size = (v: number) => (v <= 6 ? 0 : v <= 10 ? 1 : 2);
        const bothLow = size(high.value) === 0;
        if (bothLow && made.length > 0 && !hasAce) return made[0].front;
        // Two low pairs: MGM never splits them. Josh chose the common rule instead: split them
        // (higher pair behind, lower pair in front) unless an ace or king can go in front.
        const hasKingOrAce = singles.some((c) => houseValue(c) >= 13);
        const split = high.value === 14
            || (size(high.value) === 2 && size(low.value) >= 1)
            || (!bothLow && !hasAce)
            || (bothLow && !hasKingOrAce);
        return split ? low.cards : top2(singles);
    }

    // one pair
    if (pairs.length === 1) {
        if (made.length > 0) {
            if (made[0].frontEval.category === "Pair") return made[0].front;
            if (hasAce && pairs[0].value >= 10 && pairs[0].value <= 13) {
                const aceInFront = made.find((m) => m.front.some((c) => houseValue(c) === 14));
                return aceInFront ? aceInFront.front : top2(singles);
            }
            return made[0].front;
        }
        return top2(singles);
    }

    // no pair
    if (made.length > 0) return made[0].front;
    return [byRank[1], byRank[2]];
}

function evaluateDealerHouseWay(cards: Card[]): SplitEval {
    const split = buildSplit(houseWayFront(cards), cards);
    if (isLegalSplit(split.backEval, split.frontEval)) return split;
    // The house can never set a foul hand. If a rule above would, fall back to the legal set
    // with the best High hand.
    let best: SplitEval | null = null;
    for (const front of combinations(cards, 2)) {
        const candidate = buildSplit(front, cards);
        if (!isLegalSplit(candidate.backEval, candidate.frontEval)) continue;
        if (!best || compareVectors(candidate.scoreVector, best.scoreVector) > 0) best = candidate;
    }
    return best ?? split;
}

function evaluateBestSplit(cards: Card[]): { best: SplitEval; allBestFrontKeySet: Set<string> } {
    const frontCombos = combinations(cards, 2);
    let best: SplitEval | null = null;
    const bestKeys = new Set<string>();
    for (const front of frontCombos) {
        const split = buildSplit(front, cards);
        if (!isLegalSplit(split.backEval, split.frontEval)) continue;
        if (!best) { best = split; bestKeys.add([...front].map((c) => c.id).sort().join("|")); continue; }
        const cmp = compareVectors(split.scoreVector, best.scoreVector);
        if (cmp > 0) { best = split; bestKeys.clear(); bestKeys.add([...front].map((c) => c.id).sort().join("|")); }
        else if (cmp === 0) { bestKeys.add([...front].map((c) => c.id).sort().join("|")); }
    }
    if (!best) {
        const fallbackFront = cards.slice(0, 2);
        best = buildSplit(fallbackFront, cards);
        bestKeys.add([...fallbackFront].map((c) => c.id).sort().join("|"));
    }
    return { best, allBestFrontKeySet: bestKeys };
}

/**
 * How a split does against the dealer's set hand, as money: 2 wins both hands, 1 pushes
 * (one each), 0 loses. A copy (tie) goes to the dealer. Splits with the same number here
 * pay exactly the same.
 */
function resultAgainstDealer(split: Pick<SplitEval, "backEval" | "frontEval">, dealer: SplitEval): number {
    const back = compareFive(split.backEval, dealer.backEval) > 0;
    const front = compareFront(split.frontEval, dealer.frontEval) > 0;
    return back && front ? 2 : back || front ? 1 : 0;
}

const frontKey = (cards: Card[]) => cards.map((c) => c.id).sort().join("|");

function evaluateBestSplitAgainstDealer(
    playerCards: Card[],
    dealerSplit: SplitEval
): { best: SplitEval; allBestFrontKeySet: Set<string> } {
    const frontCombos = combinations(playerCards, 2);
    let best: SplitEval | null = null;
    let bestOutcomeScore: number[] | null = null;
    const bestKeys = new Set<string>();
    for (const front of frontCombos) {
        const split = buildSplit(front, playerCards);
        if (!isLegalSplit(split.backEval, split.frontEval)) continue;
        const backCmp = compareFive(split.backEval, dealerSplit.backEval);
        const frontCmp = compareFront(split.frontEval, dealerSplit.frontEval);
        const wins = (backCmp > 0 ? 1 : 0) + (frontCmp > 0 ? 1 : 0);
        const losses = (backCmp <= 0 ? 1 : 0) + (frontCmp <= 0 ? 1 : 0);
        let outcomeTier = 0;
        if (wins === 2) outcomeTier = 2;
        else if (wins === 1 && losses === 1) outcomeTier = 1;
        const outcomeScore = [outcomeTier, backCmp > 0 ? 1 : 0, frontCmp > 0 ? 1 : 0, ...split.backEval.score, ...split.frontEval.score];
        if (!best || !bestOutcomeScore) { best = split; bestOutcomeScore = outcomeScore; bestKeys.add([...front].map((c) => c.id).sort().join("|")); continue; }
        const cmp = compareVectors(outcomeScore, bestOutcomeScore);
        if (cmp > 0) { best = split; bestOutcomeScore = outcomeScore; bestKeys.clear(); bestKeys.add([...front].map((c) => c.id).sort().join("|")); }
        else if (cmp === 0) { bestKeys.add([...front].map((c) => c.id).sort().join("|")); }
    }
    if (!best) return evaluateBestSplit(playerCards);
    return { best, allBestFrontKeySet: bestKeys };
}

function getHighPaiGowInfo(cards: Card[]) {
    const bestFive = combinations(cards, 5).map((combo) => evaluateFive(combo)).sort((a, b) => compareFive(b, a))[0];
    const hasJoker = cards.some(isJoker);
    const aceHigh = bestFive.category === "High Card" && (bestFive.score[1] ?? 0) === 14;
    return { aceHigh, hasJoker, bestFive };
}

function isNaturalSevenCardStraightFlush(cards: Card[]) {
    if (cards.some(isJoker)) return false;
    const suits = new Set(cards.map((c) => c.suit));
    if (suits.size !== 1) return false;
    const values = cards.map((c) => valueOf(c));
    const uniq = [...new Set(values)].sort((a, b) => a - b);
    if (uniq.length !== 7) return false;
    let consecutive = true;
    for (let i = 1; i < uniq.length; i++) { if (uniq[i] !== uniq[i - 1] + 1) { consecutive = false; break; } }
    const isA234567 = JSON.stringify([...uniq].sort((a, b) => a - b)) === JSON.stringify([2, 3, 4, 5, 6, 7, 14]);
    const wheel = [1, 2, 3, 4, 5, 6, 14];
    const lowMapped = uniq.includes(14) ? [...uniq.filter((v) => v !== 14), 14] : uniq;
    return consecutive || isA234567 || JSON.stringify(lowMapped) === JSON.stringify(wheel);
}

function isWildSevenCardStraightFlush(cards: Card[]) {
    if (!cards.some(isJoker)) return false;
    const noJoker = cards.filter((c) => !isJoker(c));
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            const replaced = [...noJoker, { rank, suit, id: `R-${rank}${suit}` } as Card];
            if (isNaturalSevenCardStraightFlush(replaced)) return true;
        }
    }
    return false;
}

function countSevenCardPairs(cards: Card[]) {
    const values = cards.filter((c) => !isJoker(c)).map((c) => valueOf(c));
    const counts = countValues(values);
    return counts.filter(([, c]) => c >= 2).length;
}

function hasRoyalPlusRM(cards: Card[]) {
    const fiveCombos = combinations(cards, 5);
    for (const combo of fiveCombos) {
        const evald = evaluateFive(combo);
        if (evald.category !== "Royal Flush") continue;
        const comboIds = new Set(combo.map((c) => c.id));
        const leftovers = cards.filter((c) => !comboIds.has(c.id));
        if (leftovers.length !== 2) continue;
        // a Royal Match is a King and a Queen of the same suit (real cards, not the Joker)
        const [a, b] = leftovers;
        if (isJoker(a) || isJoker(b) || a.suit !== b.suit) continue;
        const ranks = [a.rank, b.rank].sort().join("");
        if (ranks === "KQ") return true;
    }
    return false;
}

function evaluateFortune(cards: Card[]): FortuneResult {
    if (isNaturalSevenCardStraightFlush(cards)) return { category: "Natural 7 Card Straight Flush", multiplier: FORTUNE_PAYTABLE_1["Natural 7 Card Straight Flush"] };
    if (hasRoyalPlusRM(cards)) return { category: "Royal Flush + Royal Match", multiplier: FORTUNE_PAYTABLE_1["Royal Flush + Royal Match"] };
    if (isWildSevenCardStraightFlush(cards)) return { category: "Wild 7 Card Straight Flush", multiplier: FORTUNE_PAYTABLE_1["Wild 7 Card Straight Flush"] };
    // Fortune pays the best line on its own pay table that any five of the seven cards make. That is
    // not always the best poker hand: three of a kind pays more than a straight (3 to 1 against
    // 2 to 1), so cards that make both are paid as three of a kind.
    const FORTUNE_OF: Partial<Record<FiveEval["category"], Exclude<FortuneCategory, "No Fortune">>> = {
        "Five Aces": "5 Aces", "Royal Flush": "Royal Flush", "Straight Flush": "Straight Flush", Quads: "4 of a Kind",
        "Full House": "Full House", Flush: "Flush", Trips: "3 of a Kind", Straight: "Straight",
    };
    let best: Exclude<FortuneCategory, "No Fortune"> | null = null;
    for (const combo of combinations(cards, 5)) {
        const category = FORTUNE_OF[evaluateFive(combo).category];
        if (category && (best === null || FORTUNE_PAYTABLE_1[category] > FORTUNE_PAYTABLE_1[best])) best = category;
    }
    if (best) return { category: best, multiplier: FORTUNE_PAYTABLE_1[best] };
    if (countSevenCardPairs(cards) === 3) return { category: "Three Pair", multiplier: FORTUNE_PAYTABLE_1["Three Pair"] };
    return { category: "No Fortune", multiplier: -1 };
}

// ─── Table jackpot ($5) ──────────────────────────────────────────────────────
// Five aces and a 7-card straight flush win the Ultra or the Major, picked at random.
// Below those, fixed amounts. The $5 is not returned on top of a win.
const JACKPOT_TOP_HANDS = new Set(["Natural 7 Card Straight Flush", "Wild 7 Card Straight Flush", "5 Aces"]);
const JACKPOT_FIXED: Record<string, number> = { "Royal Flush + Royal Match": 2000, "Royal Flush": 2000, "Straight Flush": 500, "4 of a Kind": 375, "Full House": 25 };
const JACKPOT_ROWS: [string, string, string[]][] = [
    ["5 Aces or 7-Card Straight Flush", "Ultra or Major", ["Natural 7 Card Straight Flush", "Wild 7 Card Straight Flush", "5 Aces"]],
    ["Royal Flush", "$2,000", ["Royal Flush", "Royal Flush + Royal Match"]],
    ["Straight Flush", "$500", ["Straight Flush"]],
    ["Four of a Kind", "$375", ["4 of a Kind"]],
    ["Full House", "$25", ["Full House"]],
];
const NOTICE_MS = 6000;

// Fortune Envy: what you are paid when ANOTHER seat makes one of these hands, if your Fortune bet
// is at least $5. The dealer's hand and your own never count; each seat that hits pays you.
const ENVY_PAYS: Record<string, number> = {
    "Natural 7 Card Straight Flush": 5000,
    "Royal Flush + Royal Match": 1000,
    "Wild 7 Card Straight Flush": 500,
    "5 Aces": 250,
    "Royal Flush": 50,
    "Straight Flush": 20,
    "4 of a Kind": 5,
};
const ENVY_MIN_FORTUNE = 5;
// how the notice lays out another seat's seven cards: the hand it names first, then the rest
const ENVY_SORT: Record<string, SortMode> = {
    "Natural 7 Card Straight Flush": "straightFlush",
    "Royal Flush + Royal Match": "straightFlush",
    "Wild 7 Card Straight Flush": "straightFlush",
    "Royal Flush": "straightFlush",
    "Straight Flush": "straightFlush",
};
type EnvyHit = { seat: Seat; category: string; amount: number; cards: Card[] };

function sidebetRows() {
    return [
        ["Natural 7 Card Straight Flush", 5000],
        ["Royal Flush + Royal Match", 1000],
        ["Wild 7 Card Straight Flush", 750],
        ["5 Aces", 250],
        ["Royal Flush", 100],
        ["Straight Flush", 50],
        ["4 of a Kind", 20],
        ["Full House", 5],
        ["Flush", 4],
        ["3 of a Kind", 3],
        ["Straight", 2],
        ["Three Pair", "Push"],
    ] as const;
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CARD_SM = "h-[70px] w-[49px] rounded-[9px] sm:h-[82px] sm:w-[57px] sm:rounded-[11px]";

const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
};

const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});

// Dealer reveal: steps 1-7 turn the dealer's cards one at a time, step 8 sets them into High / Low
const DEALER_SET = 8;

// Cards sit in absolutely placed slots so a single card can slide between rows.
// --cw / --ch are the card width / height set on the stack container.
const STACK_VARS = "[--cw:49px] [--ch:70px] sm:[--cw:57px] sm:[--ch:82px]";
const SLOT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function slotStyle(row: number, col: number, count: number, rowStep: number, z: number): React.CSSProperties {
    // cards tighten up on narrow screens instead of wrapping
    const step = `min(calc(var(--cw) + 6px), calc((100% - var(--cw)) / ${Math.max(count - 1, 1)}))`;
    return {
        position: "absolute",
        left: `calc(50% - var(--cw) / 2 + ${col - (count - 1) / 2} * ${step})`,
        top: `calc(var(--ch) * ${row * rowStep})`,
        zIndex: z,
        transition: `left 0.4s ${SLOT_EASE}, top 0.4s ${SLOT_EASE}`,
    };
}

// How a split does against the dealer (2 wins both, 1 one each, 0 loses both), in words.
const OUTCOME_WORDS = ["loses", "pushes", "wins"];

// A folded hand: the cards turn over one after another, then slide into a pile.
const FOLD_FLIP_MS = 90;      // between one card turning over and the next
const FOLD_PILE_MS = 450;     // after the last card turns, before they gather
const PILE_TURN = [-4, 3, -2, 5, -3, 2, -1];

function pileStyle(k: number, rowStep: number): React.CSSProperties {
    return {
        position: "absolute",
        left: `calc(50% - var(--cw) / 2 + ${(k % 3) - 1}px)`,
        top: `calc(var(--ch) * ${rowStep / 2} - ${k * 1.5}px)`,
        zIndex: 30 + k,
        transform: `rotate(${PILE_TURN[k % PILE_TURN.length]}deg)`,
        transition: `left 0.45s ${SLOT_EASE} ${k * 35}ms, top 0.45s ${SLOT_EASE} ${k * 35}ms, transform 0.45s ${SLOT_EASE} ${k * 35}ms`,
    };
}

// How far the second row sits below the first, as a share of card height.
// Less than 1 so the hands overlap like a stack on a real table.
const DEALER_ROW_STEP = 0.62;
const PLAYER_ROW_STEP = 0.78;

const ACE_HIGH_ROWS: Array<[string, number]> = [
    ["Both Ace High", 40],
    ["Dealer Ace High + Joker", 15],
    ["Dealer Ace High, No Joker", 5],
];

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toShared(card: Card, faceUp: boolean): SharedCard {
    const rank = card.rank === "JOKER" ? "JOKER" : card.rank === "10" ? "T" : card.rank;
    const suit = card.suit === "🃏" ? "JOKER" : card.suit;
    return { id: card.id, suit: suit as SharedCard["suit"], rank: rank as SharedCard["rank"], faceUp };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type PayoutEntry = readonly [string, number | string];

function PayoutColumn({ title, entries, highlight, envy, envyHit }: {
    title: string;
    entries: ReadonlyArray<PayoutEntry>;
    highlight?: string | null;
    /** an Envy amount for some rows, shown in a column of its own */
    envy?: Record<string, number>;
    /** rows another seat hit this hand */
    envyHit?: ReadonlySet<string>;
}) {
    return (
        <div className="flex flex-col gap-0.5 pt-1.5">
            <div className="mb-0.5 text-center text-[13px] font-extrabold text-amber-200">
                {title}
            </div>
            {envy && (
                <div className="flex items-center justify-end gap-2 px-1.5 text-[10px] font-bold text-white/60">
                    <span>Pays</span>
                    <span className="w-[46px] text-right">Envy</span>
                </div>
            )}
            {entries.map(([hand, pays]) => {
                const isHit = highlight === hand;
                const envyAmount = envy?.[hand];
                const isEnvyHit = !!envyHit?.has(hand);
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-px text-[11px] transition ${isHit ? "bg-amber-300/12" : ""}`}>
                        <span className={isHit ? "font-extrabold text-amber-100" : "text-white/75"}>{hand}</span>
                        <span className="flex shrink-0 items-center gap-2">
                            <span className="font-bold text-gold">{typeof pays === "number" ? `${pays} to 1` : pays}</span>
                            {envy && (
                                <span className={`w-[46px] text-right font-bold ${isEnvyHit ? "rounded bg-emerald-400/20 text-emerald-200" : "text-gold"}`}>
                                    {envyAmount ? `$${envyAmount.toLocaleString("en-US")}` : ""}
                                </span>
                            )}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

const RULES_SECTIONS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ["How the Hand Works", [
        "• You and the dealer each receive 7 cards from a 53-card deck that includes one Joker.",
        "• You split your 7 cards into a 5-card high hand and a 2-card low hand.",
        "• The dealer sets their hand using house-way rules.",
        "• Your high hand must outrank your low hand or the split is illegal.",
    ]],
    ["The Joker", [
        "• The Joker is semi-wild. It can complete a straight, flush, straight flush, or royal flush.",
        "• Otherwise it plays as an Ace.",
        "• In the low (2-card) hand, the Joker always counts as an Ace.",
    ]],
    ["Winning", [
        "• Win both hands: your main bet wins even money.",
        "• Win one hand, lose one hand: push, main bet returned.",
        "• Lose both hands: main bet lost.",
        "• Dealer wins all ties on both hands.",
        "• If the dealer has an Ace-high pai gow (no pair or better), the main bet pushes automatically.",
        "• You can fold instead of setting your hand. You lose the main bet; Fortune, Ace High and the table jackpot still pay.",
    ]],
    ["The Deal and Your Seat", [
        "• Pick your seat: 1, 2, 3, 5, 6 or 7 (there is no seat 4). You can change it any time; it applies from the next hand.",
        "• Each hand, the shuffled deck is set out in seven stacks of seven cards. The last 4 cards are not used.",
        "• A random deal number from 1 to 7 picks which stack is the dealer's.",
        "• The other stacks go round the table in order: dealer, then seat 7 on the dealer's far left, round to seat 1 on the dealer's right.",
        "• So your seat and the deal number decide which stack is yours, as at a real table. It does not change your odds.",
    ]],
    ["Ask Dealer for Help", [
        "• Pressing Ask Dealer for Help calculates the split that gives you the best possible outcome against the dealer's revealed hand.",
        "• The outcome check indicator shows whether your current split matches, beats, or falls short of that optimal outcome.",
    ]],
    ["Fortune Bonus", [
        "• The Fortune side bet pays based on the best 5-card hand in your 7 cards, regardless of how you set the hand.",
        "• Three Pair pushes (returns your bet).",
        "• Royal Flush + Royal Match: a royal flush, with your other two cards a King and Queen of the same suit.",
        "• Envy Bonus: with a Fortune bet of $5 or more, you are also paid when another seat at the table makes four of a kind or better. See the Envy column: $5 for four of a kind up to $5,000 for a natural 7-card straight flush. Each seat that hits pays you. The dealer's hand and your own do not count.",
        "• All other qualifying hands pay as shown in the payout table.",
    ]],
    ["Ace High Side Bet", [
        "• Pays when the dealer has an ace-high pai gow (no pair or better in their 7 cards).",
        "• Dealer ace-high without joker pays 5 to 1.",
        "• Dealer ace-high with joker pays 15 to 1.",
        "• Both player and dealer ace-high pays 40 to 1.",
        "• Note: a pair of Aces (even with a joker) does not qualify — the dealer must have no pair at all in their 7 cards.",
    ]],
] as const;

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;
    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
                <button className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close rules modal" />
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[4px] border border-[#5a8a69] bg-[#0a2311] text-text"
                >
                    <div className="flex items-center justify-between border-b border-[#5a8a69] px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[13px] font-extrabold text-amber-200/90">Help</div>
                            <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">Pai Gow Poker Rules</div>
                        </div>
                        <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#5a8a69] bg-[#10391d] text-xl font-bold text-text transition-colors hover:bg-[#154a25] active:bg-[#0a2311]">×</button>
                    </div>
                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-4 text-base leading-6 text-text">
                            {RULES_SECTIONS.map(([title, items]) => (
                                <div key={title} className="rounded-[4px] border border-[#5a8a69] bg-[#10391d] p-4">
                                    <div className="mb-2 text-sm font-extrabold text-amber-200">{title}</div>
                                    <div className="space-y-1">{items.map((s) => <div key={s}>{s}</div>)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

/** Your seat, and the number the last hand was dealt from. It keeps one height. */
function DealLine({ seat, onSeat, number }: { seat: Seat; onSeat: (s: Seat) => void; number: number | null }) {
    return (
        <div className="mb-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2" data-testid="deal-line">
            <label className="flex items-center gap-2 text-sm font-semibold text-white/80">
                Seat
                <select
                    value={seat}
                    onChange={(e) => onSeat(Number(e.target.value) as Seat)}
                    className="min-h-[44px] rounded-[4px] border border-room-line bg-room-deep px-3 text-sm font-bold text-room-text"
                    data-testid="seat-picker"
                >
                    {SEATS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
            </label>
            <div className="flex items-center gap-2" data-deal-number={number ?? ""}>
                <span className="text-sm font-semibold text-white/80">Deal number</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gold-deep bg-ink text-base font-extrabold text-gold-soft">{number ?? "-"}</span>
            </div>
        </div>
    );
}

function TableLabel({ onRules }: { onRules: () => void }) {
    return (
        <div className="mb-2 flex shrink-0 select-none flex-col items-center gap-1">
            <div className="flex items-center gap-2">
                <h1
                    className="text-center text-2xl font-bold text-gold-soft"
                >
                    Face-up Pai Gow Poker
                </h1>
                <button
                    onClick={onRules}
                    className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                    aria-label="Show rules"
                >
                    i
                </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                <span>7 CARDS · SPLIT INTO 5-CARD HIGH AND 2-CARD LOW</span>
                <span className="text-white/75">·</span>
                <span>Dealer ties win</span>
                <span className="text-white/75">·</span>
                <span>DEALER ACE HIGH PUSHES</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm font-semibold text-white/75">
                <span>Win both = even money</span>
                <span className="text-white/75">·</span>
                <span>Split = push</span>
                <span className="text-white/75">·</span>
                <span>Lose both = lose</span>
            </div>
        </div>
    );
}

function PaiGowBar({
    stage, selectedChip, selectedIsLegal, selectedFrontIds, canRebet, dealerSetting, playerReady, autoFinishing,
    onRevealAll, onChipSelect, onDeal, onAutoSetBest, onSetHand, onFold, onClear, onReset, onChangeBet,
}: {
    stage: Stage;
    selectedChip: ChipDenomination;
    selectedIsLegal: boolean;
    selectedFrontIds: string[];
    canRebet: boolean;
    dealerSetting: boolean;
    playerReady: boolean;
    /** Dealer has Ace-high: once the player's cards are up the table sets them and ends the hand. */
    autoFinishing: boolean;
    onRevealAll: () => void;
    onChipSelect: (c: ChipDenomination) => void;
    onDeal: () => void;
    onAutoSetBest: () => void;
    onSetHand: () => void;
    /** Give up the main bet and end the hand. Side bets still settle. */
    onFold: () => void;
    onClear: () => void;
    /** Back to the bets saved in Settings */
    onReset: () => void;
    onChangeBet: () => void;
}) {
    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
            <ChipTray selectedChip={selectedChip} onSelect={onChipSelect} disabled={stage !== "betting"} />
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {stage === "betting" && (
                        <SlideBtn key="clear">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear}>Clear</button>
                        </SlideBtn>
                    )}
                    {stage === "betting" && (
                        <SlideBtn key="reset">
                            <button data-hotkey="E" className={BTN_NEUTRAL} onClick={onReset}>Reset</button>
                        </SlideBtn>
                    )}
                    {stage === "betting" && (
                        <SlideBtn key="deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && !playerReady && (
                        <SlideBtn key="reveal">
                            <button data-hotkey="R" className={BTN_GOLD} onClick={onRevealAll} disabled={dealerSetting}>Reveal Cards</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && !autoFinishing && playerReady && (
                        <SlideBtn key="fold">
                            <button data-hotkey="F" className={BTN_NEUTRAL} onClick={onFold}>Fold</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && !autoFinishing && playerReady && (
                        <SlideBtn key="auto">
                            <button data-hotkey="A" className={BTN_NEUTRAL} onClick={onAutoSetBest}>Ask Dealer for Help</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && !autoFinishing && playerReady && (
                        <SlideBtn key="set">
                            <button data-hotkey="Enter"
                                className={BTN_GOLD}
                                onClick={onSetHand}
                                disabled={!selectedIsLegal || selectedFrontIds.length !== 2}
                            >
                                Set Hand
                            </button>
                        </SlideBtn>
                    )}
                    {stage === "showdown" && (
                        <SlideBtn key="clear-done">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear}>Clear</button>
                        </SlideBtn>
                    )}
                    {stage === "showdown" && (
                        <SlideBtn key="change-bet">
                            <button data-hotkey="B" className={BTN_NEUTRAL} onClick={onChangeBet}>Change Bet</button>
                        </SlideBtn>
                    )}
                    {stage === "showdown" && (
                        <SlideBtn key="rebet">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canRebet}>Rebet &amp; Deal</button>
                        </SlideBtn>
                    )}
                </AnimatePresence>
            </div>
            <div className="invisible hidden sm:block">
                <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PaiGowPoker({ bankroll, setBankroll }: Props) {
    // two decks take turns, gold backs then purple: every hand is dealt from the other deck
    const [deckNo, setDeckNo] = useState(0);
    // your seat: remembered, and it can change any time (it applies from the next deal)
    const [seat, setSeat] = useState<Seat>(() => {
        try { const v = Number(window.localStorage.getItem(SEAT_KEY)); return (SEATS as readonly number[]).includes(v) ? (v as Seat) : 3; } catch { return 3; }
    });
    const chooseSeat = (v: Seat) => { setSeat(v); try { window.localStorage.setItem(SEAT_KEY, String(v)); } catch { /* not kept */ } };
    const [dealNumber, setDealNumber] = useState<number | null>(null);
    const [envyHits, setEnvyHits] = useState<EnvyHit[]>([]);
    const [envyShown, setEnvyShown] = useState(false);
    const seatAtDeal = useRef<Seat>(3);
    const numberAtDeal = useRef<number>(1);
    const recordBet = useBetRecorder();
    // the hand (by deck number) the player folded, and how far its fold has played: 1-7 cards
    // turned over, 8 gathered into a pile. Only how the cards look; the fold itself settles at once.
    const [foldedDeck, setFoldedDeck] = useState<number | null>(null);
    const [foldStep, setFoldStep] = useState(0);
    // a fold that gives up a hand that could push or win is checked first: what the hand can still do
    const [foldCheck, setFoldCheck] = useState<null | "win" | "push" | "acehigh">(null);
    // setting a split that does worse than the best one asks first: how it does as set, and the better way
    const [setCheck, setSetCheck] = useState<null | { asSet: number; best: number; bestLow: string }>(null);
    useEffect(() => {
        setFoldStep(0);
        if (foldedDeck === null || foldedDeck !== deckNo) return;
        const ids = Array.from({ length: 7 }, (_, i) => window.setTimeout(() => setFoldStep(i + 1), (i + 1) * FOLD_FLIP_MS));
        ids.push(window.setTimeout(() => setFoldStep(8), 7 * FOLD_FLIP_MS + FOLD_PILE_MS));
        return () => ids.forEach((id) => window.clearTimeout(id));
    }, [foldedDeck, deckNo]);
    // ── Game state (preserved) ────────────────────────────────────────────────
    const [stage, setStage] = useState<Stage>("betting");
    // the Envy notice stays up until its x is clicked or the player moves on from this hand
    useEffect(() => { if (stage === "betting") setEnvyShown(false); }, [stage]);
    const [message, setMessage] = useState("Set your wagers and press Deal.");

    const [mainBet, setMainBet] = useState(() => defaultBet("paigow", "main"));
    const [fortuneBet, setFortuneBet] = useState(() => defaultBet("paigow", "fortune"));
    const [aceHighBet, setAceHighBet] = useState(() => defaultBet("paigow", "aceHigh"));

    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [dealerCards, setDealerCards] = useState<Card[]>([]);
    const [selectedFrontIds, setSelectedFrontIds] = useState<string[]>([]);

    const [wagerAtDeal, setWagerAtDeal] = useState(0);

    // The table jackpot: a $5 light, and meters shared with the other linked tables
    const [jackpotOn, setJackpotOn] = useState(() => defaultToggle("paigow", "jackpot"));
    const [jackpotBet, setJackpotBet] = useState(0);
    const [meters, setMeters] = useState<Meters>(() => readJackpot());
    const metersRef = useRef(meters);
    useEffect(() => { metersRef.current = meters; writeJackpot(meters); }, [meters]);
    /** The must-hit amount won by this hand's $5, settled with the rest of the hand */
    const mustHitWon = useRef(0);
    const [jackpotWin, setJackpotWin] = useState<{ title: string; amount: number } | null>(null);
    const [otherWin, setOtherWin] = useState<OtherWin | null>(null);
    // other players at linked tables feed the meters and can win them, but only while this
    // table is on screen: a table held in the background does nothing
    const tableActive = useContext(TableContext)?.active ?? true;
    useEffect(() => {
        if (!tableActive) return;
        const rng = makeRng(Date.now());
        // the other tables played on while this one was away: catch up first, then keep pace
        const tick = () => {
            const next = advanceLinkedTables(metersRef.current, rng);
            if (next.meters !== metersRef.current) { metersRef.current = next.meters; setMeters(next.meters); }
            if (next.win) setOtherWin(next.win);
        };
        tick();
        const id = window.setInterval(tick, LINKED_TICK_MS);
        return () => window.clearInterval(id);
    }, [tableActive]);
    useEffect(() => { if (!otherWin) return; const id = window.setTimeout(() => setOtherWin(null), NOTICE_MS); return () => window.clearTimeout(id); }, [otherWin]);
    useEffect(() => { if (!jackpotWin) return; const id = window.setTimeout(() => setJackpotWin(null), NOTICE_MS); return () => window.clearTimeout(id); }, [jackpotWin]);
    const [resultLines, setResultLines] = useState<string[]>([]);
    const [net, setNet] = useState<number | null>(null);
    const [roundReturned, setRoundReturned] = useState(0);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [showRules, setShowRules] = useState(false);
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [selectedSpot, setSelectedSpot] = useState<BetSpotId>("main");
    const [mainChips, setMainChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("paigow", "main")));
    const [fortuneChips, setFortuneChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("paigow", "fortune")));
    const [aceHighChips, setAceHighChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("paigow", "aceHigh")));

    // Rebuild chip stacks whenever we return to betting (e.g. after Next Hand)
    useEffect(() => {
        if (stage === "betting") {
            setMainChips(buildChipStackFromAmount(mainBet));
            setFortuneChips(buildChipStackFromAmount(fortuneBet));
            setAceHighChips(buildChipStackFromAmount(aceHighBet));
            setSelectedSpot("main");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage]);

    // After a deal the dealer's cards turn over one at a time and are set into High / Low.
    // The player's cards stay face down until the player turns them (click a card, or Reveal).
    const [revealStep, setRevealStep] = useState(DEALER_SET);
    const [peeled, setPeeled] = useState<string[]>([]);
    const [playerSorted, setPlayerSorted] = useState(false);
    useLayoutEffect(() => {
        if (stage !== "setting") { setRevealStep(DEALER_SET); return; }
        setRevealStep(0);
        setPeeled([]);
        setPlayerSorted(false);
        const timers: number[] = [];
        let t = 350;
        for (let step = 1; step <= DEALER_SET; step++) {
            t += step === DEALER_SET ? 550 : 130;
            timers.push(window.setTimeout(() => setRevealStep(step), t));
        }
        return () => timers.forEach((id) => window.clearTimeout(id));
    }, [stage]);

    // Once every card is face up, give the last flip a moment and then sort the hand
    const allPeeled = playerCards.length === 7 && peeled.length === 7;
    useEffect(() => {
        if (stage !== "setting" || !allPeeled || playerSorted) return;
        const id = window.setTimeout(() => setPlayerSorted(true), 520);
        return () => window.clearTimeout(id);
    }, [stage, allPeeled, playerSorted]);
    const playerReady = stage === "showdown" || (stage === "setting" && playerSorted);

    const peelCard = (cardId: string) => {
        setPeeled((prev) => (prev.includes(cardId) ? prev : [...prev, cardId]));
    };
    const revealAll = () => {
        playerCards.filter((c) => !peeled.includes(c.id)).forEach((c, i) => {
            window.setTimeout(() => peelCard(c.id), i * 110);
        });
    };

    // ── Game useMemo (preserved) ──────────────────────────────────────────────
    const dealerBestSplit = useMemo(() => {
        if (dealerCards.length !== 7) return null;
        return evaluateDealerHouseWay(dealerCards);
    }, [dealerCards]);

    const bestPlayerSplitAgainstDealer = useMemo(() => {
        if (playerCards.length !== 7 || !dealerBestSplit) return null;
        return evaluateBestSplitAgainstDealer(playerCards, dealerBestSplit);
    }, [playerCards, dealerBestSplit]);

    const selectedFront = useMemo(() => {
        const set = new Set(selectedFrontIds);
        return playerCards.filter((c) => set.has(c.id));
    }, [playerCards, selectedFrontIds]);

    const selectedBack = useMemo(() => {
        const set = new Set(selectedFrontIds);
        return playerCards.filter((c) => !set.has(c.id));
    }, [playerCards, selectedFrontIds]);

    const currentFrontEval = useMemo(() => {
        if (selectedFront.length !== 2) return null;
        return evaluateFront(selectedFront);
    }, [selectedFront]);

    const currentBackEval = useMemo(() => {
        if (selectedBack.length !== 5) return null;
        return evaluateFive(selectedBack);
    }, [selectedBack]);

    const selectedIsLegal = useMemo(() => {
        if (!currentFrontEval || !currentBackEval) return false;
        return isLegalSplit(currentBackEval, currentFrontEval);
    }, [currentFrontEval, currentBackEval]);

    // The advice for this hand. The house way is recommended unless another split wins more
    // against this dealer's face-up hand; only then is that other split recommended.
    const advice = useMemo(() => {
        if (!bestPlayerSplitAgainstDealer || !dealerBestSplit || playerCards.length !== 7) return null;
        const best = bestPlayerSplitAgainstDealer.best;
        const house = evaluateDealerHouseWay(playerCards);
        const bestResult = resultAgainstDealer(best, dealerBestSplit);
        const houseIsBest = resultAgainstDealer(house, dealerBestSplit) >= bestResult;
        return { bestResult, house, houseKey: frontKey(house.front), houseIsBest, recommended: houseIsBest ? house : best };
    }, [bestPlayerSplitAgainstDealer, dealerBestSplit, playerCards]);

    // how the hand as you have set it does, against the best it could do
    const selectedResult = advice && dealerBestSplit && currentBackEval && currentFrontEval && selectedIsLegal
        ? resultAgainstDealer({ backEval: currentBackEval, frontEval: currentFrontEval }, dealerBestSplit)
        : null;
    const selectedIsHouseWay = !!advice && selectedFrontIds.length === 2 && [...selectedFrontIds].sort().join("|") === advice.houseKey;

    const fortunePreview = useMemo(() => {
        if (playerCards.length !== 7) return null;
        return evaluateFortune(playerCards);
    }, [playerCards]);

    const playerAceHighInfo = useMemo(() => {
        if (playerCards.length !== 7) return null;
        return getHighPaiGowInfo(playerCards);
    }, [playerCards]);

    const dealerAceHighInfo = useMemo(() => {
        if (dealerCards.length !== 7) return null;
        return getHighPaiGowInfo(dealerCards);
    }, [dealerCards]);

    // ── Game handlers (preserved) ─────────────────────────────────────────────
    // set when Ask Dealer for Help has just set the hand, so its message can be taken back
    // as soon as the player moves a card: from then on the hand is the player's own
    const dealerSetHand = useRef(false);

    function toggleFront(cardId: string) {
        if (stage !== "setting") return;
        if (dealerSetHand.current) {
            dealerSetHand.current = false;
            setMessage("Pick 2 cards for your low hand, or press Ask Dealer for Help.");
        }
        setSelectedFrontIds((prev) => {
            if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
            if (prev.length >= 2) return [prev[1], cardId];
            return [...prev, cardId];
        });
    }

    function autoSetBest() {
        if (!advice) return;
        sortRowNext.current = true;
        setSelectedFrontIds(advice.recommended.front.map((c) => c.id));
        dealerSetHand.current = true;
        setMessage(advice.houseIsBest
            ? "The dealer set your hand the house way."
            : "The dealer set your hand to beat theirs. Here that wins more than the house way.");
    }

    function dealHand() {
        const normalizedMain = clampBet(mainBet, MAIN_MIN);
        const normalizedFortune = Math.max(SIDE_MIN, clampBet(fortuneBet, SIDE_MIN));
        const normalizedAceHigh = Math.max(SIDE_MIN, clampBet(aceHighBet, SIDE_MIN));
        const jackpot = jackpotOn ? JACKPOT_BET : 0;
        const total = normalizedMain + normalizedFortune + normalizedAceHigh + jackpot;
        if (bankroll < total) { setMessage("Not enough bankroll for those wagers."); return; }
        setJackpotBet(jackpot);
        mustHitWon.current = 0;
        if (jackpot) {
            const bet = placeBet(metersRef.current, Math.random);
            setMeters(bet.meters);
            mustHitWon.current = bet.mustHitWon;
        }
        setDeckNo((n) => n + 1);
        const freshDeck = createDeck();
        // the number picks the dealer's stack; the seat picks yours
        const number = 1 + Math.floor(Math.random() * 7);
        const p = stackCards(freshDeck, stackFor(seat, number));
        const d = stackCards(freshDeck, stackFor("dealer", number));
        setDealNumber(number);
        seatAtDeal.current = seat;
        numberAtDeal.current = number;
        // Envy: every other seat is played; any of them with four of a kind or better pays you
        setEnvyHits(SEATS.filter((other) => other !== seat).flatMap((other) => {
            const cards = stackCards(freshDeck, stackFor(other, number));
            const category = evaluateFortune(cards).category;
            const amount = ENVY_PAYS[category];
            return amount ? [{ seat: other, category, amount, cards }] : [];
        }));
        setEnvyShown(false);
        setMainBet(normalizedMain);
        setFortuneBet(normalizedFortune);
        setAceHighBet(normalizedAceHigh);
        setWagerAtDeal(total);
        setBankroll((b) => b - total);
        setPlayerCards(p);
        setDealerCards(d);
        setSelectedFrontIds([]);
        setStage("setting");
        setResultLines([]);
        setNet(null);
        setRoundReturned(0);
        dealerSetHand.current = false;
        setMessage(getHighPaiGowInfo(d).aceHigh
            ? "Dealer has Ace-high pai gow. Main bet pushes. Turn over your cards."
            : "Dealer sets first. Their hand is live on the table. Pick 2 cards for your low hand, or press Ask Dealer for Help.");
    }

    function foldNow() {
        setFoldCheck(null);
        setFoldedDeck(deckNo);
        setHandAndResolve(true);
    }

    /** Fold, but first ask when the hand could still push or win. */
    function askToFold() {
        if (dealerAceHighInfo?.aceHigh) { setFoldCheck("acehigh"); return; }
        if (advice && advice.bestResult >= 2) { setFoldCheck("win"); return; }
        if (advice && advice.bestResult === 1) { setFoldCheck("push"); return; }
        foldNow();
    }

    /** Set the hand, but first ask when another split does better against the dealer. */
    function askToSet() {
        if (!dealerAceHighInfo?.aceHigh && advice && selectedResult !== null && selectedResult < advice.bestResult) {
            setSetCheck({ asSet: selectedResult, best: advice.bestResult, bestLow: advice.recommended.frontEval.label });
            return;
        }
        setHandAndResolve();
    }

    /** Settle the hand as set, or as folded: a fold gives up the main bet, and side bets settle as usual. */
    function setHandAndResolve(folded = false) {
        if (!bestPlayerSplitAgainstDealer || !dealerBestSplit) return;
        if (!folded && selectedFrontIds.length !== 2) { setMessage("Pick exactly 2 cards for the low hand."); return; }
        if (!folded && !selectedIsLegal) { setMessage("That hand is illegal."); return; }
        const dealerSplit = dealerBestSplit;
        const playerSplit = folded ? null : buildSplit(selectedFront, playerCards);
        // a folded hand is not compared: both count as the dealer's
        const backCmp = playerSplit ? compareFive(playerSplit.backEval, dealerSplit.backEval) : -1;
        const frontCmp = playerSplit ? compareFront(playerSplit.frontEval, dealerSplit.frontEval) : -1;
        let mainReturn = 0;
        const lines: string[] = [];
        const playerWinsBack = backCmp > 0; const dealerWinsBack = backCmp <= 0;
        const playerWinsFront = frontCmp > 0; const dealerWinsFront = frontCmp <= 0;
        if (folded) {
            lines.push("Folded. Main bet loses.");
        } else if (dealerAceHighInfo?.aceHigh) {
            mainReturn += mainBet;
            lines.push("Dealer has Ace-high pai gow. Main bet pushes.");
        } else if (playerWinsBack && playerWinsFront) {
            mainReturn += mainBet * 2;
            lines.push("Player wins both hands. Main bet wins 1 to 1.");
        } else if (dealerWinsBack && dealerWinsFront) {
            lines.push("Dealer wins both hands. Main bet loses.");
        } else {
            mainReturn += mainBet;
            lines.push("Push. One hand each.");
        }
        // for the yearly stats: what each bet brought back, measured as each block adds to the total
        recordBet("Main", mainBet, mainReturn, folded ? undefined : "Won both hands");
        // the main bet again, under the deal number the hand came from, for win % by number
        recordBet(`Deal number ${numberAtDeal.current}`, mainBet, mainReturn, "Won both hands");
        let mark = mainReturn;
        if (fortuneBet > 0 && fortunePreview) {
            if (fortunePreview.multiplier > 0) {
                const win = fortuneBet * fortunePreview.multiplier;
                mainReturn += fortuneBet + win;
                lines.push(`Fortune wins ${fortunePreview.multiplier} to 1 on ${fortunePreview.category}.`);
            } else if (fortunePreview.category === "Three Pair") {
                mainReturn += fortuneBet;
                lines.push("Fortune pushes on Three Pair.");
            } else {
                lines.push("Fortune loses.");
            }
            // Envy: paid on top of the Fortune bet, for each other seat that hit
            if (fortuneBet >= ENVY_MIN_FORTUNE && envyHits.length > 0) {
                for (const hit of envyHits) {
                    mainReturn += hit.amount;
                    lines.push(`Envy: Seat ${hit.seat} made ${hit.category}. You win ${formatMoney(hit.amount)}.`);
                }
                setEnvyShown(true);
            }
            recordBet("Fortune", fortuneBet, mainReturn - mark, fortunePreview.category);
            mark = mainReturn;
        }
        if (aceHighBet > 0 && dealerAceHighInfo && playerAceHighInfo) {
            if (dealerAceHighInfo.aceHigh && playerAceHighInfo.aceHigh) {
                mainReturn += aceHighBet + aceHighBet * ACE_HIGH_PAYTABLE.bothAceHigh;
                lines.push(`Ace High wins ${ACE_HIGH_PAYTABLE.bothAceHigh} to 1. Both player and dealer have ace-high pai gow.`);
            } else if (dealerAceHighInfo.aceHigh && dealerAceHighInfo.hasJoker) {
                mainReturn += aceHighBet + aceHighBet * ACE_HIGH_PAYTABLE.dealerAceHighWithJoker;
                lines.push(`Ace High wins ${ACE_HIGH_PAYTABLE.dealerAceHighWithJoker} to 1. Dealer has ace-high with joker.`);
            } else if (dealerAceHighInfo.aceHigh && !dealerAceHighInfo.hasJoker) {
                mainReturn += aceHighBet + aceHighBet * ACE_HIGH_PAYTABLE.dealerAceHighNoJoker;
                lines.push(`Ace High wins ${ACE_HIGH_PAYTABLE.dealerAceHighNoJoker} to 1. Dealer has ace-high without joker.`);
            } else {
                lines.push("Ace High loses.");
            }
            recordBet("Ace High", aceHighBet, mainReturn - mark, dealerAceHighInfo.aceHigh && playerAceHighInfo.aceHigh ? "Both ace high" : dealerAceHighInfo.hasJoker ? "Dealer ace high with joker" : "Dealer ace high");
            mark = mainReturn;
        }
        if (jackpotBet > 0 && fortunePreview) {
            const hand = fortunePreview.category;
            if (mustHitWon.current > 0) {
                mainReturn += mustHitWon.current;
                lines.push(`Must Hit by $500 jackpot wins ${formatMoney(mustHitWon.current)}!`);
                setJackpotWin({ title: "Must Hit by $500 Jackpot", amount: mustHitWon.current });
                mustHitWon.current = 0;
            }
            if (JACKPOT_TOP_HANDS.has(hand)) {
                const top = awardTopHand(metersRef.current, Math.random);
                setMeters(top.meters);
                mainReturn += top.amount;
                lines.push(`Jackpot: ${hand} wins the ${TIER_NAMES[top.tier]}, ${formatMoney(top.amount)}!`);
                setJackpotWin({ title: `${TIER_NAMES[top.tier]} Jackpot`, amount: top.amount });
            } else if (JACKPOT_FIXED[hand]) {
                mainReturn += JACKPOT_FIXED[hand];
                lines.push(`Jackpot: ${hand === "Royal Flush + Royal Match" ? "Royal Flush" : hand} pays ${formatMoney(JACKPOT_FIXED[hand])}.`);
            } else {
                lines.push("Jackpot: no win.");
            }
            recordBet("Table Jackpot", jackpotBet, mainReturn - mark, JACKPOT_TOP_HANDS.has(hand) ? hand : JACKPOT_FIXED[hand] ? (hand === "Royal Flush + Royal Match" ? "Royal Flush" : hand) : "Must Hit");
        }
        // and the whole hand under the seat it was played from
        recordBet(`Seat ${seatAtDeal.current}`, wagerAtDeal, mainReturn, "Won the hand");
        setBankroll((b) => b + mainReturn);
        setNet(mainReturn - wagerAtDeal);
        setRoundReturned(mainReturn);
        setResultLines(lines);
        setStage("showdown");
        setMessage("Showdown complete.");
    }

    // Dealer Ace-high pushes the main bet, so there is nothing for the player to decide. The player
    // still turns their own cards over. Once all seven are up, the hand is set for them and ends.
    const autoFinishing = stage === "setting" && !!dealerAceHighInfo?.aceHigh;
    useEffect(() => {
        if (!autoFinishing || revealStep < DEALER_SET || !playerSorted) return;
        let id: number;
        if (selectedFrontIds.length !== 2) {
            // set the way the dealer would: nothing rides on it, so it should simply look right
            id = window.setTimeout(() => { sortRowNext.current = true; setSelectedFrontIds(evaluateDealerHouseWay(playerCards).front.map((c) => c.id)); }, 600);
        } else {
            id = window.setTimeout(setHandAndResolve, 900);
        }
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFinishing, revealStep, playerSorted, selectedFrontIds]);

    function handleChangeBet() {
        setPlayerCards([]);
        setDealerCards([]);
        setSelectedFrontIds([]);
        setWagerAtDeal(0);
        setResultLines([]);
        setNet(null);
        setRoundReturned(0);
        setStage("betting");
        setMessage("Adjust your wagers and press Deal.");
    }

    function handleClearAndReset() {
        setMainBet(MAIN_MIN);
        setFortuneBet(0);
        setAceHighBet(0);
        setPlayerCards([]);
        setDealerCards([]);
        setSelectedFrontIds([]);
        setWagerAtDeal(0);
        setResultLines([]);
        setNet(null);
        setRoundReturned(0);
        setStage("betting");
        setMessage("Set your wagers and press Deal.");
    }

    // ── UI chip handlers ──────────────────────────────────────────────────────
    const canBet = stage === "betting";

    const addChip = (spot: BetSpotId, chip: ChipDenomination) => {
        if (!canBet) return;
        if (spot === "main") { setMainBet((b) => b + chip); setMainChips((s) => addChipToStack(s, chip)); }
        else if (spot === "fortune") { setFortuneBet((b) => b + chip); setFortuneChips((s) => addChipToStack(s, chip)); }
        else { setAceHighBet((b) => b + chip); setAceHighChips((s) => addChipToStack(s, chip)); }
    };

    const clearSpot = (spot: BetSpotId) => {
        if (!canBet) return;
        if (spot === "main") {
            setMainBet((b) => { const next = popLastChip(b, MAIN_MIN); setMainChips(buildChipStackFromAmount(next)); return next; });
        } else if (spot === "fortune") {
            setFortuneBet((b) => { const next = popLastChip(b, 0); setFortuneChips(buildChipStackFromAmount(next)); return next; });
        } else {
            setAceHighBet((b) => { const next = popLastChip(b, 0); setAceHighChips(buildChipStackFromAmount(next)); return next; });
        }
    };

    // Tray chip goes onto the highlighted spot
    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (canBet) addChip(selectedSpot, chip);
    };

    // Clicking a spot only highlights it
    const handleZoneClick = (spot: BetSpotId) => {
        if (!canBet) return;
        setSelectedSpot(spot);
    };

    const handleClear = () => {
        handleClearAndReset();
        setMainChips(buildChipStackFromAmount(MAIN_MIN));
        setFortuneChips([]);
        setAceHighChips([]);
        setSelectedSpot("main");
    };

    // Reset: back to the bets and the jackpot light saved in Settings
    const handleReset = () => {
        if (stage !== "betting") return;
        const main = defaultBet("paigow", "main");
        const fortune = defaultBet("paigow", "fortune");
        const aceHigh = defaultBet("paigow", "aceHigh");
        setMainBet(main); setMainChips(buildChipStackFromAmount(main));
        setFortuneBet(fortune); setFortuneChips(buildChipStackFromAmount(fortune));
        setAceHighBet(aceHigh); setAceHighChips(buildChipStackFromAmount(aceHigh));
        setJackpotOn(defaultToggle("paigow", "jackpot"));
        setSelectedSpot("main");
    };

    // ── Derived render values ─────────────────────────────────────────────────
    const dealerSetting = stage === "setting" && revealStep < DEALER_SET;
    const dealerIsSet = revealStep >= DEALER_SET && dealerBestSplit !== null;

    // Player stack: Low hand on top (nearer the dealer), the rest below
    // Every hand is shown by power: the cards that make the hand first, then the rest by rank
    const powerOrder = (cards: Card[], mode: SortMode = "auto") => sortByPower(
        cards.map((c) => ({ id: c.id, value: isJoker(c) ? 14 : valueOf(c), suit: c.suit, wild: isJoker(c) ? "semi" as const : undefined })),
        mode,
    );
    const modeFor = (category: string): SortMode =>
        category === "Flush" ? "flush"
        : category === "Straight" || category === "Straight Flush" || category === "Royal Flush" ? "straight"
        : "groups";
    const lowIds = playerReady ? powerOrder(playerCards.filter((c) => selectedFrontIds.includes(c.id)), "groups") : [];
    const dealerHighIds = dealerBestSplit ? powerOrder(dealerBestSplit.back, modeFor(dealerBestSplit.backEval.category)) : [];
    const dealerLowIds = dealerBestSplit ? powerOrder(dealerBestSplit.front, "groups") : [];
    // the player's remaining cards: as a set five-card hand once two are picked, otherwise all of them together
    const playerRest = playerCards.filter((c) => !lowIds.includes(c.id));
    const sortedRest = () => playerRest.length === 5 && currentBackEval ? powerOrder(playerRest, modeFor(currentBackEval.category)) : powerOrder(playerRest);
    // The row is sorted when the cards are first turned over. After that, lifting a card into the
    // Low hand leaves the others where they are: they only re-sort when a card comes back down,
    // when the dealer sets the hand for you, and at the showdown.
    const [rowOrder, setRowOrder] = useState<string[] | null>(null);
    const lastFrontIds = useRef<string[]>([]);
    const sortRowNext = useRef(false);
    useEffect(() => {
        const cameBack = lastFrontIds.current.some((id) => !selectedFrontIds.includes(id));
        lastFrontIds.current = selectedFrontIds;
        if (!playerReady) { setRowOrder(null); return; }
        const resort = cameBack || sortRowNext.current || stage === "showdown";
        sortRowNext.current = false;
        setRowOrder((cur) => (cur === null || resort ? sortedRest() : cur.filter((id) => playerRest.some((c) => c.id === id))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFrontIds, playerReady, stage]);
    const keptOrder = (rowOrder ?? []).filter((id) => playerRest.some((c) => c.id === id));
    const playerRestOrder = !playerReady ? playerRest.map((c) => c.id)
        : rowOrder !== null && keptOrder.length === playerRest.length ? keptOrder
        : sortedRest();
    const playerRowCards = playerRestOrder.map((id) => playerRest.find((c) => c.id === id)!);
    const playerHasStartedSetting = selectedFrontIds.length > 0;
    // Number keys: each card is numbered by its place in the sorted seven, and keeps that
    // number for the whole hand however the cards are moved afterwards.
    const keyNumbers = playerReady ? powerOrder(playerCards) : [];

    const displayMessage =
        stage !== "setting" ? message
        : dealerSetting ? "Dealer is setting their hand..."
        : !playerReady || autoFinishing
            ? (dealerAceHighInfo?.aceHigh
                ? (playerReady ? "Dealer has Ace-high pai gow. Main bet pushes." : "Dealer has Ace-high pai gow. Main bet pushes. Turn over your cards.")
                : "Tap your cards to turn them over, or press Reveal Cards.")
        // no split can beat the dealer: say so, and suggest the fold (setting it costs the same)
        : advice && advice.bestResult === 0 && !dealerAceHighInfo?.aceHigh
            ? "No way to set this hand to beat the dealer. Fold, or set it anyway."
        : message;

    const displayWager = stage === "betting"
        ? mainBet + (fortuneBet > 0 ? fortuneBet : 0) + (aceHighBet > 0 ? aceHighBet : 0) + (jackpotOn ? JACKPOT_BET : 0)
        : wagerAtDeal;
    const canRebet = mainBet >= MAIN_MIN && bankroll >= (mainBet + fortuneBet + aceHighBet + (jackpotOn ? JACKPOT_BET : 0));
    // the jackpot line this hand qualifies for, lit in the table once the cards are up
    const jackpotHand = (stage === "showdown" || playerReady) && jackpotBet > 0 && fortunePreview ? fortunePreview.category : null;

    const mainWon = stage === "showdown" && resultLines.some((l) => l.includes("wins both hands"));
    const fortuneWon = stage === "showdown" && fortuneBet > 0 && fortunePreview !== null && fortunePreview.multiplier > 0;
    const aceHighWon = stage === "showdown" && aceHighBet > 0 && !!(dealerAceHighInfo?.aceHigh);

    const fortuneHighlight =
        playerReady && fortunePreview && fortunePreview.category !== "No Fortune"
            ? fortunePreview.category
            : null;

    const aceHighHighlight: string | null =
        stage === "showdown" && aceHighBet > 0
            ? dealerAceHighInfo?.aceHigh && playerAceHighInfo?.aceHigh
                ? "Both Ace High"
                : dealerAceHighInfo?.aceHigh && dealerAceHighInfo?.hasJoker
                    ? "Dealer Ace High + Joker"
                    : dealerAceHighInfo?.aceHigh
                        ? "Dealer Ace High, No Joker"
                        : null
            : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            {jackpotWin && (
            <div className="pointer-events-none fixed left-1/2 top-[30%] z-40 -translate-x-1/2 rounded-[4px] border-2 border-amber-300 bg-black/85 px-8 py-5 text-center" role="status" data-testid="jackpot-win">
                <div className="text-sm font-extrabold uppercase tracking-wide text-amber-200">{jackpotWin.title}</div>
                <div className="mt-1 text-3xl font-extrabold tabular-nums text-amber-100">{formatMoney(jackpotWin.amount)}</div>
            </div>
        )}
        <RulesModal open={showRules} onClose={() => setShowRules(false)} />
        {foldCheck && (
            <ConfirmDialog
                testId="fold-check"
                title="Are you sure you want to fold?"
                body={foldCheck === "win" ? "Your hand can still win. Set it right and the main bet wins 1 to 1."
                    : foldCheck === "push" ? "Your hand can still push. Set it right and you get your main bet back."
                    : "The dealer has ace-high pai gow, so your main bet pushes. Folding loses it."}
                keepLabel="Keep Playing"
                goLabel="Fold Anyway"
                onKeep={() => setFoldCheck(null)}
                onGo={foldNow}
            />
        )}
        {setCheck && (
            <ConfirmDialog
                testId="set-check"
                title="Are you sure you want to set this hand?"
                body={`Set like this, your main bet ${OUTCOME_WORDS[setCheck.asSet]}. Set it with Low ${setCheck.bestLow} and it ${OUTCOME_WORDS[setCheck.best]}.`}
                keepLabel="Change My Hand"
                goLabel="Set Anyway"
                onKeep={() => setSetCheck(null)}
                onGo={() => { setSetCheck(null); setHandAndResolve(); }}
            />
        )}
            {/* Envy: who hit, what they made, their seven cards, and what it paid you. It floats, so
                nothing on the table moves. It stays until its x is clicked or the player moves on. */}
            <AnimatePresence>
                {envyShown && envyHits.length > 0 && (
                    <motion.div
                        key="envy"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="pointer-events-none fixed inset-x-0 top-[72px] z-40 flex justify-center px-4"
                        data-testid="envy-notice"
                    >
                        <div className="pointer-events-auto flex max-h-[calc(100dvh-88px)] max-w-[560px] flex-col gap-2 overflow-y-auto rounded-[4px] border-2 border-emerald-400/70 bg-room-panel px-4 py-3 text-left shadow-2xl">
                            <span className="flex items-start justify-between gap-3">
                                <span className="py-2 text-[15px] font-extrabold text-emerald-300">
                                    Envy Bonus! You win {formatMoney(envyHits.reduce((t, h) => t + h.amount, 0))}
                                </span>
                                {/* the label must not start with "Close": that would hold the table's keys */}
                                <button
                                    onClick={() => setEnvyShown(false)}
                                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border border-room-line text-xl font-bold text-room-text transition-colors hover:bg-white/10"
                                    aria-label="Dismiss the Envy notice"
                                >
                                    ×
                                </button>
                            </span>
                            {envyHits.map((hit) => (
                                <span key={hit.seat} className="flex flex-col gap-1">
                                    <span className="text-sm text-room-text">
                                        Seat {hit.seat} made <span className="font-bold">{hit.category}</span>: +{formatMoney(hit.amount)}
                                    </span>
                                    <span className="flex gap-1">
                                        {powerOrder(hit.cards, ENVY_SORT[hit.category] ?? "groups").map((id) => hit.cards.find((c) => c.id === id)!).map((card) => (
                                            <PlayingCard key={card.id} card={toShared(card, true)} className="h-[56px] w-[40px] rounded-[6px]" />
                                        ))}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <TableShell deckNo={deckNo}
                feltColor="#1a5c2e"
                gameName="Pai Gow Poker"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <PaiGowBar
                        stage={stage}
                        selectedChip={selectedChip}
                        selectedIsLegal={selectedIsLegal}
                        selectedFrontIds={selectedFrontIds}
                        canRebet={canRebet}
                        dealerSetting={revealStep < DEALER_SET}
                        playerReady={playerReady}
                        autoFinishing={autoFinishing}
                        onRevealAll={revealAll}
                        onChipSelect={handleChipSelect}
                        onDeal={dealHand}
                        onAutoSetBest={autoSetBest}
                        onSetHand={askToSet}
                        onFold={askToFold}
                        onClear={handleClear}
                        onReset={handleReset}
                        onChangeBet={handleChangeBet}
                    />
                }
            >
                {/* Two parts side by side on desktop: the title over the betting and the cards, and
                    the pay tables on the right, which start level with the title. */}
                <div className="flex flex-1 flex-col lg:flex-row lg:overflow-hidden lg:pr-6">
                <div className="flex min-w-0 flex-1 flex-col">
                {/* the right column is 324px with its gap and edge, so the same room on the left keeps the title centered on the page */}
                <div className="lg:pl-[324px]">
                    <TableLabel onRules={() => setShowRules(true)} />
                    <DealLine seat={seat} onSeat={chooseSeat} number={dealNumber} />
                </div>

                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:pl-6">

                    {/* ── LEFT: betting ──────────────────────────────────── */}
                    <div className={`order-2 flex w-full flex-col items-center justify-center gap-4 px-4 py-2 lg:order-1 lg:justify-start lg:w-64 lg:shrink-0 lg:px-0`}>

                        <BetBar
                            compact
                            pendingBet={displayWager}
                            returned={roundReturned}
                            net={net ?? 0}
                            showResult={stage === "showdown"}
                        />

                        {/* Side bet circles, with the $5 jackpot light set above and between them, as on
                            a real felt. The light floats, so it adds no height. */}
                        <div className="relative flex items-end gap-12">
                            <button
                                onClick={() => canBet && setJackpotOn((on) => !on)}
                                disabled={!canBet}
                                aria-pressed={jackpotOn}
                                aria-label={`Table jackpot, ${formatMoney(JACKPOT_BET)}`}
                                title="Table jackpot"
                                data-hotkey="J"
                                data-jackpot-light
                                data-lit={jackpotOn ? "true" : "false"}
                                className={`absolute left-1/2 top-0 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border-2 transition-colors ${jackpotOn ? "border-white" : "border-white/45 hover:border-white"} ${canBet ? "cursor-pointer" : "cursor-default"}`}
                                style={{ background: jackpotOn ? "#ef2a2a" : "#3a0f0f" }}
                            >
                                <span className={`text-[10px] font-extrabold ${jackpotOn ? "text-white" : "text-white/75"}`}>${JACKPOT_BET}</span>
                            </button>
                            <BetSpot
                                testId="aceHigh"
                                chips={aceHighChips} totalBet={aceHighBet}
                                label="Ace High" sublabel="optional"
                                dim={82}
                                isSelected={selectedSpot === "aceHigh"}
                                isWinner={aceHighWon}
                                canBet={canBet}
                                onSelect={() => handleZoneClick("aceHigh")}
                                onRemove={() => clearSpot("aceHigh")}
                            />
                            <BetSpot
                                testId="fortune"
                                chips={fortuneChips} totalBet={fortuneBet}
                                label="Fortune" sublabel="optional"
                                dim={82}
                                isSelected={selectedSpot === "fortune"}
                                isWinner={fortuneWon}
                                canBet={canBet}
                                onSelect={() => handleZoneClick("fortune")}
                                onRemove={() => clearSpot("fortune")}
                            />
                        </div>

                        {/* Main bet circle */}
                        <BetSpot
                            testId="main"
                            chips={mainChips} totalBet={mainBet}
                            label="Main" sublabel={`min $${MAIN_MIN}`}
                            dim={110}
                            isSelected={selectedSpot === "main"}
                            isWinner={mainWon}
                            canBet={canBet}
                            onSelect={() => handleZoneClick("main")}
                            onRemove={() => clearSpot("main")}
                        />

                        {/* The Fortune preview and the result lines share this reserved space, so the
                            circles above do not move when they appear. */}
                        <div className="flex min-h-[72px] w-full flex-col items-center gap-1">
                        {/* Fortune preview during setting */}
                        {stage === "setting" && playerReady && fortunePreview && fortunePreview.category !== "No Fortune" && (
                            <p className="text-center text-[11px] font-semibold text-amber-300">
                                Fortune: {fortunePreview.category}
                            </p>
                        )}

                        {/* Result lines during showdown */}
                        {stage === "showdown" && resultLines.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className="flex flex-col items-center gap-1 text-center"
                            >
                                {resultLines.map((line, i) => (
                                    <p
                                        key={i}
                                        className={`text-[11px] leading-snug ${i === 0 ? "font-bold " : ""}${resultLineClass(line)}`}
                                    >
                                        {line}
                                    </p>
                                ))}
                            </motion.div>
                        )}
                        </div>
                    </div>

                    {/* ── CENTER: cards ───────────────────────────────────── */}
                    {/* On narrow screens the bets sit under this column, so it keeps the height of a dealt hand
                        from the start: dealing the cards then pushes nothing down. */}
                    <div data-pg-center className={`order-1 flex min-h-[460px] w-full flex-col items-center gap-3 px-2 py-2 sm:min-h-[500px] lg:order-2 lg:min-h-0 lg:flex-1 lg:gap-2`}>

                        {/* Message: first in the column, so the cards being dealt and the notes under them never move it */}
                        <p className="text-center text-sm font-semibold text-amber-50" data-testid="message">{displayMessage}</p>

                        {/* Dealer: High hand in a row, Low hand pushed out in front toward the player */}
                        {dealerCards.length > 0 && (
                            <div className="flex w-full flex-col items-center gap-2">
                                <span className="text-[13px] font-bold text-white/75">Dealer</span>
                                <div
                                    className={`relative w-full max-w-[440px] ${STACK_VARS}`}
                                    style={{ height: `calc(var(--ch) * ${1 + DEALER_ROW_STEP})` }}
                                    data-testid="dealer-cards"
                                >
                                    {dealerCards.map((card, i) => {
                                        const lowCol = dealerIsSet ? dealerLowIds.indexOf(card.id) : -1;
                                        const highCol = dealerIsSet ? dealerHighIds.indexOf(card.id) : -1;
                                        const style = lowCol >= 0 ? slotStyle(1, lowCol, 2, DEALER_ROW_STEP, 20 + lowCol)
                                            : highCol >= 0 ? slotStyle(0, highCol, 5, DEALER_ROW_STEP, 10 + highCol)
                                            : slotStyle(0, i, 7, DEALER_ROW_STEP, 10 + i);
                                        return (
                                            <div key={`${deckNo}-${card.id}`} style={style} data-hand={lowCol >= 0 ? "low" : highCol >= 0 ? "high" : "spread"}>
                                                <motion.div variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.04)}>
                                                    <PlayingCard card={toShared(card, dealerIsSet || i < revealStep)} className={CARD_SM} />
                                                </motion.div>
                                            </div>
                                        );
                                    })}
                                    {/* Dealer has ace-high pai gow: a white marker chip beside the low hand, as a dealer
                                        would set out, shown before you turn your own cards (so you can sweat yours) */}
                                    <AnimatePresence>
                                        {dealerIsSet && dealerAceHighInfo?.aceHigh && (
                                            <motion.div
                                                key="ace-high-chip"
                                                initial={{ opacity: 0, scale: 0.6 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.25, ease: "easeOut" }}
                                                className="pointer-events-none absolute z-30 flex h-[42px] w-[42px] flex-col items-center justify-center rounded-full bg-white text-center text-[10px] font-extrabold leading-[11px] text-slate-900"
                                                style={{
                                                    // in the clear pocket below the high hand and left of the low hand
                                                    left: "calc(50% - var(--cw) - 32px)",
                                                    top: `calc(var(--ch) * ${(1 + DEALER_ROW_STEP) / 2 + 0.5})`,
                                                    translate: "-50% -50%",
                                                    border: "3px solid #cbd5e1",
                                                    boxShadow: "inset 0 0 0 3px #ffffff, inset 0 0 0 4px #94a3b8, 0 4px 10px rgba(0,0,0,0.45)",
                                                }}
                                                data-testid="ace-high-chip"
                                            >
                                                <span>ACE</span>
                                                <span>HIGH</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="flex min-h-[16px] flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px]">
                                    {dealerIsSet && dealerBestSplit && (
                                        <>
                                            <span>
                                                <span className="font-bold text-white/75">High </span>
                                                <span className="font-semibold text-amber-100">{dealerBestSplit.backEval.label}</span>
                                            </span>
                                            <span className="text-white/75">·</span>
                                            <span>
                                                <span className="font-bold text-white/75">Low </span>
                                                <span className="font-semibold text-amber-100">{dealerBestSplit.frontEval.label}</span>
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Divider */}
                        {dealerCards.length > 0 && playerCards.length > 0 && (
                            <div className="h-px w-full max-w-md bg-white/8 shrink-0" />
                        )}

                        {/* Player: Low hand on top (nearer the dealer), the other cards below */}
                        {playerCards.length > 0 && (() => {
                            // a fold turns the cards over left to right, the Low pair last, then piles them
                            const folding = foldedDeck === deckNo && stage === "showdown";
                            const foldOrder = [...playerRowCards.map((c) => c.id), ...lowIds];
                            return (
                            <div className="flex w-full flex-col items-center gap-2">
                                <div
                                    className={`relative w-full max-w-[440px] ${STACK_VARS}`}
                                    style={{ height: `calc(var(--ch) * ${1 + PLAYER_ROW_STEP})` }}
                                    data-testid="player-cards"
                                >
                                    {/* Empty Low spots */}
                                    {[0, 1].map((col) => (
                                        <div
                                            key={`low-slot-${col}`}
                                            style={{ ...slotStyle(0, col, 2, PLAYER_ROW_STEP, 1), width: "var(--cw)", height: "var(--ch)" }}
                                            className={`flex items-start justify-center rounded-[9px] border border-dashed border-white/20 bg-black/15 pt-1.5 transition-opacity duration-300 sm:rounded-[11px] ${folding ? "opacity-0" : ""}`}
                                        >
                                            <span className="text-[13px] font-bold text-white/75">Low</span>
                                        </div>
                                    ))}

                                    {playerCards.map((card, i) => {
                                        const k = foldOrder.indexOf(card.id);
                                        const turnedOver = folding && k >= 0 && k < foldStep;
                                        const isPeeled = (peeled.includes(card.id) || stage === "showdown") && !turnedOver;
                                        const lowCol = lowIds.indexOf(card.id);
                                        const rowCol = playerRowCards.findIndex((c) => c.id === card.id);
                                        const style = folding && foldStep >= 8 && k >= 0
                                            ? pileStyle(k, PLAYER_ROW_STEP)
                                            : lowCol >= 0
                                            ? slotStyle(0, lowCol, 2, PLAYER_ROW_STEP, 10 + lowCol)
                                            : slotStyle(1, rowCol, playerRowCards.length, PLAYER_ROW_STEP, 20 + rowCol);
                                        const canClick = stage === "setting" && !dealerSetting && (!isPeeled || (playerReady && !autoFinishing));
                                        return (
                                            <div key={`${deckNo}-${card.id}`} style={style} data-hand={lowCol >= 0 ? "low" : "high"}>
                                                <motion.button
                                                    data-key-card
                                                    data-key-reveal={isPeeled ? "up" : "down"}
                                                    data-key-number={keyNumbers.indexOf(card.id) + 1 || undefined}
                                                    onClick={() => (isPeeled ? toggleFront(card.id) : peelCard(card.id))}
                                                    disabled={!canClick}
                                                    aria-label={isPeeled ? (lowCol >= 0 ? "Move back to high hand" : "Move to low hand") : "Turn card over"}
                                                    variants={CARD_VARIANTS}
                                                    initial="initial"
                                                    animate="animate"
                                                    transition={CARD_TRANSITION(i * 0.04)}
                                                    whileTap={canClick ? { scale: 0.97 } : undefined}
                                                    className={`block rounded-[9px] transition-[translate] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:rounded-[11px] ${canClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"} ${
                                                        lowCol >= 0 && stage === "setting" ? "ring-2 ring-amber-400/80" : ""
                                                    }`}
                                                >
                                                    <PlayingCard card={toShared(card, isPeeled)} className={CARD_SM} />
                                                </motion.button>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Hand names: High then Low, the same order as the dealer */}
                                <div className="flex min-h-[16px] flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px]">
                                    {folding ? (
                                        <span className="font-bold text-white/75">Folded</span>
                                    ) : playerReady && (
                                        <>
                                            <span>
                                                <span className="font-bold text-white/75">High </span>
                                                <span className="font-semibold text-amber-100">{currentBackEval?.label ?? "-"}</span>
                                            </span>
                                            <span className="text-white/75">·</span>
                                            <span>
                                                <span className="font-bold text-white/75">Low </span>
                                                <span className="font-semibold text-amber-100">{currentFrontEval?.label ?? "pick 2 cards"}</span>
                                            </span>
                                        </>
                                    )}
                                </div>
                                <span className="text-[13px] font-bold text-white/75">Player</span>

                                {/* Illegal split warning */}
                                {playerHasStartedSetting && selectedFrontIds.length === 2 && !selectedIsLegal && (
                                    <p className="text-[11px] font-bold text-red-400">Illegal - high hand must beat low hand</p>
                                )}

                                {/* Advice on the hand as set: the house way unless a different split wins more here */}
                                {stage === "setting" && selectedFrontIds.length === 2 && selectedIsLegal && advice && selectedResult !== null && (() => {
                                    const isBest = selectedResult === advice.bestResult;
                                    const lowOf = (split: SplitEval) => `Low ${split.frontEval.label}`;
                                    const [label, tone, hint] =
                                        advice.bestResult === 0 && !dealerAceHighInfo?.aceHigh ? ["No way to win", "font-bold text-red-300", "Suggest: Fold"]
                                        : isBest && selectedIsHouseWay ? ["Best play · House way", "font-bold text-emerald-300", ""]
                                        : isBest && advice.houseIsBest ? ["Best play", "font-bold text-emerald-300", `House way: ${lowOf(advice.house)}`]
                                        : isBest ? ["Best play · Beats the house way here", "font-bold text-emerald-300", ""]
                                        : selectedIsHouseWay ? ["House way", "font-bold text-amber-300", `Better here: ${lowOf(advice.recommended)}`]
                                        : ["Could do better", "text-white/75", `${advice.houseIsBest ? "House way" : "Better here"}: ${lowOf(advice.recommended)}`];
                                    return (
                                        <div className="flex flex-wrap items-center justify-center gap-x-2 text-[11px]" data-testid="set-advice" data-advice={label}>
                                            <span className="font-bold text-emerald-400">Legal split</span>
                                            <span className="text-white/75">·</span>
                                            <span className={tone}>{label}</span>
                                            {hint && <><span className="text-white/75">·</span><span className="text-white/85">{hint}</span></>}
                                        </div>
                                    );
                                })()}
                            </div>
                            );
                        })()}

                    </div>
                </div>
                </div>

                    {/* ── RIGHT: the table jackpot, then the payout tables ─── */}
                    <div className="hidden w-72 shrink-0 flex-col justify-start pt-2 lg:ml-3 lg:flex">
                        {/* The table jackpot: its meters and what it pays, styled like the other pay
                            tables but boxed in red */}
                        <div className="mb-2 rounded-[4px] border border-red-500/70 px-2 pb-1" data-testid="table-jackpot">
                            <div className="flex flex-col gap-1 pt-1.5">
                                {/* the heading; when another player wins, it says so here for a moment, in the same space */}
                                <div className={`h-[18px] truncate text-center font-extrabold leading-[18px] ${otherWin ? "text-[11px] text-red-200" : "text-[13px] text-amber-200"}`} data-testid="other-win">
                                    {otherWin ? `Another player won the ${TIER_NAMES[otherWin.tier]}: ${formatMoney(otherWin.amount)}` : "Table Jackpot ($5)"}
                                </div>
                                {/* the three meters, side by side */}
                                <div className="grid grid-cols-3 gap-1 text-center">
                                    {(["ultra", "major", "mustHit"] as const).map((tier) => (
                                        <div key={tier} className="flex flex-col leading-tight">
                                            <span className="text-[10px] font-bold text-white/80">{tier === "mustHit" ? `Must Hit ${formatMoney(MUST_HIT_BY).replace(".00", "")}` : TIER_NAMES[tier]}</span>
                                            <span className="text-[12px] font-bold tabular-nums text-red-400" data-meter={tier}>{formatMoney(meters[tier])}</span>
                                        </div>
                                    ))}
                                </div>
                                {/* what it pays: the top hands across the box, the fixed amounts two to a row */}
                                <div className="grid grid-cols-2 gap-x-2 border-t border-red-500/30 pt-1">
                                    {JACKPOT_ROWS.map(([label, pays, hands], i) => {
                                        const isHit = !!jackpotHand && hands.includes(jackpotHand);
                                        return (
                                            <div key={label} className={`flex items-center justify-between gap-1.5 rounded px-1 text-[11px] ${i === 0 ? "col-span-2" : ""} ${isHit ? "bg-amber-300/12" : ""}`} data-hit={isHit ? "true" : undefined}>
                                                <span className={isHit ? "text-amber-100 [text-shadow:0_0_0.6px_currentColor,0_0_0.6px_currentColor]" : "text-white/75"}>{label}</span>
                                                <span className="shrink-0 font-bold text-gold">{pays}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <PayoutColumn
                            title="Fortune Bonus"
                            entries={sidebetRows()}
                            highlight={fortuneHighlight}
                            envy={ENVY_PAYS}
                            envyHit={stage === "showdown" ? new Set(envyHits.map((h) => h.category)) : undefined}
                        />
                        <div className="mt-1.5">
                            <PayoutColumn
                                title="Ace High Side Bet"
                                entries={ACE_HIGH_ROWS}
                                highlight={aceHighHighlight}
                            />
                        </div>
                    </div>

                </div>
            </TableShell>
        </>
    );
}
