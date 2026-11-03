import React, { useRef, useState } from "react";
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
import { MATCH_DEALER_TABLE, matchDealer, type SideSuit } from "./sideBetLogic";
import { RANGES, bothGold, handReturn, holeRange, settleHand, type HoleRange } from "./downUnderLogic";

// Down Under Blackjack: regular blackjack as dealt at the Blackjack table, plus the range of the
// dealer's hole card shown before anyone acts. The rules that differ are in downUnderLogic.ts.

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { rank: Rank; suit: Suit; value: number; id: string; /** A double-down card, laid sideways. */ sideways?: boolean };
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };
type Stage = "betting" | "dealing" | "player" | "dealer" | "done";
type Spot = "main" | "match";

const GAME_ID = "downunder";
const FELT_COLOR = "#14284b";
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const MIN_BET = 5;
const MAX_HANDS = 4;
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
// The dealer reads the hole card's range and lights its box
const RANGE_CHECK_MS = 520;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";

const RULES: [string, string[]][] = [
    ["The Hole Card Range", [
        "Before anyone acts, the dealer checks the hole card and lights the box it falls in.",
        "Small (blue): 2, 3, 4 or 5. Medium (red): 6, 7, 8 or 9. Large (gold): 10, J, Q, K or A.",
        "If both dealer cards are gold, the dealer's hand is turned face up before you act.",
    ]],
    ["Dealer 22", [
        "If the dealer finishes on exactly 22, every hand pushes, except a 20 or 21, which still wins.",
        "A dealer total over 22 is a bust, and every hand still in play wins.",
    ]],
    ["The Game", [
        "Six decks. Blackjack pays 3 to 2. The dealer stands on all 17s. No surrender and no insurance.",
        "Split up to three times, for four hands. Aces split once, and each ace gets one card.",
        "Double on any two cards, after a split too. Short on chips? Double for less.",
    ]],
    ["Match the Dealer", [
        "Optional side bet on your first two cards matching the dealer's up card in rank.",
        "Each matching card pays: 11 to 1 suited, 4 to 1 unsuited. Both cards can win.",
    ]],
];

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

const toSide = (card: Card) => ({ rank: card.rank, suit: card.suit as SideSuit });

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

function TableLabel({ onRules }: { onRules: () => void }) {
    return (
        <div className="flex flex-col items-center gap-1 select-none">
            <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gold-soft">Down Under Blackjack</h1>
                <button
                    onClick={onRules}
                    className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-white/10"
                    aria-label="Show rules"
                >
                    i
                </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                <span>BLACKJACK PAYS 3 to 2</span>
                <span className="text-white/75">·</span>
                <span>STANDS ON ALL 17s</span>
                <span className="text-white/75">·</span>
                <span>Dealer 22 pushes, except 20 and 21</span>
            </div>
        </div>
    );
}

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close rules modal" />
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[4px] border border-[#50807c] bg-[#051e1c] text-text"
                    >
                        <div className="flex items-center justify-between border-b border-[#50807c] px-4 py-3 sm:px-5 sm:py-4">
                            <div>
                                <div className="text-[13px] font-extrabold text-amber-200">Help</div>
                                <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">Down Under Blackjack Rules</div>
                            </div>
                            <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#50807c] bg-[#08312e] text-xl font-bold text-text transition-colors hover:bg-[#0b3d39]" aria-label="Close rules">&times;</button>
                        </div>
                        <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                            <div className="grid gap-3 text-sm leading-6 text-text sm:grid-cols-2">
                                {RULES.map(([title, items]) => (
                                    <div key={title} className="rounded-[4px] border border-[#50807c] bg-[#08312e] p-4">
                                        <div className="mb-2 text-sm font-extrabold text-amber-200">{title}</div>
                                        <div className="space-y-1">{items.map((item) => <div key={item}>{item}</div>)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function DealerLane({ cards, revealedCount, stage, scoop }: {
    cards: Card[]; revealedCount: number; stage: Stage;
    /** The dealer is sliding one card under the other to turn it over: the first card, or the hole card. */
    scoop: "first" | "hole" | null;
}) {
    const allUp = cards.length > 0 && revealedCount >= cards.length;
    const showTotal = stage === "dealer" || stage === "done" || (stage === "player" && allUp);
    const t = cards.length ? total(cards) : null;
    return (
        <div className="flex flex-col items-center gap-2">
            <Chip>Dealer{showTotal && t !== null ? ` · ${t}${isSoft(cards) ? " soft" : ""}` : ""}</Chip>
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

// The three range boxes in front of the dealer: the one the hole card falls in lights up
function RangeBoxes({ lit }: { lit: HoleRange | null }) {
    return (
        <div className="flex gap-2" data-testid="range-boxes" data-lit={lit ?? ""}>
            {RANGES.map((r) => {
                const on = lit === r.id;
                return (
                    <motion.div
                        key={r.id}
                        data-range={r.id}
                        data-on={on ? "true" : "false"}
                        animate={{ opacity: lit && !on ? 0.4 : 1, scale: on ? 1.06 : 1 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="flex w-[84px] flex-col items-center overflow-hidden rounded-[4px] border-2 sm:w-[96px]"
                        style={{
                            borderColor: r.color,
                            background: on ? `${r.color}40` : "rgba(0,0,0,0.25)",
                            boxShadow: on ? `0 0 18px ${r.color}aa` : "none",
                        }}
                    >
                        <span className="pt-1 text-[11px] font-extrabold uppercase tracking-wide text-white">{r.label}</span>
                        <span className="mt-1 w-full py-0.5 text-center text-[11px] font-extrabold text-white" style={{ background: r.color }}>{r.ranks}</span>
                    </motion.div>
                );
            })}
        </div>
    );
}

function HandBox({ hand, bet, index, isActive, stage, dealerTotal }: {
    hand: Card[]; bet: number; index: number; isActive: boolean;
    stage: Stage; dealerTotal: number;
}) {
    const t = total(hand);
    const bust = t > 21;
    const result = stage === "done" ? settleHand(t, dealerTotal) : null;
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

// ─── Action bar ───────────────────────────────────────────────────────────────
// Layout: [ChipTray left] [Buttons centered] [spacer right], the same as the Blackjack table

function DownUnderBar({
    stage, isShuffling, hasBet, canDeal, canDoubleDeal, canDouble, doubleForLess, canSplit, isResolvingAction,
    selectedChip, onChipSelect,
    onClear, onReset, onChangeBet, onDeal, onDoubleAndDeal,
    onHit, onStay, onDouble, onSplit,
}: {
    stage: Stage; isShuffling: boolean; hasBet: boolean; canDeal: boolean; canDoubleDeal: boolean;
    canDouble: boolean; doubleForLess: boolean; canSplit: boolean; isResolvingAction: boolean;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onReset: () => void; onChangeBet: () => void; onDeal: () => void; onDoubleAndDeal: () => void;
    onHit: () => void; onStay: () => void; onDouble: () => void; onSplit: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone = stage === "done";
    const isPlayer = stage === "player";
    const isDealer = stage === "dealer";
    const isDealing = stage === "dealing";
    const showChips = !isDealer;

    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
            <div className="flex items-center">
                {showChips ? (
                    <ChipTray selectedChip={selectedChip} onSelect={onChipSelect} disabled={isPlayer || isDealing || isShuffling} />
                ) : (
                    <div className="w-px" />
                )}
            </div>

            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {(isBetting || isDone) && (
                        <SlideBtn key="clear">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear} disabled={isShuffling || (isBetting && !hasBet)}>Clear</button>
                        </SlideBtn>
                    )}
                    {isBetting && (
                        <SlideBtn key="reset">
                            <button data-hotkey="E" className={BTN_NEUTRAL} onClick={onReset}>Reset</button>
                        </SlideBtn>
                    )}
                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button data-hotkey="B" className={BTN_NEUTRAL} onClick={onChangeBet} disabled={isShuffling}>Change Bet</button>
                        </SlideBtn>
                    )}
                    {isBetting && (
                        <SlideBtn key="deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    {isDone && (
                        <SlideBtn key="rebet-deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Rebet &amp; Deal</button>
                        </SlideBtn>
                    )}
                    {isDone && (
                        <SlideBtn key="double-deal">
                            <button className={BTN_GREEN} onClick={onDoubleAndDeal} disabled={!canDoubleDeal}>Double &amp; Deal</button>
                        </SlideBtn>
                    )}
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
                    {isDealing && (
                        <motion.span key="dealing-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-sm italic text-white/75">
                            Dealing…
                        </motion.span>
                    )}
                    {isDealer && (
                        <motion.span key="dealer-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-sm italic text-white/75">
                            Dealer playing…
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            <div className="invisible hidden sm:block">
                <ChipTray selectedChip={selectedChip} onSelect={() => { }} disabled />
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DownUnderBlackjack({ bankroll, setBankroll }: Props) {
    const recordBet = useBetRecorder();
    // two shoes take turns, gold backs then purple: a reshuffle brings out the other one
    const [deckNo, setDeckNo] = useState(1);
    const [showRules, setShowRules] = useState(false);

    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [dealer, setDealer] = useState<Card[]>([]);
    const [hands, setHands] = useState<Card[][]>([]);
    const [bets, setBets] = useState<number[]>([]);
    const [active, setActive] = useState(0);
    const [dealerRevealedCount, setDealerRevealedCount] = useState(1);
    const [dealerScoop, setDealerScoop] = useState<"first" | "hole" | null>(null);
    // the box the hole card falls in, lit once the dealer has checked it
    const [litRange, setLitRange] = useState<HoleRange | null>(null);
    // aces split once: after that a pair of aces cannot be split again this hand
    const [acesSplit, setAcesSplit] = useState(false);
    const revealHole = async () => {
        setDealerScoop("hole");
        await wait(DEALER_SCOOP_MS);
        setDealerRevealedCount(2);
        await wait(DEALER_SCOOP_MS);
        setDealerScoop(null);
    };

    const [bet, setBet] = useState(() => defaultBet(GAME_ID, "main"));
    const [chipStack, setChipStack] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet(GAME_ID, "main")));
    const [baseBet, setBaseBet] = useState(() => defaultBet(GAME_ID, "main")); // persists as default for next hand
    const [matchBet, setMatchBet] = useState(() => defaultBet(GAME_ID, "matchDealer"));
    const [selectedSpot, setSelectedSpot] = useState<Spot>("main");

    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Place chips and press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [isResolvingAction, setIsResolvingAction] = useState(false);
    const [roundReturned, setRoundReturned] = useState(0);
    const [roundNet, setRoundNet] = useState(0);
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);

    // Match the Dealer settles once the up card shows; it joins the hand's totals at the end
    const side = useRef({ bet: 0, returned: 0 });
    const [matchResult, setMatchResult] = useState<{ label: string; returned: number } | null>(null);

    const dealLock = useRef(false);
    const dealOnce = async () => {
        if (dealLock.current) return;
        dealLock.current = true;
        try { await deal(); } finally { window.setTimeout(() => { dealLock.current = false; }, 300); }
    };
    const dealBetRef = useRef<number | null>(null);

    const activeHand = hands[active] ?? [];
    const mainWagered = bets.reduce((s, w) => s + w, 0);

    // the hand is over: the main bets' returns plus the side bet's, against everything staked
    const finishTotals = (mainReturned: number, mainStaked: number) => {
        setRoundReturned(mainReturned + side.current.returned);
        setRoundNet(mainReturned + side.current.returned - mainStaked - side.current.bet);
    };

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
        wagersInPlay.forEach((w) => recordBet("Hand", w, 0));
        finishTotals(0, wagered);
        if (dealer.length > 0 && dealerRevealedCount < 2) { await revealHole(); await wait(400); }
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

        const nextDealer = [...dealer];
        const nextDeck = [...shoeInPlay];

        setStage("dealer");
        if (dealerRevealedCount < 2) {
            setMessage("Dealer reveals hole card.");
            await revealHole();
            await wait(DEALER_CARD_MS - DEALER_SCOOP_MS);
        }

        // dealer hit cards come out face up, one at a time; the dealer stands on all 17s
        while (total(nextDealer) < 17) {
            const card = nextDeck.shift();
            if (!card) break;
            nextDealer.push(card);
            setDealer([...nextDealer]);
            setDeck([...nextDeck]);
            setDealerRevealedCount(nextDealer.length);
            setMessage("Dealer draws.");
            await wait(DEALER_CARD_MS);
        }

        setDealer(nextDealer);
        setDeck(nextDeck);
        setDealerRevealedCount(nextDealer.length);

        const dt = total(nextDealer);
        let returned = 0;
        handsInPlay.forEach((hand, i) => {
            const result = settleHand(total(hand), dt);
            const wager = wagersInPlay[i];
            const back = handReturn(result, wager);
            returned += back;
            recordBet("Hand", wager, back, result === "Win" ? (dt === 22 ? "20 or 21 against a dealer 22" : dt > 21 ? "Dealer busts" : "Beat the dealer") : undefined);
        });

        const wagered = wagersInPlay.reduce((s, w) => s + w, 0);
        finishTotals(returned, wagered);
        setBankroll((b) => b + returned);
        setStage("done");
        setMessage(dt === 22 ? "Dealer 22. Every hand pushes, except 20 and 21." : dt > 21 ? "Dealer busts." : "Round complete.");
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
        pauseMs = PLAYER_TO_DEALER_DELAY_MS,
    ) => {
        const nextIdx = currentActive + 1;

        if (nextIdx < nextHands.length) {
            setActive(nextIdx);
            setMessage(`Playing hand ${nextIdx + 1} of ${nextHands.length}.`);

            const dealt = await ensureHandHasSecondCard(nextHands, nextIdx, nextDeck);
            const nextTotal = total(dealt.hands[nextIdx]);

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
            const aces = hand[0].rank === "A" && hand[1].rank === "A";
            if (aces && acesSplit) return;
            setBankroll((b) => b - bets[active]);
            let nextHands = [...hands.slice(0, active), [hand[0]], [hand[1]], ...hands.slice(active + 1)];
            const nextBets = [...bets.slice(0, active), bets[active], bets[active], ...bets.slice(active + 1)];
            setHands(nextHands);
            setBets(nextBets);
            setMessage(`Split hand ${active + 1}.`);

            if (aces) {
                // each ace gets one card, and both hands stand
                setAcesSplit(true);
                let dealt = await ensureHandHasSecondCard(nextHands, active, deck);
                dealt = await ensureHandHasSecondCard(dealt.hands, active + 1, dealt.deck);
                nextHands = dealt.hands;
                setMessage("Split aces: one card each.");
                await waitForPaint();
                await wait(PLAYER_TO_DEALER_DELAY_MS);
                await moveToNextHand(nextHands, dealt.deck, nextBets, active + 1);
                return;
            }

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
        const wager = Math.floor((override ?? bet) / 2.5) * 2.5;
        const sideWager = matchBet;
        if (wager < MIN_BET) return;
        if (bankroll < wager + sideWager) { setMessage("Not enough bankroll."); return; }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);
        if (nextDeck.length < 4) nextDeck = await performShuffleIfNeeded([]);

        setRoundReturned(0); setRoundNet(0);
        setBankroll((b) => b - wager - sideWager);
        side.current = { bet: sideWager, returned: 0 };
        setMatchResult(null);
        setLitRange(null);
        setAcesSplit(false);

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

        // Match the Dealer: the player's two cards against the up card
        if (sideWager > 0) {
            const outcome = matchDealer(playerHand.map(toSide), toSide(dealerHand[0]));
            const back = outcome ? sideWager * (outcome.multiplier + 1) : 0;
            side.current = { bet: sideWager, returned: back };
            recordBet("Match the Dealer", sideWager, back, outcome?.label);
            if (back > 0) setBankroll((b) => b + back);
            setMatchResult({ label: outcome ? `${outcome.label} pays ${formatMoney(back - sideWager)}` : "No match", returned: back });
        }

        // the dealer checks the hole card and lights its range
        const range = holeRange(dealerHand[1].value);
        setLitRange(range);
        setMessage(`The dealer's hole card is ${RANGES.find((r) => r.id === range)!.label}: ${RANGES.find((r) => r.id === range)!.ranks}.`);
        await wait(RANGE_CHECK_MS);

        const dealerBJ = total(dealerHand) === 21;
        const playerBJ = total(playerHand) === 21;

        if (dealerBJ) {
            await revealHole();
            recordBet("Hand", wager, playerBJ ? wager : 0);
            if (playerBJ) {
                finishTotals(wager, wager);
                setBankroll((b) => b + wager);
                setMessage("Both player and dealer have blackjack. Push.");
            } else {
                finishTotals(0, wager);
                setMessage("Dealer blackjack. Hand over.");
            }
            setStage("done"); return;
        }

        if (playerBJ) {
            const returned = wager * 2.5;
            recordBet("Hand", wager, returned, "Blackjack");
            await revealHole();
            finishTotals(returned, wager);
            setBankroll((b) => b + returned);
            setStage("done"); setMessage("Blackjack pays 3 to 2."); return;
        }

        // two gold cards: the dealer's hand is turned face up before anyone acts
        if (bothGold(dealerHand[0].value, dealerHand[1].value)) {
            await revealHole();
            setMessage(`Two gold cards: the dealer shows ${total(dealerHand)}${isSoft(dealerHand) ? " soft" : ""}. Hit, stand, double, or split.`);
        } else {
            setMessage("Hit, stand, double, or split.");
        }
        setStage("player");
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
        setLitRange(null); setMatchResult(null);
        side.current = { bet: 0, returned: 0 };
        setStage("betting");
        if (clearChips) {
            setBet(0); setChipStack([]); setBaseBet(0); setMatchBet(0);
        } else {
            setBet(baseBet);
            setChipStack(buildChipStackFromAmount(baseBet));
        }
        setSelectedSpot("main");
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle." : "Place chips and press Deal.");
    };

    // Clicking a spot only highlights it; tray chips go onto the highlighted spot
    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (stage !== "betting") return;
        if (selectedSpot === "main") {
            setBet((b) => { const next = b + chip; setBaseBet(next); return next; });
            setChipStack((s) => addChipToStack(s, chip));
        } else {
            setMatchBet((b) => b + chip);
        }
    };

    // Clicking the chips on a spot takes the last chip back
    const removeLastChip = (spot: Spot) => {
        if (stage !== "betting") return;
        if (spot === "main") {
            const next = popLastChip(bet);
            setBet(next); setBaseBet(next);
            setChipStack(buildChipStackFromAmount(next));
        } else {
            setMatchBet((b) => popLastChip(b));
        }
    };

    const clearBet = () => {
        if (stage === "done") { nextRound(true); return; }
        if (stage === "betting") { setBet(0); setChipStack([]); setBaseBet(0); setMatchBet(0); setSelectedSpot("main"); }
    };

    // Reset: back to the bets saved in Settings
    const resetBet = () => {
        if (stage !== "betting") return;
        const d = defaultBet(GAME_ID, "main");
        setBet(d); setChipStack(buildChipStackFromAmount(d)); setBaseBet(d);
        setMatchBet(defaultBet(GAME_ID, "matchDealer"));
        setSelectedSpot("main");
    };

    const doubleAndDeal = () => {
        if (dealLock.current) return;
        if (mainWagered === 0 || bankroll < mainWagered * 2 + matchBet) return;
        const doubled = mainWagered * 2;
        setBet(doubled);
        setBaseBet(doubled);
        setChipStack(buildChipStackFromAmount(doubled));
        dealBetRef.current = doubled;
        void dealOnce();
    };

    const aces = activeHand.length === 2 && activeHand[0]?.rank === "A" && activeHand[1]?.rank === "A";
    const canSplit =
        stage === "player" && activeHand.length === 2 && hands.length < MAX_HANDS &&
        activeHand[0]?.value === activeHand[1]?.value && bankroll >= (bets[active] ?? 0) && !(aces && acesSplit);
    // A double can be for less than the bet: with a short balance, whatever is left goes on the hand
    const canDouble = stage === "player" && activeHand.length === 2 && bankroll > 0;
    const doubleForLess = canDouble && bankroll < (bets[active] ?? 0);
    const dealerT = dealer.length ? total(dealer) : 0;
    const betting = stage === "betting" || stage === "done";
    const canDeal = betting && !isShuffling && bet >= MIN_BET && bankroll >= bet + matchBet;
    const canDoubleDeal = stage === "done" && !isShuffling && mainWagered >= MIN_BET && bankroll >= mainWagered * 2 + matchBet;
    const matchShown = stage === "betting" ? matchBet : side.current.bet;
    const matchPaid = !!matchResult && matchResult.returned > 0;

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="rounded-[4px] border border-amber-300/25 bg-black/65 px-10 py-8 text-center">
                        <div className="text-sm font-extrabold text-amber-200">Down Under Blackjack</div>
                        <div className="mt-2 text-3xl font-extrabold text-white">Shuffling Shoe</div>
                        <div className="mt-2 text-sm text-amber-100">Please wait…</div>
                    </div>
                </div>
            )}

            <TableShell deckNo={deckNo}
                feltColor={FELT_COLOR}
                gameName="Down Under Blackjack"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <DownUnderBar
                        stage={stage}
                        isShuffling={isShuffling}
                        hasBet={bet > 0 || matchBet > 0}
                        canDeal={canDeal}
                        canDoubleDeal={canDoubleDeal}
                        canDouble={canDouble}
                        doubleForLess={doubleForLess}
                        canSplit={canSplit}
                        isResolvingAction={isResolvingAction}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={clearBet}
                        onReset={resetBet}
                        onChangeBet={() => nextRound(false)}
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

                    <TableLabel onRules={() => setShowRules(true)} />

                    <div className="flex flex-col items-center gap-2">
                        <DealerLane cards={dealer} revealedCount={dealerRevealedCount} stage={stage} scoop={dealerScoop} />
                        <RangeBoxes lit={litRange} />
                    </div>

                    <BetBar
                        pendingBet={stage === "betting" ? bet + matchBet : mainWagered + side.current.bet}
                        returned={roundReturned}
                        net={roundNet}
                        showResult={stage === "done"}
                    />

                    <p className="text-center text-sm font-semibold text-amber-100">{message}</p>

                    <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-3">
                        {/* the main bet, until the cards come out; the hands take its place */}
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
                                        isSelected={selectedSpot === "main"}
                                        canBet={!isShuffling}
                                        onSelect={() => setSelectedSpot("main")}
                                        onRemove={() => removeLastChip("main")}
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
                                    />
                                ))}
                            </div>
                        )}

                        {/* Match the Dealer: stays on the felt, and shows what it paid */}
                        <div className="flex flex-col items-center gap-1" data-testid="match-dealer" data-returned={matchResult?.returned ?? ""}>
                            <BetSpot
                                testId="matchDealer"
                                chips={buildChipStackFromAmount(matchPaid ? matchResult!.returned : stage === "betting" || !matchResult ? matchShown : 0)}
                                totalBet={matchPaid ? matchResult!.returned : stage === "betting" || !matchResult ? matchShown : 0}
                                label="Match Dealer"
                                sublabel={stage === "betting" ? "optional" : matchPaid ? "pays" : undefined}
                                dim={78}
                                floatChips
                                isSelected={selectedSpot === "match"}
                                isWinner={matchPaid}
                                canBet={stage === "betting" && !isShuffling}
                                onSelect={() => setSelectedSpot("match")}
                                onRemove={() => removeLastChip("match")}
                            />
                            <span className="min-h-[16px] text-center text-[11px] font-semibold text-amber-100">
                                {matchResult ? matchResult.label : `${MATCH_DEALER_TABLE[0].pays} suited · ${MATCH_DEALER_TABLE[1].pays}`}
                            </span>
                        </div>
                    </div>
                </div>
            </TableShell>
        </>
    );
}
