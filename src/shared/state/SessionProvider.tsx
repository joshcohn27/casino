import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EMPTY_SESSION, SESSION_KEY, SessionContext, VISIT_KEY, type Session } from "./sessionContext";

const cents = (n: number) => Math.round(n * 100) / 100;

function readSession(): Session {
    if (typeof window === "undefined") return EMPTY_SESSION;
    // a fresh visit starts a fresh session: the marker only lasts while the site is open
    if (!window.sessionStorage.getItem(VISIT_KEY)) {
        window.sessionStorage.setItem(VISIT_KEY, "1");
        window.localStorage.removeItem(SESSION_KEY);
        return EMPTY_SESSION;
    }
    try {
        const raw = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null");
        if (raw && typeof raw.gameId === "string" && [raw.hands, raw.wagered, raw.net].every((n) => Number.isFinite(n))) {
            return { gameId: raw.gameId, hands: raw.hands, wagered: raw.wagered, net: raw.net };
        }
    } catch { /* unreadable: start again */ }
    return EMPTY_SESSION;
}

// The current session, shared by every table. It sits above the router so moving between
// pages does not disturb it.
export default function SessionProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session>(readSession);

    useEffect(() => {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }, [session]);

    const record = useCallback((gameId: string, bet: number, net: number, adjust = false) => {
        setSession((prev) => {
            // a hand at a different game ends the old session and starts a new one
            if (prev.gameId !== gameId) return adjust ? prev : { gameId, hands: 1, wagered: cents(bet), net: cents(net) };
            return { gameId, hands: prev.hands + (adjust ? 0 : 1), wagered: cents(prev.wagered + bet), net: cents(prev.net + net) };
        });
    }, []);

    const value = useMemo(() => ({ session, record }), [session, record]);
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
