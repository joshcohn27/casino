// Yearly stats, kept in this browser: every finished hand, Card Ladder runs, and bankroll
// resets and changes, added up by year. Nothing is sent anywhere. Stats start from the day this
// was added; there is nothing to show from before. Five years are kept (this one and the four
// before it); older years are removed the next time stats are saved.

const STATS_KEY = "casino-year-stats";
const YEARS_KEPT = 5;

export type GameYear = { hands: number; wagered: number; net: number; wins: number; losses: number; pushes: number };
export type Month = { hands: number; wagered: number; net: number };
export type Moment = { gameId: string; amount: number; date: string };
/** One kind of bet at one game: how often it was made, won and pushed, and what it hit. */
export type BetYear = { placed: number; won: number; pushed: number; wagered: number; returned: number; best: number; hits: Record<string, number> };

export type YearStats = {
    games: Record<string, GameYear>;
    /** January to December */
    months: Month[];
    /** by local date, "2026-10-25" */
    days: Record<string, { hands: number; net: number }>;
    bestWin: Moment | null;
    worstLoss: Moment | null;
    ladder: { runs: number; wins: number; won: number };
    bankroll: { resets: number; sets: number; added: number; removed: number };
    /** each bet on its own, by game then by bet name */
    bets?: Record<string, Record<string, BetYear>>;
    /** winning and losing runs of hands: the current run (plus for wins, minus for losses) and the longest */
    streak?: { now: number; longestWin: number; longestLoss: number };
    /** minutes at the tables, counting the time between hands up to a quarter of an hour */
    minutes?: number;
};

type Store = {
    years: Record<string, YearStats>;
    /** the last hand counted, so a result that settles in two parts corrects it instead of adding one */
    last: { year: string; month: number; day: string; gameId: string; bet: number; net: number } | null;
    /** when the last hand ended, for time played */
    lastAt?: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;

function emptyYear(): YearStats {
    return {
        games: {}, months: Array.from({ length: 12 }, () => ({ hands: 0, wagered: 0, net: 0 })), days: {},
        bestWin: null, worstLoss: null, ladder: { runs: 0, wins: 0, won: 0 }, bankroll: { resets: 0, sets: 0, added: 0, removed: 0 },
    };
}

function load(): Store {
    if (typeof window === "undefined") return { years: {}, last: null };
    try {
        const raw = JSON.parse(window.localStorage.getItem(STATS_KEY) ?? "null");
        if (raw && typeof raw === "object" && raw.years && typeof raw.years === "object") return { years: raw.years, last: raw.last ?? null, lastAt: raw.lastAt };
    } catch { /* unreadable: start over */ }
    return { years: {}, last: null };
}

function save(store: Store) {
    const oldest = new Date().getFullYear() - (YEARS_KEPT - 1);
    for (const year of Object.keys(store.years)) if (Number(year) < oldest) delete store.years[year];
    try { window.localStorage.setItem(STATS_KEY, JSON.stringify(store)); } catch { /* storage full or blocked: stats are not kept */ }
}

function today() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return { year: String(d.getFullYear()), month: d.getMonth(), day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
}

const outcome = (net: number): "wins" | "losses" | "pushes" => (net > 0 ? "wins" : net < 0 ? "losses" : "pushes");

/**
 * Count a finished hand. With `adjust`, bet and net are corrections to the last hand (a result
 * that arrived in two parts): no new hand is counted, and its win or loss is decided again.
 */
export function recordHandStat(gameId: string, bet: number, net: number, adjust = false) {
    const store = load();
    const t = today();
    const last = store.last;
    if (adjust && (!last || last.gameId !== gameId)) return;
    const at = adjust && last ? last : { ...t, gameId, bet: 0, net: 0 };
    const y = (store.years[at.year] ??= emptyYear());
    const g = (y.games[gameId] ??= { hands: 0, wagered: 0, net: 0, wins: 0, losses: 0, pushes: 0 });
    const m = y.months[at.month];
    const d = (y.days[at.day] ??= { hands: 0, net: 0 });

    if (adjust) g[outcome(at.net)] -= 1;
    else { g.hands += 1; m.hands += 1; d.hands += 1; }
    g.wagered = cents(g.wagered + bet); g.net = cents(g.net + net);
    m.wagered = cents(m.wagered + bet); m.net = cents(m.net + net);
    d.net = cents(d.net + net);

    const handNet = cents(at.net + net);
    g[outcome(handNet)] += 1;
    if (handNet > 0 && (!y.bestWin || handNet > y.bestWin.amount)) y.bestWin = { gameId, amount: handNet, date: at.day };
    if (handNet < 0 && (!y.worstLoss || handNet < y.worstLoss.amount)) y.worstLoss = { gameId, amount: handNet, date: at.day };

    // streaks: a correction can change which way the last hand went
    const st = (y.streak ??= { now: 0, longestWin: 0, longestLoss: 0 });
    // a correction first takes back the step the hand made before it was corrected
    if (adjust) { if (at.net > 0 && st.now > 0) st.now -= 1; else if (at.net < 0 && st.now < 0) st.now += 1; }
    if (handNet > 0) st.now = st.now > 0 ? st.now + 1 : 1;
    else if (handNet < 0) st.now = st.now < 0 ? st.now - 1 : -1;
    st.longestWin = Math.max(st.longestWin, st.now);
    st.longestLoss = Math.max(st.longestLoss, -st.now);
    if (!adjust) {
        const nowMs = Date.now();
        const gap = store.lastAt ? (nowMs - store.lastAt) / 60000 : 0;
        if (gap > 0 && gap <= 15) y.minutes = Math.round(((y.minutes ?? 0) + gap) * 10) / 10;
        store.lastAt = nowMs;
    }

    store.last = { year: at.year, month: at.month, day: at.day, gameId, bet: cents(at.bet + bet), net: handNet };
    save(store);
}

/**
 * One bet settled: how much was on it, how much came back (stake included), and what it hit
 * when it won (a hand name or a result, such as "Four of a Kind").
 */
export function recordBet(gameId: string, bet: string, wagered: number, returned: number, hit?: string) {
    if (!(wagered > 0)) return;
    const store = load();
    const y = (store.years[today().year] ??= emptyYear());
    const b = ((y.bets ??= {})[gameId] ??= {})[bet] ??= { placed: 0, won: 0, pushed: 0, wagered: 0, returned: 0, best: 0, hits: {} };
    b.placed += 1;
    b.wagered = cents(b.wagered + wagered);
    b.returned = cents(b.returned + returned);
    if (returned > wagered) {
        b.won += 1;
        b.best = Math.max(b.best, cents(returned - wagered));
        if (hit) b.hits[hit] = (b.hits[hit] ?? 0) + 1;
    } else if (returned === wagered) b.pushed += 1;
    save(store);
}

/** A Card Ladder run: whether it won, and how much it paid. */
export function recordLadderRun(won: boolean, prize: number) {
    const store = load();
    const y = (store.years[today().year] ??= emptyYear());
    y.ladder.runs += 1;
    if (won) { y.ladder.wins += 1; y.ladder.won = cents(y.ladder.won + prize); }
    save(store);
}

/** The bankroll was reset, or set by hand from one amount to another. */
export function recordBankrollChange(kind: "reset" | "set", from: number, to: number) {
    const store = load();
    const y = (store.years[today().year] ??= emptyYear());
    if (kind === "reset") y.bankroll.resets += 1; else y.bankroll.sets += 1;
    const change = cents(to - from);
    if (change > 0) y.bankroll.added = cents(y.bankroll.added + change);
    if (change < 0) y.bankroll.removed = cents(y.bankroll.removed - change);
    save(store);
}

/** Every year with stats (at most the last five). */
export function loadYearStats(): Record<string, YearStats> {
    return load().years;
}

export function clearYearStats() {
    try { window.localStorage.removeItem(STATS_KEY); } catch { /* nothing to clear */ }
}
