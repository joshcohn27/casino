// Player settings: the bets each game starts with, kept in localStorage.
// Out of the box that is a $25 main bet and no side bets.
//
// A game reads its starting bets from here when it opens. The Settings page edits them.

const STORAGE_KEY = "casino-settings";

export type BetField = {
    key: string;
    label: string;
    /** Lowest bet allowed when the spot is used */
    min: number;
    max: number;
    /** true when the spot may be left empty */
    optional: boolean;
    /** Value on a fresh install */
    fallback: number;
    /** "credits" fields are whole numbers picked from a list, not dollar amounts */
    choices?: number[];
    unit?: "dollars" | "credits";
    /** Some tables only take bets in $2.50 steps */
    step?: number;
};

export type ToggleField = { key: string; label: string; hint: string; fallback: boolean };

export type GameSettings = { id: string; name: string; bets: BetField[]; toggles?: ToggleField[] };

const MAIN_MAX = 5000;
const main = (key: string, label: string, min = 5, fallback = 25): BetField => ({ key, label, min, max: MAIN_MAX, optional: false, fallback });
const side = (key: string, label: string, max: number, fallback = 0, min = 1): BetField => ({ key, label, min, max, optional: true, fallback });
// tables that round every bet down to a $2.50 step when the hand is dealt
const stepped = (f: BetField): BetField => ({ ...f, step: 2.5, min: Math.max(f.min, 2.5) });
const allStepped = (g: GameSettings): GameSettings => ({ ...g, bets: g.bets.map(stepped) });

export const GAME_SETTINGS: GameSettings[] = [
    allStepped({ id: "blackjack", name: "Blackjack", bets: [main("main", "Bet")] }),
    allStepped({ id: "freebetblackjack", name: "Free Bet Blackjack", bets: [main("main", "Bet"), side("push22", "Push 22", 100), side("potOfGold", "Pot of Gold", 100)] }),
    allStepped({ id: "doubledownmadness", name: "Double Down Madness", bets: [main("main", "Bet"), side("push22", "Push 22", 100)] }),
    { id: "sidebetblackjack", name: "Side Bet Blackjack", bets: [
        stepped(main("main", "Bet")),
        side("kingsBounty", "King's Bounty", 100), side("luckyLadies", "Lucky Ladies", 100), side("trilux", "TriLux", 100),
        side("matchDealer", "Match the Dealer", 100), side("fortune", "Fortune", 100),
    ], toggles: [{ key: "blazing", label: "Blazing 7s", hint: "Put the $5 Blazing 7s progressive bet on every hand automatically", fallback: false }] },
    allStepped({ id: "baccarat", name: "Baccarat", bets: [
        side("player", "Player", MAIN_MAX), side("banker", "Banker", MAIN_MAX), side("tie", "Tie", MAIN_MAX),
        side("panda", "Panda 8", MAIN_MAX), side("dragon", "Dragon 7", MAIN_MAX),
    ] }),
    allStepped({ id: "uth", name: "Ultimate Texas Hold'em", bets: [main("ante", "Ante (Blind matches)"), side("trips", "Trips", 100), side("six", "6 Card Bonus", 25, 0, 5)] }),
    allStepped({ id: "paigow", name: "Pai Gow Poker", bets: [main("main", "Main"), side("fortune", "Fortune", MAIN_MAX), side("aceHigh", "Ace High", MAIN_MAX)] }),
    { id: "threecardpoker", name: "Three Card Poker", bets: [main("ante", "Ante"), side("pairplus", "Pair Plus", MAIN_MAX), side("sixcard", "6 Card Bonus", MAIN_MAX)] },
    { id: "mississippistud", name: "Mississippi Stud", bets: [main("ante", "Ante"), side("bonus", "3 Card Bonus", MAIN_MAX)] },
    { id: "iluvsuits", name: "I Luv Suits", bets: [main("ante", "Ante"), side("flushRush", "Flush Rush", MAIN_MAX), side("superFlush", "Super Flush Rush", MAIN_MAX)] },
    { id: "djwild", name: "DJ Wild", bets: [main("ante", "Ante (Blind matches)"), side("trips", "Trips", MAIN_MAX), side("badBeat", "Two-Way Bad Beat", MAIN_MAX)],
      toggles: [{ key: "progressive", label: "Progressive", hint: "Put the $5 progressive bet on every hand automatically", fallback: false }] },
    { id: "casinowar", name: "Casino War", bets: [main("main", "Bet"), side("tie", "Tie", MAIN_MAX)] },
    { id: "videopoker", name: "Video Poker", bets: [
        { key: "credits", label: "Credits per hand", min: 1, max: 5, optional: false, fallback: 5, choices: [1, 2, 3, 4, 5], unit: "credits" },
        { key: "denom", label: "Coin size", min: 1, max: 25, optional: false, fallback: 1, choices: [1, 2, 5, 10, 25], unit: "dollars" },
    ] },
];

export type Settings = Record<string, Record<string, number | boolean>>;

/**
 * Nearest amount the chips can actually make, within the field's limits.
 * Chips come in $1 and $2.50 steps, so any whole dollar works, and halves from $2.50 up.
 */
export function sanitizeBet(field: BetField, value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return field.fallback;
    if (field.choices) {
        return field.choices.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), field.choices[0]);
    }
    if (n <= 0) return field.optional ? 0 : field.min;
    let v = field.step ? Math.max(field.step, Math.round(n / field.step) * field.step) : Math.round(n * 2) / 2;
    if (v % 1 !== 0 && v < 2.5) v = Math.ceil(v);
    v = Math.min(field.max, v);
    if (v < field.min) v = field.min;
    return v;
}

export function factorySettings(): Settings {
    const out: Settings = {};
    for (const g of GAME_SETTINGS) {
        out[g.id] = {};
        for (const b of g.bets) out[g.id][b.key] = b.fallback;
        for (const t of g.toggles ?? []) out[g.id][t.key] = t.fallback;
    }
    return out;
}

export function loadSettings(): Settings {
    const out = factorySettings();
    if (typeof window === "undefined") return out;
    let stored: unknown = null;
    try { stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"); } catch { stored = null; }
    if (!stored || typeof stored !== "object") return out;
    const saved = stored as Record<string, Record<string, unknown> | undefined>;
    for (const g of GAME_SETTINGS) {
        const s = saved[g.id];
        if (!s || typeof s !== "object") continue;
        for (const b of g.bets) if (b.key in s) out[g.id][b.key] = sanitizeBet(b, s[b.key]);
        for (const t of g.toggles ?? []) if (typeof s[t.key] === "boolean") out[g.id][t.key] = s[t.key] as boolean;
    }
    return out;
}

export function saveSettings(settings: Settings): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** The bet a game should start with on one of its spots. */
export function defaultBet(gameId: string, key: string): number {
    const v = loadSettings()[gameId]?.[key];
    return typeof v === "number" ? v : 0;
}

// ─── Display ──────────────────────────────────────────────────────────────────

const FONT_KEY = "casino-font-size";
export type FontSize = "normal" | "large";

export function loadFontSize(): FontSize {
    if (typeof window === "undefined") return "normal";
    return window.localStorage.getItem(FONT_KEY) === "large" ? "large" : "normal";
}

/** Put the chosen text size on the page. The stylesheet does the rest. */
export function applyFontSize(size: FontSize): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.font = size;
}

export function saveFontSize(size: FontSize): void {
    if (typeof window !== "undefined") window.localStorage.setItem(FONT_KEY, size);
    applyFontSize(size);
}

// applied as soon as the app loads, so every page opens at the chosen size
applyFontSize(loadFontSize());

/** An on/off setting for a game. */
export function defaultToggle(gameId: string, key: string): boolean {
    return loadSettings()[gameId]?.[key] === true;
}
