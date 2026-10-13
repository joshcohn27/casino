import { createContext, useCallback, useContext } from "react";

// A session is a run of hands at one game: how many, how much was bet, and the net result.
// It is kept in local storage, so a refresh does not lose it. It starts again when a hand is
// played at a different game, or when the site is closed and opened again.

export const SESSION_KEY = "casino-session";
/** Kept for as long as the site stays open in this tab: its absence means a new visit. */
export const VISIT_KEY = "casino-visit";

export type Session = {
    /** The game the session belongs to, or null before any hand has been played. */
    gameId: string | null;
    hands: number;
    /** Total bet across those hands. */
    wagered: number;
    net: number;
};

export const EMPTY_SESSION: Session = { gameId: null, hands: 0, wagered: 0, net: 0 };

export type SessionValue = {
    session: Session;
    /**
     * Count a finished hand for a game. `adjust` changes the last hand's figures without
     * counting another hand, for a result that arrives in two parts.
     */
    record: (gameId: string, bet: number, net: number, adjust?: boolean) => void;
};

export const SessionContext = createContext<SessionValue | null>(null);

/** Which table a component belongs to, and whether it is the one on screen. */
export const TableContext = createContext<{ id: string; active: boolean } | null>(null);

/**
 * Returns a function a table calls when a hand is over: the total bet, and the net result.
 * A table that is being held in the background does not count hands.
 */
export function useHandRecorder(): (bet: number, net: number, adjust?: boolean) => void {
    const session = useContext(SessionContext);
    const table = useContext(TableContext);
    const record = session?.record;
    const id = table?.id;
    const active = table?.active;
    return useCallback((bet: number, net: number, adjust = false) => {
        if (!record || !id || !active) return;
        record(id, bet, net, adjust);
    }, [record, id, active]);
}
