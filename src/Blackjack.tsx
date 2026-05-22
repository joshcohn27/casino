import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination } from "./shared/money";

// ─── Types ───────────────────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { rank: Rank; suit: Suit; value: number; id: string };
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };
type Stage = "betting" | "player" | "dealer" | "done";

// ─── Constants ───────────────────────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const MIN_BET = 5;
const MAX_HANDS = 4;
const SHOE_DECKS = 6;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.85;
const SHUFFLE_DELAY_MS = 2000;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));

const CARD_DEAL_DURATION = 0.46;
const CARD_DEAL_STAGGER = 0.16;
const CARD_VALUE_REVEAL_DELAY = 260;
const INITIAL_DEAL_PAUSE = 280;
const DEALER_REVEAL_PAUSE = 700;
const DEALER_DRAW_PAUSE = 180;
const SPLIT_CARD_PAUSE = 420;

const CARD_CLS = "w-[clamp(54px,5.4vw,84px)] h-[clamp(76px,7.56vw,118px)] rounded-[clamp(7px,0.75vw,12px)]";

const CHIP_COLORS: Record<ChipDenomination, { bg: string; border: string; text: string; label: string }> = {
    1:    { bg: "#f1f5f9", border: "#94a3b8", text: "#1e293b", label: "$1"    },
    2.5:  { bg: "#f9a8d4", border: "#be185d", text: "#500724", label: "$2.50" },
    5:    { bg: "#dc2626", border: "#7f1d1d", text: "#fff",    label: "$5"    },
    25:   { bg: "#16a34a", border: "#14532d", text: "#fff",    label: "$25"   },
    100:  { bg: "#1e293b", border: "#0f172a", text: "#e2e8f0", label: "$100"  },
    500:  { bg: "#7c3aed", border: "#4c1d95", text: "#fff",    label: "$500"  },
    1000: { bg: "#b45309", border: "#78350f", text: "#fef3c7", label: "$1K"   },
    5000: { bg: "#babbbd", border: "#6b7280", text: "#111827", label: "$5K"   },
};

const CHIP_VALUES: ChipDenomination[] = [5000, 1000, 500, 100, 25, 5, 2.5, 1];

// ─── Utilities ───────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createShoe(): Card[] {
    const shoe: Card[] = [];

    for (let d = 0; d < SHOE_DECKS; d++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                let value = Number(rank);

                if (["J", "Q", "K"].includes(rank)) value = 10;
                if (rank === "A") value = 11;

                shoe.push({
                    rank,
                    suit,
                    value,
                    id: `${d}-${rank}${suit}-${Math.random().toString(36).slice(2, 9)}`,
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

    if (sum === 21) return false;

    return aces > 0;
}

function fmt(n: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
}

function resultLabel(pt: number, dt: number, busted: boolean, dealerBusted: boolean) {
    if (busted) return "Bust";
    if (dealerBusted) return "Win";
    if (pt > dt) return "Win";
    if (pt < dt) return "Lose";
    return "Push";
}

function shouldShuffle(shoe: Card[]) {
    return shoe.length <= RESHUFFLE_REMAINING_CARDS || shoe.length < 20;
}

function wait(ms: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function buildChipStackFromAmount(amount: number): ChipDenomination[] {
    let remaining = Math.round(amount * 100);
    const stack: ChipDenomination[] = [];

    for (const denom of CHIP_VALUES) {
        const cents = Math.round(Number(denom) * 100);

        while (remaining >= cents) {
            stack.push(denom);
            remaining -= cents;
        }
    }

    return stack;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

function toShared(card: Card, faceUp: boolean): SharedCard {
    return {
        id: card.id,
        suit: card.suit as SharedCard["suit"],
        rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"],
        faceUp,
    };
}

// ─── UI sub-components ───────────────────────────────────────────────────────

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-full border border-amber-300/25 bg-black/30 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-100">
            {children}
        </div>
    );
}

const BADGE: Record<string, string> = {
    Win:  "bg-emerald-500/20 border-emerald-400/40 text-emerald-200",
    Push: "bg-amber-500/20  border-amber-400/40  text-amber-200",
    Bust: "bg-red-500/20    border-red-400/40    text-red-300",
    Lose: "bg-red-600/20    border-red-500/40    text-red-300",
};

function Badge({ result }: { result: string }) {
    return (
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${BADGE[result] ?? ""}`}>
            {result}
        </span>
    );
}

function BetBar({ pendingBet, wagered, returned, net, stage }: {
    pendingBet: number;
    wagered: number;
    returned: number;
    net: number;
    stage: Stage;
}) {
    const showResult = stage === "done";
    const displayBet = wagered > 0 ? wagered : pendingBet;

    return (
        <div className="flex items-center justify-center gap-5 rounded-xl border border-white/10 bg-black/30 px-5 py-2 [@media(max-height:720px)]:gap-4 [@media(max-height:720px)]:px-4 [@media(max-height:720px)]:py-1.5">
            {[
                { label: "Bet",      val: displayBet > 0 ? fmt(displayBet) : "—", color: "text-white" },
                { label: "Returned", val: showResult ? fmt(returned) : "—",      color: "text-white" },
                {
                    label: "Net",
                    val: showResult ? fmt(net) : "—",
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

const STACK_GAP = 8;

function BetCircle({ chips, totalBet }: { chips: ChipDenomination[]; totalBet: number }) {
    const visible = chips.slice(-3).sort((a, b) => Number(b) - Number(a));
    const startIdx = chips.length - visible.length;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="flex flex-col items-center"
        >
            <div
                className="relative z-10 flex justify-center"
                style={{
                    width: 44,
                    height: 44 + (visible.length > 0 ? (visible.length - 1) * STACK_GAP : 0),
                    marginBottom: -18,
                }}
            >
                <AnimatePresence>
                    {visible.map((denom, i) => {
                        const cfg = CHIP_COLORS[denom];

                        return (
                            <motion.div
                                key={startIdx + i}
                                className="absolute left-0 right-0 mx-auto flex h-11 w-11 select-none items-center justify-center rounded-full text-[9px] font-extrabold"
                                style={{
                                    bottom: i * STACK_GAP,
                                    zIndex: i + 1,
                                    backgroundColor: cfg.bg,
                                    border: `3px solid ${cfg.border}`,
                                    color: cfg.text,
                                    boxShadow: "inset 0 1px 3px rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.18), 0 5px 14px rgba(0,0,0,0.5)",
                                }}
                                initial={{ opacity: 0, y: -22, scale: 0.72 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.8 }}
                                transition={{ type: "spring", stiffness: 360, damping: 24 }}
                            >
                                {cfg.label}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            <div className="flex h-[92px] w-[92px] items-center justify-center rounded-full border-2 border-dashed border-white/30 bg-black/20 backdrop-blur-sm [@media(max-height:720px)]:h-[82px] [@media(max-height:720px)]:w-[82px]">
                {visible.length === 0 && totalBet === 0 && (
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/25">Bet</span>
                )}

                {visible.length === 0 && totalBet > 0 && (
                    <span className="text-sm font-extrabold text-amber-100/70">{fmt(totalBet)}</span>
                )}

                {visible.length > 0 && (
                    <span className="text-sm font-extrabold text-amber-100">{fmt(totalBet)}</span>
                )}
            </div>
        </motion.div>
    );
}

function DealerLane({ cards, revealedCount, stage }: {
    cards: Card[];
    revealedCount: number;
    stage: Stage;
}) {
    const revealed = stage === "dealer" || stage === "done";
    const visibleDealerCards = cards.slice(0, Math.min(revealedCount, cards.length));
    const t = revealed && visibleDealerCards.length ? total(visibleDealerCards) : null;

    return (
        <div className="flex shrink-0 flex-col items-center gap-2 [@media(max-height:720px)]:gap-1.5">
            <Chip>
                Dealer{revealed && t !== null ? ` · ${t}${isSoft(cards) ? " soft" : ""}` : ""}
            </Chip>

            <div className="flex flex-wrap justify-center gap-1.5">
                <AnimatePresence initial={false}>
                    {cards.map((card, i) => (
                        <motion.div
                            key={card.id}
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                                duration: CARD_DEAL_DURATION,
                                ease: [0.16, 1, 0.3, 1],
                                delay: i * CARD_DEAL_STAGGER,
                            }}
                        >
                            <PlayingCard card={toShared(card, i < revealedCount)} className={CARD_CLS} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

function HandBox({ hand, visibleCount, bet, index, isActive, stage, dealerTotal, dealerBusted }: {
    hand: Card[];
    visibleCount: number;
    bet: number;
    index: number;
    isActive: boolean;
    stage: Stage;
    dealerTotal: number;
    dealerBusted: boolean;
}) {
    const visibleCards = hand.slice(0, Math.min(visibleCount, hand.length));
    const scoreCards = stage === "done" ? hand : visibleCards;
    const hasScore = scoreCards.length > 0;
    const t = hasScore ? total(scoreCards) : 0;
    const bust = hasScore && scoreCards.length === hand.length && t > 21;
    const result = stage === "done" ? resultLabel(total(hand), dealerTotal, total(hand) > 21, dealerBusted) : null;

    return (
        <div className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all [@media(max-height:720px)]:p-2
            ${isActive
                ? "border-amber-300/50 bg-amber-300/8 ring-2 ring-amber-300/20"
                : "border-white/10 bg-black/15"}`}
        >
            <div className="flex items-center gap-2">
                <Chip>Hand {index + 1}</Chip>
                {result && <Badge result={result} />}
            </div>

            <div className="flex flex-wrap justify-center gap-1.5">
                <AnimatePresence initial={false}>
                    {hand.map((card, i) => (
                        <motion.div
                            key={card.id}
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                                duration: CARD_DEAL_DURATION,
                                ease: [0.16, 1, 0.3, 1],
                                delay: i * CARD_DEAL_STAGGER,
                            }}
                        >
                            <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="text-sm font-bold text-amber-100">
                {hasScore ? `${t}${isSoft(scoreCards) ? " soft" : ""}${bust ? " · Bust" : ""}` : "—"}
            </div>

            <div className="text-xs text-white/45">Bet {fmt(bet)}</div>
        </div>
    );
}

// ─── Action bar ──────────────────────────────────────────────────────────────

const BTN_NEUTRAL = "rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-white/16 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 [@media(max-height:720px)]:px-3 [@media(max-height:720px)]:py-1.5 [@media(max-height:720px)]:text-xs";
const BTN_GOLD = "rounded-xl border border-amber-200/70 bg-[linear-gradient(180deg,_#fde68a,_#f59e0b)] px-5 py-2.5 text-sm font-extrabold text-slate-950 transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 [@media(max-height:720px)]:px-3 [@media(max-height:720px)]:py-1.5 [@media(max-height:720px)]:text-xs";

function SlideBtn({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 14, scale: 0.88 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 14, scale: 0.88 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
        >
            {children}
        </motion.div>
    );
}

function BlackjackBar({
    stage,
    isShuffling,
    bet,
    bankroll,
    canDouble,
    canSplit,
    selectedChip,
    onChipSelect,
    onClear,
    onChangeBet,
    onDeal,
    onDoubleAndDeal,
    onHit,
    onStay,
    onDouble,
    onSplit,
    isResolvingAction,
}: {
    stage: Stage;
    isShuffling: boolean;
    bet: number;
    bankroll: number;
    canDouble: boolean;
    canSplit: boolean;
    selectedChip: ChipDenomination;
    onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void;
    onChangeBet: () => void;
    onDeal: () => void;
    onDoubleAndDeal: () => void;
    onHit: () => void;
    onStay: () => void;
    onDouble: () => void;
    onSplit: () => void;
    isResolvingAction: boolean;
}) {
    const barRef = useRef<HTMLDivElement>(null);
    const [showChips, setShowChips] = useState(true);

    useEffect(() => {
        const el = barRef.current;
        if (!el) return;

        const ro = new ResizeObserver(([entry]) => {
            const isHandInProgress = stage === "player" || stage === "dealer";
            setShowChips(!(isHandInProgress && entry.contentRect.width < 987));
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, [stage]);

    const isBetting = stage === "betting";
    const isDone = stage === "done";
    const isBettingControls = isBetting || isDone;
    const isPlayer = stage === "player";
    const isDealer = stage === "dealer";

    const canClear = isBettingControls && bet > 0;
    const canDeal = isBettingControls && !isShuffling && bet >= MIN_BET && bankroll >= bet;
    const canDoubleDeal = isBettingControls && !isShuffling && bet >= MIN_BET && bankroll >= bet * 2;

    return (
        <div
            ref={barRef}
            className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl [@media(max-height:720px)]:py-2"
        >
            <div className="flex justify-start">
                {showChips && (
                    <ChipTray
                        selectedChip={selectedChip}
                        onSelect={onChipSelect}
                        disabled={isPlayer || isDealer || isShuffling}
                    />
                )}
            </div>

            <div className="flex items-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button className={BTN_NEUTRAL} onClick={onChangeBet} disabled={isShuffling}>
                                Change Bet
                            </button>
                        </SlideBtn>
                    )}

                    {canClear && (
                        <SlideBtn key="clear">
                            <button className={BTN_NEUTRAL} onClick={onClear} disabled={isShuffling}>
                                Clear
                            </button>
                        </SlideBtn>
                    )}

                    {isBettingControls && (
                        <SlideBtn key="deal">
                            <button className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>
                                {isDone ? "Deal Again" : "Deal"}
                            </button>
                        </SlideBtn>
                    )}

                    {isBettingControls && (
                        <SlideBtn key="double-deal">
                            <button className={BTN_GOLD} onClick={onDoubleAndDeal} disabled={!canDoubleDeal}>
                                Double &amp; Deal
                            </button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="hit">
                            <button className={BTN_NEUTRAL} onClick={onHit} disabled={isResolvingAction}>Hit</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="stand">
                            <button className={BTN_NEUTRAL} onClick={onStay} disabled={isResolvingAction}>Stand</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="double">
                            <button className={BTN_GOLD} onClick={onDouble} disabled={!canDouble || isResolvingAction}>Double</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="split">
                            <button className={BTN_GOLD} onClick={onSplit} disabled={!canSplit || isResolvingAction}>Split</button>
                        </SlideBtn>
                    )}

                    {isDealer && (
                        <motion.span
                            key="dealer-msg"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="pr-1 text-sm italic text-white/40"
                        >
                            Dealer playing…
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            <div />
        </div>
    );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function BlackjackTable({ bankroll, setBankroll }: Props) {
    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [dealer, setDealer] = useState<Card[]>([]);
    const [hands, setHands] = useState<Card[][]>([]);
    const [handVisibleCounts, setHandVisibleCounts] = useState<number[]>([]);
    const [bets, setBets] = useState<number[]>([]);
    const [active, setActive] = useState(0);
    const [dealerRevealedCount, setDealerRevealedCount] = useState(1);

    const [bet, setBet] = useState(0);
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Place chips and press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [isResolvingAction, setIsResolvingAction] = useState(false);
    const [roundReturned, setRoundReturned] = useState(0);
    const [roundNet, setRoundNet] = useState(0);

    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [chipStack, setChipStack] = useState<ChipDenomination[]>([]);
    const dealBetRef = useRef<number | null>(null);

    const activeHand = hands[active] ?? [];
    const totalWagered = bets.reduce((s, w) => s + w, 0);

    const revealHandCount = (idx: number, count: number) => {
        setHandVisibleCounts((prev) => {
            const next = [...prev];
            next[idx] = count;
            return next;
        });
    };

    const revealAllHands = (handsInPlay: Card[][]) => {
        setHandVisibleCounts(handsInPlay.map((h) => h.length));
    };

    const resetTableForBetting = (options?: { clearChips?: boolean; message?: string }) => {
        setDealer([]);
        setHands([]);
        setHandVisibleCounts([]);
        setBets([]);
        setActive(0);
        setDealerRevealedCount(1);
        setRoundReturned(0);
        setRoundNet(0);
        setStage("betting");

        if (options?.clearChips) {
            setBet(0);
            setChipStack([]);
        }

        setMessage(options?.message ?? (shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle." : "Place chips and press Deal."));
    };

    const performShuffleIfNeeded = async (shoe: Card[]) => {
        if (!shouldShuffle(shoe)) return shoe;

        setIsShuffling(true);
        setMessage("Shuffling 6-deck shoe...");
        await wait(SHUFFLE_DELAY_MS);

        const fresh = createShoe();

        setDeck(fresh);
        setIsShuffling(false);

        return fresh;
    };

    const finishRoundWithoutDealer = async (finalHands: Card[][], wagersInPlay: number[] = bets) => {
        const allBusted = finalHands.length > 0 && finalHands.every((h) => total(h) > 21);
        const wagered = wagersInPlay.reduce((s, w) => s + w, 0);

        revealAllHands(finalHands);
        setRoundReturned(0);
        setRoundNet(-wagered);

        if (dealer.length > 0) {
            setDealerRevealedCount(dealer.length);
            await wait(DEALER_REVEAL_PAUSE);
        }

        setStage("done");
        setMessage(allBusted ? "All hands bust. Change your bet or deal again." : "Round complete. Change your bet or deal again.");
    };

    const dealerTurn = async (
        handsInPlay: Card[][] = hands,
        wagersInPlay: number[] = bets,
        shoeInPlay: Card[] = deck,
    ) => {
        const liveHands = handsInPlay.filter((h) => total(h) <= 21);

        if (liveHands.length === 0) {
            await finishRoundWithoutDealer(handsInPlay, wagersInPlay);
            return;
        }

        let nextDealer = [...dealer];
        let nextDeck = [...shoeInPlay];
        let revealedCount = 1;

        setStage("dealer");
        setMessage("Dealer reveals hole card.");
        setDealerRevealedCount(2);
        revealedCount = 2;
        await wait(DEALER_REVEAL_PAUSE);

        while (total(nextDealer) < 17) {
            const card = nextDeck.shift();
            if (!card) break;

            nextDealer.push(card);
            setDealer([...nextDealer]);
            setDeck([...nextDeck]);
            setDealerRevealedCount(revealedCount);

            await wait(260);

            revealedCount = nextDealer.length;
            setDealerRevealedCount(revealedCount);
            setMessage("Dealer draws.");

            await wait(DEALER_DRAW_PAUSE);
        }

        setDealer(nextDealer);
        setDeck(nextDeck);
        setDealerRevealedCount(nextDealer.length);

        const dt = total(nextDealer);
        const dealerBusted = dt > 21;
        let returned = 0;

        handsInPlay.forEach((hand, i) => {
            const pt = total(hand);
            const wager = wagersInPlay[i];

            if (pt > 21) return;
            if (dealerBusted || pt > dt) returned += wager * 2;
            else if (pt === dt) returned += wager;
        });

        const wagered = wagersInPlay.reduce((s, w) => s + w, 0);

        revealAllHands(handsInPlay);
        setRoundReturned(returned);
        setRoundNet(returned - wagered);
        setBankroll((b) => b + returned);
        setStage("done");
        setMessage(dealerBusted ? "Dealer busts. Change your bet or deal again." : "Round complete. Change your bet or deal again.");
    };

    const ensureHandHasSecondCard = async (handsInPlay: Card[][], idx: number, shoeInPlay: Card[]) => {
        const target = handsInPlay[idx];
        if (!target || target.length !== 1) return { hands: handsInPlay, deck: shoeInPlay };

        const nextDeck = [...shoeInPlay];
        const drawn = nextDeck.shift();

        if (!drawn) return { hands: handsInPlay, deck: shoeInPlay };

        const nextHands = [...handsInPlay];
        nextHands[idx] = [...nextHands[idx], drawn];

        setHands(nextHands);
        setDeck(nextDeck);

        await wait(CARD_VALUE_REVEAL_DELAY);
        revealHandCount(idx, nextHands[idx].length);
        await wait(Math.max(0, SPLIT_CARD_PAUSE - CARD_VALUE_REVEAL_DELAY));

        return { hands: nextHands, deck: nextDeck };
    };

    const moveToNextHand = async (
        nextHands: Card[][],
        nextDeck: Card[],
        nextBets: number[],
        currentActive = active,
    ) => {
        const nextIdx = currentActive + 1;

        if (nextIdx < nextHands.length) {
            setActive(nextIdx);
            setMessage(`Playing hand ${nextIdx + 1} of ${nextHands.length}.`);

            const dealt = await ensureHandHasSecondCard(nextHands, nextIdx, nextDeck);
            const nextHand = dealt.hands[nextIdx];
            const nextTotal = total(nextHand);

            if (nextTotal === 21) {
                setMessage(`Hand ${nextIdx + 1} makes 21.`);
                await wait(320);
                await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIdx);
                return;
            }

            if (nextTotal > 21) {
                setMessage(`Hand ${nextIdx + 1} busts.`);
                await wait(320);
                await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIdx);
                return;
            }

            return;
        }

        if (nextHands.some((h) => total(h) <= 21)) {
            await dealerTurn(nextHands, nextBets, nextDeck);
            return;
        }

        await finishRoundWithoutDealer(nextHands, nextBets);
    };

    const split = async () => {
        if (isResolvingAction || hands.length >= MAX_HANDS) return;

        setIsResolvingAction(true);

        try {

        const hand = hands[active];

        if (hand.length !== 2 || hand[0].value !== hand[1].value || bankroll < bets[active]) return;

        setBankroll((b) => b - bets[active]);

        const nextHands = [...hands.slice(0, active), [hand[0]], [hand[1]], ...hands.slice(active + 1)];
        const nextBets = [...bets.slice(0, active), bets[active], bets[active], ...bets.slice(active + 1)];

        setHands(nextHands);
        setHandVisibleCounts([
            ...handVisibleCounts.slice(0, active),
            1,
            1,
            ...handVisibleCounts.slice(active + 1),
        ]);
        setBets(nextBets);
        setMessage(`Split hand ${active + 1}.`);

        await wait(320);

        const dealt = await ensureHandHasSecondCard(nextHands, active, deck);
        const activeTotal = total(dealt.hands[active]);

        if (activeTotal === 21) {
            setMessage(`Hand ${active + 1} makes 21.`);
            await wait(320);
            await moveToNextHand(dealt.hands, dealt.deck, nextBets, active);
            return;
        }

        if (activeTotal > 21) {
            setMessage(`Hand ${active + 1} busts.`);
            await wait(520);
            await moveToNextHand(dealt.hands, dealt.deck, nextBets, active);
        }
        } finally {
            setIsResolvingAction(false);
        }
    };

    const deal = async () => {
        if (isShuffling) return;

        if (stage === "done") {
            resetTableForBetting({ clearChips: false, message: "Dealing next hand..." });
        }

        const override = dealBetRef.current;
        dealBetRef.current = null;

        const wager = Math.max(MIN_BET, Math.floor((override ?? bet) / 5) * 5);

        if (bet < MIN_BET && override === null) {
            setMessage("Place at least $5 to deal.");
            return;
        }

        if (bankroll < wager) {
            setMessage("Not enough bankroll.");
            return;
        }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);

        if (nextDeck.length < 4) {
            nextDeck = await performShuffleIfNeeded([]);
        }

        setRoundReturned(0);
        setRoundNet(0);
        setBankroll((b) => b - wager);
        setStage("player");
        setMessage("Dealing...");

        const playerCard1 = nextDeck[0];
        const playerCard2 = nextDeck[1];
        const dealerCard1 = nextDeck[2];
        const dealerCard2 = nextDeck[3];
        nextDeck = nextDeck.slice(4);

        setDeck(nextDeck);
        setDealer([]);
        setHands([[]]);
        setHandVisibleCounts([0]);
        setBets([wager]);
        setActive(0);
        setDealerRevealedCount(1);

        await wait(INITIAL_DEAL_PAUSE);
        setHands([[playerCard1]]);
        await wait(CARD_VALUE_REVEAL_DELAY);
        setHandVisibleCounts([1]);

        await wait(Math.max(0, INITIAL_DEAL_PAUSE - CARD_VALUE_REVEAL_DELAY));
        setDealer([dealerCard1]);

        await wait(INITIAL_DEAL_PAUSE);
        setHands([[playerCard1, playerCard2]]);
        await wait(CARD_VALUE_REVEAL_DELAY);
        setHandVisibleCounts([2]);

        await wait(Math.max(0, INITIAL_DEAL_PAUSE - CARD_VALUE_REVEAL_DELAY));
        setDealer([dealerCard1, dealerCard2]);

        await wait(420);

        const dealerHand = [dealerCard1, dealerCard2];
        const playerHand = [playerCard1, playerCard2];

        const dealerBJ = total(dealerHand) === 21;
        const playerBJ = total(playerHand) === 21;

        if (dealerBJ) {
            await wait(DEALER_REVEAL_PAUSE);
            setDealerRevealedCount(2);

            if (playerBJ) {
                setRoundReturned(wager);
                setRoundNet(0);
                setBankroll((b) => b + wager);
                setMessage("Both player and dealer have blackjack. Push. Change your bet or deal again.");
            } else {
                setRoundReturned(0);
                setRoundNet(-wager);
                setMessage("Dealer blackjack. Change your bet or deal again.");
            }

            setStage("done");
            return;
        }

        if (playerBJ) {
            await wait(DEALER_REVEAL_PAUSE);

            const returned = wager * 2.5;

            setDealerRevealedCount(2);
            setRoundReturned(returned);
            setRoundNet(returned - wager);
            setBankroll((b) => b + returned);
            setStage("done");
            setMessage("Blackjack pays 3 to 2. Change your bet or deal again.");
            return;
        }

        setMessage("Hit, stand, double, or split.");
    };

    const hit = async () => {
        if (isResolvingAction) return;

        const nextDeck = [...deck];
        const card = nextDeck.shift();

        if (!card) return;

        setIsResolvingAction(true);

        try {
            const nextHands = [...hands];
            nextHands[active] = [...nextHands[active], card];

            setDeck(nextDeck);
            setHands(nextHands);

            await wait(CARD_VALUE_REVEAL_DELAY);
            revealHandCount(active, nextHands[active].length);

            const t = total(nextHands[active]);

            if (t === 21) {
                setMessage(`Hand ${active + 1} makes 21.`);
                await wait(420);
                await moveToNextHand(nextHands, nextDeck, bets);
                return;
            }

            if (t > 21) {
                setMessage(`Hand ${active + 1} busts.`);
                await wait(520);
                await moveToNextHand(nextHands, nextDeck, bets);
            }
        } finally {
            setIsResolvingAction(false);
        }
    };

    const stay = async () => {
        if (isResolvingAction) return;

        setIsResolvingAction(true);

        try {
            await wait(240);
            await moveToNextHand(hands, deck, bets);
        } finally {
            setIsResolvingAction(false);
        }
    };

    const doubleDown = async () => {
        if (isResolvingAction) return;

        const wager = bets[active];

        if (bankroll < wager) return;

        const nextDeck = [...deck];
        const card = nextDeck.shift();

        if (!card) return;

        setIsResolvingAction(true);

        try {
            setBankroll((b) => b - wager);

            const nextBets = [...bets];
            nextBets[active] *= 2;
            setBets(nextBets);

            const nextHands = [...hands];
            nextHands[active] = [...nextHands[active], card];

            setDeck(nextDeck);
            setHands(nextHands);

            await wait(CARD_VALUE_REVEAL_DELAY);
            revealHandCount(active, nextHands[active].length);

            if (total(nextHands[active]) > 21) {
                setMessage(`Hand ${active + 1} busts after doubling.`);
                await wait(520);
            }

            await moveToNextHand(nextHands, nextDeck, nextBets);
        } finally {
            setIsResolvingAction(false);
        }
    };

    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);

        if (stage === "done") {
            resetTableForBetting({ clearChips: false });
            setBet((b) => b + chip);
            setChipStack((s) => [...s, chip]);
            return;
        }

        if (stage === "betting") {
            setBet((b) => b + chip);
            setChipStack((s) => [...s, chip]);
        }
    };

    const clearBet = () => {
        if (stage === "done") {
            resetTableForBetting({ clearChips: true });
            return;
        }

        if (stage === "betting") {
            setBet(0);
            setChipStack([]);
        }
    };

    const changeBet = () => {
        if (stage !== "done") return;

        resetTableForBetting({
            clearChips: false,
            message: "Adjust your bet, then press Deal.",
        });
    };

    const doubleAndDeal = () => {
        if ((stage !== "betting" && stage !== "done") || bet < MIN_BET || bankroll < bet * 2) return;

        const doubled = bet * 2;

        setBet(doubled);
        setChipStack(buildChipStackFromAmount(doubled));
        dealBetRef.current = doubled;

        void deal();
    };

    const canSplit =
        stage === "player" &&
        activeHand.length === 2 &&
        hands.length < MAX_HANDS &&
        activeHand[0]?.value === activeHand[1]?.value &&
        bankroll >= (bets[active] ?? 0);

    const canDouble =
        stage === "player" &&
        activeHand.length === 2 &&
        bankroll >= (bets[active] ?? 0);

    const dealerT = dealer.length ? total(dealer) : 0;
    const dealerBusted = dealerT > 21;
    const showBetCircle = stage === "betting";

    return (
        <>
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                    <div className="rounded-[1.6rem] border border-amber-300/25 bg-black/65 px-10 py-8 text-center shadow-2xl">
                        <div className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-amber-200">Blackjack</div>
                        <div className="mt-2 text-3xl font-extrabold text-white">Shuffling Shoe</div>
                        <div className="mt-2 text-sm text-amber-100/80">Please wait…</div>
                    </div>
                </div>
            )}

            <TableShell
                feltColor="#1f7a45"
                gameName="Blackjack"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <BlackjackBar
                        stage={stage}
                        isShuffling={isShuffling}
                        bet={bet}
                        bankroll={bankroll}
                        canDouble={canDouble}
                        canSplit={canSplit}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={clearBet}
                        onChangeBet={changeBet}
                        onDeal={() => void deal()}
                        onDoubleAndDeal={doubleAndDeal}
                        onHit={() => void hit()}
                        onStay={() => void stay()}
                        onDouble={() => void doubleDown()}
                        onSplit={() => void split()}
                        isResolvingAction={isResolvingAction}
                    />
                }
            >
                <div className="flex min-h-0 flex-1 flex-col items-center justify-between gap-[clamp(6px,1.25vh,14px)] overflow-y-auto py-1">
                    <DealerLane cards={dealer} revealedCount={dealerRevealedCount} stage={stage} />

                    <div className="flex min-h-[clamp(108px,22vh,190px)] shrink-0 flex-col items-center justify-center gap-2 [@media(max-height:720px)]:min-h-[96px] [@media(max-height:720px)]:gap-1.5">
                        <BetBar
                            pendingBet={bet}
                            wagered={totalWagered}
                            returned={roundReturned}
                            net={roundNet}
                            stage={stage}
                        />

                        <p className="max-w-[min(760px,92vw)] text-center text-sm font-semibold text-amber-100/70 [@media(max-height:720px)]:text-xs">
                            {message}
                        </p>

                        <AnimatePresence>
                            {showBetCircle && (
                                <BetCircle chips={chipStack} totalBet={bet} />
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex min-h-[clamp(118px,25vh,230px)] w-full shrink-0 items-start justify-center">
                        {hands.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-2.5 [@media(max-height:720px)]:gap-2">
                                {hands.map((hand, i) => (
                                    <HandBox
                                        key={i}
                                        hand={hand}
                                        visibleCount={handVisibleCounts[i] ?? hand.length}
                                        bet={bets[i] ?? 0}
                                        index={i}
                                        isActive={i === active && stage === "player"}
                                        stage={stage}
                                        dealerTotal={dealerT}
                                        dealerBusted={dealerBusted}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </TableShell>
        </>
    );
}