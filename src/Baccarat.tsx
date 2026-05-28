import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination, formatMoney, CHIP_COLORS, buildChipStackFromAmount, BTN_NEUTRAL, BTN_GOLD } from "./shared/money";
import { SlideBtn } from "./shared/SlideBtn";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

type BacCard = {
    rank: Rank;
    suit: Suit;
    value: number;
    baccaratValue: number;
    id: string;
};

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

type Stage = "betting" | "dealing" | "done";
type Winner = "player" | "banker" | "tie";
type BetSpotId = "player" | "tie" | "banker" | "panda" | "dragon";

type HandHistoryEntry = {
    winner: Winner;
    natural: boolean;
    pandaHit: boolean;
    dragonHit: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const BET_STEP = 2.5;
const SHOE_DECKS = 8;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.82;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));
const SHUFFLE_DELAY_MS = 1800;
const CARD_REVEAL_DELAY_MS = 1100;

const PLAYER_BET_STORAGE_KEY     = "casino-baccarat-player-bet";
const BANKER_BET_STORAGE_KEY     = "casino-baccarat-banker-bet";
const TIE_BET_STORAGE_KEY        = "casino-baccarat-tie-bet";
const PANDA_BET_STORAGE_KEY      = "casino-baccarat-panda-bet";
const DRAGON_BET_STORAGE_KEY     = "casino-baccarat-dragon-bet";
const BACCARAT_SELECTED_CHIP_KEY = "casino-baccarat-selected-chip";

// ─── Game-logic functions (preserved exactly) ─────────────────────────────────

function shuffle<T>(arr: T[]) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createShoe(): BacCard[] {
    const shoe: BacCard[] = [];
    for (let deckIndex = 0; deckIndex < SHOE_DECKS; deckIndex++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                let value = Number(rank);
                if (["J", "Q", "K"].includes(rank)) value = 10;
                if (rank === "A") value = 11;

                let baccaratValue = 0;
                if (rank === "A") baccaratValue = 1;
                else if (["2", "3", "4", "5", "6", "7", "8", "9"].includes(rank)) baccaratValue = Number(rank);
                else baccaratValue = 0;

                shoe.push({
                    rank,
                    suit,
                    value,
                    baccaratValue,
                    id: `${deckIndex}-${rank}${suit}-${Math.random().toString(36).slice(2, 9)}`,
                });
            }
        }
    }
    return shuffle(shoe);
}

function sanitizeBet(value: number) {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    return Math.floor(value / BET_STEP) * BET_STEP;
}

function baccaratTotal(cards: BacCard[]) {
    return cards.reduce((sum, card) => sum + card.baccaratValue, 0) % 10;
}

function isNatural(total: number) {
    return total === 8 || total === 9;
}

function getWinner(playerCards: BacCard[], bankerCards: BacCard[]): Winner {
    const playerTotal = baccaratTotal(playerCards);
    const bankerTotal = baccaratTotal(bankerCards);
    if (playerTotal > bankerTotal) return "player";
    if (bankerTotal > playerTotal) return "banker";
    return "tie";
}

function shouldPlayerDraw(playerTotal: number) {
    return playerTotal <= 5;
}

function shouldBankerDrawTwoCardTotal(bankerTotal: number) {
    return bankerTotal <= 5;
}

function shouldBankerDraw(bankerTotal: number, playerThirdCardValue?: number) {
    if (playerThirdCardValue === undefined) {
        return bankerTotal <= 5;
    }
    if (bankerTotal <= 2) return true;
    if (bankerTotal === 3) return playerThirdCardValue !== 8;
    if (bankerTotal === 4) return [2, 3, 4, 5, 6, 7].includes(playerThirdCardValue);
    if (bankerTotal === 5) return [4, 5, 6, 7].includes(playerThirdCardValue);
    if (bankerTotal === 6) return [6, 7].includes(playerThirdCardValue);
    return false;
}

function isNoCommissionBankerPush(bankerCards: BacCard[], winner: Winner) {
    return winner === "banker" && bankerCards.length === 3 && baccaratTotal(bankerCards) === 7;
}

function isPanda8(playerCards: BacCard[], bankerCards: BacCard[]) {
    return getWinner(playerCards, bankerCards) === "player" && playerCards.length === 3 && baccaratTotal(playerCards) === 8;
}

function isDragon7(playerCards: BacCard[], bankerCards: BacCard[]) {
    return getWinner(playerCards, bankerCards) === "banker" && bankerCards.length === 3 && baccaratTotal(bankerCards) === 7;
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldShuffle(shoe: BacCard[]) {
    return shoe.length <= RESHUFFLE_REMAINING_CARDS || shoe.length < 12;
}

// ─── Shared-card adapter ──────────────────────────────────────────────────────

function toShared(card: BacCard, faceUp: boolean): SharedCard {
    return {
        id:   card.id,
        suit: card.suit as SharedCard["suit"],
        rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"],
        faceUp,
    };
}

// ─── Animation constants (matching Blackjack) ─────────────────────────────────

const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0,   scale: 1    },
};

const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-full border border-rose-300/25 bg-black/30 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-rose-100">
            {children}
        </div>
    );
}

function TableLabel({ onRules }: { onRules: () => void }) {
    return (
        <div className="flex select-none flex-col items-center gap-1">
            <div className="flex items-center gap-2">
                <h1
                    className="text-2xl font-extrabold uppercase tracking-[0.18em] text-amber-100/90"
                    style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                >
                    Baccarat
                </h1>
                <button
                    onClick={onRules}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/25 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15"
                    aria-label="Show rules"
                >
                    i
                </button>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.15em] text-white/35">
                <span>EZ BACCARAT</span>
                <span className="text-white/20">·</span>
                <span>BANKER PUSHES ON 3-CARD 7</span>
                <span className="text-white/20">·</span>
                <span>TIE PAYS 8 TO 1</span>
            </div>
        </div>
    );
}

function BetBar({ pendingBet, wagered, returned, net, stage }: {
    pendingBet: number; wagered: number; returned: number; net: number; stage: Stage;
}) {
    const showResult = stage === "done";
    const displayBet = wagered > 0 ? wagered : pendingBet;
    return (
        <div className="flex items-center justify-center gap-6 rounded-xl border border-white/10 bg-black/30 px-6 py-2.5">
            {([
                { label: "Bet",      val: displayBet > 0 ? formatMoney(displayBet) : "—", color: "text-white" },
                { label: "Returned", val: showResult ? formatMoney(returned) : "—",        color: "text-white" },
                {
                    label: "Net",
                    val:   showResult ? formatMoney(net) : "—",
                    color: showResult
                        ? net > 0 ? "text-emerald-300" : net < 0 ? "text-red-300" : "text-amber-100"
                        : "text-white",
                },
            ] as const).map(({ label, val, color }, i, arr) => (
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

function ChipStack({ chips, onClick }: { chips: ChipDenomination[]; onClick: () => void }) {
    const visible  = chips.slice(-3);
    const startIdx = chips.length - visible.length;
    const stackH   = 52 + (visible.length > 0 ? (visible.length - 1) * STACK_GAP : 0);

    return (
        <div
            className="relative flex cursor-pointer justify-center"
            style={{ width: 52, height: stackH, marginBottom: -20, zIndex: 10 }}
            onClick={onClick}
        >
            <AnimatePresence>
                {visible.map((denom, i) => {
                    const cfg = CHIP_COLORS[denom];
                    return (
                        <motion.div
                            key={startIdx + i}
                            className="absolute left-0 right-0 mx-auto flex h-[48px] w-[48px] select-none items-center justify-center rounded-full text-[10px] font-extrabold"
                            style={{
                                bottom: i * STACK_GAP, zIndex: i + 1,
                                backgroundColor: cfg.bg,
                                border: `3px solid ${cfg.border}`,
                                color: cfg.text,
                                boxShadow: "inset 0 1px 3px rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.18), 0 5px 14px rgba(0,0,0,0.5)",
                            }}
                            initial={{ opacity: 0, y: -22, scale: 0.72 }}
                            animate={{ opacity: 1, y: 0,   scale: 1    }}
                            exit={{    opacity: 0, y: 6,   scale: 0.8  }}
                            transition={{ type: "spring", stiffness: 420, damping: 22 }}
                        >
                            {cfg.label}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

function BetZone({ chips, totalBet, label, sublabel, size, isSelected, isWinner, onClick, onRemove, canBet }: {
    chips: ChipDenomination[];
    totalBet: number;
    label: string;
    sublabel: string;
    size: "large" | "small";
    isSelected: boolean;
    isWinner: boolean;
    onClick: () => void;
    onRemove: () => void;
    canBet: boolean;
}) {
    const dim = size === "large" ? 110 : 82;

    const ring  = isWinner   ? "border-amber-300/80 shadow-[0_0_28px_rgba(251,191,36,0.35)]"
                : isSelected ? "border-white/60 shadow-[0_0_16px_rgba(255,255,255,0.2)]"
                :              "border-white/30";
    const bg    = isWinner   ? "bg-amber-300/10"
                : isSelected ? "bg-white/10"
                :              "bg-black/20";

    return (
        <div className="flex flex-col items-center">
            {chips.length > 0 ? (
                <ChipStack chips={chips} onClick={onRemove} />
            ) : (
                <div style={{ height: 0 }} />
            )}
            <button
                onClick={onClick}
                disabled={!canBet}
                className={`relative flex flex-col items-center justify-center rounded-full border-2 border-dashed backdrop-blur-sm transition-all duration-200 ${ring} ${bg}`}
                style={{ width: dim, height: dim }}
            >
                {/* Label — normal weight, not extrabold */}
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/80">
                    {label}
                </span>
                <span className="mt-0.5 text-[10px] font-normal text-white/45">{sublabel}</span>
                {totalBet > 0 && (
                    <span className="mt-1 text-[10px] font-extrabold text-amber-200">
                        {formatMoney(totalBet)}
                    </span>
                )}
            </button>
        </div>
    );
}

function HandLane({ label, cards, handTotal, outcome }: {
    label: string;
    cards: BacCard[];
    handTotal: number | null;
    outcome: "neutral" | "win" | "lose" | "tie";
}) {
    return (
        <div className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition-all duration-300
            ${outcome === "win"
                ? "border-amber-300/40 bg-amber-300/8 ring-2 ring-amber-300/20 shadow-[0_0_30px_rgba(251,191,36,0.15)]"
                : outcome === "tie"
                ? "border-white/20 bg-white/5"
                : "border-white/10 bg-black/15"}`}
        >
            <Chip>
                {label}{handTotal !== null ? ` · ${handTotal}` : ""}
            </Chip>
            <div className="flex min-h-[94px] flex-wrap items-center justify-center gap-2">
                <AnimatePresence initial={false}>
                    {cards.map((card, i) => (
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
        </div>
    );
}

function ResultBanner({ winner, pandaHit, dragonHit }: {
    winner: Winner | null; pandaHit: boolean; dragonHit: boolean;
}) {
    if (!winner) return null;

    const text  = dragonHit  ? "DRAGON 7 — BANKER WINS"
                : pandaHit   ? "PANDA 8 — PLAYER WINS"
                : winner === "player" ? "PLAYER WINS"
                : winner === "banker" ? "BANKER WINS"
                :                      "TIE";

    const color = dragonHit  ? "text-fuchsia-200"
                : pandaHit   ? "text-emerald-200"
                : winner === "player" ? "text-sky-200"
                : winner === "banker" ? "text-rose-200"
                :                      "text-amber-200";

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 8 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{    opacity: 0, scale: 0.88,  y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`text-center text-xl font-extrabold uppercase tracking-[0.22em] ${color}`}
            style={{ textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}
        >
            {text}
        </motion.div>
    );
}

// ─── RulesModal ───────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={onClose}
                >
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                    <motion.div
                        className="relative w-full max-w-md rounded-[1.5rem] border border-amber-300/20 bg-[linear-gradient(180deg,_#1c0a0a,_#0f0404)] text-white shadow-2xl"
                        initial={{ opacity: 0, scale: 0.92, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 16 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                            <h2 className="text-base font-extrabold uppercase tracking-[0.18em] text-amber-100">
                                Baccarat Rules
                            </h2>
                            <button
                                onClick={onClose}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 transition hover:bg-white/20"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-4 overflow-y-auto px-6 py-5" style={{ maxHeight: "70vh" }}>
                            <section>
                                <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-300">
                                    How the Hand Works
                                </h3>
                                <ul className="space-y-1 text-[13px] text-white/80">
                                    <li>Player and Banker each receive 2 cards.</li>
                                    <li>Ace = 1, 2–9 = face value, 10 / J / Q / K = 0.</li>
                                    <li>Only the last digit of the total counts (e.g. 15 = 5).</li>
                                    <li><span className="font-semibold text-white">Player draws</span> a third card on 0–5; stands on 6–7.</li>
                                    <li><span className="font-semibold text-white">Banker draw rules</span> depend on Banker's total and Player's third card value.</li>
                                </ul>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-300">
                                    EZ Baccarat
                                </h3>
                                <ul className="space-y-1 text-[13px] text-white/80">
                                    <li>No commission on Banker wins — the house edge is built into the push rule.</li>
                                    <li>When Banker wins with a <span className="font-semibold text-white">3-card total of 7</span>, the Banker bet pushes (stake returned, no profit).</li>
                                </ul>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-300">
                                    Main Bet Payouts
                                </h3>
                                <div className="space-y-1 text-[13px] text-white/80">
                                    <div className="flex justify-between"><span>Player wins</span><span className="font-semibold text-white">1 : 1</span></div>
                                    <div className="flex justify-between"><span>Banker wins</span><span className="font-semibold text-white">1 : 1 (push on 3-card 7)</span></div>
                                    <div className="flex justify-between"><span>Tie</span><span className="font-semibold text-white">8 : 1</span></div>
                                    <p className="pt-0.5 text-[12px] text-white/50">On a Tie, Player and Banker bets push.</p>
                                </div>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-300">
                                    Side Bets
                                </h3>
                                <div className="space-y-1 text-[13px] text-white/80">
                                    <div className="flex justify-between"><span>Panda 8 — Player wins with 3-card 8</span><span className="font-semibold text-white">25 : 1</span></div>
                                    <div className="flex justify-between"><span>Dragon 7 — Banker wins with 3-card 7</span><span className="font-semibold text-white">40 : 1</span></div>
                                    <p className="pt-0.5 text-[12px] text-white/50">Side bets are independent of main bets and pay only on the specific outcome.</p>
                                </div>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-300">
                                    Natural
                                </h3>
                                <ul className="space-y-1 text-[13px] text-white/80">
                                    <li>A 2-card total of 8 or 9 is a <span className="font-semibold text-white">Natural</span> — no more cards are drawn.</li>
                                    <li>Naturals cannot trigger Dragon 7 or Panda 8 (those require 3 cards).</li>
                                </ul>
                            </section>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ─── BaccaratBar ──────────────────────────────────────────────────────────────

function BaccaratBar({
    stage, isShuffling, totalBet, bankroll,
    selectedChip, onChipSelect,
    onClear, onDeal, onChangeBet,
}: {
    stage: Stage; isShuffling: boolean; totalBet: number; bankroll: number;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onDeal: () => void; onChangeBet: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone    = stage === "done";
    const isDealing = stage === "dealing";

    const canDeal       = (isBetting || isDone) && !isShuffling && totalBet > 0 && bankroll >= totalBet;
    const canChangeBet  = isDone;
    const canClear      = (isBetting || isDone) && totalBet > 0;

    return (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl">

            {/* Left: chip tray */}
            <div className="flex items-center">
                <ChipTray
                    selectedChip={selectedChip}
                    onSelect={onChipSelect}
                    disabled={isDealing || isShuffling}
                />
            </div>

            {/* Center: buttons */}
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {canClear && (
                        <SlideBtn key="clear">
                            <button className={BTN_NEUTRAL} onClick={onClear} disabled={isShuffling}>Clear</button>
                        </SlideBtn>
                    )}
                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button className={BTN_NEUTRAL} onClick={onChangeBet} disabled={!canChangeBet}>
                                Change Bet
                            </button>
                        </SlideBtn>
                    )}
                    {(isBetting || isDone) && (
                        <SlideBtn key="deal">
                            <button className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    
                    {isDealing && (
                        <motion.span
                            key="dealing"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="text-sm italic text-white/40"
                        >
                            Dealing…
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            {/* Right: invisible mirror for true centering */}
            <div className="invisible">
                <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

type BetOverrides = Partial<Record<BetSpotId, number>>;

export default function BaccaratTable({ bankroll, setBankroll }: Props) {

    const [deck,        setDeck]        = useState<BacCard[]>(() => createShoe());
    const [playerCards, setPlayerCards] = useState<BacCard[]>([]);
    const [bankerCards, setBankerCards] = useState<BacCard[]>([]);
    const [_roadHistory, setRoadHistory] = useState<HandHistoryEntry[]>([]);

    const [playerBet, setPlayerBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        return sanitizeBet(Number(window.localStorage.getItem(PLAYER_BET_STORAGE_KEY) ?? "0"));
    });
    const [bankerBet, setBankerBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        return sanitizeBet(Number(window.localStorage.getItem(BANKER_BET_STORAGE_KEY) ?? "0"));
    });
    const [tieBet, setTieBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        return sanitizeBet(Number(window.localStorage.getItem(TIE_BET_STORAGE_KEY) ?? "0"));
    });
    const [pandaBet, setPandaBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        return sanitizeBet(Number(window.localStorage.getItem(PANDA_BET_STORAGE_KEY) ?? "0"));
    });
    const [dragonBet, setDragonBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        return sanitizeBet(Number(window.localStorage.getItem(DRAGON_BET_STORAGE_KEY) ?? "0"));
    });

    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(() => {
        if (typeof window === "undefined") return 25;
        const raw    = window.localStorage.getItem(BACCARAT_SELECTED_CHIP_KEY);
        const parsed = raw ? Number(raw) : 25;
        const valid: number[] = [1, 2.5, 5, 25, 100, 500, 1000, 5000];
        return valid.includes(parsed) ? (parsed as ChipDenomination) : 25;
    });

    const [stage,       setStage]       = useState<Stage>("betting");
    const [message,     setMessage]     = useState("Select a chip, click a betting zone, then press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [showRules,   setShowRules]   = useState(false);
    const [winner,      setWinner]      = useState<Winner | null>(null);
    const [pandaHitResult,  setPandaHitResult]  = useState(false);
    const [dragonHitResult, setDragonHitResult] = useState(false);
    const [lastPayout,  setLastPayout]  = useState(0);
    const [lastWagered, setLastWagered] = useState(0);

    const [selectedSpot, setSelectedSpot] = useState<BetSpotId | null>(null);
    const [playerChips,  setPlayerChips]  = useState<ChipDenomination[]>([]);
    const [bankerChips,  setBankerChips]  = useState<ChipDenomination[]>([]);
    const [tieChips,     setTieChips]     = useState<ChipDenomination[]>([]);
    const [pandaChips,   setPandaChips]   = useState<ChipDenomination[]>([]);
    const [dragonChips,  setDragonChips]  = useState<ChipDenomination[]>([]);

    const dealOverridesRef = useRef<BetOverrides | null>(null);

    useEffect(() => { window.localStorage.setItem(PLAYER_BET_STORAGE_KEY,     String(sanitizeBet(playerBet)));  }, [playerBet]);
    useEffect(() => { window.localStorage.setItem(BANKER_BET_STORAGE_KEY,     String(sanitizeBet(bankerBet)));  }, [bankerBet]);
    useEffect(() => { window.localStorage.setItem(TIE_BET_STORAGE_KEY,        String(sanitizeBet(tieBet)));     }, [tieBet]);
    useEffect(() => { window.localStorage.setItem(PANDA_BET_STORAGE_KEY,      String(sanitizeBet(pandaBet)));   }, [pandaBet]);
    useEffect(() => { window.localStorage.setItem(DRAGON_BET_STORAGE_KEY,     String(sanitizeBet(dragonBet)));  }, [dragonBet]);
    useEffect(() => { window.localStorage.setItem(BACCARAT_SELECTED_CHIP_KEY, String(selectedChip));            }, [selectedChip]);

    useEffect(() => {
        if (playerBet > 0) setPlayerChips(buildChipStackFromAmount(playerBet));
        if (bankerBet > 0) setBankerChips(buildChipStackFromAmount(bankerBet));
        if (tieBet    > 0) setTieChips(buildChipStackFromAmount(tieBet));
        if (pandaBet  > 0) setPandaChips(buildChipStackFromAmount(pandaBet));
        if (dragonBet > 0) setDragonChips(buildChipStackFromAmount(dragonBet));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalBet   = sanitizeBet(playerBet) + sanitizeBet(bankerBet) + sanitizeBet(tieBet) + sanitizeBet(pandaBet) + sanitizeBet(dragonBet);
    const playerTot  = useMemo(() => baccaratTotal(playerCards), [playerCards]);
    const bankerTot  = useMemo(() => baccaratTotal(bankerCards), [bankerCards]);
    const canBet     = stage === "betting" && !isShuffling;

    const getChips = (s: BetSpotId) => {
        if (s === "player") return playerChips;
        if (s === "banker") return bankerChips;
        if (s === "tie")    return tieChips;
        if (s === "panda")  return pandaChips;
        return dragonChips;
    };
    const setChips = (s: BetSpotId, v: ChipDenomination[]) => {
        if (s === "player") setPlayerChips(v);
        else if (s === "banker") setBankerChips(v);
        else if (s === "tie")    setTieChips(v);
        else if (s === "panda")  setPandaChips(v);
        else                     setDragonChips(v);
    };
    const getBet = (s: BetSpotId) => {
        if (s === "player") return playerBet;
        if (s === "banker") return bankerBet;
        if (s === "tie")    return tieBet;
        if (s === "panda")  return pandaBet;
        return dragonBet;
    };
    const setBet = (s: BetSpotId, v: number) => {
        const n = sanitizeBet(v);
        if (s === "player") setPlayerBet(n);
        else if (s === "banker") setBankerBet(n);
        else if (s === "tie")    setTieBet(n);
        else if (s === "panda")  setPandaBet(n);
        else setDragonBet(n);
    };

    const addChip = (spot: BetSpotId, chip: ChipDenomination) => {
        if (!canBet) return;
        setBet(spot, getBet(spot) + chip);
        setChips(spot, [...getChips(spot), chip]);
    };

    const clearSpot = (spot: BetSpotId) => {
        if (!canBet) return;
        setBet(spot, 0);
        setChips(spot, []);
    };

    const clearAllBets = () => {
        if (!canBet) return;
        setPlayerBet(0); setBankerBet(0); setTieBet(0); setPandaBet(0); setDragonBet(0);
        setPlayerChips([]); setBankerChips([]); setTieChips([]); setPandaChips([]); setDragonChips([]);
        setSelectedSpot(null);
    };

    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (canBet && selectedSpot) addChip(selectedSpot, chip);
    };

    const handleZoneClick = (spot: BetSpotId) => {
        if (!canBet) return;
        // If spot is already selected, add chip immediately
        if (selectedSpot === spot) {
            addChip(spot, selectedChip);
        } else {
            setSelectedSpot(spot);
        }
    };

    const performShuffleIfNeeded = async (shoe: BacCard[]) => {
        if (!shouldShuffle(shoe)) return shoe;
        setIsShuffling(true);
        setMessage("Shuffling 8-deck shoe...");
        await wait(SHUFFLE_DELAY_MS);
        const fresh = createShoe();
        setDeck(fresh);
        setRoadHistory([]);
        setIsShuffling(false);
        return fresh;
    };

    const drawOne = (shoe: BacCard[]) => {
        const next = [...shoe];
        const card = next.shift();
        return { card, nextDeck: next };
    };

    const deal = async () => {
        if (isShuffling) return;

        const ov = dealOverridesRef.current;
        dealOverridesRef.current = null;

        const nextPlayerBet = sanitizeBet(ov?.player ?? playerBet);
        const nextBankerBet = sanitizeBet(ov?.banker ?? bankerBet);
        const nextTieBet    = sanitizeBet(ov?.tie    ?? tieBet);
        const nextPandaBet  = sanitizeBet(ov?.panda  ?? pandaBet);
        const nextDragonBet = sanitizeBet(ov?.dragon ?? dragonBet);
        const wagerTotal    = nextPlayerBet + nextBankerBet + nextTieBet + nextPandaBet + nextDragonBet;

        if (wagerTotal <= 0) { setMessage("You need at least one wager to deal."); return; }
        if (bankroll < wagerTotal) { setMessage("Not enough bankroll for those wagers."); return; }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);
        if (nextDeck.length < 6) nextDeck = await performShuffleIfNeeded([]);

        setBankroll((b) => b - wagerTotal);
        setLastWagered(wagerTotal);
        setStage("dealing");
        setWinner(null);
        setPandaHitResult(false);
        setDragonHitResult(false);
        setLastPayout(0);
        setPlayerCards([]);
        setBankerCards([]);

        let player: BacCard[] = [];
        let banker: BacCard[] = [];

        setMessage("Dealing first card to Player...");
        let draw = drawOne(nextDeck);
        if (!draw.card) return;
        player = [draw.card]; nextDeck = draw.nextDeck;
        setPlayerCards([...player]); setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing first card to Banker...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        banker = [draw.card]; nextDeck = draw.nextDeck;
        setBankerCards([...banker]); setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing second card to Player...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        player = [...player, draw.card]; nextDeck = draw.nextDeck;
        setPlayerCards([...player]); setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing second card to Banker...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        banker = [...banker, draw.card]; nextDeck = draw.nextDeck;
        setBankerCards([...banker]); setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        const initialPlayerTotal = baccaratTotal(player);
        const initialBankerTotal = baccaratTotal(banker);
        const handIsNatural = isNatural(initialPlayerTotal) || isNatural(initialBankerTotal);

        if (!isNatural(initialPlayerTotal) && !isNatural(initialBankerTotal)) {
            let playerThirdCardValue: number | undefined;

            if (shouldPlayerDraw(initialPlayerTotal)) {
                setMessage("Player draws third card...");
                draw = drawOne(nextDeck);
                if (draw.card) {
                    player = [...player, draw.card];
                    nextDeck = draw.nextDeck;
                    playerThirdCardValue = draw.card.baccaratValue;
                    setPlayerCards([...player]); setDeck(nextDeck);
                    await wait(CARD_REVEAL_DELAY_MS);
                }
            } else {
                setMessage("Player stands.");
                await wait(CARD_REVEAL_DELAY_MS);
            }

            const bankerTwoCardTotal = (banker[0].baccaratValue + banker[1].baccaratValue) % 10;

            if (playerThirdCardValue === undefined) {
                if (shouldBankerDrawTwoCardTotal(bankerTwoCardTotal)) {
                    setMessage("Banker draws third card...");
                    draw = drawOne(nextDeck);
                    if (draw.card) {
                        banker = [...banker, draw.card]; nextDeck = draw.nextDeck;
                        setBankerCards([...banker]); setDeck(nextDeck);
                        await wait(CARD_REVEAL_DELAY_MS);
                    }
                } else {
                    setMessage("Banker stands.");
                    await wait(CARD_REVEAL_DELAY_MS);
                }
            } else {
                if (shouldBankerDraw(bankerTwoCardTotal, playerThirdCardValue)) {
                    setMessage("Banker draws third card...");
                    draw = drawOne(nextDeck);
                    if (draw.card) {
                        banker = [...banker, draw.card]; nextDeck = draw.nextDeck;
                        setBankerCards([...banker]); setDeck(nextDeck);
                        await wait(CARD_REVEAL_DELAY_MS);
                    }
                } else {
                    setMessage("Banker stands.");
                    await wait(CARD_REVEAL_DELAY_MS);
                }
            }
        } else {
            setMessage("Natural. No more cards.");
            await wait(CARD_REVEAL_DELAY_MS);
        }

        const finalWinner = getWinner(player, banker);
        const bankerPush  = isNoCommissionBankerPush(banker, finalWinner);
        const pandaHit    = isPanda8(player, banker);
        const dragonHit   = isDragon7(player, banker);

        let payout = 0;

        if (nextPlayerBet > 0) {
            if (finalWinner === "player")      payout += nextPlayerBet * 2;
            else if (finalWinner === "tie")    payout += nextPlayerBet;
        }
        if (nextBankerBet > 0) {
            if (finalWinner === "banker") {
                payout += bankerPush ? nextBankerBet : nextBankerBet * 2;
            } else if (finalWinner === "tie")  payout += nextBankerBet;
        }
        if (nextTieBet > 0) {
            if (finalWinner === "tie")         payout += nextTieBet * 9;
        }
        if (nextPandaBet > 0) {
            if (pandaHit)                      payout += nextPandaBet * 26;
        }
        if (nextDragonBet > 0) {
            if (dragonHit)                     payout += nextDragonBet * 41;
        }

        setBankroll((b) => b + payout);
        setDeck(nextDeck);
        setWinner(finalWinner);
        setPandaHitResult(pandaHit);
        setDragonHitResult(dragonHit);
        setLastPayout(payout);
        setStage("done");
        setRoadHistory((prev) => [
            ...prev,
            { winner: finalWinner, natural: handIsNatural, pandaHit, dragonHit },
        ]);

        if (dragonHit)                  setMessage("Banker wins with a 3-card 7. Dragon 7 hits. Banker bets push.");
        else if (pandaHit)              setMessage("Player wins with a 3-card 8. Panda 8 hits.");
        else if (finalWinner === "tie") setMessage(`Tie ${baccaratTotal(player)}-${baccaratTotal(banker)}.`);
        else                            setMessage(finalWinner === "player" ? "Player wins." : "Banker wins.");
    };

    const nextRound = (clearChips = false) => {
        setPlayerCards([]); setBankerCards([]);
        setWinner(null); setPandaHitResult(false); setDragonHitResult(false);
        setLastPayout(0); setLastWagered(0);
        setStage("betting");
        if (clearChips) {
            setPlayerBet(0); setBankerBet(0); setTieBet(0); setPandaBet(0); setDragonBet(0);
            setPlayerChips([]); setBankerChips([]); setTieChips([]); setPandaChips([]); setDragonChips([]);
        }
        setMessage(
            shouldShuffle(deck)
                ? "Cut card reached. Next hand will shuffle the shoe."
                : "Select a chip, click a betting zone, then press Deal."
        );
    };

    const playerWon = winner === "player";
    const bankerWon = winner === "banker";
    const tieWon    = winner === "tie";

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                    <div className="rounded-[1.6rem] border border-rose-300/25 bg-black/65 px-10 py-8 text-center shadow-2xl">
                        <div className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-rose-200">Baccarat</div>
                        <div className="mt-2 text-3xl font-extrabold text-white">Shuffling Shoe</div>
                        <div className="mt-2 text-sm text-rose-100/80">Please wait…</div>
                    </div>
                </div>
            )}

            <TableShell
                feltColor="#7f1d1d"
                gameName="Baccarat"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <BaccaratBar
                        stage={stage}
                        isShuffling={isShuffling}
                        totalBet={totalBet}
                        bankroll={bankroll}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={() => {
                            if (stage === "done") nextRound(true);
                            else clearAllBets();
                        }}
                        onDeal={() => void deal()}
                        onChangeBet={() => nextRound(false)}
                    />
                }
            >
                <div className="flex flex-1 flex-col items-center gap-4 py-2">

                    <TableLabel onRules={() => setShowRules(true)} />

                    {/* Hand lanes — side by side: Player left, Banker right */}
                    <div className="flex w-full max-w-2xl gap-3">
                        <div className="flex-1">
                            <HandLane
                                label="Player"
                                cards={playerCards}
                                handTotal={playerCards.length ? playerTot : null}
                                outcome={
                                    winner === "player" ? "win"
                                    : winner === "tie"  ? "tie"
                                    : winner === "banker" ? "lose"
                                    : "neutral"
                                }
                            />
                        </div>
                        <div className="flex-1">
                            <HandLane
                                label="Banker"
                                cards={bankerCards}
                                handTotal={bankerCards.length ? bankerTot : null}
                                outcome={
                                    winner === "banker" ? "win"
                                    : winner === "tie"  ? "tie"
                                    : winner === "player" ? "lose"
                                    : "neutral"
                                }
                            />
                        </div>
                    </div>

                    <BetBar
                        pendingBet={totalBet}
                        wagered={lastWagered}
                        returned={lastPayout}
                        net={lastPayout - lastWagered}
                        stage={stage}
                    />

                    <AnimatePresence>
                        {winner && (
                            <ResultBanner
                                winner={winner}
                                pandaHit={pandaHitResult}
                                dragonHit={dragonHitResult}
                            />
                        )}
                    </AnimatePresence>

                    <p className="text-sm font-semibold text-rose-100/70">{message}</p>

                    {/* Side bets: Panda 8 and Dragon 7 */}
                    <div className="flex items-end justify-center gap-8">
                        <BetZone
                            chips={pandaChips}
                            totalBet={pandaBet}
                            label="Panda 8"
                            sublabel="25:1"
                            size="small"
                            isSelected={selectedSpot === "panda"}
                            isWinner={pandaHitResult}
                            onClick={() => handleZoneClick("panda")}
                            onRemove={() => clearSpot("panda")}
                            canBet={canBet}
                        />
                        <BetZone
                            chips={dragonChips}
                            totalBet={dragonBet}
                            label="Dragon 7"
                            sublabel="40:1"
                            size="small"
                            isSelected={selectedSpot === "dragon"}
                            isWinner={dragonHitResult}
                            onClick={() => handleZoneClick("dragon")}
                            onRemove={() => clearSpot("dragon")}
                            canBet={canBet}
                        />
                    </div>

                    {/* Main bets: Player | Tie | Banker */}
                    <div className="flex items-end justify-center gap-4 sm:gap-6">
                        <BetZone
                            chips={playerChips}
                            totalBet={playerBet}
                            label="Player"
                            sublabel="1:1"
                            size="large"
                            isSelected={selectedSpot === "player"}
                            isWinner={playerWon}
                            onClick={() => handleZoneClick("player")}
                            onRemove={() => clearSpot("player")}
                            canBet={canBet}
                        />
                        <BetZone
                            chips={tieChips}
                            totalBet={tieBet}
                            label="Tie"
                            sublabel="8:1"
                            size="large"
                            isSelected={selectedSpot === "tie"}
                            isWinner={tieWon}
                            onClick={() => handleZoneClick("tie")}
                            onRemove={() => clearSpot("tie")}
                            canBet={canBet}
                        />
                        <BetZone
                            chips={bankerChips}
                            totalBet={bankerBet}
                            label="Banker"
                            sublabel="1:1 (push 3-card 7)"
                            size="large"
                            isSelected={selectedSpot === "banker"}
                            isWinner={bankerWon}
                            onClick={() => handleZoneClick("banker")}
                            onRemove={() => clearSpot("banker")}
                            canBet={canBet}
                        />
                    </div>

                </div>
            </TableShell>
        </>
    );
}