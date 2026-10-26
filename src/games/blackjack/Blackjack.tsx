import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import type { Card as SharedCard } from "../../shared/lib/cards";
import { addChipToStack, type ChipDenomination, formatMoney, buildChipStackFromAmount, popLastChip, BTN_NEUTRAL, BTN_GOLD, BTN_GREEN } from "../../shared/lib/money";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import HandRow from "../../shared/components/HandRow";
import BlackjackHand from "../../shared/components/BlackjackHand";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { defaultBet } from "../../shared/state/settings";
import { useBetRecorder } from "../../shared/state/sessionContext";

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { rank: Rank; suit: Suit; value: number; id: string; /** A double-down card, laid sideways. */ sideways?: boolean };
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };
type Stage = "betting" | "dealing" | "player" | "dealer" | "done";

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const MIN_BET = 5;
const MAX_HANDS = 4;
const BET_STORAGE_KEY = "casino-blackjack-bet";
const SHOE_DECKS = 6;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.85;
const SHUFFLE_DELAY_MS = 2000;
const PLAYER_TO_DEALER_DELAY_MS = 500;
// Standing has no new card to look at, so the dealer starts almost at once
const STAND_TO_DEALER_DELAY_MS = 120;
// One dealer card: long enough for a card to land, or for the hole card to turn over
const DEALER_CARD_MS = 480;
// The deal goes player, dealer, player, dealer, one card at a time
const DEAL_CARD_MS = 380;
// How long the second dealer card takes to slide under the first, and again to slide back
const DEALER_SCOOP_MS = 180;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";

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

function waitForPaint() {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
        });
    });
}

function toShared(card: Card, faceUp: boolean): SharedCard {
    return {
        id: card.id,
        suit: card.suit as SharedCard["suit"],
        rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"],
        faceUp,
    };
}

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-[2px] border border-amber-300/25 bg-black/30 px-3 py-1 text-sm font-bold text-amber-100">
            {children}
        </div>
    );
}

const BADGE: Record<string, string> = {
    Win: "bg-emerald-500/20 border-emerald-400/40 text-emerald-200",
    Push: "bg-amber-500/20  border-amber-400/40  text-amber-200",
    Bust: "bg-red-500/20    border-red-400/40    text-red-300",
    Lose: "bg-red-600/20    border-red-500/40    text-red-300",
};

function Badge({ result }: { result: string }) {
    return (
        <span className={`rounded-[2px] border px-2.5 py-0.5 text-sm font-bold ${BADGE[result] ?? ""}`}>
            {result}
        </span>
    );
}

function TableLabel() {
    return (
        <div className="flex flex-col items-center gap-1 select-none">
            <h1 className="text-2xl font-bold text-gold-soft">
                Blackjack
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                <span>BLACKJACK PAYS 3 to 2</span>
                <span className="text-white/75">·</span>
                <span>Dealer draws to 16</span>
                <span className="text-white/75">·</span>
                <span>STANDS ON ALL 17s</span>
            </div>
        </div>
    );
}

function DealerLane({ cards, revealedCount, stage, scoop }: {
    cards: Card[]; revealedCount: number; stage: Stage;
    /** The dealer is sliding one card under the other to turn it over: the first card, or the hole card. */
    scoop: "first" | "hole" | null;
}) {
    const revealed = stage === "dealer" || stage === "done";
    const t = cards.length ? total(cards) : null;
    return (
        <div className="flex flex-col items-center gap-2">
            <Chip>Dealer{revealed && t !== null ? ` · ${t}${isSoft(cards) ? " soft" : ""}` : ""}</Chip>
            <div className="relative w-[248px] sm:w-[288px]">
                {cards.length === 0 && (
                    <div className="absolute inset-0 flex justify-center gap-[6px]">
                        {[0, 1].map((i) => (
                            <div key={i} className={`${CARD_CLS} border border-dashed border-white/15 bg-white/5`} />
                        ))}
                    </div>
                )}
                <HandRow
                    cards={cards.map((card) => toShared(card, true))}
                    isFaceUp={(id) => cards.findIndex((card) => card.id === id) < revealedCount}
                    size="md"
                    slots={4}
                    dealDelay={() => 0}
                    slotStyle={(id) =>
                        scoop === "first" && id === cards[1]?.id ? { transform: "translateX(calc(var(--cw) * -0.6))", zIndex: 5 }
                        : scoop === "hole" && id === cards[0]?.id ? { transform: "translateX(calc(var(--cw) * 0.6))", zIndex: 5 }
                        : undefined}
                    // each card turns over away from the card that slid under it
                    flipDirection={(id) => (id === cards[0]?.id ? -1 : 1)}
                />
            </div>
        </div>
    );
}

function HandBox({ hand, bet, index, isActive, stage, dealerTotal, dealerBusted }: {
    hand: Card[]; bet: number; index: number; isActive: boolean;
    stage: Stage; dealerTotal: number; dealerBusted: boolean;
}) {
    const t = total(hand);
    const bust = t > 21;
    const result = stage === "done" ? resultLabel(t, dealerTotal, bust, dealerBusted) : null;
    return (
        // compact, so a dealt hand takes little more room than the bet circle it replaces and the
        // table does not grow when the cards come out: the bet sits in the label
        <div className={`flex flex-col items-center gap-1.5 rounded-[4px] border p-2 transition-colors duration-300
            ${isActive ? "border-amber-300/50 bg-amber-300/8 ring-2 ring-amber-300/20" : "border-white/10 bg-black/15"}`}
        >
            <div className="flex items-center gap-2">
                <Chip>Hand {index + 1} · {formatMoney(bet)}</Chip>
                {result && <Badge result={result} />}
            </div>
            <BlackjackHand cards={hand.map((card) => ({ ...toShared(card, true), sideways: card.sideways }))} />
            <div className="text-sm font-bold text-amber-100">
                {t}{isSoft(hand) ? " soft" : ""}{bust ? " · Bust" : ""}
            </div>
        </div>
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
    stage, isShuffling, bet, bankroll, canDouble, doubleForLess, canSplit, isResolvingAction,
    selectedChip, onChipSelect,
    onClear, onChangeBet, onDeal, onDoubleAndDeal,
    onHit, onStay, onDouble, onSplit,
}: {
    stage: Stage; isShuffling: boolean; bet: number; bankroll: number;
    canDouble: boolean; doubleForLess: boolean; canSplit: boolean; isResolvingAction: boolean;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onChangeBet: () => void; onDeal: () => void; onDoubleAndDeal: () => void;
    onHit: () => void; onStay: () => void; onDouble: () => void; onSplit: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone = stage === "done";
    const isPlayer = stage === "player";
    const isDealer = stage === "dealer";
    const isDealing = stage === "dealing";
    const showChips = !isDealer; // hide chips only while dealer is playing

    const canClear = isBetting || isDone;
    const canDeal = (isBetting || isDone) && !isShuffling && bet >= MIN_BET && bankroll >= bet;
    const canDoubleDeal = (isBetting || isDone) && !isShuffling && bet >= MIN_BET && bankroll >= bet * 2;

    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">

            {/* Left: chip tray */}
            <div className="flex items-center">
                {showChips ? (
                    <ChipTray
                        selectedChip={selectedChip}
                        onSelect={onChipSelect}
                        disabled={isPlayer || isDealing || isShuffling}
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
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear} disabled={isShuffling || bet <= 0}>Clear</button>
                        </SlideBtn>
                    )}

                    {/* Done only: Change Bet */}
                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button data-hotkey="B" className={BTN_NEUTRAL} onClick={onChangeBet} disabled={isShuffling}>Change Bet</button>
                        </SlideBtn>
                    )}

                    {/* Betting: Deal */}
                    {isBetting && (
                        <SlideBtn key="deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}

                    {/* Done: Rebet & Deal */}
                    {isDone && (
                        <SlideBtn key="rebet-deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Rebet &amp; Deal</button>
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
                        <SlideBtn key="stand">
                            <button data-hotkey="G" data-hotkey-alt="S Space" className={BTN_NEUTRAL} onClick={onStay} disabled={isResolvingAction}>Stand</button>
                        </SlideBtn>
                    )}
                    {isPlayer && (
                        <SlideBtn key="hit">
                            <button data-hotkey="H" className={BTN_NEUTRAL} onClick={onHit} disabled={isResolvingAction}>Hit</button>
                        </SlideBtn>
                    )}
                    {isPlayer && (
                        <SlideBtn key="double">
                            <button data-hotkey="B" className={BTN_GOLD} onClick={onDouble} disabled={!canDouble || isResolvingAction}>{doubleForLess ? "Double for Less" : "Double"}</button>
                        </SlideBtn>
                    )}
                    {isPlayer && (
                        <SlideBtn key="split">
                            <button data-hotkey="P" className={BTN_GOLD} onClick={onSplit} disabled={!canSplit || isResolvingAction}>Split</button>
                        </SlideBtn>
                    )}

                    {/* Dealing: subtle indicator */}
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

                    {/* Dealer: subtle indicator */}
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

                </AnimatePresence>
            </div>

            {/* Right: spacer mirrors chip tray width for true centering */}
            <div className="invisible hidden sm:block">
                <ChipTray selectedChip={selectedChip} onSelect={() => { }} disabled />
            </div>

        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlackjackTable({ bankroll, setBankroll }: Props) {
    const recordBet = useBetRecorder();
    // two shoes take turns, gold backs then purple: a reshuffle brings out the other one
    const [deckNo, setDeckNo] = useState(1);

    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [dealer, setDealer] = useState<Card[]>([]);
    const [hands, setHands] = useState<Card[][]>([]);
    const [bets, setBets] = useState<number[]>([]);
    const [active, setActive] = useState(0);
    const [dealerRevealedCount, setDealerRevealedCount] = useState(1);
    // true for the moment the dealer uses the second card to flip the first
    const [dealerScoop, setDealerScoop] = useState<"first" | "hole" | null>(null);
    // the dealer slides the up card under the hole card and turns the hole card over
    const revealHole = async () => {
        setDealerScoop("hole");
        await wait(DEALER_SCOOP_MS);
        setDealerRevealedCount(2);
        await wait(DEALER_SCOOP_MS);
        setDealerScoop(null);
    };
    const [bet, setBet] = useState(() => defaultBet("blackjack", "main"));
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Place chips and press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [isResolvingAction, setIsResolvingAction] = useState(false);
    const [roundReturned, setRoundReturned] = useState(0);
    const [roundNet, setRoundNet] = useState(0);

    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);

    // Deal runs one at a time, so a double-click cannot take the bet twice. The lock is held
    // a moment longer so a hand that ends instantly is not dealt over by the second click.
    const dealLock = useRef(false);
    const dealOnce = async () => {
        if (dealLock.current) return;
        dealLock.current = true;
        try { await deal(); } finally { window.setTimeout(() => { dealLock.current = false; }, 300); }
    };
    const [chipStack, setChipStack] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("blackjack", "main")));
    const [baseBet, setBaseBet] = useState(() => defaultBet("blackjack", "main")); // persists as default for next hand
    const dealBetRef = useRef<number | null>(null);

    useEffect(() => {
        if (bet >= MIN_BET)
            window.localStorage.setItem(BET_STORAGE_KEY, String(Math.max(MIN_BET, Math.floor(bet / 2.5) * 2.5)));
    }, [bet]);

    const activeHand = hands[active] ?? [];
    const totalWagered = bets.reduce((s, w) => s + w, 0);

    const performShuffleIfNeeded = async (shoe: Card[]) => {
        if (!shouldShuffle(shoe)) return shoe;
        setIsShuffling(true);
        setDeckNo((n) => n + 1);
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
        // every hand lost: each counts as a losing hand in the yearly stats
        wagersInPlay.forEach((w) => recordBet("Hand", w, 0));
        setRoundReturned(0);
        setRoundNet(-wagered);
        if (dealer.length > 0) { await revealHole(); await wait(400); }
        setStage("done");
        setMessage(allBusted ? "All hands bust. Dealer does not draw." : "Round complete.");
    };

    const dealerTurn = async (
        handsInPlay: Card[][] = hands,
        wagersInPlay: number[] = bets,
        shoeInPlay: Card[] = deck,
    ) => {
        const liveHands = handsInPlay.filter((h) => total(h) <= 21);
        if (liveHands.length === 0) { await finishRoundWithoutDealer(handsInPlay, wagersInPlay); return; }

        let nextDealer = [...dealer];
        let nextDeck = [...shoeInPlay];
        let revealedCount = 1;

        setStage("dealer");
        setMessage("Dealer reveals hole card.");
        await revealHole();
        revealedCount = 2;
        await wait(DEALER_CARD_MS - DEALER_SCOOP_MS);

        // dealer hit cards come out face up, one at a time
        while (total(nextDealer) < 17) {
            const card = nextDeck.shift();
            if (!card) break;
            nextDealer.push(card);
            revealedCount = nextDealer.length;
            setDealer([...nextDealer]);
            setDeck([...nextDeck]);
            setDealerRevealedCount(revealedCount);
            setMessage("Dealer draws.");
            await wait(DEALER_CARD_MS);
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
            // each hand on its own for the yearly stats
            if (pt > 21) { recordBet("Hand", wager, 0); return; }
            if (dealerBusted || pt > dt) { returned += wager * 2; recordBet("Hand", wager, wager * 2, dealerBusted ? "Dealer busts" : "Beat the dealer"); }
            else if (pt === dt) { returned += wager; recordBet("Hand", wager, wager); }
            else recordBet("Hand", wager, 0);
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
        const nextDeck = [...shoeInPlay];
        const drawn = nextDeck.shift();
        if (!drawn) return { hands: handsInPlay, deck: shoeInPlay };
        const nextHands = [...handsInPlay];
        nextHands[idx] = [...nextHands[idx], drawn];
        setHands(nextHands);
        setDeck(nextDeck);
        await wait(250);
        return { hands: nextHands, deck: nextDeck };
    };

    const moveToNextHand = async (
        nextHands: Card[][],
        nextDeck: Card[],
        nextBets: number[],
        currentActive = active,
        // how long to hold on the player's hand before the dealer plays
        pauseMs = PLAYER_TO_DEALER_DELAY_MS,
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
                await waitForPaint();
                await wait(PLAYER_TO_DEALER_DELAY_MS);
                await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIdx);
                return;
            }

            if (nextTotal > 21) {
                setMessage(`Hand ${nextIdx + 1} busts.`);
                await waitForPaint();
                await wait(PLAYER_TO_DEALER_DELAY_MS);
                await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIdx);
                return;
            }

            return;
        }

        if (nextHands.some((h) => total(h) <= 21)) {
            await waitForPaint();
            await wait(pauseMs);
            await dealerTurn(nextHands, nextBets, nextDeck);
            return;
        }

        await waitForPaint();
        await wait(PLAYER_TO_DEALER_DELAY_MS);
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
            setBets(nextBets);
            setMessage(`Split hand ${active + 1}.`);
            const dealt = await ensureHandHasSecondCard(nextHands, active, deck);
            const activeTotal = total(dealt.hands[active]);
            if (activeTotal === 21) { setMessage(`Hand ${active + 1} makes 21.`); await moveToNextHand(dealt.hands, dealt.deck, nextBets, active); return; }
            if (activeTotal > 21) { setMessage(`Hand ${active + 1} busts.`); await moveToNextHand(dealt.hands, dealt.deck, nextBets, active); }
        } finally { setIsResolvingAction(false); }
    };

    const deal = async () => {
        if (isShuffling) return;
        const override = dealBetRef.current;
        dealBetRef.current = null;
        const wager = Math.max(MIN_BET, Math.floor((override ?? bet) / 2.5) * 2.5);
        if (bankroll < wager) { setMessage("Not enough bankroll."); return; }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);
        if (nextDeck.length < 4) nextDeck = await performShuffleIfNeeded([]);

        setRoundReturned(0); setRoundNet(0);
        setBankroll((b) => b - wager);

        const playerHand = [nextDeck[0], nextDeck[1]];
        const dealerHand = [nextDeck[2], nextDeck[3]];
        nextDeck = nextDeck.slice(4);

        setDeck(nextDeck); setDealerRevealedCount(0);
        setBets([wager]); setActive(0);

        // player, dealer, player, dealer. Both dealer cards come out face down.
        setStage("dealing");
        setMessage("Dealing...");
        setDealer([]); setHands([[playerHand[0]]]);
        await wait(DEAL_CARD_MS);
        setDealer([dealerHand[0]]);
        await wait(DEAL_CARD_MS);
        setHands([playerHand]);
        await wait(DEAL_CARD_MS);
        setDealer(dealerHand);
        await wait(DEAL_CARD_MS);
        // the dealer slides the second card under the first and turns the first one over
        setDealerScoop("first");
        await wait(DEALER_SCOOP_MS);
        setDealerRevealedCount(1);
        await wait(DEALER_SCOOP_MS);
        setDealerScoop(null);
        await wait(DEAL_CARD_MS - 80);

        const dealerBJ = total(dealerHand) === 21;
        const playerBJ = total(playerHand) === 21;

        if (dealerBJ) {
            await revealHole();
            recordBet("Hand", wager, playerBJ ? wager : 0);
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
            recordBet("Hand", wager, returned, "Blackjack");
            await revealHole();
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
            const nextDeck = [...deck];
            const card = nextDeck.shift();
            if (!card) return;
            const nextHands = [...hands];
            nextHands[active] = [...nextHands[active], card];
            setDeck(nextDeck); setHands(nextHands);
            const t = total(nextHands[active]);
            if (t === 21) { setMessage(`Hand ${active + 1} makes 21.`); await moveToNextHand(nextHands, nextDeck, bets); return; }
            if (t > 21) { setMessage(`Hand ${active + 1} busts.`); await moveToNextHand(nextHands, nextDeck, bets); }
        } finally { setIsResolvingAction(false); }
    };

    const stay = async () => {
        if (isResolvingAction) return;
        setIsResolvingAction(true);
        try { await moveToNextHand(hands, deck, bets, active, STAND_TO_DEALER_DELAY_MS); }
        finally { setIsResolvingAction(false); }
    };

    const doubleDown = async () => {
        if (isResolvingAction) return;
        setIsResolvingAction(true);
        try {
            // the full bet again, or the rest of the balance if that is less
            const wager = Math.min(bets[active], bankroll);
            if (wager <= 0) return;
            setBankroll((b) => b - wager);
            const nextBets = [...bets]; nextBets[active] += wager; setBets(nextBets);
            const nextDeck = [...deck]; const drawn = nextDeck.shift(); if (!drawn) return;
            const card: Card = { ...drawn, sideways: true };
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
            setChipStack((s) => addChipToStack(s, chip));
        }
    };

    // Clicking the chips on the spot takes the last chip back
    const removeLastChip = () => {
        if (stage !== "betting") return;
        const next = popLastChip(bet);
        setBet(next); setBaseBet(next);
        setChipStack(buildChipStackFromAmount(next));
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
        if (dealLock.current) return;
        if (totalWagered === 0 || bankroll < totalWagered * 2) return;
        const doubled = totalWagered * 2;
        setBet(doubled);
        setBaseBet(doubled);                 // store as new base bet
        setChipStack(buildChipStackFromAmount(doubled));
        dealBetRef.current = doubled;
        void dealOnce();
    };

    const canSplit =
        stage === "player" && activeHand.length === 2 && hands.length < MAX_HANDS &&
        activeHand[0]?.value === activeHand[1]?.value && bankroll >= (bets[active] ?? 0);
    // A double can be for less than the bet: with a short balance, whatever is left goes on the hand
    const canDouble = stage === "player" && activeHand.length === 2 && bankroll > 0;
    const doubleForLess = canDouble && bankroll < (bets[active] ?? 0);
    const dealerT = dealer.length ? total(dealer) : 0;
    const dealerBusted = dealerT > 21;

    return (
        <>
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="rounded-[4px] border border-amber-300/25 bg-black/65 px-10 py-8 text-center">
                        <div className="text-sm font-extrabold text-amber-200">Blackjack</div>
                        <div className="mt-2 text-3xl font-extrabold text-white">Shuffling Shoe</div>
                        <div className="mt-2 text-sm text-amber-100">Please wait…</div>
                    </div>
                </div>
            )}

            <TableShell deckNo={deckNo}
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
                        doubleForLess={doubleForLess}
                        canSplit={canSplit}
                        isResolvingAction={isResolvingAction}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={clearBet}
                        onChangeBet={changeBet}
                        onDeal={() => void dealOnce()}
                        onDoubleAndDeal={doubleAndDeal}
                        onHit={() => void hit()}
                        onStay={() => void stay()}
                        onDouble={() => void doubleDown()}
                        onSplit={() => void split()}
                    />
                }
            >
                <div className="relative flex flex-1 flex-col items-center gap-4 py-2">

                    <TableLabel />

                    <DealerLane cards={dealer} revealedCount={dealerRevealedCount} stage={stage} scoop={dealerScoop} />

                    <BetBar
                        pendingBet={totalWagered > 0 ? totalWagered : bet}
                        returned={roundReturned}
                        net={roundNet}
                        showResult={stage === "done"}
                    />

                    <p className="text-sm font-semibold text-amber-100">{message}</p>

                    <AnimatePresence mode="popLayout" initial={false}>
                        {stage === "betting" && (
                            <motion.div
                                key="bet-circle"
                                initial={{ opacity: 0, scale: 0.88 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.88 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                                <BetSpot
                                    testId="main"
                                    chips={chipStack}
                                    totalBet={bet}
                                    emptyText="Bet"
                                    dim={100}
                                    isSelected
                                    canBet={!isShuffling}
                                    onRemove={removeLastChip}
                                />
                            </motion.div>
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