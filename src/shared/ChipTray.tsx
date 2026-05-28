import { motion } from 'motion/react';
import { CHIP_DENOMINATIONS, CHIP_COLORS, type ChipDenomination } from './money';

interface Props {
    selectedChip: ChipDenomination;
    onSelect: (chip: ChipDenomination) => void;
    disabled?: boolean;
}

export default function ChipTray({ selectedChip, onSelect, disabled = false }: Props) {
    return (
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            {CHIP_DENOMINATIONS.map((denom) => {
                const chip = CHIP_COLORS[denom];
                const selected = selectedChip === denom;

                return (
                    <motion.button
                        key={denom}
                        onClick={() => onSelect(denom)}
                        disabled={disabled}
                        aria-pressed={selected}
                        title={`${chip.label} chip`}
                        animate={{ scale: selected ? 1.14 : 1 }}
                        whileTap={{ scale: disabled ? 1 : 0.9 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                        className="relative flex h-12 w-12 items-center justify-center rounded-full
                                   disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                            backgroundColor: chip.bg,
                            border: `3px solid ${chip.border}`,
                            color: chip.text,
                            /* Inset highlight + drop shadow + selection halo */
                            boxShadow: selected
                                ? `inset 0 1px 3px rgba(255,255,255,0.30),
                                   inset 0 -1px 2px rgba(0,0,0,0.18),
                                   0 3px 8px rgba(0,0,0,0.45),
                                   0 0 0 3px #fff,
                                   0 0 0 5.5px ${chip.bg}`
                                : `inset 0 1px 3px rgba(255,255,255,0.30),
                                   inset 0 -1px 2px rgba(0,0,0,0.18),
                                   0 3px 8px rgba(0,0,0,0.45)`,
                        }}
                    >
                        <span className="select-none text-[10px] font-extrabold leading-none tracking-tight">
                            {chip.label}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}
