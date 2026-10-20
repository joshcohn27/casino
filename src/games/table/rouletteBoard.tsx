import { useState } from "react";
import { CHIP_COLORS, buildChipStackFromAmount, type ChipDenomination } from "../../shared/lib/money";

// The roulette layout, printed on the felt like a real table. Across on a wide screen; upright
// on a phone (zeros at the top, dozens and outside bets down the left), so it always fits the
// screen with no sideways scroll. Every bet is placed exactly where it is clicked: on a number,
// on the line between two numbers (split), where four meet (corner), or on the outer edge of a
// row of three (street). Text has fixed sizes, so it never shrinks below 10px.

type Num = number | "0" | "00";
type Color = "red" | "black" | "green";
type Rect = { x: number; y: number; w: number; h: number };

// ─── Geometry ─────────────────────────────────────────────────────────────────
// Positions are worked out in table terms first: u runs along the table (0 and 00 at u -1..0,
// the twelve rows of three at 0..12, the column bets at 12..13) and v runs across it (the three
// lanes at 0..3 with 1, 4, 7... in lane 0; the dozens at -1..0; the outside bets at -2..-1).
// Each layout then maps those onto the screen.

type Layout = { W: number; H: number; at: (u: number, v: number) => { x: number; y: number }; eu: number; ev: number };

// across: zeros on the left, 3 on the top row, dozens and outside bets underneath
const ACROSS: Layout = (() => {
    const Z = 1.15, Cb = 1.15, d = 0.8, o = 0.8;
    const mu = (u: number) => (u < 0 ? Z * (1 + u) : u <= 12 ? Z + u : Z + 12 + (u - 12) * Cb);
    const mv = (v: number) => (v >= 0 ? 3 - v : v >= -1 ? 3 - v * d : 3 + d + (-v - 1) * o);
    return { W: Z + 12 + Cb, H: 3 + d + o, at: (u, v) => ({ x: mu(u), y: mv(v) }), eu: 0.13, ev: 0.13 };
})();

// upright: zeros at the top, 1 2 3 across, column bets at the bottom, dozens and outside on the left
const UPRIGHT: Layout = (() => {
    const cw = 1.3, rh = 0.62, Dw = 0.9, Ow = 0.9, Zr = 0.75, Cr = 0.65;
    const mu = (u: number) => (u < 0 ? Zr * (1 + u) : u <= 12 ? Zr + u * rh : Zr + 12 * rh + (u - 12) * Cr);
    const mv = (v: number) => (v >= 0 ? Ow + Dw + v * cw : v >= -1 ? Ow + Dw + v * Dw : Ow + (v + 1) * Ow);
    return { W: Ow + Dw + 3 * cw, H: Zr + 12 * rh + Cr, at: (u, v) => ({ x: mv(v), y: mu(u) }), eu: 0.17, ev: 0.11 };
})();

function box(L: Layout, u0: number, u1: number, v0: number, v1: number): Rect {
    const a = L.at(u0, v0), b = L.at(u1, v1);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
const pctStyle = (L: Layout, r: Rect): React.CSSProperties => ({
    position: "absolute", left: `${(r.x / L.W) * 100}%`, top: `${(r.y / L.H) * 100}%`, width: `${(r.w / L.W) * 100}%`, height: `${(r.h / L.H) * 100}%`,
});

const sortedId = (prefix: string, ns: number[]) => `${prefix}-${[...ns].sort((a, b) => a - b).join("-")}`;
const cellOf = (n: number) => ({ c: Math.floor((n - 1) / 3), l: (n - 1) % 3 });

/** Every place a bet can go, in table terms, from lowest to highest priority. */
function hitZones(eu: number, ev: number) {
    const z: { id: string; u0: number; u1: number; v0: number; v1: number }[] = [];
    // straight up on each number, and the zeros
    for (let n = 1; n <= 36; n++) { const { c, l } = cellOf(n); z.push({ id: `straight-${n}`, u0: c, u1: c + 1, v0: l, v1: l + 1 }); }
    z.push({ id: "straight-0", u0: -1, u1: 0, v0: 0, v1: 1.5 });
    z.push({ id: "straight-00", u0: -1, u1: 0, v0: 1.5, v1: 3 });
    // splits along the table (n and n+3) and across it (n and n+1)
    for (let n = 1; n <= 36; n++) {
        const { c, l } = cellOf(n);
        if (c < 11) z.push({ id: sortedId("split", [n, n + 3]), u0: c + 1 - eu, u1: c + 1 + eu, v0: l + ev, v1: l + 1 - ev });
        if (l < 2) z.push({ id: sortedId("split", [n, n + 1]), u0: c + eu, u1: c + 1 - eu, v0: l + 1 - ev, v1: l + 1 + ev });
    }
    // streets: the outer edge of each row of three
    for (let c = 0; c < 12; c++) z.push({ id: `street-${c + 1}`, u0: c + eu, u1: c + 1 - eu, v0: -ev, v1: ev });
    // the zeros' own lines
    z.push({ id: "split-0-00", u0: -1 + eu, u1: -eu, v0: 1.5 - ev, v1: 1.5 + ev });
    z.push({ id: "split-0-1", u0: -eu, u1: eu, v0: ev, v1: 1 - ev });
    z.push({ id: "split-0-2", u0: -eu, u1: eu, v0: 1 + ev, v1: 1.5 - ev });
    z.push({ id: "split-00-2", u0: -eu, u1: eu, v0: 1.5 + ev, v1: 2 - ev });
    z.push({ id: "split-00-3", u0: -eu, u1: eu, v0: 2 + ev, v1: 3 - ev });
    // corners, where four numbers meet
    for (let n = 1; n <= 36; n++) {
        const { c, l } = cellOf(n);
        if (c < 11 && l < 2) z.push({ id: sortedId("corner", [n, n + 1, n + 3, n + 4]), u0: c + 1 - eu, u1: c + 1 + eu, v0: l + 1 - ev, v1: l + 1 + ev });
    }
    z.push({ id: "street-0-1-2", u0: -eu, u1: eu, v0: 1 - ev, v1: 1 + ev });
    z.push({ id: "street-00-2-3", u0: -eu, u1: eu, v0: 2 - ev, v1: 2 + ev });
    z.push({ id: "basket-top-line", u0: -eu, u1: eu, v0: -ev, v1: ev });
    return z;
}

// the printed outside areas
const COLUMNS = [{ id: "column1", v: 0 }, { id: "column2", v: 1 }, { id: "column3", v: 2 }];
const DOZENS = [{ id: "dozen1", label: "1st 12" }, { id: "dozen2", label: "2nd 12" }, { id: "dozen3", label: "3rd 12" }];
const OUTSIDE = [
    { id: "low", label: "1 to 18" }, { id: "even", label: "EVEN" }, { id: "red", label: "" },
    { id: "black", label: "" }, { id: "odd", label: "ODD" }, { id: "high", label: "19 to 36" },
];

const NUM_BG: Record<Color, string> = { red: "#b3171d", black: "#141414", green: "#0f7a3b" };

/** One small chip on the layout, in the colour of its biggest chip, with the amount on it. */
function LayoutChip({ amount, won, lost, onRemove, canRemove }: { amount: number; won: boolean; lost: boolean; onRemove: () => void; canRemove: boolean }) {
    const stack = buildChipStackFromAmount(amount);
    const top = (stack.length ? Math.max(...stack.map(Number)) : 5) as ChipDenomination;
    const cfg = CHIP_COLORS[top] ?? CHIP_COLORS[5];
    const label = amount >= 1000 ? `${amount / 1000}K` : String(amount);
    return (
        <button
            onClick={(e) => { e.stopPropagation(); if (canRemove) onRemove(); }}
            disabled={!canRemove}
            aria-label={`Remove chip, ${label}`}
            className={`absolute left-1/2 top-1/2 z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-extrabold leading-none transition-opacity sm:h-8 sm:w-8 ${lost ? "opacity-40" : ""} ${canRemove ? "cursor-pointer" : "cursor-default"}`}
            style={{
                backgroundColor: cfg.bg, border: `3px solid ${cfg.border}`, color: cfg.text,
                boxShadow: won ? "0 0 0 2px #fbbf24, 0 3px 8px rgba(0,0,0,0.5)" : "0 3px 8px rgba(0,0,0,0.5)",
            }}
            data-layout-chip
        >
            {label}
        </button>
    );
}

function Board({ L, upright, bets, onBet, onRemove, canBet, result, numbersOf, colorOf, done }: {
    L: Layout; upright: boolean;
    bets: Record<string, number>; onBet: (id: string) => void; onRemove: (id: string) => void; canBet: boolean;
    result: Num | null; numbersOf: (id: string) => Num[]; colorOf: (n: Num) => Color; done: boolean;
}) {
    const [hover, setHover] = useState<string | null>(null);
    const covered = new Set(hover && canBet ? numbersOf(hover) : []);
    const zones = hitZones(L.eu, L.ev);
    const zoneRect = new Map(zones.map((z) => [z.id, box(L, z.u0, z.u1, z.v0, z.v1)]));
    const outsideRect = (id: string): Rect | null => {
        const col = COLUMNS.find((c) => c.id === id); if (col) return box(L, 12, 13, col.v, col.v + 1);
        const di = DOZENS.findIndex((d) => d.id === id); if (di >= 0) return box(L, di * 4, di * 4 + 4, -1, 0);
        const oi = OUTSIDE.findIndex((o) => o.id === id); if (oi >= 0) return box(L, oi * 2, oi * 2 + 2, -2, -1);
        return null;
    };
    const won = (id: string) => done && result !== null && numbersOf(id).includes(result);
    const line = "border border-white/60";
    const printed = (id: string, label: React.ReactNode, extra = "") => {
        const r = outsideRect(id)!;
        const hit = done && won(id);
        return (
            <button
                key={id}
                onClick={() => canBet && onBet(id)}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
                disabled={!canBet}
                data-bet-spot={id}
                className={`${line} flex items-center justify-center font-bold text-white transition-colors ${canBet ? "cursor-pointer hover:bg-white/10" : "cursor-default"} ${hit ? "bg-amber-300/20" : ""} ${extra}`}
                style={pctStyle(L, r)}
            >
                <span className={upright ? "[writing-mode:vertical-rl] rotate-180" : ""}>{label}</span>
            </button>
        );
    };
    const diamond = (fill: string) => <span className="inline-block h-4 w-4 rotate-45 border border-white/70" style={{ background: fill }} />;

    return (
        <div className="relative isolate w-full select-none" style={{ aspectRatio: `${L.W} / ${L.H}` }} data-board={upright ? "upright" : "across"}>
            {/* the numbers, and 0 and 00 */}
            {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => {
                const { c, l } = cellOf(n);
                const r = box(L, c, c + 1, l, l + 1);
                const isResult = done && result === n;
                return (
                    <div key={n} className={`${line} flex items-center justify-center text-[15px] font-bold text-white sm:text-[17px]`} style={{ ...pctStyle(L, r), background: NUM_BG[colorOf(n)] }}>
                        {n}
                        {covered.has(n) && <div className="absolute inset-0 bg-white/25" />}
                        {isResult && <div className="absolute inset-0 border-[3px] border-gold" />}
                    </div>
                );
            })}
            {(["0", "00"] as const).map((z) => {
                const r = z === "0" ? box(L, -1, 0, 0, 1.5) : box(L, -1, 0, 1.5, 3);
                const isResult = done && result === z;
                return (
                    <div key={z} className={`${line} flex items-center justify-center text-[17px] font-bold text-white`} style={{ ...pctStyle(L, r), background: NUM_BG.green }}>
                        {z}
                        {covered.has(z) && <div className="absolute inset-0 bg-white/25" />}
                        {isResult && <div className="absolute inset-0 border-[3px] border-gold" />}
                    </div>
                );
            })}

            {/* outside bets, printed on the felt */}
            {COLUMNS.map((c) => printed(c.id, "2 to 1", "text-[12px] sm:text-[13px]"))}
            {DOZENS.map((d) => printed(d.id, d.label, "text-[13px] sm:text-[14px]"))}
            {OUTSIDE.map((o) => printed(o.id, o.id === "red" ? diamond("#b3171d") : o.id === "black" ? diamond("#141414") : o.label, "text-[12px] sm:text-[13px]"))}

            {/* the places to click on the numbers: whole numbers, lines, corners, edges */}
            {zones.map((z) => (
                <button
                    key={z.id}
                    onClick={() => canBet && onBet(z.id)}
                    onMouseEnter={() => setHover(z.id)}
                    onMouseLeave={() => setHover(null)}
                    disabled={!canBet}
                    aria-label={`Bet ${z.id.replace(/-/g, " ")}`}
                    data-bet-spot={z.id}
                    className={`z-10 ${canBet ? "cursor-pointer" : "cursor-default"}`}
                    style={pctStyle(L, zoneRect.get(z.id)!)}
                />
            ))}

            {/* the chips on the layout */}
            {Object.entries(bets).filter(([, a]) => a > 0).map(([id, amount]) => {
                const r = zoneRect.get(id) ?? outsideRect(id);
                if (!r) return null;
                return (
                    <div key={id} className="pointer-events-none z-30" style={pctStyle(L, r)}>
                        <div className="pointer-events-auto">
                            <LayoutChip amount={amount} won={won(id)} lost={done && !won(id)} canRemove={canBet} onRemove={() => onRemove(id)} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** The layout: across from 640px up, upright on a phone. */
export function RouletteBoard(props: {
    bets: Record<string, number>; onBet: (id: string) => void; onRemove: (id: string) => void; canBet: boolean;
    result: Num | null; numbersOf: (id: string) => Num[]; colorOf: (n: Num) => Color; done: boolean;
}) {
    return (
        <>
            <div className="hidden w-full sm:block"><Board L={ACROSS} upright={false} {...props} /></div>
            <div className="mx-auto w-full max-w-[420px] sm:hidden"><Board L={UPRIGHT} upright {...props} /></div>
        </>
    );
}
