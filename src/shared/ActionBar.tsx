import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ChipTray from './ChipTray';
import { BTN_NEUTRAL, BTN_GOLD, BTN_GREEN, type ChipDenomination } from './money';

/* ─── Internal button ────────────────────────────────────────────────────── */

type BtnVariant = 'clear' | 'deal' | 'double';

const BTN_STYLES: Record<BtnVariant, string> = { clear: BTN_NEUTRAL, deal: BTN_GOLD, double: BTN_GREEN };

function ActionBtn({
    children,
    onClick,
    disabled,
    variant,
    hotkey,
    hotkeyAlt,
}: {
    hotkey?: string;
    hotkeyAlt?: string;
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    variant: BtnVariant;
}) {
    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            data-hotkey={hotkey}
            data-hotkey-alt={hotkeyAlt}
            className={BTN_STYLES[variant]}
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
            className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
            {/* ── Left: chip selector ────────────────────────────────── */}
            <ChipTray
                selectedChip={selectedChip}
                onSelect={onChipSelect}
                disabled={disabled}
            />

            {/* ── Right: action buttons ──────────────────────────────── */}
            {/* held taller than any button, so the bar keeps one height as buttons come and go */}
            <div className="flex min-h-[56px] shrink-0 items-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {canClear && (
                        <SlideIn id="clear">
                            <ActionBtn variant="clear" onClick={onClear} disabled={disabled} hotkey="Q">
                                Clear
                            </ActionBtn>
                        </SlideIn>
                    )}

                    {canDeal && (
                        <SlideIn id="deal">
                            <ActionBtn variant="deal" onClick={onDeal} disabled={disabled} hotkey="Space" hotkeyAlt="Enter">
                                {dealLabel}
                            </ActionBtn>
                        </SlideIn>
                    )}

                    {canDoubleAndDeal && (
                        <SlideIn id="double">
                            <ActionBtn variant="double" onClick={onDoubleAndDeal} disabled={disabled}>
                                    {doubleLabel}
                                </ActionBtn>
                        </SlideIn>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
