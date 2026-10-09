// The DJ Wild progressive jackpot meter.
//
// It is kept in localStorage so it survives between visits, and it grows from three places:
// each progressive bet, a slow tick while someone sits at the DJ Wild table, and a small
// share of every wager made at any other game on the site. The last two stand in for the
// other players who would be feeding a real meter.

export const METER_STORAGE_KEY = "djwild-progressive-meter";
export const METER_SEED = 10000;

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

/** The next slow tick while the table is open: a few cents, varying with the clock. */
export function ambientTick(): number {
    return (1 + (Date.now() % 6)) / 100;
}
