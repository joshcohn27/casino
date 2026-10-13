// The DJ Wild progressive jackpot meter.
//
// It is kept in localStorage so it survives between visits. It grows from the player's own
// progressive bets, from a small share of every wager at the other games, and from
// simulated hands played by other people while the DJ Wild table is open. Those simulated
// players can also win: each of their hands has the real chance of hitting the jackpot.

export const METER_STORAGE_KEY = "djwild-progressive-meter";
export const METER_SEED = 10000;

/** What one $5 progressive bet adds to the meter (the table's published hold leaves about 16% for it) */
export const CONTRIBUTION_PER_HAND = 0.82;

// Out of the 2,869,685 possible five-card hands from the 53-card deck:
const POSSIBLE_HANDS = 2869685;
const FIVE_WILDS_HANDS = 1;      // wins the whole meter
const NATURAL_ROYAL_HANDS = 4;   // wins 10% of it
export const NATURAL_ROYAL_SHARE = 0.1;

/**
 * The meter never passes this. If nobody has hit it by the time it gets here, another
 * player is taken to have won it and it goes back to the seed.
 */
export const METER_CAP = 999999;

/** Share of each wager at other games that goes to the meter, and the most one wager can add */
const OTHER_GAME_SHARE = 0.01;
const OTHER_GAME_MAX = 2;

const cents = (n: number) => Math.round(n * 100) / 100;

export function readMeter(): number {
    if (typeof window === "undefined") return METER_SEED;
    const raw = Number(window.localStorage.getItem(METER_STORAGE_KEY));
    return Number.isFinite(raw) && raw >= METER_SEED * 0.5 ? raw : METER_SEED;
}

export function writeMeter(value: number): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(METER_STORAGE_KEY, String(cents(value)));
}

/** A wager placed at another game adds a little to the meter. */
export function feedMeterFromWager(wager: number): void {
    if (!(wager > 0)) return;
    const add = Math.min(OTHER_GAME_MAX, Math.max(0.01, cents(wager * OTHER_GAME_SHARE)));
    writeMeter(readMeter() + add);
}

// ─── Other players ────────────────────────────────────────────────────────────

export type OtherPlayerHit = { kind: "jackpot" | "royal"; amount: number };

/** A small random number generator of its own, so the meter never disturbs a game's shuffle. */
export function makeRng(seed: number): () => number {
    let s = (seed >>> 0) || 0x9e3779b9;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

/**
 * Play `hands` progressive bets by other people. Each one feeds the meter, and each has the
 * real chance of Five Wilds (whole meter, back to the seed) or a natural Royal (10% of it).
 * Returns the meter afterwards and the biggest hit, if there was one.
 */
export function simulateOtherPlayers(meter: number, hands: number, rng: () => number): { meter: number; hit: OtherPlayerHit | null } {
    let m = meter;
    let hit: OtherPlayerHit | null = null;
    for (let i = 0; i < hands; i++) {
        m += CONTRIBUTION_PER_HAND;
        const roll = rng() * POSSIBLE_HANDS;
        if (roll < FIVE_WILDS_HANDS) {
            hit = { kind: "jackpot", amount: cents(m) };
            m = METER_SEED;
        } else if (roll < FIVE_WILDS_HANDS + NATURAL_ROYAL_HANDS) {
            const amount = cents(m * NATURAL_ROYAL_SHARE);
            if (!hit || hit.kind !== "jackpot") hit = { kind: "royal", amount };
            m -= amount;
        }
    }
    // reached the cap without being hit: another player takes it
    if (m >= METER_CAP) {
        hit = { kind: "jackpot", amount: METER_CAP };
        m = METER_SEED;
    }
    return { meter: cents(m), hit };
}

/** How many other-player hands the next tick stands for: one to three, varying with the clock. */
export function ambientHands(): number {
    return 1 + (Date.now() % 3);
}
