import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

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

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-zinc-100 shadow">
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
            ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
            : accent === "green"
                ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                : "border-white/10 bg-white/5 text-white";

    return (
        <div className={`rounded-2xl border px-4 py-3 shadow-lg ${accentClasses}`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                {label}
            </div>
            <div className="mt-1 text-lg font-extrabold">{value}</div>
        </div>
    );
}

function CardFront({ card, large = false }: { card?: Card; large?: boolean }) {
    const isRed = card?.suit === "♥" || card?.suit === "♦";
    const textColor = isRed ? "text-red-600" : "text-slate-900";
    const sizeClasses = large
        ? "h-[94px] w-[66px] rounded-[14px] sm:h-[106px] sm:w-[74px]"
        : "h-[80px] w-[56px] rounded-[12px] sm:h-[90px] sm:w-[62px]";

    return (
        <div
            className={`relative flex items-center justify-center border border-slate-300/90 bg-[linear-gradient(180deg,_#ffffff,_#f4f4f5)] font-bold shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${sizeClasses}`}
        >
            {!card ? (
                <div className="text-2xl text-slate-400">?</div>
            ) : (
                <>
                    <div className={`absolute left-[6px] top-[6px] text-left leading-[0.9] ${textColor}`}>
                        <div className="text-[15px] font-extrabold">{card.rank}</div>
                        <div className="mt-[1px] text-[13px]">{card.suit}</div>
                    </div>
                    <div
                        className={`absolute bottom-[6px] right-[6px] rotate-180 text-left leading-[0.9] ${textColor}`}
                    >
                        <div className="text-[15px] font-extrabold">{card.rank}</div>
                        <div className="mt-[1px] text-[13px]">{card.suit}</div>
                    </div>
                    <div className={`${textColor} text-[24px]`}>{card.suit}</div>
                </>
            )}
        </div>
    );
}

function CardBack({ large = false }: { large?: boolean }) {
    const sizeClasses = large
        ? "h-[94px] w-[66px] rounded-[14px] sm:h-[106px] sm:w-[74px]"
        : "h-[80px] w-[56px] rounded-[12px] sm:h-[90px] sm:w-[62px]";

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

function CardFace({
    card,
    hidden = false,
    large = false,
    sideways = false,
}: {
    card?: Card;
    hidden?: boolean;
    large?: boolean;
    sideways?: boolean;
}) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -16, scale: 0.92, rotate: sideways ? 90 : 0 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: sideways ? 90 : 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className={sideways ? "origin-center" : ""}
            style={sideways ? { marginLeft: 16, marginRight: 16, marginTop: 8, marginBottom: 8 } : undefined}
        >
            <motion.div
                animate={{ rotateY: hidden ? 0 : 180 }}
                transition={{ duration: 0.55, ease: "easeInOut" }}
                style={{ transformStyle: "preserve-3d" }}
                className="relative [perspective:1000px]"
            >
                <div
                    className="absolute inset-0"
                    style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
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

function ActionButton({
    children,
    onClick,
    disabled,
    variant = "default",
}: {
    children: React.ReactNode;
    onClick: () => void | Promise<void>;
    disabled?: boolean;
    variant?: "default" | "gold" | "success" | "danger";
}) {
    const base =
        "min-w-[132px] rounded-2xl border px-5 py-3 text-sm font-extrabold shadow-xl transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45";
    const styles =
        variant === "gold"
            ? "border-amber-200/70 bg-[linear-gradient(180deg,_#fcd34d,_#d97706)] text-zinc-950 hover:brightness-105"
            : variant === "success"
                ? "border-emerald-200/70 bg-[linear-gradient(180deg,_#4ade80,_#15803d)] text-zinc-950 hover:brightness-105"
                : variant === "danger"
                    ? "border-red-200/60 bg-[linear-gradient(180deg,_#fb7185,_#be123c)] text-white hover:brightness-105"
                    : "border-zinc-500/80 bg-[linear-gradient(180deg,_#52525b,_#27272a)] text-white hover:brightness-110";

    return (
        <button onClick={() => void onClick()} disabled={disabled} className={`${base} ${styles}`}>
            {children}
        </button>
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
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-200/85">
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
                    step={step}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(Number(e.target.value || 0))}
                    className="w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-8 pr-3 text-lg font-bold text-white outline-none disabled:opacity-60"
                />
            </div>
        </div>
    );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.03))] p-4 shadow-2xl backdrop-blur">
            <div className="mb-3 text-center text-[12px] font-extrabold uppercase tracking-[0.22em] text-zinc-100">
                {title}
            </div>
            {children}
        </div>
    );
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

    const [roundReturned, setRoundReturned] = useState(0);
    const [roundNet, setRoundNet] = useState(0);
    const [resultLabel, setResultLabel] = useState("");
    const [resultLines, setResultLines] = useState<string[]>([]);

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

    const shoeUsed = SHOE_SIZE - deck.length;
    const penetrationPct = Math.min(100, Math.round((shoeUsed / SHOE_SIZE) * 100));

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

    const dealerCardsHiddenIndexes = dealerCards
        .map((_, idx) => idx)
        .filter((idx) => idx >= dealerRevealCount);

    return (
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_#4b5563,_#18181b_28%,_#0f0f13_58%,_#030304_100%)] text-white">
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
                    <div className="rounded-[1.6rem] border border-white/10 bg-black/65 px-12 py-9 text-center shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
                        <div className="text-[12px] font-extrabold uppercase tracking-[0.28em] text-zinc-200">
                            Double Down Madness
                        </div>
                        <div className="mt-2 text-4xl font-extrabold text-white">Shuffling Shoe</div>
                        <div className="mt-3 text-sm text-zinc-300">Please wait…</div>
                    </div>
                </div>
            )}

            <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1700px] flex-col gap-3 px-3 py-3">
                <div className="rounded-[1.7rem] border border-white/10 bg-black/25 p-4 shadow-2xl backdrop-blur">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <div className="text-[12px] font-extrabold uppercase tracking-[0.3em] text-zinc-300/90">
                                Casino Table
                            </div>
                            <h2 className="mt-1 text-4xl font-extrabold tracking-[0.02em] text-zinc-50 sm:text-5xl">
                                Double Down Madness
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <StatPill label="Bankroll" value={formatMoney(bankroll)} accent="gold" />
                            <StatPill label="Stage" value={<span className="capitalize">{stage}</span>} />
                            <StatPill label="Main Risk" value={formatMoney(totalRiskOnMain)} />
                            <StatPill label="Next Double" value={formatMoney(nextDoubleAmount)} accent="green" />
                            <StatPill
                                label="Dealer Showing"
                                value={dealerCards[0] ? `${dealerCards[0].rank}${dealerCards[0].suit}` : "—"}
                            />
                        </div>
                    </div>
                </div>

                <div className="rounded-[1.8rem] border border-white/10 bg-black/20 p-3 shadow-2xl backdrop-blur">
                    <div className="rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.02))] px-5 py-4 text-center shadow-lg">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-300">
                            Table Message
                        </div>
                        <div className="mt-2 text-lg font-bold text-zinc-50 sm:text-xl">{message}</div>
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-[290px_minmax(0,1fr)_350px]">
                        <div className="order-3 space-y-3 xl:order-1">
                            <InfoCard title="Rules">
                                <div className="space-y-2 text-sm text-zinc-100/90">
                                    <div>• 6 decks.</div>
                                    <div>• You start with 1 card.</div>
                                    <div>• Dealer gets 2 with a hole card.</div>
                                    <div>• No splitting.</div>
                                    <div>• Double Down on Any Card.</div>
                                    <div>• Re-double allowed.</div>
                                    <div>• Dealer hits soft 17.</div>
                                    <div>• Dealer 22 pushes standing wagers.</div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Blackjack Pay">
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">
                                        Suited blackjack pays 2:1. Unsuited blackjack pays 3:2.
                                    </div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Double Ladder">
                                <div className="space-y-2 text-sm text-zinc-100/90">
                                    <div className="flex items-center justify-between">
                                        <span>Base bet</span>
                                        <span className="font-bold text-white">{formatMoney(baseBet)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>1st double</span>
                                        <span className="font-bold text-white">{formatMoney(baseBet)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>2nd double</span>
                                        <span className="font-bold text-white">{formatMoney(baseBet * 2)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>3rd double</span>
                                        <span className="font-bold text-white">{formatMoney(baseBet * 4)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>4th double</span>
                                        <span className="font-bold text-white">{formatMoney(baseBet * 8)}</span>
                                    </div>
                                </div>
                            </InfoCard>
                        </div>

                        <div className="order-1 min-w-0 rounded-[1.6rem] border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(64,64,64,0.6),_rgba(24,24,27,0.88)_36%,_rgba(9,9,11,0.95)_72%,_rgba(0,0,0,0.98)_100%)] p-4 xl:order-2">
                            <div className="flex h-full flex-col gap-5">
                                <div className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-black/15 px-3 py-5">
                                    <div className="flex flex-col items-center gap-10">
                                        <div className="flex min-w-0 flex-col items-center">
                                            <SectionLabel>Dealer</SectionLabel>
                                            <div className="mt-4 flex min-h-[132px] max-w-full flex-wrap items-center justify-center gap-3">
                                                <AnimatePresence initial={false}>
                                                    {dealerCards.map((card, index) => (
                                                        <motion.div
                                                            key={`dealer-${index}-${card.id}`}
                                                            layout
                                                            initial={{ opacity: 0, y: 18, scale: 0.92 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: -10, scale: 0.92 }}
                                                            transition={{ duration: 0.24, ease: "easeOut" }}
                                                        >
                                                            <CardFace
                                                                card={card}
                                                                hidden={dealerCardsHiddenIndexes.includes(index)}
                                                                large
                                                            />
                                                        </motion.div>
                                                    ))}
                                                </AnimatePresence>
                                            </div>
                                            <div className="mt-3 min-h-[20px] text-center text-sm font-semibold text-zinc-100">
                                                {getDealerDisplayTotal(dealerCards, stage)}
                                            </div>
                                        </div>

                                        <div className="w-full max-w-[920px] rounded-[1.4rem] border border-white/10 bg-black/20 px-4 py-5">
                                            <div className="flex flex-col items-center">
                                                <SectionLabel>Player</SectionLabel>
                                                <div className="mt-4 flex min-h-[160px] max-w-full flex-wrap items-center justify-center gap-3">
                                                    <AnimatePresence initial={false}>
                                                        {playerCards.map((card, index) => (
                                                            <motion.div
                                                                key={`player-${index}-${card.id}`}
                                                                layout
                                                                initial={{ opacity: 0, y: 18, scale: 0.92 }}
                                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                exit={{ opacity: 0, y: -10, scale: 0.92 }}
                                                                transition={{ duration: 0.24, ease: "easeOut" }}
                                                            >
                                                                <CardFace
                                                                    card={card}
                                                                    large
                                                                    sideways={!!card.sideways}
                                                                />
                                                            </motion.div>
                                                        ))}
                                                    </AnimatePresence>
                                                </div>
                                                <div className="mt-3 text-center text-base font-semibold text-zinc-100">
                                                    {playerCards.length
                                                        ? `${playerTotal}${isSoft(playerCards) ? " soft" : ""}${resultLabel ? ` • ${resultLabel}` : ""}`
                                                        : "—"}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid w-full max-w-[920px] gap-3 sm:grid-cols-3">
                                            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center">
                                                <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">
                                                    Base Bet
                                                </div>
                                                <div className="mt-1 text-lg font-extrabold text-white">
                                                    {formatMoney(baseBet)}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center">
                                                <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">
                                                    Double Add-Ons
                                                </div>
                                                <div className="mt-1 text-lg font-extrabold text-white">
                                                    {doubleWagers.length
                                                        ? formatMoney(doubleWagers.reduce((a, b) => a + b, 0))
                                                        : "—"}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center">
                                                <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">
                                                    Total Main Risk
                                                </div>
                                                <div className="mt-1 text-lg font-extrabold text-white">
                                                    {formatMoney(totalRiskOnMain)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="sticky bottom-2 z-10 rounded-[1.2rem] border border-white/10 bg-black/45 px-3 py-3 backdrop-blur">
                                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                                        {stage === "betting" && (
                                            <ActionButton onClick={deal} variant="gold" disabled={isShuffling}>
                                                Deal
                                            </ActionButton>
                                        )}

                                        {canTakeInsurance && (
                                            <>
                                                <ActionButton onClick={takeInsurance} variant="gold">
                                                    Take Insurance
                                                </ActionButton>
                                                <ActionButton onClick={declineInsurance}>
                                                    No Insurance
                                                </ActionButton>
                                            </>
                                        )}

                                        {stage === "player" && (
                                            <>
                                                <ActionButton onClick={hit} disabled={!canHit}>
                                                    Hit
                                                </ActionButton>
                                                <ActionButton onClick={stand} disabled={!canStand}>
                                                    Stand
                                                </ActionButton>
                                                <ActionButton onClick={doubleDown} variant="gold" disabled={!canDouble}>
                                                    {doubleWagers.length === 0 ? "Double" : "Re-Double"}
                                                </ActionButton>
                                            </>
                                        )}

                                        {stage === "done" && (
                                            <ActionButton onClick={nextHand} variant="success">
                                                Next Hand
                                            </ActionButton>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="order-2 space-y-3 xl:order-3">
                            <InfoCard title="Betting Area">
                                <div className="space-y-3">
                                    <BetInput
                                        label="Main Bet"
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

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                <div className="text-[10px] uppercase tracking-[0.16em] text-white/60">
                                                    Bet In
                                                </div>
                                                <div className="mt-1 text-sm font-extrabold text-white">
                                                    {formatMoney(stage === "betting" ? baseBet + sideBet : totalRiskAll)}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                <div className="text-[10px] uppercase tracking-[0.16em] text-white/60">
                                                    Returned
                                                </div>
                                                <div className="mt-1 text-sm font-extrabold text-white">
                                                    {stage === "done" ? formatMoney(roundReturned) : "—"}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                <div className="text-[10px] uppercase tracking-[0.16em] text-white/60">
                                                    Net
                                                </div>
                                                <div
                                                    className={`mt-1 text-sm font-extrabold ${stage === "done"
                                                        ? roundNet > 0
                                                            ? "text-emerald-300"
                                                            : roundNet < 0
                                                                ? "text-red-300"
                                                                : "text-zinc-100"
                                                        : "text-zinc-100"
                                                        }`}
                                                >
                                                    {stage === "done"
                                                        ? `${roundNet > 0 ? "+" : ""}${formatMoney(roundNet)}`
                                                        : "—"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100/90">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Insurance</span>
                                            <span className="font-semibold text-white">
                                                {insuranceBet > 0 ? formatMoney(insuranceBet) : "—"}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span>Dealer showing</span>
                                            <span className="font-semibold text-white">
                                                {dealerCards[0] ? `${dealerCards[0].rank}${dealerCards[0].suit}` : "—"}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span>Player total</span>
                                            <span className="font-semibold text-white">
                                                {playerCards.length ? `${playerTotal}${isSoft(playerCards) ? " soft" : ""}` : "—"}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span>Next add-on</span>
                                            <span className="font-semibold text-white">
                                                {formatMoney(nextDoubleAmount)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100/90">
                                        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300/70">
                                            Round Detail
                                        </div>
                                        <div className="space-y-1.5">
                                            {resultLines.length ? (
                                                resultLines.map((line, idx) => (
                                                    <div key={`${line}-${idx}`} className="leading-snug">
                                                        {line}
                                                    </div>
                                                ))
                                            ) : (
                                                <div>
                                                    {stage === "betting"
                                                        ? "Place your wager and deal."
                                                        : stage === "insurance"
                                                            ? "Insurance decision pending."
                                                            : stage === "player"
                                                                ? "You can keep adding action with doubles."
                                                                : stage === "dealer"
                                                                    ? "Dealer is resolving."
                                                                    : "—"}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Table Info">
                                <div className="space-y-2 text-sm text-zinc-100/90">
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Dealer total</span>
                                        <span className="font-semibold text-white">
                                            {getDealerDisplayTotal(dealerCards, stage)}
                                        </span>
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
                                        <span>Doubles made</span>
                                        <span className="font-semibold text-white">{doubleWagers.length}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Push 22 bet</span>
                                        <span className="font-semibold text-white">{formatMoney(sideBet)}</span>
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