import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination, formatMoney, buildChipStackFromAmount, popLastChip, BTN_NEUTRAL, BTN_GOLD } from "./shared/money";
import BetSpot, { BetBar } from "./shared/BetSpot";
import HandRow from "./shared/HandRow";
import BlackjackHand from "./shared/BlackjackHand";
import { SlideBtn } from "./shared/SlideBtn";
import { defaultBet, defaultToggle } from "./shared/settings";
import {
    type PayRow, type SideCard,
    BLAZING_BET, BLAZING_TABLE, TRILUX_TABLE, KINGS_BOUNTY_TABLE, LUCKY_LADIES_TABLE, MATCH_DEALER_TABLE, FORTUNE_TABLE,
    BLAZING_CONTRIBUTION, BLAZING_METER_SEED,
    blazing7s, trilux, kingsBounty, luckyLadies, matchDealer, fortune,
    readBlazingMeter, writeBlazingMeter, growBlazingMeter,
} from "./sideBetLogic";

// Side Bet Blackjack: classic blackjack (six decks, blackjack pays 3 to 2, dealer stands on
// all 17s) with six side bets. Every side bet is decided by the first cards dealt: your two
// cards, and for some the dealer's up card or whether the dealer has blackjack.

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { rank: Rank; suit: Suit; value: number; id: string; /** A double-down card, laid sideways. */ sideways?: boolean };
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };
// "reveal": you hold two 7s on a Blazing 7s bet, and turn the dealer's card over when you are ready
type Stage = "betting" | "dealing" | "reveal" | "player" | "dealer" | "done";

type SideSpot = "kingsBounty" | "luckyLadies" | "trilux" | "matchDealer" | "fortune";
type SpotId = "main" | SideSpot;
type SideLine = { id: SideSpot | "blazing"; name: string; bet: number; returned: number; /** Short note for the spot: "9 to 1", or blank on a loss. */ pays: string; key: string | null };

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const MIN_BET = 5;
const SIDE_MAX = 100;
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
// How long one dealer card takes to slide under the other, and again to slide back
const DEALER_SCOOP_MS = 180;
// How long a side bet payout sits on its spot before it is picked up
const SIDE_PAYOUT_SHOWN_MS = 2600;
// How often the jackpot meter ticks up on its own while the table is open
const METER_TICK_MS = 4000;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));

const FELT_COLOR = "#0d4f4a";
const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";

const SIDE_SPOTS: { id: SideSpot; label: string }[] = [
    { id: "kingsBounty", label: "King's Bounty" },
    { id: "luckyLadies", label: "Lucky Ladies" },
    { id: "trilux", label: "TriLux" },
    { id: "matchDealer", label: "Match Dealer" },
    { id: "fortune", label: "Fortune" },
];
const SIDE_NAMES: Record<SideSpot | "blazing", string> = {
    blazing: "Blazing 7s", kingsBounty: "King's Bounty", luckyLadies: "Lucky Ladies", trilux: "TriLux", matchDealer: "Match the Dealer", fortune: "Fortune",
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

const side = (card: Card): SideCard => ({ rank: card.rank, suit: card.suit });

// ─── Small pieces ─────────────────────────────────────────────────────────────

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

function PayoutColumn({ title, rows, hit, note }: { title: string; rows: PayRow[]; hit?: string | null; note?: string }) {
    return (
        <div className="flex flex-col gap-0.5 pt-1" data-pay-table={title}>
            <div className="mb-0.5 text-center text-[13px] font-extrabold text-amber-200">{title}</div>
            {rows.map((row) => {
                const isHit = hit === row.key;
                return (
                    <div key={row.key} data-pay-row={row.key} data-hit={isHit ? "true" : undefined} className={`flex items-center justify-between gap-2 rounded px-1.5 py-px text-[11px] leading-tight transition ${isHit ? "bg-amber-300/12" : ""}`}>
                        <span className={isHit ? "font-extrabold text-amber-100" : "text-white/75"}>{row.label}</span>
                        <span className="shrink-0 font-bold text-gold">{row.pays}</span>
                    </div>
                );
            })}
            {note && <div className="px-1.5 pt-1 text-[10px] leading-snug text-white/75">{note}</div>}
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
            <div className="relative w-[248px] sm:w-[288px]" data-testid="dealer-cards">
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
        <div className={`flex flex-col items-center gap-2 rounded-[4px] border p-3 transition-colors duration-300
            ${isActive ? "border-amber-300/50 bg-amber-300/8 ring-2 ring-amber-300/20" : "border-white/10 bg-black/15"}`}
        >
            <div className="flex items-center gap-2">
                <Chip>Hand {index + 1}</Chip>
                {result && <Badge result={result} />}
            </div>
            <BlackjackHand cards={hand.map((card) => ({ ...toShared(card, true), sideways: card.sideways }))} />
            <div className="text-sm font-bold text-amber-100">
                {t}{isSoft(hand) ? " soft" : ""}{bust ? " · Bust" : ""}
            </div>
            <div className="text-xs text-white/75">Bet {formatMoney(bet)}</div>
        </div>
    );
}

// ─── Rules ────────────────────────────────────────────────────────────────────

const RULES: [string, string[]][] = [
    ["The Game", [
        "• Classic blackjack from a six-deck shoe. Blackjack pays 3 to 2 and the dealer stands on all 17s.",
        "• Split up to four hands, double on any two cards, double after a split, and double for less when your balance is short.",
        "• Every side bet is optional and is settled as soon as the first cards are dealt.",
    ]],
    ["Blazing 7s ($5 progressive)", [
        "• Counts the 7s in your two cards and the dealer's up card. One or two 7s must be in your own cards.",
        "• Three 7s of diamonds wins the whole jackpot. Three suited 7s win 10% of it.",
        "• Three 7s of the same color pay $2,500, any three 7s $1,000, two 7s $125 and one 7 $10. The $5 bet is not returned on top.",
        "• With two 7s in your hand, the dealer's card stays face down until you press Reveal Dealer Card.",
    ]],
    ["TriLux", [
        "• Your two cards and the dealer's up card as a three-card poker hand.",
        "• A flush, straight, three of a kind, straight flush or mini royal pays 9 to 1.",
    ]],
    ["King's Bounty", [
        "• Pays when your first two cards total 20. Only the highest line that fits is paid.",
        "• Two kings of spades pay 100 to 1, or 1,000 to 1 when the dealer has blackjack.",
        "• Suited kings 30 to 1, a suited pair of queens, jacks or 10s 20 to 1, any suited 20 9 to 1, two kings 6 to 1, any other 20 4 to 1.",
    ]],
    ["Lucky Ladies", [
        "• Pays when your first two cards total 20.",
        "• Two queens of hearts pay 200 to 1, or 1,000 to 1 when the dealer has blackjack.",
        "• A matched 20 (the same card twice) pays 25 to 1, a suited 20 10 to 1, any other 20 4 to 1.",
    ]],
    ["Match the Dealer", [
        "• Each of your two cards that matches the dealer's up card in rank wins: 11 to 1 if the suit matches too, 4 to 1 if not.",
        "• Both of your cards can win on the same hand.",
    ]],
    ["Fortune", [
        "• Your two cards and the dealer's up card total 19, 20 or 21. Aces count 1 or 11.",
        "• Suited 7-7-7 pays 200 to 1, suited 6-7-8 100 to 1, 7-7-7 50 to 1, 6-7-8 20 to 1.",
        "• A suited 21 pays 10 to 1, any other 21 3 to 1, and 20 or 19 pays 2 to 1.",
    ]],
];

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
                                <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">Side Bet Blackjack Rules</div>
                            </div>
                            <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#50807c] bg-[#08312e] text-xl font-bold text-text transition-colors hover:bg-[#0a3f3b] active:bg-[#051e1c]">&times;</button>
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

// ─── Action bar ───────────────────────────────────────────────────────────────

function SideBetBar({
    stage, isShuffling, canDeal, hasBets, canDouble, doubleForLess, canSplit, isResolvingAction,
    selectedChip, onChipSelect,
    onClear, onChangeBet, onDeal, onReveal,
    onHit, onStay, onDouble, onSplit,
}: {
    stage: Stage; isShuffling: boolean; canDeal: boolean; hasBets: boolean;
    canDouble: boolean; doubleForLess: boolean; canSplit: boolean; isResolvingAction: boolean;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onChangeBet: () => void; onDeal: () => void; onReveal: () => void;
    onHit: () => void; onStay: () => void; onDouble: () => void; onSplit: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone = stage === "done";
    const isPlayer = stage === "player";
    const isDealer = stage === "dealer";
    const isDealing = stage === "dealing";
    const isReveal = stage === "reveal";

    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
            <div className="flex items-center">
                {!isDealer ? (
                    <ChipTray selectedChip={selectedChip} onSelect={onChipSelect} disabled={!isBetting || isShuffling} />
                ) : (
                    <div className="w-px" />
                )}
            </div>

            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {(isBetting || isDone) && (
                        <SlideBtn key="clear">
                            <button className={BTN_NEUTRAL} onClick={onClear} disabled={isShuffling || (isBetting && !hasBets)}>Clear</button>
                        </SlideBtn>
                    )}
                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button className={BTN_NEUTRAL} onClick={onChangeBet} disabled={isShuffling}>Change Bet</button>
                        </SlideBtn>
                    )}
                    {isBetting && (
                        <SlideBtn key="deal">
                            <button className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    {isDone && (
                        <SlideBtn key="rebet-deal">
                            <button className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Rebet &amp; Deal</button>
                        </SlideBtn>
                    )}

                    {isReveal && (
                        <SlideBtn key="reveal">
                            <button className={BTN_GOLD} onClick={onReveal}>Reveal Dealer Card</button>
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
                            <button className={BTN_GOLD} onClick={onDouble} disabled={!canDouble || isResolvingAction}>{doubleForLess ? "Double for Less" : "Double"}</button>
                        </SlideBtn>
                    )}
                    {isPlayer && (
                        <SlideBtn key="split">
                            <button className={BTN_GOLD} onClick={onSplit} disabled={!canSplit || isResolvingAction}>Split</button>
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

const startingBets = (): Record<SpotId, number> => ({
    main: defaultBet("sidebetblackjack", "main"),
    kingsBounty: defaultBet("sidebetblackjack", "kingsBounty"),
    luckyLadies: defaultBet("sidebetblackjack", "luckyLadies"),
    trilux: defaultBet("sidebetblackjack", "trilux"),
    matchDealer: defaultBet("sidebetblackjack", "matchDealer"),
    fortune: defaultBet("sidebetblackjack", "fortune"),
});
const EMPTY_BETS: Record<SpotId, number> = { main: 0, kingsBounty: 0, luckyLadies: 0, trilux: 0, matchDealer: 0, fortune: 0 };

export default function SideBetBlackjack({ bankroll, setBankroll }: Props) {
    // two shoes take turns, gold backs then purple: a reshuffle brings out the other one
    const [deckNo, setDeckNo] = useState(1);

    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [dealer, setDealer] = useState<Card[]>([]);
    const [hands, setHands] = useState<Card[][]>([]);
    const [bets, setBets] = useState<number[]>([]);
    const [active, setActive] = useState(0);
    const [dealerRevealedCount, setDealerRevealedCount] = useState(1);
    const [dealerScoop, setDealerScoop] = useState<"first" | "hole" | null>(null);
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Place your bets and press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [isResolvingAction, setIsResolvingAction] = useState(false);
    const [roundReturned, setRoundReturned] = useState(0);
    const [roundNet, setRoundNet] = useState(0);
    const [showRules, setShowRules] = useState(false);

    // the chips on each spot while betting
    const [spotBets, setSpotBets] = useState<Record<SpotId, number>>(startingBets);
    const [selectedSpot, setSelectedSpot] = useState<SpotId>("main");
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [blazingOn, setBlazingOn] = useState(() => defaultToggle("sidebetblackjack", "blazing"));

    // the side bets for the hand in play: what was bet and how each one came out
    const [sideLines, setSideLines] = useState<SideLine[]>([]);
    // Side bets are paid straight away, like at a real table: the winnings sit on the spot for a
    // moment and are then picked up. The pay table keeps the winning line lit.
    const [sidePaidOut, setSidePaidOut] = useState(false);
    useEffect(() => {
        if (sideLines.length === 0) { setSidePaidOut(false); return; }
        const id = window.setTimeout(() => setSidePaidOut(true), SIDE_PAYOUT_SHOWN_MS);
        return () => window.clearTimeout(id);
    }, [sideLines]);
    const sideWagered = useRef(0);
    const sideReturned = useRef(0);

    // the Blazing 7s jackpot
    const [meter, setMeter] = useState<number>(readBlazingMeter);
    const meterRef = useRef(meter);
    useEffect(() => { meterRef.current = meter; writeBlazingMeter(meter); }, [meter]);
    useEffect(() => {
        const id = window.setInterval(() => setMeter((m) => growBlazingMeter(m, 0.5 + Math.random() * 2.5)), METER_TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    // set by the Reveal Dealer Card button, to let the deal carry on
    const revealWaiter = useRef<(() => void) | null>(null);

    // Deal runs one at a time, so a double-click cannot take the bet twice. The lock is held
    // a moment longer so a hand that ends instantly is not dealt over by the second click.
    const dealLock = useRef(false);
    const dealOnce = async () => {
        if (dealLock.current) return;
        dealLock.current = true;
        try { await deal(); } finally { window.setTimeout(() => { dealLock.current = false; }, 300); }
    };

    const activeHand = hands[active] ?? [];
    const totalWagered = bets.reduce((s, w) => s + w, 0);
    const sidePending = SIDE_SPOTS.reduce((s, spot) => s + spotBets[spot.id], 0) + (blazingOn ? BLAZING_BET : 0);
    const pendingTotal = spotBets.main + sidePending;

    // the dealer slides the up card under the hole card and turns the hole card over
    const revealHole = async () => {
        setDealerScoop("hole");
        await wait(DEALER_SCOOP_MS);
        setDealerRevealedCount(2);
        await wait(DEALER_SCOOP_MS);
        setDealerScoop(null);
    };

    // every result includes the side bets, which were settled at the deal
    const finishRound = (mainReturned: number, mainWagered: number, text: string) => {
        setRoundReturned(mainReturned + sideReturned.current);
        setRoundNet(mainReturned + sideReturned.current - mainWagered - sideWagered.current);
        if (mainReturned > 0) setBankroll((b) => b + mainReturned);
        setStage("done");
        setMessage(text);
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
        if (dealer.length > 0) { await revealHole(); await wait(400); }
        finishRound(0, wagered, allBusted ? "All hands bust. Dealer does not draw." : "Round complete.");
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
        setMessage("Dealer reveals hole card.");
        await revealHole();
        await wait(DEALER_CARD_MS - DEALER_SCOOP_MS);

        // dealer hit cards come out face up, one at a time
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
        const dealerBusted = dt > 21;
        let returned = 0;

        handsInPlay.forEach((hand, i) => {
            const pt = total(hand);
            const wager = wagersInPlay[i];
            if (pt > 21) return;
            if (dealerBusted || pt > dt) returned += wager * 2;
            else if (pt === dt) returned += wager;
        });

        finishRound(returned, wagersInPlay.reduce((s, w) => s + w, 0), dealerBusted ? "Dealer busts." : "Round complete.");
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
            const nextTotal = total(dealt.hands[nextIdx]);

            if (nextTotal >= 21) {
                setMessage(nextTotal === 21 ? `Hand ${nextIdx + 1} makes 21.` : `Hand ${nextIdx + 1} busts.`);
                await waitForPaint();
                await wait(PLAYER_TO_DEALER_DELAY_MS);
                await moveToNextHand(dealt.hands, dealt.deck, nextBets, nextIdx);
            }
            return;
        }

        await waitForPaint();
        await wait(pauseMs);
        if (nextHands.some((h) => total(h) <= 21)) await dealerTurn(nextHands, nextBets, nextDeck);
        else await finishRoundWithoutDealer(nextHands, nextBets);
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

    // Every side bet is decided by the first cards dealt, so they are all paid here, before
    // the hand is played.
    const settleSideBets = (playerHand: Card[], dealerHand: Card[], sides: Record<SideSpot, number>, blazing: boolean) => {
        const player = playerHand.map(side);
        const up = side(dealerHand[0]);
        const dealerBlackjack = total(dealerHand) === 21;
        const lines: SideLine[] = [];
        let returned = 0;

        if (blazing) {
            const hit = blazing7s(player, up);
            let pays = 0;
            if (hit) {
                const jackpot = meterRef.current;
                pays = hit.jackpotShare > 0 ? Math.round(jackpot * hit.jackpotShare * 100) / 100 : hit.fixed;
                // the whole jackpot starts again from its seed: a 10% win comes off the meter
                if (hit.jackpotShare === 1) setMeter(BLAZING_METER_SEED);
                else if (hit.jackpotShare > 0) setMeter((m) => Math.max(BLAZING_METER_SEED, Math.round((m - pays) * 100) / 100));
            }
            returned += pays;
            lines.push({ id: "blazing", name: SIDE_NAMES.blazing, bet: BLAZING_BET, returned: pays, pays: hit ? hit.label : "", key: hit?.key ?? null });
        }

        const outcomes: Record<SideSpot, ReturnType<typeof trilux>> = {
            kingsBounty: kingsBounty(player, dealerBlackjack),
            luckyLadies: luckyLadies(player, dealerBlackjack),
            trilux: trilux(player, up),
            matchDealer: matchDealer(player, up),
            fortune: fortune(player, up),
        };
        for (const spot of SIDE_SPOTS) {
            const amount = sides[spot.id];
            if (amount <= 0) continue;
            const hit = outcomes[spot.id];
            const back = hit ? amount * (hit.multiplier + 1) : 0;
            returned += back;
            lines.push({ id: spot.id, name: SIDE_NAMES[spot.id], bet: amount, returned: back, pays: hit ? `${hit.multiplier} to 1` : "", key: hit?.key ?? null });
        }
        return { lines, returned };
    };

    const deal = async () => {
        if (isShuffling) return;
        const wager = Math.max(MIN_BET, Math.floor(spotBets.main / 2.5) * 2.5);
        const sides = { kingsBounty: spotBets.kingsBounty, luckyLadies: spotBets.luckyLadies, trilux: spotBets.trilux, matchDealer: spotBets.matchDealer, fortune: spotBets.fortune };
        const blazing = blazingOn;
        const sideTotal = SIDE_SPOTS.reduce((s, spot) => s + sides[spot.id], 0) + (blazing ? BLAZING_BET : 0);
        if (bankroll < wager + sideTotal) { setMessage("Not enough bankroll for those bets."); return; }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);
        if (nextDeck.length < 4) nextDeck = await performShuffleIfNeeded([]);

        setRoundReturned(0); setRoundNet(0);
        setBankroll((b) => b - wager - sideTotal);
        sideWagered.current = sideTotal;
        sideReturned.current = 0;
        setSideLines([]);
        if (blazing) setMeter((m) => growBlazingMeter(m, BLAZING_CONTRIBUTION));

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

        // Two 7s on a Blazing 7s bet: the dealer's card could be worth the jackpot, so it stays
        // down until the player chooses to turn it over.
        if (blazing && playerHand.every((c) => c.rank === "7")) {
            setStage("reveal");
            setMessage("Two 7s. Turn over the dealer's card when you are ready.");
            await new Promise<void>((resolve) => { revealWaiter.current = resolve; });
            revealWaiter.current = null;
            setStage("dealing");
        }

        // the dealer slides the second card under the first and turns the first one over
        setDealerScoop("first");
        await wait(DEALER_SCOOP_MS);
        setDealerRevealedCount(1);
        await wait(DEALER_SCOOP_MS);
        setDealerScoop(null);
        await wait(DEAL_CARD_MS - 80);

        const settled = settleSideBets(playerHand, dealerHand, sides, blazing);
        sideReturned.current = settled.returned;
        setSideLines(settled.lines);
        if (settled.returned > 0) setBankroll((b) => b + settled.returned);
        // a moment to take in a side bet win before the hand carries on
        const jackpot = settled.lines.find((line) => line.id === "blazing" && (line.key === "threeDiamonds" || line.key === "threeSuited"));
        if (jackpot) { setMessage(`${jackpot.pays}! Blazing 7s pays ${formatMoney(jackpot.returned)}.`); await wait(2600); }
        else if (settled.returned > 0) { setMessage(`Side bets pay ${formatMoney(settled.returned)}.`); await wait(900); }

        const dealerBJ = total(dealerHand) === 21;
        const playerBJ = total(playerHand) === 21;

        if (dealerBJ) {
            await revealHole();
            if (playerBJ) finishRound(wager, wager, "Both player and dealer have blackjack. Push.");
            else finishRound(0, wager, "Dealer blackjack. Hand over.");
            return;
        }

        if (playerBJ) {
            await revealHole();
            finishRound(wager * 2.5, wager, "Blackjack pays 3 to 2.");
            return;
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

    const backToBetting = (clearChips: boolean) => {
        setDealer([]); setHands([]); setBets([]); setActive(0);
        setDealerRevealedCount(1); setRoundReturned(0); setRoundNet(0);
        setSideLines([]); sideWagered.current = 0; sideReturned.current = 0;
        setStage("betting");
        if (clearChips) { setSpotBets(EMPTY_BETS); setBlazingOn(false); setSelectedSpot("main"); }
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle." : "Place your bets and press Deal.");
    };

    // A tray chip goes onto the highlighted spot
    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (stage !== "betting") return;
        setSpotBets((prev) => {
            const cap = selectedSpot === "main" ? Infinity : SIDE_MAX;
            return { ...prev, [selectedSpot]: Math.min(cap, prev[selectedSpot] + chip) };
        });
    };

    // Clicking the chips on a spot takes the last chip back
    const removeLastChip = (spot: SpotId) => {
        if (stage !== "betting") return;
        setSpotBets((prev) => ({ ...prev, [spot]: popLastChip(prev[spot]) }));
    };

    const clearBet = () => {
        if (stage === "done") { backToBetting(true); return; }
        if (stage === "betting") { setSpotBets(EMPTY_BETS); setBlazingOn(false); setSelectedSpot("main"); }
    };

    const canSplit =
        stage === "player" && activeHand.length === 2 && hands.length < MAX_HANDS &&
        activeHand[0]?.value === activeHand[1]?.value && bankroll >= (bets[active] ?? 0);
    // A double can be for less than the bet: with a short balance, whatever is left goes on the hand
    const canDouble = stage === "player" && activeHand.length === 2 && bankroll > 0;
    const doubleForLess = canDouble && bankroll < (bets[active] ?? 0);
    const dealerT = dealer.length ? total(dealer) : 0;
    const dealerBusted = dealerT > 21;
    const canDeal = (stage === "betting" || stage === "done") && !isShuffling && spotBets.main >= MIN_BET && bankroll >= pendingTotal;
    const hitKey = (id: SideLine["id"]) => sideLines.find((line) => line.id === id)?.key ?? null;
    const sideLine = (id: SideLine["id"]) => sideLines.find((line) => line.id === id);
    const blazingLine = sideLine("blazing");
    const blazingPaying = !!blazingLine && blazingLine.returned > 0 && !sidePaidOut;
    const blazingLit = stage === "betting" || !blazingLine ? blazingOn : blazingPaying;

    // One side bet spot: your chips while the bet is live, the payout once it is settled, and
    // empty after a loss.
    const sideSpot = (id: SideSpot, label: string) => {
        const line = sideLine(id);
        const betting = stage === "betting";
        const paying = !!line && line.returned > 0 && !sidePaidOut;
        const amount = line ? (paying ? line.returned : 0) : spotBets[id];
        return (
            <div key={id} data-side-line={line ? id : undefined} data-returned={line?.returned}>
                <BetSpot
                    testId={id}
                    chips={buildChipStackFromAmount(amount)}
                    totalBet={amount}
                    label={label}
                    sublabel={betting ? "optional" : paying ? line.pays : undefined}
                    dim={78}
                    floatChips
                    isSelected={selectedSpot === id}
                    isWinner={paying}
                    onSelect={() => setSelectedSpot(id)}
                    onRemove={() => removeLastChip(id)}
                    canBet={betting && !isShuffling}
                />
            </div>
        );
    };

    // The $5 Blazing 7s light and its jackpot meter
    const blazingLight = (
        <div className="flex w-[104px] flex-col items-center gap-1" data-testid="blazing" data-side-line={blazingLine ? "blazing" : undefined} data-returned={blazingLine?.returned}>
            <button
                onClick={() => stage === "betting" && setBlazingOn((on) => !on)}
                disabled={stage !== "betting"}
                aria-pressed={blazingOn}
                aria-label="Blazing 7s progressive, $5"
                data-testid="blazing-light"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${blazingLit ? "border-white" : "border-white/45 hover:border-white"} ${stage === "betting" ? "cursor-pointer" : "cursor-default"}`}
                style={{ background: blazingLit ? "#ef2a2a" : "#3a0f0f", outline: blazingPaying ? "3px solid #fbbf24" : undefined, outlineOffset: 2 }}
            >
                <span className={`text-[10px] font-extrabold ${blazingLit ? "text-white" : "text-white/75"}`}>${BLAZING_BET}</span>
            </button>
            <span className="rounded-[4px] border border-red-500/25 bg-black/60 px-2 py-0.5 text-sm font-bold tabular-nums text-red-400" data-testid="blazing-meter">
                {formatMoney(meter)}
            </span>
            <span className={`text-center text-[12px] font-bold leading-tight ${blazingPaying ? "text-gold" : "text-white/75"}`}>
                {blazingPaying && blazingLine ? `Pays ${formatMoney(blazingLine.returned)}` : "Blazing 7s"}
            </span>
        </div>
    );

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="rounded-[4px] border border-amber-300/25 bg-black/65 px-10 py-8 text-center">
                        <div className="text-sm font-extrabold text-amber-200">Side Bet Blackjack</div>
                        <div className="mt-2 text-3xl font-extrabold text-white">Shuffling Shoe</div>
                        <div className="mt-2 text-sm text-amber-100">Please wait…</div>
                    </div>
                </div>
            )}

            <TableShell deckNo={deckNo}
                feltColor={FELT_COLOR}
                gameName="Side Bet Blackjack"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <SideBetBar
                        stage={stage}
                        isShuffling={isShuffling}
                        canDeal={canDeal}
                        hasBets={pendingTotal > 0}
                        canDouble={canDouble}
                        doubleForLess={doubleForLess}
                        canSplit={canSplit}
                        isResolvingAction={isResolvingAction}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={clearBet}
                        onChangeBet={() => backToBetting(false)}
                        onDeal={() => void dealOnce()}
                        onReveal={() => revealWaiter.current?.()}
                        onHit={() => void hit()}
                        onStay={() => void stay()}
                        onDouble={() => void doubleDown()}
                        onSplit={() => void split()}
                    />
                }
            >
                {/* Game title */}
                <div className="flex flex-col items-center gap-0.5 select-none">
                    <div className="flex items-center gap-2">
                        <h1 className="text-center text-2xl font-bold text-gold-soft">Side Bet Blackjack</h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>BLACKJACK PAYS 3 to 2</span>
                        <span className="text-white/75">·</span>
                        <span>Dealer stands on all 17s</span>
                        <span className="text-white/75">·</span>
                        <span>Six side bets</span>
                    </div>
                </div>

                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:px-6">

                    {/* Left column: pay tables (desktop only) */}
                    <div className="hidden w-64 shrink-0 flex-col justify-center lg:flex">
                        <div className="rounded-[4px] border border-white/10 bg-black/25 p-4">
                            <PayoutColumn title="King's Bounty" rows={KINGS_BOUNTY_TABLE} hit={hitKey("kingsBounty")} />
                            <div className="my-2 h-px bg-white/10" />
                            <PayoutColumn title="Lucky Ladies" rows={LUCKY_LADIES_TABLE} hit={hitKey("luckyLadies")} />
                            <div className="my-2 h-px bg-white/10" />
                            <PayoutColumn title="Match the Dealer" rows={MATCH_DEALER_TABLE} hit={hitKey("matchDealer")} note="Each of your cards can win." />
                        </div>
                    </div>

                    {/* Center column */}
                    <div className="relative flex w-full flex-col items-center gap-3 py-2 lg:flex-1">

                        <DealerLane cards={dealer} revealedCount={dealerRevealedCount} stage={stage} scoop={dealerScoop} />

                        <BetBar
                            pendingBet={stage === "betting" ? pendingTotal : totalWagered + sideWagered.current}
                            returned={roundReturned}
                            net={roundNet}
                            showResult={stage === "done"}
                        />

                        <p className="text-center text-sm font-semibold text-amber-100" data-testid="message">{message}</p>

                        {/* The side bet spots stay on the felt either side of the hand, each on the same
                            side as its pay table, and are paid where they sit */}
                        <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-9 pt-7 lg:flex-nowrap lg:gap-x-8 lg:pt-0">
                            <div className="order-1 flex gap-3 lg:flex-col lg:gap-8 lg:pt-7">
                                {sideSpot("kingsBounty", "King's Bounty")}
                                {sideSpot("luckyLadies", "Lucky Ladies")}
                                {sideSpot("matchDealer", "Match Dealer")}
                            </div>

                            <div className="order-3 flex w-full justify-center lg:order-2 lg:w-auto">
                                {stage === "betting" ? (
                                    <BetSpot
                                        testId="main"
                                        chips={buildChipStackFromAmount(spotBets.main)}
                                        totalBet={spotBets.main}
                                        label="Main"
                                        sublabel={`min $${MIN_BET}`}
                                        dim={100}
                                        floatChips
                                        isSelected={selectedSpot === "main"}
                                        onSelect={() => setSelectedSpot("main")}
                                        onRemove={() => removeLastChip("main")}
                                        canBet={!isShuffling}
                                    />
                                ) : (
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

                            <div className="order-2 flex items-center gap-3 lg:order-3 lg:flex-col lg:gap-8">
                                {blazingLight}
                                {sideSpot("trilux", "TriLux")}
                                {sideSpot("fortune", "Fortune")}
                            </div>
                        </div>
                    </div>

                    {/* Right column: pay tables (desktop only) */}
                    <div className="hidden w-64 shrink-0 flex-col justify-center lg:flex">
                        <div className="rounded-[4px] border border-white/10 bg-black/25 p-4">
                            <PayoutColumn title="Blazing 7s" rows={BLAZING_TABLE} hit={hitKey("blazing")} note="$5 bet. Your two cards and the dealer's up card." />
                            <div className="my-2 h-px bg-white/10" />
                            <PayoutColumn title="TriLux" rows={TRILUX_TABLE} hit={hitKey("trilux")} />
                            <div className="my-2 h-px bg-white/10" />
                            <PayoutColumn title="Fortune" rows={FORTUNE_TABLE} hit={hitKey("fortune")} />
                        </div>
                    </div>

                </div>
            </TableShell>
        </>
    );
}
