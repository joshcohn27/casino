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
// them, the same way the DJ Wild meter works. The $5 is not returned on a win.

export const JACKPOT_BET = 5;
const STORAGE_KEY = "table-jackpot";

export type JackpotTier = "ultra" | "major" | "mustHit";

export const TIER_NAMES: Record<JackpotTier, string> = { ultra: "Ultra", major: "Major", mustHit: "Must Hit by $500" };

export const SEEDS: Record<JackpotTier, number> = { ultra: 100000, major: 10000, mustHit: 250 };
export const MUST_HIT_BY = 500;

/** What each $5 bet adds to each meter. The rest pays the fixed amounts and the house. */
const SHARES: Record<JackpotTier, number> = { ultra: 0.25, major: 0.1, mustHit: 0.15 };

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
