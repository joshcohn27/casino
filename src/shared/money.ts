export const CHIP_DENOMINATIONS = [1, 2.5, 5, 25, 100, 500, 1000, 5000] as const;
export type ChipDenomination = typeof CHIP_DENOMINATIONS[number];

export function formatMoney(n: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
}
