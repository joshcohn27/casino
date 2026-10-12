import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import PlayingCard from "../../shared/components/Card";
import BlackjackHand from "../../shared/components/BlackjackHand";
import type { Card as SharedCard } from "../../shared/lib/cards";
import { type ChipDenomination, formatMoney, buildChipStackFromAmount, popLastChip, BTN_NEUTRAL, BTN_GOLD, BTN_GREEN } from "../../shared/lib/money";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { defaultBet } from "../../shared/state/settings";

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
    | "dealing"
    | "insurance"
    | "player"
    | "dealer"
    | "done"
    | "shuffling";

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const MIN_BET = 5;
const SIDE_STEP = 2.5;
const SIDE_MAX = 100;
const SHOE_DECKS = 6;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.82;
const RESHUFFLE_REMAINING = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));
const SHUFFLE_DELAY_MS = 1800;
// The deal comes out one card at a time: dealer's up card, the player's card, dealer's down card
const DEAL_CARD_MS = 380;

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

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clampMainBet(value: number) {
    return Math.max(MIN_BET, Math.floor(value / 2.5) * 2.5);
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
    if (!dealer.length) return "-";
    if (stage === "dealer" || stage === "done") {
        return `${total(dealer)}${isSoft(dealer) ? " soft" : ""}`;
    }
    const up = dealer[0];
    if (!up) return "-";
    return up.rank === "A" ? "11" : `${up.value}`;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

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

const CARD_TRANSITION = {
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    // resting cards slide over to make room for a new one
    layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-[2px] border border-zinc-300/25 bg-black/30 px-3 py-1 text-sm font-bold text-zinc-100">
            {children}
        </div>
    );
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="px-1 py-2">
            <div className="mb-3 text-sm font-extrabold text-zinc-300/80">
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
                "• Push 22 pays 11 to 1.",
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
                    className="absolute inset-0 bg-black/72"
                    onClick={onClose}
                    aria-label="Close rules modal"
                />
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[820px] overflow-hidden rounded-[4px] border border-[#59595b] bg-[#09090a] text-white"
                >
                    <div className="flex items-center justify-between border-b border-[#59595b] px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[13px] font-extrabold text-amber-200/90">
                                Game Info
                            </div>
                            <div className="mt-1 text-lg font-extrabold text-zinc-50 sm:text-2xl">
                                Double Down Madness Rules
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#59595b] bg-[#0f0f11] text-xl font-bold text-text transition-colors hover:bg-[#131316] active:bg-[#09090a]"
                            aria-label="Close rules modal"
                        >
                            ×
                        </button>
                    </div>

                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="grid gap-3 text-sm leading-6 text-zinc-100/88 sm:grid-cols-2">
                            {sections.map((section) => (
                                <div key={section.title} className="rounded-[4px] border border-[#59595b] bg-[#0f0f11] p-4">
                                    <div className="mb-2 text-sm font-extrabold text-amber-200">
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

                        <div className="mt-3 rounded-[4px] border border-amber-200/15 bg-amber-200/[0.06] p-4 text-sm leading-6 text-amber-50/90">
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
    canDouble, doubleForLess, canHit, canStand, canTakeInsurance,
    doubleWagersCount, canDealFromDone,
    selectedChip, onChipSelect,
    onClear, onDeal, onChangeBet, onTakeInsurance, onNoInsurance,
    onHit, onStand, onDouble,
}: {
    stage: Stage; isShuffling: boolean;
    bet: number; sideBet: number; bankroll: number;
    canDouble: boolean; doubleForLess: boolean; canHit: boolean; canStand: boolean; canTakeInsurance: boolean;
    doubleWagersCount: number; canDealFromDone: boolean;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onDeal: () => void; onChangeBet: () => void;
    onTakeInsurance: () => void; onNoInsurance: () => void;
    onHit: () => void; onStand: () => void; onDouble: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone = stage === "done";
    const isPlayer = stage === "player";
    const isDealer = stage === "dealer";
    const isInsurance = stage === "insurance";
    const isDealing = stage === "dealing";

    const canDeal = isBetting && !isShuffling && bet >= MIN_BET && bankroll >= clampMainBet(bet) + sideBet;
    const canClear = isBetting;

    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-[10px] py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3 sm:px-4">

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
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear} disabled={bet <= 0 && sideBet <= 0}>Clear</button>
                        </SlideBtn>
                    )}

                    {isBetting && (
                        <SlideBtn key="deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}

                    {isInsurance && canTakeInsurance && (
                        <SlideBtn key="take-insurance">
                            <button data-hotkey="Y" className={BTN_GOLD} onClick={onTakeInsurance}>Take Insurance</button>
                        </SlideBtn>
                    )}

                    {isInsurance && canTakeInsurance && (
                        <SlideBtn key="no-insurance">
                            <button data-hotkey="N" className={BTN_NEUTRAL} onClick={onNoInsurance}>No Insurance</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="stand">
                            <button data-hotkey="G" data-hotkey-alt="S Space" className={BTN_NEUTRAL} onClick={onStand} disabled={!canStand}>Stand</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="hit">
                            <button data-hotkey="H" className={BTN_NEUTRAL} onClick={onHit} disabled={!canHit}>Hit</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="double">
                            <button data-hotkey="B"
                                className={doubleWagersCount > 0 ? BTN_GREEN : BTN_GOLD}
                                onClick={onDouble}
                                disabled={!canDouble}
                            >
                                {doubleForLess ? "Double for Less" : doubleWagersCount > 0 ? "Re-Double" : "Double"}
                            </button>
                        </SlideBtn>
                    )}

                    {isDealing && (
                        <motion.span
                            key="dealing-msg"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-sm italic text-white/75"
                        >
                            Dealing…
                        </motion.span>
                    )}

                    {isDealer && (
                        <motion.span
                            key="dealer-msg"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-sm italic text-white/75"
                        >
                            Dealer playing…
                        </motion.span>
                    )}

                    {isDone && (
                        <SlideBtn key="clear-done">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear}>Clear</button>
                        </SlideBtn>
                    )}

                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button data-hotkey="B" className={BTN_NEUTRAL} onClick={onChangeBet}>Change Bet</button>
                        </SlideBtn>
                    )}

                    {isDone && (
                        <SlideBtn key="rebet-deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDealFromDone}>Rebet &amp; Deal</button>
                        </SlideBtn>
                    )}

                </AnimatePresence>
            </div>

            {/* Right: invisible mirror for centering */}
            <div className="invisible hidden sm:block">
                <ChipTray selectedChip={selectedChip} onSelect={() => { }} disabled />
            </div>

        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DoubleDownMadness({ bankroll, setBankroll }: Props) {
    // two shoes take turns, gold backs then purple: a reshuffle brings out the other one
    const [deckNo, setDeckNo] = useState(1);
    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [stage, setStage] = useState<Stage>("betting");

    const [bet, setBet] = useState<number>(() => defaultBet("doubledownmadness", "main"));

    const [push22Bet, setPush22Bet] = useState<number>(() => defaultBet("doubledownmadness", "push22"));

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
    const [chipStack, setChipStack] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("doubledownmadness", "main")));
    const [push22Stack, setPush22Stack] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("doubledownmadness", "push22")));

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
    // A double can be for less than the full step: with a short balance, whatever is left goes on
    const canDouble = stage === "player" && playerTotal < 21 && bankroll > 0;
    const doubleForLess = canDouble && bankroll < nextDoubleAmount;

    const performShuffleIfNeeded = async (shoe: Card[]) => {
        if (!shouldShuffle(shoe)) return shoe;
        setIsShuffling(true);
        setDeckNo((n) => n + 1);
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
        setMessage(`Hand over: ${label}.`);
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
        setDealerRevealCount(1);

        // the dealer's first card comes out face up, then the player's card, then the dealer's
        // second card face down
        setStage("dealing");
        setMessage("Dealing...");
        setDealerCards([currentDealer[0]]);
        await wait(DEAL_CARD_MS);
        setPlayerCards(currentPlayer);
        await wait(DEAL_CARD_MS);
        setDealerCards(currentDealer);
        await wait(DEAL_CARD_MS);

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
                // 11 to 1: the bet comes back with eleven times itself
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
            finishRound(returned, lines, "Win", mainRisk);
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
        // the full step, or the rest of the balance if that is less
        const doubleAmount = Math.min(nextDoubleAmount, bankroll);
        if (doubleAmount <= 0) {
            setMessage("Not enough bankroll to double.");
            return;
        }

        setBankroll((b) => b - doubleAmount);
        setDoubleWagers((prev) => [...prev, doubleAmount]);

        const drawn = drawOne(deck);
        if (!drawn.card) return;

        const sidewaysCard = { ...drawn.card, sideways: true };
        const nextPlayer = [...playerCards, sidewaysCard];
        const nextMainRisk = totalRiskOnMain + doubleAmount;

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

    const handleChangeBet = () => {
        clearRoundState();
        setStage("betting");
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle." : "Set your bets and press Deal.");
    };

    const [selectedZone, setSelectedZone] = useState<"main" | "push22">("main");

    // One action at a time: a second click is ignored while the first is still resolving,
    // so a double-click cannot settle (and pay) a hand twice.
    const actionLock = useRef(false);
    const runAction = async (action: () => Promise<void>, holdMs = 0) => {
        if (actionLock.current) return;
        actionLock.current = true;
        try { await action(); } finally {
            // Deal holds the lock a moment longer so a hand that ends instantly is not dealt over
            if (holdMs > 0) window.setTimeout(() => { actionLock.current = false; }, holdMs);
            else actionLock.current = false;
        }
    };

    const canDealFromDone =
        stage === "done" && !isShuffling &&
        baseBet >= MIN_BET && bankroll >= baseBet + sideBet;

    // Tray chip goes onto the highlighted spot
    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (stage !== "betting" || isShuffling) return;
        if (selectedZone === "push22") {
            const next = clampSideBet(push22Bet + chip);
            if (next > push22Bet) {
                setPush22Bet(next);
                setPush22Stack(buildChipStackFromAmount(next));
            }
        } else {
            setBet((b) => b + chip);
            setChipStack((s) => [...s, chip]);
        }
    };

    // Clicking the chips on a spot takes the last chip back
    const removeLastChip = (zone: "main" | "push22") => {
        if (stage !== "betting" || isShuffling) return;
        if (zone === "push22") {
            const next = popLastChip(push22Bet);
            setPush22Bet(next);
            setPush22Stack(buildChipStackFromAmount(next));
        } else {
            const next = popLastChip(bet);
            setBet(next);
            setChipStack(buildChipStackFromAmount(next));
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="rounded-[4px] border border-zinc-300/25 bg-black/65 px-12 py-9 text-center">
                        <div className="text-[12px] font-extrabold text-zinc-200">
                            Double Down Madness
                        </div>
                        <div className="mt-2 text-4xl font-extrabold text-zinc-200">Shuffling Shoe</div>
                        <div className="mt-3 text-sm text-zinc-300">Please wait…</div>
                    </div>
                </div>
            )}

            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            <TableShell deckNo={deckNo}
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
                        doubleForLess={doubleForLess}
                        canHit={canHit}
                        canStand={canStand}
                        canTakeInsurance={canTakeInsurance}
                        doubleWagersCount={doubleWagers.length}
                        canDealFromDone={canDealFromDone}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={clearBets}
                        onDeal={() => void runAction(deal, 300)}
                        onChangeBet={handleChangeBet}
                        onTakeInsurance={() => void runAction(takeInsurance)}
                        onNoInsurance={() => void runAction(declineInsurance)}
                        onHit={() => void runAction(hit)}
                        onStand={() => void runAction(stand)}
                        onDouble={() => void runAction(doubleDown)}
                    />
                }
            >
                <div className="flex flex-1 gap-3 px-[10px]">

                    {/* ── Left column ───────────────────────────────────────── */}
                    <div className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col lg:gap-3">

                        <InfoPanel title="Blackjack Pays">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-amber-100">Suited</span>
                                    <span className="font-extrabold text-amber-100">2 to 1</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-zinc-300/80">Unsuited</span>
                                    <span className="font-extrabold text-white">3 to 2</span>
                                </div>
                            </div>
                        </InfoPanel>

                        <InfoPanel title="Double Ladder">
                            {/* The step the hand is on is lit, the steps already taken stay bright, and
                                the ones still to come are dim. A step taken shows what was actually bet. */}
                            <div className="space-y-1" data-testid="double-ladder">
                                {Array.from({ length: Math.max(5, doubleWagers.length + 1) }, (_, step) => {
                                    const inHand = stage !== "betting";
                                    const taken = inHand && step <= doubleWagers.length;
                                    const current = inHand && step === doubleWagers.length;
                                    const ordinal = ["1st", "2nd", "3rd"][step - 1] ?? `${step}th`;
                                    const amount = step === 0 ? baseBet : taken ? doubleWagers[step - 1] : baseBet * Math.pow(2, step - 1);
                                    return (
                                        <div
                                            key={step}
                                            data-ladder-step={step}
                                            data-current={current ? "true" : undefined}
                                            className={`flex items-center justify-between gap-2 rounded-[2px] border-l-[3px] px-2 py-1 text-sm transition-colors ${
                                                current ? "border-gold bg-amber-300/12" : "border-transparent"
                                            }`}
                                        >
                                            <span className={current ? "font-bold text-amber-100" : taken ? "text-white" : "text-zinc-400"}>
                                                {step === 0 ? "Base bet" : `${ordinal} double`}
                                            </span>
                                            <span className={current ? "font-bold text-gold" : taken ? "font-semibold text-white" : "font-semibold text-zinc-400"}>
                                                {formatMoney(amount)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </InfoPanel>

                        <InfoPanel title="Push 22">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-zinc-400">Dealer finishes on 22</span>
                                    <span className="font-bold text-gold">11 to 1</span>
                                </div>
                            </div>
                        </InfoPanel>

                    </div>

                    {/* ── Center column ─────────────────────────────────────── */}
                    <div className="relative flex min-w-0 flex-1 flex-col items-center gap-4">

                        {/* Table label */}
                        <div className="flex flex-col items-center gap-1 select-none">
                            <div className="flex items-center gap-2">
                                <h1
                                    className="text-center text-2xl font-bold text-zinc-100/80"
                                >
                                    Double Down Madness
                                </h1>
                                <button
                                    onClick={() => setShowRules(true)}
                                    className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-amber-200/35 bg-black/30 text-[11px] font-extrabold text-amber-100 transition hover:border-amber-200/60 hover:bg-amber-200/12 active:scale-95"
                                    aria-label="Show Double Down Madness rules"
                                >
                                    i
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                                <span>Suited Blackjack pays 2 to 1</span>
                                <span className="text-white/75">·</span>
                                <span>Unsuited Blackjack 3 to 2</span>
                                <span className="text-white/75">·</span>
                                <span>Dealer 22 pushes</span>
                            </div>
                        </div>

                        <BetBar
                            pendingBet={stage !== "betting" && totalRiskAll > 0 ? totalRiskAll : baseBet + sideBet}
                            returned={roundReturned}
                            net={roundNet}
                            showResult={stage === "done"}
                        />

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
                                            layout="position"
                                            layoutDependency={dealerCards.length}
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

                        {/* Message */}
                        <p className="text-sm font-semibold text-zinc-100/70">{message}</p>

                        {/* The bet circles and the player's hand share this one place, so nothing moves at the deal. */}
                        <div className="grid w-full justify-items-center [&>*]:col-start-1 [&>*]:row-start-1">
                        {/* Bet circles - only during betting */}
                        <AnimatePresence mode="popLayout" initial={false}>
                            {stage === "betting" && (
                                <motion.div
                                    key="bet-circles"
                                    initial={{ opacity: 0, scale: 0.88 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.88 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex items-end gap-8"
                                >
                                    <BetSpot
                                        testId="main"
                                        chips={chipStack}
                                        totalBet={bet}
                                        label="Main"
                                        sublabel={`min $${MIN_BET}`}
                                        dim={100}
                                        isSelected={selectedZone === "main"}
                                        onSelect={() => setSelectedZone("main")}
                                        onRemove={() => removeLastChip("main")}
                                        canBet={!isShuffling}
                                    />
                                    <BetSpot
                                        testId="push22"
                                        chips={push22Stack}
                                        totalBet={push22Bet}
                                        label="Push 22"
                                        sublabel="optional"
                                        dim={82}
                                        isSelected={selectedZone === "push22"}
                                        onSelect={() => setSelectedZone("push22")}
                                        onRemove={() => removeLastChip("push22")}
                                        canBet={!isShuffling}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Player lane */}
                        <div className={`flex flex-col items-center gap-2 ${stage === "betting" ? "invisible" : ""}`}>
                            <Chip>
                                {"Player"}
                                {playerCards.length > 0
                                    ? ` · ${playerTotal}${isSoft(playerCards) ? " soft" : ""}${resultLabel ? ` · ${resultLabel}` : ""}`
                                    : ""}
                            </Chip>
                            <BlackjackHand cards={playerCards.map((card) => ({ ...toShared(card, true), sideways: card.sideways }))} />
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
                        {insuranceBet > 0 && (
                            <div className="w-full">
                                <InfoPanel title="Insurance">
                                    <div className="space-y-2">
                                        <Row label="Bet" value={formatMoney(insuranceBet)} />
                                        <Row label="Pays" value="2 to 1" />
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
