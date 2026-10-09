// DJ Wild - game rules, no UI.
//
// 53 cards: a standard deck plus one joker. Deuces and the joker are wild.
// A deuce may also play as an ordinary deuce (for example A-2-3-4-5), and a hand
// that reaches its best ranking without using any wild counts as "natural".

export type Suit = "♠" | "♥" | "♦" | "♣" | "🃏";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A" | "JOKER";
export type Card = { rank: Rank; suit: Suit; value: number; id: string };

export const SUITS: Exclude<Suit, "🃏">[] = ["♠", "♥", "♦", "♣"];
export const RANKS: Exclude<Rank, "JOKER">[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES: Record<Exclude<Rank, "JOKER">, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };

export const HAND_SIZE = 5;
export const MIN_ANTE = 5;
export const PLAY_MULTIPLE = 2;

export type Category =
    | "High Card" | "Pair" | "Two Pair" | "Three of a Kind" | "Straight" | "Flush"
    | "Full House" | "Four of a Kind" | "Straight Flush" | "Five of a Kind" | "Royal Flush" | "Five Wilds";

// Lowest to highest
export const CATEGORY_ORDER: Category[] = [
    "High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush",
    "Full House", "Four of a Kind", "Straight Flush", "Five of a Kind", "Royal Flush", "Five Wilds",
];
const CATEGORY_RANK: Record<Category, number> = Object.fromEntries(CATEGORY_ORDER.map((c, i) => [c, i])) as Record<Category, number>;

// Pay tables, "to 1"
export const BLIND_PAYTABLE: Partial<Record<Category, number>> = {
    "Five Wilds": 1000, "Royal Flush": 50, "Five of a Kind": 10, "Straight Flush": 9,
    "Four of a Kind": 4, "Full House": 3, Flush: 2, Straight: 1,
};
export const TRIPS_NATURAL_PAYTABLE: Partial<Record<Category, number>> = {
    "Royal Flush": 1000, "Straight Flush": 200, "Four of a Kind": 60, "Full House": 30,
    Flush: 25, Straight: 20, "Three of a Kind": 6,
};
export const TRIPS_WILD_PAYTABLE: Partial<Record<Category, number>> = {
    "Five Wilds": 2000, "Royal Flush": 90, "Five of a Kind": 70, "Straight Flush": 25,
    "Four of a Kind": 6, "Full House": 5, Flush: 4, Straight: 3, "Three of a Kind": 1,
};

// Two-Way Bad Beat: pays when a Three of a Kind or better loses, by the hand that was beaten
export const BAD_BEAT_PAYTABLE: Partial<Record<Category, number>> = {
    "Royal Flush": 500, "Five of a Kind": 500, "Straight Flush": 500, "Four of a Kind": 300,
    "Full House": 200, Flush: 100, Straight: 50, "Three of a Kind": 15,
};

// Five Card Progressive: a fixed $1 bet on the player's hand. Paid "for 1" (the amount
// shown is what comes back, the $1 included). Wild and natural hands pay alike.
// Five Wilds takes the whole meter (as at Canterbury Park). Five of a Kind is not on any
// published table found, so it is set level with a Straight Flush.
export const PROGRESSIVE_BET = 1;
export const PROGRESSIVE_SEED = 10000;
/** Added to the jackpot meter by each progressive bet */
export const PROGRESSIVE_CONTRIBUTION = 0.25;
export const PROGRESSIVE_METER_SHARE: Partial<Record<Category, number>> = {
    "Five Wilds": 1, "Royal Flush": 1, "Five of a Kind": 0.1, "Straight Flush": 0.1,
};
export const PROGRESSIVE_FIXED_PAYTABLE: Partial<Record<Category, number>> = {
    "Four of a Kind": 300, "Full House": 50, Flush: 40, Straight: 30, "Three of a Kind": 9,
};

export function isWild(card: Card): boolean { return card.rank === "2" || card.rank === "JOKER"; }

export function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit, value: RANK_VALUES[rank], id: `${rank}${suit}` });
    deck.push({ rank: "JOKER", suit: "🃏", value: 15, id: "JOKER" });
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

// ─── Evaluation ───────────────────────────────────────────────────────────────

export type HandEval = {
    category: Category;
    /** category rank first, then tie-breakers, compared left to right */
    score: number[];
    /** true when the best ranking is reached with no wild card acting as wild */
    natural: boolean;
    label: string;
};

type Fixed = { value: number; suit: Suit };

// Highest straight (by top card) that holds every given rank, with the gaps filled by wilds.
// Ranks must be distinct. Ace plays high or low. Returns the top card, or 0 if none.
function straightTop(values: number[]): number {
    for (let top = 14; top >= 5; top--) {
        const low = top - 4;
        const fits = values.every((v) => {
            const x = v === 14 && top === 5 ? 1 : v;
            return x >= low && x <= top;
        });
        if (fits) return top;
    }
    return 0;
}

// Best ranking of `fixed` ordinary cards plus `wilds` wild cards (fixed.length + wilds === 5)
function evaluateWith(fixed: Fixed[], wilds: number): { category: Category; tiebreak: number[] } {
    if (wilds === 5) return { category: "Five Wilds", tiebreak: [] };

    const values = fixed.map((c) => c.value).sort((a, b) => b - a);
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    // most copies first, then higher rank
    const groups = [...counts.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : b[0] - a[0]));
    const distinct = groups.length === values.length;
    const sameSuit = fixed.every((c) => c.suit === fixed[0].suit);
    const top = distinct ? straightTop(values) : 0;
    const maxCount = groups[0][1];
    const best = maxCount + wilds;
    // wilds join the highest rank among those tied for most copies
    const mainValue = groups[0][0];
    const others = values.filter((v) => v !== mainValue);

    if (sameSuit && distinct && top === 14 && values.every((v) => v >= 10)) return { category: "Royal Flush", tiebreak: [] };
    if (best === 5) return { category: "Five of a Kind", tiebreak: [mainValue] };
    if (sameSuit && top > 0) return { category: "Straight Flush", tiebreak: [top] };
    if (best === 4) return { category: "Four of a Kind", tiebreak: [mainValue, ...others] };
    if (groups.length === 2 && best === 3) {
        // 3+2 with no wild, or two pair plus one wild
        const [a, b] = wilds === 0 ? [groups[0][0], groups[1][0]] : [Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0])];
        return { category: "Full House", tiebreak: [a, b] };
    }
    if (sameSuit) {
        // wilds stand in for the highest ranks not already held
        const filled = [...values];
        for (let v = 14, need = wilds; need > 0 && v >= 2; v--) if (!filled.includes(v)) { filled.push(v); need--; }
        return { category: "Flush", tiebreak: filled.sort((a, b) => b - a) };
    }
    if (top > 0) return { category: "Straight", tiebreak: [top] };
    if (best === 3) return { category: "Three of a Kind", tiebreak: [mainValue, ...others] };
    if (wilds === 0 && groups.length === 3 && groups[0][1] === 2 && groups[1][1] === 2) {
        const hi = Math.max(groups[0][0], groups[1][0]), lo = Math.min(groups[0][0], groups[1][0]);
        return { category: "Two Pair", tiebreak: [hi, lo, groups[2][0]] };
    }
    if (best === 2) return { category: "Pair", tiebreak: [mainValue, ...others] };
    return { category: "High Card", tiebreak: values };
}

function compareScores(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const av = a[i] ?? 0, bv = b[i] ?? 0;
        if (av !== bv) return av > bv ? 1 : -1;
    }
    return 0;
}

/** Positive if a beats b, negative if b beats a, 0 on a tie. */
export function compareHands(a: HandEval, b: HandEval): number { return compareScores(a.score, b.score); }

const VALUE_NAMES: Record<number, string> = { 14: "Ace", 13: "King", 12: "Queen", 11: "Jack" };
function valueName(v: number): string { return VALUE_NAMES[v] ?? String(v); }
function plural(v: number): string { return v === 6 ? "Sixes" : `${valueName(v)}s`; }

function describe(category: Category, tiebreak: number[]): string {
    switch (category) {
        case "Five of a Kind": return `Five ${plural(tiebreak[0])}`;
        case "Straight Flush": return `${valueName(tiebreak[0])}-High Straight Flush`;
        case "Four of a Kind": return `Four ${plural(tiebreak[0])}`;
        case "Full House": return `${plural(tiebreak[0])} Full of ${plural(tiebreak[1])}`;
        case "Flush": return `${valueName(tiebreak[0])}-High Flush`;
        case "Straight": return `${valueName(tiebreak[0])}-High Straight`;
        case "Three of a Kind": return `Three ${plural(tiebreak[0])}`;
        case "Two Pair": return `${plural(tiebreak[0])} and ${plural(tiebreak[1])}`;
        case "Pair": return `Pair of ${plural(tiebreak[0])}`;
        case "High Card": return `${valueName(tiebreak[0])} High`;
        default: return category;
    }
}

export function evaluateHand(cards: Card[]): HandEval {
    if (cards.length !== HAND_SIZE) throw new Error("DJ Wild hands are five cards");
    const ordinary: Fixed[] = cards.filter((c) => !isWild(c)).map((c) => ({ value: c.value, suit: c.suit }));
    const deuces: Fixed[] = cards.filter((c) => c.rank === "2").map((c) => ({ value: 2, suit: c.suit }));
    const hasJoker = cards.some((c) => c.rank === "JOKER");

    // Each deuce is either wild or an ordinary deuce: try every choice and keep the best
    let best: { category: Category; tiebreak: number[]; score: number[] } | null = null;
    let allNatural: { category: Category } | null = null;
    for (let pick = 0; pick < 1 << deuces.length; pick++) {
        const asDeuce = deuces.filter((_, i) => pick & (1 << i));
        const wilds = deuces.length - asDeuce.length + (hasJoker ? 1 : 0);
        const res = evaluateWith([...ordinary, ...asDeuce], wilds);
        const score = [CATEGORY_RANK[res.category], ...res.tiebreak];
        if (!best || compareScores(score, best.score) > 0) best = { ...res, score };
        if (wilds === 0) allNatural = res;
    }
    if (!best) throw new Error("no evaluation");
    const natural = allNatural !== null && allNatural.category === best.category;
    return { category: best.category, score: best.score, natural, label: describe(best.category, best.tiebreak) };
}

/** Trips side bet multiplier ("to 1") for a hand, 0 if it loses. */
export function tripsMultiplier(hand: HandEval): number {
    return (hand.natural ? TRIPS_NATURAL_PAYTABLE : TRIPS_WILD_PAYTABLE)[hand.category] ?? 0;
}

/** Blind multiplier ("to 1") when the player wins; 0 means the Blind pushes. */
export function blindMultiplier(hand: HandEval): number { return BLIND_PAYTABLE[hand.category] ?? 0; }

// ─── Side bets ────────────────────────────────────────────────────────────────

/** Two-Way Bad Beat: the hand that lost, and what it pays ("to 1", 0 if it does not qualify). */
export function badBeat(player: HandEval, dealer: HandEval): { multiplier: number; beaten: HandEval | null; beatenIs: "player" | "dealer" | null } {
    const cmp = compareHands(player, dealer);
    if (cmp === 0) return { multiplier: 0, beaten: null, beatenIs: null };
    const beaten = cmp > 0 ? dealer : player;
    return { multiplier: BAD_BEAT_PAYTABLE[beaten.category] ?? 0, beaten, beatenIs: cmp > 0 ? "dealer" : "player" };
}

/** Five Card Progressive: amount returned for a $1 bet, and the meter afterwards. */
export function progressivePayout(hand: HandEval, meter: number): { payout: number; meterAfter: number } {
    const share = PROGRESSIVE_METER_SHARE[hand.category];
    if (share !== undefined) {
        const payout = Math.round(meter * share * 100) / 100;
        const left = Math.round((meter - payout) * 100) / 100;
        // the whole meter going out resets it to the seed
        return { payout, meterAfter: share >= 1 ? PROGRESSIVE_SEED : left };
    }
    return { payout: PROGRESSIVE_FIXED_PAYTABLE[hand.category] ?? 0, meterAfter: meter };
}

// ─── Strategy ─────────────────────────────────────────────────────────────────

/**
 * Basic strategy: Play with a pair of fours or better, except two fours with a three
 * alongside; otherwise fold.
 *
 * Works on the cards the player has turned over so far. Returns null when those cards
 * do not settle the question yet.
 */
export function suggestAction(visible: Card[]): "play" | "fold" | null {
    // Any wild card guarantees at least a pair of the highest other card, which is always enough
    if (visible.some(isWild)) return "play";

    if (visible.length === HAND_SIZE) {
        const hand = evaluateHand(visible);
        if (hand.category === "High Card") return "fold";
        if (hand.category !== "Pair") return "play";
        const pairValue = hand.score[1];
        if (pairValue > 4) return "play";
        if (pairValue < 4) return "fold";
        return visible.some((c) => c.value === 3) ? "fold" : "play";
    }

    // Part of the hand is still face down: a pair of fives or better already showing is enough
    const counts = new Map<number, number>();
    for (const c of visible) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
    for (const [value, n] of counts) if (n >= 2 && value > 4) return "play";
    return null;
}

// ─── Settlement ───────────────────────────────────────────────────────────────

export type Settlement = {
    folded: boolean;
    compare: number;
    playerHand: HandEval;
    dealerHand: HandEval;
    /** Amounts returned to the player, stake included */
    anteReturn: number;
    blindReturn: number;
    playReturn: number;
    tripsReturn: number;
    badBeatReturn: number;
    progressiveReturn: number;
    /** Jackpot meter after this hand's progressive result */
    meterAfter: number;
    badBeatMultiplier: number;
    totalReturn: number;
    totalWagered: number;
    net: number;
    blindMultiplier: number;
    tripsMultiplier: number;
    lines: string[];
};

export function settle(params: {
    player: Card[]; dealer: Card[];
    ante: number; play: number; trips: number;
    folded: boolean;
    badBeat?: number;
    /** true when the $1 progressive bet was made */
    progressive?: boolean;
    meter?: number;
}): Settlement {
    const { player, dealer, ante, play, trips, folded } = params;
    const badBeatBet = params.badBeat ?? 0;
    const progressive = params.progressive ?? false;
    const meter = params.meter ?? PROGRESSIVE_SEED;
    const blind = ante;
    const playerHand = evaluateHand(player);
    const dealerHand = evaluateHand(dealer);
    const compare = compareHands(playerHand, dealerHand);
    const lines: string[] = [];

    let anteReturn = 0, blindReturn = 0, playReturn = 0;
    let blindMult = 0;
    if (folded) {
        lines.push("Folded - Ante and Blind lost");
    } else if (compare > 0) {
        blindMult = blindMultiplier(playerHand);
        anteReturn = ante * 2;
        playReturn = play * 2;
        blindReturn = blind + blind * blindMult;
        lines.push(`Win - ${playerHand.label}`);
        lines.push(blindMult > 0 ? `Blind: ${playerHand.category} - ${blindMult}:1` : "Blind: Push");
    } else if (compare === 0) {
        anteReturn = ante; blindReturn = blind; playReturn = play;
        lines.push(`Push - ${playerHand.label}`);
    } else {
        lines.push(`Lose - dealer ${dealerHand.label}`);
    }

    // Trips pays on the player's own hand, whatever happens to the main bets
    const tripsMult = tripsMultiplier(playerHand);
    const tripsReturn = trips > 0 && tripsMult > 0 ? trips + trips * tripsMult : 0;
    if (trips > 0) {
        lines.push(tripsMult > 0
            ? `Trips: ${playerHand.natural ? "Natural" : "Wild"} ${playerHand.category} - ${tripsMult}:1`
            : "Trips: No win");
    }

    // Two-Way Bad Beat compares the two five-card hands, whoever folded
    const beat = badBeat(playerHand, dealerHand);
    const badBeatReturn = badBeatBet > 0 && beat.multiplier > 0 ? badBeatBet + badBeatBet * beat.multiplier : 0;
    if (badBeatBet > 0) {
        lines.push(beat.multiplier > 0 && beat.beaten
            ? `Bad Beat: ${beat.beatenIs === "dealer" ? "dealer's" : "your"} ${beat.beaten.category} beaten - ${beat.multiplier}:1`
            : "Bad Beat: No win");
    }

    // Progressive pays on the player's own hand
    const prog = progressive ? progressivePayout(playerHand, meter) : { payout: 0, meterAfter: meter };
    if (progressive) {
        lines.push(prog.payout > 0
            ? `Progressive: ${playerHand.category} pays $${prog.payout.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "Progressive: No win");
    }

    const totalReturn = anteReturn + blindReturn + playReturn + tripsReturn + badBeatReturn + prog.payout;
    const totalWagered = ante + blind + play + trips + badBeatBet + (progressive ? PROGRESSIVE_BET : 0);
    return {
        folded, compare, playerHand, dealerHand,
        anteReturn, blindReturn, playReturn, tripsReturn,
        badBeatReturn, progressiveReturn: prog.payout, meterAfter: prog.meterAfter, badBeatMultiplier: beat.multiplier,
        totalReturn, totalWagered, net: totalReturn - totalWagered,
        blindMultiplier: blindMult, tripsMultiplier: tripsMult, lines,
    };
}
