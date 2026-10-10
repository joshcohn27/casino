import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export const DEFAULT_BANKROLL = 1000;
export const STORAGE_BANKROLL_KEY = "casino-bankroll";

export type BankrollValue = {
    bankroll: number;
    /** What the games use: a wager takes money off, a payout puts it back. */
    setBankroll: Dispatch<SetStateAction<number>>;
};

export const BankrollContext = createContext<BankrollValue | null>(null);

export function useBankroll(): BankrollValue {
    const value = useContext(BankrollContext);
    if (!value) throw new Error("useBankroll must be used inside BankrollProvider");
    return value;
}
