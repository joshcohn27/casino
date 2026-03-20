import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

type RouletteNumber = number | "0" | "00";
type BetType =
    | "straight"
    | "split"
    | "corner"
    | "red"
    | "black"
    | "even"
    | "odd"
    | "low"
    | "high"
    | "dozen1"
    | "dozen2"
    | "dozen3"
    | "column1"
    | "column2"
    | "column3";

type BetSpot = {
    id: string;
    label: string;
    type: BetType;
    numbers: RouletteNumber[];
    payout: number;
};

type SettledBet = {
    id: string;
    label: string;
    amount: number;
    won: boolean;
    payout: number;
    returned: number;
};

type SpinResult = {
    result: RouletteNumber;
    color: "red" | "black" | "green";
    totalBet: number;
    totalReturn: number;
    net: number;
    winningBets: SettledBet[];
    losingBets: SettledBet[];
};

const RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18,
    19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const BLACK_NUMBERS = new Set([
    2, 4, 6, 8, 10, 11, 13, 15, 17,
    20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

const AMERICAN_WHEEL_ORDER: RouletteNumber[] = [
    "0",
    28,
    9,
    26,
    30,
    11,
    7,
    20,
    32,
    17,
    5,
    22,
    34,
    15,
    3,
    24,
    36,
    13,
    1,
    "00",
    27,
    10,
    25,
    29,
    12,
    8,
    19,
    31,
    18,
    6,
    21,
    33,
    16,
    4,
    23,
    35,
    14,
    2,
];

const CHIP_VALUES = [1, 5, 25, 100];
const MIN_CHIP = 1;

const NUMBER_ROWS: number[][] = [
    [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
    [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

const CELL_W = 64;
const CELL_H = 56;
const GRID_W = CELL_W * 12;
const GRID_H = CELL_H * 3;

const WHEEL_SLICE = 360 / AMERICAN_WHEEL_ORDER.length;
const BALL_TRACK_RADIUS = 128;
const BALL_VISUAL_OFFSET_DEG = 2.5;

const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);

function getNumberColor(n: RouletteNumber): "red" | "black" | "green" {
    if (n === "0" || n === "00") return "green";
    return RED_NUMBERS.has(n) ? "red" : "black";
}

function makeComboId(prefix: string, values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    return `${prefix}-${sorted.join("-")}`;
}

function makeComboLabel(values: number[]) {
    return [...values].sort((a, b) => a - b).join("/");
}

function normalizeAngle(angle: number) {
    return ((angle % 360) + 360) % 360;
}

function getPocketCenterAngle(index: number) {
    return index * WHEEL_SLICE + WHEEL_SLICE / 2;
}

function getWheelStopRotation(currentRotation: number, winningIndex: number) {
    const currentNorm = normalizeAngle(currentRotation);
    const targetNorm = normalizeAngle(360 - getPocketCenterAngle(winningIndex));
    const delta = normalizeAngle(targetNorm - currentNorm);
    return currentRotation + 360 * 6 + delta;
}

function getBallStopRotation(currentRotation: number) {
    const currentNorm = normalizeAngle(currentRotation);
    const targetNorm = normalizeAngle(BALL_VISUAL_OFFSET_DEG);
    const delta = normalizeAngle(targetNorm - currentNorm);
    return currentRotation - 360 * 9 + delta;
}

function getAllBoardSpots(): BetSpot[] {
    const spots: BetSpot[] = [];

    spots.push({
        id: "straight-0",
        label: "0",
        type: "straight",
        numbers: ["0"],
        payout: 35,
    });

    spots.push({
        id: "straight-00",
        label: "00",
        type: "straight",
        numbers: ["00"],
        payout: 35,
    });

    for (let n = 1; n <= 36; n++) {
        spots.push({
            id: `straight-${n}`,
            label: String(n),
            type: "straight",
            numbers: [n],
            payout: 35,
        });
    }

    const seenSplits = new Set<string>();
    const seenCorners = new Set<string>();

    for (let row = 0; row < NUMBER_ROWS.length; row++) {
        for (let col = 0; col < NUMBER_ROWS[row].length; col++) {
            const current = NUMBER_ROWS[row][col];

            if (col < NUMBER_ROWS[row].length - 1) {
                const right = NUMBER_ROWS[row][col + 1];
                const id = makeComboId("split", [current, right]);
                if (!seenSplits.has(id)) {
                    seenSplits.add(id);
                    spots.push({
                        id,
                        label: makeComboLabel([current, right]),
                        type: "split",
                        numbers: [current, right],
                        payout: 17,
                    });
                }
            }

            if (row < NUMBER_ROWS.length - 1) {
                const below = NUMBER_ROWS[row + 1][col];
                const id = makeComboId("split", [current, below]);
                if (!seenSplits.has(id)) {
                    seenSplits.add(id);
                    spots.push({
                        id,
                        label: makeComboLabel([current, below]),
                        type: "split",
                        numbers: [current, below],
                        payout: 17,
                    });
                }
            }

            if (row < NUMBER_ROWS.length - 1 && col < NUMBER_ROWS[row].length - 1) {
                const a = NUMBER_ROWS[row][col];
                const b = NUMBER_ROWS[row][col + 1];
                const c = NUMBER_ROWS[row + 1][col];
                const d = NUMBER_ROWS[row + 1][col + 1];
                const values = [a, b, c, d];
                const id = makeComboId("corner", values);
                if (!seenCorners.has(id)) {
                    seenCorners.add(id);
                    spots.push({
                        id,
                        label: makeComboLabel(values),
                        type: "corner",
                        numbers: values,
                        payout: 8,
                    });
                }
            }
        }
    }

    spots.push({
        id: "dozen1",
        label: "1st 12",
        type: "dozen1",
        numbers: Array.from({ length: 12 }, (_, i) => i + 1),
        payout: 2,
    });

    spots.push({
        id: "dozen2",
        label: "2nd 12",
        type: "dozen2",
        numbers: Array.from({ length: 12 }, (_, i) => i + 13),
        payout: 2,
    });

    spots.push({
        id: "dozen3",
        label: "3rd 12",
        type: "dozen3",
        numbers: Array.from({ length: 12 }, (_, i) => i + 25),
        payout: 2,
    });

    spots.push({
        id: "column1",
        label: "2 to 1",
        type: "column1",
        numbers: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
        payout: 2,
    });

    spots.push({
        id: "column2",
        label: "2 to 1",
        type: "column2",
        numbers: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
        payout: 2,
    });

    spots.push({
        id: "column3",
        label: "2 to 1",
        type: "column3",
        numbers: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
        payout: 2,
    });

    spots.push({
        id: "low",
        label: "1 to 18",
        type: "low",
        numbers: Array.from({ length: 18 }, (_, i) => i + 1),
        payout: 1,
    });

    spots.push({
        id: "even",
        label: "EVEN",
        type: "even",
        numbers: Array.from({ length: 18 }, (_, i) => (i + 1) * 2),
        payout: 1,
    });

    spots.push({
        id: "red",
        label: "RED",
        type: "red",
        numbers: Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => RED_NUMBERS.has(n)),
        payout: 1,
    });

    spots.push({
        id: "black",
        label: "BLACK",
        type: "black",
        numbers: Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => BLACK_NUMBERS.has(n)),
        payout: 1,
    });

    spots.push({
        id: "odd",
        label: "ODD",
        type: "odd",
        numbers: Array.from({ length: 18 }, (_, i) => i * 2 + 1),
        payout: 1,
    });

    spots.push({
        id: "high",
        label: "19 to 36",
        type: "high",
        numbers: Array.from({ length: 18 }, (_, i) => i + 19),
        payout: 1,
    });

    return spots;
}

const ALL_SPOTS = getAllBoardSpots();
const SPOT_MAP = new Map(ALL_SPOTS.map((spot) => [spot.id, spot]));

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

function ActionButton({
    children,
    onClick,
    disabled,
    variant = "default",
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    variant?: "default" | "bet" | "danger" | "success";
}) {
    const base =
        "min-w-[132px] rounded-2xl border px-4 py-3 text-sm font-extrabold shadow-xl transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[110px] sm:px-5";
    const styles =
        variant === "bet"
            ? "border-amber-200/80 bg-[linear-gradient(180deg,_#fcd34d,_#f59e0b)] text-slate-950 hover:brightness-105"
            : variant === "success"
                ? "border-emerald-200/80 bg-[linear-gradient(180deg,_#4ade80,_#16a34a)] text-slate-950 hover:brightness-105"
                : variant === "danger"
                    ? "border-red-300/70 bg-[linear-gradient(180deg,_#ef4444,_#b91c1c)] text-white hover:brightness-105"
                    : "border-slate-500/80 bg-[linear-gradient(180deg,_#475569,_#334155)] text-white hover:brightness-110";

    return (
        <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
            {children}
        </button>
    );
}

function InfoButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/35 bg-black/25 text-lg font-extrabold text-amber-100 shadow-lg transition hover:bg-amber-300/15 hover:text-amber-50"
            aria-label="Show roulette rules"
            title="Rules"
        >
            i
        </button>
    );
}

function RulesModal({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <button
                    className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
                    onClick={onClose}
                    aria-label="Close rules modal"
                />

                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[820px] overflow-hidden rounded-[1.5rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(7,20,14,0.98),_rgba(3,10,7,0.98))] text-white shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90 sm:text-[11px]">
                                Help
                            </div>
                            <div className="mt-1 text-lg font-extrabold text-amber-50 sm:text-2xl">
                                Roulette Rules
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl font-bold text-white/85 transition hover:bg-white/10"
                            aria-label="Close rules modal"
                        >
                            x
                        </button>
                    </div>

                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-4 text-sm leading-6 text-emerald-50/90 sm:text-[15px]">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    Table Version
                                </div>
                                <div className="space-y-2">
                                    <div>• This table uses American roulette.</div>
                                    <div>• The wheel contains 38 pockets: 1 through 36, plus 0 and 00.</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    How to Bet
                                </div>
                                <div className="space-y-2">
                                    <div>• Pick a chip value.</div>
                                    <div>• Click any number, outside box, split marker, or corner marker to add that chip amount.</div>
                                    <div>• Right click a betting spot to remove one chip of the selected value from that spot.</div>
                                    <div>• Press Spin to resolve all bets at once.</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    Included Bets
                                </div>
                                <div className="space-y-2">
                                    <div>• Straight up numbers pay 35 to 1.</div>
                                    <div>• Splits pay 17 to 1.</div>
                                    <div>• Corners pay 8 to 1.</div>
                                    <div>• Red, Black, Even, Odd, 1-18, and 19-36 pay 1 to 1.</div>
                                    <div>• Dozens and columns pay 2 to 1.</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">
                                    House Rules Here
                                </div>
                                <div className="space-y-2">
                                    <div>• 0 and 00 are green and are not red/black, odd/even, or high/low.</div>
                                    <div>• Straight bets on both 0 and 00 are supported.</div>
                                    <div>• Payouts shown include profit plus return of the original winning wager.</div>
                                    <div>• Multiple winning bets can hit on the same spin.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function ChipSelector({
    selectedChip,
    onSelect,
    disabled,
}: {
    selectedChip: number;
    onSelect: (chip: number) => void;
    disabled?: boolean;
}) {
    return (
        <div className="grid grid-cols-4 gap-2">
            {CHIP_VALUES.map((chip) => {
                const active = chip === selectedChip;
                return (
                    <button
                        key={chip}
                        onClick={() => onSelect(chip)}
                        disabled={disabled}
                        className={`rounded-2xl border px-3 py-3 text-sm font-extrabold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-45 ${active
                            ? "border-amber-200/80 bg-[linear-gradient(180deg,_#fcd34d,_#f59e0b)] text-slate-950"
                            : "border-white/10 bg-black/25 text-white hover:bg-white/10"
                            }`}
                    >
                        {fmt(chip)}
                    </button>
                );
            })}
        </div>
    );
}

function BetBadge({
    amount,
    compact = false,
}: {
    amount: number;
    compact?: boolean;
}) {
    if (amount <= 0) return null;

    return (
        <motion.div
            initial={{ scale: 0.82, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`absolute flex items-center justify-center rounded-full border border-amber-200/70 bg-[linear-gradient(180deg,_#fde68a,_#f59e0b)] font-extrabold text-slate-950 shadow-[0_6px_14px_rgba(0,0,0,0.35)] ${compact
                ? "left-1/2 top-1/2 h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 px-1 text-[9px]"
                : "right-1 top-1 h-6 min-w-6 px-1 text-[10px]"
                }`}
        >
            {amount}
        </motion.div>
    );
}

function BoardSpotButton({
    label,
    amount,
    colorClass,
    onClick,
    onContextMenu,
    tall = false,
}: {
    label: React.ReactNode;
    amount: number;
    colorClass: string;
    onClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    tall?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={`relative flex items-center justify-center rounded-xl border text-sm font-extrabold shadow-lg transition hover:brightness-110 active:translate-y-[1px] ${tall ? "min-h-[88px]" : "min-h-[56px]"} ${colorClass}`}
        >
            <span>{label}</span>
            <BetBadge amount={amount} />
        </button>
    );
}

function GridNumberSpot({
    number,
    amount,
    onClick,
    onContextMenu,
}: {
    number: number;
    amount: number;
    onClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
}) {
    const color = getNumberColor(number);

    return (
        <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={`absolute flex items-center justify-center border text-sm font-extrabold shadow-lg transition hover:brightness-110 active:translate-y-[1px] ${color === "red"
                ? "border-red-300/30 bg-red-800/70 text-red-50"
                : "border-white/10 bg-slate-950/90 text-white"
                }`}
            style={{
                width: CELL_W,
                height: CELL_H,
            }}
        >
            <span>{number}</span>
            <BetBadge amount={amount} />
        </button>
    );
}

function OverlayBetSpot({
    amount,
    onClick,
    onContextMenu,
    className,
    style,
    hint,
}: {
    amount: number;
    onClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    className: string;
    style: React.CSSProperties;
    hint: string;
}) {
    return (
        <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            title={hint}
            className={`absolute z-20 rounded-full border border-amber-200/35 bg-amber-300/10 backdrop-blur-[1px] transition hover:bg-amber-300/18 active:translate-y-[1px] ${className}`}
            style={style}
        >
            <BetBadge amount={amount} compact />
        </button>
    );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
        x: cx + r * Math.cos(angleRad),
        y: cy + r * Math.sin(angleRad),
    };
}

function describeArc(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
    const outerStart = polarToCartesian(cx, cy, rOuter, endAngle);
    const outerEnd = polarToCartesian(cx, cy, rOuter, startAngle);
    const innerStart = polarToCartesian(cx, cy, rInner, startAngle);
    const innerEnd = polarToCartesian(cx, cy, rInner, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerStart.x} ${innerStart.y}`,
        `A ${rInner} ${rInner} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
        "Z",
    ].join(" ");
}

function RouletteWheel({
    result,
    wheelRotation,
    ballRotation,
    spinning,
}: {
    result: RouletteNumber | null;
    wheelRotation: number;
    ballRotation: number;
    spinning: boolean;
}) {
    const cx = 150;
    const cy = 150;
    const outer = 138;
    const inner = 100;
    const numberTextRadius = 119;
    const separatorRadius = 136;

    return (
        <div className="flex flex-col items-center">
            <SectionLabel>Wheel</SectionLabel>

            <div className="relative mt-3 flex h-[320px] w-[320px] items-center justify-center">
                <div className="absolute top-1 z-40 flex flex-col items-center">
                    <div className="h-0 w-0 border-l-[12px] border-r-[12px] border-t-[22px] border-l-transparent border-r-transparent border-t-amber-300 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" />
                    <div className="mt-1 h-2 w-2 rounded-full bg-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                </div>

                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,_rgba(255,231,170,0.2),_rgba(111,53,9,0.35)_30%,_rgba(42,21,6,0.75)_60%,_rgba(10,5,2,0.95)_100%)] shadow-[inset_0_6px_16px_rgba(255,240,200,0.08),_0_20px_45px_rgba(0,0,0,0.5)]" />

                <motion.div
                    animate={{ rotate: wheelRotation }}
                    transition={{
                        duration: spinning ? 4.8 : 0,
                        ease: [0.16, 1, 0.3, 1],
                    }}
                    className="relative z-10"
                >
                    <svg viewBox="0 0 300 300" className="h-[300px] w-[300px] drop-shadow-[0_18px_32px_rgba(0,0,0,0.5)]">
                        <defs>
                            <radialGradient id="woodRing" cx="50%" cy="42%" r="70%">
                                <stop offset="0%" stopColor="#7a4718" />
                                <stop offset="55%" stopColor="#4f2508" />
                                <stop offset="100%" stopColor="#2a1406" />
                            </radialGradient>
                            <radialGradient id="metalHub" cx="35%" cy="30%" r="70%">
                                <stop offset="0%" stopColor="#fff3c4" />
                                <stop offset="45%" stopColor="#fbbf24" />
                                <stop offset="100%" stopColor="#9a6700" />
                            </radialGradient>
                        </defs>

                        <circle cx={cx} cy={cy} r={148} fill="#1b0c03" stroke="#f8d27a" strokeWidth="2.5" />
                        <circle cx={cx} cy={cy} r={144} fill="url(#woodRing)" stroke="#8d5a1c" strokeWidth="3" />
                        <circle cx={cx} cy={cy} r={141} fill="none" stroke="rgba(255,239,200,0.3)" strokeWidth="1" />

                        {AMERICAN_WHEEL_ORDER.map((n, i) => {
                            const start = i * WHEEL_SLICE;
                            const end = (i + 1) * WHEEL_SLICE;
                            const mid = getPocketCenterAngle(i);
                            const color = getNumberColor(n);
                            const fill =
                                color === "red"
                                    ? "#b91c1c"
                                    : color === "black"
                                        ? "#111827"
                                        : "#15803d";

                            const textPos = polarToCartesian(cx, cy, numberTextRadius, mid);
                            const separatorPos = polarToCartesian(cx, cy, separatorRadius, start);

                            return (
                                <g key={`${n}-${i}`}>
                                    <path
                                        d={describeArc(cx, cy, outer, inner, start, end)}
                                        fill={fill}
                                        stroke="#f8e7b0"
                                        strokeWidth="0.9"
                                    />
                                    <line
                                        x1={cx}
                                        y1={cy}
                                        x2={separatorPos.x}
                                        y2={separatorPos.y}
                                        stroke="rgba(255,244,212,0.22)"
                                        strokeWidth="0.55"
                                    />
                                    <text
                                        x={textPos.x}
                                        y={textPos.y}
                                        fill="#fff7db"
                                        fontSize={n === "0" || n === "00" ? "10" : "11"}
                                        fontWeight="800"
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        transform={`rotate(${mid} ${textPos.x} ${textPos.y})`}
                                    >
                                        {n}
                                    </text>
                                </g>
                            );
                        })}

                        <circle cx={cx} cy={cy} r={94} fill="#8b5a2b" stroke="#f8e7b0" strokeWidth="2" />
                        <circle cx={cx} cy={cy} r={73} fill="#6b3a12" stroke="rgba(255,231,170,0.7)" strokeWidth="1.5" />
                        <circle cx={cx} cy={cy} r={54} fill="#4c250b" stroke="#f8e7b0" strokeWidth="1.5" />
                        <circle cx={cx} cy={cy} r={22} fill="url(#metalHub)" stroke="#fff3c4" strokeWidth="2" />
                        <circle cx={cx} cy={cy} r={9} fill="#fff4d0" stroke="#d9a11f" strokeWidth="1.2" />
                    </svg>
                </motion.div>

                <motion.div
                    animate={{ rotate: ballRotation }}
                    transition={{
                        duration: spinning ? 4.8 : 0,
                        ease: [0.08, 0.95, 0.18, 1],
                    }}
                    className="pointer-events-none absolute inset-0 z-30"
                >
                    <div
                        className="absolute left-1/2 top-1/2 h-[15px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 bg-[radial-gradient(circle_at_35%_35%,_#ffffff,_#f6f7fb_55%,_#d5d9e3_100%)] shadow-[0_0_16px_rgba(255,255,255,0.55),_0_2px_8px_rgba(0,0,0,0.45)]"
                        style={{
                            transform: `translate(-50%, -50%) translateY(-${BALL_TRACK_RADIUS}px)`,
                        }}
                    />
                </motion.div>

                <div className="pointer-events-none absolute inset-0 z-20">
                    <div className="absolute left-1/2 top-1/2 h-[284px] w-[284px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8" />
                    <div className="absolute left-1/2 top-1/2 h-[266px] w-[266px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/10" />
                </div>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-40">
                    <div className="rounded-full border border-white/15 bg-black/35 px-4 py-2 text-center shadow-xl backdrop-blur">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/90">
                            Result
                        </div>
                        <div
                            className={`mt-1 text-2xl font-extrabold ${result == null
                                ? "text-white"
                                : getNumberColor(result) === "red"
                                    ? "text-red-300"
                                    : getNumberColor(result) === "black"
                                        ? "text-slate-100"
                                        : "text-emerald-300"
                                }`}
                        >
                            {result ?? "—"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RecentResults({
    results,
}: {
    results: RouletteNumber[];
}) {
    return (
        <InfoCard title="Recent Results">
            <div className="flex flex-wrap gap-2">
                {results.length === 0 ? (
                    <div className="text-sm text-white/70">No spins yet.</div>
                ) : (
                    results.map((n, index) => {
                        const color = getNumberColor(n);
                        return (
                            <div
                                key={`${n}-${index}`}
                                className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-extrabold shadow-lg ${color === "red"
                                    ? "border-red-300/50 bg-red-500/20 text-red-100"
                                    : color === "black"
                                        ? "border-white/15 bg-slate-900/80 text-white"
                                        : "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                                    }`}
                            >
                                {n}
                            </div>
                        );
                    })
                )}
            </div>
        </InfoCard>
    );
}

function PayoutTable() {
    const rows = [
        ["Straight Up", "35 to 1"],
        ["Split", "17 to 1"],
        ["Corner", "8 to 1"],
        ["Dozen", "2 to 1"],
        ["Column", "2 to 1"],
        ["Red / Black", "1 to 1"],
        ["Odd / Even", "1 to 1"],
        ["1 to 18 / 19 to 36", "1 to 1"],
    ];

    return (
        <InfoCard title="Payout Odds">
            <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-[1fr_auto] bg-white/8 px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-200">
                    <div>Bet</div>
                    <div>Pays</div>
                </div>

                {rows.map(([bet, pays]) => (
                    <div
                        key={bet}
                        className="grid grid-cols-[1fr_auto] border-t border-white/10 px-3 py-2 text-sm text-white/90"
                    >
                        <div>{bet}</div>
                        <div className="font-bold text-amber-100">{pays}</div>
                    </div>
                ))}
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70">
                Winning return includes original wager plus profit.
            </div>
        </InfoCard>
    );
}

export default function Roulette({ bankroll, setBankroll }: Props) {
    const [selectedChip, setSelectedChip] = useState(5);
    const [bets, setBets] = useState<Record<string, number>>({});
    const [message, setMessage] = useState("Select a chip, click the layout to place bets, then spin.");
    const [isSpinning, setIsSpinning] = useState(false);
    const [lastResult, setLastResult] = useState<RouletteNumber | null>(null);
    const [spinSummary, setSpinSummary] = useState<SpinResult | null>(null);
    const [recentResults, setRecentResults] = useState<RouletteNumber[]>([]);
    const [wheelRotation, setWheelRotation] = useState(0);
    const [ballRotation, setBallRotation] = useState(0);
    const [showRules, setShowRules] = useState(false);

    const totalBet = useMemo(
        () => Object.values(bets).reduce((sum, amount) => sum + amount, 0),
        [bets]
    );

    const activeBetCount = useMemo(
        () => Object.values(bets).filter((n) => n > 0).length,
        [bets]
    );

    const canBet = !isSpinning;

    const placeBet = (spotId: string) => {
        if (!canBet) return;
        setBets((prev) => ({
            ...prev,
            [spotId]: (prev[spotId] || 0) + selectedChip,
        }));
        setMessage(`Added ${fmt(selectedChip)} to ${SPOT_MAP.get(spotId)?.label ?? "bet"}.`);
    };

    const removeBet = (spotId: string) => {
        if (!canBet) return;
        setBets((prev) => {
            const current = prev[spotId] || 0;
            if (current <= 0) return prev;
            const nextAmount = Math.max(0, current - selectedChip);
            const next = { ...prev };
            if (nextAmount === 0) delete next[spotId];
            else next[spotId] = nextAmount;
            return next;
        });
        setMessage(`Removed up to ${fmt(selectedChip)} from ${SPOT_MAP.get(spotId)?.label ?? "bet"}.`);
    };

    const clearBets = () => {
        if (!canBet) return;
        setBets({});
        setMessage("All bets cleared.");
    };

    const repeatLastBets = () => {
        if (!canBet || !spinSummary) return;
        const reconstructed: Record<string, number> = {};
        [...spinSummary.winningBets, ...spinSummary.losingBets].forEach((bet) => {
            reconstructed[bet.id] = bet.amount;
        });
        setBets(reconstructed);
        setMessage("Repeated previous wager layout.");
    };

    const spinWheel = () => {
        if (isSpinning) return;
        if (totalBet <= 0) {
            setMessage("Place at least one bet before spinning.");
            return;
        }
        if (bankroll < totalBet) {
            setMessage("Not enough bankroll for those bets.");
            return;
        }

        setBankroll((b) => b - totalBet);
        setIsSpinning(true);
        setSpinSummary(null);
        setMessage("No more bets. Spinning...");

        const winningIndex = Math.floor(Math.random() * AMERICAN_WHEEL_ORDER.length);
        const result = AMERICAN_WHEEL_ORDER[winningIndex];

        const targetWheelRotation = getWheelStopRotation(wheelRotation, winningIndex);
        const targetBallRotation = getBallStopRotation(ballRotation);

        setWheelRotation(targetWheelRotation);
        setBallRotation(targetBallRotation);

        window.setTimeout(() => {
            const winningBets: SettledBet[] = [];
            const losingBets: SettledBet[] = [];
            let totalReturn = 0;

            Object.entries(bets).forEach(([id, amount]) => {
                const spot = SPOT_MAP.get(id);
                if (!spot || amount <= 0) return;

                const won = spot.numbers.includes(result);
                const returned = won ? amount + amount * spot.payout : 0;

                const settled: SettledBet = {
                    id,
                    label: spot.label,
                    amount,
                    won,
                    payout: spot.payout,
                    returned,
                };

                if (won) {
                    winningBets.push(settled);
                    totalReturn += returned;
                } else {
                    losingBets.push(settled);
                }
            });

            const net = totalReturn - totalBet;
            const color = getNumberColor(result);

            setBankroll((b) => b + totalReturn);
            setLastResult(result);
            setRecentResults((prev) => [result, ...prev].slice(0, 12));
            setSpinSummary({
                result,
                color,
                totalBet,
                totalReturn,
                net,
                winningBets,
                losingBets,
            });
            setIsSpinning(false);
            setBets({});
            setMessage(
                winningBets.length > 0
                    ? `${result} ${color}. ${winningBets.length} winning bet${winningBets.length === 1 ? "" : "s"}.`
                    : `${result} ${color}. No winning bets.`
            );
        }, 4850);
    };

    const getSpotAmount = (id: string) => bets[id] || 0;

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_#1f7a45,_#0e4d2d_30%,_#062417_65%,_#020d08_100%)] text-white">
                <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1750px] flex-col gap-3 px-2 py-2 sm:px-3 sm:py-3">
                    <div className="rounded-[1.35rem] border border-amber-300/15 bg-black/25 p-3 shadow-2xl backdrop-blur sm:rounded-[1.7rem] sm:p-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-200/90 sm:text-[12px] sm:tracking-[0.3em]">
                                        Casino Table
                                    </div>
                                    <h2 className="mt-1 text-2xl font-extrabold tracking-[0.02em] text-amber-50 sm:text-4xl md:text-5xl">
                                        Roulette
                                    </h2>
                                </div>

                                <div className="shrink-0 xl:hidden">
                                    <InfoButton onClick={() => setShowRules(true)} />
                                </div>
                            </div>

                            <div className="flex items-start gap-2">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                                    <StatPill label="Bankroll" value={fmt(bankroll)} accent="gold" />
                                    <StatPill label="Chip" value={fmt(selectedChip)} />
                                    <StatPill label="Spots" value={activeBetCount} />
                                    <StatPill label="On Table" value={fmt(totalBet)} accent="green" />
                                    <StatPill
                                        label="Last Net"
                                        value={spinSummary ? fmt(spinSummary.net) : "—"}
                                        accent={
                                            !spinSummary
                                                ? "gold"
                                                : spinSummary.net > 0
                                                    ? "green"
                                                    : spinSummary.net < 0
                                                        ? "default"
                                                        : "gold"
                                        }
                                    />
                                </div>

                                <div className="hidden shrink-0 xl:block">
                                    <InfoButton onClick={() => setShowRules(true)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[1.45rem] border border-white/10 bg-black/20 p-2.5 shadow-2xl backdrop-blur sm:rounded-[1.8rem] sm:p-3">
                        <div className="rounded-[1.2rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(0,0,0,0.22),_rgba(0,0,0,0.12))] px-4 py-3 text-center shadow-lg sm:rounded-[1.45rem] sm:px-5 sm:py-4">
                            <div className="flex items-center justify-center gap-2">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200 sm:text-[11px] sm:tracking-[0.24em]">
                                    Table Message
                                </div>
                                <button
                                    onClick={() => setShowRules(true)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/20 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15"
                                    aria-label="Show rules"
                                    title="Rules"
                                >
                                    i
                                </button>
                            </div>

                            <div className="mt-2 text-base font-bold text-amber-50 sm:text-lg md:text-xl">{message}</div>
                        </div>

                        <div className="mt-3 grid gap-3 xl:grid-cols-[310px_minmax(0,1fr)_330px]">
                            <div className="order-2 space-y-3 xl:order-1">
                                <RouletteWheel
                                    result={lastResult}
                                    wheelRotation={wheelRotation}
                                    ballRotation={ballRotation}
                                    spinning={isSpinning}
                                />

                                <RecentResults results={recentResults} />
                            </div>

                            <div className="order-1 min-w-0 rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(74,222,128,0.16),_rgba(10,90,60,0.10)_40%,_rgba(0,0,0,0.22)_82%)] p-2.5 sm:rounded-[1.6rem] sm:p-4 xl:order-2">
                                <div className="flex h-full flex-col gap-3 sm:gap-4">
                                    <div className="overflow-hidden rounded-[1rem] border border-white/10 bg-black/10 p-2 sm:rounded-[1.25rem] sm:p-3">
                                        <div className="mb-3 flex items-center justify-center">
                                            <SectionLabel>Betting Layout</SectionLabel>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <div className="min-w-[980px]">
                                                <div className="grid grid-cols-[88px_auto_76px] gap-1">
                                                    <div className="grid grid-rows-2 gap-1">
                                                        <BoardSpotButton
                                                            label="0"
                                                            amount={getSpotAmount("straight-0")}
                                                            colorClass="border-emerald-300/30 bg-emerald-700/65 text-emerald-50"
                                                            onClick={() => placeBet("straight-0")}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                removeBet("straight-0");
                                                            }}
                                                            tall
                                                        />
                                                        <BoardSpotButton
                                                            label="00"
                                                            amount={getSpotAmount("straight-00")}
                                                            colorClass="border-emerald-300/30 bg-emerald-700/65 text-emerald-50"
                                                            onClick={() => placeBet("straight-00")}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                removeBet("straight-00");
                                                            }}
                                                            tall
                                                        />
                                                    </div>

                                                    <div
                                                        className="relative"
                                                        style={{ width: GRID_W, height: GRID_H }}
                                                    >
                                                        {NUMBER_ROWS.map((row, rowIndex) =>
                                                            row.map((n, colIndex) => (
                                                                <div
                                                                    key={n}
                                                                    style={{
                                                                        position: "absolute",
                                                                        left: colIndex * CELL_W,
                                                                        top: rowIndex * CELL_H,
                                                                    }}
                                                                >
                                                                    <GridNumberSpot
                                                                        number={n}
                                                                        amount={getSpotAmount(`straight-${n}`)}
                                                                        onClick={() => placeBet(`straight-${n}`)}
                                                                        onContextMenu={(e) => {
                                                                            e.preventDefault();
                                                                            removeBet(`straight-${n}`);
                                                                        }}
                                                                    />
                                                                </div>
                                                            ))
                                                        )}

                                                        {NUMBER_ROWS.map((row, rowIndex) =>
                                                            row.slice(0, -1).map((n, colIndex) => {
                                                                const right = row[colIndex + 1];
                                                                const id = makeComboId("split", [n, right]);

                                                                return (
                                                                    <OverlayBetSpot
                                                                        key={id}
                                                                        amount={getSpotAmount(id)}
                                                                        onClick={() => placeBet(id)}
                                                                        onContextMenu={(e) => {
                                                                            e.preventDefault();
                                                                            removeBet(id);
                                                                        }}
                                                                        hint={`Split ${makeComboLabel([n, right])}`}
                                                                        className="h-9 w-3"
                                                                        style={{
                                                                            left: (colIndex + 1) * CELL_W - 6,
                                                                            top: rowIndex * CELL_H + CELL_H / 2 - 18,
                                                                        }}
                                                                    />
                                                                );
                                                            })
                                                        )}

                                                        {NUMBER_ROWS.slice(0, -1).map((row, rowIndex) =>
                                                            row.map((n, colIndex) => {
                                                                const below = NUMBER_ROWS[rowIndex + 1][colIndex];
                                                                const id = makeComboId("split", [n, below]);

                                                                return (
                                                                    <OverlayBetSpot
                                                                        key={id}
                                                                        amount={getSpotAmount(id)}
                                                                        onClick={() => placeBet(id)}
                                                                        onContextMenu={(e) => {
                                                                            e.preventDefault();
                                                                            removeBet(id);
                                                                        }}
                                                                        hint={`Split ${makeComboLabel([n, below])}`}
                                                                        className="h-3 w-9"
                                                                        style={{
                                                                            left: colIndex * CELL_W + CELL_W / 2 - 18,
                                                                            top: (rowIndex + 1) * CELL_H - 6,
                                                                        }}
                                                                    />
                                                                );
                                                            })
                                                        )}

                                                        {NUMBER_ROWS.slice(0, -1).map((row, rowIndex) =>
                                                            row.slice(0, -1).map((n, colIndex) => {
                                                                const a = n;
                                                                const b = row[colIndex + 1];
                                                                const c = NUMBER_ROWS[rowIndex + 1][colIndex];
                                                                const d = NUMBER_ROWS[rowIndex + 1][colIndex + 1];
                                                                const id = makeComboId("corner", [a, b, c, d]);

                                                                return (
                                                                    <OverlayBetSpot
                                                                        key={id}
                                                                        amount={getSpotAmount(id)}
                                                                        onClick={() => placeBet(id)}
                                                                        onContextMenu={(e) => {
                                                                            e.preventDefault();
                                                                            removeBet(id);
                                                                        }}
                                                                        hint={`Corner ${makeComboLabel([a, b, c, d])}`}
                                                                        className="h-5 w-5"
                                                                        style={{
                                                                            left: (colIndex + 1) * CELL_W - 10,
                                                                            top: (rowIndex + 1) * CELL_H - 10,
                                                                        }}
                                                                    />
                                                                );
                                                            })
                                                        )}
                                                    </div>

                                                    <div className="grid grid-rows-3 gap-1">
                                                        {["column3", "column2", "column1"].map((id) => (
                                                            <BoardSpotButton
                                                                key={id}
                                                                label="2 to 1"
                                                                amount={getSpotAmount(id)}
                                                                colorClass="border-amber-300/20 bg-black/35 text-amber-100"
                                                                onClick={() => placeBet(id)}
                                                                onContextMenu={(e) => {
                                                                    e.preventDefault();
                                                                    removeBet(id);
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="mt-1 grid grid-cols-3 gap-1">
                                                    {["dozen1", "dozen2", "dozen3"].map((id) => (
                                                        <BoardSpotButton
                                                            key={id}
                                                            label={SPOT_MAP.get(id)?.label}
                                                            amount={getSpotAmount(id)}
                                                            colorClass="border-amber-300/20 bg-black/35 text-amber-100"
                                                            onClick={() => placeBet(id)}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                removeBet(id);
                                                            }}
                                                        />
                                                    ))}
                                                </div>

                                                <div className="mt-1 grid grid-cols-6 gap-1">
                                                    <BoardSpotButton
                                                        label="1 to 18"
                                                        amount={getSpotAmount("low")}
                                                        colorClass="border-amber-300/20 bg-black/35 text-amber-100"
                                                        onClick={() => placeBet("low")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("low");
                                                        }}
                                                    />
                                                    <BoardSpotButton
                                                        label="EVEN"
                                                        amount={getSpotAmount("even")}
                                                        colorClass="border-amber-300/20 bg-black/35 text-amber-100"
                                                        onClick={() => placeBet("even")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("even");
                                                        }}
                                                    />
                                                    <BoardSpotButton
                                                        label="RED"
                                                        amount={getSpotAmount("red")}
                                                        colorClass="border-red-300/30 bg-red-800/70 text-red-50"
                                                        onClick={() => placeBet("red")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("red");
                                                        }}
                                                    />
                                                    <BoardSpotButton
                                                        label="BLACK"
                                                        amount={getSpotAmount("black")}
                                                        colorClass="border-white/10 bg-slate-950/90 text-white"
                                                        onClick={() => placeBet("black")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("black");
                                                        }}
                                                    />
                                                    <BoardSpotButton
                                                        label="ODD"
                                                        amount={getSpotAmount("odd")}
                                                        colorClass="border-amber-300/20 bg-black/35 text-amber-100"
                                                        onClick={() => placeBet("odd")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("odd");
                                                        }}
                                                    />
                                                    <BoardSpotButton
                                                        label="19 to 36"
                                                        amount={getSpotAmount("high")}
                                                        colorClass="border-amber-300/20 bg-black/35 text-amber-100"
                                                        onClick={() => placeBet("high")}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            removeBet("high");
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="sticky bottom-2 z-10 -mx-1 mt-1 rounded-[1.1rem] border border-white/10 bg-black/45 px-2 py-2 backdrop-blur sm:static sm:mx-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                                        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                                            <ActionButton
                                                onClick={spinWheel}
                                                variant="bet"
                                                disabled={isSpinning || totalBet <= 0}
                                            >
                                                Spin
                                            </ActionButton>

                                            <ActionButton
                                                onClick={clearBets}
                                                variant="danger"
                                                disabled={isSpinning || totalBet <= 0}
                                            >
                                                Clear Bets
                                            </ActionButton>

                                            <ActionButton
                                                onClick={repeatLastBets}
                                                disabled={isSpinning || !spinSummary}
                                            >
                                                Repeat Last
                                            </ActionButton>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="order-3 space-y-3 xl:order-3">
                                <InfoCard title="Chip Selector">
                                    <ChipSelector
                                        selectedChip={selectedChip}
                                        onSelect={setSelectedChip}
                                        disabled={isSpinning}
                                    />

                                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-amber-100/90 sm:text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Selected chip</span>
                                            <span className="font-extrabold text-white">{fmt(selectedChip)}</span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span>Minimum chip</span>
                                            <span className="font-semibold text-white">{fmt(MIN_CHIP)}</span>
                                        </div>
                                    </div>
                                </InfoCard>

                                <InfoCard title="Bet Summary">
                                    <div className="space-y-2">
                                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                            <div className="text-[9px] uppercase tracking-[0.16em] text-white/65 sm:text-[10px] sm:tracking-[0.18em]">
                                                Total on table
                                            </div>
                                            <div className="mt-1 text-lg font-extrabold text-amber-50">
                                                {fmt(totalBet)}
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                            <div className="text-[9px] uppercase tracking-[0.16em] text-white/65 sm:text-[10px] sm:tracking-[0.18em]">
                                                Active spots
                                            </div>
                                            <div className="mt-1 text-sm font-bold text-white">
                                                {activeBetCount}
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-emerald-50/90 sm:text-xs">
                                            Left click adds the selected chip.
                                            <br />
                                            Right click removes that chip amount.
                                            <br />
                                            Split bars bet 2 numbers.
                                            <br />
                                            Corner dots bet 4 numbers.
                                            <br />
                                            0 and 00 can both be bet directly.
                                        </div>
                                    </div>
                                </InfoCard>

                                <PayoutTable />

                                <InfoCard title="Settlement">
                                    {!spinSummary ? (
                                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center text-sm text-white/70">
                                            Spin to settle the layout.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                                                    <div className="text-[9px] uppercase tracking-[0.16em] text-white/65 sm:text-[10px]">
                                                        Result
                                                    </div>
                                                    <div
                                                        className={`mt-1 text-base font-extrabold ${spinSummary.color === "red"
                                                            ? "text-red-300"
                                                            : spinSummary.color === "black"
                                                                ? "text-white"
                                                                : "text-emerald-300"
                                                            }`}
                                                    >
                                                        {spinSummary.result}
                                                    </div>
                                                </div>

                                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                                                    <div className="text-[9px] uppercase tracking-[0.16em] text-white/65 sm:text-[10px]">
                                                        Net
                                                    </div>
                                                    <div
                                                        className={`mt-1 text-base font-extrabold ${spinSummary.net > 0
                                                            ? "text-emerald-300"
                                                            : spinSummary.net < 0
                                                                ? "text-red-300"
                                                                : "text-amber-100"
                                                            }`}
                                                    >
                                                        {fmt(spinSummary.net)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] sm:text-xs">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/70">Bet</span>
                                                    <span className="font-bold text-white">{fmt(spinSummary.totalBet)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/70">Return</span>
                                                    <span className="font-bold text-amber-100">{fmt(spinSummary.totalReturn)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/70">Winning bets</span>
                                                    <span className="font-bold text-emerald-200">{spinSummary.winningBets.length}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/70">Losing bets</span>
                                                    <span className="font-bold text-red-200">{spinSummary.losingBets.length}</span>
                                                </div>
                                            </div>

                                            <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                                                {spinSummary.winningBets.map((bet) => (
                                                    <div
                                                        key={`win-${bet.id}`}
                                                        className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs"
                                                    >
                                                        <div className="font-extrabold text-emerald-100">{bet.label}</div>
                                                        <div className="mt-1 flex items-center justify-between gap-2 text-emerald-50/90">
                                                            <span>{fmt(bet.amount)} at {bet.payout} to 1</span>
                                                            <span className="font-bold text-emerald-200">
                                                                {fmt(bet.returned)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}

                                                {spinSummary.losingBets.slice(0, 8).map((bet) => (
                                                    <div
                                                        key={`lose-${bet.id}`}
                                                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
                                                    >
                                                        <div className="font-bold text-white/85">{bet.label}</div>
                                                        <div className="mt-1 flex items-center justify-between gap-2 text-white/70">
                                                            <span>{fmt(bet.amount)}</span>
                                                            <span className="font-bold text-red-200">Lost</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </InfoCard>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}