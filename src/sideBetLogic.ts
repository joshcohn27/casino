// Side Bet Blackjack: the side bets, their pay tables, and how each one is decided.
// Pure functions only, so every table can be checked by counting every possible deal.
//
// Sources for the pay tables:
//   Blazing 7s     Caesars $5 progressive card, same as Wizard of Odds version 2, pay table 2
//   TriLux         the all-pays-9-to-1 table (Wizard of Odds table 5)
//   King's Bounty  the standard six-deck table (Loto-Quebec's published rules)
//   Lucky Ladies   Wizard of Odds pay table B
//   Match the Dealer  the six-deck table: 4 to 1 and 11 to 1
//   Fortune        Fortune Blackjack as dealt at Red Rock

export type SideSuit = "♠" | "♥" | "♦" | "♣";
export type SideCard = { rank: string; suit: SideSuit };

export type SideBetId = "blazing" | "trilux" | "kingsBounty" | "luckyLadies" | "matchDealer" | "fortune";

/** One line of a pay table. `pays` is "to 1" unless the table says otherwise. */
export type PayRow = { key: string; label: string; pays: string };

/** What a side bet did. `multiplier` is winnings per unit bet, "to 1": the bet itself comes back as well. */
export type SideOutcome = { key: string; label: string; multiplier: number };

// ─── card helpers ─────────────────────────────────────────────────────────────

const ORDER: Record<string, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
const isRed = (suit: SideSuit) => suit === "♥" || suit === "♦";
const pointValue = (rank: string) => (rank === "A" ? 11 : ORDER[rank] >= 10 ? 10 : ORDER[rank]);

/** Best blackjack total of the cards: aces count 11 unless that would go over 21. */
export function bestTotal(cards: SideCard[]): number {
    let sum = cards.reduce((acc, c) => acc + pointValue(c.rank), 0);
    let aces = cards.filter((c) => c.rank === "A").length;
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
}

const sameSuit = (cards: SideCard[]) => cards.every((c) => c.suit === cards[0].suit);
const sameRank = (cards: SideCard[]) => cards.every((c) => c.rank === cards[0].rank);
const ranksAre = (cards: SideCard[], ranks: string[]) => [...cards.map((c) => c.rank)].sort().join() === [...ranks].sort().join();

// ─── Blazing 7s ($5 progressive) ──────────────────────────────────────────────
// Your two cards and the dealer's up card. One or two 7s count from your own cards only.
// Every win is "for 1": the $5 bet is not returned on top.

export const BLAZING_BET = 5;

export type BlazingOutcome = {
    key: "threeDiamonds" | "threeSuited" | "threeColor" | "three" | "two" | "one";
    label: string;
    /** Share of the jackpot paid: 1, 0.1, or 0 for a fixed prize. */
    jackpotShare: number;
    /** Fixed prize in dollars for the $5 bet. 0 when the prize is a share of the jackpot. */
    fixed: number;
};

export const BLAZING_TABLE: PayRow[] = [
    { key: "threeDiamonds", label: "Three 7s of diamonds", pays: "100% of jackpot" },
    { key: "threeSuited", label: "Three suited 7s", pays: "10% of jackpot" },
    { key: "threeColor", label: "Three 7s, same color", pays: "$2,500" },
    { key: "three", label: "Three 7s", pays: "$1,000" },
    { key: "two", label: "Two 7s", pays: "$125" },
    { key: "one", label: "One 7", pays: "$10" },
];

export function blazing7s(player: SideCard[], dealerUp: SideCard): BlazingOutcome | null {
    const sevens = player.filter((c) => c.rank === "7");
    if (sevens.length === 2 && dealerUp.rank === "7") {
        const three = [...player, dealerUp];
        if (three.every((c) => c.suit === "♦")) return { key: "threeDiamonds", label: "Three 7s of diamonds", jackpotShare: 1, fixed: 0 };
        if (sameSuit(three)) return { key: "threeSuited", label: "Three suited 7s", jackpotShare: 0.1, fixed: 0 };
        if (three.every((c) => isRed(c.suit) === isRed(three[0].suit))) return { key: "threeColor", label: "Three 7s, same color", jackpotShare: 0, fixed: 500 * BLAZING_BET };
        return { key: "three", label: "Three 7s", jackpotShare: 0, fixed: 200 * BLAZING_BET };
    }
    if (sevens.length === 2) return { key: "two", label: "Two 7s", jackpotShare: 0, fixed: 25 * BLAZING_BET };
    if (sevens.length === 1) return { key: "one", label: "One 7", jackpotShare: 0, fixed: 2 * BLAZING_BET };
    return null;
}

// ─── TriLux ───────────────────────────────────────────────────────────────────
// Your two cards and the dealer's up card as a three-card poker hand. Every hand pays 9 to 1.

export const TRILUX_TABLE: PayRow[] = [
    { key: "miniRoyal", label: "Mini Royal", pays: "9 to 1" },
    { key: "straightFlush", label: "Straight Flush", pays: "9 to 1" },
    { key: "threeKind", label: "Three of a Kind", pays: "9 to 1" },
    { key: "straight", label: "Straight", pays: "9 to 1" },
    { key: "flush", label: "Flush", pays: "9 to 1" },
];

export function trilux(player: SideCard[], dealerUp: SideCard): SideOutcome | null {
    const three = [...player, dealerUp];
    const v = three.map((c) => ORDER[c.rank]).sort((a, b) => b - a);
    const flush = sameSuit(three);
    const straight = (v[0] - v[1] === 1 && v[1] - v[2] === 1) || v.join() === "14,3,2";
    if (flush && v.join() === "14,13,12") return { key: "miniRoyal", label: "Mini Royal", multiplier: 9 };
    if (flush && straight) return { key: "straightFlush", label: "Straight Flush", multiplier: 9 };
    if (sameRank(three)) return { key: "threeKind", label: "Three of a Kind", multiplier: 9 };
    if (straight) return { key: "straight", label: "Straight", multiplier: 9 };
    if (flush) return { key: "flush", label: "Flush", multiplier: 9 };
    return null;
}

// ─── King's Bounty ────────────────────────────────────────────────────────────
// Your first two cards total 20. Only the highest line that fits is paid.

export const KINGS_BOUNTY_TABLE: PayRow[] = [
    { key: "kingsSpadesBJ", label: "K♠ K♠ with dealer blackjack", pays: "1,000 to 1" },
    { key: "kingsSpades", label: "K♠ K♠", pays: "100 to 1" },
    { key: "suitedKings", label: "Suited kings", pays: "30 to 1" },
    { key: "suitedPair", label: "Suited Q, J or 10 pair", pays: "20 to 1" },
    { key: "suited20", label: "Suited 20", pays: "9 to 1" },
    { key: "kings", label: "Two kings", pays: "6 to 1" },
    { key: "any20", label: "Any 20", pays: "4 to 1" },
];

export function kingsBounty(player: SideCard[], dealerBlackjack: boolean): SideOutcome | null {
    if (bestTotal(player) !== 20) return null;
    const suited = sameSuit(player);
    const kings = player.every((c) => c.rank === "K");
    if (kings && player.every((c) => c.suit === "♠")) {
        return dealerBlackjack
            ? { key: "kingsSpadesBJ", label: "K♠ K♠ with dealer blackjack", multiplier: 1000 }
            : { key: "kingsSpades", label: "K♠ K♠", multiplier: 100 };
    }
    if (kings && suited) return { key: "suitedKings", label: "Suited kings", multiplier: 30 };
    if (suited && sameRank(player)) return { key: "suitedPair", label: "Suited Q, J or 10 pair", multiplier: 20 };
    if (suited) return { key: "suited20", label: "Suited 20", multiplier: 9 };
    if (kings) return { key: "kings", label: "Two kings", multiplier: 6 };
    return { key: "any20", label: "Any 20", multiplier: 4 };
}

// ─── Lucky Ladies ─────────────────────────────────────────────────────────────
// Your first two cards total 20. A matched 20 is the same card twice.

export const LUCKY_LADIES_TABLE: PayRow[] = [
    { key: "queensHeartsBJ", label: "Q♥ Q♥ with dealer blackjack", pays: "1,000 to 1" },
    { key: "queensHearts", label: "Q♥ Q♥", pays: "200 to 1" },
    { key: "matched20", label: "Matched 20", pays: "25 to 1" },
    { key: "suited20", label: "Suited 20", pays: "10 to 1" },
    { key: "any20", label: "Any 20", pays: "4 to 1" },
];

export function luckyLadies(player: SideCard[], dealerBlackjack: boolean): SideOutcome | null {
    if (bestTotal(player) !== 20) return null;
    if (player.every((c) => c.rank === "Q" && c.suit === "♥")) {
        return dealerBlackjack
            ? { key: "queensHeartsBJ", label: "Q♥ Q♥ with dealer blackjack", multiplier: 1000 }
            : { key: "queensHearts", label: "Q♥ Q♥", multiplier: 200 };
    }
    if (sameRank(player) && sameSuit(player)) return { key: "matched20", label: "Matched 20", multiplier: 25 };
    if (sameSuit(player)) return { key: "suited20", label: "Suited 20", multiplier: 10 };
    return { key: "any20", label: "Any 20", multiplier: 4 };
}

// ─── Match the Dealer ─────────────────────────────────────────────────────────
// Each of your two cards that matches the dealer's up card in rank wins, and both can win.

export const MATCH_DEALER_TABLE: PayRow[] = [
    { key: "suited", label: "Suited match", pays: "11 to 1" },
    { key: "unsuited", label: "Unsuited match", pays: "4 to 1" },
];

export function matchDealer(player: SideCard[], dealerUp: SideCard): SideOutcome | null {
    const matches = player.filter((c) => c.rank === dealerUp.rank);
    if (matches.length === 0) return null;
    const suited = matches.filter((c) => c.suit === dealerUp.suit).length;
    const multiplier = suited * 11 + (matches.length - suited) * 4;
    const label = matches.length === 2
        ? (suited === 2 ? "Two suited matches" : suited === 1 ? "Suited and unsuited match" : "Two unsuited matches")
        : (suited === 1 ? "Suited match" : "Unsuited match");
    return { key: suited > 0 ? "suited" : "unsuited", label, multiplier };
}

// ─── Fortune ──────────────────────────────────────────────────────────────────
// Your two cards and the dealer's up card total 19, 20 or 21. Aces count 1 or 11.

export const FORTUNE_TABLE: PayRow[] = [
    { key: "suited777", label: "Suited 7-7-7", pays: "200 to 1" },
    { key: "suited678", label: "Suited 6-7-8", pays: "100 to 1" },
    { key: "777", label: "7-7-7", pays: "50 to 1" },
    { key: "678", label: "6-7-8", pays: "20 to 1" },
    { key: "suited21", label: "Suited 21", pays: "10 to 1" },
    { key: "21", label: "21", pays: "3 to 1" },
    { key: "20", label: "20", pays: "2 to 1" },
    { key: "19", label: "19", pays: "2 to 1" },
];

export function fortune(player: SideCard[], dealerUp: SideCard): SideOutcome | null {
    const three = [...player, dealerUp];
    const suited = sameSuit(three);
    const sevens = three.every((c) => c.rank === "7");
    const run = ranksAre(three, ["6", "7", "8"]);
    if (sevens && suited) return { key: "suited777", label: "Suited 7-7-7", multiplier: 200 };
    if (run && suited) return { key: "suited678", label: "Suited 6-7-8", multiplier: 100 };
    if (sevens) return { key: "777", label: "7-7-7", multiplier: 50 };
    if (run) return { key: "678", label: "6-7-8", multiplier: 20 };
    const total = bestTotal(three);
    if (total === 21) return suited ? { key: "suited21", label: "Suited 21", multiplier: 10 } : { key: "21", label: "21", multiplier: 3 };
    if (total === 20) return { key: "20", label: "20", multiplier: 2 };
    if (total === 19) return { key: "19", label: "19", multiplier: 2 };
    return null;
}

// ─── the Blazing 7s jackpot meter ─────────────────────────────────────────────
// Kept in the browser so it carries on between visits. It grows a little from every $5 bet,
// and on its own while the table is open, standing in for the other tables linked to it.

export const BLAZING_METER_KEY = "blazing7s-progressive-meter";
export const BLAZING_METER_SEED = 50000;
export const BLAZING_METER_CAP = 999999;
/** How much of each $5 bet goes onto the meter. */
export const BLAZING_CONTRIBUTION = 1.05;

const cents = (n: number) => Math.round(n * 100) / 100;

export function readBlazingMeter(): number {
    if (typeof window === "undefined") return BLAZING_METER_SEED;
    const raw = Number(window.localStorage.getItem(BLAZING_METER_KEY));
    return Number.isFinite(raw) && raw >= BLAZING_METER_SEED && raw <= BLAZING_METER_CAP ? raw : BLAZING_METER_SEED;
}

export function writeBlazingMeter(value: number): void {
    if (typeof window !== "undefined") window.localStorage.setItem(BLAZING_METER_KEY, String(cents(value)));
}

/** The meter after growing by `amount`. Past the cap it starts again from the seed. */
export function growBlazingMeter(meter: number, amount: number): number {
    const next = cents(meter + amount);
    return next > BLAZING_METER_CAP ? BLAZING_METER_SEED : next;
}
