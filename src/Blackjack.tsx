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

function formatMoney(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
}

function resultLabel(playerTotal: number, dealerTotal: number, busted: boolean, dealerBusted: boolean) {
    if (busted) return "Bust";
    if (dealerBusted) return "Winner";
    if (playerTotal > dealerTotal) return "Winner";
    if (playerTotal < dealerTotal) return "Lose";
    return "Push";
}

function shouldShuffle(shoe: Card[]) {
    return shoe.length <= RESHUFFLE_REMAINING_CARDS || shoe.length < 20;
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-full border border-amber-300/30 bg-black/35 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.22em] text-amber-100 shadow sm:px-3 sm:text-[10px] sm:tracking-[0.24em]">
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

function CardFront({
    card,
    large = false,
}: {
    card?: Card;
    large?: boolean;
}) {
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

                    <div
                        className={`absolute bottom-[5px] right-[5px] rotate-180 text-left leading-[0.9] sm:bottom-[6px] sm:right-[6px] lg:bottom-[6px] lg:right-[7px] ${textColor}`}
                    >
                        <div className="text-[12px] font-extrabold sm:text-[13px] lg:text-[15px]">{card.rank}</div>
                        <div className="mt-[1px] text-[10px] sm:text-[11px] lg:text-[13px]">{card.suit}</div>
                    </div>

                    {isAce && (
                        <>
                            <div className={`absolute right-[5px] top-[5px] text-center leading-[0.9] sm:right-[6px] sm:top-[6px] lg:right-[7px] lg:top-[6px] ${textColor}`}>
                                <div className="text-[12px] font-extrabold sm:text-[13px] lg:text-[15px]">A</div>
                                <div className="text-[10px] sm:text-[11px] lg:text-[13px]">{card.suit}</div>
                            </div>

                            <div
                                className={`absolute bottom-[5px] left-[5px] rotate-180 text-center leading-[0.9] sm:bottom-[6px] sm:left-[6px] lg:bottom-[6px] lg:left-[7px] ${textColor}`}
                            >
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
        <div
            className={`relative overflow-hidden border border-white/15 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${sizeClasses}`}
        >
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
}: {
    card?: Card;
    hidden?: boolean;
    large?: boolean;
}) {
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
                    style={{
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                    }}
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

            <div className="mt-2 min-h-[18px] px-2 text-center text-xs font-semibold text-amber-100/95 sm:min-h-[20px] sm:text-sm">
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
            ? "border-amber-200/80 bg-[linear-gradient(180deg,_#fcd34d,_#f59e0b)] text-slate-950 hover:brightness-105"
            : variant === "success"
                ? "border-emerald-200/80 bg-[linear-gradient(180deg,_#4ade80,_#16a34a)] text-slate-950 hover:brightness-105"
                : "border-slate-500/80 bg-[linear-gradient(180deg,_#475569,_#334155)] text-white hover:brightness-110";

    return (
        <button onClick={() => void onClick()} disabled={disabled} className={`${base} ${styles}`}>
            {children}
        </button>
    );
}

function DealButton({
    onClick,
    disabled,
}: {
    onClick: () => void | Promise<void>;
    disabled?: boolean;
}) {
    return (
        <motion.button
            onClick={() => void onClick()}
            disabled={disabled}
            whileHover={{ scale: disabled ? 1 : 1.03 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            className="w-full max-w-[280px] rounded-full border border-amber-200/80 bg-[linear-gradient(180deg,_#fde68a,_#f59e0b)] px-8 py-4 text-base font-extrabold tracking-wide text-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.38)] transition disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:px-12 sm:text-lg"
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
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}) {
    return (
        <div className="rounded-2xl border border-amber-300/15 bg-black/20 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/85 sm:text-[11px] sm:tracking-[0.2em]">
                {label}
            </div>
            <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-white/70">$</span>
                <input
                    type="number"
                    min={MIN_BET}
                    step={5}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(Number(e.target.value || 0))}
                    className="w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-8 pr-3 text-base font-bold text-white outline-none disabled:opacity-60 sm:text-lg"
                />
            </div>
        </div>
    );
}

function InfoCard({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.03))] p-3 shadow-2xl backdrop-blur sm:rounded-[1.35rem] sm:p-4">
            <div className="mb-3 text-center text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200 sm:text-[12px] sm:tracking-[0.22em]">
                {title}
            </div>
            {children}
        </div>
    );
}

export default function BlackjackTable({ bankroll, setBankroll }: Props) {
    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [dealer, setDealer] = useState<Card[]>([]);
    const [hands, setHands] = useState<Card[][]>([]);
    const [bets, setBets] = useState<number[]>([]);
    const [active, setActive] = useState(0);
    const [dealerRevealedCount, setDealerRevealedCount] = useState(1);
    const [bet, setBet] = useState<number>(() => {
        if (typeof window === "undefined") return 10;
        const raw = window.localStorage.getItem(BET_STORAGE_KEY);
        const parsed = raw ? Number(raw) : 10;
        return Number.isFinite(parsed) && parsed >= MIN_BET ? parsed : 10;
    });
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Set your bet and press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [roundReturned, setRoundReturned] = useState(0);
    const [roundNet, setRoundNet] = useState(0);

    useEffect(() => {
        window.localStorage.setItem(BET_STORAGE_KEY, String(Math.max(MIN_BET, Math.floor(bet / 5) * 5)));
    }, [bet]);

    const dealerDisplayTotal = useMemo(() => {
        if (dealer.length === 0) return "";
        if (stage === "done" || stage === "dealer") {
            return String(total(dealer));
        }
        return dealer[0] ? String(dealer[0].value === 11 ? 11 : dealer[0].value) : "";
    }, [dealer, stage]);

    const activeHand = hands[active] ?? [];
    const totalWagered = bets.reduce((sum, wager) => sum + wager, 0);

    const performShuffleIfNeeded = async (shoe: Card[]) => {
        if (!shouldShuffle(shoe)) {
            return shoe;
        }

        setIsShuffling(true);
        setMessage("Shuffling 6-deck shoe...");

        await wait(SHUFFLE_DELAY_MS);

        const freshShoe = createShoe();
        setDeck(freshShoe);
        setIsShuffling(false);

        return freshShoe;
    };

    const finishRoundWithoutDealer = async (finalHands: Card[][], wagersInPlay: number[] = bets) => {
        const allBusted = finalHands.length > 0 && finalHands.every((hand) => total(hand) > 21);
        const wagered = wagersInPlay.reduce((sum, wager) => sum + wager, 0);
        const returned = 0;
        const net = returned - wagered;

        setRoundReturned(returned);
        setRoundNet(net);

        if (allBusted) {
            setMessage("All hands bust. Dealer reveals hole card.");
        } else {
            setMessage("Round complete.");
        }

        if (dealer.length > 0) {
            setDealerRevealedCount(dealer.length);
            await wait(1000);
        }

        setStage("done");
        setMessage(allBusted ? "All hands bust. Dealer does not draw." : "Round complete.");
    };

    const dealerTurn = async (
        handsInPlay: Card[][] = hands,
        wagersInPlay: number[] = bets,
        shoeInPlay: Card[] = deck
    ) => {
        const liveHands = handsInPlay.filter((hand) => total(hand) <= 21);
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

        const dealerTotal = total(nextDealer);
        const dealerBusted = dealerTotal > 21;

        let returned = 0;

        handsInPlay.forEach((hand, index) => {
            const playerTotal = total(hand);
            const wager = wagersInPlay[index];

            if (playerTotal > 21) return;
            if (dealerBusted || playerTotal > dealerTotal) returned += wager * 2;
            else if (playerTotal === dealerTotal) returned += wager;
        });

        const wagered = wagersInPlay.reduce((sum, wager) => sum + wager, 0);
        const net = returned - wagered;

        setRoundReturned(returned);
        setRoundNet(net);
        setBankroll((b) => b + returned);
        setStage("done");
        setMessage(dealerBusted ? "Dealer busts." : "Round complete.");
    };

    const ensureHandHasSecondCard = async (
        handsInPlay: Card[][],
        handIndex: number,
        shoeInPlay: Card[]
    ) => {
        const targetHand = handsInPlay[handIndex];
        if (!targetHand || targetHand.length !== 1) {
            return { hands: handsInPlay, deck: shoeInPlay };
        }

        const nextDeck = [...shoeInPlay];
        const drawnCard = nextDeck.shift();
        if (!drawnCard) {
            return { hands: handsInPlay, deck: shoeInPlay };
        }

        const nextHands = [...handsInPlay];
        nextHands[handIndex] = [...nextHands[handIndex], drawnCard];

        setHands(nextHands);
        setDeck(nextDeck);
        await wait(250);

        return { hands: nextHands, deck: nextDeck };
    };

    const moveToNextHand = async (
        nextHands: Card[][],
        nextDeck: Card[],
        nextBets: number[],
        currentActive = active
    ) => {
        const nextIndex = currentActive + 1;

        if (nextIndex < nextHands.length) {
            setActive(nextIndex);
            setMessage(`Playing hand ${nextIndex + 1} of ${nextHands.length}.`);

            const dealt = await ensureHandHasSecondCard(nextHands, nextIndex, nextDeck);
            const nextHand = dealt.hands[nextIndex];
            const nextTotal = total(nextHand);

            if (nextTotal === 21) {
                setMessage(`Hand ${nextIndex + 1} makes 21.`);
                await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIndex);
                return;
            }

            if (nextTotal > 21) {
                setMessage(`Hand ${nextIndex + 1} busts.`);
                await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIndex);
                return;
            }

            return;
        }

        if (nextHands.some((hand) => total(hand) <= 21)) {
            await dealerTurn(nextHands, nextBets, nextDeck);
            return;
        }

        await finishRoundWithoutDealer(nextHands, nextBets);
    };

    const split = async () => {
        if (hands.length >= MAX_HANDS) return;

        const hand = hands[active];
        if (hand.length !== 2) return;
        if (hand[0].value !== hand[1].value) return;
        if (bankroll < bets[active]) return;

        setBankroll((b) => b - bets[active]);

        const nextHands = [
            ...hands.slice(0, active),
            [hand[0]],
            [hand[1]],
            ...hands.slice(active + 1),
        ];

        const nextBets = [
            ...bets.slice(0, active),
            bets[active],
            bets[active],
            ...bets.slice(active + 1),
        ];

        setHands(nextHands);
        setBets(nextBets);
        setMessage(`Split hand ${active + 1}.`);

        const dealt = await ensureHandHasSecondCard(nextHands, active, deck);
        const activeTotal = total(dealt.hands[active]);

        if (activeTotal === 21) {
            setMessage(`Hand ${active + 1} makes 21.`);
            await moveToNextHand(dealt.hands, dealt.deck, nextBets, active);
            return;
        }

        if (activeTotal > 21) {
            setMessage(`Hand ${active + 1} busts.`);
            await moveToNextHand(dealt.hands, dealt.deck, nextBets, active);
        }
    };

    const deal = async () => {
        if (isShuffling) return;

        const wager = Math.max(MIN_BET, Math.floor(bet / 5) * 5);
        if (bankroll < wager) {
            setMessage("Not enough bankroll for that bet.");
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

        const playerHand = [nextDeck[0], nextDeck[1]];
        const dealerHand = [nextDeck[2], nextDeck[3]];
        nextDeck = nextDeck.slice(4);

        setDeck(nextDeck);
        setDealer(dealerHand);
        setDealerRevealedCount(1);
        setHands([playerHand]);
        setBets([wager]);
        setActive(0);

        const dealerBJ = total(dealerHand) === 21;
        const playerBJ = total(playerHand) === 21;

        if (dealerBJ) {
            setDealerRevealedCount(2);

            if (playerBJ) {
                const returned = wager;
                setRoundReturned(returned);
                setRoundNet(0);
                setBankroll((b) => b + returned);
                setMessage("Both player and dealer have blackjack. Push.");
            } else {
                setRoundReturned(0);
                setRoundNet(-wager);
                setMessage("Dealer blackjack. Hand over.");
            }

            setStage("done");
            return;
        }

        if (playerBJ) {
            const returned = wager * 2.5;
            const net = returned - wager;

            setDealerRevealedCount(2);
            setRoundReturned(returned);
            setRoundNet(net);
            setBankroll((b) => b + returned);
            setStage("done");
            setMessage("Blackjack pays 3 to 2.");
            return;
        }

        setStage("player");
        setMessage("Hit, stay, double, or split.");
    };

    const hit = async () => {
        const nextDeck = [...deck];
        const card = nextDeck.shift();
        if (!card) return;

        const nextHands = [...hands];
        nextHands[active] = [...nextHands[active], card];

        setDeck(nextDeck);
        setHands(nextHands);

        const handTotal = total(nextHands[active]);

        if (handTotal === 21) {
            setMessage(`Hand ${active + 1} makes 21.`);
            await moveToNextHand(nextHands, nextDeck, bets);
            return;
        }

        if (handTotal > 21) {
            setMessage(`Hand ${active + 1} busts.`);
            await moveToNextHand(nextHands, nextDeck, bets);
        }
    };

    const stay = async () => {
        await moveToNextHand(hands, deck, bets);
    };

    const doubleDown = async () => {
        const wager = bets[active];
        if (bankroll < wager) return;

        setBankroll((b) => b - wager);

        const nextBets = [...bets];
        nextBets[active] *= 2;
        setBets(nextBets);

        const nextDeck = [...deck];
        const card = nextDeck.shift();
        if (!card) return;

        const nextHands = [...hands];
        nextHands[active] = [...nextHands[active], card];

        setDeck(nextDeck);
        setHands(nextHands);

        if (total(nextHands[active]) > 21) {
            setMessage(`Hand ${active + 1} busts after doubling.`);
        }

        await moveToNextHand(nextHands, nextDeck, nextBets);
    };

    const nextRound = () => {
        setDealer([]);
        setHands([]);
        setBets([]);
        setActive(0);
        setDealerRevealedCount(1);
        setRoundReturned(0);
        setRoundNet(0);
        setStage("betting");
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle the shoe." : "Set your bet and press Deal.");
    };

    const canSplit =
        stage === "player" &&
        activeHand.length === 2 &&
        hands.length < MAX_HANDS &&
        activeHand[0]?.value === activeHand[1]?.value &&
        bankroll >= (bets[active] ?? 0);

    const canDouble = stage === "player" && activeHand.length === 2 && bankroll >= (bets[active] ?? 0);

    const cardsUsed = SHOE_SIZE - deck.length;
    const penetrationPct = Math.min(100, Math.round((cardsUsed / SHOE_SIZE) * 100));

    return (
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_#1f7a45,_#0e4d2d_30%,_#062417_65%,_#020d08_100%)] text-white">
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                    <div className="rounded-[1.6rem] border border-amber-300/25 bg-black/65 px-10 py-8 text-center shadow-[0_25px_80px_rgba(0,0,0,0.45)] sm:px-12 sm:py-9">
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-amber-200 sm:text-[12px]">
                            Blackjack
                        </div>
                        <div className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Shuffling Shoe</div>
                        <div className="mt-3 text-sm text-amber-100/85">Please wait…</div>
                    </div>
                </div>
            )}

            <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1700px] flex-col gap-3 px-2 py-2 sm:px-3 sm:py-3">
                <div className="rounded-[1.35rem] border border-amber-300/15 bg-black/25 p-3 shadow-2xl backdrop-blur sm:rounded-[1.7rem] sm:p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-200/90 sm:text-[12px] sm:tracking-[0.3em]">
                                Casino Table
                            </div>
                            <h2 className="mt-1 text-2xl font-extrabold tracking-[0.02em] text-amber-50 sm:text-4xl md:text-5xl">
                                Blackjack
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <StatPill label="Bankroll" value={formatMoney(bankroll)} accent="gold" />
                            <StatPill label="Stage" value={<span className="capitalize">{stage}</span>} />
                            <StatPill
                                label="Active Hand"
                                value={hands.length > 0 ? `${active + 1} / ${hands.length}` : "—"}
                            />
                            <StatPill
                                label="Dealer Showing"
                                value={dealer[0] ? `${dealer[0].rank}${dealer[0].suit}` : "—"}
                                accent="green"
                            />
                        </div>
                    </div>
                </div>

                <div className="rounded-[1.45rem] border border-white/10 bg-black/20 p-2.5 shadow-2xl backdrop-blur sm:rounded-[1.8rem] sm:p-3">
                    <div className="rounded-[1.2rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(0,0,0,0.22),_rgba(0,0,0,0.12))] px-4 py-3 text-center shadow-lg sm:rounded-[1.45rem] sm:px-5 sm:py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200 sm:text-[11px] sm:tracking-[0.24em]">
                            Table Message
                        </div>
                        <div className="mt-2 text-base font-bold text-amber-50 sm:text-lg md:text-xl">{message}</div>
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
                        <div className="order-3 space-y-3 xl:order-1">
                            <InfoCard title="Rules">
                                <div className="space-y-2 text-sm text-emerald-50/90">
                                    <div>• Blackjack pays 3 to 2.</div>
                                    <div>• Dealer stands on all 17s.</div>
                                    <div>• Split up to 4 hands.</div>
                                    <div>• Double on any 2-card hand.</div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Table Info">
                                <div className="space-y-2 text-sm text-emerald-50/90">
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
                                </div>
                            </InfoCard>

                            <InfoCard title="Payout Guide">
                                <div className="space-y-2 text-sm text-emerald-50/90">
                                    <div>• Win: 1 to 1</div>
                                    <div>• Push: bet returned</div>
                                    <div>• Blackjack: 3 to 2</div>
                                    <div>• Dealer bust: all live hands win</div>
                                </div>
                            </InfoCard>
                        </div>

                        <div className="order-1 min-w-0 rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(74,222,128,0.16),_rgba(10,90,60,0.10)_40%,_rgba(0,0,0,0.22)_82%)] p-2.5 sm:rounded-[1.6rem] sm:p-4 xl:order-2">
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
                                                const hand = hands[index] ?? [];
                                                const handTotal = hand.length > 0 ? total(hand) : null;
                                                const dealerTotal = dealer.length > 0 ? total(dealer) : 0;
                                                const busted = handTotal !== null && handTotal > 21;
                                                const dealerBusted = dealerTotal > 21;
                                                const finalResult =
                                                    stage === "done" && handTotal !== null
                                                        ? resultLabel(handTotal, dealerTotal, busted, dealerBusted)
                                                        : index === active && stage === "player"
                                                            ? "Active"
                                                            : "";

                                                return (
                                                    <div
                                                        key={index}
                                                        className={`rounded-[1.3rem] border p-3 shadow-xl backdrop-blur sm:p-4 ${index === active && stage === "player"
                                                            ? "border-amber-200/40 bg-amber-300/10 ring-2 ring-amber-200/20"
                                                            : "border-white/10 bg-black/18"
                                                            }`}
                                                    >
                                                        <CardLane
                                                            label={`Hand ${index + 1}`}
                                                            cards={hand}
                                                            large
                                                            result={
                                                                handTotal !== null
                                                                    ? `${handTotal}${isSoft(hand) ? " soft" : ""}${finalResult ? ` • ${finalResult}` : ""}`
                                                                    : "Waiting"
                                                            }
                                                        />
                                                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center text-sm font-semibold text-amber-100">
                                                            Bet: {bets[index] ? formatMoney(bets[index]) : "—"}
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
                                                        Double
                                                    </ActionButton>
                                                    <ActionButton onClick={split} variant="bet" disabled={!canSplit}>
                                                        Split
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
                                    />

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-emerald-50/90 sm:text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Current wager</span>
                                            <span className="font-extrabold text-white">
                                                {formatMoney(Math.max(MIN_BET, Math.floor(bet / 5) * 5))}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-emerald-50/90 sm:text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span>Total wagered</span>
                                                <span className="font-extrabold text-white">
                                                    {totalWagered > 0 ? formatMoney(totalWagered) : "—"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-emerald-50/90 sm:text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span>Returned</span>
                                                <span className="font-extrabold text-white">
                                                    {stage === "done" ? formatMoney(roundReturned) : "—"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs sm:text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-emerald-50/90">Net winnings</span>
                                            <span
                                                className={`font-extrabold ${stage !== "done"
                                                        ? "text-white"
                                                        : roundNet > 0
                                                            ? "text-emerald-300"
                                                            : roundNet < 0
                                                                ? "text-red-300"
                                                                : "text-white"
                                                    }`}
                                            >
                                                {stage === "done" ? formatMoney(roundNet) : "—"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-amber-100/90 sm:text-sm">
                                        {stage === "betting"
                                            ? "Place your bet to begin."
                                            : stage === "player"
                                                ? `Playing hand ${hands.length > 0 ? active + 1 : 0}${hands.length > 0 ? ` of ${hands.length}` : ""}.`
                                                : stage === "dealer"
                                                    ? "Dealer is resolving the round."
                                                    : "Round finished."}
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-emerald-50/90 sm:text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Dealer showing</span>
                                            <span className="font-semibold text-white">
                                                {dealer[0] ? `${dealer[0].rank}${dealer[0].suit}` : "—"}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span>Active hand total</span>
                                            <span className="font-semibold text-white">
                                                {activeHand.length
                                                    ? `${total(activeHand)}${isSoft(activeHand) ? " soft" : ""}`
                                                    : "—"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-emerald-950/30 px-4 py-3 text-center text-xs font-medium text-emerald-50/95 sm:text-sm">
                                        One shared bankroll is used across all casino games.
                                    </div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Active Bets">
                                <div className="grid grid-cols-2 gap-2 text-center text-sm text-emerald-50/90">
                                    {bets.length > 0 ? (
                                        bets.map((wager, index) => (
                                            <div
                                                key={index}
                                                className={`rounded-xl border px-3 py-3 ${index === active && stage === "player"
                                                    ? "border-amber-200/30 bg-amber-300/10"
                                                    : "border-white/10 bg-black/25"
                                                    }`}
                                            >
                                                <div className="font-semibold">Hand {index + 1}</div>
                                                <div className="mt-1 text-base font-extrabold text-white">
                                                    {formatMoney(wager)}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="col-span-2 rounded-xl border border-white/10 bg-black/25 px-3 py-4 text-center font-semibold text-amber-100">
                                            No live hands yet.
                                        </div>
                                    )}
                                </div>
                            </InfoCard>

                            <InfoCard title="Notes">
                                <div className="space-y-2 text-sm text-emerald-50/90">
                                    <div>• Uses a persistent 6-deck shoe.</div>
                                    <div>• Shoe reshuffles at about 85% penetration.</div>
                                    <div>• If all player hands bust, dealer does not draw.</div>
                                </div>
                            </InfoCard>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}