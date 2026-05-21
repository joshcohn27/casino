import React, { useEffect, useRef, useState } from 'react';
import { formatMoney } from './money';

/* ─── Props ──────────────────────────────────────────────────────────────── */

export interface TableShellProps {
    /** 6-digit hex used to build the felt radial gradient, e.g. "#1f7a45" */
    feltColor: string;
    /** Game title shown centered in the header */
    gameName: string;
    /** Shared bankroll in dollars — rendered on the left of the header */
    bankroll: number;
    /** Optional content for the right side of the header (stat pills, rules button, etc.) */
    headerRight?: React.ReactNode;
    /** The felt area — card lanes, panels, info cards, etc. */
    children: React.ReactNode;
    /** A fully-configured <ActionBar /> instance */
    actionBar: React.ReactNode;
    /**
     * When true the shell header (bankroll + game name) is not rendered.
     * Use this when the parent (e.g. Casino.tsx) already provides a navbar.
     * Defaults to false.
     */
    hideHeader?: boolean;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Builds a radial felt gradient from a single hex color.
 * The color blooms from the top-center and fades to near-black.
 * Assumes a 6-digit hex (#rrggbb) so we can append an alpha byte.
 */
function feltGradient(hex: string): string {
    return [
        `radial-gradient(ellipse at 50% -10%,`,
        `  ${hex} 0%,`,
        `  ${hex}99 28%,`,   // ~60 % opacity mid
        `  ${hex}33 55%,`,   // ~20 % opacity far
        `  #040606 82%)`,    // near-black at edge
    ].join('\n');
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function TableShell({
    feltColor,
    gameName,
    bankroll,
    headerRight,
    children,
    actionBar,
    hideHeader = false,
}: TableShellProps) {
    // Measure the live ActionBar height so we can pad the content area by
    // exactly that amount — game-specific buttons never hide behind the bar.
    const actionBarRef = useRef<HTMLDivElement>(null);
    const [barHeight, setBarHeight] = useState(80); // conservative default

    useEffect(() => {
        const el = actionBarRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setBarHeight(Math.ceil(entry.borderBoxSize[0].blockSize));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            className="relative flex flex-col text-white"
            style={{ background: feltGradient(feltColor), minHeight: 'calc(100dvh - 84px)' }}
        >
            {/* ── Header (opt-out with hideHeader when parent nav is present) ── */}
            {!hideHeader && (
                <header className="sticky top-0 z-20 shrink-0 border-b border-white/10 bg-black/45 backdrop-blur-xl">
                    <div className="mx-auto flex max-w-[1700px] items-center gap-4 px-4 py-2.5">

                        {/* Left: bankroll */}
                        <div className="flex-1">
                            <div className="inline-flex flex-col rounded-full border border-amber-300/20
                                            bg-black/30 px-4 py-1.5 leading-tight">
                                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-200">
                                    Bankroll
                                </span>
                                <span className="text-sm font-extrabold text-white sm:text-base">
                                    {formatMoney(bankroll)}
                                </span>
                            </div>
                        </div>

                        {/* Center: game name */}
                        <h1 className="shrink-0 text-center text-base font-extrabold
                                       tracking-[0.03em] text-amber-50 sm:text-xl">
                            {gameName}
                        </h1>

                        {/* Right: caller-supplied stats / buttons */}
                        <div className="flex flex-1 items-center justify-end gap-2">
                            {headerRight}
                        </div>
                    </div>
                </header>
            )}

            {/* ── Felt content ───────────────────────────────────────── */}
            {/*
                paddingBottom = live ActionBar height + 12 px breathing room.
                This guarantees game-specific action buttons (Hit / Stand / Fold …)
                are never occluded by the sticky ActionBar, even on short screens.
            */}
            <main
                className="mx-auto flex w-full max-w-[1700px] flex-1 flex-col px-3 py-3"
                style={{ paddingBottom: barHeight + 12 }}
            >
                {children}
            </main>

            {/* ── Action bar — always pinned to viewport bottom ──────── */}
            <div ref={actionBarRef} className="sticky bottom-0 z-10 shrink-0">
                {actionBar}
            </div>
        </div>
    );
}
