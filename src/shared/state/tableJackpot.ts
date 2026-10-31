// The table jackpot: one set of meters shared by every table that offers it (Pai Gow first),
// like a casino's linked table progressive.
//
//   $5 bet, switched on with a light at the table.
//   Ultra and Major: the two big meters. A top hand wins one of them, picked at random.
//   Must hit by $500: a third meter that is sure to hit before $500. When it resets, a hidden
//        point between its seed and $500 is chosen; the bet that carries the meter past that
//        point wins it, whether that is the player or someone at another table.
//   Below the meters, fixed amounts for strong hands (set by each game).
//
// The meters live in localStorage. Simulated players at other tables feed them and can win
// them, on the real clock: the other tables keep playing while you are away, and the meters
// catch up when you come back. With nobody at your table the must-hit pays every 0 to 3 days.
// The $5 is not returned on a win.

export const JACKPOT_BET = 5;
const STORAGE_KEY = "table-jackpot";

export type JackpotTier = "ultra" | "major" | "mustHit";

export const TIER_NAMES: Record<JackpotTier, string> = { ultra: "Ultra", major: "Major", mustHit: "Must Hit by $500" };

export const SEEDS: Record<JackpotTier, number> = { ultra: 100000, major: 10000, mustHit: 250 };
export const MUST_HIT_BY = 500;

/** What each $5 bet adds to each meter. The rest pays the fixed amounts and the house. */
const SHARES: Record<JackpotTier, number> = { ultra: 0.25, major: 0.1, mustHit: 0.05 };

/** Chance that one hand at a linked table is a top hand (five aces or a 7-card straight flush). */
const TOP_HAND_CHANCE = 1 / 150000;

export type Meters = Record<JackpotTier, number> & { /** the hidden point the must-hit meter pays at */ mustHitAt: number };

const cents = (n: number) => Math.round(n * 100) / 100;

/** A point between the must-hit seed and $500 where the must-hit meter will pay. */
function newTrigger(rng: () => number): number {
    return cents(SEEDS.mustHit + rng() * (MUST_HIT_BY - SEEDS.mustHit));
}

export function readJackpot(rng: () => number = Math.random): Meters {
    try {
        const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
        if (raw && ["ultra", "major", "mustHit", "mustHitAt"].every((k) => Number.isFinite(raw[k]))
            && raw.mustHit < MUST_HIT_BY && raw.mustHitAt <= MUST_HIT_BY && raw.ultra >= SEEDS.ultra && raw.major >= SEEDS.major) {
            return { ultra: raw.ultra, major: raw.major, mustHit: raw.mustHit, mustHitAt: raw.mustHitAt };
        }
    } catch { /* unreadable: start again */ }
    return { ultra: SEEDS.ultra, major: SEEDS.major, mustHit: SEEDS.mustHit, mustHitAt: newTrigger(rng) };
}

export function writeJackpot(m: Meters): void {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ }
}

/**
 * One $5 bet goes in. Returns the meters after it, and the must-hit amount if this bet was the
 * one that carried that meter past its point.
 */
export function placeBet(m: Meters, rng: () => number): { meters: Meters; mustHitWon: number } {
    const next: Meters = { ...m, ultra: cents(m.ultra + SHARES.ultra), major: cents(m.major + SHARES.major), mustHit: cents(m.mustHit + SHARES.mustHit) };
    if (next.mustHit >= next.mustHitAt) {
        // it never pays more than its limit, even if this bet carried it a few cents past
        const won = cents(Math.min(next.mustHit, MUST_HIT_BY));
        return { meters: { ...next, mustHit: SEEDS.mustHit, mustHitAt: newTrigger(rng) }, mustHitWon: won };
    }
    return { meters: next, mustHitWon: 0 };
}

/** A top hand wins the Ultra or the Major, picked at random, and that meter starts again. */
export function awardTopHand(m: Meters, rng: () => number): { meters: Meters; tier: "ultra" | "major"; amount: number } {
    const tier = rng() < 0.5 ? "ultra" : "major";
    return { meters: { ...m, [tier]: SEEDS[tier] }, tier, amount: cents(m[tier]) };
}

export type OtherWin = { tier: JackpotTier; amount: number };

// The linked tables, like a casino pit: the other game on the link is always open, Pai Gow table
// one is always open, table two most of the time, table three less often. Each deals a hand about
// every 90 seconds to 1 to 6 players, and about one player in six takes the $5 jackpot bet.
// That is about 70 jackpot bets an hour, so the must-hit climbs about $3.50 an hour on its own.
const LINKED_OPEN_CHANCE = [1, 1, 0.6, 0.4];
const LINKED_HAND_MS = 90000;
const LINKED_MAX_PLAYERS = 6;
const LINKED_JACKPOT_TAKE = 1 / 6;
export const LINKED_TICK_MS = 2500;
/** Longest time away that is caught up on: past this, the meters just pick up from there */
const MAX_CATCH_UP_MS = 30 * 24 * 60 * 60 * 1000;
const TIME_KEY = "table-jackpot-at";

/** The jackpot bets the other tables place over `ms` of real time. */
export function linkedBets(ms: number, rng: () => number): number {
    let bets = 0;
    for (let t = 0; t < ms; t += LINKED_TICK_MS) {
        for (const open of LINKED_OPEN_CHANCE) {
            if (rng() >= open || rng() >= LINKED_TICK_MS / LINKED_HAND_MS) continue;
            const players = 1 + Math.floor(rng() * LINKED_MAX_PLAYERS);
            for (let p = 0; p < players; p++) if (rng() < LINKED_JACKPOT_TAKE) bets++;
        }
    }
    return bets;
}

/**
 * Plays the other tables up to now, from the last time this ran (kept in localStorage), so the
 * meters move on the real clock. A win is only reported when it is fresh, not one from days ago.
 */
export function advanceLinkedTables(m: Meters, rng: () => number, now = Date.now()): { meters: Meters; win: OtherWin | null } {
    let last = now;
    try { last = Number(window.localStorage.getItem(TIME_KEY)) || now; } catch { /* blocked: no catch-up */ }
    try { window.localStorage.setItem(TIME_KEY, String(now)); } catch { /* storage full or blocked */ }
    const elapsed = Math.min(Math.max(now - last, 0), MAX_CATCH_UP_MS);
    const bets = linkedBets(elapsed, rng);
    if (bets === 0) return { meters: m, win: null };
    const next = simulateLinkedTables(m, bets, rng);
    return { meters: next.meters, win: elapsed <= LINKED_TICK_MS * 4 ? next.win : null };
}

/** Other people's $5 bets at linked tables: each feeds the meters and can win them. */
export function simulateLinkedTables(m: Meters, hands: number, rng: () => number): { meters: Meters; win: OtherWin | null } {
    let meters = m;
    let win: OtherWin | null = null;
    for (let i = 0; i < hands; i++) {
        const bet = placeBet(meters, rng);
        meters = bet.meters;
        if (bet.mustHitWon) win = { tier: "mustHit", amount: bet.mustHitWon };
        if (rng() < TOP_HAND_CHANCE) {
            const top = awardTopHand(meters, rng);
            meters = top.meters;
            win = { tier: top.tier, amount: top.amount };
        }
    }
    return { meters, win };
}
