import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ChipTray from './ChipTray';
import type { ChipDenomination } from './money';

/* ─── Internal button ────────────────────────────────────────────────────── */

type BtnVariant = 'clear' | 'deal' | 'double';

const BTN_STYLES: Record<BtnVariant, string> = {
    clear:
        'border-white/20 bg-white/10 text-white hover:bg-white/16',
    deal:
        'border-amber-200/70 bg-[linear-gradient(180deg,_#fde68a,_#f59e0b)] text-slate-950 hover:brightness-105',
    double:
        'border-emerald-300/60 bg-[linear-gradient(180deg,_#6ee7b7,_#059669)] text-slate-950 hover:brightness-105',
};

function ActionBtn({
    children,
    onClick,
    disabled,
    variant,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    variant: BtnVariant;
}) {
    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            whileTap={{ scale: disabled ? 1 : 0.95 }}
            className={`relative rounded-xl border px-5 py-2.5 text-sm font-extrabold
                        shadow-lg transition
                        disabled:cursor-not-allowed disabled:opacity-40
                        ${BTN_STYLES[variant]}`}
        >
            {children}
        </motion.button>
    );
}

/* ─── Slide-in wrapper used for each button ──────────────────────────────── */

function SlideIn({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <motion.div
            key={id}
            initial={{ opacity: 0, x: 14, scale: 0.88 }}
            animate={{ opacity: 1, x: 0,  scale: 1    }}
            exit={{    opacity: 0, x: 14, scale: 0.88 }}
            transition={{ duration: 0.17, ease: 'easeOut' }}
        >
            {children}
        </motion.div>
    );
}

/* ─── Public component ───────────────────────────────────────────────────── */

export interface ActionBarProps {
    /** Chip tray */
    selectedChip: ChipDenomination;
    onChipSelect: (chip: ChipDenomination) => void;

    /** Callbacks */
    onDeal: () => void;
    onClear: () => void;
    onDoubleAndDeal: () => void;

    /** Visibility */
    canDeal: boolean;
    canClear: boolean;
    canDoubleAndDeal: boolean;

    /** Locks all controls */
    disabled?: boolean;

    /** Optional label overrides */
    dealLabel?: string;
    doubleLabel?: string;
}

export default function ActionBar({
    selectedChip,
    onChipSelect,
    onDeal,
    onClear,
    onDoubleAndDeal,
    canDeal,
    canClear,
    canDoubleAndDeal,
    disabled = false,
    dealLabel = 'Deal',
    doubleLabel = 'Double & Deal',
}: ActionBarProps) {
    return (
        <div
            className="flex items-center justify-between gap-4
                       border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl"
        >
            {/* ── Left: chip selector ────────────────────────────────── */}
            <ChipTray
                selectedChip={selectedChip}
                onSelect={onChipSelect}
                disabled={disabled}
            />

            {/* ── Right: action buttons ──────────────────────────────── */}
            <div className="flex shrink-0 items-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {canClear && (
                        <SlideIn id="clear">
                            <ActionBtn variant="clear" onClick={onClear} disabled={disabled}>
                                Clear
                            </ActionBtn>
                        </SlideIn>
                    )}

                    {canDeal && (
                        <SlideIn id="deal">
                            <ActionBtn variant="deal" onClick={onDeal} disabled={disabled}>
                                {dealLabel}
                            </ActionBtn>
                        </SlideIn>
                    )}

                    {canDoubleAndDeal && (
                        <SlideIn id="double">
                            {/* Breathing glow ring — draws the eye to the primary CTA */}
                            <div className="relative">
                                <motion.div
                                    className="absolute -inset-[3px] rounded-[14px] bg-emerald-400/25"
                                    animate={{ opacity: [0.4, 0.85, 0.4], scale: [1, 1.04, 1] }}
                                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                />
                                <ActionBtn variant="double" onClick={onDoubleAndDeal} disabled={disabled}>
                                    {doubleLabel}
                                </ActionBtn>
                            </div>
                        </SlideIn>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
