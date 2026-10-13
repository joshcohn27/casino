// I Luv Suits (High Card Flush) - game rules, no UI.
//
// Seven cards each. A hand is ranked by its longest flush: more cards in one suit wins,
// then the ranks of that flush compared high card first.

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type Card = { rank: Rank; suit: Suit; value: number; id: string };

export const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
export const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES: Record<Rank, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };

export const HAND_SIZE = 7;
export const MIN_ANTE = 5;

// Pay tables, "to 1", keyed by number of cards
export const FLUSH_RUSH_PAYTABLE: Record<number, number> = { 7: 300, 6: 75, 5: 5, 4: 2 };
export const SUPER_FLUSH_PAYTABLE: Record<number, number> = { 7: 8000, 6: 1000, 5: 100, 4: 60, 3: 7 };

export function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit, value: RANK_VALUES[rank], id: `${rank}${suit}` });
    return deck;
}

export function shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ─── Suit masks ───────────────────────────────────────────────────────────────
// One 13-bit mask per suit: bit 0 = deuce ... bit 12 = ace.

export function suitMasks(cards: Card[]): number[] {
    const masks = [0, 0, 0, 0];
    for (const c of cards) masks[SUITS.indexOf(c.suit)] |= 1 << (c.value - 2);
    return masks;
}

export function countBits(mask: number): number {
    let n = 0;
    for (let m = mask; m; m &= m - 1) n++;
    return n;
}

// Longest run of consecutive ranks in one suit. The ace plays high or low.
export function longestRun(mask: number): number {
    // bit 0 = low ace, bits 1-13 = deuce through high ace
    const withLowAce = (mask << 1) | ((mask >> 12) & 1);
    let best = 0, run = 0;
    for (let i = 0; i < 14; i++) {
        if (withLowAce & (1 << i)) { run++; if (run > best) best = run; }
        else run = 0;
    }
    // a suit holding all 13 ranks would count the ace twice
    return Math.min(best, 13);
}

export function longestFlushFromMasks(masks: number[]): number {
    return Math.max(countBits(masks[0]), countBits(masks[1]), countBits(masks[2]), countBits(masks[3]));
}

export function longestStraightFlushFromMasks(masks: number[]): number {
    return Math.max(longestRun(masks[0]), longestRun(masks[1]), longestRun(masks[2]), longestRun(masks[3]));
}

// ─── Hand evaluation ──────────────────────────────────────────────────────────

export type FlushHand = {
    /** Cards in the best flush */
    count: number;
    suit: Suit;
    /** Ranks of the best flush, high to low */
    values: number[];
    cards: Card[];
};

function compareValues(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const av = a[i] ?? 0, bv = b[i] ?? 0;
        if (av !== bv) return av > bv ? 1 : -1;
    }
    return 0;
}

/** Positive if a beats b, negative if b beats a, 0 on an exact tie. */
export function compareFlushHands(a: FlushHand, b: FlushHand): number {
    if (a.count !== b.count) return a.count > b.count ? 1 : -1;
    return compareValues(a.values, b.values);
}

export function evaluateFlushHand(cards: Card[]): FlushHand {
    let best: FlushHand | null = null;
    for (const suit of SUITS) {
        const suited = cards.filter((c) => c.suit === suit).sort((a, b) => b.value - a.value);
        if (suited.length === 0) continue;
        const hand: FlushHand = { count: suited.length, suit, values: suited.map((c) => c.value), cards: suited };
        if (!best || compareFlushHands(hand, best) > 0) best = hand;
    }
    if (!best) throw new Error("empty hand");
    return best;
}

/** Dealer needs at least a three-card flush, nine-high. */
export function dealerQualifies(hand: FlushHand): boolean {
    if (hand.count > 3) return true;
    return hand.count === 3 && hand.values[0] >= 9;
}

/** Largest Play bet allowed, as a multiple of the Ante. */
export function maxRaiseMultiple(flushCount: number): 1 | 2 | 3 {
    if (flushCount >= 6) return 3;
    if (flushCount === 5) return 2;
    return 1;
}

export function longestStraightFlush(cards: Card[]): number {
    return longestStraightFlushFromMasks(suitMasks(cards));
}

const VALUE_NAMES: Record<number, string> = { 14: "Ace", 13: "King", 12: "Queen", 11: "Jack" };
export function valueName(v: number): string { return VALUE_NAMES[v] ?? String(v); }

export function describeFlushHand(hand: FlushHand): string {
    return `${hand.count}-Card Flush, ${valueName(hand.values[0])} High`;
}

// ─── Strategy ─────────────────────────────────────────────────────────────────

// Weakest three-card flush worth a Play bet. Found by simulating 200 million deals with
// these rules: 10-8-6 is the first hand where playing loses less than folding.
const MIN_PLAYABLE_THREE_CARD = [10, 8, 6];

/** Basic strategy: the Play multiple to bet, or "fold". */
export function suggestAction(hand: FlushHand): "fold" | 1 | 2 | 3 {
    if (hand.count >= 4) return maxRaiseMultiple(hand.count);
    if (hand.count === 3 && compareValues(hand.values, MIN_PLAYABLE_THREE_CARD) >= 0) return 1;
    return "fold";
}

// ─── Settlement ───────────────────────────────────────────────────────────────

export type Settlement = {
    folded: boolean;
    dealerQualified: boolean;
    /** Player hand against dealer hand: 1 win, -1 lose, 0 tie */
    compare: number;
    /** Amounts returned to the player, stake included */
    anteReturn: number;
    playReturn: number;
    flushRushReturn: number;
    superFlushReturn: number;
    totalReturn: number;
    totalWagered: number;
    net: number;
    flushRushMultiplier: number;
    superFlushMultiplier: number;
    superFlushCount: number;
    lines: string[];
};

export function settle(params: {
    player: Card[]; dealer: Card[];
    ante: number; play: number; flushRush: number; superFlush: number;
    folded: boolean;
}): Settlement {
    const { player, dealer, ante, play, flushRush, superFlush, folded } = params;
    const playerHand = evaluateFlushHand(player);
    const dealerHand = evaluateFlushHand(dealer);
    const dealerQualified = dealerQualifies(dealerHand);
    const compare = compareFlushHands(playerHand, dealerHand);
    const lines: string[] = [];

    let anteReturn = 0, playReturn = 0;
    if (folded) {
        lines.push("Folded - Ante lost");
    } else if (!dealerQualified) {
        anteReturn = ante * 2;
        playReturn = play;
        lines.push("Dealer does not qualify - Ante wins, Play returned");
    } else if (compare > 0) {
        anteReturn = ante * 2;
        playReturn = play * 2;
        lines.push(`Win - ${describeFlushHand(playerHand)}`);
    } else if (compare === 0) {
        anteReturn = ante;
        playReturn = play;
        lines.push(`Push - ${describeFlushHand(playerHand)}`);
    } else {
        lines.push(`Lose - dealer ${describeFlushHand(dealerHand)}`);
    }

    // Side bets pay on the player's own cards, whatever happens to the main bet
    const flushRushMultiplier = FLUSH_RUSH_PAYTABLE[playerHand.count] ?? 0;
    const flushRushReturn = flushRush > 0 && flushRushMultiplier > 0 ? flushRush + flushRush * flushRushMultiplier : 0;
    if (flushRush > 0) {
        lines.push(flushRushMultiplier > 0
            ? `Flush Rush: ${playerHand.count}-card flush - ${flushRushMultiplier} to 1`
            : "Flush Rush: No win");
    }

    const superFlushCount = longestStraightFlush(player);
    const superFlushMultiplier = SUPER_FLUSH_PAYTABLE[superFlushCount] ?? 0;
    const superFlushReturn = superFlush > 0 && superFlushMultiplier > 0 ? superFlush + superFlush * superFlushMultiplier : 0;
    if (superFlush > 0) {
        lines.push(superFlushMultiplier > 0
            ? `Super Flush Rush: ${superFlushCount}-card straight flush - ${superFlushMultiplier} to 1`
            : "Super Flush Rush: No win");
    }

    const totalReturn = anteReturn + playReturn + flushRushReturn + superFlushReturn;
    const totalWagered = ante + play + flushRush + superFlush;
    return {
        folded, dealerQualified, compare,
        anteReturn, playReturn, flushRushReturn, superFlushReturn,
        totalReturn, totalWagered, net: totalReturn - totalWagered,
        flushRushMultiplier, superFlushMultiplier, superFlushCount, lines,
    };
}
