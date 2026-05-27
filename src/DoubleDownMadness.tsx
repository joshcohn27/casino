import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination } from "./shared/money";

type Suit = "♠" | "♥" | "♦" | "♣";
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
    | "A";

type Card = {
    rank: Rank;
    suit: Suit;
    value: number;
    id: string;
    sideways?: boolean;
};

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

type Stage =
    | "betting"
    | "insurance"
    | "player"
    | "dealer"
    | "done"
    | "shuffling";

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const MIN_BET = 5;
const SIDE_STEP = 5;
const SIDE_MAX = 100;
const SHOE_DECKS = 6;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.82;
const RESHUFFLE_REMAINING = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));
const SHUFFLE_DELAY_MS = 1800;

const BET_STORAGE_KEY = "double-down-madness-main-bet";
const PUSH22_STORAGE_KEY = "double-down-madness-push22-bet";

// ─── Pure functions (preserved) ───────────────────────────────────────────────

function shuffle<T>(arr: T[]) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createShoe() {
    const shoe: Card[] = [];
    for (let deckIndex = 0; deckIndex < SHOE_DECKS; deckIndex++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                let value = Number(rank);
                if (rank === "J" || rank === "Q" || rank === "K") value = 10;
                if (rank === "A") value = 11;
                shoe.push({
                    rank,
                    suit,
                    value,
                    id: `${deckIndex}-${rank}${suit}-${Math.random().toString(36).slice(2, 10)}`,
                });
            }
        }
    }
    return shuffle(shoe);
}

function total(cards: Card[]) {
    let sum = cards.reduce((acc, c) => acc + c.value, 0);
    let aces = cards.filter((c) => c.rank === "A").length;
    while (sum > 21 && aces > 0) {
        sum -= 10;
        aces--;
    }
    return sum;
}

function isSoft(cards: Card[]) {
    let sum = cards.reduce((acc, c) => acc + c.value, 0);
    let aces = cards.filter((c) => c.rank === "A").length;
    while (sum > 21 && aces > 0) {
        sum -= 10;
        aces--;
    }
    return aces > 0;
}

function isTenValue(rank: Rank) {
    return rank === "10" || rank === "J" || rank === "Q" || rank === "K";
}

function formatMoney(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
        minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clampMainBet(value: number) {
    return Math.max(MIN_BET, Math.floor(value / 5) * 5);
}

function clampSideBet(value: number) {
    return Math.max(0, Math.min(SIDE_MAX, Math.floor(value / SIDE_STEP) * SIDE_STEP));
}

function shouldShuffle(deck: Card[]) {
    return deck.length <= RESHUFFLE_REMAINING || deck.length < 20;
}

function blackjackMultiplier(suited: boolean) {
    return suited ? 2 : 1.5;
}

function isSuitedBlackjack(cards: Card[]) {
    return cards.length === 2 && total(cards) === 21 && cards[0].suit === cards[1].suit;
}

function isMadnessBlackjack(cards: Card[]) {
    return cards.length === 2 && total(cards) === 21;
}

function getDealerDisplayTotal(dealer: Card[], stage: Stage) {
    if (!dealer.length) return "—";
    if (stage === "dealer" || stage === "done") {
        return `${total(dealer)}${isSoft(dealer) ? " soft" : ""}`;
    }
    const up = dealer[0];
    if (!up) return "—";
    return up.rank === "A" ? "11" : `${up.value}`;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function buildChipStack(amount: number): ChipDenomination[] {
    const CHIP_VALUES: ChipDenomination[] = [5000, 1000, 500, 100, 25, 5, 2.5, 1];
    let remaining = Math.round(amount * 100);
    const stack: ChipDenomination[] = [];
    for (const denom of CHIP_VALUES) {
        const cents = Math.round(Number(denom) * 100);
        while (remaining >= cents) { stack.push(denom); remaining -= cents; }
    }
    return stack;
}

function toShared(card: Card, faceUp: boolean): SharedCard {
    return {
        id: card.id,
        suit: card.suit as SharedCard["suit"],
        rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"],
        faceUp,
    };
}

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";

const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
};

const CARD_TRANSITION = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

const CHIP_COLORS: Record<ChipDenomination, { bg: string; border: string; text: string; label: string }> = {
    1: { bg: "#f1f5f9", border: "#94a3b8", text: "#1e293b", label: "$1" },
    2.5: { bg: "#f9a8d4", border: "#be185d", text: "#500724", label: "$2.50" },
    5: { bg: "#dc2626", border: "#7f1d1d", text: "#fff", label: "$5" },
    25: { bg: "#16a34a", border: "#14532d", text: "#fff", label: "$25" },
    100: { bg: "#1e293b", border: "#0f172a", text: "#e2e8f0", label: "$100" },
    500: { bg: "#7c3aed", border: "#4c1d95", text: "#fff", label: "$500" },
    1000: { bg: "#b45309", border: "#78350f", text: "#fef3c7", label: "$1K" },
    5000: { bg: "#babbbd", border: "#6b7280", text: "#111827", label: "$5K" },
};

const BTN_NEUTRAL = "rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-white/16 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_GOLD = "rounded-xl border border-amber-200/70 bg-[linear-gradient(180deg,_#fde68a,_#f59e0b)] px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_GREEN = "rounded-xl border border-emerald-300/60 bg-[linear-gradient(180deg,_#6ee7b7,_#059669)] px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";

function SlideBtn({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
        >
            {children}
        </motion.div>
    );
}

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-full border border-zinc-300/25 bg-black/30 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-zinc-100">
            {children}
        </div>
    );
}

function BetBar({
    pendingBet, totalRisk, returned, net, stage,
}: {
    pendingBet: number; totalRisk: number; returned: number; net: number; stage: Stage;
}) {
    const showResult = stage === "done";
    const displayBet = totalRisk > 0 ? totalRisk : pendingBet;
    return (
        <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5">
            {[
                { label: "Bet In", val: displayBet > 0 ? formatMoney(displayBet) : "—", color: "text-white" },
                { label: "Returned", val: showResult ? formatMoney(returned) : "—", color: "text-white" },
                {
                    label: "Net",
                    val: showResult ? (net >= 0 ? "+" : "") + formatMoney(net) : "—",
                    color: showResult
                        ? net > 0 ? "text-emerald-300" : net < 0 ? "text-red-300" : "text-amber-100"
                        : "text-white",
                },
            ].map(({ label, val, color }, i, arr) => (
                <React.Fragment key={label}>
                    <div className="text-center">
                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">{label}</div>
                        <div className={`mt-0.5 text-sm font-extrabold ${color}`}>{val}</div>
                    </div>
                    {i < arr.length - 1 && <div className="h-6 w-px bg-white/10" />}
                </React.Fragment>
            ))}
        </div>
    );
}

const STACK_GAP = 9;

function BetCircle({
    chips, totalBet, label, interactive = false, onClick,
}: {
    chips: ChipDenomination[];
    totalBet: number;
    label: string;
    interactive?: boolean;
    onClick?: () => void;
}) {
    const visible = chips.slice(-3);
    const startIdx = chips.length - visible.length;
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-white/40">{label}</div>
            <div className="flex flex-col items-center">
                <div
                    className="relative z-10 flex justify-center"
                    style={{ width: 48, height: 48 + (visible.length > 1 ? (visible.length - 1) * STACK_GAP : 0), marginBottom: -20 }}
                >
                    <AnimatePresence>
                        {visible.map((denom, i) => {
                            const cfg = CHIP_COLORS[denom];
                            return (
                                <motion.div
                                    key={startIdx + i}
                                    className="absolute left-0 right-0 mx-auto flex h-12 w-12 select-none items-center justify-center rounded-full text-[10px] font-extrabold"
                                    style={{
                                        bottom: i * STACK_GAP, zIndex: i + 1,
                                        backgroundColor: cfg.bg, border: `3px solid ${cfg.border}`, color: cfg.text,
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
                <button
                    onClick={interactive ? onClick : undefined}
                    disabled={!interactive}
                    className={`flex h-[96px] w-[96px] items-center justify-center rounded-full border-2 border-dashed bg-black/20 backdrop-blur-sm transition ${interactive
                        ? "cursor-pointer border-white/40 hover:border-white/60 hover:bg-black/30"
                        : "cursor-default border-white/20"
                        }`}
                >
                    {totalBet === 0 ? (
                        <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/25">
                            {interactive ? "Click" : "—"}
                        </span>
                    ) : (
                        <span className="text-sm font-extrabold text-amber-100">{formatMoney(totalBet)}</span>
                    )}
                </button>
            </div>
        </div>
    );
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="px-1 py-2">
            <div className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.22em] text-zinc-300/80">
                {title}
            </div>
            {children}
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-zinc-400">{label}</span>
            <span className="font-semibold text-white">{value}</span>
        </div>
    );
}


// ─── Rules modal ──────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;

    const sections = [
        {
            title: "How the Hand Starts",
            items: [
                "• Place a main bet, then optionally add the Push 22 side bet.",
                "• The dealer gets 2 cards and you start with 1 card.",
                "• If the dealer shows an Ace, insurance is offered before the hand continues.",
            ],
        },
        {
            title: "Your Decisions",
            items: [
                "• You can hit, stand, double, or re-double while your total is under 21.",
                "• Any card drawn from a double or re-double turns sideways on the felt.",
                "• If you make 21, the dealer resolves the hand automatically.",
            ],
        },
        {
            title: "Blackjack Pays",
            items: [
                "• A 2-card 21 is blackjack.",
                "• Suited blackjack pays 2 to 1.",
                "• Unsuited blackjack pays 3 to 2.",
            ],
        },
        {
            title: "Dealer 22 + Push 22",
            items: [
                "• If the dealer makes exactly 22, standing main wagers push.",
                "• The Push 22 side bet wins when the dealer finishes on exactly 22.",
                "• Push 22 pays 12 to 1.",
                "• If you bust but have Push 22 bet, the dealer still draws out the hand to resolve the side bet.",
            ],
        },
    ];

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <button
                    className="absolute inset-0 bg-black/72 backdrop-blur-[3px]"
                    onClick={onClose}
                    aria-label="Close rules modal"
                />
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[820px] overflow-hidden rounded-[1.5rem] border border-zinc-200/20 bg-[linear-gradient(180deg,_rgba(39,39,42,0.98),_rgba(9,9,11,0.98))] text-white shadow-[0_20px_70px_rgba(0,0,0,0.65)]"
                >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90 sm:text-[11px]">
                                Game Info
                            </div>
                            <div className="mt-1 text-lg font-extrabold text-zinc-50 sm:text-2xl">
                                Double Down Madness Rules
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl font-bold text-white/85 transition hover:bg-white/10"
                            aria-label="Close rules modal"
                        >
                            ×
                        </button>
                    </div>

                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="grid gap-3 text-sm leading-6 text-zinc-100/88 sm:grid-cols-2">
                            {sections.map((section) => (
                                <div key={section.title} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                                    <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                        {section.title}
                                    </div>
                                    <div className="space-y-1">
                                        {section.items.map((item) => (
                                            <div key={item}>{item}</div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] p-4 text-sm leading-6 text-amber-50/90">
                            The big twist: doubling does not end your hand. You can keep playing after a double, then re-double again if your total is still under 21. If you bust with Push 22 active, the dealer still draws because the side bet depends on the dealer making exactly 22.
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ─── DDMBar ───────────────────────────────────────────────────────────────────

function DDMBar({
    stage, isShuffling, bet, sideBet, bankroll,
    canDouble, canHit, canStand, canTakeInsurance,
    doubleWagersCount,
    selectedChip, onChipSelect,
    onClear, onDeal, onTakeInsurance, onNoInsurance,
    onHit, onStand, onDouble, onNextHand,
}: {
    stage: Stage; isShuffling: boolean;
    bet: number; sideBet: number; bankroll: number;
    canDouble: boolean; canHit: boolean; canStand: boolean; canTakeInsurance: boolean;
    doubleWagersCount: number;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onDeal: () => void;
    onTakeInsurance: () => void; onNoInsurance: () => void;
    onHit: () => void; onStand: () => void; onDouble: () => void;
    onNextHand: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone = stage === "done";
    const isPlayer = stage === "player";
    const isDealer = stage === "dealer";
    const isInsurance = stage === "insurance";

    const canDeal = isBetting && !isShuffling && bet >= MIN_BET && bankroll >= clampMainBet(bet) + sideBet;
    const canClear = isBetting && (bet > 0 || sideBet > 0);

    return (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-white/10 bg-black/55 px-[10px] py-3 backdrop-blur-xl sm:px-4">

            {/* Left: chip tray */}
            <div className="flex items-center">
                {!isDealer ? (
                    <ChipTray
                        selectedChip={selectedChip}
                        onSelect={onChipSelect}
                        disabled={isPlayer || isInsurance || isShuffling}
                    />
                ) : (
                    <div className="w-px" />
                )}
            </div>

            {/* Center: stage buttons */}
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>

                    {canClear && (
                        <SlideBtn key="clear">
                            <button className={BTN_NEUTRAL} onClick={onClear}>Clear</button>
                        </SlideBtn>
                    )}

                    {isBetting && (
                        <SlideBtn key="deal">
                            <button className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}

                    {isInsurance && canTakeInsurance && (
                        <SlideBtn key="take-insurance">
                            <button className={BTN_GOLD} onClick={onTakeInsurance}>Take Insurance</button>
                        </SlideBtn>
                    )}

                    {isInsurance && canTakeInsurance && (
                        <SlideBtn key="no-insurance">
                            <button className={BTN_NEUTRAL} onClick={onNoInsurance}>No Insurance</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="hit">
                            <button className={BTN_NEUTRAL} onClick={onHit} disabled={!canHit}>Hit</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="stand">
                            <button className={BTN_NEUTRAL} onClick={onStand} disabled={!canStand}>Stand</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="double">
                            <button
                                className={doubleWagersCount > 0 ? BTN_GREEN : BTN_GOLD}
                                onClick={onDouble}
                                disabled={!canDouble}
                            >
                                {doubleWagersCount > 0 ? "Re-Double" : "Double"}
                            </button>
                        </SlideBtn>
                    )}

                    {isDealer && (
                        <motion.span
                            key="dealer-msg"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-sm italic text-white/40"
                        >
                            Dealer playing…
                        </motion.span>
                    )}

                    {isDone && (
                        <SlideBtn key="clear-done">
                            <button className={BTN_NEUTRAL} onClick={onClear}>Clear</button>
                        </SlideBtn>
                    )}

                    {isDone && (
                        <SlideBtn key="next-hand">
                            <button className={BTN_GOLD} onClick={onNextHand}>Next Hand</button>
                        </SlideBtn>
                    )}

                </AnimatePresence>
            </div>

            {/* Right: invisible mirror for centering */}
            <div className="invisible">
                <ChipTray selectedChip={selectedChip} onSelect={() => { }} disabled />
            </div>

        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DoubleDownMadness({ bankroll, setBankroll }: Props) {
    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [stage, setStage] = useState<Stage>("betting");

    const [bet, setBet] = useState<number>(() => {
        if (typeof window === "undefined") return 10;
        const raw = window.localStorage.getItem(BET_STORAGE_KEY);
        const parsed = raw ? Number(raw) : 10;
        return Number.isFinite(parsed) && parsed >= MIN_BET ? parsed : 10;
    });

    const [push22Bet, setPush22Bet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        const raw = window.localStorage.getItem(PUSH22_STORAGE_KEY);
        const parsed = raw ? Number(raw) : 0;
        return Number.isFinite(parsed) ? parsed : 0;
    });

    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [dealerCards, setDealerCards] = useState<Card[]>([]);
    const [dealerRevealCount, setDealerRevealCount] = useState(1);

    const [insuranceOffered, setInsuranceOffered] = useState(false);
    const [insuranceBet, setInsuranceBet] = useState(0);

    const [doubleWagers, setDoubleWagers] = useState<number[]>([]);
    const [message, setMessage] = useState("Set your bets and press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [showRules, setShowRules] = useState(false);

    const [roundReturned, setRoundReturned] = useState(0);
    const [roundNet, setRoundNet] = useState(0);
    const [resultLabel, setResultLabel] = useState("");
    const [resultLines, setResultLines] = useState<string[]>([]);

    // UI-only state
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [chipStack, setChipStack] = useState<ChipDenomination[]>(() => {
        if (typeof window === "undefined") return buildChipStack(10);
        const raw = window.localStorage.getItem(BET_STORAGE_KEY);
        const parsed = raw ? Number(raw) : 10;
        const v = Number.isFinite(parsed) && parsed >= MIN_BET ? parsed : 10;
        return buildChipStack(v);
    });
    const [push22Stack, setPush22Stack] = useState<ChipDenomination[]>(() => {
        if (typeof window === "undefined") return [];
        const raw = window.localStorage.getItem(PUSH22_STORAGE_KEY);
        const parsed = raw ? Number(raw) : 0;
        const v = Number.isFinite(parsed) ? parsed : 0;
        return buildChipStack(v);
    });

    useEffect(() => {
        window.localStorage.setItem(BET_STORAGE_KEY, String(clampMainBet(bet)));
    }, [bet]);

    useEffect(() => {
        window.localStorage.setItem(PUSH22_STORAGE_KEY, String(clampSideBet(push22Bet)));
    }, [push22Bet]);

    const baseBet = clampMainBet(bet);
    const sideBet = clampSideBet(push22Bet);

    const totalRiskOnMain = useMemo(
        () => baseBet + doubleWagers.reduce((acc, n) => acc + n, 0),
        [baseBet, doubleWagers]
    );

    const totalRiskAll = totalRiskOnMain + sideBet + insuranceBet;
    const playerTotal = useMemo(() => total(playerCards), [playerCards]);
    const nextDoubleAmount = useMemo(() => {
        return baseBet * Math.pow(2, doubleWagers.length);
    }, [baseBet, doubleWagers.length]);

    const canTakeInsurance = stage === "insurance" && insuranceOffered;
    const canHit = stage === "player" && playerTotal < 21;
    const canStand = stage === "player" && playerTotal < 21;
    const canDouble = stage === "player" && playerTotal < 21 && bankroll >= nextDoubleAmount;

    const performShuffleIfNeeded = async (shoe: Card[]) => {
        if (!shouldShuffle(shoe)) return shoe;
        setIsShuffling(true);
        setStage("shuffling");
        setMessage("Shuffling shoe...");
        await wait(SHUFFLE_DELAY_MS);
        const fresh = createShoe();
        setDeck(fresh);
        setIsShuffling(false);
        setStage("betting");
        return fresh;
    };

    const drawOne = (shoe: Card[]) => {
        const nextDeck = [...shoe];
        const card = nextDeck.shift();
        return { card, nextDeck };
    };

    const clearRoundState = () => {
        setPlayerCards([]);
        setDealerCards([]);
        setDealerRevealCount(1);
        setInsuranceOffered(false);
        setInsuranceBet(0);
        setDoubleWagers([]);
        setRoundReturned(0);
        setRoundNet(0);
        setResultLabel("");
        setResultLines([]);
    };

    const finishRound = (returned: number, lines: string[], label: string, mainRisk: number) => {
        const invested = mainRisk + sideBet + insuranceBet;
        const net = returned - invested;
        if (returned > 0) setBankroll((b) => b + returned);
        setRoundReturned(returned);
        setRoundNet(net);
        setResultLabel(label);
        setResultLines(lines);
        setStage("done");
    };

    const resolveDealerBlackjackIfAny = async (
        currentDealer: Card[],
        currentInsuranceBet: number
    ) => {
        const up = currentDealer[0];
        const hole = currentDealer[1];
        if (!up || !hole) return false;

        const dealerHasBJ =
            (up.rank === "A" && isTenValue(hole.rank)) || (isTenValue(up.rank) && hole.rank === "A");

        if (!dealerHasBJ) return false;

        setDealerRevealCount(2);
        setMessage("Dealer blackjack.");
        await wait(500);

        let returned = 0;
        const lines: string[] = [];

        if (currentInsuranceBet > 0) {
            const insuranceReturn = currentInsuranceBet * 3;
            returned += insuranceReturn;
            lines.push(`Insurance wins: ${formatMoney(insuranceReturn)} returned.`);
        } else if (insuranceOffered) {
            lines.push("Insurance not taken.");
        }

        lines.push(`Main wager loses ${formatMoney(totalRiskOnMain)}.`);

        if (sideBet > 0) {
            lines.push(`Push 22 loses ${formatMoney(sideBet)}.`);
        }

        finishRound(returned, lines, "Dealer Blackjack", totalRiskOnMain);
        return true;
    };

    const startPlayerTurnOrPeek = async (
        currentDealer: Card[],
        currentInsuranceBet: number
    ) => {
        const up = currentDealer[0];
        if (!up) return;

        if (up.rank === "A" || isTenValue(up.rank)) {
            const dealerBJ = await resolveDealerBlackjackIfAny(currentDealer, currentInsuranceBet);
            if (dealerBJ) return;
        }

        setStage("player");
        setMessage("Hit, stand, or double.");
    };

    const deal = async () => {
        if (isShuffling) return;

        const wager = clampMainBet(bet);
        const push22 = clampSideBet(push22Bet);
        const buyIn = wager + push22;

        if (bankroll < buyIn) {
            setMessage("Not enough bankroll for those bets.");
            return;
        }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);

        if (nextDeck.length < 3) {
            nextDeck = await performShuffleIfNeeded([]);
        }

        clearRoundState();
        setBankroll((b) => b - buyIn);

        const d1 = drawOne(nextDeck);
        const p1 = drawOne(d1.nextDeck);
        const d2 = drawOne(p1.nextDeck);

        if (!d1.card || !p1.card || !d2.card) {
            setMessage("Could not deal hand.");
            return;
        }

        const currentDealer = [d1.card, d2.card];
        const currentPlayer = [p1.card];

        setDeck(d2.nextDeck);
        setDealerCards(currentDealer);
        setPlayerCards(currentPlayer);
        setDealerRevealCount(1);

        if (currentDealer[0].rank === "A") {
            setInsuranceOffered(true);
            setStage("insurance");
            setMessage("Dealer shows an Ace. Insurance?");
            return;
        }

        await startPlayerTurnOrPeek(currentDealer, 0);
    };

    const takeInsurance = async () => {
        const maxInsurance = baseBet / 2;
        if (bankroll < maxInsurance) {
            setMessage("Not enough bankroll for insurance.");
            return;
        }
        setBankroll((b) => b - maxInsurance);
        setInsuranceBet(maxInsurance);
        setInsuranceOffered(false);
        setMessage(`Insurance bet placed: ${formatMoney(maxInsurance)}.`);
        await wait(250);
        await startPlayerTurnOrPeek(dealerCards, maxInsurance);
    };

    const declineInsurance = async () => {
        setInsuranceOffered(false);
        setMessage("Insurance declined.");
        await wait(250);
        await startPlayerTurnOrPeek(dealerCards, 0);
    };

    const settleRound = (finalPlayer: Card[], finalDealer: Card[], mainRisk: number) => {
        const lines: string[] = [];
        let returned = 0;

        const playerBusted = total(finalPlayer) > 21;
        const dealerHas22 = total(finalDealer) === 22;
        const dealerBusted = total(finalDealer) > 21;
        const playerBJ = isMadnessBlackjack(finalPlayer);

        if (insuranceBet > 0) {
            lines.push(`Insurance loses ${formatMoney(insuranceBet)}.`);
        }

        if (sideBet > 0) {
            if (dealerHas22) {
                const sideReturn = sideBet * 12;
                returned += sideReturn;
                lines.push(`Push 22 wins: ${formatMoney(sideReturn)} returned.`);
            } else {
                lines.push(`Push 22 loses ${formatMoney(sideBet)}.`);
            }
        }

        if (playerBJ) {
            const suited = isSuitedBlackjack(finalPlayer);
            const multiplier = blackjackMultiplier(suited);
            const blackjackProfit = mainRisk * multiplier;
            const mainReturn = mainRisk + blackjackProfit;
            returned += mainReturn;
            lines.push(
                `${suited ? "Suited" : "Unsuited"} blackjack returns ${formatMoney(mainReturn)} (${formatMoney(mainRisk)} back + ${formatMoney(blackjackProfit)} win).`
            );
            finishRound(returned, lines, suited ? "Suited Blackjack" : "Blackjack", mainRisk);
            return;
        }

        if (playerBusted) {
            lines.push(`Main action loses ${formatMoney(mainRisk)}.`);
            finishRound(returned, lines, "Bust", mainRisk);
            return;
        }

        if (dealerHas22) {
            returned += mainRisk;
            lines.push(`Dealer makes 22. Standing wagers push: ${formatMoney(mainRisk)} returned.`);
            finishRound(returned, lines, "Push 22", mainRisk);
            return;
        }

        if (dealerBusted || total(finalPlayer) > total(finalDealer)) {
            const mainReturn = mainRisk * 2;
            returned += mainReturn;
            lines.push(`Main action wins even money: ${formatMoney(mainReturn)} returned.`);
            finishRound(returned, lines, "Winner", mainRisk);
            return;
        }

        if (total(finalPlayer) === total(finalDealer)) {
            returned += mainRisk;
            lines.push(`Push: ${formatMoney(mainRisk)} returned.`);
            finishRound(returned, lines, "Push", mainRisk);
            return;
        }

        lines.push(`Main action loses ${formatMoney(mainRisk)}.`);
        finishRound(returned, lines, "Lose", mainRisk);
    };

    const runDealer = async (currentPlayer: Card[], mainRisk: number) => {
        setStage("dealer");
        setMessage("Dealer reveals hole card.");
        setDealerRevealCount(2);
        await wait(450);

        let nextDealer = [...dealerCards];
        let nextDeck = [...deck];

        while (total(nextDealer) < 17 || (total(nextDealer) === 17 && isSoft(nextDealer))) {
            const drawn = drawOne(nextDeck);
            if (!drawn.card) break;
            nextDeck = drawn.nextDeck;
            nextDealer = [...nextDealer, drawn.card];
            setDealerCards(nextDealer);
            setDeck(nextDeck);
            setDealerRevealCount(nextDealer.length);
            setMessage("Dealer draws.");
            await wait(380);
        }

        setDealerRevealCount(nextDealer.length);
        settleRound(currentPlayer, nextDealer, mainRisk);
    };

    const hit = async () => {
        if (stage !== "player") return;

        const drawn = drawOne(deck);
        if (!drawn.card) return;

        const nextCard = { ...drawn.card, sideways: false };
        const nextPlayer = [...playerCards, nextCard];

        setDeck(drawn.nextDeck);
        setPlayerCards(nextPlayer);

        const t = total(nextPlayer);

        if (t > 21) {
            if (sideBet > 0) {
                setMessage("Player busts. Dealer still draws for Push 22.");
                await wait(550);
                await runDealer(nextPlayer, totalRiskOnMain);
            } else {
                setDealerRevealCount(dealerCards.length);
                settleRound(nextPlayer, dealerCards, totalRiskOnMain);
            }
            return;
        }

        if (t === 21) {
            setMessage("21 - dealer resolves.");
            await wait(550);
            await runDealer(nextPlayer, totalRiskOnMain);
            return;
        }

        setMessage("Hit, stand, or double.");
    };

    const stand = async () => {
        if (stage !== "player") return;
        setMessage("Player stands.");
        await wait(250);
        await runDealer(playerCards, totalRiskOnMain);
    };

    const doubleDown = async () => {
        if (stage !== "player") return;
        if (bankroll < nextDoubleAmount) {
            setMessage("Not enough bankroll to double.");
            return;
        }

        setBankroll((b) => b - nextDoubleAmount);
        setDoubleWagers((prev) => [...prev, nextDoubleAmount]);

        const drawn = drawOne(deck);
        if (!drawn.card) return;

        const sidewaysCard = { ...drawn.card, sideways: true };
        const nextPlayer = [...playerCards, sidewaysCard];
        const nextMainRisk = totalRiskOnMain + nextDoubleAmount;

        setDeck(drawn.nextDeck);
        setPlayerCards(nextPlayer);

        const t = total(nextPlayer);

        if (t > 21) {
            if (sideBet > 0) {
                setMessage("Busted after doubling. Dealer still draws for Push 22.");
                await wait(550);
                await runDealer(nextPlayer, nextMainRisk);
            } else {
                setDealerRevealCount(dealerCards.length);
                settleRound(nextPlayer, dealerCards, nextMainRisk);
            }
            return;
        }

        if (t === 21) {
            setMessage("Blackjack / 21 after double - dealer resolves.");
            await wait(550);
            await runDealer(nextPlayer, nextMainRisk);
            return;
        }

        setMessage("You may still hit, stand, or re-double.");
    };

    const nextHand = () => {
        clearRoundState();
        setStage("betting");
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle." : "Set your bets and press Deal.");
    };

    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (stage === "betting") {
            setBet((b) => b + chip);
            setChipStack((s) => [...s, chip]);
        }
    };

    const handlePush22Click = () => {
        if (stage !== "betting" || isShuffling) return;
        const next = clampSideBet(push22Bet + selectedChip);
        if (next > push22Bet) {
            setPush22Bet(next);
            setPush22Stack(buildChipStack(next));
        }
    };

    const clearBets = () => {
        if (stage === "done") {
            clearRoundState();
            setBet(0);
            setChipStack([]);
            setPush22Bet(0);
            setPush22Stack([]);
            setStage("betting");
            setMessage("Set your bets and press Deal.");
        } else if (stage === "betting") {
            setBet(0);
            setChipStack([]);
            setPush22Bet(0);
            setPush22Stack([]);
        }
    };

    const dealerCardsHiddenIndexes = dealerCards
        .map((_, idx) => idx)
        .filter((idx) => idx >= dealerRevealCount);

    return (
        <>
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
                    <div className="rounded-[1.6rem] border border-zinc-300/25 bg-black/65 px-12 py-9 text-center shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
                        <div className="text-[12px] font-extrabold uppercase tracking-[0.28em] text-zinc-200">
                            Double Down Madness
                        </div>
                        <div className="mt-2 text-4xl font-extrabold text-zinc-200">Shuffling Shoe</div>
                        <div className="mt-3 text-sm text-zinc-300">Please wait…</div>
                    </div>
                </div>
            )}

            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            <TableShell
                feltColor="#18181b"
                gameName="Double Down Madness"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <DDMBar
                        stage={stage}
                        isShuffling={isShuffling}
                        bet={bet}
                        sideBet={sideBet}
                        bankroll={bankroll}
                        canDouble={canDouble}
                        canHit={canHit}
                        canStand={canStand}
                        canTakeInsurance={canTakeInsurance}
                        doubleWagersCount={doubleWagers.length}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={clearBets}
                        onDeal={() => void deal()}
                        onTakeInsurance={() => void takeInsurance()}
                        onNoInsurance={() => void declineInsurance()}
                        onHit={() => void hit()}
                        onStand={() => void stand()}
                        onDouble={() => void doubleDown()}
                        onNextHand={nextHand}
                    />
                }
            >
                <div className="flex flex-1 gap-3 px-[10px]">

                    {/* ── Left column ───────────────────────────────────────── */}
                    <div className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col lg:gap-3">

                        <InfoPanel title="Blackjack Pays">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-amber-100/80">Suited</span>
                                    <span className="font-extrabold text-amber-100">2 : 1</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-zinc-300/80">Unsuited</span>
                                    <span className="font-extrabold text-white">3 : 2</span>
                                </div>
                            </div>
                        </InfoPanel>

                        <InfoPanel title="Double Ladder">
                            <div className="space-y-2">
                                {[
                                    { label: "Base bet", amount: baseBet },
                                    { label: "1st double", amount: baseBet },
                                    { label: "2nd double", amount: baseBet * 2 },
                                    { label: "3rd double", amount: baseBet * 4 },
                                    { label: "4th double", amount: baseBet * 8 },
                                ].map(({ label, amount }) => (
                                    <Row key={label} label={label} value={formatMoney(amount)} />
                                ))}
                            </div>
                        </InfoPanel>

                    </div>

                    {/* ── Center column ─────────────────────────────────────── */}
                    <div className="flex min-w-0 flex-1 flex-col items-center gap-4">

                        {/* Table label */}
                        <div className="flex flex-col items-center gap-1 select-none">
                            <div className="flex items-center gap-2">
                                <h1
                                    className="text-xl font-extrabold uppercase tracking-[0.18em] text-zinc-100/80"
                                    style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                                >
                                    Double Down Madness
                                </h1>
                                <button
                                    onClick={() => setShowRules(true)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-200/35 bg-black/30 text-[11px] font-extrabold text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.12)] transition hover:border-amber-200/60 hover:bg-amber-200/12 active:scale-95"
                                    aria-label="Show Double Down Madness rules"
                                >
                                    i
                                </button>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.15em] text-white/30">
                                <span>SUITED BLACKJACK PAYS 2:1</span>
                                <span className="text-white/15">·</span>
                                <span>UNSUITED BLACKJACK 3:2</span>
                                <span className="text-white/15">·</span>
                                <span>DEALER 22 PUSHES</span>
                            </div>
                        </div>

                        {/* Dealer lane */}
                        <div className="flex flex-col items-center gap-2">
                            <Chip>
                                {"Dealer"}
                                {dealerCards.length > 0
                                    ? ` · ${getDealerDisplayTotal(dealerCards, stage)}`
                                    : ""}
                            </Chip>
                            <div className="flex min-h-[100px] flex-wrap justify-center gap-2">
                                <AnimatePresence initial={false}>
                                    {dealerCards.map((card, index) => (
                                        <motion.div
                                            key={card.id}
                                            variants={CARD_VARIANTS}
                                            initial="initial"
                                            animate="animate"
                                            transition={CARD_TRANSITION}
                                        >
                                            <PlayingCard
                                                card={toShared(card, !dealerCardsHiddenIndexes.includes(index))}
                                                className={CARD_CLS}
                                            />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Bet circles — only during betting */}
                        <AnimatePresence>
                            {stage === "betting" && (
                                <motion.div
                                    key="bet-circles"
                                    initial={{ opacity: 0, scale: 0.88 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.88 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex items-end gap-8"
                                >
                                    <BetCircle
                                        chips={chipStack}
                                        totalBet={bet}
                                        label="Main Bet"
                                    />
                                    <BetCircle
                                        chips={push22Stack}
                                        totalBet={push22Bet}
                                        label="Push 22"
                                        interactive
                                        onClick={handlePush22Click}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Message */}
                        <p className="text-sm font-semibold text-zinc-100/70">{message}</p>

                        {/* Player lane */}
                        <div className="flex flex-col items-center gap-2">
                            <Chip>
                                {"Player"}
                                {playerCards.length > 0
                                    ? ` · ${playerTotal}${isSoft(playerCards) ? " soft" : ""}${resultLabel ? ` · ${resultLabel}` : ""}`
                                    : ""}
                            </Chip>
                            <div className="flex min-h-[100px] flex-wrap justify-center gap-2">
                                <AnimatePresence initial={false}>
                                    {playerCards.map((card) => (
                                        <motion.div
                                            key={card.id}
                                            variants={CARD_VARIANTS}
                                            initial="initial"
                                            animate="animate"
                                            transition={CARD_TRANSITION}
                                            className={card.sideways ? "mx-5 sm:mx-6" : undefined}
                                        >
                                            <div style={card.sideways ? { transform: "rotate(90deg)" } : undefined}>
                                                <PlayingCard
                                                    card={toShared(card, true)}
                                                    className={CARD_CLS}
                                                />
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Round detail lines (below lg where right col is hidden) */}
                        {resultLines.length > 0 && (
                            <div className="w-full max-w-sm space-y-1 px-4 py-2 text-sm text-zinc-300 lg:hidden">
                                {resultLines.map((line, idx) => (
                                    <div key={idx} className="leading-snug">{line}</div>
                                ))}
                            </div>
                        )}

                    </div>

                    {/* ── Right column ──────────────────────────────────────── */}
                    <div className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col lg:items-center lg:gap-3">
                        <BetBar
                            pendingBet={baseBet + sideBet}
                            totalRisk={stage !== "betting" ? totalRiskAll : 0}
                            returned={roundReturned}
                            net={roundNet}
                            stage={stage}
                        />

                        {insuranceBet > 0 && (
                            <div className="w-full">
                                <InfoPanel title="Insurance">
                                    <div className="space-y-2">
                                        <Row label="Bet" value={formatMoney(insuranceBet)} />
                                        <Row label="Pays" value="2 : 1" />
                                    </div>
                                </InfoPanel>
                            </div>
                        )}
                    </div>

                </div>
            </TableShell>
        </>
    );
}
