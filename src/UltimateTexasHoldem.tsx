import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination, formatMoney, CHIP_COLORS, BTN_GOLD, BTN_GREEN } from "./shared/money";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { rank: Rank; suit: Suit; value: number; id: string; };
type Stage = "betting" | "preflop" | "flop" | "river" | "showdown" | "awaitingBonusReveal" | "roundOver";
type Decision = "check" | "bet" | "fold";
type FiveCardCategory = "High Card" | "Pair" | "Two Pair" | "Trips" | "Straight" | "Flush" | "Full House" | "Quads" | "Straight Flush" | "Royal Flush";
type BestFive = { category: FiveCardCategory; score: number[]; cards: Card[]; label: string; };
type SixCardBonusCategory = "No Bonus" | "Trips" | "Straight" | "Flush" | "Full House" | "Quads" | "Straight Flush" | "Royal Flush" | "6-Card Straight Flush" | "6-Card Royal Flush";
type RoundState = { deck: Card[]; player: Card[]; dealer: Card[]; board: Card[]; hiddenSixBonusCards: Card[]; };
type PayoutBreakdown = { ante: number; blind: number; play: number; trips: number; sixCardBonus: number; total: number; net: number; summary: string[]; };
type ResolvedHand = { playerBest: BestFive | null; dealerBest: BestFive | null; dealerQualified: boolean; compare: number; folded: boolean; blindCategory: FiveCardCategory | null; tripsCategory: FiveCardCategory | null; sixCardCategory: SixCardBonusCategory | null; blindMultiplier: number; tripsMultiplier: number; sixCardMultiplier: number; };
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>>; };

// ─── Constants ────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES: Record<Rank, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
const MIN_MAIN_BET = 5;
const MIN_SIX_BONUS = 5;
const MAX_SIX_BONUS = 25;
const MAX_TRIPS = 100;
const CARD_REVEAL_DELAY_MS = 280;

const TRIPS_PAYTABLE: Record<string, number> = { "Royal Flush": 50, "Straight Flush": 40, Quads: 30, "Full House": 8, Flush: 7, Straight: 4, Trips: 3 };
const BLIND_PAYTABLE: Record<string, number> = { "Royal Flush": 500, "Straight Flush": 50, Quads: 10, "Full House": 3, Flush: 1.5, Straight: 1 };
const SIX_CARD_BONUS_PAYTABLE: Record<Exclude<SixCardBonusCategory, "No Bonus">, number> = {
    "6-Card Royal Flush": 10000, "6-Card Straight Flush": 5000, "Royal Flush": 1000, "Straight Flush": 200,
    Quads: 50, "Full House": 20, Flush: 15, Straight: 10, Trips: 5,
};

// ─── Game functions (all preserved exactly) ───────────────────────────────────

function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

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
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit, value: RANK_VALUES[rank], id: `${rank}${suit}` });
    return shuffle(deck);
}

function draw(deck: Card[], count: number): [Card[], Card[]] { return [deck.slice(0, count), deck.slice(count)]; }

function combinations<T>(arr: T[], k: number): T[][] {
    const out: T[][] = [], path: T[] = [];
    function helper(start: number) {
        if (path.length === k) { out.push([...path]); return; }
        for (let i = start; i < arr.length; i++) { path.push(arr[i]); helper(i + 1); path.pop(); }
    }
    helper(0); return out;
}

function getSortedValues(cards: Card[]) { return [...cards].map(c => c.value).sort((a, b) => b - a); }
function isFlush(cards: Card[]) { return cards.every(c => c.suit === cards[0].suit); }

function getStraightHigh(valuesDesc: number[]): number | null {
    const unique = [...new Set(valuesDesc)].sort((a, b) => b - a);
    if (unique.includes(14)) unique.push(1);
    let run = 1;
    for (let i = 0; i < unique.length - 1; i++) {
        if (unique[i] - 1 === unique[i + 1]) { run++; if (run >= 5) return unique[i - 3]; }
        else run = 1;
    }
    return null;
}

function countRanks(cards: Card[]) {
    const map = new Map<number, number>();
    for (const card of cards) map.set(card.value, (map.get(card.value) || 0) + 1);
    return [...map.entries()].sort((a, b) => { if (b[1] !== a[1]) return b[1] - a[1]; return b[0] - a[0]; });
}

function evaluateFiveCards(cards: Card[]): BestFive {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const valuesDesc = getSortedValues(cards);
    const rankCounts = countRanks(cards);
    const flush = isFlush(cards);
    const straightHigh = getStraightHigh(valuesDesc);
    if (flush && straightHigh) {
        const isRoyal = [14, 13, 12, 11, 10].every(v => valuesDesc.includes(v));
        if (isRoyal) return { category: "Royal Flush", score: [9], cards: sorted, label: "Royal Flush" };
        return { category: "Straight Flush", score: [8, straightHigh], cards: sorted, label: "Straight Flush" };
    }
    if (rankCounts[0][1] === 4) return { category: "Quads", score: [7, rankCounts[0][0], rankCounts[1][0]], cards: sorted, label: "Four of a Kind" };
    if (rankCounts[0][1] === 3 && rankCounts[1][1] === 2) return { category: "Full House", score: [6, rankCounts[0][0], rankCounts[1][0]], cards: sorted, label: "Full House" };
    if (flush) return { category: "Flush", score: [5, ...valuesDesc], cards: sorted, label: "Flush" };
    if (straightHigh) return { category: "Straight", score: [4, straightHigh], cards: sorted, label: "Straight" };
    if (rankCounts[0][1] === 3) { const kickers = rankCounts.slice(1).map(([v]) => v).sort((a, b) => b - a); return { category: "Trips", score: [3, rankCounts[0][0], ...kickers], cards: sorted, label: "Three of a Kind" }; }
    if (rankCounts[0][1] === 2 && rankCounts[1][1] === 2) { const hi = Math.max(rankCounts[0][0], rankCounts[1][0]), lo = Math.min(rankCounts[0][0], rankCounts[1][0]); return { category: "Two Pair", score: [2, hi, lo, rankCounts[2][0]], cards: sorted, label: "Two Pair" }; }
    if (rankCounts[0][1] === 2) { const kickers = rankCounts.slice(1).map(([v]) => v).sort((a, b) => b - a); return { category: "Pair", score: [1, rankCounts[0][0], ...kickers], cards: sorted, label: "Pair" }; }
    return { category: "High Card", score: [0, ...valuesDesc], cards: sorted, label: "High Card" };
}

function compareBestFive(a: BestFive, b: BestFive) {
    const len = Math.max(a.score.length, b.score.length);
    for (let i = 0; i < len; i++) { const av = a.score[i] ?? -1, bv = b.score[i] ?? -1; if (av > bv) return 1; if (av < bv) return -1; }
    return 0;
}

function evaluateBestFrom(cards: Card[]): BestFive {
    const combos = combinations(cards, 5);
    let best = evaluateFiveCards(combos[0]);
    for (let i = 1; i < combos.length; i++) { const cur = evaluateFiveCards(combos[i]); if (compareBestFive(cur, best) > 0) best = cur; }
    return best;
}

function dealerQualifies(cards: Card[]) {
    const best = evaluateBestFrom(cards);
    if (best.category !== "High Card") return true;
    const top = [...best.score];
    return top[1] === 14 && top[2] >= 13;
}

function getAllSameSuit(cards: Card[]) { return cards.every(card => card.suit === cards[0].suit); }

function isSixCardStraight(cards: Card[]) {
    const unique = [...new Set(cards.map(c => c.value))].sort((a, b) => b - a);
    if (unique.length !== 6) return false;
    const low = unique.includes(14) ? [...unique, 1].sort((a, b) => b - a) : unique;
    let run = 1;
    for (let i = 0; i < low.length - 1; i++) { if (low[i] - 1 === low[i + 1]) run++; else run = 1; if (run >= 6) return true; }
    return false;
}

function isRoyalSet(values: number[]) { return [10, 11, 12, 13, 14].every(v => values.includes(v)); }

function evaluateSixCardBonus(cards: Card[]): { category: SixCardBonusCategory; multiplier: number } {
    const values = cards.map(c => c.value), sameSuit = getAllSameSuit(cards), sixStraight = isSixCardStraight(cards);
    if (sameSuit && sixStraight && isRoyalSet(values)) return { category: "6-Card Royal Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["6-Card Royal Flush"] };
    if (sameSuit && sixStraight) return { category: "6-Card Straight Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["6-Card Straight Flush"] };
    const b = evaluateBestFrom(cards);
    if (b.category === "Royal Flush") return { category: "Royal Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["Royal Flush"] };
    if (b.category === "Straight Flush") return { category: "Straight Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["Straight Flush"] };
    if (b.category === "Quads") return { category: "Quads", multiplier: SIX_CARD_BONUS_PAYTABLE.Quads };
    if (b.category === "Full House") return { category: "Full House", multiplier: SIX_CARD_BONUS_PAYTABLE["Full House"] };
    if (b.category === "Flush") return { category: "Flush", multiplier: SIX_CARD_BONUS_PAYTABLE.Flush };
    if (b.category === "Straight") return { category: "Straight", multiplier: SIX_CARD_BONUS_PAYTABLE.Straight };
    if (b.category === "Trips") return { category: "Trips", multiplier: SIX_CARD_BONUS_PAYTABLE.Trips };
    return { category: "No Bonus", multiplier: 0 };
}

function getTripsPayout(category: FiveCardCategory, stake: number) { return stake * (TRIPS_PAYTABLE[category] || 0); }
function getBlindPayout(category: FiveCardCategory, stake: number) { return stake * (BLIND_PAYTABLE[category] || 0); }
function initialRound(): RoundState { return { deck: [], player: [], dealer: [], board: [], hiddenSixBonusCards: [] }; }
function roundResolvedLike(stage: Stage) { return stage === "showdown" || stage === "awaitingBonusReveal" || stage === "roundOver"; }
function valueToLabel(value: number) { if (value === 14) return "Ace"; if (value === 13) return "King"; if (value === 12) return "Queen"; if (value === 11) return "Jack"; return String(value); }

function describeBestHand(best: BestFive | null) {
    if (!best) return "—";
    switch (best.category) {
        case "High Card": return `${valueToLabel(best.score[1])} High`;
        case "Pair": return `Pair of ${valueToLabel(best.score[1])}s`;
        case "Two Pair": return `${valueToLabel(best.score[1])}s and ${valueToLabel(best.score[2])}s`;
        case "Trips": return `Three ${valueToLabel(best.score[1])}s`;
        case "Straight": return `${valueToLabel(best.score[1])}-High Straight`;
        case "Flush": return `${valueToLabel(best.score[1])}-High Flush`;
        case "Full House": return `${valueToLabel(best.score[1])}s Full of ${valueToLabel(best.score[2])}s`;
        case "Quads": return `Four ${valueToLabel(best.score[1])}s`;
        case "Straight Flush": return `${valueToLabel(best.score[1])}-High Straight Flush`;
        case "Royal Flush": return "Royal Flush";
        default: return best.label;
    }
}

function describeCurrentMadeHand(cards: Card[]) {
    if (cards.length === 0) return "";
    if (cards.length >= 5) return describeBestHand(evaluateBestFrom(cards));
    const rc = countRanks(cards), vd = getSortedValues(cards);
    if (rc[0][1] === 4) return `Four ${valueToLabel(rc[0][0])}s`;
    if (rc[0][1] === 3 && rc[1]?.[1] === 2) return `${valueToLabel(rc[0][0])}s Full of ${valueToLabel(rc[1][0])}s`;
    if (rc[0][1] === 3) return `Three ${valueToLabel(rc[0][0])}s`;
    if (rc[0][1] === 2 && rc[1]?.[1] === 2) { const hi = Math.max(rc[0][0], rc[1][0]), lo = Math.min(rc[0][0], rc[1][0]); return `${valueToLabel(hi)}s and ${valueToLabel(lo)}s`; }
    if (rc[0][1] === 2) return `Pair of ${valueToLabel(rc[0][0])}s`;
    return `${valueToLabel(vd[0])} High`;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toShared(card: Card, faceUp: boolean): SharedCard {
    return { id: card.id, suit: card.suit as SharedCard["suit"], rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"], faceUp };
}

const CARD_VARIANTS = { initial: { opacity: 0, y: -18, scale: 0.94 }, animate: { opacity: 1, y: 0, scale: 1 } };
const CARD_TRANSITION = (delay: number) => ({ duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay });
const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";

const DENOM_DESC = [5000, 1000, 500, 100, 25, 5, 2.5, 1] as const;

function buildChipStack(amount: number): ChipDenomination[] {
    const chips: ChipDenomination[] = [];
    let remaining = Math.round(amount * 100) / 100;
    for (const d of DENOM_DESC) {
        while (remaining >= d - 0.001 && chips.length < 8) { chips.push(d as ChipDenomination); remaining = Math.round((remaining - d) * 100) / 100; }
    }
    return chips;
}

// ─── Rules modal ──────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;
    return (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" onClick={onClose} aria-label="Close rules modal" />
                <motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[1.5rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(7,20,14,0.98),_rgba(3,10,7,0.98))] text-white shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90 sm:text-[11px]">Help</div>
                            <div className="mt-1 text-lg font-extrabold text-amber-50 sm:text-2xl">Ultimate Texas Hold&apos;em Rules</div>
                        </div>
                        <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl font-bold text-white/85 transition hover:bg-white/10">×</button>
                    </div>
                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-4 text-sm leading-6 text-emerald-50/90">
                            {[
                                ["How the Hand Starts", ["• You place an Ante. The Blind always matches the Ante exactly.", "• Trips is optional from $0 to $100.", "• 6 Card Bonus is optional ($0 or $5–$25).", "• You and the dealer each get 2 cards. Four hidden cards are dealt for the 6 Card Bonus."]],
                                ["Betting Decisions", ["• Preflop: bet 4x or 3x your Ante, or check.", "• Flop: bet 2x your Ante, or check.", "• River: bet 1x your Ante, or fold.", "• If you fold, Ante, Blind, Play, and Trips lose immediately."]],
                                ["Dealer Qualification", ["• Dealer qualifies with any Pair or better.", "• Dealer also qualifies with Ace-King high.", "• If dealer doesn't qualify and you win, Ante pushes and Play wins 1 to 1."]],
                                ["Main Bet Resolution", ["• Beat qualifying dealer: Ante and Play win 1:1.", "• Dealer doesn't qualify, you win: Ante pushes, Play wins 1:1.", "• Tie: Ante, Blind, and Play push.", "• Dealer wins: Ante, Blind, and Play lose.", "• Blind pays on Straight or better, otherwise pushes on a win."]],
                            ].map(([title, items]) => (
                                <div key={title as string} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">{title as string}</div>
                                    <div className="space-y-1">{(items as string[]).map(s => <div key={s}>{s}</div>)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ─── BetBar ───────────────────────────────────────────────────────────────────

function BetBar({ pendingBet, returned, net, showResult }: { pendingBet: number; returned: number; net: number; showResult: boolean; }) {
    const netColor = net > 0 ? "text-emerald-300" : net < 0 ? "text-red-300" : "text-amber-100";
    return (
        <div className="flex items-center justify-center gap-6 py-1">
            <div className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Bet</div>
                <div className="text-sm font-extrabold text-white">{formatMoney(pendingBet)}</div>
            </div>
            {showResult && (<>
                <div className="h-6 w-px bg-white/10" />
                <div className="text-center">
                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Returned</div>
                    <div className="text-sm font-extrabold text-emerald-300">{formatMoney(returned)}</div>
                </div>
                <div className="h-6 w-px bg-white/10" />
                <div className="text-center">
                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Net</div>
                    <div className={`text-sm font-extrabold ${netColor}`}>{net >= 0 ? "+" : ""}{formatMoney(net)}</div>
                </div>
            </>)}
        </div>
    );
}

// ─── BetCircle ────────────────────────────────────────────────────────────────

function BetCircle({ label, sublabel, amount, size, locked, canBet, selectedChip, isWinner, diamond, onAdd, onClear }: {
    label: string; sublabel?: string; amount: number; size: "large" | "small";
    locked?: boolean; canBet: boolean; selectedChip: ChipDenomination | null;
    isWinner?: boolean; diamond?: boolean; onAdd: () => void; onClear: () => void;
}) {
    const dim = size === "large" ? 90 : 70;
    const chips = buildChipStack(amount).slice(0, 5);
    const clickable = !locked && canBet && selectedChip != null;
    const clearable = !locked && canBet && amount > 0;
    const ringClass = isWinner
        ? "border-amber-300/80 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
        : diamond
            ? amount > 0 ? "border-amber-400/60" : "border-amber-300/25"
            : amount > 0 ? "border-white/40" : "border-white/20";
    const bgClass = isWinner ? "bg-amber-300/10" : amount > 0 ? "bg-black/25" : "bg-black/20";

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative" style={diamond ? { padding: "10px" } : undefined}>
                <button
                    onClick={clickable ? onAdd : undefined}
                    disabled={!clickable}
                    className={`flex flex-col items-center justify-center border-2 transition-all duration-200 ${diamond ? "rounded-sm" : "rounded-full"} ${ringClass} ${bgClass} ${clickable ? (diamond ? "hover:border-amber-300/80 cursor-pointer" : "hover:border-white/60 cursor-pointer") : "cursor-default"}`}
                    style={{ width: dim, height: dim, ...(diamond ? { transform: "rotate(45deg)" } : {}) }}
                >
                    <div style={diamond ? { transform: "rotate(-45deg)" } : undefined} className="flex flex-col items-center">
                        {chips.length > 0 ? (
                            <>
                                <div className="flex flex-col-reverse items-center">
                                    {chips.slice(0, 4).map((chip, i) => {
                                        const c = CHIP_COLORS[chip];
                                        return <div key={i} className="rounded-full border" style={{ width: 22, height: 7, background: c.bg, borderColor: c.border, marginTop: i > 0 ? -3 : 0 }} />;
                                    })}
                                </div>
                                <span className="mt-1 text-[10px] font-extrabold text-white">{formatMoney(amount)}</span>
                            </>
                        ) : (
                            <span className="text-[9px] text-white/30">{locked && amount > 0 ? formatMoney(amount) : "—"}</span>
                        )}
                    </div>
                </button>
                {clearable && (
                    <button onClick={onClear} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/80 text-[11px] font-bold text-white transition hover:bg-red-500" aria-label={`Clear ${label} bet`}>×</button>
                )}
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55">{label}</span>
            {sublabel && <span className="text-[8px] tracking-[0.08em] text-white/30">{sublabel}</span>}
        </div>
    );
}

// ─── Payout column (on felt) ──────────────────────────────────────────────────

function PayoutColumn({ title, entries, highlight }: { title: string; entries: Record<string, number>; highlight?: string | null; }) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70 text-center">{title}</div>
            {Object.entries(entries).sort((a, b) => b[1] - a[1]).map(([hand, mult]) => {
                const isHit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${isHit ? "bg-amber-300/12" : ""}`}>
                        <span className={isHit ? "font-extrabold text-amber-100" : "text-white/45"}>{hand}</span>
                        <span className={`shrink-0 font-bold ${isHit ? "text-amber-300" : "text-white/35"}`}>{mult}:1</span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    const [_lastDecision, setLastDecision] = useState<Decision | null>(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [resolvedHand, setResolvedHand] = useState<ResolvedHand | null>(null);
    const [showRules, setShowRules] = useState(false);
    const [selectedChip, setSelectedChip] = useState<ChipDenomination | null>(null);

    const sixBonusResult = useMemo(() => {
        if (round.hiddenSixBonusCards.length !== 4 || round.player.length !== 2) return null;
        return evaluateSixCardBonus([...round.player, ...round.hiddenSixBonusCards]);
    }, [round.hiddenSixBonusCards, round.player]);

    const playerHandText = useMemo(() => {
        const v = [...round.player, ...round.board];
        return v.length > 0 ? describeCurrentMadeHand(v) : "";
    }, [round.player, round.board]);

    const dealerHandText = useMemo(() => {
        if (!roundResolvedLike(stage)) return "";
        const v = [...round.dealer, ...round.board];
        return v.length > 0 ? describeCurrentMadeHand(v) : "";
    }, [round.dealer, round.board, stage]);

    const totalMainWager = ante + blind + trips + sixCardBonus + play;
    const visibleNet = payout ? payout.net : -wagerAtDeal;
    const showFinalNet = stage === "roundOver";

    const blindHighlight = resolvedHand && !resolvedHand.folded && resolvedHand.compare > 0 && resolvedHand.blindMultiplier ? resolvedHand.blindCategory : null;
    const tripsHighlight = resolvedHand?.tripsMultiplier ? resolvedHand.tripsCategory : null;
    const sixCardHighlight = stage === "roundOver" && resolvedHand?.sixCardMultiplier ? resolvedHand.sixCardCategory : null;

    const anteResultText = useMemo(() => { if (!resolvedHand || !payout) return "Pending"; if (resolvedHand.folded) return "Lose"; if (resolvedHand.compare > 0) return resolvedHand.dealerQualified ? "Win 1:1" : "Push"; if (resolvedHand.compare === 0) return "Push"; return "Lose"; }, [resolvedHand, payout]);
    const blindResultText = useMemo(() => { if (!resolvedHand || !payout) return "Pending"; if (resolvedHand.folded) return "Lose"; if (resolvedHand.compare > 0) return resolvedHand.blindMultiplier ? `Win ${resolvedHand.blindMultiplier}:1` : "Push"; if (resolvedHand.compare === 0) return "Push"; return "Lose"; }, [resolvedHand, payout]);
    const playResultText = useMemo(() => { if (!resolvedHand || !payout) return play > 0 ? "Pending" : "No Bet"; if (resolvedHand.folded) return "Lose"; if (play === 0) return "No Bet"; if (resolvedHand.compare > 0) return "Win 1:1"; if (resolvedHand.compare === 0) return "Push"; return "Lose"; }, [resolvedHand, payout, play]);
    const tripsResultText = useMemo(() => { if (trips <= 0) return "No Bet"; if (!resolvedHand || !payout) return "Pending"; return resolvedHand.tripsMultiplier ? `Win ${resolvedHand.tripsMultiplier}:1` : "Lose"; }, [resolvedHand, payout, trips]);
    const sixCardResultText = useMemo(() => { if (sixCardBonus <= 0) return "No Bet"; if (stage === "awaitingBonusReveal") return "Pending Reveal"; if (stage !== "roundOver") return "Pending"; if (!resolvedHand || !payout) return "Pending"; return resolvedHand.sixCardMultiplier ? `Win ${resolvedHand.sixCardMultiplier}:1` : "Lose"; }, [resolvedHand, payout, stage, sixCardBonus]);

    const settleRound = (playStake: number, folded: boolean, finalRound: RoundState) => {
        const playerEval = evaluateBestFrom([...finalRound.player, ...finalRound.board]);
        const dealerEval = evaluateBestFrom([...finalRound.dealer, ...finalRound.board]);
        const dealerQualified = dealerQualifies([...finalRound.dealer, ...finalRound.board]);
        const compare = compareBestFive(playerEval, dealerEval);
        const sixBonus = evaluateSixCardBonus([...finalRound.player, ...finalRound.hiddenSixBonusCards]);
        let anteReturn = 0, blindReturn = 0, playReturn = 0, tripsReturn = 0, sixReturn = 0;
        const summary: string[] = [];
        if (!folded) {
            if (compare > 0) {
                if (dealerQualified) { anteReturn = ante * 2; playReturn = playStake * 2; summary.push("Player beats dealer. Ante and Play win 1 to 1."); }
                else { anteReturn = ante; playReturn = playStake * 2; summary.push("Dealer does not qualify. Ante pushes, Play wins 1 to 1."); }
                const blindWin = getBlindPayout(playerEval.category, blind);
                blindReturn = blind + blindWin;
                summary.push(blindWin > 0 ? `Blind wins ${blindWin / blind} to 1 on ${playerEval.category}.` : "Blind pushes.");
            } else if (compare === 0) { anteReturn = ante; blindReturn = blind; playReturn = playStake; summary.push("Tie. Ante, Blind, and Play push."); }
            else summary.push("Dealer beats player. Ante, Blind, and Play lose.");
        } else summary.push("Player folds.");
        const tripsWin = trips > 0 ? getTripsPayout(playerEval.category, trips) : 0;
        if (trips > 0) { if (tripsWin > 0) { tripsReturn = trips + tripsWin; summary.push(`Trips wins ${tripsWin / trips} to 1 on ${playerEval.category}.`); } else summary.push("Trips loses."); }
        if (sixCardBonus > 0) { if (sixBonus.multiplier > 0) { sixReturn = sixCardBonus + sixCardBonus * sixBonus.multiplier; setPendingSixCardSummary(`6 Card Bonus wins ${sixBonus.multiplier} to 1 on ${sixBonus.category}.`); } else setPendingSixCardSummary("6 Card Bonus loses."); } else setPendingSixCardSummary(null);
        setResolvedHand({ playerBest: playerEval, dealerBest: dealerEval, dealerQualified, compare, folded, blindCategory: playerEval.category, tripsCategory: playerEval.category, sixCardCategory: sixBonus.category, blindMultiplier: BLIND_PAYTABLE[playerEval.category] || 0, tripsMultiplier: TRIPS_PAYTABLE[playerEval.category] || 0, sixCardMultiplier: sixBonus.multiplier });
        setPendingSixCardReturn(sixReturn);
        const totalReturn = anteReturn + blindReturn + playReturn + tripsReturn;
        const net = totalReturn - wagerAtDeal;
        setBankroll(b => b + totalReturn);
        setPayout({ ante: anteReturn, blind: blindReturn, play: playReturn, trips: tripsReturn, sixCardBonus: 0, total: totalReturn, net, summary });
        if (sixCardBonus > 0) { setStage("awaitingBonusReveal"); setMessage("Main hand settled. Press Reveal 6 Card Bonus."); }
        else { setStage("roundOver"); setMessage("Round complete."); }
    };

    const startRound = () => {
        const normalizedAnte = Math.max(MIN_MAIN_BET, Math.floor(ante / 2.5) * 2.5);
        const normalizedTrips = Math.min(MAX_TRIPS, Math.max(0, Math.floor(trips / 2.5) * 2.5));
        const normalizedSix = Math.min(MAX_SIX_BONUS, Math.max(0, Math.floor(sixCardBonus / 2.5) * 2.5));
        if (normalizedSix !== 0 && normalizedSix < MIN_SIX_BONUS) { setMessage("6 Card Bonus must be 0 or at least $5."); return; }
        const totalBet = normalizedAnte + normalizedAnte + normalizedTrips + normalizedSix;
        if (bankroll < totalBet) { setMessage("Not enough bankroll for those bets."); return; }
        const deck = createDeck(); let nextDeck = deck;
        let player: Card[], dealer: Card[], hiddenSix: Card[];
        [player, nextDeck] = draw(nextDeck, 2);[dealer, nextDeck] = draw(nextDeck, 2);[hiddenSix, nextDeck] = draw(nextDeck, 4);
        setAnte(normalizedAnte); setTrips(normalizedTrips); setSixCardBonus(normalizedSix); setPlay(0); setWagerAtDeal(totalBet);
        setPayout(null); setResolvedHand(null); setLastDecision(null); setPendingSixCardReturn(0); setPendingSixCardSummary(null);
        setBankroll(b => b - totalBet);
        setRound({ deck: nextDeck, player, dealer, board: [], hiddenSixBonusCards: hiddenSix });
        setStage("preflop"); setMessage("Cards dealt. Bet 3x or 4x now, or check.");
    };

    const revealFlop = async () => {
        if (isRevealing) return;
        setIsRevealing(true); setLastDecision("check"); setMessage("Revealing flop...");
        let nextDeck = [...round.deck]; const [flop, afterFlop] = draw(nextDeck, 3); nextDeck = afterFlop;
        setRound(r => ({ ...r, deck: nextDeck, board: [] }));
        for (let i = 0; i < flop.length; i++) { await wait(CARD_REVEAL_DELAY_MS); setRound(r => ({ ...r, board: [...r.board, flop[i]] })); }
        setStage("flop"); setMessage("Flop is out. Bet 2x now, or check."); setIsRevealing(false);
    };

    const revealTurnAndRiver = async (goToShowdownAfter: boolean, playStake = play) => {
        if (isRevealing) return;
        setIsRevealing(true); setMessage("Revealing turn and river...");
        let nextDeck = [...round.deck]; const [runout, afterRunout] = draw(nextDeck, 2); nextDeck = afterRunout;
        setRound(r => ({ ...r, deck: nextDeck }));
        for (let i = 0; i < runout.length; i++) { await wait(CARD_REVEAL_DELAY_MS); setRound(r => ({ ...r, board: [...r.board, runout[i]] })); }
        const finalRound = { ...round, deck: nextDeck, board: [...round.board, ...runout] };
        if (goToShowdownAfter) { setStage("showdown"); settleRound(playStake, false, finalRound); }
        else { setStage("river"); setMessage("River is out. Bet 1x now, or fold."); }
        setIsRevealing(false);
    };

    const placePlayBet = async (multiplier: number) => {
        if (isRevealing) return;
        const stake = ante * multiplier;
        if (bankroll < stake) { setMessage("Not enough bankroll for that play bet."); return; }
        setBankroll(b => b - stake); setPlay(stake); setLastDecision("bet");
        if (stage === "preflop") {
            setIsRevealing(true); let nextDeck = [...round.deck];
            const [board, afterBoard] = draw(nextDeck, 5); nextDeck = afterBoard;
            setRound(r => ({ ...r, deck: nextDeck, board: [] }));
            setMessage(`Play bet placed for ${multiplier}x. Revealing board...`);
            for (let i = 0; i < 3; i++) { await wait(250); setRound(r => ({ ...r, board: [...r.board, board[i]] })); }
            await wait(1000);
            for (let i = 3; i < 5; i++) { await wait(250); setRound(r => ({ ...r, board: [...r.board, board[i]] })); }
            const nextRound = { ...round, deck: nextDeck, board };
            setStage("showdown"); setMessage(`Play bet placed for ${multiplier}x. Settling hand.`);
            settleRound(stake, false, nextRound); setIsRevealing(false); return;
        }
        if (stage === "flop") { await revealTurnAndRiver(true, stake); return; }
        if (stage === "river") { setStage("showdown"); setMessage(`Play bet placed for ${multiplier}x. Settling hand.`); settleRound(stake, false, round); }
    };

    const revealRiver = async () => { setLastDecision("check"); await revealTurnAndRiver(false); };

    const foldHand = () => {
        if (isRevealing) return;
        setPlay(0); setLastDecision("fold"); setStage("showdown"); setMessage("Player folds."); settleRound(0, true, round);
    };

    const revealSixCardBonus = () => {
        if (!payout) return;
        const bonusSummary = pendingSixCardSummary ? [pendingSixCardSummary] : [];
        const updatedTotal = payout.total + pendingSixCardReturn;
        const updatedNet = updatedTotal - (wagerAtDeal + play);
        setBankroll(b => b + pendingSixCardReturn);
        setPayout({ ...payout, sixCardBonus: pendingSixCardReturn, total: updatedTotal, net: updatedNet, summary: [...payout.summary, ...bonusSummary] });
        setPendingSixCardReturn(0); setPendingSixCardSummary(null); setStage("roundOver"); setMessage("6 Card Bonus revealed.");
    };

    const resetForNextRound = () => {
        setPlay(0); setWagerAtDeal(0); setRound(initialRound()); setPayout(null); setResolvedHand(null);
        setStage("betting"); setMessage("Set your bets and press Deal."); setLastDecision(null);
        setPendingSixCardReturn(0); setPendingSixCardSummary(null); setIsRevealing(false);
    };

    const canAct = !isRevealing;
    const isBetting = stage === "betting";
    const dealerRevealed = roundResolvedLike(stage);
    const committedBet = isBetting ? totalMainWager : wagerAtDeal + play;
    const showSixCardView = stage === "roundOver" && sixCardBonus > 0;

    const btnBase = "min-w-[88px] rounded-full border px-5 py-2 text-sm font-extrabold shadow-lg transition disabled:opacity-45 active:translate-y-px";
    const btnGray = `${btnBase} border-slate-500/60 bg-gradient-to-b from-slate-500 to-slate-700 text-white hover:brightness-110`;
    const btnRed = `${btnBase} border-red-300/60 bg-gradient-to-b from-red-500 to-red-700 text-white hover:brightness-105`;

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell
                feltColor="#1a3a5c"
                gameName="Ultimate Texas Hold'em"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <div className="flex flex-col gap-2 border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
                        <ChipTray selectedChip={selectedChip as ChipDenomination} onSelect={setSelectedChip} disabled={!isBetting} />
                        <div className="flex items-center justify-center gap-2">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {isBetting && (
                                    <motion.div key="deal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                                        <motion.button onClick={startRound} disabled={!canAct} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="rounded-full border border-amber-200/80 bg-gradient-to-b from-amber-300 to-amber-500 px-10 py-2.5 text-sm font-extrabold text-slate-950 shadow-lg disabled:opacity-45">Deal</motion.button>
                                    </motion.div>
                                )}
                                {stage === "preflop" && (
                                    <motion.div key="preflop" className="flex gap-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                                        <button onClick={() => void placePlayBet(4)} disabled={!canAct} className={BTN_GOLD}>Bet 4x</button>
                                        <button onClick={() => void placePlayBet(3)} disabled={!canAct} className={BTN_GOLD}>Bet 3x</button>
                                        <button onClick={() => void revealFlop()} disabled={!canAct} className={btnGray}>Check</button>
                                    </motion.div>
                                )}
                                {stage === "flop" && (
                                    <motion.div key="flop" className="flex gap-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                                        <button onClick={() => void placePlayBet(2)} disabled={!canAct} className={BTN_GOLD}>Bet 2x</button>
                                        <button onClick={() => void revealRiver()} disabled={!canAct} className={btnGray}>Check</button>
                                    </motion.div>
                                )}
                                {stage === "river" && (
                                    <motion.div key="river" className="flex gap-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                                        <button onClick={() => void placePlayBet(1)} disabled={!canAct} className={BTN_GOLD}>Bet 1x</button>
                                        <button onClick={foldHand} disabled={!canAct} className={btnRed}>Fold</button>
                                    </motion.div>
                                )}
                                {stage === "awaitingBonusReveal" && (
                                    <motion.div key="reveal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                                        <button onClick={revealSixCardBonus} disabled={!canAct} className={BTN_GOLD}>Reveal 6 Card Bonus</button>
                                    </motion.div>
                                )}
                                {stage === "roundOver" && (
                                    <motion.div key="next" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                                        <button onClick={resetForNextRound} disabled={!canAct} className={BTN_GREEN}>Next Hand</button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <div className="invisible hidden sm:block" aria-hidden><ChipTray selectedChip={selectedChip as ChipDenomination} onSelect={() => { }} /></div>
                    </div>
                }
            >
                {/* Title — full width at the very top */}
                <div className="mb-3 flex select-none flex-col items-center gap-1 shrink-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-extrabold uppercase tracking-[0.16em] text-amber-100/90" style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
                            Ultimate Texas Hold&apos;em
                        </h1>
                        <button onClick={() => setShowRules(true)} className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/25 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15" aria-label="Show rules">i</button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[10px] font-bold tracking-[0.15em] text-white/35">
                        <span>DEALER QUALIFIES WITH PAIR OR BETTER</span>
                        <span className="text-white/20">·</span>
                        <span>BLIND PAYS ON STRAIGHT OR BETTER</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[10px] font-bold tracking-[0.12em] text-white/25">
                        <span>PLAY BET</span>
                        <span className="text-white/15">·</span>
                        <span>4x OR 3x PREFLOP</span>
                        <span className="text-white/15">·</span>
                        <span>2x AFTER FLOP</span>
                        <span className="text-white/15">·</span>
                        <span>1x ON RIVER</span>
                    </div>
                </div>

                {/* Three-column body: betting left | cards center | payout tables right */}
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* Betting column — vertically centered */}
                    <div className="flex w-full flex-col items-center justify-center gap-3 py-2 lg:w-64 lg:shrink-0">
                        <BetBar
                            pendingBet={committedBet}
                            returned={payout ? payout.total : 0}
                            net={showFinalNet ? (payout ? payout.net : visibleNet) : visibleNet}
                            showResult={showFinalNet}
                        />

                        {/* Betting circles */}
                        <div className="flex flex-col items-center gap-3">
                            {/* Row 1: TRIPS (diamond) + 6 CARD (circle) */}
                            <div className="flex items-center gap-8">
                                <BetCircle
                                    label="TRIPS"
                                    sublabel={`max $${MAX_TRIPS}`}
                                    amount={trips}
                                    size="small"
                                    diamond
                                    canBet={isBetting}
                                    selectedChip={selectedChip}
                                    onAdd={() => setTrips(t => Math.min(MAX_TRIPS, t + (selectedChip ?? 0)))}
                                    onClear={() => setTrips(0)}
                                />
                                <BetCircle
                                    label="6 CARD"
                                    sublabel={`max $${MAX_SIX_BONUS}`}
                                    amount={sixCardBonus}
                                    size="small"
                                    canBet={isBetting}
                                    selectedChip={selectedChip}
                                    onAdd={() => setSixCardBonus(v => Math.min(MAX_SIX_BONUS, v + (selectedChip ?? 0)))}
                                    onClear={() => setSixCardBonus(0)}
                                />
                            </div>

                            {/* Row 2: ANTE = BLIND */}
                            <div className="flex items-center gap-3">
                                <BetCircle
                                    label="ANTE"
                                    amount={ante}
                                    size="large"
                                    canBet={isBetting}
                                    selectedChip={selectedChip}
                                    isWinner={!!(resolvedHand && resolvedHand.compare > 0 && !resolvedHand.folded)}
                                    onAdd={() => setAnte(a => a + (selectedChip ?? 0))}
                                    onClear={() => setAnte(MIN_MAIN_BET)}
                                />
                                <span className="text-base font-bold text-white/50" style={{ letterSpacing: "0.05em" }}>=</span>
                                <BetCircle
                                    label="BLIND"
                                    amount={blind}
                                    size="large"
                                    locked
                                    canBet={false}
                                    selectedChip={null}
                                    isWinner={!!(resolvedHand && resolvedHand.compare > 0 && !resolvedHand.folded)}
                                    onAdd={() => { }}
                                    onClear={() => { }}
                                />
                            </div>

                            {/* Row 3: PLAY */}
                            <BetCircle
                                label="PLAY"
                                amount={play}
                                size="large"
                                locked
                                canBet={false}
                                selectedChip={null}
                                isWinner={!!(resolvedHand && resolvedHand.compare > 0 && !resolvedHand.folded && play > 0)}
                                onAdd={() => { }}
                                onClear={() => { }}
                            />
                        </div>

                        {/* Settlement — no background box */}
                        {resolvedHand && payout && stage === "roundOver" && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-4 text-xs">
                                    <div className="text-center">
                                        <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">Player</div>
                                        <div className="font-extrabold text-amber-100">{describeBestHand(resolvedHand.playerBest)}</div>
                                    </div>
                                    <div className="h-6 w-px bg-white/10" />
                                    <div className="text-center">
                                        <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">Dealer{!resolvedHand.dealerQualified ? " (no qualify)" : ""}</div>
                                        <div className="font-bold text-white/70">{describeBestHand(resolvedHand.dealerBest)}</div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-center gap-1.5">
                                    {[
                                        { name: "Ante", result: anteResultText },
                                        { name: "Blind", result: blindResultText },
                                        { name: "Play", result: playResultText },
                                        { name: "Trips", result: tripsResultText },
                                        { name: "6 Card", result: sixCardResultText },
                                    ].map(({ name, result }) => {
                                        const isWin = result.startsWith("Win"), isLose = result === "Lose";
                                        return (
                                            <div key={name} className="rounded-xl border px-2.5 py-1 text-center text-xs" style={{ borderColor: isWin ? "rgba(52,211,153,0.3)" : isLose ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)", background: isWin ? "rgba(52,211,153,0.08)" : isLose ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.04)" }}>
                                                <div className="text-[9px] uppercase tracking-[0.1em] text-white/35">{name}</div>
                                                <div className={`font-extrabold ${isWin ? "text-emerald-300" : isLose ? "text-red-300" : "text-amber-100/70"}`}>{result}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Cards column — vertically centered */}
                    <div className="flex w-full flex-col items-center justify-center gap-3 py-2 lg:flex-1">
                        <AnimatePresence mode="wait">
                            {showSixCardView ? (
                                <motion.div key="six-card-view" initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-3">
                                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">6 Card Bonus</span>
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        {round.player.map(card => <PlayingCard key={card.id} card={toShared(card, true)} className={CARD_CLS} />)}
                                        <span className="text-lg font-bold text-white/30">+</span>
                                        {round.hiddenSixBonusCards.map((card, i) => (
                                            <motion.div key={card.id} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.1)}>
                                                <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                            </motion.div>
                                        ))}
                                    </div>
                                    {sixBonusResult && <span className={`text-sm font-extrabold ${sixBonusResult.category === "No Bonus" ? "text-white/50" : "text-amber-200"}`}>{sixBonusResult.category}</span>}
                                </motion.div>
                            ) : (
                                <motion.div key="main-hand-view" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-3">
                                    {/* Dealer */}
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Dealer</span>
                                        <div className="flex gap-2">
                                            <AnimatePresence>
                                                {round.dealer.map((card, i) => (
                                                    <motion.div key={card.id} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.1)}>
                                                        <PlayingCard card={toShared(card, dealerRevealed)} className={CARD_CLS} />
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                            {round.dealer.length === 0 && <div className="flex gap-2 opacity-20"><div className={`${CARD_CLS} border border-white/20 bg-white/5`} /><div className={`${CARD_CLS} border border-white/20 bg-white/5`} /></div>}
                                        </div>
                                        {dealerHandText && <span className="text-xs font-semibold text-amber-100/70">{dealerHandText}</span>}
                                    </div>
                                    {/* Board */}
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Board</span>
                                        <div className="flex gap-2">
                                            <AnimatePresence>
                                                {round.board.map((card, i) => (
                                                    <motion.div key={card.id} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.08)}>
                                                        <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                            {stage !== "betting" && round.board.length < 5 && Array.from({ length: 5 - round.board.length }).map((_, i) => (
                                                <div key={i} className={`${CARD_CLS} border border-white/10 bg-white/5 opacity-20`} />
                                            ))}
                                        </div>
                                    </div>
                                    {/* Player */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="flex gap-2">
                                            <AnimatePresence>
                                                {round.player.map((card, i) => (
                                                    <motion.div key={card.id} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.1)}>
                                                        <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                            {round.player.length === 0 && <div className="flex gap-2 opacity-20"><div className={`${CARD_CLS} border border-white/20 bg-white/5`} /><div className={`${CARD_CLS} border border-white/20 bg-white/5`} /></div>}
                                        </div>
                                        {playerHandText && <span className="text-xs font-semibold text-amber-100/70">{playerHandText}</span>}
                                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Player</span>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <p className="text-sm font-semibold text-amber-50/60">{message}</p>
                    </div>

                    {/* Payout tables — vertically centered, right side */}
                    <div className="hidden w-72 shrink-0 flex-col justify-center lg:flex">
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <PayoutColumn title="Blind Pays" entries={BLIND_PAYTABLE} highlight={blindHighlight as string | null} />
                                <div className="mt-3">
                                    <PayoutColumn title="Trips Pays" entries={TRIPS_PAYTABLE} highlight={tripsHighlight as string | null} />
                                </div>
                            </div>

                            <div className="flex-1">
                                <PayoutColumn title="6 Card Bonus" entries={SIX_CARD_BONUS_PAYTABLE as Record<string, number>} highlight={sixCardHighlight as string | null} />
                            </div>
                        </div>
                    </div>
                </div>
            </TableShell>
        </>
    );
}