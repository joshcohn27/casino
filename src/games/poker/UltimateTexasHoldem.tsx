import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import PlayingCard from "../../shared/components/Card";
import type { Card as SharedCard } from "../../shared/lib/cards";
import { type ChipDenomination, buildChipStackFromAmount, popLastChip, BTN_GOLD, BTN_NEUTRAL } from "../../shared/lib/money";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { defaultBet } from "../../shared/state/settings";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import { useBetRecorder } from "../../shared/state/sessionContext";

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

// The dealer needs a pair or better to qualify
function dealerQualifies(cards: Card[]) {
    return evaluateBestFrom(cards).category !== "High Card";
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
    if (!best) return "-";
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

// 6 Card Bonus cards sit beside the player's hand, slightly smaller
const BONUS_CARD_CLS = "h-[64px] w-[45px] rounded-[8px] sm:h-[76px] sm:w-[53px] sm:rounded-[10px]";

// Showdown pacing (ms)
const DEALER_FLIP_MS = 450;
const SETTLE_STEP_MS = 380;
const SETTLE_ALL = 4; // play, ante, blind, trips

type SpotId = "ante" | "trips" | "six";

// ─── Rules modal ──────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;
    return (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close rules modal" />
                <motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[4px] border border-[#5a718a] bg-[#0a1623] text-text"
                >
                    <div className="flex items-center justify-between border-b border-[#5a718a] px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[13px] font-extrabold text-amber-200/90">Help</div>
                            <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">Ultimate Texas Hold&apos;em Rules</div>
                        </div>
                        <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#5a718a] bg-[#102439] text-xl font-bold text-text transition-colors hover:bg-[#152e4a] active:bg-[#0a1623]">×</button>
                    </div>
                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-4 text-base leading-6 text-text">
                            {[
                                ["How the Hand Starts", ["• You place an Ante. The Blind always matches the Ante exactly.", "• Trips is optional from $0 to $100.", "• 6 Card Bonus is optional ($0 or $5 to $25).", "• You and the dealer each get 2 cards. Four hidden cards are dealt for the 6 Card Bonus."]],
                                ["Betting Decisions", ["• Preflop: bet 4x or 3x your Ante, or check.", "• Flop: bet 2x your Ante, or check.", "• River: bet 1x your Ante, or fold.", "• If you fold, Ante, Blind, Play, and Trips lose immediately."]],
                                ["Dealer Qualification", ["• Dealer qualifies with any Pair or better.", "• If the dealer doesn't qualify, your Ante is returned whether you win or lose the hand.", "• Folding always loses the Ante."]],
                                ["Main Bet Resolution", ["• Beat qualifying dealer: Ante and Play win 1 to 1.", "• Dealer doesn't qualify, you win: Ante pushes, Play wins 1 to 1.", "• Tie: Ante, Blind, and Play push.", "• Qualifying dealer wins: Ante, Blind, and Play lose.", "• Dealer doesn't qualify but wins: Ante pushes, Blind and Play lose.", "• Blind pays on Straight or better, otherwise pushes on a win."]],
                            ].map(([title, items]) => (
                                <div key={title as string} className="rounded-[4px] border border-[#5a718a] bg-[#102439] p-4">
                                    <div className="mb-2 text-sm font-extrabold text-amber-200">{title as string}</div>
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




// ─── Payout column (on felt) ──────────────────────────────────────────────────

function PayoutColumn({ title, entries, highlight }: { title: string; entries: Record<string, number>; highlight?: string | null; }) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-[13px] font-extrabold text-amber-200 text-center">{title}</div>
            {Object.entries(entries).sort((a, b) => b[1] - a[1]).map(([hand, mult]) => {
                const isHit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${isHit ? "bg-amber-300/12" : ""}`}>
                        <span className={isHit ? "font-extrabold text-amber-100" : "text-white/75"}>{hand}</span>
                        <span className={`shrink-0 font-bold text-gold`}>{mult} to 1</span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UltimateTexasHoldem({ bankroll, setBankroll }: Props) {
    // two decks take turns, gold backs then purple: every hand is dealt from the other deck
    const [deckNo, setDeckNo] = useState(0);
    const [stage, setStage] = useState<Stage>("betting");
    const [ante, setAnte] = useState(() => defaultBet("uth", "ante"));
    const recordBet = useBetRecorder();
    const blind = ante;
    const [trips, setTrips] = useState(() => defaultBet("uth", "trips"));
    const [sixCardBonus, setSixCardBonus] = useState(() => defaultBet("uth", "six"));
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
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [selectedSpot, setSelectedSpot] = useState<SpotId>("ante");
    // Showdown display pacing: how many dealer cards are turned, how many bets have
    // visibly settled (play, ante, blind, trips), how many bonus cards are turned.
    const [dealerShown, setDealerShown] = useState(0);
    const [settleShown, setSettleShown] = useState(0);
    const [sixShown, setSixShown] = useState(0);

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

    const blindHighlight = resolvedHand && !resolvedHand.folded && resolvedHand.compare > 0 && resolvedHand.blindMultiplier ? resolvedHand.blindCategory : null;
    const tripsHighlight = resolvedHand?.tripsMultiplier ? resolvedHand.tripsCategory : null;
    const sixCardHighlight = stage === "roundOver" && resolvedHand?.sixCardMultiplier ? resolvedHand.sixCardCategory : null;

    const anteResultText = useMemo(() => { if (!resolvedHand || !payout) return "Pending"; if (resolvedHand.folded) return "Lose"; if (resolvedHand.compare > 0) return resolvedHand.dealerQualified ? "Win 1 to 1" : "Push"; if (resolvedHand.compare === 0 || !resolvedHand.dealerQualified) return "Push"; return "Lose"; }, [resolvedHand, payout]);
    const blindResultText = useMemo(() => { if (!resolvedHand || !payout) return "Pending"; if (resolvedHand.folded) return "Lose"; if (resolvedHand.compare > 0) return resolvedHand.blindMultiplier ? `Win ${resolvedHand.blindMultiplier} to 1` : "Push"; if (resolvedHand.compare === 0) return "Push"; return "Lose"; }, [resolvedHand, payout]);
    const playResultText = useMemo(() => { if (!resolvedHand || !payout) return play > 0 ? "Pending" : "No Bet"; if (resolvedHand.folded) return "Lose"; if (play === 0) return "No Bet"; if (resolvedHand.compare > 0) return "Win 1 to 1"; if (resolvedHand.compare === 0) return "Push"; return "Lose"; }, [resolvedHand, payout, play]);
    const tripsResultText = useMemo(() => { if (trips <= 0) return "No Bet"; if (!resolvedHand || !payout) return "Pending"; return resolvedHand.tripsMultiplier ? `Win ${resolvedHand.tripsMultiplier} to 1` : "Lose"; }, [resolvedHand, payout, trips]);
    const sixCardResultText = useMemo(() => { if (sixCardBonus <= 0) return "No Bet"; if (stage === "awaitingBonusReveal") return "Pending Reveal"; if (stage !== "roundOver") return "Pending"; if (!resolvedHand || !payout) return "Pending"; return resolvedHand.sixCardMultiplier ? `Win ${resolvedHand.sixCardMultiplier} to 1` : "Lose"; }, [resolvedHand, payout, stage, sixCardBonus]);

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
            else if (dealerQualified) summary.push("Dealer beats player. Ante, Blind, and Play lose.");
            // a dealer who does not qualify cannot take the Ante, even with the better hand
            else { anteReturn = ante; summary.push("Dealer does not qualify. Ante pushes. Blind and Play lose."); }
        } else summary.push("Player folds.");
        const tripsWin = trips > 0 ? getTripsPayout(playerEval.category, trips) : 0;
        if (trips > 0) { if (tripsWin > 0) { tripsReturn = trips + tripsWin; summary.push(`Trips wins ${tripsWin / trips} to 1 on ${playerEval.category}.`); } else summary.push("Trips loses."); }
        if (sixCardBonus > 0) { if (sixBonus.multiplier > 0) { sixReturn = sixCardBonus + sixCardBonus * sixBonus.multiplier; setPendingSixCardSummary(`6 Card Bonus wins ${sixBonus.multiplier} to 1 on ${sixBonus.category}.`); } else setPendingSixCardSummary("6 Card Bonus loses."); } else setPendingSixCardSummary(null);
        setResolvedHand({ playerBest: playerEval, dealerBest: dealerEval, dealerQualified, compare, folded, blindCategory: playerEval.category, tripsCategory: playerEval.category, sixCardCategory: sixBonus.category, blindMultiplier: BLIND_PAYTABLE[playerEval.category] || 0, tripsMultiplier: TRIPS_PAYTABLE[playerEval.category] || 0, sixCardMultiplier: sixBonus.multiplier });
        setPendingSixCardReturn(sixReturn);
        // for the yearly stats: each bet on its own
        recordBet("Ante", ante, anteReturn);
        recordBet("Blind", blind, blindReturn, playerEval.category);
        recordBet("Play", playStake, playReturn);
        recordBet("Trips", trips, tripsReturn, playerEval.category);
        recordBet("6 Card Bonus", sixCardBonus, sixReturn, sixBonus.category ?? undefined);
        const totalReturn = anteReturn + blindReturn + playReturn + tripsReturn;
        const net = totalReturn - (wagerAtDeal + playStake);
        setBankroll(b => b + totalReturn);
        setPayout({ ante: anteReturn, blind: blindReturn, play: playReturn, trips: tripsReturn, sixCardBonus: 0, total: totalReturn, net, summary });
        if (sixCardBonus > 0) { setStage("awaitingBonusReveal"); setMessage("Main hand settled. Revealing 6 Card Bonus..."); }
        else { setStage("roundOver"); setMessage("Round complete."); }
    };

    // Turn the dealer's cards one at a time, settle, then show each bet resolving in turn.
    const runShowdown = async (playStake: number, folded: boolean, finalRound: RoundState) => {
        setIsRevealing(true);
        setStage("showdown");
        await wait(DEALER_FLIP_MS);
        setDealerShown(1);
        await wait(DEALER_FLIP_MS);
        setDealerShown(2);
        await wait(DEALER_FLIP_MS + 200);
        settleRound(playStake, folded, finalRound);
        for (let step = 1; step <= SETTLE_ALL; step++) {
            setSettleShown(step);
            await wait(SETTLE_STEP_MS);
        }
        setIsRevealing(false);
    };

    const resetShowdownDisplay = () => { setDealerShown(0); setSettleShown(0); setSixShown(0); };

    const startRound = () => {
        const normalizedAnte = Math.max(MIN_MAIN_BET, Math.floor(ante / 2.5) * 2.5);
        const normalizedTrips = Math.min(MAX_TRIPS, Math.max(0, Math.floor(trips / 2.5) * 2.5));
        const normalizedSix = Math.min(MAX_SIX_BONUS, Math.max(0, Math.floor(sixCardBonus / 2.5) * 2.5));
        if (normalizedSix !== 0 && normalizedSix < MIN_SIX_BONUS) { setMessage("6 Card Bonus must be 0 or at least $5."); return; }
        const totalBet = normalizedAnte + normalizedAnte + normalizedTrips + normalizedSix;
        if (bankroll < totalBet) { setMessage("Not enough bankroll for those bets."); return; }
        setDeckNo((n) => n + 1);
        const deck = createDeck(); let nextDeck = deck;
        let player: Card[], dealer: Card[], hiddenSix: Card[];
        [player, nextDeck] = draw(nextDeck, 2);[dealer, nextDeck] = draw(nextDeck, 2);[hiddenSix, nextDeck] = draw(nextDeck, 4);
        setAnte(normalizedAnte); setTrips(normalizedTrips); setSixCardBonus(normalizedSix); setPlay(0); setWagerAtDeal(totalBet);
        setPayout(null); setResolvedHand(null); setLastDecision(null); setPendingSixCardReturn(0); setPendingSixCardSummary(null);
        resetShowdownDisplay();
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
        if (goToShowdownAfter) { await runShowdown(playStake, false, finalRound); return; }
        setStage("river"); setMessage("River is out. Bet 1x now, or fold.");
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
            setMessage(`Play bet placed for ${multiplier}x. Settling hand.`);
            await runShowdown(stake, false, nextRound); return;
        }
        if (stage === "flop") { await revealTurnAndRiver(true, stake); return; }
        if (stage === "river") { setMessage(`Play bet placed for ${multiplier}x. Settling hand.`); await runShowdown(stake, false, round); }
    };

    const revealRiver = async () => { setLastDecision("check"); await revealTurnAndRiver(false); };

    const foldHand = () => {
        if (isRevealing) return;
        setPlay(0); setLastDecision("fold"); setMessage("Player folds."); void runShowdown(0, true, round);
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

    const handleChangeBet = () => {
        setPlay(0); setWagerAtDeal(0); setRound(initialRound()); setPayout(null); setResolvedHand(null);
        setStage("betting"); setMessage("Adjust your bets and press Deal."); setLastDecision(null);
        setPendingSixCardReturn(0); setPendingSixCardSummary(null); setIsRevealing(false);
        resetShowdownDisplay();
    };

    const handleClearAndReset = () => {
        setAnte(0); setTrips(0); setSixCardBonus(0);
        setPlay(0); setWagerAtDeal(0); setRound(initialRound()); setPayout(null); setResolvedHand(null);
        setStage("betting"); setMessage("Set your bets and press Deal."); setLastDecision(null);
        setPendingSixCardReturn(0); setPendingSixCardSummary(null); setIsRevealing(false);
        resetShowdownDisplay();
    };

    // 6 Card Bonus turns over on its own once the main bets have settled
    const revealSixRef = useRef(revealSixCardBonus);
    useEffect(() => { revealSixRef.current = revealSixCardBonus; });
    useEffect(() => {
        if (stage !== "awaitingBonusReveal" || settleShown < SETTLE_ALL) return;
        const timers: number[] = [];
        let t = 300;
        for (let n = 1; n <= 4; n++) {
            timers.push(window.setTimeout(() => setSixShown(n), t));
            t += 260;
        }
        timers.push(window.setTimeout(() => revealSixRef.current(), t + 450));
        return () => timers.forEach((id) => window.clearTimeout(id));
    }, [stage, settleShown]);

    // ── UI chip handlers ──────────────────────────────────────────────────────
    const canAct = !isRevealing;
    const isBetting = stage === "betting";

    // Tray chip goes onto the highlighted spot
    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (!isBetting) return;
        if (selectedSpot === "ante") setAnte(a => a + chip);
        else if (selectedSpot === "trips") setTrips(t => Math.min(MAX_TRIPS, t + chip));
        else setSixCardBonus(v => Math.min(MAX_SIX_BONUS, v + chip));
    };

    // Clicking the chips on a spot takes the last chip back
    const removeLastChip = (spot: SpotId) => {
        if (!isBetting) return;
        if (spot === "ante") setAnte(a => popLastChip(a));
        else if (spot === "trips") setTrips(t => popLastChip(t));
        else setSixCardBonus(v => popLastChip(v));
    };

    const handleClear = () => { handleClearAndReset(); setSelectedSpot("ante"); };

    // Reset: back to the bets saved in Settings
    const handleReset = () => {
        setAnte(defaultBet("uth", "ante")); setTrips(defaultBet("uth", "trips")); setSixCardBonus(defaultBet("uth", "six"));
        setSelectedSpot("ante");
    };

    // ── Derived render values ─────────────────────────────────────────────────
    const committedBet = isBetting ? totalMainWager : wagerAtDeal + play;
    const canDeal = ante >= MIN_MAIN_BET;
    const canRebet = ante >= MIN_MAIN_BET && bankroll >= ante + blind + trips + sixCardBonus;
    const roundDone = stage === "roundOver" && settleShown >= SETTLE_ALL;
    const hasSixBet = sixCardBonus > 0 && !isBetting;

    // What a spot shows once its bet has visibly settled: losing chips leave,
    // winning stacks grow to the amount returned.
    const spotView = (bet: number, result: string, shown: boolean, returned: number) => {
        if (shown && result === "Lose") return { chips: [] as ChipDenomination[], total: 0, win: false };
        if (shown && result.startsWith("Win")) return { chips: buildChipStackFromAmount(returned), total: returned, win: true };
        return { chips: buildChipStackFromAmount(bet), total: bet, win: false };
    };
    const settled = !!(resolvedHand && payout);
    const playView = spotView(play, playResultText, settled && settleShown >= 1, payout?.play ?? 0);
    const anteView = spotView(ante, anteResultText, settled && settleShown >= 2, payout?.ante ?? 0);
    const blindView = spotView(blind, blindResultText, settled && settleShown >= 3, payout?.blind ?? 0);
    const tripsView = spotView(trips, tripsResultText, settled && settleShown >= 4, payout?.trips ?? 0);
    const sixView = spotView(sixCardBonus, sixCardResultText, roundDone, payout?.sixCardBonus ?? 0);

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell deckNo={deckNo}
                feltColor="#1a3a5c"
                gameName="Ultimate Texas Hold'em"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
                        <ChipTray selectedChip={selectedChip} onSelect={handleChipSelect} disabled={!isBetting} />
                        <div className="flex min-h-[46px] items-center justify-center gap-2">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {isBetting && (
                                    <SlideBtn key="clear">
                                        <button data-hotkey="Q" onClick={handleClear} disabled={!canAct || totalMainWager <= 0} className={BTN_NEUTRAL}>Clear</button>
                                    </SlideBtn>
                                )}
                                {isBetting && (
                                    <SlideBtn key="reset">
                                        <button data-hotkey="E" className={BTN_NEUTRAL} onClick={handleReset}>Reset</button>
                                    </SlideBtn>
                                )}
                                {isBetting && (
                                    <SlideBtn key="deal">
                                        <button data-hotkey="Space" data-hotkey-alt="Enter" onClick={startRound} disabled={!canAct || !canDeal} className={BTN_GOLD}>Deal</button>
                                    </SlideBtn>
                                )}
                                {stage === "preflop" && (
                                    <SlideBtn key="bet4x">
                                        <button data-hotkey="4" onClick={() => void placePlayBet(4)} disabled={!canAct} className={BTN_GOLD}>Bet 4x</button>
                                    </SlideBtn>
                                )}
                                {stage === "preflop" && (
                                    <SlideBtn key="bet3x">
                                        <button data-hotkey="3" onClick={() => void placePlayBet(3)} disabled={!canAct} className={BTN_GOLD}>Bet 3x</button>
                                    </SlideBtn>
                                )}
                                {stage === "preflop" && (
                                    <SlideBtn key="check-preflop">
                                        <button data-hotkey="K" data-hotkey-alt="Space" onClick={() => void revealFlop()} disabled={!canAct} className={BTN_NEUTRAL}>Check</button>
                                    </SlideBtn>
                                )}
                                {stage === "flop" && (
                                    <SlideBtn key="bet2x">
                                        <button data-hotkey="2" onClick={() => void placePlayBet(2)} disabled={!canAct} className={BTN_GOLD}>Bet 2x</button>
                                    </SlideBtn>
                                )}
                                {stage === "flop" && (
                                    <SlideBtn key="check-flop">
                                        <button data-hotkey="K" data-hotkey-alt="Space" onClick={() => void revealRiver()} disabled={!canAct} className={BTN_NEUTRAL}>Check</button>
                                    </SlideBtn>
                                )}
                                {stage === "river" && (
                                    <SlideBtn key="bet1x">
                                        <button data-hotkey="1" onClick={() => void placePlayBet(1)} disabled={!canAct} className={BTN_GOLD}>Bet 1x</button>
                                    </SlideBtn>
                                )}
                                {stage === "river" && (
                                    <SlideBtn key="fold">
                                        <button data-hotkey="F" onClick={foldHand} disabled={!canAct} className={BTN_NEUTRAL}>Fold</button>
                                    </SlideBtn>
                                )}
                                {stage === "roundOver" && (
                                    <SlideBtn key="clear-done">
                                        <button data-hotkey="Q" onClick={handleClear} disabled={!canAct} className={BTN_NEUTRAL}>Clear</button>
                                    </SlideBtn>
                                )}
                                {stage === "roundOver" && (
                                    <SlideBtn key="change-bet">
                                        <button data-hotkey="B" onClick={handleChangeBet} disabled={!canAct} className={BTN_NEUTRAL}>Change Bet</button>
                                    </SlideBtn>
                                )}
                                {stage === "roundOver" && (
                                    <SlideBtn key="rebet-deal">
                                        <button data-hotkey="Space" data-hotkey-alt="Enter" onClick={startRound} disabled={!canAct || !canRebet} className={BTN_GOLD}>Rebet &amp; Deal</button>
                                    </SlideBtn>
                                )}
                            </AnimatePresence>
                        </div>
                        <div className="invisible hidden sm:block"><ChipTray selectedChip={selectedChip} onSelect={() => { }} disabled /></div>
                    </div>
                }
            >
                {/* Title - full width at the very top */}
                <div className="mb-3 flex select-none flex-col items-center gap-1 shrink-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-center text-2xl font-bold text-gold-soft">
                            Ultimate Texas Hold&apos;em
                        </h1>
                        <button onClick={() => setShowRules(true)} className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black" aria-label="Show rules">i</button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>Dealer qualifies with pair or better</span>
                        <span className="text-white/75">·</span>
                        <span>Blind pays on straight or better</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>Play bet</span>
                        <span className="text-white/75">·</span>
                        <span>4x or 3x preflop</span>
                        <span className="text-white/75">·</span>
                        <span>2x after flop</span>
                        <span className="text-white/75">·</span>
                        <span>1x on river</span>
                    </div>
                </div>

                {/* Three-column body: betting left | cards center | payout tables right */}
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* Betting column - On narrow screens it sits under the cards and stays there: the two never swap, so dealing moves nothing */}
                    <div className={`order-2 flex w-full flex-col items-center justify-center gap-3 py-2 lg:order-1 lg:w-64 lg:shrink-0`}>
                        <BetBar
                            compact
                            pendingBet={committedBet}
                            returned={payout ? payout.total : 0}
                            net={payout ? payout.net : 0}
                            showResult={roundDone}
                        />

                        {/* Betting circles */}
                        <div className="mt-10 flex flex-col items-center gap-12">
                            {/* Row 1: TRIPS (diamond) + 6 CARD (circle) */}
                            <div className="flex items-center gap-6">
                                <BetSpot
                                    testId="trips"
                                    label="Trips"
                                    sublabel={`max $${MAX_TRIPS}`}
                                    chips={tripsView.chips}
                                    totalBet={tripsView.total}
                                    dim={70}
                                    diamond
                                    floatChips
                                    canBet={isBetting}
                                    isSelected={selectedSpot === "trips"}
                                    isWinner={tripsView.win}
                                    onSelect={() => setSelectedSpot("trips")}
                                    onRemove={() => removeLastChip("trips")}
                                />
                                <BetSpot
                                    testId="six"
                                    label="6 Card"
                                    sublabel={`max $${MAX_SIX_BONUS}`}
                                    chips={sixView.chips}
                                    totalBet={sixView.total}
                                    dim={82}
                                    floatChips
                                    canBet={isBetting}
                                    isSelected={selectedSpot === "six"}
                                    isWinner={sixView.win}
                                    onSelect={() => setSelectedSpot("six")}
                                    onRemove={() => removeLastChip("six")}
                                />
                            </div>

                            {/* Row 2: ANTE = BLIND */}
                            <div className="flex items-center gap-3">
                                <BetSpot
                                    testId="ante"
                                    label="Ante"
                                    sublabel={`min $${MIN_MAIN_BET}`}
                                    chips={anteView.chips}
                                    totalBet={anteView.total}
                                    dim={90}
                                    floatChips
                                    canBet={isBetting}
                                    isSelected={selectedSpot === "ante"}
                                    isWinner={anteView.win}
                                    onSelect={() => setSelectedSpot("ante")}
                                    onRemove={() => removeLastChip("ante")}
                                />
                                <span className="text-base font-bold text-white/90" style={{ letterSpacing: "0.05em" }}>=</span>
                                <BetSpot
                                    testId="blind"
                                    label="Blind"
                                    sublabel="matches ante"
                                    chips={blindView.chips}
                                    totalBet={blindView.total}
                                    dim={90}
                                    floatChips
                                    isLocked
                                    canBet={false}
                                    isSelected={false}
                                    isWinner={blindView.win}
                                />
                            </div>

                            {/* Row 3: PLAY */}
                            <BetSpot
                                testId="play"
                                label="Play"
                                chips={playView.chips}
                                totalBet={playView.total}
                                dim={90}
                                floatChips
                                isLocked
                                canBet={false}
                                isSelected={false}
                                isWinner={playView.win}
                            />
                        </div>

                    </div>

                    {/* Cards column - center on desktop */}
                    <div className={`order-1 flex w-full flex-col items-center justify-center gap-3 py-2 lg:order-2 lg:flex-1`}>
                        {/* Dealer */}
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[13px] font-bold text-white/75">Dealer</span>
                            <div className="flex gap-2" data-testid="dealer-cards">
                                <AnimatePresence>
                                    {round.dealer.map((card, i) => (
                                        <motion.div key={`${deckNo}-${card.id}`} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.1)}>
                                            <PlayingCard card={toShared(card, i < dealerShown)} className={CARD_CLS} />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                {round.dealer.length === 0 && <div className="flex gap-2 opacity-20"><div className={`${CARD_CLS} border border-white/20 bg-white/5`} /><div className={`${CARD_CLS} border border-white/20 bg-white/5`} /></div>}
                            </div>
                            <span className="h-4 text-xs font-semibold text-amber-100">{dealerShown >= 2 ? dealerHandText : ""}</span>
                        </div>
                        {/* Board */}
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[13px] font-bold text-white/75">Board</span>
                            <div className="flex gap-1.5 sm:gap-2" data-testid="board-cards">
                                <AnimatePresence>
                                    {round.board.map((card, i) => (
                                        <motion.div key={`${deckNo}-${card.id}`} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.08)}>
                                            <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                {Array.from({ length: 5 - round.board.length }).map((_, i) => (
                                    <div key={i} className={`${CARD_CLS} border border-white/10 bg-white/5 opacity-20`} />
                                ))}
                            </div>
                        </div>
                        {/* Player, with the 6 Card Bonus cards alongside */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex items-end gap-3">
                                <div className="flex gap-2" data-testid="player-cards">
                                    <AnimatePresence>
                                        {round.player.map((card, i) => (
                                            <motion.div key={`${deckNo}-${card.id}`} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.1)}>
                                                <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    {round.player.length === 0 && <div className="flex gap-2 opacity-20"><div className={`${CARD_CLS} border border-white/20 bg-white/5`} /><div className={`${CARD_CLS} border border-white/20 bg-white/5`} /></div>}
                                </div>
                                {hasSixBet && round.hiddenSixBonusCards.length > 0 && (
                                    <div className="flex flex-col items-center gap-1" data-testid="six-cards">
                                        <span className="text-[13px] font-bold text-white/75">6 Card Bonus</span>
                                        <div className="flex gap-1">
                                            {round.hiddenSixBonusCards.map((card, i) => (
                                                <motion.div key={`${deckNo}-${card.id}`} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(0.2 + i * 0.06)}>
                                                    <PlayingCard card={toShared(card, i < sixShown)} className={BONUS_CARD_CLS} />
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <span className="h-4 text-xs font-semibold text-amber-100">
                                {playerHandText}
                                {hasSixBet && sixShown >= 4 && sixBonusResult && (
                                    <span className={sixBonusResult.category === "No Bonus" ? "text-white/75" : "text-amber-200"}>
                                        {" · 6 Card: "}{sixBonusResult.category}
                                    </span>
                                )}
                            </span>
                            <span className="text-[13px] font-bold text-white/75">Player</span>
                        </div>
                        <p className="text-center text-sm font-semibold text-amber-50" data-testid="message">{message}</p>
                        {/* The bet results. Their row is always here, so nothing moves when they appear. */}
                        {/* room for two lines on a phone, where the results wrap */}
                        <div className="flex min-h-[96px] items-center justify-center sm:min-h-[46px]">
                            {resolvedHand && payout && roundDone && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} data-testid="settlement">
                                <div className="flex flex-wrap items-center justify-center gap-1.5">
                                    {[
                                        { name: "Ante", result: anteResultText },
                                        { name: "Blind", result: blindResultText },
                                        { name: "Play", result: playResultText },
                                        { name: "Trips", result: tripsResultText },
                                        { name: "6 Card", result: sixCardResultText },
                                        ...(!resolvedHand.dealerQualified ? [{ name: "Dealer", result: "No Qualify" }] : []),
                                    ].map(({ name, result }) => {
                                        const isWin = result.startsWith("Win"), isLose = result === "Lose";
                                        return (
                                            <div key={name} data-result={name} className="rounded-[4px] border px-2.5 py-1 text-center text-xs" style={{ borderColor: isWin ? "rgba(52,211,153,0.3)" : isLose ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)", background: isWin ? "rgba(52,211,153,0.08)" : isLose ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.04)" }}>
                                                <div className="text-[13px] text-white/75">{name}</div>
                                                <div className={`font-extrabold ${isWin ? "text-emerald-300" : isLose ? "text-red-300" : "text-amber-100"}`}>{result}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                </motion.div>
                            )}
                        </div>
                    </div>

                    {/* Payout tables - vertically centered, right side */}
                    <div className="order-3 hidden w-72 shrink-0 flex-col justify-center lg:flex">
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
