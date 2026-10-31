// The Mississippi Stud progressive: a $5 bet switched on with a light, paid on the player's two
// cards and the three community cards. It stays in action after a fold.
//
// The pay table is the one on the Caesars rack card: three of a kind or better, with a Mega, Major
// and Minor meter for the top three hands. The card does not print the meter seeds, so those, and
// what each bet adds to the meters, are this site's own.
//
// The meters live in localStorage and run on the real clock: the same simulated linked tables as
// the Pai Gow jackpot feed them and can win them, at the real odds of each hand.

import { linkedBets } from "../../shared/state/tableJackpot";

export const STUD_PROGRESSIVE_BET = 5;
const STORAGE_KEY = "stud-progressive";
const TIME_KEY = "stud-progressive-at";

export type StudTier = "mega" | "major" | "minor";
export type StudMeters = Record<StudTier, number>;

export const STUD_TIER_NAMES: Record<StudTier, string> = { mega: "Mega", major: "Major", minor: "Minor" };
const SEEDS: StudMeters = { mega: 25000, major: 2500, minor: 500 };
/** What each $5 bet adds to each meter */
const SHARES: StudMeters = { mega: 0.25, major: 0.05, minor: 0.05 };

// Out of the 2,598,960 possible five-card hands
const POSSIBLE_HANDS = 2598960;
const HANDS: StudMeters = { mega: 4, major: 36, minor: 624 };

/** Longest time away that is caught up on */
const MAX_CATCH_UP_MS = 30 * 24 * 60 * 60 * 1000;
/** A hit by another table is announced only when it just happened, not days ago */
const FRESH_MS = 10000;

const cents = (n: number) => Math.round(n * 100) / 100;

/** The pay table, top down. A tier wins that whole meter; `pays` is a fixed amount, the $5 not returned. */
export const STUD_PROGRESSIVE_ROWS: { key: string; label: string; tier?: StudTier; pays?: number }[] = [
    { key: "royalFlush", label: "Royal Flush", tier: "mega" },
    { key: "straightFlush", label: "Straight Flush", tier: "major" },
    { key: "fourKind", label: "Four of a Kind", tier: "minor" },
    { key: "fullHouse", label: "Full House", pays: 250 },
    { key: "flush", label: "Flush", pays: 200 },
    { key: "straight", label: "Straight", pays: 150 },
    { key: "threeKind", label: "Three of a Kind", pays: 45 },
];

export function readStudMeters(): StudMeters {
    try {
        const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
        if (raw && (["mega", "major", "minor"] as const).every((t) => Number.isFinite(raw[t]) && raw[t] >= SEEDS[t])) {
            return { mega: raw.mega, major: raw.major, minor: raw.minor };
        }
    } catch { /* unreadable: start again */ }
    return { ...SEEDS };
}

export function writeStudMeters(m: StudMeters): void {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ }
}

/** One $5 bet goes in. */
export function feedStudMeters(m: StudMeters): StudMeters {
    return { mega: cents(m.mega + SHARES.mega), major: cents(m.major + SHARES.major), minor: cents(m.minor + SHARES.minor) };
}

/** A meter is won: it pays what it shows and starts again. */
export function awardStudTier(m: StudMeters, tier: StudTier): { meters: StudMeters; amount: number } {
    return { meters: { ...m, [tier]: SEEDS[tier] }, amount: cents(m[tier]) };
}

export type StudOtherHit = { tier: StudTier; amount: number };

/** Plays the other tables up to now, from the last time this ran. */
export function advanceStudTables(m: StudMeters, rng: () => number, now = Date.now()): { meters: StudMeters; hit: StudOtherHit | null } {
    let last = now;
    try { last = Number(window.localStorage.getItem(TIME_KEY)) || now; } catch { /* blocked: no catch-up */ }
    try { window.localStorage.setItem(TIME_KEY, String(now)); } catch { /* storage full or blocked */ }
    const elapsed = Math.min(Math.max(now - last, 0), MAX_CATCH_UP_MS);
    const bets = linkedBets(elapsed, rng);
    if (bets === 0) return { meters: m, hit: null };
    let meters = m;
    let hit: StudOtherHit | null = null;
    for (let i = 0; i < bets; i++) {
        meters = feedStudMeters(meters);
        const roll = rng() * POSSIBLE_HANDS;
        const tier: StudTier | null = roll < HANDS.mega ? "mega" : roll < HANDS.mega + HANDS.major ? "major" : roll < HANDS.mega + HANDS.major + HANDS.minor ? "minor" : null;
        if (tier) {
            const won = awardStudTier(meters, tier);
            meters = won.meters;
            hit = { tier, amount: won.amount };
        }
    }
    return { meters, hit: elapsed <= FRESH_MS ? hit : null };
}
