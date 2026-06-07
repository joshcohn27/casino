import React, { useEffect, useRef, useState } from "react";
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
    BTN_NEUTRAL,
} from "./shared/money";
import { SlideBtn } from "./shared/SlideBtn";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { rank: Rank; suit: Suit; value: number; id: string };
type HandRank = "Straight Flush" | "Three of a Kind" | "Straight" | "Flush" | "Pair" | "High Card";
type FiveCardRank = "Royal Flush" | "Straight Flush" | "Four of a Kind" | "Full House" | "Flush" | "Straight" | "Three of a Kind" | "No Bonus";
type Stage = "betting" | "dealt" | "showdown" | "done";
type BetZoneId = "ante" | "pairplus" | "sixcard";

type SettleResult = {
    playerRank: HandRank;
    dealerRank: HandRank;
    qualified: boolean;
    cmp: number;
    anteReturn: number;
    anteBonusWin: number;
    playReturn: number;
    ppReturn: number;
    sixCardReturn: number;
    sixCardRank: FiveCardRank;
    net: number;
    folded: boolean;
};

type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };

// ─── Constants ────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES: Record<Rank, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

const PAIR_PLUS_TABLE: Record<string, number> = {
    "Straight Flush": 40, "Three of a Kind": 30, "Straight": 6, "Flush": 4, "Pair": 1,
};
const ANTE_BONUS_TABLE: Record<string, number> = {
    "Straight Flush": 5, "Three of a Kind": 4, "Straight": 1,
};
const SIX_CARD_TABLE: Record<string, number> = {
    "Royal Flush": 1000, "Straight Flush": 200, "Four of a Kind": 50,
    "Full House": 25, "Flush": 15, "Straight": 10, "Three of a Kind": 5,
};

const FIVE_CARD_ORDER: FiveCardRank[] = [
    "Royal Flush", "Straight Flush", "Four of a Kind", "Full House",
    "Flush", "Straight", "Three of a Kind", "No Bonus",
];

const ANTE_KEY = "casino-tcp-ante";
const PP_KEY   = "casino-tcp-pairplus";
const SC_KEY   = "casino-tcp-sixcard";
const CHIP_KEY = "casino-tcp-chip";

const FELT_COLOR = "#0c4a6e";
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

// ─── Utility functions ────────────────────────────────────────────────────────

function wait(ms: number) { return new Promise(resolve => window.setTimeout(resolve, ms)); }

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
            deck.push({ rank, suit, value: RANK_VALUES[rank], id: `${rank}${suit}` });
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

// ─── 3-card hand evaluation ───────────────────────────────────────────────────

function evaluate3Cards(cards: Card[]): { rank: HandRank; score: number; highValue: number } {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const [v0, v1, v2] = sorted.map(c => c.value);
    const sameSuit = sorted[0].suit === sorted[1].suit && sorted[1].suit === sorted[2].suit;
    const isTrips = v0 === v1 && v1 === v2;
    const isPair = v0 === v1 || v1 === v2;
    const consec = (v0 - v1 === 1 && v1 - v2 === 1) || (v0 === 14 && v1 === 3 && v2 === 2);

    if (sameSuit && consec) return { rank: "Straight Flush", score: 6, highValue: v0 };
    if (isTrips)            return { rank: "Three of a Kind", score: 5, highValue: v0 };
    if (consec)             return { rank: "Straight", score: 4, highValue: v0 };
    if (sameSuit)           return { rank: "Flush", score: 3, highValue: v0 };
    if (isPair)             return { rank: "Pair", score: 2, highValue: v0 };
    return                         { rank: "High Card", score: 1, highValue: v0 };
}

function dealerQualifies(cards: Card[]): boolean {
    const { score, highValue } = evaluate3Cards(cards);
    return score >= 2 || highValue >= 12;
}

function compareHands(playerCards: Card[], dealerCards: Card[]): number {
    const p = evaluate3Cards(playerCards);
    const d = evaluate3Cards(dealerCards);
    if (p.score !== d.score) return p.score - d.score;
    const pv = [...playerCards].sort((a, b) => b.value - a.value).map(c => c.value);
    const dv = [...dealerCards].sort((a, b) => b.value - a.value).map(c => c.value);
    for (let i = 0; i < 3; i++) if (pv[i] !== dv[i]) return pv[i] - dv[i];
    return 0;
}

function getStrategySuggestion(cards: Card[]): "play" | "fold" {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const [v0, v1, v2] = sorted.map(c => c.value);
    const { score } = evaluate3Cards(cards);
    if (score >= 2) return "play";
    if (v0 >= 13) return "play";
    if (v0 === 12) {
        if (v1 >= 7) return "play";
        if (v1 === 6 && v2 >= 4) return "play";
        return "fold";
    }
    return "fold";
}

// ─── 5-card evaluation for 6 Card Bonus ──────────────────────────────────────

function evaluate5Cards(cards: Card[]): FiveCardRank {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const vals = sorted.map(c => c.value);
    const suits = sorted.map(c => c.suit);

    const flush = suits.every(s => s === suits[0]);
    const straight = [...new Set(vals)].length === 5 && vals[0] - vals[4] === 4;
    const wheel = vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2;
    const anyStraight = straight || wheel;

    const counts = new Map<number, number>();
    for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
    const freqs = [...counts.values()].sort((a, b) => b - a);

    if (flush && anyStraight) {
        return !wheel && vals[0] === 14 && vals[1] === 13 ? "Royal Flush" : "Straight Flush";
    }
    if (freqs[0] === 4) return "Four of a Kind";
    if (freqs[0] === 3 && freqs[1] === 2) return "Full House";
    if (flush) return "Flush";
    if (anyStraight) return "Straight";
    if (freqs[0] === 3) return "Three of a Kind";
    return "No Bonus";
}

function best5of6(cards: Card[]): FiveCardRank {
    let best: FiveCardRank = "No Bonus";
    for (let skip = 0; skip < 6; skip++) {
        const five = cards.filter((_, i) => i !== skip);
        const rank = evaluate5Cards(five);
        if (FIVE_CARD_ORDER.indexOf(rank) < FIVE_CARD_ORDER.indexOf(best)) best = rank;
    }
    return best;
}

// ─── Settlement ───────────────────────────────────────────────────────────────

function settle(params: {
    playerCards: Card[]; dealerCards: Card[];
    anteBet: number; pairPlusBet: number; sixCardBet: number; playBet: number; folded: boolean;
}): SettleResult {
    const { playerCards, dealerCards, anteBet, pairPlusBet, sixCardBet, playBet, folded } = params;

    const playerHand = evaluate3Cards(playerCards);
    const dealerHand = evaluate3Cards(dealerCards);
    const qualified = dealerQualifies(dealerCards);
    const cmp = folded ? -1 : compareHands(playerCards, dealerCards);

    let anteReturn = 0;
    let anteBonusWin = 0;
    let playReturn = 0;

    if (!folded) {
        if (qualified) {
            if (cmp > 0)      { anteReturn = anteBet * 2; playReturn = playBet * 2; }
            else if (cmp < 0) { anteReturn = 0;           playReturn = 0;           }
            else              { anteReturn = anteBet;      playReturn = playBet;     }
        } else {
            anteReturn = anteBet * 2;
            playReturn = playBet;
        }
        anteBonusWin = (ANTE_BONUS_TABLE[playerHand.rank] ?? 0) * anteBet;
    }

    let ppReturn = 0;
    if (pairPlusBet > 0 && !folded) {
        const mult = PAIR_PLUS_TABLE[playerHand.rank] ?? 0;
        if (mult > 0) ppReturn = pairPlusBet * (mult + 1);
    }

    let sixCardReturn = 0;
    let sixCardRank: FiveCardRank = "No Bonus";
    if (sixCardBet > 0) {
        sixCardRank = best5of6([...playerCards, ...dealerCards]);
        const mult = SIX_CARD_TABLE[sixCardRank] ?? 0;
        if (mult > 0) sixCardReturn = sixCardBet * (mult + 1);
    }

    const totalReturned = anteReturn + anteBonusWin + playReturn + ppReturn + sixCardReturn;
    const totalDeducted = anteBet + pairPlusBet + sixCardBet + (folded ? 0 : playBet);
    const net = totalReturned - totalDeducted;

    return {
        playerRank: playerHand.rank, dealerRank: dealerHand.rank,
        qualified, cmp, anteReturn, anteBonusWin, playReturn, ppReturn,
        sixCardReturn, sixCardRank, net, folded,
    };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChipStack({ chips, onClick }: { chips: ChipDenomination[]; onClick: () => void }) {
    const visible = chips.slice(-3);
    const startIdx = chips.length - visible.length;
    const stackH = 52 + (visible.length > 0 ? (visible.length - 1) * STACK_GAP : 0);
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

function BetZone({ chips, totalBet, label, sublabel, size, isSelected, isWinner, isLocked, onClick, onRemove, canBet }: {
    chips: ChipDenomination[]; totalBet: number; label: string; sublabel: string;
    size: "large" | "small"; isSelected: boolean; isWinner: boolean; isLocked?: boolean;
    onClick: () => void; onRemove: () => void; canBet: boolean;
}) {
    const dim = size === "large" ? 110 : 82;
    const ring = isWinner   ? "border-amber-300/80 shadow-[0_0_28px_rgba(251,191,36,0.35)]"
               : isSelected ? "border-white/60 shadow-[0_0_16px_rgba(255,255,255,0.2)]"
               :              "border-white/30";
    const bg   = isWinner   ? "bg-amber-300/10"
               : isSelected ? "bg-white/10"
               :              "bg-black/20";
    return (
        <div className="flex flex-col items-center">
            {chips.length > 0 ? <ChipStack chips={chips} onClick={onRemove} /> : <div style={{ height: 0 }} />}
            <button
                onClick={onClick}
                disabled={!canBet || !!isLocked}
                className={`relative flex flex-col items-center justify-center rounded-full border-2 border-dashed backdrop-blur-sm transition-all duration-200 ${ring} ${bg}`}
                style={{ width: dim, height: dim }}
            >
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/80">{label}</span>
                <span className="mt-0.5 text-[10px] font-normal text-white/45">{sublabel}</span>
                {totalBet > 0 && (
                    <span className="mt-1 text-[10px] font-extrabold text-amber-200">{formatMoney(totalBet)}</span>
                )}
            </button>
        </div>
    );
}

function PlayCircle({ bet }: { bet: number }) {
    return (
        <div className="flex flex-col items-center">
            <div style={{ height: 0 }} />
            <div
                className="flex flex-col items-center justify-center rounded-full border-2 border-dashed border-emerald-400/60 bg-emerald-900/20"
                style={{ width: 82, height: 82 }}
            >
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-200/80">Play</span>
                <span className="mt-0.5 text-[10px] font-normal text-white/45">1×</span>
                {bet > 0 && (
                    <span className="mt-1 text-[10px] font-extrabold text-emerald-300">{formatMoney(bet)}</span>
                )}
            </div>
        </div>
    );
}

function PayoutColumn({ title, entries, highlight }: {
    title: string; entries: Record<string, number>; highlight?: string;
}) {
    const sorted = Object.entries(entries).sort((a, b) => b[1] - a[1]);
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">
                {title}
            </div>
            {sorted.map(([hand, mult]) => {
                const hit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={hit ? "font-extrabold text-amber-100" : "text-white/45"}>{hand}</span>
                        <span className={`shrink-0 font-bold ${hit ? "text-amber-300" : "text-white/35"}`}>{mult}:1</span>
                    </div>
                );
            })}
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
                { label: "Bet", val: pendingBet > 0 ? formatMoney(pendingBet) : "—", color: "text-white" },
                { label: "Returned", val: showResult ? formatMoney(returned) : "—", color: "text-white" },
                { label: "Net", val: showResult ? (net >= 0 ? "+" : "") + formatMoney(net) : "—", color: showResult ? netColor : "text-white" },
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

function CardRow({ cards, faceUp, placeholder }: { cards: Card[]; faceUp: boolean; placeholder?: boolean }) {
    if (cards.length === 0) {
        if (!placeholder) return null;
        return (
            <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                    <div key={i} className={`${CARD_CLS} border border-dashed border-white/15 bg-white/5 rounded-[10px] sm:rounded-[12px]`} />
                ))}
            </div>
        );
    }
    return (
        <div className="flex gap-2">
            {cards.map((card, i) => (
                <motion.div
                    key={card.id}
                    variants={CARD_VARIANTS}
                    initial="initial"
                    animate="animate"
                    transition={CARD_TRANSITION(i * 0.08)}
                >
                    <PlayingCard card={toShared(card, faceUp)} className={CARD_CLS} />
                </motion.div>
            ))}
        </div>
    );
}

// ─── Rules modal ─────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;

    const Section = ({ title, items }: { title: string; items: string[] }) => (
        <section>
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-300/80">
                {title}
            </h3>
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
                        Three Card Poker Rules
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
                        "You and the dealer each receive 3 cards from a single 52-card deck.",
                        "Place an Ante to play. Pair Plus and 6 Card Bonus are optional side bets placed before the deal.",
                        "After seeing your 3 cards, choose to Play (place a Play bet equal to your Ante) or Fold (forfeit your Ante and Pair Plus).",
                        "The dealer then reveals their hand.",
                    ]} />
                    <Section title="Dealer Qualification" items={[
                        "Dealer must have Queen-high or better to qualify.",
                        "If the dealer does NOT qualify: your Ante wins 1:1 and your Play bet is returned (push) — you cannot lose to a non-qualifying dealer.",
                        "If the dealer qualifies and you win: Ante and Play both pay 1:1.",
                        "If the dealer qualifies and dealer wins: Ante and Play are both lost.",
                        "Ties push on Ante and Play.",
                    ]} />
                    <Section title="Ante Bonus" items={[
                        "Pays on your hand regardless of the dealer result or whether the dealer qualifies.",
                        "Not paid if you fold.",
                        "Straight Flush pays 5:1.",
                        "Three of a Kind pays 4:1.",
                        "Straight pays 1:1.",
                    ]} />
                    <Section title="Pair Plus" items={[
                        "Pays on your hand regardless of whether you beat the dealer or the dealer qualifies.",
                        "Lost if you fold.",
                        "Straight Flush 40:1 · Three of a Kind 30:1 · Straight 6:1 · Flush 4:1 · Pair 1:1.",
                    ]} />
                    <Section title="6 Card Bonus" items={[
                        "Uses the best 5-card hand from your 3 cards combined with the dealer's 3 cards.",
                        "Settled at showdown regardless of whether you folded or the dealer qualified.",
                        "Pays as shown in the payout table.",
                    ]} />
                    <Section title="Hand Rankings" items={[
                        "Straight Flush beats Three of a Kind in Three Card Poker — note this differs from standard poker where a straight flush also tops the rankings, but Three of a Kind beats a regular Straight here because it is harder to make with only 3 cards.",
                        "High to low: Straight Flush · Three of a Kind · Straight · Flush · Pair · High Card.",
                    ]} />
                    <Section title="Basic Strategy" items={[
                        "The optimal strategy is simple: play any hand of Queen-6-4 or better. Fold everything else.",
                        "If your highest card is a King or Ace, always play regardless of your other two cards.",
                        "If your highest card is a Queen, play if your second card is 7 or higher. If your second card is a 6, play only if your third card is 4 or higher. Otherwise fold.",
                        "If your highest card is a Jack or lower, always fold.",
                        "The house edge playing this strategy is approximately 3.4% on the Ante and Play.",
                        "Pair Plus has no strategy — it pays based on your cards alone regardless of what you decide with your Ante.",
                        "The Suggest indicator on the felt uses this exact strategy and updates in real time as your cards are dealt.",
                    ]} />
                </div>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ThreeCardPoker({ bankroll, setBankroll }: Props) {
    const [stage, setStage] = useState<Stage>("betting");
    const [deck, setDeck] = useState<Card[]>(() => createDeck());
    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [dealerCards, setDealerCards] = useState<Card[]>([]);

    const [anteChips, setAnteChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(readStored(ANTE_KEY, 0)));
    const [ppChips, setPpChips]     = useState<ChipDenomination[]>(() => buildChipStackFromAmount(readStored(PP_KEY, 0)));
    const [scChips, setScChips]     = useState<ChipDenomination[]>(() => buildChipStackFromAmount(readStored(SC_KEY, 0)));

    const [anteBet, setAnteBet]         = useState(0);
    const [pairPlusBet, setPairPlusBet] = useState(0);
    const [sixCardBet, setSixCardBet]   = useState(0);
    const [playBet, setPlayBet]         = useState(0);

    const [selectedZone, setSelectedZone] = useState<BetZoneId>("ante");
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(() => {
        const v = readStored(CHIP_KEY, 5);
        return ([1, 2.5, 5, 25, 100, 500, 1000, 5000].includes(v) ? v : 5) as ChipDenomination;
    });
    const [resultInfo, setResultInfo] = useState<SettleResult | null>(null);
    const [showRules, setShowRules] = useState(false);
    const resolving = useRef(false);

    // Derived
    const pendingAnte = anteChips.reduce((s, d) => s + Number(d), 0);
    const pendingPp   = ppChips.reduce((s, d) => s + Number(d), 0);
    const pendingSc   = scChips.reduce((s, d) => s + Number(d), 0);

    // Persist
    useEffect(() => { window.localStorage.setItem(ANTE_KEY, String(pendingAnte)); }, [pendingAnte]);
    useEffect(() => { window.localStorage.setItem(PP_KEY, String(pendingPp)); }, [pendingPp]);
    useEffect(() => { window.localStorage.setItem(SC_KEY, String(pendingSc)); }, [pendingSc]);
    useEffect(() => { window.localStorage.setItem(CHIP_KEY, String(selectedChip)); }, [selectedChip]);

    // ─── Bet helpers ──────────────────────────────────────────────────────────

    function addChip(zone: BetZoneId) {
        if (stage !== "betting") return;
        if (zone === "ante")     setAnteChips(p => [...p, selectedChip]);
        else if (zone === "pairplus") setPpChips(p => [...p, selectedChip]);
        else if (zone === "sixcard")  setScChips(p => [...p, selectedChip]);
    }

    function removeLastChip(zone: BetZoneId) {
        if (stage !== "betting") return;
        if (zone === "ante")          setAnteChips(p => p.slice(0, -1));
        else if (zone === "pairplus") setPpChips(p => p.slice(0, -1));
        else if (zone === "sixcard")  setScChips(p => p.slice(0, -1));
    }

    function handleZoneClick(zone: BetZoneId) {
        if (stage !== "betting") return;
        if (zone === "ante") {
            setSelectedZone("ante");
            addChip("ante");
        } else {
            if (selectedZone === zone) addChip(zone);
            else setSelectedZone(zone);
        }
    }

    function handleClear() {
        setAnteChips([]);
        setPpChips([]);
        setScChips([]);
        setSelectedZone("ante");
    }

    // ─── Game actions ─────────────────────────────────────────────────────────

    function handleDeal() {
        if (pendingAnte <= 0 || bankroll < pendingAnte + pendingPp + pendingSc) return;
        const total = pendingAnte + pendingPp + pendingSc;
        setBankroll(p => p - total);

        const newDeck = deck.length < 10 ? createDeck() : deck;
        const [pCards, d1] = draw(newDeck, 3);
        const [dCards, d2] = draw(d1, 3);

        setAnteBet(pendingAnte);
        setPairPlusBet(pendingPp);
        setSixCardBet(pendingSc);
        setPlayerCards(pCards);
        setDealerCards(dCards);
        setDeck(d2);
        setResultInfo(null);
        setPlayBet(0);
        setStage("dealt");
    }

    async function handleFold() {
        if (stage !== "dealt" || resolving.current) return;
        resolving.current = true;
        setStage("showdown");
        await wait(600);
        const settled = settle({ playerCards, dealerCards, anteBet, pairPlusBet, sixCardBet, playBet: 0, folded: true });
        setBankroll(p => p + settled.anteReturn + settled.anteBonusWin + settled.playReturn + settled.ppReturn + settled.sixCardReturn);
        setResultInfo(settled);
        setStage("done");
        resolving.current = false;
    }

    async function handlePlay() {
        if (stage !== "dealt" || resolving.current) return;
        const pb = anteBet;
        if (bankroll < pb) return;
        resolving.current = true;
        setPlayBet(pb);
        setBankroll(p => p - pb);
        setStage("showdown");
        await wait(600);
        const settled = settle({ playerCards, dealerCards, anteBet, pairPlusBet, sixCardBet, playBet: pb, folded: false });
        setBankroll(p => p + settled.anteReturn + settled.anteBonusWin + settled.playReturn + settled.ppReturn + settled.sixCardReturn);
        setResultInfo(settled);
        setStage("done");
        resolving.current = false;
    }

    function handleNextHand() {
        if (deck.length < 10) setDeck(createDeck());
        setPlayerCards([]);
        setDealerCards([]);
        setAnteBet(0);
        setPairPlusBet(0);
        setSixCardBet(0);
        setPlayBet(0);
        setResultInfo(null);
        setSelectedZone("ante");
        setStage("betting");
    }

    // ─── Derived display ──────────────────────────────────────────────────────

    const canDeal = stage === "betting" && pendingAnte > 0 && bankroll >= pendingAnte + pendingPp + pendingSc;
    const canPlay = stage === "dealt" && bankroll >= anteBet;
    const dealerFaceUp = stage === "showdown" || stage === "done";

    const ppHighlight  = resultInfo && !resultInfo.folded ? resultInfo.playerRank : undefined;
    const scHighlight  = resultInfo && sixCardBet > 0 ? resultInfo.sixCardRank : undefined;

    const netColor = resultInfo
        ? resultInfo.net > 0 ? "text-emerald-300" : resultInfo.net < 0 ? "text-red-300" : "text-amber-100"
        : "text-white";

    const dealerStatusLabel = resultInfo
        ? resultInfo.qualified
            ? `Qualifies — ${resultInfo.dealerRank}`
            : "Does not qualify — Ante wins, Play returned"
        : null;

    const playerResultLabel = resultInfo
        ? resultInfo.folded
            ? "Folded"
            : resultInfo.cmp > 0 ? `Win — ${resultInfo.playerRank}`
            : resultInfo.cmp < 0 ? `Lose — ${resultInfo.playerRank}`
            : `Push — ${resultInfo.playerRank}`
        : null;

    const suggestion =
        stage === "dealt" && playerCards.length === 3
            ? getStrategySuggestion(playerCards)
            : null;

    const totalBet = stage === "betting"
        ? pendingAnte + pendingPp + pendingSc
        : anteBet + pairPlusBet + sixCardBet + playBet;
    const totalReturned = resultInfo
        ? resultInfo.anteReturn + resultInfo.anteBonusWin + resultInfo.playReturn + resultInfo.ppReturn + resultInfo.sixCardReturn
        : 0;

    // ─── Payout right column ──────────────────────────────────────────────────

    const rightColumn = (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <PayoutColumn title="Pair Plus" entries={PAIR_PLUS_TABLE} highlight={ppHighlight} />
            <div className="my-2 h-px bg-white/10" />
            <PayoutColumn title="Ante Bonus" entries={ANTE_BONUS_TABLE} highlight={ppHighlight} />
            <div className="my-2 h-px bg-white/10" />
            <PayoutColumn title="6 Card Bonus" entries={SIX_CARD_TABLE} highlight={scHighlight} />
        </div>
    );

    // ─── Hand rankings left column ────────────────────────────────────────────

    const leftColumn = (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">
                Hand Rankings
            </div>
            {([
                ["Straight Flush", "Suited & consecutive"],
                ["Three of a Kind", "Three same rank"],
                ["Straight", "Consecutive"],
                ["Flush", "Same suit"],
                ["Pair", "Two same rank"],
                ["High Card", "Best card wins"],
            ] as [string, string][]).map(([rank, desc], i) => (
                <div key={rank} className="flex items-start justify-between gap-2 py-0.5 text-[11px]">
                    <div>
                        <span className="font-bold text-white/80">{rank}</span>
                        <div className="text-[10px] text-white/35">{desc}</div>
                    </div>
                    <span className="shrink-0 text-white/20">#{i + 1}</span>
                </div>
            ))}
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-white/45">
                Dealer qualifies with <span className="font-bold text-white/65">Queen-high</span> or better
            </div>
        </div>
    );

    // ─── JSX ─────────────────────────────────────────────────────────────────

    return (
        <>
        <RulesModal open={showRules} onClose={() => setShowRules(false)} />
        <TableShell
            feltColor={FELT_COLOR}
            gameName="Three Card Poker"
            bankroll={bankroll}
            hideHeader
            actionBar={
                <div className="flex flex-col gap-2 border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
                    <ChipTray selectedChip={selectedChip} onSelect={setSelectedChip} disabled={stage !== "betting"} />
                    <div className="flex items-center justify-center gap-2">
                        <AnimatePresence mode="popLayout" initial={false}>
                            {stage === "betting" && pendingAnte === 0 && pendingPp === 0 && pendingSc === 0
                                ? null
                                : stage === "betting" && (
                                    <SlideBtn key="clear">
                                        <button className={BTN_NEUTRAL} onClick={handleClear}>
                                            Clear
                                        </button>
                                    </SlideBtn>
                                )}
                            {stage === "betting" && (
                                <SlideBtn key="deal">
                                    <button className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal}>
                                        Deal
                                    </button>
                                </SlideBtn>
                            )}
                            {stage === "dealt" && (
                                <SlideBtn key="fold">
                                    <button className={BTN_NEUTRAL} onClick={handleFold}>
                                        Fold
                                    </button>
                                </SlideBtn>
                            )}
                            {stage === "dealt" && (
                                <SlideBtn key="play">
                                    <button className={BTN_GOLD} onClick={handlePlay} disabled={!canPlay}>
                                        Play
                                    </button>
                                </SlideBtn>
                            )}
                            {stage === "showdown" && (
                                <motion.span
                                    key="resolving"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-sm italic text-white/40"
                                >
                                    Resolving…
                                </motion.span>
                            )}
                            {stage === "done" && (
                                <SlideBtn key="next">
                                    <button className={BTN_GOLD} onClick={handleNextHand}>
                                        Next Hand
                                    </button>
                                </SlideBtn>
                            )}
                        </AnimatePresence>
                    </div>
                    <div className="invisible hidden sm:block">
                        <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
                    </div>
                </div>
            }
        >
            {/* Game title */}
            <div className="flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-2">
                    <h1
                        className="text-xl font-extrabold uppercase tracking-[0.18em] text-amber-100/90"
                        style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                    >
                        Three Card Poker
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
                    <span>ANTE · PLAY · PAIR PLUS</span>
                    <span className="text-white/20">·</span>
                    <span>6 CARD BONUS</span>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                {/* Left column — hand rankings (desktop only) */}
                <div className="hidden w-64 shrink-0 flex-col justify-center lg:flex">
                    {leftColumn}
                </div>

                {/* Center column — main game */}
                <div className="flex w-full flex-col items-center justify-center gap-4 py-2 lg:flex-1">

                    {/* Bet bar */}
                    <BetBar
                        pendingBet={totalBet}
                        returned={totalReturned}
                        net={resultInfo?.net ?? 0}
                        showResult={stage === "done"}
                    />

                    {/* Dealer area */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Dealer</div>
                        <CardRow cards={dealerCards} faceUp={dealerFaceUp} placeholder />
                        <AnimatePresence>
                            {dealerStatusLabel && (
                                <motion.div
                                    key="dealer-status"
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={`text-[11px] font-bold ${resultInfo?.qualified ? "text-emerald-300" : "text-red-300"}`}
                                >
                                    {dealerStatusLabel}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Bet zones */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="flex items-end gap-4">
                            <BetZone
                                chips={ppChips}
                                totalBet={stage === "betting" ? pendingPp : pairPlusBet}
                                label="Pair Plus"
                                sublabel="optional"
                                size="small"
                                isSelected={selectedZone === "pairplus"}
                                isWinner={!!(resultInfo && !resultInfo.folded && resultInfo.ppReturn > 0)}
                                onClick={() => handleZoneClick("pairplus")}
                                onRemove={() => removeLastChip("pairplus")}
                                canBet={stage === "betting"}
                            />
                            <BetZone
                                chips={anteChips}
                                totalBet={stage === "betting" ? pendingAnte : anteBet}
                                label="Ante"
                                sublabel="required"
                                size="large"
                                isSelected={selectedZone === "ante"}
                                isWinner={!!(resultInfo && !resultInfo.folded && resultInfo.anteReturn > anteBet)}
                                onClick={() => handleZoneClick("ante")}
                                onRemove={() => removeLastChip("ante")}
                                canBet={stage === "betting"}
                            />
                            <BetZone
                                chips={scChips}
                                totalBet={stage === "betting" ? pendingSc : sixCardBet}
                                label="6 Card"
                                sublabel="optional, best 5 of 6 cards"
                                size="small"
                                isSelected={selectedZone === "sixcard"}
                                isWinner={!!(resultInfo && resultInfo.sixCardReturn > 0)}
                                onClick={() => handleZoneClick("sixcard")}
                                onRemove={() => removeLastChip("sixcard")}
                                canBet={stage === "betting"}
                            />
                        </div>

                        {/* Play circle (shown after deal) */}
                        <AnimatePresence>
                            {(stage === "dealt" || stage === "showdown" || stage === "done") && (
                                <motion.div
                                    key="play-circle"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <PlayCircle bet={playBet} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Player area */}
                    <div className="flex flex-col items-center gap-2">
                        <CardRow cards={playerCards} faceUp placeholder />
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Player</div>
                        <AnimatePresence>
                            {suggestion && (
                                <motion.div
                                    key="suggestion"
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-extrabold ${
                                        suggestion === "play"
                                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                                            : "border-red-400/30 bg-red-500/10 text-red-300"
                                    }`}
                                >
                                    <span className="text-[10px] uppercase tracking-[0.15em] opacity-70">Suggest</span>
                                    <span>{suggestion === "play" ? "Play" : "Fold"}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <AnimatePresence>
                            {playerResultLabel && (
                                <motion.div
                                    key="player-result"
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={`text-[11px] font-bold ${netColor}`}
                                >
                                    {playerResultLabel}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                </div>

                {/* Right column — payout tables (desktop only) */}
                <div className="hidden w-64 shrink-0 flex-col justify-center lg:flex">
                    {rightColumn}
                </div>

            </div>
        </TableShell>
        </>
    );
}
