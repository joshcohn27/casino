import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

type Card = {
    rank: Rank;
    suit: Suit;
    value: number;
    id: string;
};

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

type Stage = "betting" | "player" | "dealer" | "done";
type DoubleType = "none" | "paid" | "free";

type HandBet = {
    amount: number;
    isFree: boolean;
};

type HandState = {
    cards: Card[];
    baseBet: HandBet;
    doubleType: DoubleType;
    splitDepth: number;
    result: string;
    settlementText: string[];
    totalReturn: number;
    netProfit: number;
};

type SideBetSnapshot = {
    push22: number;
    potOfGold: number;
};

type SideBetBreakdown = {
    name: string;
    wager: number;
    totalReturn: number;
    netProfit: number;
    detail: string;
    resultText: string;
};

type RoundBreakdown = {
    totalReturned: number;
    totalNet: number;
    lines: string[];
    sideBets: SideBetBreakdown[];
};

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"] as Suit[];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const MIN_BET = 5;
const MAX_HANDS = 4;
const BET_STORAGE_KEY = "casino-freebet-blackjack-bet";
const PUSH22_STORAGE_KEY = "casino-freebet-blackjack-push22";
const POT_OF_GOLD_STORAGE_KEY = "casino-freebet-blackjack-potofgold";

const SHOE_DECKS = 6;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.85;
const SHUFFLE_DELAY_MS = 2000;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));

const SIDE_MAX = 100;
const SIDE_STEP = 5;

const CARD_BACK_URL =
    "https://png.pngtree.com/png-clipart/20240206/original/pngtree-single-playing-cards-back-on-a-white-background-with-shadow-and-png-image_14247732.png";

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
    for (let deckIndex = 0; deckIndex < SHOE_DECKS; deckIndex++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                let value = Number(rank);
                if (["J", "Q", "K"].includes(rank)) value = 10;
                if (rank === "A") value = 11;
                shoe.push({
                    rank,
                    suit,
                    value,
                    id: `${deckIndex}-${rank}${suit}-${Math.random().toString(36).slice(2, 9)}`,
                });
            }
        }
    }
    return shuffle(shoe);
}

function total(cards: Card[]) {
    let sum = cards.reduce((acc, card) => acc + card.value, 0);
    let aces = cards.filter((card) => card.rank === "A").length;
    while (sum > 21 && aces > 0) {
        sum -= 10;
        aces--;
    }
    return sum;
}

function isSoft(cards: Card[]) {
    let sum = cards.reduce((acc, card) => acc + card.value, 0);
    let aces = cards.filter((card) => card.rank === "A").length;
    while (sum > 21 && aces > 0) {
        sum -= 10;
        aces--;
    }
    if (sum === 21) return false;
    return aces > 0;
}

function isBlackjack(cards: Card[]) {
    return cards.length === 2 && total(cards) === 21;
}

function formatMoney(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
}

function shouldShuffle(shoe: Card[]) {
    return shoe.length <= RESHUFFLE_REMAINING_CARDS || shoe.length < 20;
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTenValue(rank: Rank) {
    return rank === "10" || rank === "J" || rank === "Q" || rank === "K";
}

function canSplitRanks(cards: Card[]) {
    if (cards.length !== 2) return false;
    const [a, b] = cards;
    if (a.rank === b.rank) return true;
    return isTenValue(a.rank) && isTenValue(b.rank);
}

function isFreeSplit(cards: Card[]) {
    if (!canSplitRanks(cards)) return false;
    const rank = cards[0]?.rank;
    if (!rank) return false;
    if (rank === "A") return true;
    if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return false;
    return Number(rank) >= 2 && Number(rank) <= 9;
}

function isHardFreeDouble(cards: Card[]) {
    return cards.length === 2 && !isSoft(cards) && [9, 10, 11].includes(total(cards));
}

function potOfGoldMultiplier(tokens: number) {
    if (tokens >= 7) return 1000;
    if (tokens === 6) return 300;
    if (tokens === 5) return 100;
    if (tokens === 4) return 60;
    if (tokens === 3) return 30;
    if (tokens === 2) return 10;
    if (tokens === 1) return 3;
    return 0;
}

function clampMainBet(value: number) {
    return Math.max(MIN_BET, Math.floor(value / 5) * 5);
}

function clampSideBet(value: number) {
    return Math.max(0, Math.min(SIDE_MAX, Math.floor(value / SIDE_STEP) * SIDE_STEP));
}

function getHandOutcomeLabel(
    handTotal: number,
    dealerTotal: number,
    dealerHas22: boolean,
    busted: boolean,
    dealerBusted: boolean
) {
    if (busted) return "Bust";
    if (dealerHas22) return "Push 22";
    if (dealerBusted) return "Winner";
    if (handTotal > dealerTotal) return "Winner";
    if (handTotal < dealerTotal) return "Lose";
    return "Push";
}

function getHandMoneyAtRisk(hand: HandState) {
    const baseRisk = hand.baseBet.isFree ? 0 : hand.baseBet.amount;
    const doubleRisk = hand.doubleType === "paid" ? hand.baseBet.amount : 0;
    return baseRisk + doubleRisk;
}

function settleHand(hand: HandState, dealerCards: Card[]) {
    const handTotal = total(hand.cards);
    const dealerTotal = total(dealerCards);
    const dealerBusted = dealerTotal > 21;
    const dealerHas22 = dealerTotal === 22;
    const busted = handTotal > 21;
    const result = getHandOutcomeLabel(handTotal, dealerTotal, dealerHas22, busted, dealerBusted);

    const baseAmount = hand.baseBet.amount;
    const basePaid = !hand.baseBet.isFree;
    const paidDouble = hand.doubleType === "paid";
    const freeDouble = hand.doubleType === "free";

    const moneyAtRisk = getHandMoneyAtRisk(hand);

    const win =
        !busted &&
        !dealerHas22 &&
        (dealerBusted || handTotal > dealerTotal);

    const push = !busted && (dealerHas22 || (!dealerBusted && handTotal === dealerTotal));

    let totalReturn = 0;
    const lines: string[] = [];

    if (busted) {
        lines.push(`Lost ${formatMoney(moneyAtRisk)}.`);
        return {
            result,
            settlementText: lines,
            totalReturn,
            netProfit: totalReturn - moneyAtRisk,
        };
    }

    if (win) {
        if (basePaid) {
            totalReturn += baseAmount * 2;
            lines.push(`Base bet return: ${formatMoney(baseAmount * 2)}.`);
        } else {
            totalReturn += baseAmount;
            lines.push(`Free split win: ${formatMoney(baseAmount)} profit.`);
        }

        if (paidDouble) {
            totalReturn += baseAmount * 2;
            lines.push(`Paid double return: ${formatMoney(baseAmount * 2)}.`);
        }

        if (freeDouble) {
            totalReturn += baseAmount;
            lines.push(`Free double winnings: ${formatMoney(baseAmount)}.`);
        }

        return {
            result,
            settlementText: lines,
            totalReturn,
            netProfit: totalReturn - moneyAtRisk,
        };
    }

    if (push) {
        if (basePaid) {
            totalReturn += baseAmount;
            lines.push(`Base bet push: ${formatMoney(baseAmount)} returned.`);
        } else {
            lines.push("Free split hand pushes. Free token removed.");
        }

        if (paidDouble) {
            totalReturn += baseAmount;
            lines.push(`Paid double push: ${formatMoney(baseAmount)} returned.`);
        }

        if (freeDouble) {
            lines.push("Free double pushes. Free token removed.");
        }

        return {
            result,
            settlementText: lines,
            totalReturn,
            netProfit: totalReturn - moneyAtRisk,
        };
    }

    lines.push(`Lost ${formatMoney(moneyAtRisk)}.`);
    return {
        result,
        settlementText: lines,
        totalReturn,
        netProfit: totalReturn - moneyAtRisk,
    };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-full border border-sky-200/30 bg-black/35 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.22em] text-sky-50 shadow sm:px-3 sm:text-[10px] sm:tracking-[0.24em]">
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

function CardFront({ card, large = false }: { card?: Card; large?: boolean }) {
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
                    <div className={`absolute bottom-[5px] right-[5px] rotate-180 text-left leading-[0.9] sm:bottom-[6px] sm:right-[6px] lg:bottom-[6px] lg:right-[7px] ${textColor}`}>
                        <div className="text-[12px] font-extrabold sm:text-[13px] lg:text-[15px]">{card.rank}</div>
                        <div className="mt-[1px] text-[10px] sm:text-[11px] lg:text-[13px]">{card.suit}</div>
                    </div>
                    {isAce && (
                        <>
                            <div className={`absolute right-[5px] top-[5px] text-center leading-[0.9] sm:right-[6px] sm:top-[6px] lg:right-[7px] lg:top-[6px] ${textColor}`}>
                                <div className="text-[12px] font-extrabold sm:text-[13px] lg:text-[15px]">A</div>
                                <div className="text-[10px] sm:text-[11px] lg:text-[13px]">{card.suit}</div>
                            </div>
                            <div className={`absolute bottom-[5px] left-[5px] rotate-180 text-center leading-[0.9] sm:bottom-[6px] sm:left-[6px] lg:bottom-[6px] lg:left-[7px] ${textColor}`}>
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
        : "h-[62px] w-[44px] rounded-[10px] sm:h-[72px] sm:w-[50px] sm:rounded-[11px] lg:h-[80px] lg:w-[56px] lg:rounded-[12px]";

    return (
        <div className={`relative overflow-hidden border border-white/15 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${sizeClasses}`}>
            <img
                src={CARD_BACK_URL}
                alt="Card back"
                className="absolute left-1/2 top-1/2 h-[150%] w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover"
                draggable={false}
            />
        </div>
    );
}

function CardFace({ card, hidden = false, large = false }: { card?: Card; hidden?: boolean; large?: boolean }) {
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
                    style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                >
                    <CardBack large={large} />
                </div>
                <div style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
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
            <div className="mt-2 min-h-[18px] px-2 text-center text-xs font-semibold text-sky-50/95 sm:min-h-[20px] sm:text-sm">
                {result ?? ""}
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
    onClick: () => void | Promise<void>;
    disabled?: boolean;
    variant?: "default" | "bet" | "success";
}) {
    const base =
        "min-w-[132px] rounded-2xl border px-4 py-3 text-sm font-extrabold shadow-xl transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[110px] sm:px-5";
    const styles =
        variant === "bet"
            ? "border-sky-200/80 bg-[linear-gradient(180deg,_#7dd3fc,_#38bdf8)] text-slate-950 hover:brightness-105"
            : variant === "success"
                ? "border-emerald-200/80 bg-[linear-gradient(180deg,_#4ade80,_#16a34a)] text-slate-950 hover:brightness-105"
                : "border-slate-500/80 bg-[linear-gradient(180deg,_#475569,_#334155)] text-white hover:brightness-110";

    return (
        <button onClick={() => void onClick()} disabled={disabled} className={`${base} ${styles}`}>
            {children}
        </button>
    );
}

function DealButton({ onClick, disabled }: { onClick: () => void | Promise<void>; disabled?: boolean }) {
    return (
        <motion.button
            onClick={() => void onClick()}
            disabled={disabled}
            whileHover={{ scale: disabled ? 1 : 1.03 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            className="w-full max-w-[280px] rounded-full border border-sky-100/80 bg-[linear-gradient(180deg,_#bfdbfe,_#38bdf8)] px-8 py-4 text-base font-extrabold tracking-wide text-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.38)] transition disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:px-12 sm:text-lg"
        >
            Deal
        </motion.button>
    );
}

function BetInput({
    label,
    value,
    onChange,
    disabled,
    min = MIN_BET,
    max,
    step = 5,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <div className="rounded-2xl border border-sky-200/15 bg-black/20 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/85 sm:text-[11px] sm:tracking-[0.2em]">
                {label}
            </div>
            <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-white/70">$</span>
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(Number(e.target.value || 0))}
                    className="w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-8 pr-3 text-base font-bold text-white outline-none disabled:opacity-60 sm:text-lg"
                />
            </div>
        </div>
    );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.03))] p-3 shadow-2xl backdrop-blur sm:rounded-[1.35rem] sm:p-4">
            <div className="mb-3 text-center text-[11px] font-extrabold uppercase tracking-[0.18em] text-sky-100 sm:text-[12px] sm:tracking-[0.22em]">
                {title}
            </div>
            {children}
        </div>
    );
}

export default function FreeBetBlackjack({ bankroll, setBankroll }: Props) {
    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [dealer, setDealer] = useState<Card[]>([]);
    const [hands, setHands] = useState<HandState[]>([]);
    const [active, setActive] = useState(0);
    const [dealerRevealedCount, setDealerRevealedCount] = useState(1);
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
    const [potOfGoldBet, setPotOfGoldBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        const raw = window.localStorage.getItem(POT_OF_GOLD_STORAGE_KEY);
        const parsed = raw ? Number(raw) : 0;
        return Number.isFinite(parsed) ? parsed : 0;
    });
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Set your bets and press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [freeBetTokens, setFreeBetTokens] = useState(0);
    const [roundBreakdown, setRoundBreakdown] = useState<RoundBreakdown>({
        totalReturned: 0,
        totalNet: 0,
        lines: [],
        sideBets: [],
    });
    const [sideBetSnapshot, setSideBetSnapshot] = useState<SideBetSnapshot>({ push22: 0, potOfGold: 0 });

    useEffect(() => {
        window.localStorage.setItem(BET_STORAGE_KEY, String(clampMainBet(bet)));
    }, [bet]);

    useEffect(() => {
        window.localStorage.setItem(PUSH22_STORAGE_KEY, String(clampSideBet(push22Bet)));
    }, [push22Bet]);

    useEffect(() => {
        window.localStorage.setItem(POT_OF_GOLD_STORAGE_KEY, String(clampSideBet(potOfGoldBet)));
    }, [potOfGoldBet]);

    const dealerDisplayTotal = useMemo(() => {
        if (dealer.length === 0) return "";
        if (stage === "done" || stage === "dealer") return String(total(dealer));
        return dealer[0] ? String(dealer[0].value === 11 ? 11 : dealer[0].value) : "";
    }, [dealer, stage]);

    const activeHand = hands[active];

    const liveMoneyOnFelt = useMemo(() => {
        return hands.reduce((sum, hand) => sum + getHandMoneyAtRisk(hand), 0);
    }, [hands]);

    const totalBuyIn = useMemo(() => {
        if (stage === "betting") {
            return clampMainBet(bet) + clampSideBet(push22Bet) + clampSideBet(potOfGoldBet);
        }

        const activeSideBets =
            sideBetSnapshot.push22 + sideBetSnapshot.potOfGold;

        return hands.reduce((sum, hand) => sum + getHandMoneyAtRisk(hand), 0) + activeSideBets;
    }, [bet, push22Bet, potOfGoldBet, stage, hands, sideBetSnapshot]);
    
    const showFinalNet = stage === "done" && hands.some((h) => h.result !== "");

    const handRows = hands.map((hand, index) => ({
        label: `Hand ${index + 1}`,
        value:
            hand.result !== ""
                ? `${hand.result}${hand.netProfit >= 0 ? ` • +${formatMoney(hand.netProfit)}` : ` • ${formatMoney(hand.netProfit)}`}`
                : index === active && stage === "player"
                    ? "Active"
                    : "Waiting",
    }));

    const sideBetRows = [
        {
            label: "Push 22",
            value:
                push22Bet <= 0
                    ? "No Bet"
                    : stage !== "done"
                        ? "Pending"
                        : roundBreakdown.sideBets.find((s) => s.name === "Push 22")?.resultText ?? "Lose",
        },
        {
            label: "Pot of Gold",
            value:
                potOfGoldBet <= 0
                    ? "No Bet"
                    : stage !== "done"
                        ? "Pending"
                        : roundBreakdown.sideBets.find((s) => s.name === "Pot of Gold")?.resultText ?? "Lose",
        },
    ];

    const preRoundRows = [
        { label: "Base Bet", value: formatMoney(clampMainBet(bet)) },
        { label: "Push 22", value: formatMoney(clampSideBet(push22Bet)) },
        { label: "Pot of Gold", value: formatMoney(clampSideBet(potOfGoldBet)) },
    ];

    const performShuffleIfNeeded = async (shoe: Card[]) => {
        if (!shouldShuffle(shoe)) return shoe;
        setIsShuffling(true);
        setMessage("Shuffling 6-deck shoe...");
        await wait(SHUFFLE_DELAY_MS);
        const freshShoe = createShoe();
        setDeck(freshShoe);
        setIsShuffling(false);
        return freshShoe;
    };

    const settleSideBets = (dealerCards: Card[], tokenCount: number, snapshot: SideBetSnapshot) => {
        const dealerTotal = total(dealerCards);
        let totalReturn = 0;
        const lines: string[] = [];
        const sideBets: SideBetBreakdown[] = [];

        if (snapshot.push22 > 0) {
            if (dealerTotal === 22) {
                const returned = snapshot.push22 * 12;
                const netProfit = returned - snapshot.push22;
                totalReturn += returned;
                lines.push(`Push 22 return: ${formatMoney(returned)}.`);
                sideBets.push({
                    name: "Push 22",
                    wager: snapshot.push22,
                    totalReturn: returned,
                    netProfit,
                    detail: `Dealer made 22. ${formatMoney(snapshot.push22)} bet paid 11 to 1 and returned ${formatMoney(returned)} total.`,
                    resultText: "Win 11 to 1",
                });
            } else {
                lines.push(`Push 22 lost ${formatMoney(snapshot.push22)}.`);
                sideBets.push({
                    name: "Push 22",
                    wager: snapshot.push22,
                    totalReturn: 0,
                    netProfit: -snapshot.push22,
                    detail: `Dealer finished on ${dealerTotal}, so the side bet lost.`,
                    resultText: "Lose",
                });
            }
        }

        if (snapshot.potOfGold > 0) {
            const multiplier = potOfGoldMultiplier(tokenCount);
            if (multiplier > 0) {
                const returned = snapshot.potOfGold * (multiplier + 1);
                const netProfit = returned - snapshot.potOfGold;
                totalReturn += returned;
                lines.push(`Pot of Gold return: ${formatMoney(returned)} with ${tokenCount} token${tokenCount === 1 ? "" : "s"}.`);
                sideBets.push({
                    name: "Pot of Gold",
                    wager: snapshot.potOfGold,
                    totalReturn: returned,
                    netProfit,
                    detail: `${tokenCount} token${tokenCount === 1 ? "" : "s"} earned ${multiplier} to 1, returning ${formatMoney(returned)} total.`,
                    resultText: `Win ${multiplier} to 1`,
                });
            } else {
                lines.push(`Pot of Gold lost ${formatMoney(snapshot.potOfGold)} with ${tokenCount} tokens.`);
                sideBets.push({
                    name: "Pot of Gold",
                    wager: snapshot.potOfGold,
                    totalReturn: 0,
                    netProfit: -snapshot.potOfGold,
                    detail: `${tokenCount} token${tokenCount === 1 ? "" : "s"} did not qualify for a payout.`,
                    resultText: "Lose",
                });
            }
        }

        return {
            totalReturn,
            netProfit: totalReturn - snapshot.push22 - snapshot.potOfGold,
            lines,
            sideBets,
        };
    };

    const applyRoundBreakdown = (
        settledHands: HandState[],
        dealerCards: Card[],
        tokenCount: number,
        snapshot: SideBetSnapshot
    ) => {
        const handLines: string[] = [];
        let handsReturn = 0;
        let handsRisk = 0;

        settledHands.forEach((hand, index) => {
            handsReturn += hand.totalReturn;
            handsRisk += getHandMoneyAtRisk(hand);
            handLines.push(`Hand ${index + 1}: ${hand.result}.`);
            hand.settlementText.forEach((line) => handLines.push(`  ${line}`));
            handLines.push(`  Total returned: ${formatMoney(hand.totalReturn)}.`);
            handLines.push(`  Net: ${hand.netProfit >= 0 ? "+" : ""}${formatMoney(hand.netProfit)}.`);
        });

        const side = settleSideBets(dealerCards, tokenCount, snapshot);

        const totalReturned = handsReturn + side.totalReturn;
        const totalRisk = handsRisk + snapshot.push22 + snapshot.potOfGold;
        const totalNet = totalReturned - totalRisk;

        setRoundBreakdown({
            totalReturned,
            totalNet,
            lines: [
                ...handLines,
                ...side.lines,
                `Round total returned: ${formatMoney(totalReturned)}.`,
                `Round net: ${totalNet >= 0 ? "+" : ""}${formatMoney(totalNet)}.`,
            ],
            sideBets: side.sideBets,
        });

        if (totalReturned > 0) {
            setBankroll((b) => b + totalReturned);
        }
    };

    const finishRoundWithoutDealer = async (
        finalHands: HandState[],
        snapshot: SideBetSnapshot
    ) => {
        const allBusted = finalHands.length > 0 && finalHands.every((hand) => total(hand.cards) > 21);

        if (allBusted) {
            setMessage("All hands bust. Dealer reveals hole card.");
        } else {
            setMessage("Round complete.");
        }

        if (dealer.length > 0) {
            setDealerRevealedCount(dealer.length);
            await wait(1000);
        }

        const finalized = finalHands.map((hand) => {
            const settled = settleHand({ ...hand, result: "Bust" }, dealer);
            return {
                ...hand,
                result: settled.result,
                settlementText: settled.settlementText,
                totalReturn: settled.totalReturn,
                netProfit: settled.netProfit,
            };
        });

        setHands(finalized);
        applyRoundBreakdown(finalized, dealer, freeBetTokens, snapshot);

        setStage("done");
        setMessage(allBusted ? "All hands bust. Dealer does not draw." : "Round complete.");
    };

    const dealerTurn = async (
        handsInPlay: HandState[] = hands,
        shoeInPlay: Card[] = deck,
        tokenCount = freeBetTokens,
        snapshot: SideBetSnapshot
    ) => {
        const liveHands = handsInPlay.filter((hand) => total(hand.cards) <= 21);
        if (liveHands.length === 0) {
            await finishRoundWithoutDealer(handsInPlay, snapshot);
            return;
        }

        let nextDealer = [...dealer];
        let nextDeck = [...shoeInPlay];
        let revealedCount = 1;

        setStage("dealer");
        setMessage("Dealer reveals hole card.");
        setDealerRevealedCount(2);
        revealedCount = 2;

        await wait(450);

        while (total(nextDealer) < 17 || (total(nextDealer) === 17 && isSoft(nextDealer))) {
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

        const settledHands = handsInPlay.map((hand) => {
            const settled = settleHand(hand, nextDealer);
            return {
                ...hand,
                result: settled.result,
                settlementText: settled.settlementText,
                totalReturn: settled.totalReturn,
                netProfit: settled.netProfit,
            };
        });

        setDeck(nextDeck);
        setDealer(nextDealer);
        setDealerRevealedCount(nextDealer.length);
        setHands(settledHands);

        applyRoundBreakdown(settledHands, nextDealer, tokenCount, snapshot);

        const dealerTotal = total(nextDealer);
        setStage("done");
        setMessage(
            dealerTotal === 22
                ? "Dealer makes 22. All live hands push."
                : dealerTotal > 21
                    ? "Dealer busts."
                    : "Round complete."
        );
    };

    const ensureHandHasSecondCard = async (
        handsInPlay: HandState[],
        handIndex: number,
        shoeInPlay: Card[]
    ) => {
        const targetHand = handsInPlay[handIndex];
        if (!targetHand || targetHand.cards.length !== 1) {
            return { hands: handsInPlay, deck: shoeInPlay };
        }

        const nextDeck = [...shoeInPlay];
        const drawnCard = nextDeck.shift();
        if (!drawnCard) {
            return { hands: handsInPlay, deck: shoeInPlay };
        }

        const nextHands = [...handsInPlay];
        nextHands[handIndex] = {
            ...nextHands[handIndex],
            cards: [...nextHands[handIndex].cards, drawnCard],
        };

        setHands(nextHands);
        setDeck(nextDeck);
        await wait(250);

        return { hands: nextHands, deck: nextDeck };
    };

    const moveToNextHand = async (
        nextHands: HandState[],
        nextDeck: Card[],
        tokenCount = freeBetTokens,
        currentActive = active,
        snapshot: SideBetSnapshot
    ) => {
        const nextIndex = currentActive + 1;

        if (nextIndex < nextHands.length) {
            setActive(nextIndex);
            setMessage(`Playing hand ${nextIndex + 1} of ${nextHands.length}.`);

            const dealt = await ensureHandHasSecondCard(nextHands, nextIndex, nextDeck);
            const nextHand = dealt.hands[nextIndex];
            const nextTotal = total(nextHand.cards);

            if (nextTotal === 21) {
                setMessage(`Hand ${nextIndex + 1} makes 21.`);
                await moveToNextHand(dealt.hands, dealt.deck, tokenCount, nextIndex, snapshot);
                return;
            }

            if (nextTotal > 21) {
                const bustedHands = [...dealt.hands];
                bustedHands[nextIndex] = { ...bustedHands[nextIndex], result: "Bust" };
                setHands(bustedHands);
                setMessage(`Hand ${nextIndex + 1} busts.`);
                await moveToNextHand(bustedHands, dealt.deck, tokenCount, nextIndex, snapshot);
                return;
            }

            return;
        }

        if (nextHands.some((hand) => total(hand.cards) <= 21)) {
            await dealerTurn(nextHands, nextDeck, tokenCount, snapshot);
            return;
        }

        await finishRoundWithoutDealer(nextHands, snapshot);
    };

    const split = async () => {
        if (!activeHand) return;
        if (hands.length >= MAX_HANDS) return;
        if (activeHand.cards.length !== 2) return;
        if (!canSplitRanks(activeHand.cards)) return;

        const freeSplit = isFreeSplit(activeHand.cards);
        const splitCost = freeSplit ? 0 : activeHand.baseBet.amount;

        if (bankroll < splitCost) return;

        if (splitCost > 0) {
            setBankroll((b) => b - splitCost);
        }

        const firstCard = activeHand.cards[0];
        const secondCard = activeHand.cards[1];

        const firstHand: HandState = {
            cards: [firstCard],
            baseBet: { ...activeHand.baseBet },
            doubleType: "none",
            splitDepth: activeHand.splitDepth + 1,
            result: "",
            settlementText: [],
            totalReturn: 0,
            netProfit: 0,
        };

        const secondHand: HandState = {
            cards: [secondCard],
            baseBet: {
                amount: activeHand.baseBet.amount,
                isFree: freeSplit,
            },
            doubleType: "none",
            splitDepth: activeHand.splitDepth + 1,
            result: "",
            settlementText: [],
            totalReturn: 0,
            netProfit: 0,
        };

        const nextHands = [
            ...hands.slice(0, active),
            firstHand,
            secondHand,
            ...hands.slice(active + 1),
        ];

        const nextTokenCount = freeSplit ? freeBetTokens + 1 : freeBetTokens;

        setHands(nextHands);
        setFreeBetTokens(nextTokenCount);
        setMessage(freeSplit ? `Free split on hand ${active + 1}.` : `Paid split on hand ${active + 1}.`);

        const dealt = await ensureHandHasSecondCard(nextHands, active, deck);
        const activeTotal = total(dealt.hands[active].cards);

        if (activeTotal === 21) {
            setMessage(`Hand ${active + 1} makes 21.`);
            await moveToNextHand(dealt.hands, dealt.deck, nextTokenCount, active, sideBetSnapshot);
            return;
        }

        if (activeTotal > 21) {
            const bustedHands = [...dealt.hands];
            bustedHands[active] = { ...bustedHands[active], result: "Bust" };
            setHands(bustedHands);
            setMessage(`Hand ${active + 1} busts.`);
            await moveToNextHand(bustedHands, dealt.deck, nextTokenCount, active, sideBetSnapshot);
        }
    };

    const deal = async () => {
        if (isShuffling) return;

        const wager = clampMainBet(bet);
        const clampedPush22 = clampSideBet(push22Bet);
        const clampedPotOfGold = clampSideBet(potOfGoldBet);
        const buyIn = wager + clampedPush22 + clampedPotOfGold;

        if (bankroll < buyIn) {
            setMessage("Not enough bankroll for those bets.");
            return;
        }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);

        if (nextDeck.length < 4) {
            nextDeck = await performShuffleIfNeeded([]);
        }

        const snapshot: SideBetSnapshot = { push22: clampedPush22, potOfGold: clampedPotOfGold };
        setSideBetSnapshot(snapshot);

        setBankroll((b) => b - buyIn);

        const playerHand = [nextDeck[0], nextDeck[1]];
        const dealerHand = [nextDeck[2], nextDeck[3]];
        nextDeck = nextDeck.slice(4);

        const openingHand: HandState = {
            cards: playerHand,
            baseBet: { amount: wager, isFree: false },
            doubleType: "none",
            splitDepth: 0,
            result: "",
            settlementText: [],
            totalReturn: 0,
            netProfit: 0,
        };

        setDeck(nextDeck);
        setDealer(dealerHand);
        setDealerRevealedCount(1);
        setHands([openingHand]);
        setActive(0);
        setFreeBetTokens(0);
        setRoundBreakdown({ totalReturned: 0, totalNet: 0, lines: [], sideBets: [] });

        const dealerBJ = isBlackjack(dealerHand);
        const playerBJ = isBlackjack(playerHand);

        if (dealerBJ) {
            setDealerRevealedCount(2);

            let settledHand: HandState;
            if (playerBJ) {
                settledHand = {
                    ...openingHand,
                    result: "Push",
                    settlementText: [`Blackjack push: ${formatMoney(wager)} returned.`],
                    totalReturn: wager,
                    netProfit: 0,
                };
                setMessage("Both player and dealer have blackjack. Push.");
            } else {
                settledHand = {
                    ...openingHand,
                    result: "Lose",
                    settlementText: [`Lost ${formatMoney(wager)}.`],
                    totalReturn: 0,
                    netProfit: -wager,
                };
                setMessage("Dealer blackjack. Hand over.");
            }

            setHands([settledHand]);
            applyRoundBreakdown([settledHand], dealerHand, 0, snapshot);
            setStage("done");
            return;
        }

        if (playerBJ) {
            setDealerRevealedCount(2);

            const settledHand: HandState = {
                ...openingHand,
                result: "Blackjack",
                settlementText: [`Blackjack return: ${formatMoney(wager * 2.5)}.`],
                totalReturn: wager * 2.5,
                netProfit: wager * 1.5,
            };

            setHands([settledHand]);
            applyRoundBreakdown([settledHand], dealerHand, 0, snapshot);
            setStage("done");
            setMessage("Blackjack pays 3 to 2.");
            return;
        }

        setStage("player");
        setMessage("Hit, stay, double, or split.");
    };

    const hit = async () => {
        if (!activeHand) return;

        const nextDeck = [...deck];
        const card = nextDeck.shift();
        if (!card) return;

        const nextHands = [...hands];
        nextHands[active] = {
            ...nextHands[active],
            cards: [...nextHands[active].cards, card],
        };

        setDeck(nextDeck);
        setHands(nextHands);

        const handTotal = total(nextHands[active].cards);

        if (handTotal === 21) {
            setMessage(`Hand ${active + 1} makes 21.`);
            await moveToNextHand(nextHands, nextDeck, freeBetTokens, active, sideBetSnapshot);
            return;
        }

        if (handTotal > 21) {
            const bustedHands = [...nextHands];
            bustedHands[active] = { ...bustedHands[active], result: "Bust" };
            setHands(bustedHands);
            setMessage(`Hand ${active + 1} busts.`);
            await moveToNextHand(bustedHands, nextDeck, freeBetTokens, active, sideBetSnapshot);
        }
    };

    const stay = async () => {
        await moveToNextHand(hands, deck, freeBetTokens, active, sideBetSnapshot);
    };

    const doubleDown = async () => {
        if (!activeHand) return;
        if (activeHand.cards.length !== 2) return;

        const freeDouble = isHardFreeDouble(activeHand.cards);
        const cost = freeDouble ? 0 : activeHand.baseBet.amount;

        if (bankroll < cost) return;

        if (cost > 0) {
            setBankroll((b) => b - cost);
        }

        const nextTokenCount = freeDouble ? freeBetTokens + 1 : freeBetTokens;
        const nextHands = [...hands];
        nextHands[active] = {
            ...nextHands[active],
            doubleType: freeDouble ? "free" : "paid",
        };

        const nextDeck = [...deck];
        const card = nextDeck.shift();
        if (!card) return;

        nextHands[active] = {
            ...nextHands[active],
            cards: [...nextHands[active].cards, card],
        };

        setHands(nextHands);
        setDeck(nextDeck);
        setFreeBetTokens(nextTokenCount);

        if (total(nextHands[active].cards) > 21) {
            nextHands[active] = { ...nextHands[active], result: "Bust" };
            setHands([...nextHands]);
            setMessage(
                freeDouble
                    ? `Hand ${active + 1} busts after free double.`
                    : `Hand ${active + 1} busts after doubling.`
            );
        }

        await moveToNextHand(nextHands, nextDeck, nextTokenCount, active, sideBetSnapshot);
    };

    const nextRound = () => {
        setDealer([]);
        setHands([]);
        setActive(0);
        setDealerRevealedCount(1);
        setStage("betting");
        setFreeBetTokens(0);
        setRoundBreakdown({ totalReturned: 0, totalNet: 0, lines: [], sideBets: [] });
        setMessage(
            shouldShuffle(deck)
                ? "Cut card reached. Next hand will shuffle the shoe."
                : "Set your bets and press Deal."
        );
    };

    const canSplit =
        stage === "player" &&
        !!activeHand &&
        activeHand.cards.length === 2 &&
        hands.length < MAX_HANDS &&
        canSplitRanks(activeHand.cards) &&
        (isFreeSplit(activeHand.cards) || bankroll >= activeHand.baseBet.amount);

    const canDouble =
        stage === "player" &&
        !!activeHand &&
        activeHand.cards.length === 2 &&
        (isHardFreeDouble(activeHand.cards) || bankroll >= activeHand.baseBet.amount);

    const cardsUsed = SHOE_SIZE - deck.length;
    const penetrationPct = Math.min(100, Math.round((cardsUsed / SHOE_SIZE) * 100));

    return (
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_#60a5fa,_#2563eb_28%,_#0f3f8c_58%,_#061933_100%)] text-white">
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                    <div className="rounded-[1.6rem] border border-sky-200/25 bg-black/65 px-10 py-8 text-center shadow-[0_25px_80px_rgba(0,0,0,0.45)] sm:px-12 sm:py-9">
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-sky-100 sm:text-[12px]">
                            Free Bet Blackjack
                        </div>
                        <div className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Shuffling Shoe</div>
                        <div className="mt-3 text-sm text-sky-50/85">Please wait…</div>
                    </div>
                </div>
            )}

            <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1700px] flex-col gap-3 px-2 py-2 sm:px-3 sm:py-3">
                <div className="rounded-[1.35rem] border border-sky-200/15 bg-black/25 p-3 shadow-2xl backdrop-blur sm:rounded-[1.7rem] sm:p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-sky-100/90 sm:text-[12px] sm:tracking-[0.3em]">
                                Casino Table
                            </div>
                            <h2 className="mt-1 text-2xl font-extrabold tracking-[0.02em] text-sky-50 sm:text-4xl md:text-5xl">
                                Free Bet Blackjack
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <StatPill label="Bankroll" value={formatMoney(bankroll)} accent="gold" />
                            <StatPill label="Stage" value={<span className="capitalize">{stage}</span>} />
                            <StatPill label="Active Hand" value={hands.length > 0 ? `${active + 1} / ${hands.length}` : "—"} />
                            <StatPill label="Tokens" value={freeBetTokens} accent="green" />
                            <StatPill label="Dealer Showing" value={dealer[0] ? `${dealer[0].rank}${dealer[0].suit}` : "—"} />
                        </div>
                    </div>
                </div>

                <div className="rounded-[1.45rem] border border-white/10 bg-black/20 p-2.5 shadow-2xl backdrop-blur sm:rounded-[1.8rem] sm:p-3">
                    <div className="rounded-[1.2rem] border border-sky-200/20 bg-[linear-gradient(180deg,_rgba(0,0,0,0.22),_rgba(0,0,0,0.12))] px-4 py-3 text-center shadow-lg sm:rounded-[1.45rem] sm:px-5 sm:py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100 sm:text-[11px] sm:tracking-[0.24em]">
                            Table Message
                        </div>
                        <div className="mt-2 text-base font-bold text-sky-50 sm:text-lg md:text-xl">{message}</div>
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
                        <div className="order-3 space-y-3 xl:order-1">
                            <InfoCard title="Rules">
                                <div className="space-y-2 text-sm text-sky-50/90">
                                    <div>• 6 decks.</div>
                                    <div>• Dealer hits soft 17.</div>
                                    <div>• Blackjack pays 3 to 2.</div>
                                    <div>• Double after split allowed.</div>
                                    <div>• Double on 2 cards only.</div>
                                    <div>• Split up to 4 hands, including aces.</div>
                                    <div>• No surrender.</div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Free Bet Rules">
                                <div className="space-y-2 text-sm text-sky-50/90">
                                    <div>• Free double on hard 9, 10, or 11.</div>
                                    <div>• Free split on A through 9 pairs.</div>
                                    <div>• 10-value pairs can still be split for a paid wager.</div>
                                    <div>• Dealer 22 pushes all live hands.</div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Side Bets">
                                <div className="space-y-2 text-sm text-sky-50/90">
                                    <div>• Push 22 pays 11 to 1.</div>
                                    <div>• Pot of Gold pays by free-bet token count.</div>
                                    <div>• 1 token = 3 to 1</div>
                                    <div>• 2 = 10 to 1</div>
                                    <div>• 3 = 30 to 1</div>
                                    <div>• 4 = 60 to 1</div>
                                    <div>• 5 = 100 to 1</div>
                                    <div>• 6 = 300 to 1</div>
                                    <div>• 7+ = 1000 to 1</div>
                                </div>
                            </InfoCard>
                        </div>

                        <div className="order-1 min-w-0 rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(125,211,252,0.3),_rgba(56,189,248,0.22)_38%,_rgba(14,116,144,0.26)_65%,_rgba(0,0,0,0.22)_88%)] p-2.5 sm:rounded-[1.6rem] sm:p-4 xl:order-2">
                            <div className="flex h-full flex-col gap-3 sm:gap-4">
                                <div className="overflow-hidden rounded-[1rem] border border-white/10 bg-black/10 px-2 py-3 sm:rounded-[1.25rem] sm:px-3 sm:py-4">
                                    <div className="flex flex-col gap-5 sm:gap-6">
                                        <CardLane
                                            label="Dealer"
                                            cards={dealer}
                                            hiddenIndexes={dealer
                                                .map((_, index) => index)
                                                .filter((index) => index >= dealerRevealedCount)}
                                            large
                                            result={
                                                dealer.length > 0 && (stage === "done" || stage === "dealer")
                                                    ? `${total(dealer)}${isSoft(dealer) ? " soft" : ""}`
                                                    : ""
                                            }
                                        />

                                        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                                            {Array.from({ length: Math.max(hands.length, 1) }).map((_, index) => {
                                                const hand = hands[index];
                                                const handTotal = hand ? total(hand.cards) : null;
                                                const dealerTotal = dealer.length > 0 ? total(dealer) : 0;
                                                const busted = handTotal !== null && handTotal > 21;
                                                const dealerBusted = dealerTotal > 21;
                                                const dealerHas22 = dealerTotal === 22;
                                                const finalResult =
                                                    stage === "done" && hand && handTotal !== null
                                                        ? getHandOutcomeLabel(handTotal, dealerTotal, dealerHas22, busted, dealerBusted)
                                                        : index === active && stage === "player"
                                                            ? "Active"
                                                            : "";

                                                const betLabel = hand
                                                    ? `${hand.baseBet.isFree ? "Free" : "Paid"} ${formatMoney(hand.baseBet.amount)}${hand.doubleType === "free" ? " + Free Double" : hand.doubleType === "paid" ? " + Paid Double" : ""}`
                                                    : "—";

                                                return (
                                                    <div
                                                        key={index}
                                                        className={`rounded-[1.3rem] border p-3 shadow-xl backdrop-blur sm:p-4 ${index === active && stage === "player"
                                                            ? "border-sky-100/40 bg-sky-200/10 ring-2 ring-sky-100/20"
                                                            : "border-white/10 bg-black/18"
                                                            }`}
                                                    >
                                                        <CardLane
                                                            label={`Hand ${index + 1}`}
                                                            cards={hand?.cards ?? []}
                                                            large
                                                            result={
                                                                handTotal !== null
                                                                    ? `${handTotal}${hand && isSoft(hand.cards) ? " soft" : ""}${finalResult ? ` • ${finalResult}` : ""}`
                                                                    : "Waiting"
                                                            }
                                                        />

                                                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center text-sm font-semibold text-sky-50">
                                                            {betLabel}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="sticky bottom-2 z-10 -mx-1 mt-1 rounded-[1.1rem] border border-white/10 bg-black/45 px-2 py-2 backdrop-blur sm:static sm:mx-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                                        <AnimatePresence mode="wait" initial={false}>
                                            {stage === "betting" && (
                                                <motion.div
                                                    key="deal"
                                                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                                >
                                                    <DealButton onClick={deal} disabled={isShuffling} />
                                                </motion.div>
                                            )}

                                            {stage === "player" && (
                                                <motion.div
                                                    key="player-actions"
                                                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                                    className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"
                                                >
                                                    <ActionButton onClick={hit}>Hit</ActionButton>
                                                    <ActionButton onClick={stay}>Stay</ActionButton>
                                                    <ActionButton onClick={doubleDown} variant="bet" disabled={!canDouble}>
                                                        {activeHand && isHardFreeDouble(activeHand.cards) ? "Free Double" : "Double"}
                                                    </ActionButton>
                                                    <ActionButton onClick={split} variant="bet" disabled={!canSplit}>
                                                        {activeHand && isFreeSplit(activeHand.cards) ? "Free Split" : "Split"}
                                                    </ActionButton>
                                                </motion.div>
                                            )}

                                            {stage === "done" && (
                                                <motion.div
                                                    key="done-actions"
                                                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                                >
                                                    <ActionButton onClick={nextRound} variant="success">
                                                        Next Hand
                                                    </ActionButton>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="order-2 space-y-3 xl:order-3">
                            <InfoCard title="Betting Area">
                                <div className="space-y-3">
                                    <BetInput
                                        label="Base Bet"
                                        value={bet}
                                        onChange={setBet}
                                        disabled={stage !== "betting" || isShuffling}
                                        min={MIN_BET}
                                        step={5}
                                    />
                                    <BetInput
                                        label="Push 22 Side Bet"
                                        value={push22Bet}
                                        onChange={setPush22Bet}
                                        disabled={stage !== "betting" || isShuffling}
                                        min={0}
                                        max={SIDE_MAX}
                                        step={SIDE_STEP}
                                    />
                                    <BetInput
                                        label="Pot of Gold Side Bet"
                                        value={potOfGoldBet}
                                        onChange={setPotOfGoldBet}
                                        disabled={stage !== "betting" || isShuffling}
                                        min={0}
                                        max={SIDE_MAX}
                                        step={SIDE_STEP}
                                    />

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                <div className="text-[9px] uppercase tracking-[0.16em] text-white/60 sm:text-[10px]">
                                                    Bet
                                                </div>
                                                <div className="mt-1 text-sm font-extrabold text-white">
                                                    {formatMoney(totalBuyIn)}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                <div className="text-[9px] uppercase tracking-[0.16em] text-white/60 sm:text-[10px]">
                                                    Returned
                                                </div>
                                                <div className="mt-1 text-sm font-extrabold text-white">
                                                    {showFinalNet ? formatMoney(roundBreakdown.totalReturned) : "—"}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                <div className="text-[9px] uppercase tracking-[0.16em] text-white/60 sm:text-[10px]">
                                                    Net
                                                </div>
                                                <div
                                                    className={`mt-1 text-sm font-extrabold ${showFinalNet
                                                        ? roundBreakdown.totalNet > 0
                                                            ? "text-emerald-300"
                                                            : roundBreakdown.totalNet < 0
                                                                ? "text-red-300"
                                                                : "text-sky-100"
                                                        : "text-sky-100"
                                                        }`}
                                                >
                                                    {showFinalNet ? `${roundBreakdown.totalNet > 0 ? "+" : ""}${formatMoney(roundBreakdown.totalNet)}` : "—"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-sky-50/90 sm:text-sm">
                                        {stage === "betting"
                                            ? "Place base bet and optional side bets."
                                            : stage === "player"
                                                ? `Playing hand ${hands.length > 0 ? active + 1 : 0}${hands.length > 0 ? ` of ${hands.length}` : ""}.`
                                                : stage === "dealer"
                                                    ? "Dealer is resolving the round."
                                                    : "Round finished."}
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-sky-50/90 sm:text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Dealer showing</span>
                                            <span className="font-semibold text-white">
                                                {dealer[0] ? `${dealer[0].rank}${dealer[0].suit}` : "—"}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span>Active hand total</span>
                                            <span className="font-semibold text-white">
                                                {activeHand?.cards.length
                                                    ? `${total(activeHand.cards)}${isSoft(activeHand.cards) ? " soft" : ""}`
                                                    : "—"}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span>Live money on felt</span>
                                            <span className="font-semibold text-white">{formatMoney(liveMoneyOnFelt)}</span>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[11px] sm:text-xs">
                                        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/60">
                                            Hand Results
                                        </div>
                                        <div className="space-y-1">
                                            {handRows.length > 0 ? (
                                                handRows.map((row) => (
                                                    <div key={row.label} className="flex items-center justify-between gap-2">
                                                        <span className="text-white/70">{row.label}</span>
                                                        <span className="font-bold text-sky-100">{row.value}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/70">Main Hand</span>
                                                    <span className="font-bold text-sky-100">Pending</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[11px] sm:text-xs">
                                        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/60">
                                            Side Bet Results
                                        </div>
                                        <div className="space-y-1">
                                            {sideBetRows.map((row) => (
                                                <div key={row.label} className="flex items-center justify-between gap-2">
                                                    <span className="text-white/70">{row.label}</span>
                                                    <span className="font-bold text-sky-100">{row.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {!showFinalNet && (
                                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[11px] text-sky-50/85 sm:text-xs">
                                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/60">
                                                Current Bets
                                            </div>
                                            <div className="space-y-1">
                                                {preRoundRows.map((row) => (
                                                    <div key={row.label} className="flex items-center justify-between gap-2">
                                                        <span>{row.label}</span>
                                                        <span className="font-bold text-white">{row.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-2xl border border-sky-200/15 bg-sky-950/30 px-4 py-3 text-center text-xs font-medium text-sky-50/95 sm:text-sm">
                                        One shared bankroll is used across all casino games.
                                    </div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Table Info">
                                <div className="space-y-2 text-sm text-sky-50/90">
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Dealer total</span>
                                        <span className="font-semibold text-white">{dealerDisplayTotal || "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Cards left</span>
                                        <span className="font-semibold text-white">{deck.length}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Shoe used</span>
                                        <span className="font-semibold text-white">{penetrationPct}%</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Hands in play</span>
                                        <span className="font-semibold text-white">{hands.length || 0}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Free bet tokens</span>
                                        <span className="font-semibold text-white">{freeBetTokens}</span>
                                    </div>
                                </div>
                            </InfoCard>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}