import React, { useEffect, useRef } from "react";
import { useHandRecorder } from "./sessionContext";
import { AnimatePresence, motion } from "motion/react";
import { CHIP_COLORS, formatMoney, type ChipDenomination } from "./money";

// Shared betting spot used by every chip game.
//
// One rule everywhere:
//   - click a spot to highlight it
//   - click a tray chip to add that chip to the highlighted spot
//   - click the chips sitting on a spot to take the last chip back

export const STACK_GAP = 9;
const CHIP_SIZE = 48;
const STACK_WIDTH = 52;
// How far the bottom chip overlaps the top of the spot
const STACK_OVERLAP = 14;

// ─── ChipStack ────────────────────────────────────────────────────────────────

export function ChipStack({ chips, onRemove }: { chips: ChipDenomination[]; onRemove?: () => void }) {
    const visible = chips.slice(-3);
    const startIdx = chips.length - visible.length;
    const stackH = STACK_WIDTH + (visible.length > 0 ? (visible.length - 1) * STACK_GAP : 0);
    return (
        <div
            className={`relative flex justify-center ${onRemove ? "cursor-pointer" : ""}`}
            style={{ width: STACK_WIDTH, height: stackH, marginBottom: -STACK_OVERLAP, zIndex: 10 }}
            onClick={onRemove}
            role={onRemove ? "button" : undefined}
            aria-label={onRemove ? "Remove last chip" : undefined}
            data-chip-stack
        >
            <AnimatePresence>
                {visible.map((denom, i) => {
                    const cfg = CHIP_COLORS[denom];
                    return (
                        <motion.div
                            key={startIdx + i}
                            className="absolute left-0 right-0 mx-auto flex select-none items-center justify-center rounded-full text-[10px] font-extrabold"
                            style={{
                                width: CHIP_SIZE, height: CHIP_SIZE,
                                bottom: i * STACK_GAP, zIndex: i + 1,
                                backgroundColor: cfg.bg, border: `3px solid ${cfg.border}`, color: cfg.text,
                                boxShadow: "inset 0 1px 3px rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.18), 0 5px 14px rgba(0,0,0,0.5)",
                            }}
                            initial={{ opacity: 0, y: -22, scale: 0.72 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.8 }}
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

// ─── BetSpot ──────────────────────────────────────────────────────────────────

export interface BetSpotProps {
    chips: ChipDenomination[];
    totalBet: number;
    /** Text inside the spot. Omit for a bare spot that only shows the amount. */
    label?: string;
    sublabel?: string;
    /** Shown inside a bare (label-less) spot when nothing is bet. */
    emptyText?: string;
    /** Width and height of the spot in px. */
    dim: number;
    diamond?: boolean;
    /** Chips float above the spot instead of taking up layout space. */
    floatChips?: boolean;
    isSelected: boolean;
    isWinner?: boolean;
    /** Spot never accepts chips from the player (Blind, Play, street bets). */
    isLocked?: boolean;
    /** True while the player is allowed to change bets. */
    canBet: boolean;
    onSelect?: () => void;
    onRemove?: () => void;
    testId?: string;
}

export default function BetSpot({
    chips, totalBet, label, sublabel, emptyText, dim, diamond, floatChips,
    isSelected, isWinner, isLocked, canBet, onSelect, onRemove, testId,
}: BetSpotProps) {
    const interactive = canBet && !isLocked;
    const selected = interactive && isSelected;

    // Painted table markings: a dashed line on the felt. The highlighted spot gets a solid
    // white line, a winning one a solid gold line. No glow.
    const ring = isWinner ? "border-[3px] border-solid border-gold"
        : selected ? "border-[3px] border-solid border-white"
        : "border-2 border-dashed border-white/45";
    const bg = isWinner ? "bg-black/35"
        : selected ? "bg-black/35"
        : "bg-black/20";

    const stack = chips.length > 0
        ? <ChipStack chips={chips} onRemove={interactive ? onRemove : undefined} />
        : null;

    const inner: React.ReactNode = label ? (
        <>
            <span className="text-center text-[13px] font-bold leading-tight text-white">{label}</span>
            {sublabel && <span className="mt-0.5 text-[12px] leading-tight text-white/80">{sublabel}</span>}
            {totalBet > 0 && (
                <span className="mt-0.5 text-[12px] font-bold text-gold-soft">{formatMoney(totalBet)}</span>
            )}
        </>
    ) : totalBet > 0 ? (
        <span className="text-sm font-bold text-gold-soft">{formatMoney(totalBet)}</span>
    ) : (
        <span className="text-[13px] font-bold text-white/70">{emptyText ?? "-"}</span>
    );

    return (
        <div
            className={`relative flex flex-col items-center ${diamond ? "mx-4 mb-4" : ""}`}
            data-bet-spot={testId}
            data-selected={selected ? "true" : "false"}
            data-total={totalBet}
        >
            {floatChips ? (
                <div style={{
                    position: "absolute", bottom: dim, left: "50%", transform: "translateX(-50%)",
                    zIndex: 10, pointerEvents: stack ? "auto" : "none",
                }}>
                    {stack}
                </div>
            ) : (
                stack ?? <div style={{ height: 0 }} />
            )}
            <button
                onClick={onSelect}
                disabled={!interactive}
                aria-pressed={selected}
                className={`relative flex flex-col items-center justify-center transition-colors duration-150 ${ring} ${bg} ${interactive ? "cursor-pointer hover:bg-black/40" : "cursor-default"}`}
                style={{
                    width: dim, height: dim,
                    transform: diamond ? "rotate(45deg)" : undefined,
                    borderRadius: diamond ? "6px" : "9999px",
                }}
            >
                <div
                    style={{ transform: diamond ? "rotate(-45deg)" : undefined, paddingTop: stack && !diamond ? 10 : 0 }}
                    className="flex flex-col items-center justify-center"
                >
                    {inner}
                </div>
            </button>
        </div>
    );
}

// ─── BetBar ───────────────────────────────────────────────────────────────────

export function BetBar({ pendingBet, returned, net, showResult, compact, className = "" }: {
    pendingBet: number; returned: number; net: number; showResult: boolean;
    /** Fill a narrow side column instead of sizing to content. */
    compact?: boolean;
    className?: string;
}) {
    const netColor = net > 0 ? "text-emerald-300" : net < 0 ? "text-red-300" : "text-amber-100";

    // Count the hand for the session when its result first shows. If the figures move after
    // that (a bonus settled a moment later), the same hand is corrected, not counted again.
    const recordHand = useHandRecorder();
    const counted = useRef<{ bet: number; net: number } | null>(null);
    useEffect(() => {
        if (!showResult) { counted.current = null; return; }
        const last = counted.current;
        if (!last) recordHand(pendingBet, net);
        else if (last.bet !== pendingBet || last.net !== net) recordHand(pendingBet - last.bet, net - last.net, true);
        counted.current = { bet: pendingBet, net };
    }, [showResult, pendingBet, net, recordHand]);

    return (
        <div className={`flex items-center rounded-[4px] border border-line bg-ink py-2 ${compact ? "w-full justify-between gap-2 px-3" : "justify-center gap-6 px-6"} ${className}`} data-bet-bar>
            {[
                { label: "Bet", val: pendingBet > 0 ? formatMoney(pendingBet) : "-", color: "text-white" },
                { label: "Returned", val: showResult ? formatMoney(returned) : "-", color: "text-white" },
                { label: "Net", val: showResult ? (net >= 0 ? "+" : "") + formatMoney(net) : "-", color: showResult ? netColor : "text-white" },
            ].map(({ label, val, color }, i, arr) => (
                <React.Fragment key={label}>
                    <div className="text-center">
                        <div className="text-sm text-text-muted">{label}</div>
                        <div className={`text-base font-bold ${color}`} data-bet-bar-value={label}>{val}</div>
                    </div>
                    {i < arr.length - 1 && <div className="h-8 w-px bg-line" />}
                </React.Fragment>
            ))}
        </div>
    );
}
