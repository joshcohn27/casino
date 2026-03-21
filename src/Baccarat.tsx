import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

type Card = {
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

type RoadCell = {
    col: number;
    row: number;
    winner: Winner;
    tieCount: number;
    natural: boolean;
    pandaHit: boolean;
    dragonHit: boolean;
};

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const BET_STEP = 5;
const CHIP_VALUES = [5, 25, 100];
const SHOE_DECKS = 8;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.82;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));
const SHUFFLE_DELAY_MS = 1800;
const CARD_REVEAL_DELAY_MS = 1400;

const PLAYER_BET_STORAGE_KEY = "casino-baccarat-player-bet";
const BANKER_BET_STORAGE_KEY = "casino-baccarat-banker-bet";
const TIE_BET_STORAGE_KEY = "casino-baccarat-tie-bet";
const PANDA_BET_STORAGE_KEY = "casino-baccarat-panda-bet";
const DRAGON_BET_STORAGE_KEY = "casino-baccarat-dragon-bet";
const BACCARAT_SELECTED_CHIP_STORAGE_KEY = "casino-baccarat-selected-chip";

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

function formatMoney(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
}

function sanitizeBet(value: number) {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    return Math.floor(value / BET_STEP) * BET_STEP;
}

function baccaratTotal(cards: Card[]) {
    return cards.reduce((sum, card) => sum + card.baccaratValue, 0) % 10;
}

function isNatural(total: number) {
    return total === 8 || total === 9;
}

function getWinner(playerCards: Card[], bankerCards: Card[]): Winner {
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

function isNoCommissionBankerPush(bankerCards: Card[], winner: Winner) {
    return winner === "banker" && bankerCards.length === 3 && baccaratTotal(bankerCards) === 7;
}

function isPanda8(playerCards: Card[], bankerCards: Card[]) {
    return getWinner(playerCards, bankerCards) === "player" && playerCards.length === 3 && baccaratTotal(playerCards) === 8;
}

function isDragon7(playerCards: Card[], bankerCards: Card[]) {
    return getWinner(playerCards, bankerCards) === "banker" && bankerCards.length === 3 && baccaratTotal(bankerCards) === 7;
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldShuffle(shoe: Card[]) {
    return shoe.length <= RESHUFFLE_REMAINING_CARDS || shoe.length < 12;
}

function buildBigRoad(history: HandHistoryEntry[]) {
    const cells: RoadCell[] = [];
    const occupied = new Set<string>();

    let lastPlaced: RoadCell | null = null;

    for (const entry of history) {
        if (entry.winner === "tie") {
            if (lastPlaced) {
                lastPlaced.tieCount += 1;
            } else {
                const tieOnlyCell: RoadCell = {
                    col: 0,
                    row: 0,
                    winner: "tie",
                    tieCount: 1,
                    natural: false,
                    pandaHit: false,
                    dragonHit: false,
                };

                cells.push(tieOnlyCell);
                occupied.add("0-0");
                lastPlaced = tieOnlyCell;
            }
            continue;
        }

        let nextCol = 0;
        let nextRow = 0;

        if (!lastPlaced || lastPlaced.winner === "tie") {
            nextCol = cells.length ? Math.max(...cells.map((cell) => cell.col)) + 1 : 0;
            nextRow = 0;
        } else if (lastPlaced.winner === entry.winner) {
            const desiredRow = lastPlaced.row + 1;
            const blockedBelow = occupied.has(`${lastPlaced.col}-${desiredRow}`);
            const overflowed = desiredRow > 5;

            if (overflowed || blockedBelow) {
                nextCol = lastPlaced.col + 1;
                nextRow = lastPlaced.row;
            } else {
                nextCol = lastPlaced.col;
                nextRow = desiredRow;
            }
        } else {
            nextCol = lastPlaced.col + 1;
            nextRow = 0;
        }

        while (occupied.has(`${nextCol}-${nextRow}`) && nextCol < 500) {
            nextCol += 1;
        }

        const newCell: RoadCell = {
            col: nextCol,
            row: nextRow,
            winner: entry.winner,
            tieCount: 0,
            natural: entry.natural,
            pandaHit: entry.pandaHit,
            dragonHit: entry.dragonHit,
        };

        cells.push(newCell);
        occupied.add(`${nextCol}-${nextRow}`);
        lastPlaced = newCell;
    }

    return cells;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-full border border-rose-300/30 bg-black/35 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.22em] text-rose-100 shadow sm:px-3 sm:text-[10px] sm:tracking-[0.24em]">
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
    accent?: "default" | "gold" | "red";
}) {
    const accentClasses =
        accent === "gold"
            ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
            : accent === "red"
                ? "border-rose-300/25 bg-rose-300/10 text-rose-50"
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
        ? "h-[78px] w-[54px] rounded-[11px] sm:h-[88px] sm:w-[62px] sm:rounded-[12px] lg:h-[100px] lg:w-[70px] lg:rounded-[14px]"
        : "h-[62px] w-[44px] rounded-[10px] sm:h-[72px] sm:w-[50px] sm:rounded-[11px] lg:h-[80px] lg:w-[56px] lg:rounded-[12px]";

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

                    <div className={`${textColor} text-[18px] sm:text-[21px] lg:text-[24px]`}>{card.suit}</div>
                </>
            )}
        </div>
    );
}

function CardBack({ large = false }: { large?: boolean }) {
    const sizeClasses = large
        ? "h-[78px] w-[54px] rounded-[11px] sm:h-[88px] sm:w-[62px] sm:rounded-[12px] lg:h-[100px] lg:w-[70px] lg:rounded-[14px]"
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
            initial={{ opacity: 0, y: -18, scale: 0.92, rotate: sideways ? 90 : 0 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: sideways ? 90 : 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className={`[perspective:1000px] ${sideways ? "mx-3 sm:mx-4" : ""}`}
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
    totalLabel,
    accent = "default",
    outcome = "neutral",
}: {
    label: string;
    cards: Card[];
    totalLabel?: string;
    accent?: "default" | "player" | "banker";
    outcome?: "neutral" | "win" | "lose" | "tie";
}) {
    const accentClasses =
        accent === "player"
            ? "border-sky-300/30 bg-sky-300/10"
            : accent === "banker"
                ? "border-rose-300/30 bg-rose-300/10"
                : "border-white/10 bg-black/18";

    const outcomeClasses =
        outcome === "win"
            ? "ring-2 ring-emerald-300/45 shadow-[0_0_30px_rgba(74,222,128,0.18)]"
            : outcome === "tie"
                ? "ring-2 ring-amber-300/35 shadow-[0_0_26px_rgba(252,211,77,0.14)]"
                : "ring-0";

    const laneShift = outcome === "win" ? 26 : 0;

    return (
        <motion.div
            animate={{
                y: laneShift,
                scale: outcome === "win" ? 1.015 : 1,
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`rounded-[1.5rem] border p-3 shadow-xl backdrop-blur sm:p-4 ${accentClasses} ${outcomeClasses}`}
        >
            <div className="flex min-w-0 flex-col items-center">
                <SectionLabel>{label}</SectionLabel>

                <div className="mt-3 flex min-h-[128px] max-w-full flex-wrap items-center justify-center gap-2 sm:min-h-[150px] sm:gap-3">
                    <AnimatePresence initial={false}>
                        {cards.map((card, index) => {
                            const sideways = index === 2;

                            return (
                                <motion.div
                                    key={`${label}-${index}-${card.id}`}
                                    layout
                                    initial={{ opacity: 0, y: 16, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.92 }}
                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                    className={`shrink-0 ${sideways ? "flex items-center justify-center" : ""}`}
                                >
                                    <CardFace card={card} large sideways={sideways} />
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center text-sm font-semibold text-rose-50">
                    {totalLabel ?? ""}
                </div>
            </div>
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
    variant?: "default" | "bet" | "success" | "danger";
}) {
    const base =
        "min-w-[120px] rounded-2xl border px-4 py-2.5 text-sm font-extrabold shadow-xl transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45";
    const styles =
        variant === "bet"
            ? "border-amber-200/80 bg-[linear-gradient(180deg,_#fcd34d,_#f59e0b)] text-slate-950 hover:brightness-105"
            : variant === "success"
                ? "border-emerald-200/80 bg-[linear-gradient(180deg,_#4ade80,_#16a34a)] text-slate-950 hover:brightness-105"
                : variant === "danger"
                    ? "border-red-300/80 bg-[linear-gradient(180deg,_#ef4444,_#b91c1c)] text-white hover:brightness-105"
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
            className="rounded-full border border-rose-200/80 bg-[linear-gradient(180deg,_#fb7185,_#be123c)] px-8 py-3 text-sm font-extrabold tracking-wide text-white shadow-[0_14px_34px_rgba(0,0,0,0.38)] transition disabled:cursor-not-allowed disabled:opacity-45 sm:text-base"
        >
            Deal
        </motion.button>
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
            <div className="mb-3 text-center text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-200 sm:text-[12px] sm:tracking-[0.22em]">
                {title}
            </div>
            {children}
        </div>
    );
}

function BetBadge({ amount }: { amount: number }) {
    if (amount <= 0) return null;

    return (
        <motion.div
            initial={{ scale: 0.82, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute right-1.5 top-1.5 flex min-h-6 min-w-6 items-center justify-center rounded-full border border-amber-200/70 bg-[linear-gradient(180deg,_#fde68a,_#f59e0b)] px-1.5 text-[10px] font-extrabold text-slate-950 shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
        >
            {amount}
        </motion.div>
    );
}

function BaccaratBetSpot({
    label,
    sublabel,
    amount,
    onClick,
    onContextMenu,
    className,
    labelClassName = "",
    sublabelClassName = "",
}: {
    label: string;
    sublabel?: string;
    amount: number;
    onClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    className: string;
    labelClassName?: string;
    sublabelClassName?: string;
}) {
    return (
        <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={`relative overflow-hidden rounded-[1.25rem] border shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition hover:brightness-110 active:translate-y-[1px] ${className}`}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
            <div className="relative flex h-full flex-col items-center justify-center px-3 py-3 text-center">
                <div className={`text-[11px] font-extrabold uppercase tracking-[0.22em] sm:text-[12px] ${labelClassName}`}>
                    {label}
                </div>
                {sublabel ? (
                    <div className={`mt-1 text-[10px] font-semibold sm:text-[11px] ${sublabelClassName}`}>{sublabel}</div>
                ) : null}
            </div>
            <BetBadge amount={amount} />
        </button>
    );
}

function ChipButton({
    value,
    selected,
    onClick,
    disabled,
}: {
    value: number;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`rounded-full border px-3 py-1.5 text-xs font-extrabold shadow-md transition disabled:cursor-not-allowed disabled:opacity-45 sm:px-3.5 sm:py-2 sm:text-sm ${selected
                ? "border-amber-200/80 bg-[linear-gradient(180deg,_#fcd34d,_#f59e0b)] text-slate-950"
                : "border-white/15 bg-black/35 text-white hover:bg-white/10"
                }`}
        >
            {formatMoney(value)}
        </button>
    );
}

function BigRoadBoard({ history }: { history: HandHistoryEntry[] }) {
    const cells = useMemo(() => buildBigRoad(history), [history]);
    const rowCount = 6;
    const maxCol = cells.length ? Math.max(...cells.map((cell) => cell.col)) : 0;
    const visibleCols = Math.max(28, maxCol + 1);
    const startCol = Math.max(0, visibleCols - 28);
    const displayedCells = cells.filter((cell) => cell.col >= startCol);

    return (
        <div className="rounded-[1.35rem] border border-amber-200/20 bg-[linear-gradient(180deg,_rgba(0,0,0,0.2),_rgba(0,0,0,0.32))] p-3 shadow-[inset_0_0_40px_rgba(255,255,255,0.03)] sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2">
                    <SectionLabel>Shoe History</SectionLabel>
                    <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-bold text-rose-50/90">
                        Big Road
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-rose-50/90">
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-sky-300" />
                        Player
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-rose-50/90">
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-rose-300" />
                        Banker
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-rose-50/90">
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400/90 px-1 text-[9px] font-extrabold text-slate-950">
                            T
                        </span>
                        Tie mark
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-rose-50/90">
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-300 px-1 text-[9px] font-extrabold text-slate-950">
                            N
                        </span>
                        Natural
                    </div>
                </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-[1rem] border border-amber-200/20 bg-[#f6f2ea] p-2 shadow-[inset_0_0_24px_rgba(0,0,0,0.08)]">
                <div
                    className="grid gap-[1px] rounded-[0.7rem] bg-[#cbb98e]/70 p-[1px]"
                    style={{
                        gridTemplateColumns: `repeat(${Math.max(28, maxCol - startCol + 1)}, minmax(22px, 22px))`,
                        gridTemplateRows: `repeat(${rowCount}, minmax(22px, 22px))`,
                        width: "max-content",
                    }}
                >
                    {Array.from({ length: rowCount * Math.max(28, maxCol - startCol + 1) }).map((_, index) => {
                        const row = Math.floor(index / Math.max(28, maxCol - startCol + 1));
                        const col = index % Math.max(28, maxCol - startCol + 1);
                        const cell = displayedCells.find((item) => item.row === row && item.col - startCol === col);

                        return (
                            <div
                                key={`${row}-${col}`}
                                className="relative flex h-[22px] w-[22px] items-center justify-center bg-[#faf7f1]"
                            >
                                {cell ? (
                                    <>
                                        {cell.winner === "player" && (
                                            <div className="h-[16px] w-[16px] rounded-full border-[2.5px] border-sky-500 bg-transparent" />
                                        )}

                                        {cell.winner === "banker" && (
                                            <div className="h-[16px] w-[16px] rounded-full border-[2.5px] border-rose-500 bg-transparent" />
                                        )}

                                        {cell.winner === "tie" && (
                                            <div className="h-[16px] w-[16px] rounded-full border-[2.5px] border-emerald-500 bg-transparent" />
                                        )}

                                        {cell.tieCount > 0 && (
                                            <div className="absolute -right-[2px] -top-[2px] flex min-h-[11px] min-w-[11px] items-center justify-center rounded-full bg-emerald-500 px-[2px] text-[8px] font-extrabold leading-none text-white shadow">
                                                {cell.tieCount}
                                            </div>
                                        )}

                                        {cell.natural && cell.winner !== "tie" && (
                                            <div className="absolute -left-[2px] -top-[2px] flex h-[11px] w-[11px] items-center justify-center rounded-full bg-amber-300 text-[7px] font-extrabold text-slate-900 shadow">
                                                N
                                            </div>
                                        )}

                                        {cell.pandaHit && (
                                            <div className="absolute -bottom-[3px] left-[2px] rounded bg-emerald-500 px-[2px] text-[7px] font-extrabold leading-none text-white shadow">
                                                P8
                                            </div>
                                        )}

                                        {cell.dragonHit && (
                                            <div className="absolute -bottom-[3px] right-[2px] rounded bg-fuchsia-600 px-[2px] text-[7px] font-extrabold leading-none text-white shadow">
                                                D7
                                            </div>
                                        )}
                                    </>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_1fr]">
                <div className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-rose-200">
                        How to Read It
                    </div>
                    <div className="mt-2 space-y-1.5 text-sm text-rose-50/90">
                        <div>• Blue circles are Player wins. Red circles are Banker wins.</div>
                        <div>• A streak keeps moving downward in the same column.</div>
                        <div>• When the winner changes, the next result starts a new column to the right.</div>
                        <div>• Green number badges mark ties on that result.</div>
                        <div>• Gold N means the hand ended as a natural 8 or 9.</div>
                        <div>• P8 and D7 mark Panda 8 and Dragon 7 hits.</div>
                    </div>
                </div>

                <div className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-rose-200">
                        Shoe Notes
                    </div>
                    <div className="mt-2 space-y-1.5 text-sm text-rose-50/90">
                        <div>• The board tracks this shoe only.</div>
                        <div>• When the shoe shuffles, the road resets like a new table card.</div>
                        <div>• It is purely informational and does not affect card outcomes.</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ThirdCardRulesCard() {
    return (
        <InfoCard title="Third-Card Rules">
            <div className="space-y-3 text-sm text-rose-50/90">
                {/* PLAYER */}
                <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-sky-200">
                        Player
                    </div>
                    <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                        <div className="grid grid-cols-2 bg-white/5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-rose-200">
                            <div className="px-3 py-2">Total</div>
                            <div className="px-3 py-2">Action</div>
                        </div>
                        <div className="grid grid-cols-2 border-t border-white/10">
                            <div className="px-3 py-2">0-5</div>
                            <div className="px-3 py-2 font-semibold text-white">Draw</div>
                        </div>
                        <div className="grid grid-cols-2 border-t border-white/10 bg-white/5">
                            <div className="px-3 py-2">6-7</div>
                            <div className="px-3 py-2 font-semibold text-white">Stand</div>
                        </div>
                        <div className="grid grid-cols-2 border-t border-white/10">
                            <div className="px-3 py-2">8-9</div>
                            <div className="px-3 py-2 font-semibold text-white">Natural</div>
                        </div>
                    </div>
                </div>

                {/* BANKER */}
                <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-200">
                        Banker
                    </div>
                    <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                        <div className="grid grid-cols-[1fr_1.3fr] bg-white/5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-rose-200">
                            <div className="px-3 py-2">Total</div>
                            <div className="px-3 py-2">Action</div>
                        </div>

                        <div className="grid grid-cols-[1fr_1.3fr] border-t border-white/10">
                            <div className="px-3 py-2">0-2</div>
                            <div className="px-3 py-2 font-semibold text-white">Always draw</div>
                        </div>

                        <div className="grid grid-cols-[1fr_1.3fr] border-t border-white/10 bg-white/5">
                            <div className="px-3 py-2">3</div>
                            <div className="px-3 py-2 font-semibold text-white">
                                Draw unless Player 3rd = 8
                            </div>
                        </div>

                        <div className="grid grid-cols-[1fr_1.3fr] border-t border-white/10">
                            <div className="px-3 py-2">4</div>
                            <div className="px-3 py-2 font-semibold text-white">
                                Draw if Player 3rd = 2-7
                            </div>
                        </div>

                        <div className="grid grid-cols-[1fr_1.3fr] border-t border-white/10 bg-white/5">
                            <div className="px-3 py-2">5</div>
                            <div className="px-3 py-2 font-semibold text-white">
                                Draw if Player 3rd = 4-7
                            </div>
                        </div>

                        <div className="grid grid-cols-[1fr_1.3fr] border-t border-white/10">
                            <div className="px-3 py-2">6</div>
                            <div className="px-3 py-2 font-semibold text-white">
                                Draw if Player 3rd = 6-7
                            </div>
                        </div>

                        <div className="grid grid-cols-[1fr_1.3fr] border-t border-white/10 bg-white/5">
                            <div className="px-3 py-2">7</div>
                            <div className="px-3 py-2 font-semibold text-white">Stand</div>
                        </div>

                        <div className="grid grid-cols-[1fr_1.3fr] border-t border-white/10">
                            <div className="px-3 py-2">8-9</div>
                            <div className="px-3 py-2 font-semibold text-white">Natural</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-50/90">
                    If Player stands (no 3rd card), Banker draws on 0-5 and stands on 6-7.
                </div>
            </div>
        </InfoCard>
    );
}

export default function BaccaratTable({ bankroll, setBankroll }: Props) {
    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [bankerCards, setBankerCards] = useState<Card[]>([]);
    const [roadHistory, setRoadHistory] = useState<HandHistoryEntry[]>([]);
    const [playerBet, setPlayerBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        const raw = window.localStorage.getItem(PLAYER_BET_STORAGE_KEY);
        return sanitizeBet(raw ? Number(raw) : 0);
    });
    const [bankerBet, setBankerBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        const raw = window.localStorage.getItem(BANKER_BET_STORAGE_KEY);
        return sanitizeBet(raw ? Number(raw) : 0);
    });
    const [tieBet, setTieBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        const raw = window.localStorage.getItem(TIE_BET_STORAGE_KEY);
        return sanitizeBet(raw ? Number(raw) : 0);
    });
    const [pandaBet, setPandaBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        const raw = window.localStorage.getItem(PANDA_BET_STORAGE_KEY);
        return sanitizeBet(raw ? Number(raw) : 0);
    });
    const [dragonBet, setDragonBet] = useState<number>(() => {
        if (typeof window === "undefined") return 0;
        const raw = window.localStorage.getItem(DRAGON_BET_STORAGE_KEY);
        return sanitizeBet(raw ? Number(raw) : 0);
    });
    const [selectedChip, setSelectedChip] = useState<number>(() => {
        if (typeof window === "undefined") return 25;
        const raw = window.localStorage.getItem(BACCARAT_SELECTED_CHIP_STORAGE_KEY);
        const parsed = raw ? Number(raw) : 25;
        return CHIP_VALUES.includes(parsed) ? parsed : 25;
    });
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Select a chip, click the table to place baccarat bets, then press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [winner, setWinner] = useState<Winner | null>(null);
    const [resultDetail, setResultDetail] = useState("");
    const [lastPayout, setLastPayout] = useState(0);

    useEffect(() => {
        window.localStorage.setItem(PLAYER_BET_STORAGE_KEY, String(sanitizeBet(playerBet)));
    }, [playerBet]);

    useEffect(() => {
        window.localStorage.setItem(BANKER_BET_STORAGE_KEY, String(sanitizeBet(bankerBet)));
    }, [bankerBet]);

    useEffect(() => {
        window.localStorage.setItem(TIE_BET_STORAGE_KEY, String(sanitizeBet(tieBet)));
    }, [tieBet]);

    useEffect(() => {
        window.localStorage.setItem(PANDA_BET_STORAGE_KEY, String(sanitizeBet(pandaBet)));
    }, [pandaBet]);

    useEffect(() => {
        window.localStorage.setItem(DRAGON_BET_STORAGE_KEY, String(sanitizeBet(dragonBet)));
    }, [dragonBet]);

    useEffect(() => {
        window.localStorage.setItem(BACCARAT_SELECTED_CHIP_STORAGE_KEY, String(selectedChip));
    }, [selectedChip]);

    const totalBet =
        sanitizeBet(playerBet) +
        sanitizeBet(bankerBet) +
        sanitizeBet(tieBet) +
        sanitizeBet(pandaBet) +
        sanitizeBet(dragonBet);

    const playerTotal = useMemo(() => baccaratTotal(playerCards), [playerCards]);
    const bankerTotal = useMemo(() => baccaratTotal(bankerCards), [bankerCards]);

    const cardsUsed = SHOE_SIZE - deck.length;
    const penetrationPct = Math.min(100, Math.round((cardsUsed / SHOE_SIZE) * 100));

    const canBet = stage === "betting" && !isShuffling;

    const performShuffleIfNeeded = async (shoe: Card[]) => {
        if (!shouldShuffle(shoe)) {
            return shoe;
        }

        setIsShuffling(true);
        setMessage("Shuffling 8-deck shoe...");
        await wait(SHUFFLE_DELAY_MS);

        const freshShoe = createShoe();
        setDeck(freshShoe);
        setRoadHistory([]);
        setIsShuffling(false);

        return freshShoe;
    };

    const drawOne = (shoe: Card[]) => {
        const nextDeck = [...shoe];
        const card = nextDeck.shift();
        return { card, nextDeck };
    };

    const getBetValue = (spotId: BetSpotId) => {
        if (spotId === "player") return playerBet;
        if (spotId === "banker") return bankerBet;
        if (spotId === "tie") return tieBet;
        if (spotId === "panda") return pandaBet;
        return dragonBet;
    };

    const setBetValue = (spotId: BetSpotId, value: number) => {
        const next = sanitizeBet(value);

        if (spotId === "player") setPlayerBet(next);
        else if (spotId === "banker") setBankerBet(next);
        else if (spotId === "tie") setTieBet(next);
        else if (spotId === "panda") setPandaBet(next);
        else setDragonBet(next);
    };

    const getBetLabel = (spotId: BetSpotId) => {
        if (spotId === "player") return "Player";
        if (spotId === "banker") return "Banker";
        if (spotId === "tie") return "Tie";
        if (spotId === "panda") return "Panda 8";
        return "Dragon 7";
    };

    const placeBet = (spotId: BetSpotId) => {
        if (!canBet) return;
        setBetValue(spotId, getBetValue(spotId) + selectedChip);
        setMessage(`Added ${formatMoney(selectedChip)} to ${getBetLabel(spotId)}.`);
    };

    const removeBet = (spotId: BetSpotId) => {
        if (!canBet) return;
        setBetValue(spotId, Math.max(0, getBetValue(spotId) - selectedChip));
        setMessage(`Removed up to ${formatMoney(selectedChip)} from ${getBetLabel(spotId)}.`);
    };

    const clearBets = () => {
        if (!canBet) return;
        setPlayerBet(0);
        setBankerBet(0);
        setTieBet(0);
        setPandaBet(0);
        setDragonBet(0);
        setMessage("All baccarat bets cleared.");
    };

    const deal = async () => {
        if (isShuffling) return;

        const nextPlayerBet = sanitizeBet(playerBet);
        const nextBankerBet = sanitizeBet(bankerBet);
        const nextTieBet = sanitizeBet(tieBet);
        const nextPandaBet = sanitizeBet(pandaBet);
        const nextDragonBet = sanitizeBet(dragonBet);
        const wagerTotal = nextPlayerBet + nextBankerBet + nextTieBet + nextPandaBet + nextDragonBet;

        if (wagerTotal <= 0) {
            setMessage("You need at least one wager to deal.");
            return;
        }

        if (bankroll < wagerTotal) {
            setMessage("Not enough bankroll for those wagers.");
            return;
        }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);

        if (nextDeck.length < 6) {
            nextDeck = await performShuffleIfNeeded([]);
        }

        setBankroll((b) => b - wagerTotal);
        setStage("dealing");
        setWinner(null);
        setResultDetail("");
        setLastPayout(0);
        setPlayerCards([]);
        setBankerCards([]);

        let player: Card[] = [];
        let banker: Card[] = [];

        setMessage("Dealing first card to Player...");
        let draw = drawOne(nextDeck);
        if (!draw.card) return;
        player = [draw.card];
        nextDeck = draw.nextDeck;
        setPlayerCards([...player]);
        setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing first card to Banker...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        banker = [draw.card];
        nextDeck = draw.nextDeck;
        setBankerCards([...banker]);
        setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing second card to Player...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        player = [...player, draw.card];
        nextDeck = draw.nextDeck;
        setPlayerCards([...player]);
        setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing second card to Banker...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        banker = [...banker, draw.card];
        nextDeck = draw.nextDeck;
        setBankerCards([...banker]);
        setDeck(nextDeck);
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
                    setPlayerCards([...player]);
                    setDeck(nextDeck);
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
                        banker = [...banker, draw.card];
                        nextDeck = draw.nextDeck;
                        setBankerCards([...banker]);
                        setDeck(nextDeck);
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
                        banker = [...banker, draw.card];
                        nextDeck = draw.nextDeck;
                        setBankerCards([...banker]);
                        setDeck(nextDeck);
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
        const bankerPush = isNoCommissionBankerPush(banker, finalWinner);
        const pandaHit = isPanda8(player, banker);
        const dragonHit = isDragon7(player, banker);

        let payout = 0;
        const detailLines: string[] = [];

        if (nextPlayerBet > 0) {
            if (finalWinner === "player") {
                payout += nextPlayerBet * 2;
                detailLines.push(`Player bet wins ${formatMoney(nextPlayerBet)}`);
            } else if (finalWinner === "tie") {
                payout += nextPlayerBet;
                detailLines.push("Player bet pushes");
            } else {
                detailLines.push("Player bet loses");
            }
        }

        if (nextBankerBet > 0) {
            if (finalWinner === "banker") {
                if (bankerPush) {
                    payout += nextBankerBet;
                    detailLines.push("Banker 3-card 7 pushes");
                } else {
                    payout += nextBankerBet * 2;
                    detailLines.push(`Banker bet wins ${formatMoney(nextBankerBet)}`);
                }
            } else if (finalWinner === "tie") {
                payout += nextBankerBet;
                detailLines.push("Banker bet pushes");
            } else {
                detailLines.push("Banker bet loses");
            }
        }

        if (nextTieBet > 0) {
            if (finalWinner === "tie") {
                payout += nextTieBet * 9;
                detailLines.push(`Tie bet wins ${formatMoney(nextTieBet * 8)}`);
            } else {
                detailLines.push("Tie bet loses");
            }
        }

        if (nextPandaBet > 0) {
            if (pandaHit) {
                payout += nextPandaBet * 26;
                detailLines.push(`Panda 8 wins ${formatMoney(nextPandaBet * 25)}`);
            } else {
                detailLines.push("Panda 8 loses");
            }
        }

        if (nextDragonBet > 0) {
            if (dragonHit) {
                payout += nextDragonBet * 41;
                detailLines.push(`Dragon 7 wins ${formatMoney(nextDragonBet * 40)}`);
            } else {
                detailLines.push("Dragon 7 loses");
            }
        }

        setBankroll((b) => b + payout);
        setDeck(nextDeck);
        setWinner(finalWinner);
        setLastPayout(payout);
        setResultDetail(detailLines.join(" • "));
        setStage("done");
        setRoadHistory((prev) => [
            ...prev,
            {
                winner: finalWinner,
                natural: handIsNatural,
                pandaHit,
                dragonHit,
            },
        ]);

        if (dragonHit) {
            setMessage("Banker wins with a 3-card 7. Dragon 7 hits. Banker bets push.");
        } else if (pandaHit) {
            setMessage("Player wins with a 3-card 8. Panda 8 hits.");
        } else if (finalWinner === "tie") {
            setMessage(`Tie ${baccaratTotal(player)}-${baccaratTotal(banker)}.`);
        } else {
            setMessage(finalWinner === "player" ? "Player wins." : "Banker wins.");
        }
    };

    const nextRound = () => {
        setPlayerCards([]);
        setBankerCards([]);
        setWinner(null);
        setResultDetail("");
        setLastPayout(0);
        setStage("betting");
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle the shoe." : "Select a chip, click the table to place baccarat bets, then press Deal.");
    };

    return (
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_#7f1d1d,_#5f0f17_28%,_#2a0710_62%,_#120205_100%)] text-white">
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                    <div className="rounded-[1.6rem] border border-rose-300/25 bg-black/65 px-10 py-8 text-center shadow-[0_25px_80px_rgba(0,0,0,0.45)] sm:px-12 sm:py-9">
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-rose-200 sm:text-[12px]">
                            Baccarat
                        </div>
                        <div className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Shuffling Shoe</div>
                        <div className="mt-3 text-sm text-rose-100/85">Please wait…</div>
                    </div>
                </div>
            )}

            <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1700px] flex-col gap-3 px-2 py-2 sm:px-3 sm:py-3">
                <div className="rounded-[1.35rem] border border-rose-300/15 bg-black/25 p-3 shadow-2xl backdrop-blur sm:rounded-[1.7rem] sm:p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-rose-200/90 sm:text-[12px] sm:tracking-[0.3em]">
                                Casino Table
                            </div>
                            <h2 className="mt-1 text-2xl font-extrabold tracking-[0.02em] text-rose-50 sm:text-4xl md:text-5xl">
                                No Commission Baccarat
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <StatPill label="Bankroll" value={formatMoney(bankroll)} accent="gold" />
                            <StatPill label="Chip" value={formatMoney(selectedChip)} />
                            <StatPill label="Stage" value={<span className="capitalize">{stage}</span>} />
                            <StatPill label="Winner" value={winner ? winner.toUpperCase() : "—"} accent="red" />
                            <StatPill label="Cards Left" value={deck.length} />
                        </div>
                    </div>
                </div>

                <div className="rounded-[1.45rem] border border-white/10 bg-black/20 p-2.5 shadow-2xl backdrop-blur sm:rounded-[1.8rem] sm:p-3">
                    <div className="rounded-[1.2rem] border border-rose-300/20 bg-[linear-gradient(180deg,_rgba(0,0,0,0.22),_rgba(0,0,0,0.12))] px-4 py-3 text-center shadow-lg sm:rounded-[1.45rem] sm:px-5 sm:py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-200 sm:text-[11px] sm:tracking-[0.24em]">
                            Table Message
                        </div>
                        <div className="mt-2 text-base font-bold text-rose-50 sm:text-lg md:text-xl">{message}</div>
                        {resultDetail ? <div className="mt-2 text-sm text-rose-100/85 sm:text-base">{resultDetail}</div> : null}
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-[265px_minmax(0,1fr)_300px]">
                        <div className="order-3 space-y-3 xl:order-1">


                            {/* ✅ NEW CARD HERE */}
                            <ThirdCardRulesCard />


                        </div>

                        <div className="order-1 min-w-0 rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(244,63,94,0.16),_rgba(127,29,29,0.14)_40%,_rgba(0,0,0,0.22)_82%)] p-2.5 sm:rounded-[1.6rem] sm:p-4 xl:order-2">
                            <div className="flex h-full flex-col gap-3 sm:gap-4">
                                <div className="overflow-hidden rounded-[1rem] border border-white/10 bg-black/10 px-2 py-3 sm:rounded-[1.25rem] sm:px-3 sm:py-4">
                                    <div className="mb-3 flex items-center justify-center">
                                        <SectionLabel>Baccarat</SectionLabel>
                                    </div>

                                    <div className="rounded-[1.6rem] border border-amber-200/20 bg-[radial-gradient(circle_at_top,_rgba(150,18,45,0.36),_rgba(96,8,25,0.92)_68%)] p-3 shadow-[inset_0_0_40px_rgba(255,255,255,0.04)] sm:p-4">
                                        <div className="rounded-[1.25rem] border border-white/10 bg-black/18 p-3 sm:p-4">
                                            <div className="grid gap-4 lg:grid-cols-2">
                                                <CardLane
                                                    label="Player"
                                                    cards={playerCards}
                                                    accent="player"
                                                    outcome={
                                                        winner === "player"
                                                            ? "win"
                                                            : winner === "tie"
                                                                ? "tie"
                                                                : winner === "banker"
                                                                    ? "lose"
                                                                    : "neutral"
                                                    }
                                                    totalLabel={playerCards.length ? `Total: ${playerTotal}` : "Waiting"}
                                                />

                                                <CardLane
                                                    label="Banker"
                                                    cards={bankerCards}
                                                    accent="banker"
                                                    outcome={
                                                        winner === "banker"
                                                            ? "win"
                                                            : winner === "tie"
                                                                ? "tie"
                                                                : winner === "player"
                                                                    ? "lose"
                                                                    : "neutral"
                                                    }
                                                    totalLabel={bankerCards.length ? `Total: ${bankerTotal}` : "Waiting"}
                                                />
                                            </div>
                                        </div>

                                        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/25 p-3 sm:p-4">
                                            <div className="flex flex-col gap-3">
                                                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {CHIP_VALUES.map((chip) => (
                                                            <ChipButton
                                                                key={chip}
                                                                value={chip}
                                                                selected={chip === selectedChip}
                                                                onClick={() => setSelectedChip(chip)}
                                                                disabled={!canBet}
                                                            />
                                                        ))}
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                                                        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-rose-50">
                                                            On Table: {formatMoney(totalBet)}
                                                        </div>
                                                        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-rose-50">
                                                            Last Payout: {formatMoney(lastPayout)}
                                                        </div>
                                                        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-rose-50">
                                                            Shoe Used: {penetrationPct}%
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid gap-2 md:grid-cols-[1fr_160px_1fr]">
                                                    <BaccaratBetSpot
                                                        label="Player"
                                                        sublabel="1 to 1"
                                                        amount={playerBet}
                                                        onClick={() => placeBet("player")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("player");
                                                        }}
                                                        className={`min-h-[78px] ${winner === "player"
                                                            ? "border-sky-300/55 bg-sky-400/15 ring-2 ring-sky-300/20"
                                                            : "border-sky-300/30 bg-sky-950/45"
                                                            }`}
                                                        labelClassName="text-sky-100"
                                                        sublabelClassName="text-sky-50/80"
                                                    />

                                                    <BaccaratBetSpot
                                                        label="Tie"
                                                        sublabel="8 to 1"
                                                        amount={tieBet}
                                                        onClick={() => placeBet("tie")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("tie");
                                                        }}
                                                        className={`min-h-[78px] ${winner === "tie"
                                                            ? "border-amber-300/55 bg-amber-300/15 ring-2 ring-amber-300/20"
                                                            : "border-amber-300/30 bg-amber-950/35"
                                                            }`}
                                                        labelClassName="text-amber-100"
                                                        sublabelClassName="text-amber-50/80"
                                                    />

                                                    <BaccaratBetSpot
                                                        label="Banker"
                                                        sublabel="1 to 1"
                                                        amount={bankerBet}
                                                        onClick={() => placeBet("banker")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("banker");
                                                        }}
                                                        className={`min-h-[78px] ${winner === "banker"
                                                            ? "border-rose-300/55 bg-rose-400/15 ring-2 ring-rose-300/20"
                                                            : "border-rose-300/30 bg-rose-950/45"
                                                            }`}
                                                        labelClassName="text-rose-100"
                                                        sublabelClassName="text-rose-50/80"
                                                    />
                                                </div>

                                                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                                                    <BaccaratBetSpot
                                                        label="Panda 8"
                                                        sublabel="25 to 1"
                                                        amount={pandaBet}
                                                        onClick={() => placeBet("panda")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("panda");
                                                        }}
                                                        className={`min-h-[70px] ${isPanda8(playerCards, bankerCards)
                                                            ? "border-emerald-300/55 bg-emerald-400/15 ring-2 ring-emerald-300/20"
                                                            : "border-emerald-300/30 bg-emerald-950/35"
                                                            }`}
                                                        labelClassName="text-emerald-100"
                                                        sublabelClassName="text-emerald-50/80"
                                                    />

                                                    <BaccaratBetSpot
                                                        label="Dragon 7"
                                                        sublabel="40 to 1"
                                                        amount={dragonBet}
                                                        onClick={() => placeBet("dragon")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("dragon");
                                                        }}
                                                        className={`min-h-[70px] ${isDragon7(playerCards, bankerCards)
                                                            ? "border-fuchsia-300/55 bg-fuchsia-400/15 ring-2 ring-fuchsia-300/20"
                                                            : "border-fuchsia-300/30 bg-fuchsia-950/35"
                                                            }`}
                                                        labelClassName="text-fuchsia-100"
                                                        sublabelClassName="text-fuchsia-50/80"
                                                    />

                                                    <div className="flex flex-wrap items-center justify-end gap-2 md:justify-center">
                                                        <AnimatePresence mode="wait" initial={false}>
                                                            {stage === "betting" && (
                                                                <motion.div
                                                                    key="bet-actions"
                                                                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                                                    className="flex flex-wrap items-center gap-2"
                                                                >
                                                                    <DealButton onClick={deal} disabled={isShuffling} />
                                                                    <ActionButton onClick={clearBets} variant="danger" disabled={!canBet || totalBet <= 0}>
                                                                        Clear
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

                                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-[11px] text-rose-50/90 sm:text-xs">
                                                    Left click adds the selected chip. Right click removes that chip amount.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <BigRoadBoard history={roadHistory} />
                            </div>
                        </div>

                        <div className="order-2 space-y-3 xl:order-3">
                            {/* <InfoCard title="Table Info">
                                <div className="space-y-2 text-sm text-rose-50/90">
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Player total</span>
                                        <span className="font-semibold text-white">{playerCards.length ? playerTotal : "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Banker total</span>
                                        <span className="font-semibold text-white">{bankerCards.length ? bankerTotal : "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Player bet</span>
                                        <span className="font-semibold text-white">{formatMoney(playerBet)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Tie bet</span>
                                        <span className="font-semibold text-white">{formatMoney(tieBet)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Banker bet</span>
                                        <span className="font-semibold text-white">{formatMoney(bankerBet)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Panda 8</span>
                                        <span className="font-semibold text-white">{formatMoney(pandaBet)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Dragon 7</span>
                                        <span className="font-semibold text-white">{formatMoney(dragonBet)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Road entries</span>
                                        <span className="font-semibold text-white">{roadHistory.length}</span>
                                    </div>
                                </div>
                            </InfoCard> */}

                            <InfoCard title="Rules">
                                <div className="space-y-2 text-sm text-rose-50/90">
                                    <div>• Player wins pay 1 to 1.</div>
                                    <div>• Banker wins pay 1 to 1.</div>
                                    <div>• Banker 3-card 7 pushes instead of paying.</div>
                                    <div>• Tie pays 8 to 1.</div>
                                    <div>• Standard baccarat third-card rules are used.</div>
                                    <div>• Right click table spots to remove chips.</div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Side Bets">
                                <div className="space-y-2 text-sm text-rose-50/90">
                                    <div>• Panda 8: player wins with a 3-card 8, pays 25 to 1.</div>
                                    <div>• Dragon 7: banker wins with a 3-card 7, pays 40 to 1.</div>
                                </div>
                            </InfoCard>

                            <InfoCard title="Payout Guide">
                                <div className="space-y-2 text-sm text-rose-50/90">
                                    <div>• Player: 1 to 1</div>
                                    <div>• Banker: 1 to 1</div>
                                    <div>• Banker 3-card 7: push</div>
                                    <div>• Tie: 8 to 1</div>
                                    <div>• Panda 8: 25 to 1</div>
                                    <div>• Dragon 7: 40 to 1</div>
                                </div>
                            </InfoCard>

                            {/* <InfoCard title="Bankroll Note">
                                <div className="rounded-2xl border border-white/10 bg-rose-950/30 px-4 py-3 text-center text-xs font-medium text-rose-50/95 sm:text-sm">
                                    One shared bankroll is used across all casino games.
                                </div>
                            </InfoCard> */}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}