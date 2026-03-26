import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

type Card = {
    rank: Rank;
    suit: Suit;
    value: number;
    id: string;
};

type Stage = "betting" | "preflop" | "flop" | "river" | "showdown" | "awaitingBonusReveal" | "roundOver";
type Decision = "check" | "bet" | "fold";

type FiveCardCategory =
    | "High Card"
    | "Pair"
    | "Two Pair"
    | "Trips"
    | "Straight"
    | "Flush"
    | "Full House"
    | "Quads"
    | "Straight Flush"
    | "Royal Flush";

type BestFive = {
    category: FiveCardCategory;
    score: number[];
    cards: Card[];
    label: string;
};

type SixCardBonusCategory =
    | "No Bonus"
    | "Trips"
    | "Straight"
    | "Flush"
    | "Full House"
    | "Quads"
    | "Straight Flush"
    | "Royal Flush"
    | "6-Card Straight Flush"
    | "6-Card Royal Flush";

type RoundState = {
    deck: Card[];
    player: Card[];
    dealer: Card[];
    board: Card[];
    hiddenSixBonusCards: Card[];
};

type PayoutBreakdown = {
    ante: number;
    blind: number;
    play: number;
    trips: number;
    sixCardBonus: number;
    total: number;
    net: number;
    summary: string[];
};

type ResolvedHand = {
    playerBest: BestFive | null;
    dealerBest: BestFive | null;
    dealerQualified: boolean;
    compare: number;
    folded: boolean;
    blindCategory: FiveCardCategory | null;
    tripsCategory: FiveCardCategory | null;
    sixCardCategory: SixCardBonusCategory | null;
    blindMultiplier: number;
    tripsMultiplier: number;
    sixCardMultiplier: number;
};

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES: Record<Rank, number> = {
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

const MIN_MAIN_BET = 5;
const MIN_SIX_BONUS = 5;
const MAX_SIX_BONUS = 25;
const MAX_TRIPS = 100;
const CARD_REVEAL_DELAY_MS = 280;

const TRIPS_PAYTABLE: Record<string, number> = {
    "Royal Flush": 50,
    "Straight Flush": 40,
    Quads: 30,
    "Full House": 8,
    Flush: 7,
    Straight: 4,
    Trips: 3,
};

const BLIND_PAYTABLE: Record<string, number> = {
    "Royal Flush": 500,
    "Straight Flush": 50,
    Quads: 10,
    "Full House": 3,
    Flush: 1.5,
    Straight: 1,
};

const SIX_CARD_BONUS_PAYTABLE: Record<Exclude<SixCardBonusCategory, "No Bonus">, number> = {
    "6-Card Royal Flush": 10000,
    "6-Card Straight Flush": 5000,
    "Royal Flush": 1000,
    "Straight Flush": 200,
    Quads: 50,
    "Full House": 20,
    Flush: 15,
    Straight: 10,
    Trips: 5,
};

const CARD_BACK_URL =
    "https://png.pngtree.com/png-clipart/20240206/original/pngtree-single-playing-cards-back-on-a-white-background-with-shadow-and-png-image_14247732.png";

const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({
                rank,
                suit,
                value: RANK_VALUES[rank],
                id: `${rank}${suit}`,
            });
        }
    }
    return shuffle(deck);
}

function draw(deck: Card[], count: number): [Card[], Card[]] {
    return [deck.slice(0, count), deck.slice(count)];
}

function combinations<T>(arr: T[], k: number): T[][] {
    const out: T[][] = [];
    const path: T[] = [];

    function helper(start: number) {
        if (path.length === k) {
            out.push([...path]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            path.push(arr[i]);
            helper(i + 1);
            path.pop();
        }
    }

    helper(0);
    return out;
}

function getSortedValues(cards: Card[]) {
    return [...cards].map((c) => c.value).sort((a, b) => b - a);
}

function isFlush(cards: Card[]) {
    return cards.every((c) => c.suit === cards[0].suit);
}

function getStraightHigh(valuesDesc: number[]): number | null {
    const unique = [...new Set(valuesDesc)].sort((a, b) => b - a);
    if (unique.includes(14)) unique.push(1);

    let run = 1;
    for (let i = 0; i < unique.length - 1; i++) {
        if (unique[i] - 1 === unique[i + 1]) {
            run++;
            if (run >= 5) {
                return unique[i - 3];
            }
        } else {
            run = 1;
        }
    }
    return null;
}

function countRanks(cards: Card[]) {
    const map = new Map<number, number>();
    for (const card of cards) {
        map.set(card.value, (map.get(card.value) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return b[0] - a[0];
    });
}

function evaluateFiveCards(cards: Card[]): BestFive {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const valuesDesc = getSortedValues(cards);
    const rankCounts = countRanks(cards);
    const flush = isFlush(cards);
    const straightHigh = getStraightHigh(valuesDesc);

    if (flush && straightHigh) {
        const isRoyal = [14, 13, 12, 11, 10].every((v) => valuesDesc.includes(v));
        if (isRoyal) {
            return { category: "Royal Flush", score: [9], cards: sorted, label: "Royal Flush" };
        }
        return { category: "Straight Flush", score: [8, straightHigh], cards: sorted, label: "Straight Flush" };
    }

    if (rankCounts[0][1] === 4) {
        const quad = rankCounts[0][0];
        const kicker = rankCounts[1][0];
        return { category: "Quads", score: [7, quad, kicker], cards: sorted, label: "Four of a Kind" };
    }

    if (rankCounts[0][1] === 3 && rankCounts[1][1] === 2) {
        return {
            category: "Full House",
            score: [6, rankCounts[0][0], rankCounts[1][0]],
            cards: sorted,
            label: "Full House",
        };
    }

    if (flush) {
        return { category: "Flush", score: [5, ...valuesDesc], cards: sorted, label: "Flush" };
    }

    if (straightHigh) {
        return { category: "Straight", score: [4, straightHigh], cards: sorted, label: "Straight" };
    }

    if (rankCounts[0][1] === 3) {
        const trips = rankCounts[0][0];
        const kickers = rankCounts.slice(1).map(([v]) => v).sort((a, b) => b - a);
        return { category: "Trips", score: [3, trips, ...kickers], cards: sorted, label: "Three of a Kind" };
    }

    if (rankCounts[0][1] === 2 && rankCounts[1][1] === 2) {
        const highPair = Math.max(rankCounts[0][0], rankCounts[1][0]);
        const lowPair = Math.min(rankCounts[0][0], rankCounts[1][0]);
        const kicker = rankCounts[2][0];
        return { category: "Two Pair", score: [2, highPair, lowPair, kicker], cards: sorted, label: "Two Pair" };
    }

    if (rankCounts[0][1] === 2) {
        const pair = rankCounts[0][0];
        const kickers = rankCounts.slice(1).map(([v]) => v).sort((a, b) => b - a);
        return { category: "Pair", score: [1, pair, ...kickers], cards: sorted, label: "Pair" };
    }

    return { category: "High Card", score: [0, ...valuesDesc], cards: sorted, label: "High Card" };
}

function compareBestFive(a: BestFive, b: BestFive) {
    const len = Math.max(a.score.length, b.score.length);
    for (let i = 0; i < len; i++) {
        const av = a.score[i] ?? -1;
        const bv = b.score[i] ?? -1;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

function evaluateBestFrom(cards: Card[]): BestFive {
    const combos = combinations(cards, 5);
    let best = evaluateFiveCards(combos[0]);
    for (let i = 1; i < combos.length; i++) {
        const current = evaluateFiveCards(combos[i]);
        if (compareBestFive(current, best) > 0) best = current;
    }
    return best;
}

function dealerQualifies(cards: Card[]) {
    const best = evaluateBestFrom(cards);
    if (best.category !== "High Card") return true;
    const top = [...best.score];
    return top[1] === 14 && top[2] >= 13;
}

function getAllSameSuit(cards: Card[]) {
    return cards.every((card) => card.suit === cards[0].suit);
}

function isSixCardStraight(cards: Card[]) {
    const unique = [...new Set(cards.map((c) => c.value))].sort((a, b) => b - a);
    if (unique.length !== 6) return false;
    const lowAdjusted = unique.includes(14) ? [...unique, 1].sort((a, b) => b - a) : unique;

    let run = 1;
    for (let i = 0; i < lowAdjusted.length - 1; i++) {
        if (lowAdjusted[i] - 1 === lowAdjusted[i + 1]) run++;
        else run = 1;
        if (run >= 6) return true;
    }
    return false;
}

function isRoyalSet(values: number[]) {
    return [10, 11, 12, 13, 14].every((v) => values.includes(v));
}

function evaluateSixCardBonus(cards: Card[]): { category: SixCardBonusCategory; multiplier: number } {
    const values = cards.map((c) => c.value);
    const sameSuit = getAllSameSuit(cards);
    const sixStraight = isSixCardStraight(cards);

    if (sameSuit && sixStraight && isRoyalSet(values)) {
        return { category: "6-Card Royal Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["6-Card Royal Flush"] };
    }

    if (sameSuit && sixStraight) {
        return { category: "6-Card Straight Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["6-Card Straight Flush"] };
    }

    const bestFive = evaluateBestFrom(cards);

    if (bestFive.category === "Royal Flush") {
        return { category: "Royal Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["Royal Flush"] };
    }
    if (bestFive.category === "Straight Flush") {
        return { category: "Straight Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["Straight Flush"] };
    }
    if (bestFive.category === "Quads") {
        return { category: "Quads", multiplier: SIX_CARD_BONUS_PAYTABLE.Quads };
    }
    if (bestFive.category === "Full House") {
        return { category: "Full House", multiplier: SIX_CARD_BONUS_PAYTABLE["Full House"] };
    }
    if (bestFive.category === "Flush") {
        return { category: "Flush", multiplier: SIX_CARD_BONUS_PAYTABLE.Flush };
    }
    if (bestFive.category === "Straight") {
        return { category: "Straight", multiplier: SIX_CARD_BONUS_PAYTABLE.Straight };
    }
    if (bestFive.category === "Trips") {
        return { category: "Trips", multiplier: SIX_CARD_BONUS_PAYTABLE.Trips };
    }

    return { category: "No Bonus", multiplier: 0 };
}

function getTripsPayout(category: FiveCardCategory, stake: number) {
    const multiplier = TRIPS_PAYTABLE[category] || 0;
    return stake * multiplier;
}

function getBlindPayout(category: FiveCardCategory, stake: number) {
    const multiplier = BLIND_PAYTABLE[category] || 0;
    return stake * multiplier;
}

function initialRound(): RoundState {
    return { deck: [], player: [], dealer: [], board: [], hiddenSixBonusCards: [] };
}

function roundResolvedLike(stage: Stage) {
    return stage === "showdown" || stage === "awaitingBonusReveal" || stage === "roundOver";
}

function sortPaytableDesc(entries: Record<string, number>) {
    return Object.entries(entries).sort((a, b) => b[1] - a[1]);
}

function valueToLabel(value: number) {
    if (value === 14) return "Ace";
    if (value === 13) return "King";
    if (value === 12) return "Queen";
    if (value === 11) return "Jack";
    return String(value);
}

function describeBestHand(best: BestFive | null) {
    if (!best) return "—";

    switch (best.category) {
        case "High Card":
            return `${valueToLabel(best.score[1])} High`;
        case "Pair":
            return `Pair of ${valueToLabel(best.score[1])}s`;
        case "Two Pair":
            return `${valueToLabel(best.score[1])}s and ${valueToLabel(best.score[2])}s`;
        case "Trips":
            return `Three ${valueToLabel(best.score[1])}s`;
        case "Straight":
            return `${valueToLabel(best.score[1])}-High Straight`;
        case "Flush":
            return `${valueToLabel(best.score[1])}-High Flush`;
        case "Full House":
            return `${valueToLabel(best.score[1])}s Full of ${valueToLabel(best.score[2])}s`;
        case "Quads":
            return `Four ${valueToLabel(best.score[1])}s`;
        case "Straight Flush":
            return `${valueToLabel(best.score[1])}-High Straight Flush`;
        case "Royal Flush":
            return "Royal Flush";
        default:
            return best.label;
    }
}

function describeCurrentMadeHand(cards: Card[]) {
    if (cards.length === 0) return "";
    if (cards.length >= 5) {
        return describeBestHand(evaluateBestFrom(cards));
    }

    const rankCounts = countRanks(cards);
    const valuesDesc = getSortedValues(cards);

    if (rankCounts[0][1] === 4) {
        return `Four ${valueToLabel(rankCounts[0][0])}s`;
    }

    if (rankCounts[0][1] === 3 && rankCounts[1]?.[1] === 2) {
        return `${valueToLabel(rankCounts[0][0])}s Full of ${valueToLabel(rankCounts[1][0])}s`;
    }

    if (rankCounts[0][1] === 3) {
        return `Three ${valueToLabel(rankCounts[0][0])}s`;
    }

    if (rankCounts[0][1] === 2 && rankCounts[1]?.[1] === 2) {
        const highPair = Math.max(rankCounts[0][0], rankCounts[1][0]);
        const lowPair = Math.min(rankCounts[0][0], rankCounts[1][0]);
        return `${valueToLabel(highPair)}s and ${valueToLabel(lowPair)}s`;
    }

    if (rankCounts[0][1] === 2) {
        return `Pair of ${valueToLabel(rankCounts[0][0])}s`;
    }

    return `${valueToLabel(valuesDesc[0])} High`;
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
}: {
    card?: Card;
    large?: boolean;
}) {
    const isRed = card?.suit === "♥" || card?.suit === "♦";
    const textColor = isRed ? "text-red-600" : "text-slate-900";
    const sizeClasses = large
        ? "h-[72px] w-[50px] rounded-[11px] sm:h-[82px] sm:w-[58px] sm:rounded-[12px] lg:h-[94px] lg:w-[66px] lg:rounded-[14px]"
        : "h-[62px] w-[44px] rounded-[10px] sm:h-[72px] sm:w-[50px] sm:rounded-[11px] lg:h-[80px] lg:w-[56px] lg:rounded-[12px]";
    const isAce = card?.rank === "A";

    return (
        <div
            className={`relative flex items-center justify-center border font-bold shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${sizeClasses} border-slate-300/90 bg-[linear-gradient(180deg,_#ffffff,_#f4f4f5)]`}
        >
            {!card ? (
                <div className="text-xl text-slate-400 sm:text-2xl">?</div>
            ) : (
                <>
                    <div className={`absolute left-[5px] top-[5px] text-left leading-[0.9] sm:left-[6px] sm:top-[6px] lg:left-[7px] lg:top-[6px] ${textColor}`}>
                        <div className="text-[12px] font-extrabold sm:text-[13px] lg:text-[15px]">{card.rank}</div>
                        <div className="mt-[1px] text-[10px] sm:text-[11px] lg:text-[13px]">{card.suit}</div>
                    </div>

                    <div
                        className={`absolute bottom-[5px] right-[5px] rotate-180 text-left leading-[0.9] sm:bottom-[6px] sm:right-[6px] lg:bottom-[6px] lg:right-[7px] ${textColor}`}
                    >
                        <div className="text-[12px] font-extrabold sm:text-[13px] lg:text-[15px]">{card.rank}</div>
                        <div className="mt-[1px] text-[10px] sm:text-[11px] lg:text-[13px]">{card.suit}</div>
                    </div>

                    {isAce && (
                        <>
                            <div className={`absolute right-[5px] top-[5px] text-center leading-[0.9] sm:right-[6px] sm:top-[6px] lg:right-[7px] lg:top-[6px] ${textColor}`}>
                                <div className="text-[12px] font-extrabold sm:text-[13px] lg:text-[15px]">A</div>
                                <div className="text-[10px] sm:text-[11px] lg:text-[13px]">{card.suit}</div>
                            </div>

                            <div
                                className={`absolute bottom-[5px] left-[5px] rotate-180 text-center leading-[0.9] sm:bottom-[6px] sm:left-[6px] lg:bottom-[6px] lg:left-[7px] ${textColor}`}
                            >
                                <div className="text-[12px] font-extrabold sm:text-[13px] lg:text-[15px]">A</div>
                                <div className="text-[10px] sm:text-[11px] lg:text-[13px]">{card.suit}</div>
                            </div>
                        </>
                    )}

                    <div className={`${textColor} ${isAce ? "text-[24px] sm:text-[27px] lg:text-[30px]" : "text-[18px] sm:text-[21px] lg:text-[24px]"}`}>
                        {card.suit}
                    </div>
                </>
            )}
        </div>
    );
}

function CardBack({ large = false }: { large?: boolean }) {
    const sizeClasses = large
        ? "h-[72px] w-[50px] rounded-[11px] sm:h-[82px] sm:w-[58px] sm:rounded-[12px] lg:h-[94px] lg:w-[66px] lg:rounded-[14px]"
        : "h-[62px] w-[44px] rounded-[10px] sm:h-[72px] w-[50px] sm:rounded-[11px] lg:h-[80px] lg:w-[56px] lg:rounded-[12px]";

    return (
        <div
            className={`relative overflow-hidden border border-white/15 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${sizeClasses}`}
        >
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
}: {
    card?: Card;
    hidden?: boolean;
    large?: boolean;
}) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="[perspective:1000px]"
        >
            <motion.div
                animate={{ rotateY: hidden ? 0 : 180 }}
                transition={{ duration: 0.55, ease: "easeInOut" }}
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
                    <CardFront card={card} large={large} />
                </div>
            </motion.div>
        </motion.div>
    );
}

function CardLane({
    label,
    cards,
    large,
    result,
    hiddenIndexes = [],
}: {
    label: string;
    cards: Array<Card | undefined>;
    large?: boolean;
    result?: string;
    hiddenIndexes?: number[];
}) {
    return (
        <div className="flex min-w-0 flex-col items-center">
            <SectionLabel>{label}</SectionLabel>

            <div className="mt-2 flex max-w-full flex-wrap justify-center gap-1.5 sm:mt-3 sm:gap-2.5">
                <AnimatePresence initial={false}>
                    {cards.map((card, index) => (
                        <motion.div
                            key={`${label}-${index}-${card?.id ?? "empty"}`}
                            layout
                            initial={{ opacity: 0, y: 16, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.92 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="shrink-0"
                        >
                            <CardFace card={card} hidden={hiddenIndexes.includes(index) || !card} large={large} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="mt-2 min-h-[18px] px-2 text-center text-xs font-semibold text-amber-100/95 sm:min-h-[20px] sm:text-sm">
                {result ?? ""}
            </div>
        </div>
    );
}

function InfoCard({
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

function TablePayTable({
    title,
    entries,
    highlightKey,
}: {
    title: string;
    entries: Record<string, number>;
    highlightKey?: string | null;
}) {
    const sorted = sortPaytableDesc(entries);

    return (
        <InfoCard title={title}>
            <div className="overflow-hidden rounded-xl border border-white/10">
                {sorted.map(([hand, payout], idx) => {
                    const isHit = highlightKey === hand;

                    return (
                        <div
                            key={hand}
                            className={`grid grid-cols-[1fr_auto] gap-2 px-2.5 py-2 text-[10px] leading-tight transition sm:px-3 sm:text-[11px] ${isHit
                                ? "border-y border-amber-300/40 bg-amber-300/18 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.35)]"
                                : idx % 2 === 0
                                    ? "bg-white/5"
                                    : "bg-black/20"
                                }`}
                        >
                            <span className={`${isHit ? "font-extrabold text-amber-50" : "text-emerald-50/90"}`}>
                                {hand}
                            </span>
                            <span className="whitespace-nowrap font-semibold text-amber-100">{payout} to 1</span>
                        </div>
                    );
                })}
            </div>
        </InfoCard>
    );
}

function BetInput({
    label,
    value,
    onChange,
    min,
    max,
    disabled,
}: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    min: number;
    max?: number;
    disabled?: boolean;
}) {
    return (
        <div className="rounded-2xl border border-amber-300/15 bg-black/20 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/85 sm:text-[11px] sm:tracking-[0.2em]">
                {label}
            </div>
            <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-white/70">
                    $
                </span>
                <input
                    type="number"
                    min={min}
                    max={max}
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

function InfoButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/35 bg-black/25 text-lg font-extrabold text-amber-100 shadow-lg transition hover:bg-amber-300/15 hover:text-amber-50"
            aria-label="Show Ultimate Texas Hold'em rules"
            title="Rules"
        >
            i
        </button>
    );
}

function RulesModal({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <button
                    className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
                    onClick={onClose}
                    aria-label="Close rules modal"
                />

                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[1.5rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(7,20,14,0.98),_rgba(3,10,7,0.98))] text-white shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90 sm:text-[11px]">
                                Help
                            </div>
                            <div className="mt-1 text-lg font-extrabold text-amber-50 sm:text-2xl">
                                Ultimate Texas Hold&apos;em Rules
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl font-bold text-white/85 transition hover:bg-white/10"
                            aria-label="Close rules modal"
                        >
                            x
                        </button>
                    </div>

                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-4 text-sm leading-6 text-emerald-50/90 sm:text-[15px]">


                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    How the Hand Starts
                                </div>
                                <div className="space-y-2">
                                    <div>• You place an Ante.</div>
                                    <div>• The Blind always matches the Ante exactly.</div>
                                    <div>• Trips is optional from $0 to $100.</div>
                                    <div>• 6 Card Bonus is optional, but if used it must be either $0 or at least $5, up to $25.</div>
                                    <div>• You and the dealer each get 2 cards.</div>
                                    <div>• Four separate hidden cards are also dealt for the 6 Card Bonus feature.</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    Betting Decisions
                                </div>
                                <div className="space-y-2">
                                    <div>• Preflop: you may bet 4x or 3x your Ante, or check.</div>
                                    <div>• After checking, the flop is revealed.</div>
                                    <div>• Flop: you may bet 2x your Ante, or check again.</div>
                                    <div>• After checking again, the turn and river are revealed.</div>
                                    <div>• River: you may bet 1x your Ante, or fold.</div>
                                    <div>• If you fold, Ante, Blind, Play, and Trips (if applicable) lose immediately.</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    Dealer Qualification
                                </div>
                                <div className="space-y-2">
                                    <div>• Dealer qualifies with any Pair or better.</div>
                                    <div>• Dealer also qualifies with Ace-King high.</div>
                                    <div>• If the dealer does not qualify and you win, Ante pushes and Play still wins 1 to 1.</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    Main Bet Resolution
                                </div>
                                <div className="space-y-2">
                                    <div>• If you beat a qualifying dealer, Ante and Play both win 1 to 1.</div>
                                    <div>• If the dealer does not qualify and you win, Ante pushes and Play wins 1 to 1.</div>
                                    <div>• If the hand ties, Ante, Blind, and Play all push.</div>
                                    <div>• If the dealer beats you, Ante, Blind, and Play lose.</div>
                                    <div>• Blind only gets paid extra when your final hand is a Straight or better. Otherwise it pushes on a win.</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    Blind Pay Table
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                    <div>Royal Flush</div>
                                    <div>500 to 1</div>
                                    <div>Straight Flush</div>
                                    <div>50 to 1</div>
                                    <div>Quads</div>
                                    <div>10 to 1</div>
                                    <div>Full House</div>
                                    <div>3 to 1</div>
                                    <div>Flush</div>
                                    <div>1.5 to 1</div>
                                    <div>Straight</div>
                                    <div>1 to 1</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    Trips Side Bet
                                </div>
                                <div className="space-y-2">
                                    <div>• Trips is independent of whether you beat the dealer.</div>
                                    <div>• It pays based on your final 5-card hand.</div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                    <div>Royal Flush</div>
                                    <div>50 to 1</div>
                                    <div>Straight Flush</div>
                                    <div>40 to 1</div>
                                    <div>Quads</div>
                                    <div>30 to 1</div>
                                    <div>Full House</div>
                                    <div>8 to 1</div>
                                    <div>Flush</div>
                                    <div>7 to 1</div>
                                    <div>Straight</div>
                                    <div>4 to 1</div>
                                    <div>Trips</div>
                                    <div>3 to 1</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    6 Card Bonus
                                </div>
                                <div className="space-y-2">
                                    <div>• This bonus uses your 2 hole cards plus the 4 hidden bonus cards.</div>
                                    <div>• It does not use the regular 5-card board.</div>
                                    <div>• The main hand settles first.</div>
                                    <div>• Then you press Reveal 6 Card Bonus to resolve this side bet.</div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                    <div>6-Card Royal Flush</div>
                                    <div>10000 to 1</div>
                                    <div>6-Card Straight Flush</div>
                                    <div>5000 to 1</div>
                                    <div>Royal Flush</div>
                                    <div>1000 to 1</div>
                                    <div>Straight Flush</div>
                                    <div>200 to 1</div>
                                    <div>Quads</div>
                                    <div>50 to 1</div>
                                    <div>Full House</div>
                                    <div>20 to 1</div>
                                    <div>Flush</div>
                                    <div>15 to 1</div>
                                    <div>Straight</div>
                                    <div>10 to 1</div>
                                    <div>Trips</div>
                                    <div>5 to 1</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    Quick Notes
                                </div>
                                <div className="space-y-2">
                                    <div>• Best 5-card poker hand is used for player and dealer.</div>
                                    <div>• Straights can play ace-high or wheel-low where applicable.</div>
                                    <div>• Net result shown by the table is based on total return minus what you committed that hand.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default function UltimateTexasHoldem({ bankroll, setBankroll }: Props) {
    const [stage, setStage] = useState<Stage>("betting");

    const [ante, setAnte] = useState(25);
    const blind = ante;
    const [trips, setTrips] = useState(10);
    const [sixCardBonus, setSixCardBonus] = useState(5);
    const [play, setPlay] = useState(0);

    const [wagerAtDeal, setWagerAtDeal] = useState(0);

    const [pendingSixCardReturn, setPendingSixCardReturn] = useState(0);
    const [pendingSixCardSummary, setPendingSixCardSummary] = useState<string | null>(null);

    const [round, setRound] = useState<RoundState>(initialRound());
    const [message, setMessage] = useState("Set your bets and press Deal.");
    const [payout, setPayout] = useState<PayoutBreakdown | null>(null);
    const [lastDecision, setLastDecision] = useState<Decision | null>(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [resolvedHand, setResolvedHand] = useState<ResolvedHand | null>(null);
    const [showRules, setShowRules] = useState(false);

    const sixBonusResult = useMemo(() => {
        if (round.hiddenSixBonusCards.length !== 4 || round.player.length !== 2) return null;
        return evaluateSixCardBonus([...round.player, ...round.hiddenSixBonusCards]);
    }, [round.hiddenSixBonusCards, round.player]);

    const playerHandText = useMemo(() => {
        const visibleCards = [...round.player, ...round.board];
        return visibleCards.length > 0 ? describeCurrentMadeHand(visibleCards) : "";
    }, [round.player, round.board]);

    const dealerHandText = useMemo(() => {
        if (!roundResolvedLike(stage)) return "";
        const visibleCards = [...round.dealer, ...round.board];
        return visibleCards.length > 0 ? describeCurrentMadeHand(visibleCards) : "";
    }, [round.dealer, round.board, stage]);

    const totalMainWager = ante + blind + trips + sixCardBonus + play;
    const visibleNet = payout ? payout.net : -wagerAtDeal;
    const showFinalNet = stage === "roundOver";

    const blindHighlight =
        resolvedHand && !resolvedHand.folded && resolvedHand.compare > 0 && resolvedHand.blindMultiplier
            ? resolvedHand.blindCategory
            : null;
    const tripsHighlight = resolvedHand?.tripsMultiplier ? resolvedHand.tripsCategory : null;
    const sixCardHighlight =
        stage === "roundOver" && resolvedHand?.sixCardMultiplier ? resolvedHand.sixCardCategory : null;

    const anteResultText = useMemo(() => {
        if (!resolvedHand || !payout) return "Pending";
        if (resolvedHand.folded) return "Lose";
        if (resolvedHand.compare > 0) {
            return resolvedHand.dealerQualified ? "Win 1 to 1" : "Push";
        }
        if (resolvedHand.compare === 0) return "Push";
        return "Lose";
    }, [resolvedHand, payout]);

    const blindResultText = useMemo(() => {
        if (!resolvedHand || !payout) return "Pending";
        if (resolvedHand.folded) return "Lose";
        if (resolvedHand.compare > 0) {
            return resolvedHand.blindMultiplier ? `Win ${resolvedHand.blindMultiplier} to 1` : "Push";
        }
        if (resolvedHand.compare === 0) return "Push";
        return "Lose";
    }, [resolvedHand, payout]);

    const playResultText = useMemo(() => {
        if (!resolvedHand || !payout) return play > 0 ? "Pending" : "No Bet";
        if (resolvedHand.folded) return "Lose";
        if (play === 0) return "No Bet";
        if (resolvedHand.compare > 0) return "Win 1 to 1";
        if (resolvedHand.compare === 0) return "Push";
        return "Lose";
    }, [resolvedHand, payout, play]);

    const tripsResultText = useMemo(() => {
        if (trips <= 0) return "No Bet";
        if (!resolvedHand || !payout) return "Pending";
        return resolvedHand.tripsMultiplier ? `Win ${resolvedHand.tripsMultiplier} to 1` : "Lose";
    }, [resolvedHand, payout, trips]);

    const sixCardResultText = useMemo(() => {
        if (sixCardBonus <= 0) return "No Bet";
        if (stage === "awaitingBonusReveal") return "Pending Reveal";
        if (stage !== "roundOver") return "Pending";
        if (!resolvedHand || !payout) return "Pending";
        return resolvedHand.sixCardMultiplier ? `Win ${resolvedHand.sixCardMultiplier} to 1` : "Lose";
    }, [resolvedHand, payout, stage, sixCardBonus]);

    const settleRound = (playStake: number, folded: boolean, finalRound: RoundState) => {
        const fullBoard = finalRound.board;
        const playerEval = evaluateBestFrom([...finalRound.player, ...fullBoard]);
        const dealerEval = evaluateBestFrom([...finalRound.dealer, ...fullBoard]);
        const dealerQualified = dealerQualifies([...finalRound.dealer, ...fullBoard]);
        const compare = compareBestFive(playerEval, dealerEval);
        const sixBonus = evaluateSixCardBonus([...finalRound.player, ...finalRound.hiddenSixBonusCards]);

        let anteReturn = 0;
        let blindReturn = 0;
        let playReturn = 0;
        let tripsReturn = 0;
        let sixReturn = 0;
        const summary: string[] = [];

        if (!folded) {
            if (compare > 0) {
                if (dealerQualified) {
                    anteReturn = ante * 2;
                    playReturn = playStake * 2;
                    summary.push("Player beats dealer. Ante and Play win 1 to 1.");
                } else {
                    anteReturn = ante;
                    playReturn = playStake * 2;
                    summary.push("Dealer does not qualify. Ante pushes, Play wins 1 to 1.");
                }

                const blindWin = getBlindPayout(playerEval.category, blind);
                blindReturn = blind + blindWin;
                summary.push(
                    blindWin > 0
                        ? `Blind wins ${blindWin / blind} to 1 on ${playerEval.category}.`
                        : "Blind pushes."
                );
            } else if (compare === 0) {
                anteReturn = ante;
                blindReturn = blind;
                playReturn = playStake;
                summary.push("Player and dealer tie. Ante, Blind, and Play push.");
            } else {
                summary.push("Dealer beats player. Ante, Blind, and Play lose.");
            }
        } else {
            summary.push("Player folds. Ante, Blind, and Play lose.");
        }

        const tripsWin = trips > 0 ? getTripsPayout(playerEval.category, trips) : 0;
        if (trips > 0) {
            if (tripsWin > 0) {
                tripsReturn = trips + tripsWin;
                summary.push(`Trips wins ${tripsWin / trips} to 1 on ${playerEval.category}.`);
            } else {
                summary.push("Trips loses.");
            }
        }

        if (sixCardBonus > 0) {
            if (sixBonus.multiplier > 0) {
                sixReturn = sixCardBonus + sixCardBonus * sixBonus.multiplier;
                setPendingSixCardSummary(`6 Card Bonus wins ${sixBonus.multiplier} to 1 on ${sixBonus.category}.`);
            } else {
                setPendingSixCardSummary("6 Card Bonus loses.");
            }
        } else {
            setPendingSixCardSummary(null);
        }

        setResolvedHand({
            playerBest: playerEval,
            dealerBest: dealerEval,
            dealerQualified,
            compare,
            folded,
            blindCategory: playerEval.category,
            tripsCategory: playerEval.category,
            sixCardCategory: sixBonus.category,
            blindMultiplier: BLIND_PAYTABLE[playerEval.category] || 0,
            tripsMultiplier: TRIPS_PAYTABLE[playerEval.category] || 0,
            sixCardMultiplier: sixBonus.multiplier,
        });

        setPendingSixCardReturn(sixReturn);

        const totalReturn = anteReturn + blindReturn + playReturn + tripsReturn;
        const net = totalReturn - wagerAtDeal;

        setBankroll((b) => b + totalReturn);
        setPayout({
            ante: anteReturn,
            blind: blindReturn,
            play: playReturn,
            trips: tripsReturn,
            sixCardBonus: 0,
            total: totalReturn,
            net,
            summary,
        });

        if (sixCardBonus > 0) {
            setStage("awaitingBonusReveal");
            setMessage("Main hand settled. Press Reveal 6 Card Bonus.");
        } else {
            setStage("roundOver");
            setMessage("Round complete.");
        }
    };

    const startRound = () => {
        const normalizedAnte = Math.max(MIN_MAIN_BET, Math.floor(ante / 5) * 5);
        const normalizedBlind = normalizedAnte;
        const normalizedTrips = Math.min(MAX_TRIPS, Math.max(0, Math.floor(trips / 5) * 5));
        const normalizedSix = Math.min(MAX_SIX_BONUS, Math.max(0, Math.floor(sixCardBonus / 5) * 5));

        if (normalizedSix !== 0 && normalizedSix < MIN_SIX_BONUS) {
            setMessage("6 Card Bonus must be 0 or at least $5.");
            return;
        }

        const totalBet = normalizedAnte + normalizedBlind + normalizedTrips + normalizedSix;
        if (bankroll < totalBet) {
            setMessage("Not enough bankroll for those bets.");
            return;
        }

        const deck = createDeck();
        let nextDeck = deck;
        let player: Card[];
        let dealer: Card[];
        let hiddenSix: Card[];

        [player, nextDeck] = draw(nextDeck, 2);
        [dealer, nextDeck] = draw(nextDeck, 2);
        [hiddenSix, nextDeck] = draw(nextDeck, 4);

        setAnte(normalizedAnte);
        setTrips(normalizedTrips);
        setSixCardBonus(normalizedSix);
        setPlay(0);
        setWagerAtDeal(totalBet);
        setPayout(null);
        setResolvedHand(null);
        setLastDecision(null);
        setPendingSixCardReturn(0);
        setPendingSixCardSummary(null);
        setBankroll((b) => b - totalBet);
        setRound({
            deck: nextDeck,
            player,
            dealer,
            board: [],
            hiddenSixBonusCards: hiddenSix,
        });
        setStage("preflop");
        setMessage("Cards dealt. Bet 3x or 4x now, or check.");
    };

    const revealFlop = async () => {
        if (isRevealing) return;

        setIsRevealing(true);
        setLastDecision("check");
        setMessage("Revealing flop...");

        let nextDeck = [...round.deck];
        const [flop, afterFlop] = draw(nextDeck, 3);
        nextDeck = afterFlop;

        setRound((r) => ({ ...r, deck: nextDeck, board: [] }));

        for (let i = 0; i < flop.length; i++) {
            await wait(CARD_REVEAL_DELAY_MS);
            setRound((r) => ({ ...r, board: [...r.board, flop[i]] }));
        }

        setStage("flop");
        setMessage("Flop is out. Bet 2x now, or check.");
        setIsRevealing(false);
    };

    const revealTurnAndRiver = async (goToShowdownAfter: boolean, playStake = play) => {
        if (isRevealing) return;

        setIsRevealing(true);
        setMessage("Revealing turn and river...");

        let nextDeck = [...round.deck];
        const [runout, afterRunout] = draw(nextDeck, 2);
        nextDeck = afterRunout;

        setRound((r) => ({ ...r, deck: nextDeck }));

        for (let i = 0; i < runout.length; i++) {
            await wait(CARD_REVEAL_DELAY_MS);
            setRound((r) => ({ ...r, board: [...r.board, runout[i]] }));
        }

        const finalRound = {
            ...round,
            deck: nextDeck,
            board: [...round.board, ...runout],
        };

        if (goToShowdownAfter) {
            setStage("showdown");
            settleRound(playStake, false, finalRound);
        } else {
            setStage("river");
            setMessage("River is out. Bet 1x now, or fold.");
        }

        setIsRevealing(false);
    };

    const placePlayBet = async (multiplier: number) => {
        if (isRevealing) return;

        const stake = ante * multiplier;
        if (bankroll < stake) {
            setMessage("Not enough bankroll for that play bet.");
            return;
        }

        setBankroll((b) => b - stake);
        setPlay(stake);
        setLastDecision("bet");

        if (stage === "preflop") {
            let nextDeck = [...round.deck];
            const [board, afterBoard] = draw(nextDeck, 5);
            nextDeck = afterBoard;

            const nextRound = { ...round, deck: nextDeck, board };
            setRound(nextRound);
            setStage("showdown");
            setMessage(`Play bet placed for ${multiplier}x. Running out all five board cards.`);
            settleRound(stake, false, nextRound);
            return;
        }

        if (stage === "flop") {
            await revealTurnAndRiver(true, stake);
            return;
        }

        if (stage === "river") {
            setStage("showdown");
            setMessage(`Play bet placed for ${multiplier}x. Settling hand.`);
            settleRound(stake, false, round);
        }
    };

    const revealRiver = async () => {
        setLastDecision("check");
        await revealTurnAndRiver(false);
    };

    const foldHand = () => {
        if (isRevealing) return;
        setPlay(0);
        setLastDecision("fold");
        setStage("showdown");
        setMessage("Player folds.");
        settleRound(0, true, round);
    };

    const revealSixCardBonus = () => {
        if (!payout) return;

        const bonusSummary = pendingSixCardSummary ? [pendingSixCardSummary] : [];
        const updatedTotal = payout.total + pendingSixCardReturn;
        const updatedNet = updatedTotal - (wagerAtDeal + play);

        setBankroll((b) => b + pendingSixCardReturn);
        setPayout({
            ...payout,
            sixCardBonus: pendingSixCardReturn,
            total: updatedTotal,
            net: updatedNet,
            summary: [...payout.summary, ...bonusSummary],
        });
        setPendingSixCardReturn(0);
        setPendingSixCardSummary(null);
        setStage("roundOver");
        setMessage("6 Card Bonus revealed.");
    };

    const resetForNextRound = () => {
        setPlay(0);
        setWagerAtDeal(0);
        setRound(initialRound());
        setPayout(null);
        setResolvedHand(null);
        setStage("betting");
        setMessage("Set your bets and press Deal.");
        setLastDecision(null);
        setPendingSixCardReturn(0);
        setPendingSixCardSummary(null);
        setIsRevealing(false);
    };

    const canAct = !isRevealing;

    const renderActionButtons = () => {
        if (stage === "betting") {
            return <DealButton onClick={startRound} disabled={!canAct} />;
        }

        if (stage === "preflop") {
            return (
                <>
                    <ActionButton onClick={() => void placePlayBet(4)} variant="bet" disabled={!canAct}>
                        Bet 4x
                    </ActionButton>
                    <ActionButton onClick={() => void placePlayBet(3)} variant="bet" disabled={!canAct}>
                        Bet 3x
                    </ActionButton>
                    <ActionButton onClick={() => void revealFlop()} disabled={!canAct}>
                        Check
                    </ActionButton>
                </>
            );
        }

        if (stage === "flop") {
            return (
                <>
                    <ActionButton onClick={() => void placePlayBet(2)} variant="bet" disabled={!canAct}>
                        Bet 2x
                    </ActionButton>
                    <ActionButton onClick={() => void revealRiver()} disabled={!canAct}>
                        Check
                    </ActionButton>
                </>
            );
        }

        if (stage === "river") {
            return (
                <>
                    <ActionButton onClick={() => void placePlayBet(1)} variant="bet" disabled={!canAct}>
                        Bet 1x
                    </ActionButton>
                    <ActionButton onClick={foldHand} variant="danger" disabled={!canAct}>
                        Fold
                    </ActionButton>
                </>
            );
        }

        if (stage === "awaitingBonusReveal") {
            return (
                <ActionButton onClick={revealSixCardBonus} variant="bet" disabled={!canAct}>
                    Reveal 6 Card Bonus
                </ActionButton>
            );
        }

        return (
            <ActionButton onClick={resetForNextRound} variant="success" disabled={!canAct}>
                Next Hand
            </ActionButton>
        );
    };

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_#1f7a45,_#0e4d2d_30%,_#062417_65%,_#020d08_100%)] text-white">
                <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1700px] flex-col gap-3 px-2 py-2 sm:px-3 sm:py-3">
                    <div className="rounded-[1.35rem] border border-amber-300/15 bg-black/25 p-3 shadow-2xl backdrop-blur sm:rounded-[1.7rem] sm:p-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-200/90 sm:text-[12px] sm:tracking-[0.3em]">
                                        Casino Table
                                    </div>
                                    <h2 className="mt-1 text-2xl font-extrabold tracking-[0.02em] text-amber-50 sm:text-4xl md:text-5xl">
                                        Ultimate Texas Hold&apos;em
                                    </h2>
                                </div>

                                <div className="shrink-0 xl:hidden">
                                    <InfoButton onClick={() => setShowRules(true)} />
                                </div>
                            </div>

                            <div className="flex items-start gap-2">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                                    <StatPill label="Bankroll" value={fmt(bankroll)} accent="gold" />
                                    <StatPill label="Stage" value={<span className="capitalize">{stage}</span>} />
                                    <StatPill label="Board" value={`${round.board.length} / 5`} />
                                    <StatPill label="On Table" value={fmt(totalMainWager)} accent="green" />
                                    <StatPill
                                        label="Hand Net"
                                        value={showFinalNet && (wagerAtDeal || play) ? fmt(payout ? payout.net : visibleNet) : "—"}
                                        accent={
                                            showFinalNet && payout
                                                ? payout.net > 0
                                                    ? "green"
                                                    : payout.net < 0
                                                        ? "default"
                                                        : "gold"
                                                : "gold"
                                        }
                                    />
                                </div>

                                <div className="hidden shrink-0 xl:block">
                                    <InfoButton onClick={() => setShowRules(true)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[1.45rem] border border-white/10 bg-black/20 p-2.5 shadow-2xl backdrop-blur sm:rounded-[1.8rem] sm:p-3">
                        <div className="rounded-[1.2rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(0,0,0,0.22),_rgba(0,0,0,0.12))] px-4 py-3 text-center shadow-lg sm:rounded-[1.45rem] sm:px-5 sm:py-4">
                            <div className="flex items-center justify-center gap-2">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200 sm:text-[11px] sm:tracking-[0.24em]">
                                    Table Message
                                </div>
                                <button
                                    onClick={() => setShowRules(true)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/20 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15"
                                    aria-label="Show rules"
                                    title="Rules"
                                >
                                    i
                                </button>
                            </div>

                            <div className="mt-2 text-base font-bold text-amber-50 sm:text-lg md:text-xl">{message}</div>
                        </div>

                        <div className="mt-3 grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
                            <div className="order-3 space-y-3 xl:order-1">
                                <TablePayTable title="Blind Pay Table" entries={BLIND_PAYTABLE} highlightKey={blindHighlight} />
                                <TablePayTable title="Trips Pay Table" entries={TRIPS_PAYTABLE} highlightKey={tripsHighlight} />
                                <TablePayTable
                                    title="6 Card Bonus"
                                    entries={SIX_CARD_BONUS_PAYTABLE}
                                    highlightKey={sixCardHighlight}
                                />
                            </div>

                            <div className="order-1 min-w-0 rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(74,222,128,0.16),_rgba(10,90,60,0.10)_40%,_rgba(0,0,0,0.22)_82%)] p-2.5 sm:rounded-[1.6rem] sm:p-4 xl:order-2">
                                <div className="flex h-full flex-col gap-3 sm:gap-4">
                                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_250px] xl:items-start">
                                        <div className="overflow-hidden rounded-[1rem] border border-white/10 bg-black/10 px-2 py-3 sm:rounded-[1.25rem] sm:px-3 sm:py-4">
                                            <AnimatePresence mode="wait" initial={false}>
                                                {sixCardBonus > 0 && stage === "roundOver" ? (
                                                    <motion.div
                                                        key="bonus-view"
                                                        initial={{ opacity: 0, y: 34, scale: 0.92, filter: "blur(4px)" }}
                                                        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                                        exit={{ opacity: 0, y: -20, scale: 0.97 }}
                                                        transition={{ duration: 0.35, ease: "easeOut" }}
                                                        className="flex flex-col items-center gap-4 py-2 sm:gap-5 sm:py-3"
                                                    >
                                                        <SectionLabel>6 Card Bonus</SectionLabel>

                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.96 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            transition={{ duration: 0.28, delay: 0.08 }}
                                                            className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5"
                                                        >
                                                            <CardFace card={round.player[0]} hidden={!round.player[0]} large />
                                                            <CardFace card={round.player[1]} hidden={!round.player[1]} large />
                                                            <div className="px-1 text-xl font-bold text-amber-200 sm:text-2xl">+</div>

                                                            {Array.from({ length: 4 }).map((_, i) => (
                                                                <motion.div
                                                                    key={`bonus-${i}-${round.hiddenSixBonusCards[i]?.id ?? i}`}
                                                                    initial={{ opacity: 0, y: 18, scale: 0.9 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    transition={{
                                                                        duration: 0.24,
                                                                        delay: 0.16 + i * 0.08,
                                                                        ease: "easeOut",
                                                                    }}
                                                                >
                                                                    <CardFace card={round.hiddenSixBonusCards[i]} hidden={false} large />
                                                                </motion.div>
                                                            ))}
                                                        </motion.div>

                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ duration: 0.24, delay: 0.28 }}
                                                            className="text-center"
                                                        >
                                                            <div className="mt-1 text-lg font-extrabold text-amber-100 sm:text-2xl">
                                                                {sixBonusResult?.category ?? "—"}
                                                            </div>
                                                        </motion.div>
                                                    </motion.div>
                                                ) : (
                                                    <motion.div
                                                        key="main-hand-view"
                                                        initial={{ opacity: 0, y: 22, scale: 0.97 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: -34, scale: 0.92, filter: "blur(4px)" }}
                                                        transition={{ duration: 0.3, ease: "easeOut" }}
                                                        className="flex flex-col gap-4 sm:gap-6"
                                                    >
                                                        <CardLane
                                                            label="Dealer"
                                                            cards={[round.dealer[0], round.dealer[1]]}
                                                            hiddenIndexes={roundResolvedLike(stage) ? [] : [0, 1]}
                                                            large
                                                            result={dealerHandText}
                                                        />

                                                        <CardLane
                                                            label="Board"
                                                            cards={[
                                                                round.board[0],
                                                                round.board[1],
                                                                round.board[2],
                                                                round.board[3],
                                                                round.board[4],
                                                            ]}
                                                            large
                                                        />

                                                        <CardLane
                                                            label="Player"
                                                            cards={[round.player[0], round.player[1]]}
                                                            large
                                                            result={playerHandText}
                                                        />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <div className="rounded-[1rem] border border-amber-300/20 bg-black/25 p-3 shadow-lg xl:sticky xl:top-3">
                                            <div className="mb-2 text-center text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-200 sm:text-[10px] sm:tracking-[0.22em]">
                                                Settle
                                            </div>

                                            <div className="space-y-2">
                                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                    <div className="text-[9px] uppercase tracking-[0.16em] text-white/65 sm:text-[10px] sm:tracking-[0.18em]">
                                                        Player
                                                    </div>
                                                    <div className="mt-1 text-xs font-extrabold text-amber-50 sm:text-sm">
                                                        {resolvedHand?.playerBest ? describeBestHand(resolvedHand.playerBest) : "—"}
                                                    </div>
                                                </div>

                                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                    <div className="text-[9px] uppercase tracking-[0.16em] text-white/65 sm:text-[10px] sm:tracking-[0.18em]">
                                                        Dealer
                                                    </div>
                                                    <div className="mt-1 text-xs font-bold text-white/90 sm:text-sm">
                                                        {resolvedHand?.dealerBest ? describeBestHand(resolvedHand.dealerBest) : "—"}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                                                        <div className="text-[9px] uppercase tracking-[0.16em] text-white/65 sm:text-[10px] sm:tracking-[0.18em]">
                                                            Bet
                                                        </div>
                                                        <div className="mt-1 text-xs font-extrabold text-white sm:text-sm">
                                                            {fmt(wagerAtDeal + play || totalMainWager)}
                                                        </div>
                                                    </div>

                                                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                                                        <div className="text-[9px] uppercase tracking-[0.16em] text-white/65 sm:text-[10px] sm:tracking-[0.18em]">
                                                            Net
                                                        </div>
                                                        <div
                                                            className={`mt-1 text-xs font-extrabold sm:text-sm ${showFinalNet && payout
                                                                ? payout.net > 0
                                                                    ? "text-emerald-300"
                                                                    : payout.net < 0
                                                                        ? "text-red-300"
                                                                        : "text-amber-100"
                                                                : "text-amber-100"
                                                                }`}
                                                        >
                                                            {showFinalNet && payout ? fmt(payout.net) : "—"}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] sm:text-xs">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-white/70">Ante</span>
                                                        <span className="font-bold text-amber-100">{anteResultText}</span>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-white/70">Blind</span>
                                                        <span className="font-bold text-amber-100">{blindResultText}</span>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-white/70">Play</span>
                                                        <span className="font-bold text-amber-100">{playResultText}</span>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-white/70">Trips</span>
                                                        <span className="font-bold text-amber-100">{tripsResultText}</span>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-white/70">6 Card</span>
                                                        <span className="font-bold text-amber-100">{sixCardResultText}</span>
                                                    </div>
                                                </div>

                                                {!payout && (
                                                    <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-emerald-50/90 sm:text-xs">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span>Ante</span>
                                                            <span className="font-bold text-white">{fmt(ante)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span>Blind</span>
                                                            <span className="font-bold text-white">{fmt(blind)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span>Trips</span>
                                                            <span className="font-bold text-white">{fmt(trips)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span>6 Card</span>
                                                            <span className="font-bold text-white">{fmt(sixCardBonus)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span>Play</span>
                                                            <span className="font-bold text-white">{play > 0 ? fmt(play) : "—"}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="sticky bottom-2 z-10 -mx-1 mt-1 rounded-[1.1rem] border border-white/10 bg-black/45 px-2 py-2 backdrop-blur sm:static sm:mx-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                                        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                                            {renderActionButtons()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="order-2 space-y-3 xl:order-3">


                                <InfoCard title="Betting Area">
                                    <div className="space-y-3">
                                        <BetInput
                                            label="Ante"
                                            value={ante}
                                            onChange={setAnte}
                                            min={MIN_MAIN_BET}
                                            disabled={stage !== "betting" || isRevealing}
                                        />

                                        <div className="rounded-2xl border border-amber-300/15 bg-black/20 p-3">
                                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/85 sm:text-[11px] sm:tracking-[0.2em]">
                                                Blind
                                            </div>
                                            <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-base font-bold text-white sm:text-lg">
                                                {fmt(ante)}
                                            </div>
                                        </div>

                                        <BetInput
                                            label="Trips"
                                            value={trips}
                                            onChange={setTrips}
                                            min={0}
                                            max={MAX_TRIPS}
                                            disabled={stage !== "betting" || isRevealing}
                                        />

                                        <BetInput
                                            label="6 Card Bonus"
                                            value={sixCardBonus}
                                            onChange={setSixCardBonus}
                                            min={0}
                                            max={MAX_SIX_BONUS}
                                            disabled={stage !== "betting" || isRevealing}
                                        />

                                        {/* <div className="grid grid-cols-2 gap-2 text-center text-xs text-emerald-50/90 sm:text-sm">
                                            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                                                <div className="font-semibold">Ante / Blind</div>
                                                <div className="mt-1 text-sm font-extrabold sm:text-base">{fmt(ante)}</div>
                                            </div>
                                            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                                                <div className="font-semibold">Trips</div>
                                                <div className="mt-1 text-sm font-extrabold sm:text-base">{fmt(trips)}</div>
                                            </div>
                                            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                                                <div className="font-semibold">6 Card</div>
                                                <div className="mt-1 text-sm font-extrabold sm:text-base">{fmt(sixCardBonus)}</div>
                                            </div>
                                            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                                                <div className="font-semibold">Play</div>
                                                <div className="mt-1 text-sm font-extrabold sm:text-base">{play > 0 ? fmt(play) : "—"}</div>
                                            </div>
                                        </div> */}

                                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-xs text-amber-100/90 sm:text-sm">
                                            {isRevealing
                                                ? "Revealing community cards..."
                                                : stage === "betting"
                                                    ? "Place your bets to begin."
                                                    : stage === "preflop"
                                                        ? "Preflop decision: bet 3x/4x or check."
                                                        : stage === "flop"
                                                            ? "Flop decision: bet 2x or check."
                                                            : stage === "river"
                                                                ? "River decision: bet 1x or fold."
                                                                : stage === "awaitingBonusReveal"
                                                                    ? "Main hand is settled."
                                                                    : "Round finished."}
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-emerald-50/90 sm:text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span>Last action</span>
                                                <span className="font-semibold capitalize text-white">{lastDecision ?? "none"}</span>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <span>Dealer qualifies</span>
                                                <span className="font-semibold text-white">
                                                    {resolvedHand ? (resolvedHand.dealerQualified ? "Yes" : "No") : "—"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </InfoCard>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}