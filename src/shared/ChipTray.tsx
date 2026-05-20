import { motion } from 'motion/react';
import { CHIP_DENOMINATIONS, type ChipDenomination } from './money';

interface ChipConfig {
    bg: string;
    border: string;
    text: string;
    label: string;
}

const CHIPS: Record<ChipDenomination, ChipConfig> = {
    1:    { bg: '#f1f5f9', border: '#94a3b8', text: '#1e293b', label: '$1'    },
    2.5:  { bg: '#e2e8f0', border: '#64748b', text: '#334155', label: '$2.50' },
    5:    { bg: '#dc2626', border: '#7f1d1d', text: '#fff',    label: '$5'    },
    25:   { bg: '#16a34a', border: '#14532d', text: '#fff',    label: '$25'   },
    100:  { bg: '#1e293b', border: '#0f172a', text: '#e2e8f0', label: '$100'  },
    500:  { bg: '#7c3aed', border: '#4c1d95', text: '#fff',    label: '$500'  },
    1000: { bg: '#b45309', border: '#78350f', text: '#fef3c7', label: '$1K'   },
    5000: { bg: '#be185d', border: '#831843', text: '#fce7f3', label: '$5K'   },
};

interface Props {
    selectedChip: ChipDenomination;
    onSelect: (chip: ChipDenomination) => void;
    disabled?: boolean;
}

export default function ChipTray({ selectedChip, onSelect, disabled = false }: Props) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {CHIP_DENOMINATIONS.map((denom) => {
                const chip = CHIPS[denom];
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
