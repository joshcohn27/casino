export const CHIP_DENOMINATIONS = [1, 2.5, 5, 25, 100, 500, 1000, 5000] as const;
export type ChipDenomination = typeof CHIP_DENOMINATIONS[number];

export function formatMoney(value: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

export const CHIP_COLORS: Record<ChipDenomination, { bg: string; border: string; text: string; label: string }> = {
    1:    { bg: "#f1f5f9", border: "#94a3b8", text: "#1e293b", label: "$1"    },
    2.5:  { bg: "#f9a8d4", border: "#be185d", text: "#500724", label: "$2.50" },
    5:    { bg: "#dc2626", border: "#7f1d1d", text: "#fff",    label: "$5"    },
    25:   { bg: "#16a34a", border: "#14532d", text: "#fff",    label: "$25"   },
    100:  { bg: "#1e293b", border: "#0f172a", text: "#e2e8f0", label: "$100"  },
    500:  { bg: "#7c3aed", border: "#4c1d95", text: "#fff",    label: "$500"  },
    1000: { bg: "#b45309", border: "#78350f", text: "#fef3c7", label: "$1K"   },
    5000: { bg: "#babbbd", border: "#6b7280", text: "#111827", label: "$5K"   },
};

export function buildChipStackFromAmount(amount: number): ChipDenomination[] {
    const VALS: ChipDenomination[] = [5000, 1000, 500, 100, 25, 5, 2.5, 1];
    let remaining = Math.round(amount * 100);
    const stack: ChipDenomination[] = [];
    for (const d of VALS) {
        const cents = Math.round(Number(d) * 100);
        while (remaining >= cents) { stack.push(d); remaining -= cents; }
    }
    return stack;
}

/**
 * Put a chip on a stack. A stack is always kept biggest chip first (the bottom) and smallest
 * last (the top), whatever order the chips were added in, so taking the last one off takes
 * the top chip.
 */
export function addChipToStack(stack: ChipDenomination[], chip: ChipDenomination): ChipDenomination[] {
    return [...stack, chip].sort((a, b) => Number(b) - Number(a));
}

// Amount left after taking the top chip off a stack worth `amount`.
export function popLastChip(amount: number, floor = 0): number {
    const chips = buildChipStackFromAmount(amount);
    if (chips.length === 0) return Math.max(floor, amount);
    return Math.max(floor, amount - Number(chips[chips.length - 1]));
}

// Table buttons read like casino signage: squared off, solid, bold. No gradients or glow.
// Hover darkens the fill, pressing darkens it again and drops the button by a pixel.
export const BTN_BASE = "rounded-[4px] border-2 px-4 py-3 text-sm font-bold transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";
export const BTN_NEUTRAL = `${BTN_BASE} border-[#3a4a66] bg-panel-2 text-text hover:bg-line active:bg-ink`;
export const BTN_GOLD = `${BTN_BASE} border-gold-deep bg-gold text-ink hover:bg-gold-deep active:bg-[#d97706]`;
export const BTN_GREEN = `${BTN_BASE} border-emerald-500 bg-emerald-400 text-ink hover:bg-emerald-500 active:bg-emerald-600`;
