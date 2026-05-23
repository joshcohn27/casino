import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination } from "./shared/money";

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { rank: Rank; suit: Suit; value: number; id: string };
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };
type Stage = "betting" | "player" | "dealer" | "done";

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const MIN_BET = 5;
const MAX_HANDS = 4;
const BET_STORAGE_KEY = "casino-blackjack-bet";
const SHOE_DECKS = 6;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.85;
const SHUFFLE_DELAY_MS = 2000;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";

const CHIP_COLORS: Record<ChipDenomination, { bg: string; border: string; text: string; label: string }> = {
    1:    { bg: '#f1f5f9', border: '#94a3b8', text: '#1e293b', label: '$1'    },
    2.5:  { bg: '#e2e8f0', border: '#64748b', text: '#334155', label: '$2.50' },
    5:    { bg: '#dc2626', border: '#7f1d1d', text: '#fff',    label: '$5'    },
    25:   { bg: '#16a34a', border: '#14532d', text: '#fff',    label: '$25'   },
    100:  { bg: '#1e293b', border: '#0f172a', text: '#e2e8f0', label: '$100'  },
    500:  { bg: '#7c3aed', border: '#4c1d95', text: '#fff',    label: '$500'  },
    1000: { bg: '#b45309', border: '#78350f', text: '#fef3c7', label: '$1K'   },
    5000: { bg: '#be185d', border: '#831843', text: '#fce7f3', label: '$5K'   },
};

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
                shoe.push({ rank, suit, value, id: `${d}-${rank}${suit}-${Math.random().toString(36).slice(2, 9)}` });
            }
        }
    }
    return shuffle(shoe);
}

function total(cards: Card[]) {
    let sum = cards.reduce((acc, c) => acc + c.value, 0);
    let aces = cards.filter((c) => c.rank === "A").length;
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
}

function isSoft(cards: Card[]) {
    let sum = cards.reduce((acc, c) => acc + c.value, 0);
    let aces = cards.filter((c) => c.rank === "A").length;
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    if (sum === 21) return false;
    return aces > 0;
}

function fmt(n: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency", currency: "USD",
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
        id:   card.id,
        suit: card.suit as SharedCard["suit"],
        rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"],
        faceUp,
    };
}

const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0,   scale: 1    },
};
const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});

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
    pendingBet: number; wagered: number; returned: number; net: number; stage: Stage;
}) {
    const showResult = stage === "done";
    const displayBet = wagered > 0 ? wagered : pendingBet;
    return (
        <div className="flex items-center justify-center gap-6 rounded-xl border border-white/10 bg-black/30 px-6 py-2.5">
            {[
                { label: "Bet",      val: displayBet > 0 ? fmt(displayBet) : "—", color: "text-white" },
                { label: "Returned", val: showResult ? fmt(returned) : "—",        color: "text-white" },
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

const STACK_GAP = 9;

function BetCircle({ chips, totalBet }: { chips: ChipDenomination[]; totalBet: number }) {
    const visible  = chips.slice(-3);
    const startIdx = chips.length - visible.length;
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex flex-col items-center"
        >
            <div
                className="relative z-10 flex justify-center"
                style={{ width: 48, height: 48 + (visible.length > 0 ? (visible.length - 1) * STACK_GAP : 0), marginBottom: -20 }}
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
                                    boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.18), 0 5px 14px rgba(0,0,0,0.5)',
                                }}
                                initial={{ opacity: 0, y: -22, scale: 0.72 }}
                                animate={{ opacity: 1, y: 0,   scale: 1    }}
                                exit={{    opacity: 0, y: 6,   scale: 0.8  }}
                                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                            >
                                {cfg.label}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
            <div className="flex h-[100px] w-[100px] items-center justify-center rounded-full border-2 border-dashed border-white/30 bg-black/20 backdrop-blur-sm">
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
    cards: Card[]; revealedCount: number; stage: Stage;
}) {
    const revealed = stage === "dealer" || stage === "done";
    const t = cards.length ? total(cards) : null;
    return (
        <div className="flex flex-col items-center gap-2">
            <Chip>Dealer{revealed && t !== null ? ` · ${t}${isSoft(cards) ? " soft" : ""}` : ""}</Chip>
            <div className="flex flex-wrap justify-center gap-2">
                <AnimatePresence initial={false}>
                    {cards.map((card, i) => (
                        <motion.div
                            key={card.id}
                            variants={CARD_VARIANTS}
                            initial="initial"
                            animate="animate"
                            transition={CARD_TRANSITION(i * 0.08)}
                        >
                            <PlayingCard card={toShared(card, i < revealedCount)} className={CARD_CLS} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

function HandBox({ hand, bet, index, isActive, stage, dealerTotal, dealerBusted }: {
    hand: Card[]; bet: number; index: number; isActive: boolean;
    stage: Stage; dealerTotal: number; dealerBusted: boolean;
}) {
    const t    = total(hand);
    const bust = t > 21;
    const result = stage === "done" ? resultLabel(t, dealerTotal, bust, dealerBusted) : null;
    return (
        <div className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition-colors duration-300
            ${isActive ? "border-amber-300/50 bg-amber-300/8 ring-2 ring-amber-300/20" : "border-white/10 bg-black/15"}`}
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
                            variants={CARD_VARIANTS}
                            initial="initial"
                            animate="animate"
                            transition={CARD_TRANSITION(i * 0.08)}
                        >
                            <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            <div className="text-sm font-bold text-amber-100">
                {t}{isSoft(hand) ? " soft" : ""}{bust ? " · Bust" : ""}
            </div>
            <div className="text-xs text-white/45">Bet {fmt(bet)}</div>
        </div>
    );
}

// ─── Button styles ────────────────────────────────────────────────────────────

const BTN_NEUTRAL = "rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-white/16 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_GOLD    = "rounded-xl border border-amber-200/70 bg-[linear-gradient(180deg,_#fde68a,_#f59e0b)] px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_GREEN   = "rounded-xl border border-emerald-300/60 bg-[linear-gradient(180deg,_#6ee7b7,_#059669)] px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";

function SlideBtn({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1    }}
            exit={{    opacity: 0, scale: 0.88 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
        >
            {children}
        </motion.div>
    );
}

// ─── BlackjackBar ─────────────────────────────────────────────────────────────
// Layout: [ChipTray left] [Buttons centered] [spacer right]
// Stages:
//   betting → Clear · Deal · Double & Deal
//   player  → Hit · Stand · Double · Split
//   dealer  → "Dealer playing…"
//   done    → Clear · Change Bet · Deal · Double & Deal

function BlackjackBar({
    stage, isShuffling, bet, bankroll, canDouble, canSplit, isResolvingAction,
    selectedChip, onChipSelect,
    onClear, onChangeBet, onDeal, onDoubleAndDeal,
    onHit, onStay, onDouble, onSplit,
}: {
    stage: Stage; isShuffling: boolean; bet: number; bankroll: number;
    canDouble: boolean; canSplit: boolean; isResolvingAction: boolean;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onChangeBet: () => void; onDeal: () => void; onDoubleAndDeal: () => void;
    onHit: () => void; onStay: () => void; onDouble: () => void; onSplit: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone    = stage === "done";
    const isPlayer  = stage === "player";
    const isDealer  = stage === "dealer";
    const showChips = !isDealer; // hide chips only while dealer is playing

    const canClear      = (isBetting || isDone) && bet > 0;
    const canDeal       = (isBetting || isDone) && !isShuffling && bet >= MIN_BET && bankroll >= bet;
    const canDoubleDeal = (isBetting || isDone) && !isShuffling && bet >= MIN_BET && bankroll >= bet * 2;

    return (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl">

            {/* Left: chip tray */}
            <div className="flex items-center">
                {showChips ? (
                    <ChipTray
                        selectedChip={selectedChip}
                        onSelect={onChipSelect}
                        disabled={isPlayer || isShuffling}
                    />
                ) : (
                    <div className="w-px" /> // placeholder to keep grid stable
                )}
            </div>

            {/* Center: stage buttons */}
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>

                    {/* Betting + Done: Clear */}
                    {canClear && (
                        <SlideBtn key="clear">
                            <button className={BTN_NEUTRAL} onClick={onClear} disabled={isShuffling}>Clear</button>
                        </SlideBtn>
                    )}

                    {/* Done only: Change Bet */}
                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button className={BTN_NEUTRAL} onClick={onChangeBet} disabled={isShuffling}>Change Bet</button>
                        </SlideBtn>
                    )}

                    {/* Betting + Done: Deal */}
                    {(isBetting || isDone) && (
                        <SlideBtn key="deal">
                            <button className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}

                    {/* Done only: Double & Deal */}
                    {isDone && (
                        <SlideBtn key="double-deal">
                            <button className={BTN_GREEN} onClick={onDoubleAndDeal} disabled={!canDoubleDeal}>
                                Double &amp; Deal
                            </button>
                        </SlideBtn>
                    )}

                    {/* Player: Hit / Stand / Double / Split */}
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

                    {/* Dealer: subtle indicator */}
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

                </AnimatePresence>
            </div>

            {/* Right: spacer mirrors chip tray width for true centering */}
            <div className="invisible">
                <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
            </div>

        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlackjackTable({ bankroll, setBankroll }: Props) {

    const [deck,                setDeck]                = useState<Card[]>(() => createShoe());
    const [dealer,              setDealer]              = useState<Card[]>([]);
    const [hands,               setHands]               = useState<Card[][]>([]);
    const [bets,                setBets]                = useState<number[]>([]);
    const [active,              setActive]              = useState(0);
    const [dealerRevealedCount, setDealerRevealedCount] = useState(1);
    const [bet,                 setBet]                 = useState(0);
    const [stage,             setStage]             = useState<Stage>("betting");
    const [message,           setMessage]           = useState("Place chips and press Deal.");
    const [isShuffling,       setIsShuffling]       = useState(false);
    const [isResolvingAction, setIsResolvingAction] = useState(false);
    const [roundReturned,     setRoundReturned]     = useState(0);
    const [roundNet,          setRoundNet]          = useState(0);

    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [chipStack,    setChipStack]    = useState<ChipDenomination[]>([]);
    const [baseBet,      setBaseBet]      = useState(0); // persists as default for next hand
    const dealBetRef = useRef<number | null>(null);

    useEffect(() => {
        if (bet >= MIN_BET)
            window.localStorage.setItem(BET_STORAGE_KEY, String(Math.max(MIN_BET, Math.floor(bet / 5) * 5)));
    }, [bet]);

    const activeHand   = hands[active] ?? [];
    const totalWagered = bets.reduce((s, w) => s + w, 0);

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
        const wagered   = wagersInPlay.reduce((s, w) => s + w, 0);
        setRoundReturned(0);
        setRoundNet(-wagered);
        if (dealer.length > 0) { setDealerRevealedCount(dealer.length); await wait(1000); }
        setStage("done");
        setMessage(allBusted ? "All hands bust. Dealer does not draw." : "Round complete.");
    };

    const dealerTurn = async (
        handsInPlay: Card[][] = hands,
        wagersInPlay: number[] = bets,
        shoeInPlay: Card[]    = deck,
    ) => {
        const liveHands = handsInPlay.filter((h) => total(h) <= 21);
        if (liveHands.length === 0) { await finishRoundWithoutDealer(handsInPlay, wagersInPlay); return; }

        let nextDealer = [...dealer];
        let nextDeck   = [...shoeInPlay];
        let revealedCount = 1;

        setStage("dealer");
        setMessage("Dealer reveals hole card.");
        setDealerRevealedCount(2);
        revealedCount = 2;
        await wait(450);

        while (total(nextDealer) < 17) {
            const card = nextDeck.shift();
            if (!card) break;
            nextDealer.push(card);
            setDealer([...nextDealer]);
            setDeck([...nextDeck]);
            setDealerRevealedCount(revealedCount);
            await wait(140);
            revealedCount = nextDealer.length;
            setDealerRevealedCount(revealedCount);
            setMessage("Dealer draws.");
            await wait(360);
        }

        setDealer(nextDealer);
        setDeck(nextDeck);
        setDealerRevealedCount(nextDealer.length);

        const dt           = total(nextDealer);
        const dealerBusted = dt > 21;
        let returned = 0;

        handsInPlay.forEach((hand, i) => {
            const pt    = total(hand);
            const wager = wagersInPlay[i];
            if (pt > 21) return;
            if (dealerBusted || pt > dt) returned += wager * 2;
            else if (pt === dt)          returned += wager;
        });

        const wagered = wagersInPlay.reduce((s, w) => s + w, 0);
        setRoundReturned(returned);
        setRoundNet(returned - wagered);
        setBankroll((b) => b + returned);
        setStage("done");
        setMessage(dealerBusted ? "Dealer busts." : "Round complete.");
    };

    const ensureHandHasSecondCard = async (handsInPlay: Card[][], idx: number, shoeInPlay: Card[]) => {
        const target = handsInPlay[idx];
        if (!target || target.length !== 1) return { hands: handsInPlay, deck: shoeInPlay };
        const nextDeck  = [...shoeInPlay];
        const drawn     = nextDeck.shift();
        if (!drawn) return { hands: handsInPlay, deck: shoeInPlay };
        const nextHands = [...handsInPlay];
        nextHands[idx]  = [...nextHands[idx], drawn];
        setHands(nextHands);
        setDeck(nextDeck);
        await wait(250);
        return { hands: nextHands, deck: nextDeck };
    };

    const moveToNextHand = async (
        nextHands: Card[][], nextDeck: Card[], nextBets: number[], currentActive = active,
    ) => {
        const nextIdx = currentActive + 1;
        if (nextIdx < nextHands.length) {
            setActive(nextIdx);
            setMessage(`Playing hand ${nextIdx + 1} of ${nextHands.length}.`);
            const dealt     = await ensureHandHasSecondCard(nextHands, nextIdx, nextDeck);
            const nextHand  = dealt.hands[nextIdx];
            const nextTotal = total(nextHand);
            if (nextTotal === 21) { setMessage(`Hand ${nextIdx + 1} makes 21.`); await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIdx); return; }
            if (nextTotal >  21)  { setMessage(`Hand ${nextIdx + 1} busts.`);   await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIdx); return; }
            return;
        }
        if (nextHands.some((h) => total(h) <= 21)) { await dealerTurn(nextHands, nextBets, nextDeck); return; }
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
            const nextBets  = [...bets.slice(0, active),  bets[active], bets[active], ...bets.slice(active + 1)];
            setHands(nextHands);
            setBets(nextBets);
            setMessage(`Split hand ${active + 1}.`);
            const dealt       = await ensureHandHasSecondCard(nextHands, active, deck);
            const activeTotal = total(dealt.hands[active]);
            if (activeTotal === 21) { setMessage(`Hand ${active + 1} makes 21.`); await moveToNextHand(dealt.hands, dealt.deck, nextBets, active); return; }
            if (activeTotal >  21)  { setMessage(`Hand ${active + 1} busts.`);   await moveToNextHand(dealt.hands, dealt.deck, nextBets, active); }
        } finally { setIsResolvingAction(false); }
    };

    const deal = async () => {
        if (isShuffling) return;
        const override = dealBetRef.current;
        dealBetRef.current = null;
        const wager = Math.max(MIN_BET, Math.floor((override ?? bet) / 5) * 5);
        if (bankroll < wager) { setMessage("Not enough bankroll."); return; }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);
        if (nextDeck.length < 4) nextDeck = await performShuffleIfNeeded([]);

        setRoundReturned(0); setRoundNet(0);
        setBankroll((b) => b - wager);

        const playerHand = [nextDeck[0], nextDeck[1]];
        const dealerHand = [nextDeck[2], nextDeck[3]];
        nextDeck = nextDeck.slice(4);

        setDeck(nextDeck); setDealer(dealerHand); setDealerRevealedCount(1);
        setHands([playerHand]); setBets([wager]); setActive(0);

        const dealerBJ = total(dealerHand) === 21;
        const playerBJ = total(playerHand) === 21;

        if (dealerBJ) {
            setDealerRevealedCount(2);
            if (playerBJ) {
                setRoundReturned(wager); setRoundNet(0);
                setBankroll((b) => b + wager);
                setMessage("Both player and dealer have blackjack. Push.");
            } else {
                setRoundReturned(0); setRoundNet(-wager);
                setMessage("Dealer blackjack. Hand over.");
            }
            setStage("done"); return;
        }

        if (playerBJ) {
            const returned = wager * 2.5;
            setDealerRevealedCount(2);
            setRoundReturned(returned); setRoundNet(returned - wager);
            setBankroll((b) => b + returned);
            setStage("done"); setMessage("Blackjack pays 3 to 2."); return;
        }

        setStage("player");
        setMessage("Hit, stand, double, or split.");
    };

    const hit = async () => {
        if (isResolvingAction) return;
        setIsResolvingAction(true);
        try {
            const nextDeck  = [...deck];
            const card      = nextDeck.shift();
            if (!card) return;
            const nextHands = [...hands];
            nextHands[active] = [...nextHands[active], card];
            setDeck(nextDeck); setHands(nextHands);
            const t = total(nextHands[active]);
            if (t === 21) { setMessage(`Hand ${active + 1} makes 21.`); await moveToNextHand(nextHands, nextDeck, bets); return; }
            if (t >  21)  { setMessage(`Hand ${active + 1} busts.`);   await moveToNextHand(nextHands, nextDeck, bets); }
        } finally { setIsResolvingAction(false); }
    };

    const stay = async () => {
        if (isResolvingAction) return;
        setIsResolvingAction(true);
        try { await moveToNextHand(hands, deck, bets); }
        finally { setIsResolvingAction(false); }
    };

    const doubleDown = async () => {
        if (isResolvingAction) return;
        setIsResolvingAction(true);
        try {
            const wager = bets[active];
            if (bankroll < wager) return;
            setBankroll((b) => b - wager);
            const nextBets  = [...bets]; nextBets[active] *= 2; setBets(nextBets);
            const nextDeck  = [...deck]; const card = nextDeck.shift(); if (!card) return;
            const nextHands = [...hands]; nextHands[active] = [...nextHands[active], card];
            setDeck(nextDeck); setHands(nextHands);
            if (total(nextHands[active]) > 21) setMessage(`Hand ${active + 1} busts after doubling.`);
            await moveToNextHand(nextHands, nextDeck, nextBets);
        } finally { setIsResolvingAction(false); }
    };

    const nextRound = (clearChips = false) => {
        setDealer([]); setHands([]); setBets([]); setActive(0);
        setDealerRevealedCount(1); setRoundReturned(0); setRoundNet(0);
        setStage("betting");
        if (clearChips) {
            setBet(0); setChipStack([]); setBaseBet(0);
        } else {
            // Restore last base bet so chips reappear on the table
            setBet(baseBet);
            setChipStack(buildChipStackFromAmount(baseBet));
        }
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle." : "Place chips and press Deal.");
    };

    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (stage === "betting") {
            setBet((b) => { const next = b + chip; setBaseBet(next); return next; });
            setChipStack((s) => [...s, chip]);
        }
    };

    const clearBet = () => {
        if (stage === "done") { nextRound(true); return; }
        if (stage === "betting") { setBet(0); setChipStack([]); setBaseBet(0); }
    };

    const changeBet = () => {
        // Returns to betting stage keeping current bet amount so player can adjust
        nextRound(false);
    };

    const doubleAndDeal = () => {
        if (totalWagered === 0 || bankroll < totalWagered * 2) return;
        const doubled = totalWagered * 2;
        setBaseBet(doubled);                 // store as new base bet
        setChipStack(buildChipStackFromAmount(doubled));
        dealBetRef.current = doubled;
        void deal();
    };

    const canSplit =
        stage === "player" && activeHand.length === 2 && hands.length < MAX_HANDS &&
        activeHand[0]?.value === activeHand[1]?.value && bankroll >= (bets[active] ?? 0);
    const canDouble = stage === "player" && activeHand.length === 2 && bankroll >= (bets[active] ?? 0);
    const dealerT      = dealer.length ? total(dealer) : 0;
    const dealerBusted = dealerT > 21;

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
                        isResolvingAction={isResolvingAction}
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
                    />
                }
            >
                <div className="flex flex-1 flex-col items-center gap-5 py-2">

                    <DealerLane cards={dealer} revealedCount={dealerRevealedCount} stage={stage} />

                    <BetBar
                        pendingBet={bet}
                        wagered={totalWagered}
                        returned={roundReturned}
                        net={roundNet}
                        stage={stage}
                    />

                    <p className="text-sm font-semibold text-amber-100/70">{message}</p>

                    <AnimatePresence>
                        {stage === "betting" && (
                            <BetCircle chips={chipStack} totalBet={bet} />
                        )}
                    </AnimatePresence>

                    {hands.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-3">
                            {hands.map((hand, i) => (
                                <HandBox
                                    key={i}
                                    hand={hand}
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
            </TableShell>
        </>
    );
}