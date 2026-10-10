import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BankrollContext, DEFAULT_BANKROLL, STORAGE_BANKROLL_KEY } from "./bankrollContext";

function readStoredBankroll(): number {
    if (typeof window === "undefined") return DEFAULT_BANKROLL;
    const raw = window.localStorage.getItem(STORAGE_BANKROLL_KEY);
    const parsed = raw ? Number(raw) : DEFAULT_BANKROLL;
    return Number.isFinite(parsed) ? parsed : DEFAULT_BANKROLL;
}

// The one bankroll shared by every table. It sits above the router, so it is the same on every
// page, and it is saved as it changes, so it survives a refresh.
export default function BankrollProvider({ children }: { children: ReactNode }) {
    const [bankroll, setBankroll] = useState<number>(readStoredBankroll);

    useEffect(() => {
        window.localStorage.setItem(STORAGE_BANKROLL_KEY, String(bankroll));
    }, [bankroll]);

    const value = useMemo(() => ({ bankroll, setBankroll }), [bankroll]);
    return <BankrollContext.Provider value={value}>{children}</BankrollContext.Provider>;
}
