import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import PlayingCard from "../../shared/components/Card";
import type { Card as SharedCard } from "../../shared/lib/cards";
import {
    addChipToStack,
    type ChipDenomination,
    formatMoney,
    buildChipStackFromAmount,
    BTN_GOLD,
    BTN_GREEN,
    BTN_NEUTRAL,
} from "../../shared/lib/money";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { defaultBet, defaultToggle } from "../../shared/state/settings";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import { resultLineClass } from "../../shared/lib/resultTone";
import { TableContext, useBetRecorder } from "../../shared/state/sessionContext";
import { makeRng } from "../../shared/state/progressiveMeter";
import {
    STUD_PROGRESSIVE_BET, STUD_PROGRESSIVE_ROWS, STUD_TIER_NAMES, advanceStudTables, awardStudTier, feedStudMeters,
    readStudMeters, writeStudMeters, type StudMeters, type StudOtherHit,
} from "./studProgressiveLogic";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { rank: Rank; suit: Suit; id: string };
type Stage = "betting" | "third" | "fourth" | "fifth" | "done";
type MainPayKey =
    | "royalFlush" | "straightFlush" | "fourKind" | "fullHouse"
    | "flush" | "straight" | "threeKind" | "twoPair"
    | "highPair" | "midPair" | "push";
type ThreeCardKey = "miniRoyal" | "straightFlush" | "threeKind" | "straight" | "flush" | "pair";
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_BET = 5;
const FELT_COLOR = "#1a6b3a";
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES: Record<Rank, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

const MAIN_PAYTABLE: Record<MainPayKey, number | "push"> = {
    royalFlush: 500, straightFlush: 100, fourKind: 40, fullHouse: 10,
    flush: 6, straight: 4, threeKind: 3, twoPair: 2, highPair: 1,
    midPair: "push", push: "push",
};

const THREE_CARD_PAYTABLE: Record<ThreeCardKey, number> = {
    miniRoyal: 50, straightFlush: 40, threeKind: 30, straight: 6, flush: 4, pair: 1,
};

const METER_TICK_MS = 2500;
const NOTICE_MS = 6000;

const ANTE_KEY = "casino-ms-ante";
const BONUS_KEY = "casino-ms-bonus";

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";
const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
};
const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});

type PayEntry = { label: string; display: string };

const MAIN_PAY_ENTRIES: PayEntry[] = [
    { label: "Royal Flush",     display: "500 to 1" },
    { label: "Straight Flush",  display: "100 to 1" },
    { label: "Four of a Kind",  display: "40 to 1"  },
    { label: "Full House",      display: "10 to 1"  },
    { label: "Flush",           display: "6 to 1"   },
    { label: "Straight",        display: "4 to 1"   },
    { label: "Three of a Kind", display: "3 to 1"   },
    { label: "Two Pair",        display: "2 to 1"   },
    { label: "Jacks or Better", display: "1 to 1"   },
    { label: "Pair of 6s-10s",  display: "Push"  },
];

const THREE_CARD_PAY_ENTRIES: PayEntry[] = [
    { label: "Mini Royal",      display: "50 to 1" },
    { label: "Straight Flush",  display: "40 to 1" },
    { label: "Three of a Kind", display: "30 to 1" },
    { label: "Straight",        display: "6 to 1"  },
    { label: "Flush",           display: "4 to 1"  },
    { label: "Pair",            display: "1 to 1"  },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS)
        for (const rank of RANKS)
            deck.push({ rank, suit, id: `${rank}${suit}-${Math.random().toString(36).slice(2, 7)}` });
    return shuffle(deck);
}

function draw(deck: Card[], count: number): [Card[], Card[]] {
    return [deck.slice(0, count), deck.slice(count)];
}

function toShared(card: Card, faceUp: boolean): SharedCard {
    return {
        id: card.id,
        suit: card.suit as SharedCard["suit"],
        rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"],
        faceUp,
    };
}

function revealedCount(stage: Stage): number {
    if (stage === "fourth") return 1;
    if (stage === "fifth") return 2;
    if (stage === "done") return 3;
    return 0;
}

// ─── Game logic ───────────────────────────────────────────────────────────────

function evaluateFiveCard(cards: Card[]): { key: MainPayKey | null; label: string } {
    const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    const vals = sorted.map(c => RANK_VALUES[c.rank]);
    const suits = sorted.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);
    const uniqueVals = [...new Set(vals)];
    const isStraight = uniqueVals.length === 5 && vals[0] - vals[4] === 4;
    const isWheel = vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2;
    const anyStraight = isStraight || isWheel;

    const counts = new Map<number, number>();
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    const freqs = [...counts.values()].sort((a, b) => b - a);

    if (isFlush && anyStraight) {
        if (!isWheel && vals[0] === 14 && vals[1] === 13) return { key: "royalFlush", label: "Royal Flush" };
        return { key: "straightFlush", label: "Straight Flush" };
    }
    if (freqs[0] === 4) return { key: "fourKind",    label: "Four of a Kind" };
    if (freqs[0] === 3 && freqs[1] === 2) return { key: "fullHouse", label: "Full House" };
    if (isFlush)     return { key: "flush",     label: "Flush" };
    if (anyStraight) return { key: "straight",  label: "Straight" };
    if (freqs[0] === 3) return { key: "threeKind", label: "Three of a Kind" };
    if (freqs[0] === 2 && freqs[1] === 2) return { key: "twoPair", label: "Two Pair" };
    if (freqs[0] === 2) {
        const pairVal = [...counts.entries()].find(([, cnt]) => cnt === 2)![0];
        if (pairVal >= 11) return { key: "highPair", label: "Jacks or Better" };
        if (pairVal >= 6)  return { key: "midPair",  label: "Pair of 6s-10s" };
        return { key: null, label: "No Win" };
    }
    return { key: null, label: "No Win" };
}

function evaluateThreeCardBonus(cards: Card[]): { key: ThreeCardKey | null; label: string; multiplier: number } {
    const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    const vals = sorted.map(c => RANK_VALUES[c.rank]);
    const sameSuit = sorted[0].suit === sorted[1].suit && sorted[1].suit === sorted[2].suit;
    const isTrips = vals[0] === vals[1] && vals[1] === vals[2];
    const isPair  = vals[0] === vals[1] || vals[1] === vals[2];
    const consec  = (vals[0] - vals[1] === 1 && vals[1] - vals[2] === 1) ||
                    (vals[0] === 14 && vals[1] === 3 && vals[2] === 2);

    if (sameSuit && vals[0] === 14 && vals[1] === 13 && vals[2] === 12)
        return { key: "miniRoyal",     label: "Mini Royal",     multiplier: THREE_CARD_PAYTABLE.miniRoyal     };
    if (sameSuit && consec) return { key: "straightFlush", label: "Straight Flush",  multiplier: THREE_CARD_PAYTABLE.straightFlush };
    if (isTrips)            return { key: "threeKind",    label: "Three of a Kind", multiplier: THREE_CARD_PAYTABLE.threeKind    };
    if (consec)             return { key: "straight",     label: "Straight",         multiplier: THREE_CARD_PAYTABLE.straight     };
    if (sameSuit)           return { key: "flush",        label: "Flush",            multiplier: THREE_CARD_PAYTABLE.flush        };
    if (isPair)             return { key: "pair",         label: "Pair",             multiplier: THREE_CARD_PAYTABLE.pair         };
    return                         { key: null,           label: "High Card",        multiplier: 0                                };
}

function settlePayout(params: {
    anteBet: number; thirdBet: number; fourthBet: number; fifthBet: number; threeCBBet: number;
    fiveCardKey: MainPayKey | null; fiveCardLabel: string;
    threeCardKey: ThreeCardKey | null; threeCardLabel: string; threeCardMult: number;
    progressiveBet: number; progressiveReturn: number; progressiveLabel: string;
    folded: boolean;
}): { mainReturn: number; bonusReturn: number; net: number; lines: string[] } {
    const {
        anteBet, thirdBet, fourthBet, fifthBet, threeCBBet,
        fiveCardKey, fiveCardLabel, threeCardKey, threeCardLabel, threeCardMult,
        progressiveBet, progressiveReturn, progressiveLabel, folded,
    } = params;
    const totalMainBets = anteBet + thirdBet + fourthBet + fifthBet;
    const totalWagered  = totalMainBets + threeCBBet + progressiveBet;
    const lines: string[] = [];

    let mainReturn = 0;
    if (!folded) {
        if (fiveCardKey !== null) {
            const mult = MAIN_PAYTABLE[fiveCardKey];
            if (mult === "push") {
                mainReturn = totalMainBets;
                lines.push(`${fiveCardLabel} - Push`);
            } else {
                mainReturn = totalMainBets * (mult + 1);
                lines.push(`${fiveCardLabel} · ${mult} to 1`);
            }
        } else {
            lines.push(fiveCardLabel);
        }
    } else {
        lines.push("Folded");
    }

    let bonusReturn = 0;
    if (threeCBBet > 0) {
        if (threeCardKey !== null) {
            bonusReturn = threeCBBet * (threeCardMult + 1);
            lines.push(`Bonus: ${threeCardLabel} · ${threeCardMult} to 1`);
        } else {
            lines.push("Bonus: No win");
        }
    }

    if (progressiveBet > 0) {
        lines.push(progressiveReturn > 0 ? `Progressive: ${progressiveLabel} pays ${formatMoney(progressiveReturn)}` : "Progressive: No win");
    }

    const net = mainReturn + bonusReturn + progressiveReturn - totalWagered;
    return { mainReturn, bonusReturn, net, lines };
}

// ─── Strategy suggestion ──────────────────────────────────────────────────────

function cardPoints(card: Card): number {
    const v = RANK_VALUES[card.rank];
    if (v >= 11) return 2;
    if (v >= 6)  return 1;
    return 0;
}

function totalPoints(cards: Card[]): number {
    return cards.reduce((s, c) => s + cardPoints(c), 0);
}

function getPairValue(cards: Card[]): number | null {
    const counts = new Map<number, number>();
    for (const c of cards) {
        const v = RANK_VALUES[c.rank];
        counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let highest: number | null = null;
    for (const [v, cnt] of counts) {
        if (cnt >= 2 && (highest === null || v > highest)) {
            highest = v;
        }
    }
    return highest;
}

function countHighCards(cards: Card[]): number {
    return cards.filter(c => RANK_VALUES[c.rank] >= 11).length;
}

function countMidCards(cards: Card[]): number {
    return cards.filter(c => { const v = RANK_VALUES[c.rank]; return v >= 6 && v <= 10; }).length;
}

function allSameSuitCards(cards: Card[]): boolean {
    return cards.every(c => c.suit === cards[0].suit);
}

function straightDrawGaps(cards: Card[]): number | null {
    const vals = [...new Set(cards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => a - b);
    if (vals.length < cards.length) return null;
    const span = vals[vals.length - 1] - vals[0];
    if (span <= 4) return span - (vals.length - 1);
    if (vals.includes(14)) {
        const low = vals.map(v => v === 14 ? 1 : v).sort((a, b) => a - b);
        if (new Set(low).size === low.length) {
            const ls = low[low.length - 1] - low[0];
            if (ls <= 4) return ls - (low.length - 1);
        }
    }
    return null;
}

function drawMinValue(cards: Card[]): number {
    const vals = cards.map(c => RANK_VALUES[c.rank]);
    if (vals.includes(14) && vals.filter(v => v <= 5).length > 0) return 1;
    return Math.min(...vals);
}

function getMSSuggestion(
    visibleCards: Card[],
    stage: Stage,
    anteBet: number,
    thirdBet: number,
    fourthBet: number,
): "fold" | "1x" | "3x" | "max" {
    const pts      = totalPoints(visibleCards);
    const pv       = getPairValue(visibleCards);
    const hasPair  = pv !== null;
    const hasMidPairOrBetter = pv !== null && pv >= 6;
    const hasLowPair         = pv !== null && pv <= 5;
    const highCards = countHighCards(visibleCards);
    const midCards  = countMidCards(visibleCards);
    const suited    = allSameSuitCards(visibleCards);
    const sfGaps    = suited ? straightDrawGaps(visibleCards) : null;
    const sGaps     = straightDrawGaps(visibleCards);
    const minVal    = drawMinValue(visibleCards);
    const hadPrev3x = thirdBet === anteBet * 3 || fourthBet === anteBet * 3;

    const tripCounts = new Map<number, number>();
    for (const c of visibleCards) {
        const v = RANK_VALUES[c.rank];
        tripCounts.set(v, (tripCounts.get(v) ?? 0) + 1);
    }
    const hasTrips = [...tripCounts.values()].some(cnt => cnt >= 3);

    if (stage === "third") {
        if (hasPair) {
            return pv !== null && pv >= 6 ? "max" : "3x";
        }
        if (pts >= 2) return "1x";
        const cardVals = visibleCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => a - b);
        if (suited && cardVals[0] === 5 && cardVals[1] === 6) return "1x";
        return "fold";
    }

    if (stage === "fourth") {
        if (hasTrips || hasMidPairOrBetter) return "max";
        if (suited && highCards === 3) return "3x";
        if (sfGaps === 0 && minVal >= 5) return "3x";
        if (sfGaps === 1 && highCards >= 1) return "3x";
        if (sfGaps === 2 && highCards >= 2) return "3x";
        if (suited) return "1x";
        if (hasLowPair) return "1x";
        if (pts >= 3) return "1x";
        if (sGaps === 0 && minVal >= 4) return "1x";
        if (sGaps === 1 && midCards >= 2) return "1x";
        return "fold";
    }

    if (stage === "fifth") {
        if (hasTrips || hasMidPairOrBetter) return "3x";
        if (suited) return "3x";
        if (sGaps === 0) {
            const maxV = Math.max(...visibleCards.map(c => RANK_VALUES[c.rank]));
            if (maxV >= 8) return "3x";
        }
        if (sGaps !== null) return "1x";
        if (hasLowPair) return "1x";
        if (pts >= 4) return "1x";
        if (midCards >= 3 && hadPrev3x) return "1x";
        return "fold";
    }

    return "fold";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StreetCircle({ label, bet, isCurrent }: { label: string; bet: number; isCurrent?: boolean }) {
    const active = bet > 0;
    const borderClass = isCurrent
        ? "border-amber-400 border-solid"
        : active
        ? "border-amber-300/70 border-dashed"
        : "border-white/20 border-dashed";
    const bgClass = isCurrent
        ? "bg-amber-400/10"
        : active
        ? "bg-amber-500/15"
        : "bg-black/20";
    return (
        <div className="flex flex-col items-center">
            <div
                className={`flex flex-col items-center justify-center rounded-full border-2 transition-colors ${borderClass} ${bgClass}`}
                style={{ width: 70, height: 70 }}
            >
                <span className={`text-[13px] font-extrabold ${active || isCurrent ? "text-amber-200" : "text-white/75"}`}>{label}</span>
                {/* the amount keeps its line when empty, so the label does not shift when the bet goes on */}
                <span className={`mt-0.5 text-[10px] font-bold text-amber-300 ${active ? "" : "invisible"}`}>{formatMoney(bet)}</span>
            </div>
        </div>
    );
}

function MsPayoutColumn({ title, entries, highlight }: { title: string; entries: PayEntry[]; highlight?: string }) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[13px] font-extrabold text-amber-200">
                {title}
            </div>
            {entries.map(({ label, display }) => {
                const hit = highlight === label;
                return (
                    <div key={label} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={hit ? "font-extrabold text-amber-100" : "text-white/75"}>{label}</span>
                        <span className={`shrink-0 font-bold text-gold`}>{display}</span>
                    </div>
                );
            })}
        </div>
    );
}

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;

    const Section = ({ title, items }: { title: string; items: string[] }) => (
        <section>
            <h3 className="mb-2 text-amber-300">{title}</h3>
            <ul className="flex flex-col gap-1.5">
                {items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-white/90">
                        <span className="mt-[3px] shrink-0 text-amber-400/60">•</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </section>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-[4px] border border-[#5a9471] bg-[#0a2916] p-6">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-gold-soft">
                        Mississippi Stud Rules
                    </h2>
                    <button
                        onClick={onClose}
                        className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-white/15 bg-white/8 text-sm text-white transition hover:bg-white/15"
                        aria-label="Close rules"
                    >
                        ×
                    </button>
                </div>
                <div className="flex flex-col gap-5">
                    <Section title="How the Hand Works" items={[
                        "Place your Ante before the deal. The 3 Card Bonus is an optional side bet.",
                        "You receive 2 private hole cards face up. Three community cards are dealt face down.",
                        "Community cards are revealed one at a time — 3rd Street, 4th Street, and 5th Street.",
                        "At each street you must Fold, Bet 1× your Ante, or Bet 3× your Ante.",
                        "Your final 5-card hand (2 hole cards + 3 community cards) is evaluated against the paytable.",
                    ]} />
                    <Section title="Betting and Folding" items={[
                        "Folding forfeits your Ante and all street bets already placed.",
                        "The 3 Card Bonus settles regardless of whether you fold.",
                        "Each individual bet (Ante, 3rd, 4th, 5th) is paid at the same paytable multiplier.",
                        "Maximum exposure is 10× your Ante (Ante + 3× on each of 3 streets).",
                    ]} />
                    <Section title="Paytable" items={[
                        "Royal Flush pays 500 to 1.",
                        "Straight Flush pays 100 to 1.",
                        "Four of a Kind pays 40 to 1.",
                        "Full House pays 10 to 1.",
                        "Flush pays 6 to 1.",
                        "Straight pays 4 to 1.",
                        "Three of a Kind pays 3 to 1.",
                        "Two Pair pays 2 to 1.",
                        "Pair of Jacks or Better pays 1 to 1.",
                        "Pair of 6s through 10s pushes — all bets returned with no profit.",
                        "All other hands lose.",
                    ]} />
                    <Section title="Progressive" items={[
                        "A $5 bet, switched on with the red light before the deal. Settings decides whether it starts on.",
                        "It pays on your two cards and the three community cards, three of a kind or better. The $5 is not returned.",
                        "Royal Flush wins the Mega meter, Straight Flush the Major, Four of a Kind the Minor. Full House pays $250, Flush $200, Straight $150, Three of a Kind $45.",
                        "It stays in action if you fold, so all five cards still count.",
                        "Players at other tables feed the meters and can win them, even while you are away.",
                    ]} />
                    <Section title="3 Card Bonus" items={[
                        "Evaluates the three community cards as a 3-card poker hand.",
                        "Settled when all 3 community cards are revealed, regardless of fold.",
                        "Mini Royal (suited A-K-Q) pays 50 to 1.",
                        "Straight Flush 40 to 1 · Three of a Kind 30 to 1 · Straight 6 to 1 · Flush 4 to 1 · Pair 1 to 1.",
                    ]} />
                    <Section title="Strategy Tips" items={[
                        "Always bet 3× with a pair of 6s or better, any three to a royal flush, or three to a straight flush.",
                        "Bet 1× with any hidden pair below 6s, three to a flush, or three to a straight.",
                        "Fold with no made hand and no draw after 3rd Street if your best card is below a 6.",
                    ]} />
                </div>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MississippiStud({ bankroll, setBankroll }: Props) {
    // for the yearly stats: each bet on its own, as the hand settles
    const recordBet = useBetRecorder();
    const reportBets = (b: Parameters<typeof settlePayout>[0], r: ReturnType<typeof settlePayout>) => {
        recordBet("Ante and streets", b.anteBet + b.thirdBet + b.fourthBet + b.fifthBet, r.mainReturn, b.fiveCardLabel);
        recordBet("3 Card Bonus", b.threeCBBet, r.bonusReturn, b.threeCardLabel);
        recordBet("Progressive", b.progressiveBet, b.progressiveReturn, b.progressiveLabel);
    };
    // two decks take turns, gold backs then purple: every hand is dealt from the other deck
    const [deckNo, setDeckNo] = useState(0);
    const [stage, setStage]                   = useState<Stage>("betting");

    // The progressive: a $5 light, and meters shared with the other linked tables, which play on
    // the real clock. They catch up when this table is on screen; a hidden table does nothing.
    const [progressiveOn, setProgressiveOn] = useState(() => defaultToggle("mississippistud", "progressive"));
    const [progressiveBet, setProgressiveBet] = useState(0);
    const [progressiveReturn, setProgressiveReturn] = useState(0);
    const [progressiveHitKey, setProgressiveHitKey] = useState<string | null>(null);
    const [meters, setMeters] = useState<StudMeters>(readStudMeters);
    const metersRef = useRef(meters);
    useEffect(() => { metersRef.current = meters; writeStudMeters(meters); }, [meters]);
    const [otherHit, setOtherHit] = useState<StudOtherHit | null>(null);
    useEffect(() => { if (!otherHit) return; const id = window.setTimeout(() => setOtherHit(null), NOTICE_MS); return () => window.clearTimeout(id); }, [otherHit]);
    const [jackpotWin, setJackpotWin] = useState<{ title: string; amount: number } | null>(null);
    useEffect(() => { if (!jackpotWin) return; const id = window.setTimeout(() => setJackpotWin(null), NOTICE_MS); return () => window.clearTimeout(id); }, [jackpotWin]);
    const tableActive = useContext(TableContext)?.active ?? true;
    useEffect(() => {
        if (!tableActive) return;
        const rng = makeRng(Date.now());
        const tick = () => {
            const next: { meters: StudMeters; hit: StudOtherHit | null } = advanceStudTables(metersRef.current, rng);
            if (next.meters !== metersRef.current) { metersRef.current = next.meters; setMeters(next.meters); }
            if (next.hit) setOtherHit(next.hit);
        };
        tick();
        const id = window.setInterval(tick, METER_TICK_MS);
        return () => window.clearInterval(id);
    }, [tableActive]);
    const [deck, setDeck]                     = useState<Card[]>(() => createDeck());
    const [playerCards, setPlayerCards]       = useState<Card[]>([]);
    const [communityCards, setCommunityCards] = useState<Card[]>([]);

    const [anteBet, setAnteBet]     = useState(0);
    const [thirdBet, setThirdBet]   = useState(0);
    const [fourthBet, setFourthBet] = useState(0);
    const [fifthBet, setFifthBet]   = useState(0);
    const [threeCBBet, setThreeCBBet] = useState(0);
    const [mainReturn, setMainReturn]   = useState(0);
    const [bonusReturn, setBonusReturn] = useState(0);
    const [resultLines, setResultLines] = useState<string[]>([]);
    const [netResult, setNetResult]     = useState<number | null>(null);

    const [fiveCardResult, setFiveCardResult]   = useState<{ key: MainPayKey | null; label: string } | null>(null);
    const [threeCardResult, setThreeCardResult] = useState<{ key: ThreeCardKey | null; label: string } | null>(null);

    const [anteChips, setAnteChips]   = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("mississippistud", "ante")));
    const [bonusChips, setBonusChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("mississippistud", "bonus")));
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(5);
    const [selectedZone, setSelectedZone] = useState<"ante" | "bonus">("ante");
    const [showRules, setShowRules] = useState(false);
    const resolving = useRef(false);

    const pendingAnte  = anteChips.reduce((s, d) => s + Number(d), 0);
    const pendingBonus = bonusChips.reduce((s, d) => s + Number(d), 0);
    const pendingProgressive = progressiveOn ? STUD_PROGRESSIVE_BET : 0;

    useEffect(() => { window.localStorage.setItem(ANTE_KEY, String(pendingAnte)); }, [pendingAnte]);
    useEffect(() => { window.localStorage.setItem(BONUS_KEY, String(pendingBonus)); }, [pendingBonus]);

    // ─── Bet helpers ──────────────────────────────────────────────────────────

    function addChip(zone: "ante" | "bonus", chip: ChipDenomination) {
        if (stage !== "betting") return;
        if (zone === "ante") setAnteChips(p => addChipToStack(p, chip));
        else setBonusChips(p => addChipToStack(p, chip));
    }

    function removeLastChip(zone: "ante" | "bonus") {
        if (stage !== "betting") return;
        if (zone === "ante") setAnteChips(p => p.slice(0, -1));
        else setBonusChips(p => p.slice(0, -1));
    }

    // Clicking a spot only highlights it
    function handleZoneClick(zone: "ante" | "bonus") {
        if (stage !== "betting") return;
        setSelectedZone(zone);
    }

    // Tray chip goes onto the highlighted spot
    function handleChipSelect(chip: ChipDenomination) {
        setSelectedChip(chip);
        addChip(selectedZone, chip);
    }

    function handleClear() {
        setAnteChips([]);
        setBonusChips([]);
        setProgressiveOn(false);
        setSelectedZone("ante");
    }

    // Reset: back to the bets saved in Settings
    function handleReset() {
        setAnteChips(buildChipStackFromAmount(defaultBet("mississippistud", "ante")));
        setBonusChips(buildChipStackFromAmount(defaultBet("mississippistud", "bonus")));
        setProgressiveOn(defaultToggle("mississippistud", "progressive"));
        setSelectedZone("ante");
    }

    // ─── Game actions ─────────────────────────────────────────────────────────

    // What the progressive pays on all five cards, played or folded. A meter that is won starts again.
    function settleProgressive() {
        const none = { progressiveBet, progressiveReturn: 0, progressiveLabel: "" };
        if (progressiveBet <= 0) return none;
        const row = STUD_PROGRESSIVE_ROWS.find((r) => r.key === evaluateFiveCard([...playerCards, ...communityCards]).key);
        if (!row) return none;
        setProgressiveHitKey(row.key);
        if (!row.tier) return { progressiveBet, progressiveReturn: row.pays ?? 0, progressiveLabel: row.label };
        const won = awardStudTier(metersRef.current, row.tier);
        metersRef.current = won.meters;
        setMeters(won.meters);
        setJackpotWin({ title: `${STUD_TIER_NAMES[row.tier]} Jackpot`, amount: won.amount });
        return { progressiveBet, progressiveReturn: won.amount, progressiveLabel: row.label };
    }

    function handleDeal() {
        if (pendingAnte < MIN_BET || bankroll < pendingAnte + pendingBonus + pendingProgressive) return;
        setBankroll(p => p - (pendingAnte + pendingBonus + pendingProgressive));
        setProgressiveBet(pendingProgressive);
        if (progressiveOn) setMeters((m) => feedStudMeters(m));

        setDeckNo((n) => n + 1);
        // every hand comes from the other deck, freshly shuffled
        const d = createDeck();
        const [pCards, d1] = draw(d, 2);
        const [cCards, d2] = draw(d1, 3);

        setAnteBet(pendingAnte);
        setThreeCBBet(pendingBonus);
        setThirdBet(0);
        setFourthBet(0);
        setFifthBet(0);
        setMainReturn(0);
        setBonusReturn(0);
        setProgressiveReturn(0);
        setProgressiveHitKey(null);
        setResultLines([]);
        setNetResult(null);
        setFiveCardResult(null);
        setThreeCardResult(null);
        setPlayerCards(pCards);
        setCommunityCards(cCards);
        setDeck(d2);
        setStage("third");
    }

    function handleBetStreet(multiple: 1 | 3) {
        if (resolving.current) return;
        const betAmount = anteBet * multiple;
        if (bankroll < betAmount) return;
        resolving.current = true;
        setBankroll(p => p - betAmount);

        if (stage === "third") {
            setThirdBet(betAmount);
            setStage("fourth");
            resolving.current = false;
        } else if (stage === "fourth") {
            setFourthBet(betAmount);
            setStage("fifth");
            resolving.current = false;
        } else if (stage === "fifth") {
            setFifthBet(betAmount);
            const fc = evaluateFiveCard([...playerCards, ...communityCards]);
            const tc = evaluateThreeCardBonus(communityCards);
            const betsAtSettle = {
                anteBet, thirdBet, fourthBet, fifthBet: betAmount,
                threeCBBet, fiveCardKey: fc.key, fiveCardLabel: fc.label,
                threeCardKey: tc.key, threeCardLabel: tc.label, threeCardMult: tc.multiplier,
                ...settleProgressive(),
                folded: false,
            };
        const settled = settlePayout(betsAtSettle);
        reportBets(betsAtSettle, settled);
            setBankroll(p => p + settled.mainReturn + settled.bonusReturn + betsAtSettle.progressiveReturn);
            setMainReturn(settled.mainReturn);
            setBonusReturn(settled.bonusReturn);
        setProgressiveReturn(betsAtSettle.progressiveReturn);
            setResultLines(settled.lines);
            setNetResult(settled.net);
            setFiveCardResult(fc);
            setThreeCardResult(tc);
            setStage("done");
            resolving.current = false;
        }
    }

    function handleFold() {
        if (resolving.current) return;
        resolving.current = true;
        const tc = communityCards.length === 3 ? evaluateThreeCardBonus(communityCards) : { key: null as ThreeCardKey | null, label: "High Card", multiplier: 0 };
        const betsAtSettle = {
            anteBet, thirdBet, fourthBet, fifthBet: 0,
            threeCBBet, fiveCardKey: null, fiveCardLabel: "Folded",
            threeCardKey: tc.key, threeCardLabel: tc.label, threeCardMult: tc.multiplier,
            ...settleProgressive(),
            folded: true,
        };
        const settled = settlePayout(betsAtSettle);
        reportBets(betsAtSettle, settled);
        setBankroll(p => p + settled.mainReturn + settled.bonusReturn + betsAtSettle.progressiveReturn);
        setMainReturn(settled.mainReturn);
        setBonusReturn(settled.bonusReturn);
        setProgressiveReturn(betsAtSettle.progressiveReturn);
        setResultLines(settled.lines);
        setNetResult(settled.net);
        setFiveCardResult(null);
        setThreeCardResult(tc);
        setStage("done");
        resolving.current = false;
    }

    function handleChangeBet() {
        if (deck.length < 10) setDeck(createDeck());
        setPlayerCards([]);
        setCommunityCards([]);
        setAnteBet(0);
        setThirdBet(0);
        setFourthBet(0);
        setFifthBet(0);
        setThreeCBBet(0);
        setMainReturn(0);
        setBonusReturn(0);
        setProgressiveReturn(0);
        setProgressiveHitKey(null);
        setResultLines([]);
        setNetResult(null);
        setFiveCardResult(null);
        setThreeCardResult(null);
        setSelectedZone("ante");
        setStage("betting");
    }

    function handleClearAndReset() {
        setAnteChips([]);
        setBonusChips([]);
        setProgressiveOn(false);
        setPlayerCards([]);
        setCommunityCards([]);
        setAnteBet(0);
        setThirdBet(0);
        setFourthBet(0);
        setFifthBet(0);
        setThreeCBBet(0);
        setMainReturn(0);
        setBonusReturn(0);
        setProgressiveReturn(0);
        setProgressiveHitKey(null);
        setResultLines([]);
        setNetResult(null);
        setFiveCardResult(null);
        setThreeCardResult(null);
        setSelectedZone("ante");
        setStage("betting");
    }

    function handleMaxBet() {
        if (resolving.current) return;

        const remaining = stage === "third" ? 3 : 2;
        const totalCost = anteBet * 3 * remaining;
        if (bankroll < totalCost) return;

        resolving.current = true;
        setBankroll(p => p - totalCost);

        const newThird  = stage === "third" ? anteBet * 3 : thirdBet;
        const newFourth = anteBet * 3;
        const newFifth  = anteBet * 3;

        setThirdBet(newThird);
        setFourthBet(newFourth);
        setFifthBet(newFifth);

        const fc = evaluateFiveCard([...playerCards, ...communityCards]);
        const tc = evaluateThreeCardBonus(communityCards);
        const betsAtSettle = {
            anteBet,
            thirdBet: newThird,
            fourthBet: newFourth,
            fifthBet: newFifth,
            threeCBBet,
            fiveCardKey: fc.key,
            fiveCardLabel: fc.label,
            threeCardKey: tc.key,
            threeCardLabel: tc.label,
            threeCardMult: tc.multiplier,
            ...settleProgressive(),
                folded: false,
        };
        const settled = settlePayout(betsAtSettle);
        reportBets(betsAtSettle, settled);

        setBankroll(p => p + settled.mainReturn + settled.bonusReturn + betsAtSettle.progressiveReturn);
        setMainReturn(settled.mainReturn);
        setBonusReturn(settled.bonusReturn);
        setProgressiveReturn(betsAtSettle.progressiveReturn);
        setResultLines(settled.lines);
        setNetResult(settled.net);
        setFiveCardResult(fc);
        setThreeCardResult(tc);
        setStage("done");
        resolving.current = false;
    }

    // ─── Derived ──────────────────────────────────────────────────────────────

    const totalMainBets = anteBet + thirdBet + fourthBet + fifthBet;
    const totalWagered  = stage === "betting"
        ? pendingAnte + pendingBonus + pendingProgressive
        : anteBet + threeCBBet + progressiveBet + thirdBet + fourthBet + fifthBet;
    const totalReturned = mainReturn + bonusReturn + progressiveReturn;
    const canDeal       = pendingAnte >= MIN_BET && bankroll >= pendingAnte + pendingBonus + pendingProgressive;
    const progressiveLit = stage === "betting" ? progressiveOn : progressiveBet > 0;

    const visibleCardsForSuggestion = useMemo(() => {
        if (stage === "third")  return playerCards;
        if (stage === "fourth") return [...playerCards, ...communityCards.slice(0, 1)];
        if (stage === "fifth")  return [...playerCards, ...communityCards.slice(0, 2)];
        return [];
    }, [stage, playerCards, communityCards]);

    const suggestion = useMemo(() => {
        if (!["third", "fourth", "fifth"].includes(stage)) return null;
        if (visibleCardsForSuggestion.length < 2) return null;
        return getMSSuggestion(visibleCardsForSuggestion, stage, anteBet, thirdBet, fourthBet);
    }, [visibleCardsForSuggestion, stage, anteBet, thirdBet, fourthBet]);

    const netColor      = netResult !== null
        ? netResult > 0 ? "text-emerald-300" : netResult < 0 ? "text-red-300" : "text-amber-100"
        : "text-white";

    // ─── Action bar ───────────────────────────────────────────────────────────

    const actionBar = (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
            <ChipTray selectedChip={selectedChip} onSelect={handleChipSelect} disabled={stage !== "betting"} />

            <div className="flex items-center justify-center gap-3">
                <AnimatePresence mode="popLayout" initial={false}>
                    {stage === "betting" && (
                        <SlideBtn key="clear">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={handleClear} disabled={pendingAnte === 0 && pendingBonus === 0 && !progressiveOn}>Clear</button>
                        </SlideBtn>
                    )}
                    {stage === "betting" && (
                        <SlideBtn key="reset">
                            <button data-hotkey="E" className={BTN_NEUTRAL} onClick={handleReset}>Reset</button>
                        </SlideBtn>
                    )}
                    {stage === "betting" && (
                        <SlideBtn key="deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                        <SlideBtn key={`fold-${stage}`}>
                            <button data-hotkey="F" className={BTN_NEUTRAL} onClick={handleFold} disabled={resolving.current}>Fold</button>
                        </SlideBtn>
                    )}
                    {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                        <SlideBtn key={`one-${stage}`}>
                            <button data-hotkey="1" className={BTN_NEUTRAL} onClick={() => handleBetStreet(1)} disabled={resolving.current}>Bet 1×</button>
                        </SlideBtn>
                    )}
                    {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                        <SlideBtn key={`three-${stage}`}>
                            <button data-hotkey="3" className={BTN_GOLD} onClick={() => handleBetStreet(3)} disabled={resolving.current}>Bet 3×</button>
                        </SlideBtn>
                    )}
                    {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                        <SlideBtn key={`max-${stage}`}>
                            <button data-hotkey="M"
                                className={BTN_GREEN}
                                onClick={handleMaxBet}
                                disabled={
                                    stage === "fifth" ||
                                    resolving.current ||
                                    bankroll < anteBet * 3 * (stage === "third" ? 3 : 2)
                                }
                            >
                                Max Bet
                            </button>
                        </SlideBtn>
                    )}
                    {stage === "done" && (
                        <SlideBtn key="clear-done">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={handleClearAndReset}>Clear</button>
                        </SlideBtn>
                    )}
                    {stage === "done" && (
                        <SlideBtn key="change">
                            <button data-hotkey="B" className={BTN_NEUTRAL} onClick={handleChangeBet}>Change Bet</button>
                        </SlideBtn>
                    )}
                    {stage === "done" && (
                        <SlideBtn key="rebet">
                            <button data-hotkey="Space" data-hotkey-alt="Enter"
                                className={BTN_GOLD}
                                onClick={handleDeal}
                                disabled={pendingAnte < MIN_BET || bankroll < pendingAnte + pendingBonus}
                            >
                                Rebet & Deal
                            </button>
                        </SlideBtn>
                    )}
                </AnimatePresence>
            </div>

            <div className="invisible hidden sm:block">
                <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
            </div>
        </div>
    );

    // ─── JSX ─────────────────────────────────────────────────────────────────

    const playerNotes = (
        <>
            {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                <div className="text-sm font-bold text-white/90">
                    {stage === "third" ? "3rd Street - Bet or Fold" : stage === "fourth" ? "4th Street - Bet or Fold" : "5th Street - Bet or Fold"}
                </div>
            )}
            {suggestion && (
                <div
                    className={`flex items-center gap-1.5 rounded-[2px] border px-3 py-1 text-sm font-bold ${
                        suggestion === "max" || suggestion === "3x"
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                            : suggestion === "1x"
                            ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                            : "border-red-400/30 bg-red-500/10 text-red-300"
                    }`}
                >
                    <span className="text-[13px] opacity-70">Suggest</span>
                    <span>{suggestion === "max" ? "Max Bet" : suggestion === "3x" ? "Bet 3×" : suggestion === "1x" ? "Bet 1×" : "Fold"}</span>
                </div>
            )}
            {stage === "done" && fiveCardResult && <div className={`text-sm font-extrabold ${netColor}`}>{fiveCardResult.label}</div>}
            {/* a line that only repeats the hand name above is left out */}
            {stage === "done" && resultLines.map((line, i) => line === fiveCardResult?.label ? null : (
                <div key={i} className={`text-[11px] font-bold ${resultLineClass(line)}`}>{line}</div>
            ))}
        </>
    );

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            {jackpotWin && (
                <div className="pointer-events-none fixed left-1/2 top-[30%] z-40 -translate-x-1/2 rounded-[4px] border-2 border-amber-300 bg-black/85 px-8 py-5 text-center" role="status" data-testid="jackpot-win">
                    <div className="text-sm font-extrabold uppercase tracking-wide text-amber-200">{jackpotWin.title}</div>
                    <div className="mt-1 text-3xl font-extrabold tabular-nums text-amber-100">{formatMoney(jackpotWin.amount)}</div>
                </div>
            )}
            <TableShell deckNo={deckNo}
                feltColor={FELT_COLOR}
                gameName="Mississippi Stud"
                bankroll={bankroll}
                hideHeader
                actionBar={actionBar}
            >
                {/* Table label */}
                <div className="flex flex-col items-center gap-0.5">
                    <div className="flex items-center gap-2">
                        <h1
                            className="text-center text-2xl font-bold text-gold-soft"
                        >
                            Mississippi Stud
                        </h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>PAIRS 6–10 PUSH</span>
                        <span className="text-white/75">·</span>
                        <span>Jacks or better wins</span>
                        <span className="text-white/75">·</span>
                        <span>Fold any street to cut losses</span>
                    </div>
                </div>

                {/* Three-column layout */}
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* Left column — main paytable (desktop only) */}
                    <div className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:justify-center">
                        <MsPayoutColumn
                            title="Mississippi Stud"
                            entries={MAIN_PAY_ENTRIES}
                            highlight={fiveCardResult?.label}
                        />
                    </div>

                    {/* Center column — gameplay */}
                    <div className="w-full lg:flex-1 flex flex-col items-center gap-2 py-2">

                        {/* BetBar */}
                        <BetBar
                            pendingBet={totalWagered}
                            returned={totalReturned}
                            net={netResult ?? 0}
                            showResult={stage === "done"}
                        />

                        {/* Community cards */}
                        <div className="flex flex-col items-center gap-1">
                            <div className="text-[13px] font-bold text-white/75">
                                Community Cards
                            </div>
                            <div className="flex flex-row-reverse gap-2">
                                {stage === "betting"
                                    ? [0, 1, 2].map(i => (
                                        <div
                                            key={i}
                                            className={`${CARD_CLS} flex items-end justify-center rounded-[10px] border border-dashed border-white/15 bg-white/5 pb-1 sm:rounded-[12px]`}
                                        >
                                            <span className="text-[10px] text-white/75">{["3rd", "4th", "5th"][i]}</span>
                                        </div>
                                    ))
                                    : communityCards.map((card, i) => (
                                        <motion.div
                                            key={`${deckNo}-${card.id}`}
                                            variants={CARD_VARIANTS}
                                            initial="initial"
                                            animate="animate"
                                            transition={CARD_TRANSITION(i * 0.08)}
                                        >
                                            <PlayingCard
                                                card={toShared(card, i < revealedCount(stage))}
                                                className={CARD_CLS}
                                            />
                                        </motion.div>
                                    ))
                                }
                            </div>
                            <div className="flex flex-row-reverse gap-2">
                                {["3rd St", "4th St", "5th St"].map((lbl, i) => (
                                    <div key={lbl} className="w-[56px] text-center sm:w-[66px]">
                                        <span className={`text-[13px] font-bold ${
                                            stage !== "betting" && i < revealedCount(stage)
                                                ? "text-amber-200"
                                                : "text-white/75"
                                        }`}>{lbl}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="h-px w-full max-w-[280px] bg-white/10" />

                        {/* Player hole cards */}
                        <div className="flex flex-col items-center gap-1">
                            <div className="text-[13px] font-bold text-white/75">
                                Your Hand
                            </div>
                            <div className="relative">
                            <div className="flex gap-2">
                                {stage === "betting"
                                    ? [0, 1].map(i => (
                                        <div
                                            key={i}
                                            className={`${CARD_CLS} rounded-[10px] border border-dashed border-white/15 bg-white/5 sm:rounded-[12px]`}
                                        />
                                    ))
                                    : playerCards.map((card, i) => (
                                        <motion.div
                                            key={`${deckNo}-${card.id}`}
                                            variants={CARD_VARIANTS}
                                            initial="initial"
                                            animate="animate"
                                            transition={CARD_TRANSITION(i * 0.08 + 0.24)}
                                        >
                                            <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                        </motion.div>
                                    ))
                                }
                            </div>
                            {/* what to do, and then how the hand came out: beside the cards, so nothing moves */}
                            <div data-side-notes className="absolute left-full top-0 ml-4 hidden h-full flex-col items-start justify-center gap-1 whitespace-nowrap lg:flex">{playerNotes}</div>
                            </div>
                        </div>

                        {/* Bet circles, with the $5 progressive light set above and between them, as on
                            a real felt. The light floats, so it adds no height. */}
                        <div className="relative flex items-end justify-center gap-12 mt-14">
                            <button
                                onClick={() => stage === "betting" && setProgressiveOn((on) => !on)}
                                disabled={stage !== "betting"}
                                aria-pressed={progressiveLit}
                                aria-label={`Progressive, ${formatMoney(STUD_PROGRESSIVE_BET)}`}
                                title="Progressive"
                                data-hotkey="J"
                                data-jackpot-light
                                data-lit={progressiveLit ? "true" : "false"}
                                className={`absolute left-1/2 -top-8 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border-2 transition-colors ${progressiveLit ? "border-white" : "border-white/45 hover:border-white"}`}
                                style={{ background: progressiveLit ? "#ef2a2a" : "#3a0f0f", outline: progressiveReturn > 0 ? "3px solid #fbbf24" : undefined, outlineOffset: 2 }}
                            >
                                <span className={`text-[10px] font-extrabold ${progressiveLit ? "text-white" : "text-white/75"}`}>${STUD_PROGRESSIVE_BET}</span>
                            </button>
                            <BetSpot
                                testId="bonus"
                                dim={64}
                                floatChips
                                chips={stage === "betting" ? bonusChips : buildChipStackFromAmount(threeCBBet)}
                                totalBet={stage === "betting" ? pendingBonus : threeCBBet}
                                label="Bonus"
                                sublabel="3 card"
                                isSelected={selectedZone === "bonus"}
                                isWinner={threeCBBet > 0 && bonusReturn > threeCBBet}
                                isLocked={stage !== "betting"}
                                onSelect={() => handleZoneClick("bonus")}
                                onRemove={() => removeLastChip("bonus")}
                                canBet={stage === "betting"}
                                diamond={true}
                            />
                            <BetSpot
                                testId="ante"
                                dim={70}
                                floatChips
                                chips={stage === "betting" ? anteChips : buildChipStackFromAmount(anteBet)}
                                totalBet={stage === "betting" ? pendingAnte : anteBet}
                                label="Ante"
                                sublabel="min $5"
                                isSelected={selectedZone === "ante"}
                                isWinner={mainReturn > totalMainBets}
                                isLocked={stage !== "betting"}
                                onSelect={() => handleZoneClick("ante")}
                                onRemove={() => removeLastChip("ante")}
                                canBet={stage === "betting"}
                            />
                        </div>

                        {/* Street circles */}
                        <div className="flex gap-3">
                            <StreetCircle label="3rd" bet={thirdBet} isCurrent={stage === "third"} />
                            <StreetCircle label="4th" bet={fourthBet} isCurrent={stage === "fourth"} />
                            <StreetCircle label="5th" bet={fifthBet} isCurrent={stage === "fifth"} />
                        </div>

                        {/* on phones the notes get a reserved row here: on desktop they sit beside the cards */}
                        <div className="flex min-h-[84px] flex-col items-center gap-1 text-center lg:hidden">{playerNotes}</div>

                    </div>

                    {/* Right column — 3CB paytable (desktop only) */}
                    <div className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:justify-center">
                        <div className="mb-2 rounded-[4px] border border-red-500/70 px-2 pb-1" data-testid="stud-progressive">
                            <div className="flex flex-col gap-1 pt-1.5">
                                {/* the heading; when another table wins, it says so here for a moment, in the same space */}
                                <div className={`h-[18px] truncate text-center font-extrabold leading-[18px] ${otherHit ? "text-[11px] text-red-200" : "text-[13px] text-amber-200"}`} data-testid="other-win">
                                    {otherHit ? `Another table won the ${STUD_TIER_NAMES[otherHit.tier]}: ${formatMoney(otherHit.amount)}` : "Progressive ($5)"}
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-center">
                                    {(["mega", "major", "minor"] as const).map((tier) => (
                                        <div key={tier} className="flex flex-col leading-tight">
                                            <span className="text-[10px] font-bold text-white/80">{STUD_TIER_NAMES[tier]}</span>
                                            <span className="text-[12px] font-bold tabular-nums text-red-400" data-meter={tier}>{formatMoney(meters[tier])}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 border-t border-red-500/30 pt-1">
                                    {STUD_PROGRESSIVE_ROWS.map((r) => {
                                        const isHit = r.key === progressiveHitKey;
                                        return (
                                            <div key={r.key} className={`flex items-center justify-between gap-1.5 rounded px-1 text-[11px] ${isHit ? "bg-amber-300/12" : ""}`} data-progressive-row={r.key}>
                                                <span className={isHit ? "text-amber-100 [text-shadow:0_0_0.6px_currentColor,0_0_0.6px_currentColor]" : "text-white/75"}>{r.label}</span>
                                                <span className="shrink-0 font-bold text-gold">{r.tier ? STUD_TIER_NAMES[r.tier] : formatMoney(r.pays ?? 0).replace(".00", "")}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <MsPayoutColumn
                            title="3 Card Bonus"
                            entries={THREE_CARD_PAY_ENTRIES}
                            highlight={threeCardResult?.label}
                        />
                    </div>

                </div>
            </TableShell>
        </>
    );
}
