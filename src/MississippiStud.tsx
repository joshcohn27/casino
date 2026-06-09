import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import {
    type ChipDenomination,
    formatMoney,
    CHIP_COLORS,
    buildChipStackFromAmount,
    BTN_GOLD,
    BTN_GREEN,
    BTN_NEUTRAL,
} from "./shared/money";
import { SlideBtn } from "./shared/SlideBtn";

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
const STACK_GAP = 9;

type PayEntry = { label: string; display: string };

const MAIN_PAY_ENTRIES: PayEntry[] = [
    { label: "Royal Flush",     display: "500:1" },
    { label: "Straight Flush",  display: "100:1" },
    { label: "Four of a Kind",  display: "40:1"  },
    { label: "Full House",      display: "10:1"  },
    { label: "Flush",           display: "6:1"   },
    { label: "Straight",        display: "4:1"   },
    { label: "Three of a Kind", display: "3:1"   },
    { label: "Two Pair",        display: "2:1"   },
    { label: "Jacks or Better", display: "1:1"   },
    { label: "Pair of 6s–10s",  display: "Push"  },
];

const THREE_CARD_PAY_ENTRIES: PayEntry[] = [
    { label: "Mini Royal",      display: "50:1" },
    { label: "Straight Flush",  display: "40:1" },
    { label: "Three of a Kind", display: "30:1" },
    { label: "Straight",        display: "6:1"  },
    { label: "Flush",           display: "4:1"  },
    { label: "Pair",            display: "1:1"  },
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

function readStored(key: string, fallback: number): number {
    if (typeof window === "undefined") return fallback;
    const v = Number(window.localStorage.getItem(key));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
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
        if (pairVal >= 6)  return { key: "midPair",  label: "Pair of 6s–10s" };
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
    folded: boolean;
}): { mainReturn: number; bonusReturn: number; net: number; lines: string[] } {
    const {
        anteBet, thirdBet, fourthBet, fifthBet, threeCBBet,
        fiveCardKey, fiveCardLabel, threeCardKey, threeCardLabel, threeCardMult, folded,
    } = params;
    const totalMainBets = anteBet + thirdBet + fourthBet + fifthBet;
    const totalWagered  = totalMainBets + threeCBBet;
    const lines: string[] = [];

    let mainReturn = 0;
    if (!folded) {
        if (fiveCardKey !== null) {
            const mult = MAIN_PAYTABLE[fiveCardKey];
            if (mult === "push") {
                mainReturn = totalMainBets;
                lines.push(`${fiveCardLabel} — Push`);
            } else {
                mainReturn = totalMainBets * (mult + 1);
                lines.push(`${fiveCardLabel} · ${mult}:1`);
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
            lines.push(`Bonus: ${threeCardLabel} · ${threeCardMult}:1`);
        } else {
            lines.push("Bonus: No win");
        }
    }

    const net = mainReturn + bonusReturn - totalWagered;
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
    for (const [v, cnt] of counts) {
        if (cnt >= 2) return v;
    }
    return null;
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
        if (hasMidPairOrBetter) return "max";
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
        if (hasMidPairOrBetter) return "3x";
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

function ChipStack({ chips, onClick }: { chips: ChipDenomination[]; onClick: () => void }) {
    const visible  = chips.slice(-3);
    const startIdx = chips.length - visible.length;
    const stackH   = 52 + (visible.length > 0 ? (visible.length - 1) * STACK_GAP : 0);
    return (
        <div
            className="relative flex cursor-pointer justify-center"
            style={{ width: 52, height: stackH, marginBottom: -20, zIndex: 10 }}
            onClick={onClick}
        >
            <AnimatePresence>
                {visible.map((denom, i) => {
                    const cfg = CHIP_COLORS[denom];
                    return (
                        <motion.div
                            key={startIdx + i}
                            className="absolute left-0 right-0 mx-auto flex h-[48px] w-[48px] select-none items-center justify-center rounded-full text-[10px] font-extrabold"
                            style={{
                                bottom: i * STACK_GAP, zIndex: i + 1,
                                backgroundColor: cfg.bg,
                                border: `3px solid ${cfg.border}`,
                                color: cfg.text,
                                boxShadow: "inset 0 1px 3px rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.18), 0 5px 14px rgba(0,0,0,0.5)",
                            }}
                            initial={{ opacity: 0, y: -22, scale: 0.72 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.8 }}
                            transition={{ type: "spring", stiffness: 420, damping: 22 }}
                        >
                            {cfg.label}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

function BetZone({ chips, totalBet, label, sublabel, isSelected, isWinner, isLocked, onClick, onRemove, canBet, diamond }: {
    chips: ChipDenomination[]; totalBet: number; label: string; sublabel: string;
    isSelected: boolean; isWinner: boolean; isLocked?: boolean;
    onClick: () => void; onRemove: () => void; canBet: boolean; diamond?: boolean;
}) {
    const dim = diamond ? 64 : 70;
    const ring = isWinner   ? "border-amber-300/80 shadow-[0_0_28px_rgba(251,191,36,0.35)]"
               : isSelected ? "border-white/60 shadow-[0_0_16px_rgba(255,255,255,0.2)]"
               :              "border-white/30";
    const bg   = isWinner   ? "bg-amber-300/10"
               : isSelected ? "bg-white/10"
               :              "bg-black/20";
    return (
        <div
            className={`flex flex-col items-center ${diamond ? "mx-4 mb-4" : ""}`}
            style={{ position: "relative" }}
        >
            <div style={{
                position: "absolute",
                bottom: dim - 10,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10,
                pointerEvents: chips.length > 0 ? "auto" : "none",
            }}>
                {chips.length > 0 && (
                    <ChipStack chips={chips} onClick={onRemove} />
                )}
            </div>
            <button
                onClick={onClick}
                disabled={!canBet || !!isLocked}
                className={`relative flex flex-col items-center justify-center border-2 border-dashed backdrop-blur-sm transition-all duration-200 ${ring} ${bg}`}
                style={{ width: dim, height: dim, transform: diamond ? "rotate(45deg)" : undefined, borderRadius: diamond ? "6px" : "9999px" }}
            >
                <div style={{ transform: diamond ? "rotate(-45deg)" : undefined }} className="flex flex-col items-center justify-center gap-0.5 px-3 py-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">{label}</span>
                    <span className="mt-0.5 text-[10px] font-medium text-white/45">{sublabel}</span>
                    {totalBet > 0 && (
                        <span className="mt-1 text-[10px] font-extrabold text-amber-200">{formatMoney(totalBet)}</span>
                    )}
                </div>
            </button>
        </div>
    );
}

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
                <span className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${active || isCurrent ? "text-amber-200" : "text-white/30"}`}>{label}</span>
                {active && <span className="mt-0.5 text-[10px] font-bold text-amber-300">{formatMoney(bet)}</span>}
            </div>
        </div>
    );
}

function BetBar({ pendingBet, returned, net, showResult }: {
    pendingBet: number; returned: number; net: number; showResult: boolean;
}) {
    const netColor = net > 0 ? "text-emerald-300" : net < 0 ? "text-red-300" : "text-amber-100";
    return (
        <div className="flex items-center justify-center gap-6 rounded-xl border border-white/10 bg-black/30 px-6 py-2.5">
            {[
                { label: "Bet",      val: pendingBet > 0 ? formatMoney(pendingBet) : "—", color: "text-white" },
                { label: "Returned", val: showResult ? formatMoney(returned) : "—",       color: "text-white" },
                { label: "Net",      val: showResult ? (net >= 0 ? "+" : "") + formatMoney(net) : "—", color: showResult ? netColor : "text-white" },
            ].map(({ label, val, color }, i, arr) => (
                <React.Fragment key={label}>
                    <div className="text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{label}</div>
                        <div className={`mt-0.5 text-sm font-extrabold ${color}`}>{val}</div>
                    </div>
                    {i < arr.length - 1 && <div className="h-6 w-px bg-white/10" />}
                </React.Fragment>
            ))}
        </div>
    );
}

function MsPayoutColumn({ title, entries, highlight }: { title: string; entries: PayEntry[]; highlight?: string }) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">
                {title}
            </div>
            {entries.map(({ label, display }) => {
                const hit = highlight === label;
                return (
                    <div key={label} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={hit ? "font-extrabold text-amber-100" : "text-white/45"}>{label}</span>
                        <span className={`shrink-0 font-bold ${hit ? "text-amber-300" : "text-white/35"}`}>{display}</span>
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
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-300/80">{title}</h3>
            <ul className="flex flex-col gap-1.5">
                {items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-white/65">
                        <span className="mt-[3px] shrink-0 text-amber-400/60">•</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </section>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-base font-extrabold uppercase tracking-[0.15em] text-amber-100">
                        Mississippi Stud Rules
                    </h2>
                    <button
                        onClick={onClose}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/8 text-sm text-white transition hover:bg-white/15"
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
                    <Section title="3 Card Bonus" items={[
                        "Evaluates the three community cards as a 3-card poker hand.",
                        "Settled when all 3 community cards are revealed, regardless of fold.",
                        "Mini Royal (suited A-K-Q) pays 50 to 1.",
                        "Straight Flush 40:1 · Three of a Kind 30:1 · Straight 6:1 · Flush 4:1 · Pair 1:1.",
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
    const [stage, setStage]                   = useState<Stage>("betting");
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

    const [anteChips, setAnteChips]   = useState<ChipDenomination[]>(() => buildChipStackFromAmount(readStored(ANTE_KEY, 0)));
    const [bonusChips, setBonusChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(readStored(BONUS_KEY, 0)));
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(5);
    const [selectedZone, setSelectedZone] = useState<"ante" | "bonus">("ante");
    const [showRules, setShowRules] = useState(false);
    const resolving = useRef(false);

    const pendingAnte  = anteChips.reduce((s, d) => s + Number(d), 0);
    const pendingBonus = bonusChips.reduce((s, d) => s + Number(d), 0);

    useEffect(() => { window.localStorage.setItem(ANTE_KEY, String(pendingAnte)); }, [pendingAnte]);
    useEffect(() => { window.localStorage.setItem(BONUS_KEY, String(pendingBonus)); }, [pendingBonus]);

    // ─── Bet helpers ──────────────────────────────────────────────────────────

    function addChip(zone: "ante" | "bonus") {
        if (stage !== "betting") return;
        if (zone === "ante") setAnteChips(p => [...p, selectedChip]);
        else setBonusChips(p => [...p, selectedChip]);
    }

    function removeLastChip(zone: "ante" | "bonus") {
        if (stage !== "betting") return;
        if (zone === "ante") setAnteChips(p => p.slice(0, -1));
        else setBonusChips(p => p.slice(0, -1));
    }

    function handleZoneClick(zone: "ante" | "bonus") {
        if (stage !== "betting") return;
        if (zone === "ante") {
            setSelectedZone("ante");
            addChip("ante");
        } else {
            if (selectedZone === "bonus") addChip("bonus");
            else setSelectedZone("bonus");
        }
    }

    function handleClear() {
        setAnteChips([]);
        setBonusChips([]);
        setSelectedZone("ante");
    }

    // ─── Game actions ─────────────────────────────────────────────────────────

    function handleDeal() {
        if (pendingAnte < MIN_BET || bankroll < pendingAnte + pendingBonus) return;
        setBankroll(p => p - (pendingAnte + pendingBonus));

        const d = deck.length < 10 ? createDeck() : deck;
        const [pCards, d1] = draw(d, 2);
        const [cCards, d2] = draw(d1, 3);

        setAnteBet(pendingAnte);
        setThreeCBBet(pendingBonus);
        setThirdBet(0);
        setFourthBet(0);
        setFifthBet(0);
        setMainReturn(0);
        setBonusReturn(0);
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
            const settled = settlePayout({
                anteBet, thirdBet, fourthBet, fifthBet: betAmount,
                threeCBBet, fiveCardKey: fc.key, fiveCardLabel: fc.label,
                threeCardKey: tc.key, threeCardLabel: tc.label, threeCardMult: tc.multiplier,
                folded: false,
            });
            setBankroll(p => p + settled.mainReturn + settled.bonusReturn);
            setMainReturn(settled.mainReturn);
            setBonusReturn(settled.bonusReturn);
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
        const settled = settlePayout({
            anteBet, thirdBet, fourthBet, fifthBet: 0,
            threeCBBet, fiveCardKey: null, fiveCardLabel: "Folded",
            threeCardKey: tc.key, threeCardLabel: tc.label, threeCardMult: tc.multiplier,
            folded: true,
        });
        setBankroll(p => p + settled.mainReturn + settled.bonusReturn);
        setMainReturn(settled.mainReturn);
        setBonusReturn(settled.bonusReturn);
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
        setPlayerCards([]);
        setCommunityCards([]);
        setAnteBet(0);
        setThirdBet(0);
        setFourthBet(0);
        setFifthBet(0);
        setThreeCBBet(0);
        setMainReturn(0);
        setBonusReturn(0);
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
        const settled = settlePayout({
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
            folded: false,
        });

        setBankroll(p => p + settled.mainReturn + settled.bonusReturn);
        setMainReturn(settled.mainReturn);
        setBonusReturn(settled.bonusReturn);
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
        ? pendingAnte + pendingBonus
        : anteBet + threeCBBet + thirdBet + fourthBet + fifthBet;
    const totalReturned = mainReturn + bonusReturn;
    const canDeal       = pendingAnte >= MIN_BET && bankroll >= pendingAnte + pendingBonus;

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
        <div className="flex flex-col gap-2 border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
            {stage === "betting" && (
                <ChipTray selectedChip={selectedChip} onSelect={setSelectedChip} />
            )}

            <div className={`flex items-center justify-center gap-3 ${stage !== "betting" ? "col-span-full" : ""}`}>
                <AnimatePresence mode="popLayout" initial={false}>
                    {stage === "betting" && (pendingAnte > 0 || pendingBonus > 0) && (
                        <SlideBtn key="clear">
                            <button className={BTN_NEUTRAL} onClick={handleClear}>Clear</button>
                        </SlideBtn>
                    )}
                    {stage === "betting" && (
                        <SlideBtn key="deal">
                            <button className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                        <SlideBtn key="fold">
                            <button className={BTN_NEUTRAL} onClick={handleFold} disabled={resolving.current}>Fold</button>
                        </SlideBtn>
                    )}
                    {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                        <SlideBtn key="one">
                            <button className={BTN_NEUTRAL} onClick={() => handleBetStreet(1)} disabled={resolving.current}>Bet 1×</button>
                        </SlideBtn>
                    )}
                    {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                        <SlideBtn key="three">
                            <button className={BTN_GOLD} onClick={() => handleBetStreet(3)} disabled={resolving.current}>Bet 3×</button>
                        </SlideBtn>
                    )}
                    {(stage === "third" || stage === "fourth") && (
                        <SlideBtn key="max">
                            <button
                                className={BTN_GREEN}
                                onClick={handleMaxBet}
                                disabled={resolving.current || bankroll < anteBet * 3 * (stage === "third" ? 3 : 2)}
                            >
                                Max Bet
                            </button>
                        </SlideBtn>
                    )}
                    {stage === "done" && (
                        <SlideBtn key="clear-done">
                            <button className={BTN_NEUTRAL} onClick={handleClearAndReset}>Clear</button>
                        </SlideBtn>
                    )}
                    {stage === "done" && (
                        <SlideBtn key="change">
                            <button className={BTN_NEUTRAL} onClick={handleChangeBet}>Change Bet</button>
                        </SlideBtn>
                    )}
                    {stage === "done" && (
                        <SlideBtn key="rebet">
                            <button
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

            {stage === "betting" && (
                <div className="invisible hidden sm:block">
                    <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
                </div>
            )}
        </div>
    );

    // ─── JSX ─────────────────────────────────────────────────────────────────

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell
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
                            className="text-xl font-extrabold uppercase tracking-[0.18em] text-amber-100/90"
                            style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                        >
                            Mississippi Stud
                        </h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/25 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[10px] font-bold tracking-[0.15em] text-white/35">
                        <span>PAIRS 6–10 PUSH</span>
                        <span className="text-white/20">·</span>
                        <span>JACKS OR BETTER WINS</span>
                        <span className="text-white/20">·</span>
                        <span>FOLD ANY STREET TO CUT LOSSES</span>
                    </div>
                </div>

                {/* Three-column layout */}
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* Left column — main paytable (desktop only) */}
                    <div className="hidden lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:justify-center">
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
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                                Community Cards
                            </div>
                            <div className="flex gap-2">
                                {stage === "betting"
                                    ? [0, 1, 2].map(i => (
                                        <div
                                            key={i}
                                            className={`${CARD_CLS} flex items-end justify-center rounded-[10px] border border-dashed border-white/15 bg-white/5 pb-1 sm:rounded-[12px]`}
                                        >
                                            <span className="text-[10px] text-white/30">{["3rd", "4th", "5th"][i]}</span>
                                        </div>
                                    ))
                                    : communityCards.map((card, i) => (
                                        <motion.div
                                            key={card.id}
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
                            <div className="flex gap-2">
                                {["3rd St", "4th St", "5th St"].map((lbl, i) => (
                                    <div key={lbl} className="w-[56px] text-center sm:w-[66px]">
                                        <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                                            stage !== "betting" && i < revealedCount(stage)
                                                ? "text-amber-200/60"
                                                : "text-white/25"
                                        }`}>{lbl}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="h-px w-full max-w-[280px] bg-white/10" />

                        {/* Player hole cards */}
                        <div className="flex flex-col items-center gap-1">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                                Your Hand
                            </div>
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
                                            key={card.id}
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
                        </div>

                        {/* Hand eval label */}
                        <AnimatePresence>
                            {stage === "done" && fiveCardResult && (
                                <motion.div
                                    key="hand-eval"
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={`text-sm font-extrabold ${netColor}`}
                                >
                                    {fiveCardResult.label}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Bet circles — Ante and 3CB side by side */}
                        <div className="flex items-end justify-center gap-6 mt-14">
                            <BetZone
                                chips={stage === "betting" ? bonusChips : buildChipStackFromAmount(threeCBBet)}
                                totalBet={stage === "betting" ? pendingBonus : threeCBBet}
                                label="BONUS"
                                sublabel="3 card"
                                isSelected={selectedZone === "bonus"}
                                isWinner={threeCBBet > 0 && bonusReturn > threeCBBet}
                                isLocked={stage !== "betting"}
                                onClick={() => handleZoneClick("bonus")}
                                onRemove={() => removeLastChip("bonus")}
                                canBet={stage === "betting"}
                                diamond={true}
                            />
                            <BetZone
                                chips={stage === "betting" ? anteChips : buildChipStackFromAmount(anteBet)}
                                totalBet={stage === "betting" ? pendingAnte : anteBet}
                                label="Ante"
                                sublabel="min $5"
                                isSelected={selectedZone === "ante"}
                                isWinner={mainReturn > totalMainBets}
                                isLocked={stage !== "betting"}
                                onClick={() => handleZoneClick("ante")}
                                onRemove={() => removeLastChip("ante")}
                                canBet={stage === "betting"}
                            />
                        </div>

                        {/* Street circles */}
                        <div className="flex gap-3">
                            <StreetCircle label="3RD" bet={thirdBet} isCurrent={stage === "third"} />
                            <StreetCircle label="4TH" bet={fourthBet} isCurrent={stage === "fourth"} />
                            <StreetCircle label="5TH" bet={fifthBet} isCurrent={stage === "fifth"} />
                        </div>

                        {/* Street message */}
                        <AnimatePresence>
                            {(stage === "third" || stage === "fourth" || stage === "fifth") && (
                                <motion.div
                                    key="street-msg"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50"
                                >
                                    {stage === "third"
                                        ? "3rd Street — Bet or Fold"
                                        : stage === "fourth"
                                        ? "4th Street — Bet or Fold"
                                        : "5th Street — Bet or Fold"}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Strategy suggestion */}
                        <AnimatePresence>
                            {suggestion && (
                                <motion.div
                                    key="ms-suggest"
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-extrabold ${
                                        suggestion === "max"
                                            ? "border-sky-400/40 bg-sky-500/15 text-sky-300"
                                            : suggestion === "3x"
                                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                                            : suggestion === "1x"
                                            ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                                            : "border-red-400/30 bg-red-500/10 text-red-300"
                                    }`}
                                >
                                    <span className="text-[10px] uppercase tracking-[0.15em] opacity-70">Suggest</span>
                                    <span>{suggestion === "max" ? "Max Bet" : suggestion === "3x" ? "Bet 3×" : suggestion === "1x" ? "Bet 1×" : "Fold"}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Result lines */}
                        {stage === "done" && resultLines.length > 0 && (
                            <div className="flex flex-col items-center gap-1 text-center">
                                {resultLines.map((line, i) => (
                                    <div
                                        key={i}
                                        className={`text-[11px] font-bold ${i === 0 ? netColor : "text-white/55"}`}
                                    >
                                        {line}
                                    </div>
                                ))}
                            </div>
                        )}

                    </div>

                    {/* Right column — 3CB paytable (desktop only) */}
                    <div className="hidden lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:justify-center">
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
