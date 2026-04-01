import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Suit = "♠" | "♥" | "♦" | "♣" | "🃏";
type Rank =
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "10"
    | "J"
    | "Q"
    | "K"
    | "A"
    | "JOKER";

type Card = {
    rank: Rank;
    suit: Suit;
    id: string;
};

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
    | "High Card"
    | "Pair"
    | "Two Pair"
    | "Trips"
    | "Straight"
    | "Flush"
    | "Full House"
    | "Quads"
    | "Straight Flush"
    | "Royal Flush"
    | "Five Aces";
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
    | "Natural 7 Card S/F"
    | "Royal Flush + R/M"
    | "Wild 7 Card S/F"
    | "5 Aces"
    | "Royal Flush"
    | "Straight Flush"
    | "4 of a Kind"
    | "Full House"
    | "Flush"
    | "3 of a Kind"
    | "Straight"
    | "Three Pair"
    | "No Fortune";

type FortuneResult = {
    category: FortuneCategory;
    multiplier: number;
};

const SUITS: Exclude<Suit, "🃏">[] = ["♠", "♥", "♦", "♣"];
const RANKS: Exclude<Rank, "JOKER">[] = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
];

const VALUE: Record<Exclude<Rank, "JOKER">, number> = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
};

const MAIN_MIN = 5;
const SIDE_MIN = 0;
const CARD_BACK_URL =
    "https://png.pngtree.com/png-clipart/20240206/original/pngtree-single-playing-cards-back-on-a-white-background-with-shadow-and-png-image_14247732.png";

const FORTUNE_PAYTABLE_1: Record<Exclude<FortuneCategory, "No Fortune">, number> = {
    "Natural 7 Card S/F": 5000,
    "Royal Flush + R/M": 1000,
    "Wild 7 Card S/F": 750,
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

const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);

function isJoker(card: Card) {
    return card.rank === "JOKER";
}

function clampBet(n: number, min: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.floor(n / 5) * 5);
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
            out.push({
                rank,
                suit,
                id: `${rank}${suit}`,
            });
        }
    }

    out.push({
        rank: "JOKER",
        suit: "🃏",
        id: "JOKER",
    });

    return shuffle(out);
}

function draw(deck: Card[], count: number): [Card[], Card[]] {
    return [deck.slice(0, count), deck.slice(count)];
}

function valueOf(card: Card) {
    if (card.rank === "JOKER") return 15;
    return VALUE[card.rank];
}

function combinations<T>(arr: T[], k: number): T[][] {
    const out: T[][] = [];
    const path: T[] = [];

    function dfs(start: number) {
        if (path.length === k) {
            out.push([...path]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            path.push(arr[i]);
            dfs(i + 1);
            path.pop();
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
    for (const v of values) {
        map.set(v, (map.get(v) || 0) + 1);
    }
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
        return {
            category: "Five Aces",
            score: [10, 14],
            label: "Five Aces",
            usedJoker: false,
        };
    }

    if (flush && straightScore === 100) {
        return {
            category: "Royal Flush",
            score: [9, 100],
            label: "Royal Flush",
            usedJoker: false,
        };
    }

    if (flush && straightScore !== null) {
        return {
            category: "Straight Flush",
            score: [8, straightScore],
            label: straightScore === 99 ? "Wheel Straight Flush" : "Straight Flush",
            usedJoker: false,
        };
    }

    if (counts[0][1] === 4) {
        const quad = counts[0][0];
        const kicker = counts[1][0];
        return {
            category: "Quads",
            score: [7, quad, kicker],
            label: `Four ${labelValue(quad)}s`,
            usedJoker: false,
        };
    }

    if (counts[0][1] === 3 && counts[1][1] === 2) {
        return {
            category: "Full House",
            score: [6, counts[0][0], counts[1][0]],
            label: `${labelValue(counts[0][0])}s Full of ${labelValue(counts[1][0])}s`,
            usedJoker: false,
        };
    }

    if (flush) {
        return {
            category: "Flush",
            score: [5, ...values],
            label: `${labelValue(values[0])}-High Flush`,
            usedJoker: false,
        };
    }

    if (straightScore !== null) {
        return {
            category: "Straight",
            score: [4, straightScore],
            label: straightScore === 99 ? "Wheel Straight" : `${labelValue(straightScore)}-High Straight`,
            usedJoker: false,
        };
    }

    if (counts[0][1] === 3) {
        const kickers = counts
            .slice(1)
            .map(([v]) => v)
            .sort((a, b) => b - a);
        return {
            category: "Trips",
            score: [3, counts[0][0], ...kickers],
            label: `Three ${labelValue(counts[0][0])}s`,
            usedJoker: false,
        };
    }

    if (counts[0][1] === 2 && counts[1][1] === 2) {
        const highPair = Math.max(counts[0][0], counts[1][0]);
        const lowPair = Math.min(counts[0][0], counts[1][0]);
        const kicker = counts[2][0];
        return {
            category: "Two Pair",
            score: [2, highPair, lowPair, kicker],
            label: `${labelValue(highPair)}s and ${labelValue(lowPair)}s`,
            usedJoker: false,
        };
    }

    if (counts[0][1] === 2) {
        const kickers = counts
            .slice(1)
            .map(([v]) => v)
            .sort((a, b) => b - a);
        return {
            category: "Pair",
            score: [1, counts[0][0], ...kickers],
            label: `Pair of ${labelValue(counts[0][0])}s`,
            usedJoker: false,
        };
    }

    return {
        category: "High Card",
        score: [0, ...values],
        label: `${labelValue(values[0])} High`,
        usedJoker: false,
    };
}

function compareVectors(a: number[], b: number[]) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const av = a[i] ?? -1;
        const bv = b[i] ?? -1;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

function compareFive(a: FiveEval, b: FiveEval) {
    return compareVectors(a.score, b.score);
}

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
            const replacement: Card = {
                rank,
                suit,
                id: `REP-${rank}${suit}`,
            };

            const replaced = [...nonJoker, replacement];
            const natural = evaluateNaturalFive(replaced);
            const replacementIsAce = rank === "A";
            const allowedAsWild =
                natural.category === "Straight" ||
                natural.category === "Flush" ||
                natural.category === "Straight Flush" ||
                natural.category === "Royal Flush";
            const valid = replacementIsAce || allowedAsWild || natural.category === "Five Aces";

            if (!valid) continue;

            const candidate: FiveEval = {
                ...natural,
                usedJoker: true,
            };

            if (!best || compareFive(candidate, best) > 0) {
                best = candidate;
            }
        }
    }

    if (!best) {
        const fallback = evaluateNaturalFive([
            ...nonJoker,
            { rank: "A", suit: "♠", id: "REP-A♠" },
        ]);
        return {
            ...fallback,
            usedJoker: true,
        };
    }

    return best;
}

function evaluateFront(cards: Card[]): FrontEval {
    const values = cards
        .map((c) => (isJoker(c) ? 14 : valueOf(c)))
        .sort((a, b) => b - a);

    if (values[0] === values[1]) {
        return {
            category: "Pair",
            score: [1, values[0]],
            label: `Pair of ${labelValue(values[0])}s`,
        };
    }

    return {
        category: "High Card",
        score: [0, values[0], values[1]],
        label: `${labelValue(values[0])}-${labelValue(values[1])}`,
    };
}

function compareFront(a: FrontEval, b: FrontEval) {
    return compareVectors(a.score, b.score);
}

function isLegalSplit(back: FiveEval, front: FrontEval) {
    if (
        back.category === "Trips" ||
        back.category === "Straight" ||
        back.category === "Flush" ||
        back.category === "Full House" ||
        back.category === "Quads" ||
        back.category === "Straight Flush" ||
        back.category === "Royal Flush" ||
        back.category === "Five Aces" ||
        back.category === "Two Pair"
    ) {
        return true;
    }

    if (back.category === "Pair") {
        if (front.category === "High Card") return true;
        return (back.score[1] ?? 0) > (front.score[1] ?? 0);
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

    return {
        front,
        back,
        frontEval,
        backEval,
        scoreVector: [...backEval.score, ...frontEval.score],
    };
}

function getBackHouseWayTier(backEval: FiveEval) {
    switch (backEval.category) {
        case "Five Aces":
        case "Royal Flush":
        case "Straight Flush":
        case "Quads":
            return 4;
        case "Full House":
            return 3;
        case "Flush":
        case "Straight":
        case "Trips":
            return 2;
        case "Two Pair":
        case "Pair":
        case "High Card":
        default:
            return 1;
    }
}

function sortCardsByValueDesc(cards: Card[]) {
    return [...cards].sort((a, b) => valueOf(b) - valueOf(a));
}

function groupNonJokerCardsByValue(cards: Card[]) {
    const map = new Map<number, Card[]>();

    for (const card of cards) {
        if (isJoker(card)) continue;
        const v = valueOf(card);
        if (!map.has(v)) map.set(v, []);
        map.get(v)!.push(card);
    }

    return [...map.entries()]
        .map(([value, group]) => ({
            value,
            cards: sortCardsByValueDesc(group),
            count: group.length,
        }))
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return b.value - a.value;
        });
}

function trySpecificDealerFront(front: Card[], allCards: Card[]) {
    const split = buildSplit(front, allCards);
    return isLegalSplit(split.backEval, split.frontEval) ? split : null;
}

function chooseBestLegalSplitForNoPair(cards: Card[]) {
    const fronts = combinations(cards, 2);
    let best: SplitEval | null = null;
    let bestScore: number[] | null = null;

    for (const front of fronts) {
        const split = buildSplit(front, cards);
        if (!isLegalSplit(split.backEval, split.frontEval)) continue;

        const score = [
            split.frontEval.category === "Pair" ? 1 : 0,
            ...split.frontEval.score,
            getBackHouseWayTier(split.backEval),
            ...split.backEval.score,
        ];

        if (!best || !bestScore || compareVectors(score, bestScore) > 0) {
            best = split;
            bestScore = score;
        }
    }

    if (best) return best;
    return buildSplit(cards.slice(0, 2), cards);
}

function evaluateDealerHouseWay(cards: Card[]): SplitEval {
    const jokerCount = cards.filter(isJoker).length;
    if (jokerCount > 0) {
        const frontCombos = combinations(cards, 2);
        let best: SplitEval | null = null;
        let bestScore: number[] | null = null;

        for (const front of frontCombos) {
            const split = buildSplit(front, cards);
            if (!isLegalSplit(split.backEval, split.frontEval)) continue;

            const score = [
                split.frontEval.category === "Pair" ? 1 : 0,
                ...split.frontEval.score,
                getBackHouseWayTier(split.backEval),
                ...split.backEval.score,
            ];

            if (!best || !bestScore || compareVectors(score, bestScore) > 0) {
                best = split;
                bestScore = score;
            }
        }

        return best ?? buildSplit(cards.slice(0, 2), cards);
    }

    const groups = groupNonJokerCardsByValue(cards);
    const pairs = groups.filter((g) => g.count === 2);
    const trips = groups.filter((g) => g.count === 3);
    const quads = groups.filter((g) => g.count === 4);

    if (quads.length === 0 && trips.length === 0 && pairs.length === 0) {
        return chooseBestLegalSplitForNoPair(cards);
    }

    if (quads.length === 0 && trips.length === 0 && pairs.length === 1) {
        const pairCards = pairs[0].cards;
        const sideCards = sortCardsByValueDesc(
            cards.filter((c) => !pairCards.some((pc) => pc.id === c.id))
        );
        const front = sideCards.slice(0, 2);
        const split = trySpecificDealerFront(front, cards);
        if (split) return split;
    }

    if (quads.length === 0 && trips.length === 0 && pairs.length === 2) {
        const sortedPairs = [...pairs].sort((a, b) => b.value - a.value);
        const highPair = sortedPairs[0].cards;
        const lowPair = sortedPairs[1].cards;

        const splitLowPairFront = trySpecificDealerFront(lowPair, cards);
        if (splitLowPairFront) return splitLowPairFront;

        const sideCards = sortCardsByValueDesc(
            cards.filter(
                (c) => !highPair.some((pc) => pc.id === c.id) && !lowPair.some((pc) => pc.id === c.id)
            )
        );
        const highCardFront = trySpecificDealerFront(sideCards.slice(0, 2), cards);
        if (highCardFront) return highCardFront;
    }

    if (quads.length === 0 && trips.length === 0 && pairs.length === 3) {
        const sortedPairs = [...pairs].sort((a, b) => b.value - a.value);
        const lowestPair = sortedPairs[2].cards;
        const split = trySpecificDealerFront(lowestPair, cards);
        if (split) return split;
    }

    if (quads.length === 0 && trips.length === 1 && pairs.length === 0) {
        const tripCards = trips[0].cards;
        const sideCards = sortCardsByValueDesc(
            cards.filter((c) => !tripCards.some((tc) => tc.id === c.id))
        );
        const front = sideCards.slice(0, 2);
        const split = trySpecificDealerFront(front, cards);
        if (split) return split;
    }

    if (quads.length === 0 && trips.length === 1 && pairs.length === 1) {
        const pairCards = pairs[0].cards;
        const splitPairFront = trySpecificDealerFront(pairCards, cards);
        if (splitPairFront) return splitPairFront;

        const tripCards = trips[0].cards;
        const sideCards = sortCardsByValueDesc(
            cards.filter(
                (c) => !tripCards.some((tc) => tc.id === c.id) && !pairCards.some((pc) => pc.id === c.id)
            )
        );
        const highCardFront = trySpecificDealerFront(sideCards.slice(0, 2), cards);
        if (highCardFront) return highCardFront;
    }

    const frontCombos = combinations(cards, 2);
    let best: SplitEval | null = null;
    let bestScore: number[] | null = null;

    for (const front of frontCombos) {
        const split = buildSplit(front, cards);
        if (!isLegalSplit(split.backEval, split.frontEval)) continue;

        const score = [
            split.frontEval.category === "Pair" ? 1 : 0,
            ...split.frontEval.score,
            getBackHouseWayTier(split.backEval),
            ...split.backEval.score,
        ];

        if (!best || !bestScore || compareVectors(score, bestScore) > 0) {
            best = split;
            bestScore = score;
        }
    }

    if (!best) {
        return buildSplit(cards.slice(0, 2), cards);
    }

    return best;
}

function evaluateBestSplit(cards: Card[]): { best: SplitEval; allBestFrontKeySet: Set<string> } {
    const frontCombos = combinations(cards, 2);
    let best: SplitEval | null = null;
    const bestKeys = new Set<string>();

    for (const front of frontCombos) {
        const split = buildSplit(front, cards);

        if (!isLegalSplit(split.backEval, split.frontEval)) continue;

        if (!best) {
            best = split;
            bestKeys.add([...front].map((c) => c.id).sort().join("|"));
            continue;
        }

        const cmp = compareVectors(split.scoreVector, best.scoreVector);
        if (cmp > 0) {
            best = split;
            bestKeys.clear();
            bestKeys.add([...front].map((c) => c.id).sort().join("|"));
        } else if (cmp === 0) {
            bestKeys.add([...front].map((c) => c.id).sort().join("|"));
        }
    }

    if (!best) {
        const fallbackFront = cards.slice(0, 2);
        const fallback = buildSplit(fallbackFront, cards);
        best = fallback;
        bestKeys.add([...fallbackFront].map((c) => c.id).sort().join("|"));
    }

    return { best, allBestFrontKeySet: bestKeys };
}

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
        else outcomeTier = 0;

        const outcomeScore = [
            outcomeTier,
            backCmp > 0 ? 1 : 0,
            frontCmp > 0 ? 1 : 0,
            ...split.backEval.score,
            ...split.frontEval.score,
        ];

        if (!best || !bestOutcomeScore) {
            best = split;
            bestOutcomeScore = outcomeScore;
            bestKeys.add([...front].map((c) => c.id).sort().join("|"));
            continue;
        }

        const cmp = compareVectors(outcomeScore, bestOutcomeScore);
        if (cmp > 0) {
            best = split;
            bestOutcomeScore = outcomeScore;
            bestKeys.clear();
            bestKeys.add([...front].map((c) => c.id).sort().join("|"));
        } else if (cmp === 0) {
            bestKeys.add([...front].map((c) => c.id).sort().join("|"));
        }
    }

    if (!best) {
        return evaluateBestSplit(playerCards);
    }

    return { best, allBestFrontKeySet: bestKeys };
}

function getHighPaiGowInfo(cards: Card[]) {
    const bestFive = combinations(cards, 5)
        .map((combo) => evaluateFive(combo))
        .sort((a, b) => compareFive(b, a))[0];

    const hasJoker = cards.some(isJoker);
    const aceHigh = bestFive.category === "High Card" && (bestFive.score[1] ?? 0) === 14;

    return {
        aceHigh,
        hasJoker,
        bestFive,
    };
}

function isNaturalSevenCardStraightFlush(cards: Card[]) {
    if (cards.some(isJoker)) return false;
    const suits = new Set(cards.map((c) => c.suit));
    if (suits.size !== 1) return false;

    const values = cards.map((c) => valueOf(c));
    const uniq = [...new Set(values)].sort((a, b) => a - b);
    if (uniq.length !== 7) return false;

    const wheel = [1, 2, 3, 4, 5, 6, 14];
    const lowMapped = uniq.includes(14) ? [...uniq.filter((v) => v !== 14), 14] : uniq;

    let consecutive = true;
    for (let i = 1; i < uniq.length; i++) {
        if (uniq[i] !== uniq[i - 1] + 1) {
            consecutive = false;
            break;
        }
    }

    const isA234567 =
        JSON.stringify([...uniq].sort((a, b) => a - b)) === JSON.stringify([2, 3, 4, 5, 6, 7, 14]);

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
    const values = cards
        .filter((c) => !isJoker(c))
        .map((c) => valueOf(c));
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
        const leftVals = leftovers.map((c) => (isJoker(c) ? 14 : valueOf(c)));
        if (leftVals[0] === leftVals[1]) return true;
    }
    return false;
}

function evaluateFortune(cards: Card[]): FortuneResult {
    if (isNaturalSevenCardStraightFlush(cards)) {
        return { category: "Natural 7 Card S/F", multiplier: FORTUNE_PAYTABLE_1["Natural 7 Card S/F"] };
    }

    if (hasRoyalPlusRM(cards)) {
        return { category: "Royal Flush + R/M", multiplier: FORTUNE_PAYTABLE_1["Royal Flush + R/M"] };
    }

    if (isWildSevenCardStraightFlush(cards)) {
        return { category: "Wild 7 Card S/F", multiplier: FORTUNE_PAYTABLE_1["Wild 7 Card S/F"] };
    }

    const bestFive = combinations(cards, 5)
        .map((combo) => evaluateFive(combo))
        .sort((a, b) => compareFive(b, a))[0];

    if (bestFive.category === "Five Aces") {
        return { category: "5 Aces", multiplier: FORTUNE_PAYTABLE_1["5 Aces"] };
    }

    if (bestFive.category === "Royal Flush") {
        return { category: "Royal Flush", multiplier: FORTUNE_PAYTABLE_1["Royal Flush"] };
    }

    if (bestFive.category === "Straight Flush") {
        return { category: "Straight Flush", multiplier: FORTUNE_PAYTABLE_1["Straight Flush"] };
    }

    if (bestFive.category === "Quads") {
        return { category: "4 of a Kind", multiplier: FORTUNE_PAYTABLE_1["4 of a Kind"] };
    }

    if (bestFive.category === "Full House") {
        return { category: "Full House", multiplier: FORTUNE_PAYTABLE_1["Full House"] };
    }

    if (bestFive.category === "Flush") {
        return { category: "Flush", multiplier: FORTUNE_PAYTABLE_1["Flush"] };
    }

    if (bestFive.category === "Trips") {
        return { category: "3 of a Kind", multiplier: FORTUNE_PAYTABLE_1["3 of a Kind"] };
    }

    if (bestFive.category === "Straight") {
        return { category: "Straight", multiplier: FORTUNE_PAYTABLE_1["Straight"] };
    }

    if (countSevenCardPairs(cards) === 3) {
        return { category: "Three Pair", multiplier: FORTUNE_PAYTABLE_1["Three Pair"] };
    }

    return { category: "No Fortune", multiplier: -1 };
}

function getCardTextColor(card?: Card) {
    if (!card) return "text-slate-400";
    if (card.suit === "♥" || card.suit === "♦") return "text-red-600";
    if (card.suit === "🃏") return "text-violet-700";
    return "text-slate-900";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-full border border-amber-300/30 bg-black/35 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.22em] text-amber-100 shadow sm:px-3 sm:text-[10px] sm:tracking-[0.24em]">
            {children}
        </div>
    );
}

function StatPill({
    label,
    value,
    accent = "default",
}: {
    label: string;
    value: React.ReactNode;
    accent?: "default" | "gold" | "green";
}) {
    const accentClasses =
        accent === "gold"
            ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
            : accent === "green"
                ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-50"
                : "border-white/10 bg-white/5 text-white";

    return (
        <div className={`rounded-2xl border px-3 py-2.5 shadow-lg sm:px-4 sm:py-3 ${accentClasses}`}>
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-80 sm:text-[10px] sm:tracking-[0.22em]">
                {label}
            </div>
            <div className="mt-1 text-sm font-extrabold sm:text-lg">{value}</div>
        </div>
    );
}

function CardFront({
    card,
    large = false,
    selected = false,
    clickable = false,
    locked = false,
}: {
    card?: Card;
    large?: boolean;
    selected?: boolean;
    clickable?: boolean;
    locked?: boolean;
}) {
    const textColor = getCardTextColor(card);
    const sizeClasses = large
        ? "h-[76px] w-[54px] rounded-[11px] sm:h-[90px] sm:w-[62px] sm:rounded-[13px] lg:h-[102px] lg:w-[70px]"
        : "h-[68px] w-[48px] rounded-[10px] sm:h-[78px] sm:w-[54px] sm:rounded-[11px]";
    const borderGlow = selected
        ? "border-amber-300 shadow-[0_0_0_2px_rgba(252,211,77,0.45),0_18px_30px_rgba(0,0,0,0.35)]"
        : "border-slate-300/90 shadow-[0_10px_24px_rgba(0,0,0,0.28)]";
    const cursor = clickable && !locked ? "cursor-pointer hover:-translate-y-1" : "";

    return (
        <div
            className={`relative flex items-center justify-center border bg-[linear-gradient(180deg,_#ffffff,_#f4f4f5)] font-bold transition ${sizeClasses} ${borderGlow} ${cursor}`}
        >
            {!card ? (
                <div className="text-xl text-slate-400">?</div>
            ) : card.rank === "JOKER" ? (
                <>
                    <div className={`absolute left-[6px] top-[5px] text-[11px] font-extrabold ${textColor}`}>JKR</div>
                    <div className={`text-2xl ${textColor}`}>🃏</div>
                    <div className={`absolute bottom-[5px] right-[6px] rotate-180 text-[11px] font-extrabold ${textColor}`}>JKR</div>
                </>
            ) : (
                <>
                    <div className={`absolute left-[5px] top-[5px] text-left leading-[0.9] ${textColor}`}>
                        <div className="text-[12px] font-extrabold sm:text-[14px]">{card.rank}</div>
                        <div className="mt-[1px] text-[10px] sm:text-[12px]">{card.suit}</div>
                    </div>

                    <div className={`${textColor} text-[20px] sm:text-[24px] lg:text-[28px]`}>{card.suit}</div>

                    <div className={`absolute bottom-[5px] right-[5px] rotate-180 text-left leading-[0.9] ${textColor}`}>
                        <div className="text-[12px] font-extrabold sm:text-[14px]">{card.rank}</div>
                        <div className="mt-[1px] text-[10px] sm:text-[12px]">{card.suit}</div>
                    </div>
                </>
            )}
        </div>
    );
}

function CardBack({ large = false }: { large?: boolean }) {
    const sizeClasses = large
        ? "h-[76px] w-[54px] rounded-[11px] sm:h-[90px] sm:w-[62px] sm:rounded-[13px] lg:h-[102px] lg:w-[70px]"
        : "h-[68px] w-[48px] rounded-[10px] sm:h-[78px] sm:w-[54px] sm:rounded-[11px]";

    return (
        <div className={`relative overflow-hidden border border-white/15 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${sizeClasses}`}>
            <img
                src={CARD_BACK_URL}
                alt="Card back"
                className="absolute left-1/2 top-1/2 h-[150%] w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover"
                draggable={false}
            />
        </div>
    );
}

function CardFace({
    card,
    hidden = false,
    large = false,
    selected = false,
    clickable = false,
    locked = false,
}: {
    card?: Card;
    hidden?: boolean;
    large?: boolean;
    selected?: boolean;
    clickable?: boolean;
    locked?: boolean;
}) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="[perspective:1000px]"
        >
            <motion.div
                animate={{ rotateY: hidden ? 0 : 180 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                style={{ transformStyle: "preserve-3d" }}
                className="relative"
            >
                <div
                    className="absolute inset-0"
                    style={{
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                    }}
                >
                    <CardBack large={large} />
                </div>

                <div
                    style={{
                        transform: "rotateY(180deg)",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                    }}
                >
                    <CardFront
                        card={card}
                        large={large}
                        selected={selected}
                        clickable={clickable}
                        locked={locked}
                    />
                </div>
            </motion.div>
        </motion.div>
    );
}

function BetInput({
    label,
    value,
    onChange,
    min,
    disabled,
}: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    min: number;
    disabled?: boolean;
}) {
    return (
        <div className="rounded-2xl border border-amber-300/15 bg-black/20 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/85 sm:text-[11px] sm:tracking-[0.2em]">
                {label}
            </div>
            <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-white/70">$</span>
                <input
                    type="number"
                    min={min}
                    step={5}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(Number(e.target.value || 0))}
                    className="w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-8 pr-3 text-base font-bold text-white outline-none disabled:opacity-60 sm:text-lg"
                />
            </div>
        </div>
    );
}

function ActionButton({
    children,
    onClick,
    disabled,
    variant = "default",
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    variant?: "default" | "bet" | "danger" | "success";
}) {
    const base =
        "min-w-[132px] rounded-2xl border px-4 py-3 text-sm font-extrabold shadow-xl transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[110px] sm:px-5";
    const styles =
        variant === "bet"
            ? "border-amber-200/80 bg-[linear-gradient(180deg,_#fcd34d,_#f59e0b)] text-slate-950 hover:brightness-105"
            : variant === "success"
                ? "border-emerald-200/80 bg-[linear-gradient(180deg,_#4ade80,_#16a34a)] text-slate-950 hover:brightness-105"
                : variant === "danger"
                    ? "border-red-300/70 bg-[linear-gradient(180deg,_#ef4444,_#b91c1c)] text-white hover:brightness-105"
                    : "border-slate-500/80 bg-[linear-gradient(180deg,_#475569,_#334155)] text-white hover:brightness-110";

    return (
        <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
            {children}
        </button>
    );
}

function DealButton({
    onClick,
    disabled,
}: {
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            whileHover={{ scale: disabled ? 1 : 1.03 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            className="w-full max-w-[280px] rounded-full border border-amber-200/80 bg-[linear-gradient(180deg,_#fde68a,_#f59e0b)] px-8 py-4 text-base font-extrabold tracking-wide text-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.38)] transition disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:px-12 sm:text-lg"
        >
            Deal
        </motion.button>
    );
}

function TableCard({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.03))] p-3 shadow-2xl backdrop-blur sm:rounded-[1.35rem] sm:p-4">
            <div className="mb-3 text-center text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200 sm:text-[12px] sm:tracking-[0.22em]">
                {title}
            </div>
            {children}
        </div>
    );
}

function sidebetRows() {
    return [
        ["Natural 7 Card S/F", 5000],
        ["Royal Flush + R/M", 1000],
        ["Wild 7 Card S/F", 750],
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

export default function PaiGowPoker({ bankroll, setBankroll }: Props) {
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Set your wagers and press Deal.");

    const [mainBet, setMainBet] = useState(25);
    const [fortuneBet, setFortuneBet] = useState(5);
    const [aceHighBet, setAceHighBet] = useState(5);

    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [dealerCards, setDealerCards] = useState<Card[]>([]);
    const [selectedFrontIds, setSelectedFrontIds] = useState<string[]>([]);

    const [wagerAtDeal, setWagerAtDeal] = useState(0);
    const [resultLines, setResultLines] = useState<string[]>([]);
    const [net, setNet] = useState<number | null>(null);

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

    const selectedIsExactBest = useMemo(() => {
        if (!bestPlayerSplitAgainstDealer || selectedFrontIds.length !== 2) return false;
        const key = [...selectedFrontIds].sort().join("|");
        return bestPlayerSplitAgainstDealer.allBestFrontKeySet.has(key);
    }, [bestPlayerSplitAgainstDealer, selectedFrontIds]);

    // const selectedOutcome = useMemo(() => {
    //     if (!dealerBestSplit || !currentFrontEval || !currentBackEval || !selectedIsLegal) {
    //         return null;
    //     }

    //     const backCmp = compareFive(currentBackEval, dealerBestSplit.backEval);
    //     const frontCmp = compareFront(currentFrontEval, dealerBestSplit.frontEval);

    //     const playerWinsBack = backCmp > 0;
    //     const playerWinsFront = frontCmp > 0;
    //     const dealerWinsBack = backCmp <= 0;
    //     const dealerWinsFront = frontCmp <= 0;

    //     if (playerWinsBack && playerWinsFront) return "win-both";
    //     if (dealerWinsBack && dealerWinsFront) return "lose-both";
    //     return "push";
    // }, [dealerBestSplit, currentFrontEval, currentBackEval, selectedIsLegal]);

    const selectedMatchesBestOutcome = useMemo(() => {
        if (!bestPlayerSplitAgainstDealer || !dealerBestSplit || !currentFrontEval || !currentBackEval || !selectedIsLegal) {
            return false;
        }

        const bestBackCmp = compareFive(bestPlayerSplitAgainstDealer.best.backEval, dealerBestSplit.backEval);
        const bestFrontCmp = compareFront(bestPlayerSplitAgainstDealer.best.frontEval, dealerBestSplit.frontEval);

        const selectedBackCmp = compareFive(currentBackEval, dealerBestSplit.backEval);
        const selectedFrontCmp = compareFront(currentFrontEval, dealerBestSplit.frontEval);

        const getOutcomeTier = (backCmp: number, frontCmp: number) => {
            const wins = (backCmp > 0 ? 1 : 0) + (frontCmp > 0 ? 1 : 0);
            const losses = (backCmp <= 0 ? 1 : 0) + (frontCmp <= 0 ? 1 : 0);

            if (wins === 2) return 2;
            if (wins === 1 && losses === 1) return 1;
            return 0;
        };

        return getOutcomeTier(selectedBackCmp, selectedFrontCmp) === getOutcomeTier(bestBackCmp, bestFrontCmp);
    }, [
        bestPlayerSplitAgainstDealer,
        dealerBestSplit,
        currentFrontEval,
        currentBackEval,
        selectedIsLegal,
    ]);

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

    function toggleFront(cardId: string) {
        if (stage !== "setting") return;

        setSelectedFrontIds((prev) => {
            if (prev.includes(cardId)) {
                return prev.filter((id) => id !== cardId);
            }

            if (prev.length >= 2) {
                return [prev[1], cardId];
            }

            return [...prev, cardId];
        });
    }

    function autoSetBest() {
        if (!bestPlayerSplitAgainstDealer) return;
        setSelectedFrontIds(bestPlayerSplitAgainstDealer.best.front.map((c) => c.id));
        setMessage("Best high/low hand set against dealer selected.");
    }

    function dealHand() {
        const normalizedMain = clampBet(mainBet, MAIN_MIN);
        const normalizedFortune = Math.max(SIDE_MIN, clampBet(fortuneBet, SIDE_MIN));
        const normalizedAceHigh = Math.max(SIDE_MIN, clampBet(aceHighBet, SIDE_MIN));

        const total = normalizedMain + normalizedFortune + normalizedAceHigh;
        if (bankroll < total) {
            setMessage("Not enough bankroll for those wagers.");
            return;
        }

        const freshDeck = createDeck();
        let next = freshDeck;
        let p: Card[];
        let d: Card[];
        [p, next] = draw(next, 7);
        [d, next] = draw(next, 7);

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
        setMessage("Dealer sets first. Their hand is live on the table. Pick 2 cards for your low hand, or press Auto Set Best.");
    }

    function setHandAndResolve() {
        if (!bestPlayerSplitAgainstDealer || !dealerBestSplit) return;
        if (selectedFrontIds.length !== 2) {
            setMessage("Pick exactly 2 cards for the low hand.");
            return;
        }
        if (!selectedIsLegal) {
            setMessage("That hand is illegal.");
            return;
        }

        const playerSplit = buildSplit(selectedFront, playerCards);
        const dealerSplit = dealerBestSplit;

        const backCmp = compareFive(playerSplit.backEval, dealerSplit.backEval);
        const frontCmp = compareFront(playerSplit.frontEval, dealerSplit.frontEval);

        let mainReturn = 0;
        const lines: string[] = [];

        const playerWinsBack = backCmp > 0;
        const dealerWinsBack = backCmp <= 0;
        const playerWinsFront = frontCmp > 0;
        const dealerWinsFront = frontCmp <= 0;

        if (playerWinsBack && playerWinsFront) {
            mainReturn += mainBet * 2;
            lines.push("Player wins both hands. Main bet wins 1 to 1.");
        } else if (dealerWinsBack && dealerWinsFront) {
            lines.push("Dealer wins both hands. Main bet loses.");
        } else {
            mainReturn += mainBet;
            lines.push("Push. One hand each.");
        }

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
        }

        setBankroll((b) => b + mainReturn);
        setNet(mainReturn - wagerAtDeal);
        setResultLines(lines);
        setStage("showdown");
        setMessage("Showdown complete.");
    }

    function nextHand() {
        setPlayerCards([]);
        setDealerCards([]);
        setSelectedFrontIds([]);
        setWagerAtDeal(0);
        setResultLines([]);
        setNet(null);
        setStage("betting");
        setMessage("Set your wagers and press Deal.");
    }

    const selectedSet = new Set(selectedFrontIds);
    const showDealerSet = stage === "setting" || stage === "showdown";
    const playerHasStartedSetting = selectedFrontIds.length > 0;

    return (
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_#1f7a45,_#0e4d2d_30%,_#062417_65%,_#020d08_100%)] text-white">
            <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1700px] flex-col gap-3 px-2 py-2 sm:px-3 sm:py-3">
                <div className="rounded-[1.35rem] border border-amber-300/15 bg-black/25 p-3 shadow-2xl backdrop-blur sm:rounded-[1.7rem] sm:p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-200/90 sm:text-[12px] sm:tracking-[0.3em]">
                                Casino Table
                            </div>
                            <h2 className="mt-1 text-2xl font-extrabold tracking-[0.02em] text-amber-50 sm:text-4xl md:text-5xl">
                                Pai Gow Poker
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                            <StatPill label="Bankroll" value={fmt(bankroll)} accent="gold" />
                            <StatPill label="Stage" value={<span className="capitalize">{stage}</span>} />
                            <StatPill label="Main Bet" value={fmt(mainBet)} />
                            <StatPill label="On Table" value={fmt(mainBet + fortuneBet + aceHighBet)} accent="green" />
                            <StatPill
                                label="Hand Net"
                                value={net === null ? "—" : fmt(net)}
                                accent={net === null ? "gold" : net > 0 ? "green" : "default"}
                            />
                        </div>
                    </div>
                </div>

                <div className="rounded-[1.45rem] border border-white/10 bg-black/20 p-2.5 shadow-2xl backdrop-blur sm:rounded-[1.8rem] sm:p-3">
                    <div className="rounded-[1.2rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(0,0,0,0.22),_rgba(0,0,0,0.12))] px-4 py-3 text-center shadow-lg sm:rounded-[1.45rem] sm:px-5 sm:py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200 sm:text-[11px] sm:tracking-[0.24em]">
                            Table Message
                        </div>
                        <div className="mt-2 text-base font-bold text-amber-50 sm:text-lg md:text-xl">{message}</div>
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
                        <div className="order-3 space-y-3 xl:order-1">
                            <TableCard title="Fortune Pay Table">
                                <div className="overflow-hidden rounded-xl border border-white/10">
                                    {sidebetRows().map(([hand, pays], idx) => {
                                        const hit = fortunePreview?.category === hand;
                                        return (
                                            <div
                                                key={hand}
                                                className={`grid grid-cols-[1fr_auto] gap-2 px-2.5 py-2 text-[10px] leading-tight sm:px-3 sm:text-[11px] ${hit
                                                    ? "border-y border-amber-300/40 bg-amber-300/18"
                                                    : idx % 2 === 0
                                                        ? "bg-white/5"
                                                        : "bg-black/20"
                                                    }`}
                                            >
                                                <span className={`${hit ? "font-extrabold text-amber-50" : "text-emerald-50/90"}`}>{hand}</span>
                                                <span className="whitespace-nowrap font-semibold text-amber-100">
                                                    {typeof pays === "number" ? `${pays} to 1` : pays}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </TableCard>

                            <TableCard title="Ace High Side Bet">
                                <div className="space-y-2 text-sm text-emerald-50/90">
                                    <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                                        <span>Dealer ace high, no joker</span>
                                        <span className="font-extrabold text-amber-100">5 to 1</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2">
                                        <span>Dealer ace high, with joker</span>
                                        <span className="font-extrabold text-amber-100">15 to 1</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                                        <span>Both ace high</span>
                                        <span className="font-extrabold text-amber-100">40 to 1</span>
                                    </div>
                                </div>
                            </TableCard>
                        </div>

                        <div className="order-1 min-w-0 rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(74,222,128,0.16),_rgba(10,90,60,0.10)_40%,_rgba(0,0,0,0.22)_82%)] p-2.5 sm:rounded-[1.6rem] sm:p-4 xl:order-2">
                            <div className="flex flex-col gap-5">
                                <div className="flex flex-col items-center gap-3">
                                    <SectionLabel>Dealer 7 Cards</SectionLabel>
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {dealerCards.map((card) => (
                                            <CardFace key={card.id} card={card} hidden={stage === "betting"} large />
                                        ))}
                                    </div>

                                    {showDealerSet && dealerBestSplit && (
                                        <div className="grid w-full gap-3 md:grid-cols-2">
                                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
                                                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Dealer High</div>
                                                <div className="mt-2 flex flex-wrap justify-center gap-2">
                                                    {dealerBestSplit.back.map((card) => (
                                                        <CardFace key={`db-${card.id}`} card={card} large />
                                                    ))}
                                                </div>
                                                <div className="mt-2 text-sm font-bold text-amber-50">{dealerBestSplit.backEval.label}</div>
                                            </div>
                                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
                                                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Dealer Low</div>
                                                <div className="mt-2 flex flex-wrap justify-center gap-2">
                                                    {dealerBestSplit.front.map((card) => (
                                                        <CardFace key={`df-${card.id}`} card={card} large />
                                                    ))}
                                                </div>
                                                <div className="mt-2 text-sm font-bold text-amber-50">{dealerBestSplit.frontEval.label}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col items-center gap-3">
                                    <SectionLabel>Player 7 Cards</SectionLabel>
                                    <div className="flex flex-wrap justify-center gap-2">
                                        <AnimatePresence initial={false}>
                                            {playerCards.map((card) => (
                                                <motion.button
                                                    key={card.id}
                                                    onClick={() => toggleFront(card.id)}
                                                    className="shrink-0"
                                                    whileHover={stage === "setting" ? { y: -3 } : undefined}
                                                    whileTap={stage === "setting" ? { scale: 0.98 } : undefined}
                                                >
                                                    <CardFace
                                                        card={card}
                                                        hidden={false}
                                                        large
                                                        selected={selectedSet.has(card.id)}
                                                        clickable={stage === "setting"}
                                                        locked={stage !== "setting"}
                                                    />
                                                </motion.button>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
                                        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Player High (5)</div>

                                        {!playerHasStartedSetting ? (
                                            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-sm font-semibold text-white/60">
                                                Not set yet
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mt-2 flex flex-wrap justify-center gap-2">
                                                    {selectedBack.map((card) => (
                                                        <CardFace key={`pb-${card.id}`} card={card} large />
                                                    ))}
                                                </div>
                                                <div className="mt-2 text-sm font-bold text-amber-50">
                                                    {currentBackEval?.label ?? "Select cards"}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
                                        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Player Low (2)</div>

                                        {!playerHasStartedSetting ? (
                                            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-sm font-semibold text-white/60">
                                                Pick 2 cards for your low hand or press Auto Set Best
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mt-2 flex flex-wrap justify-center gap-2">
                                                    {selectedFront.map((card) => (
                                                        <CardFace key={`pf-${card.id}`} card={card} large />
                                                    ))}
                                                </div>
                                                <div className="mt-2 text-sm font-bold text-amber-50">
                                                    {currentFrontEval?.label ?? "Select 2 cards"}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {stage !== "betting" && (
                                    <div className="grid gap-2 md:grid-cols-3">
                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                                            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Outcome Check</div>
                                            <div
                                                className={`mt-2 text-sm font-bold ${!playerHasStartedSetting
                                                    ? "text-white/60"
                                                    : selectedIsExactBest
                                                        ? "text-emerald-300"
                                                        : selectedIsLegal && selectedMatchesBestOutcome
                                                            ? "text-yellow-300"
                                                            : "text-red-300"
                                                    }`}
                                            >
                                                {!playerHasStartedSetting
                                                    ? "No hand set yet"
                                                    : selectedIsExactBest
                                                        ? "Exact best split vs dealer"
                                                        : selectedIsLegal && selectedMatchesBestOutcome
                                                            ? "Same best practical outcome"
                                                            : "Worse outcome vs dealer"}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                                            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Legal</div>
                                            <div
                                                className={`mt-2 text-sm font-bold ${!playerHasStartedSetting
                                                    ? "text-white/60"
                                                    : selectedIsLegal
                                                        ? "text-emerald-300"
                                                        : "text-red-300"
                                                    }`}
                                            >
                                                {!playerHasStartedSetting
                                                    ? "No hand set yet"
                                                    : selectedIsLegal
                                                        ? "Legal split"
                                                        : "Illegal split"}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                                            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Fortune Preview</div>
                                            <div className="mt-2 text-sm font-bold text-amber-50">
                                                {fortunePreview?.category ?? "—"}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="order-2 space-y-3 xl:order-3">
                            <TableCard title="Wagers">
                                <div className="space-y-3">
                                    <BetInput
                                        label="Main Bet"
                                        value={mainBet}
                                        onChange={setMainBet}
                                        min={MAIN_MIN}
                                        disabled={stage !== "betting"}
                                    />
                                    <BetInput
                                        label="Fortune"
                                        value={fortuneBet}
                                        onChange={setFortuneBet}
                                        min={SIDE_MIN}
                                        disabled={stage !== "betting"}
                                    />
                                    <BetInput
                                        label="Ace High"
                                        value={aceHighBet}
                                        onChange={setAceHighBet}
                                        min={SIDE_MIN}
                                        disabled={stage !== "betting"}
                                    />
                                </div>
                            </TableCard>

                            <TableCard title="Actions">
                                <div className="flex flex-wrap justify-center gap-2">
                                    {stage === "betting" && <DealButton onClick={dealHand} />}

                                    {stage === "setting" && (
                                        <>
                                            <ActionButton onClick={autoSetBest}>Auto Set Best</ActionButton>
                                            <ActionButton
                                                onClick={setHandAndResolve}
                                                variant="bet"
                                                disabled={!selectedIsLegal || selectedFrontIds.length !== 2}
                                            >
                                                Set Hand
                                            </ActionButton>
                                        </>
                                    )}

                                    {stage === "showdown" && (
                                        <ActionButton onClick={nextHand} variant="success">
                                            Next Hand
                                        </ActionButton>
                                    )}
                                </div>
                            </TableCard>

                            <TableCard title="Result">
                                {stage !== "showdown" ? (
                                    <div className="text-center text-sm font-semibold text-emerald-50/85">Waiting for showdown.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {resultLines.map((line, idx) => (
                                            <div key={`${line}-${idx}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-emerald-50/90">
                                                {line}
                                            </div>
                                        ))}
                                        <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm font-extrabold text-amber-50">
                                            Net: {net === null ? "—" : fmt(net)}
                                        </div>
                                    </div>
                                )}
                            </TableCard>

                            <TableCard title="Rules">
                                <div className="space-y-2 text-sm leading-6 text-emerald-50/90">
                                    <div>• You get 7 cards and split them into a 5-card high and 2-card low.</div>
                                    <div>• Dealer ties win, both high and low hands.</div>
                                    <div>• This version does not allow fouls.</div>
                                    <div>• Any legal hand can be played on this app.</div>
                                    <div>• Auto Set Best chooses the best legal split against the dealer’s shown hand.</div>
                                    <div>• Dealer uses explicit house-way-style rules for common hands, not raw max-strength optimization.</div>
                                    <div>• Main bet: win both hands = even money, split = push, lose both = lose.</div>
                                    <div>• Fortune is based on the player’s 7 cards regardless of how the hand is set.</div>
                                    <div>• Envy is omitted in this single-player build.</div>
                                </div>
                            </TableCard>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}