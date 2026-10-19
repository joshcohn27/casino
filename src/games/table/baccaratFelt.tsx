import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import PlayingCard from "../../shared/components/Card";
import type { Card as SharedCard } from "../../shared/lib/cards";
import { ChipStack } from "../../shared/components/BetSpot";
import { formatMoney, type ChipDenomination } from "../../shared/lib/money";

// The Baccarat felt: the printed card boxes, the curved betting bands, and a card you can
// squeeze (peel up from an edge to see the pips before it turns over).

export type FeltSuit = "♠" | "♥" | "♦" | "♣";
export type FeltCard = { id: string; rank: string; suit: FeltSuit; baccaratValue: number };

// ─── Card sizes ───────────────────────────────────────────────────────────────

// --cw / --ch: card width and height. Bigger on a desktop, so there is room to peel.
export const CARD_VARS = "[--cw:56px] [--ch:80px] sm:[--cw:66px] sm:[--ch:94px] lg:[--cw:76px] lg:[--ch:106px]";
const CARD_SIZE = "h-[var(--ch)] w-[var(--cw)] rounded-[10px]";

function toShared(card: FeltCard, faceUp: boolean): SharedCard {
    return {
        id: card.id,
        suit: card.suit as SharedCard["suit"],
        rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"],
        faceUp,
    };
}

// ─── A full pip face ──────────────────────────────────────────────────────────

// Where the pips sit on a real card, as a share of its width and height. Squeezing from a long
// edge shows the side columns (how many pips down the side), from a short end the middle ones.
const SIDE_ROWS_6 = [[28, 18], [72, 18], [28, 50], [72, 50], [28, 82], [72, 82]];
const SIDE_ROWS_8 = [[28, 18], [72, 18], [28, 39], [72, 39], [28, 61], [72, 61], [28, 82], [72, 82]];
const PIPS: Record<string, number[][]> = {
    A: [[50, 50]],
    "2": [[50, 18], [50, 82]],
    "3": [[50, 18], [50, 50], [50, 82]],
    "4": [[28, 18], [72, 18], [28, 82], [72, 82]],
    "5": [[28, 18], [72, 18], [50, 50], [28, 82], [72, 82]],
    "6": SIDE_ROWS_6,
    "7": [...SIDE_ROWS_6, [50, 34]],
    "8": [...SIDE_ROWS_6, [50, 34], [50, 66]],
    "9": [...SIDE_ROWS_8, [50, 50]],
    "10": [...SIDE_ROWS_8, [50, 28], [50, 72]],
};

const isRed = (s: FeltSuit) => s === "♥" || s === "♦";

/** The face of a card with every pip in its place. Corner numbers only once it is turned over. */
function PipFace({ card, corners }: { card: FeltCard; corners: boolean }) {
    const color = isRed(card.suit) ? "#c81e1e" : "#111827";
    const court = card.rank === "J" || card.rank === "Q" || card.rank === "K";
    return (
        <div className="absolute inset-0 overflow-hidden rounded-[inherit] bg-white" style={{ color, border: "1px solid rgba(0,0,0,0.45)" }}>
            {court ? (
                // a picture card: a framed picture and no pips down the sides
                <div className="absolute flex flex-col items-center justify-center rounded-[3px]" style={{ inset: "13% 20%", border: `1.5px solid ${color}`, background: isRed(card.suit) ? "#fdecec" : "#eef1f6" }}>
                    <span className="font-bold leading-none" style={{ fontSize: "calc(var(--cw) * 0.42)" }}>{card.rank}</span>
                    <span className="leading-none" style={{ fontSize: "calc(var(--cw) * 0.26)" }}>{card.suit}</span>
                </div>
            ) : (
                (PIPS[card.rank] ?? []).map(([x, y], i) => (
                    <span
                        key={i}
                        className="absolute leading-none"
                        style={{
                            left: `${x}%`, top: `${y}%`,
                            fontSize: card.rank === "A" ? "calc(var(--cw) * 0.5)" : "calc(var(--cw) * 0.24)",
                            transform: `translate(-50%, -50%)${y > 50 ? " rotate(180deg)" : ""}`,
                        }}
                    >
                        {card.suit}
                    </span>
                ))
            )}
            {corners && (
                <>
                    <span className="absolute left-[5%] top-[3%] flex flex-col items-center font-bold leading-none" style={{ fontSize: "calc(var(--cw) * 0.2)" }}>
                        <span>{card.rank}</span><span style={{ fontSize: "calc(var(--cw) * 0.15)" }}>{card.suit}</span>
                    </span>
                    <span className="absolute bottom-[3%] right-[5%] flex rotate-180 flex-col items-center font-bold leading-none" style={{ fontSize: "calc(var(--cw) * 0.2)" }}>
                        <span>{card.rank}</span><span style={{ fontSize: "calc(var(--cw) * 0.15)" }}>{card.suit}</span>
                    </span>
                </>
            )}
        </div>
    );
}

// ─── A card dealt face down, peeled or turned over ────────────────────────────

type Edge = "left" | "right" | "top" | "bottom";
const PEEL_MAX = 0.8;      // as far as a peel goes before the card simply turns over
const PEEL_TURN = 0.55;    // let go past this and the card turns over

/**
 * One card in squeeze mode. Your own cards: drag in from any edge to peel it up and look, let go
 * and it drops back, or drag past halfway and it turns over. The dealer's cards: click to turn.
 * A number key or a double click turns any card over.
 */
export function SqueezeCard({ card, faceUp, mine, active, sideways, onTurn }: {
    card: FeltCard; faceUp: boolean; mine: boolean; active: boolean; sideways?: boolean; onTurn: () => void;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    const start = useRef<{ lx: number; ly: number; w: number; h: number; edge: Edge } | null>(null);
    const [peel, setPeel] = useState<{ edge: Edge; amount: number; dragging: boolean } | null>(null);
    const canPeel = mine && active && !faceUp;

    // the point under the finger, in the card's own coordinates (a third card lies sideways)
    const local = (e: React.PointerEvent) => {
        const r = ref.current!.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        return sideways ? { lx: py, ly: r.width - px, w: r.height, h: r.width } : { lx: px, ly: py, w: r.width, h: r.height };
    };
    const amountFor = (e: React.PointerEvent) => {
        const s = start.current!; const p = local(e);
        const d = s.edge === "left" ? (p.lx - s.lx) / s.w : s.edge === "right" ? (s.lx - p.lx) / s.w : s.edge === "top" ? (p.ly - s.ly) / s.h : (s.ly - p.ly) / s.h;
        return Math.max(0, Math.min(PEEL_MAX, d));
    };
    const turn = () => { start.current = null; setPeel(null); onTurn(); };

    const onPointerDown = (e: React.PointerEvent) => {
        if (!canPeel) return;
        const p = local(e);
        const u = p.lx / p.w, v = p.ly / p.h;
        const edges: [number, Edge][] = [[u, "left"], [1 - u, "right"], [v, "top"], [1 - v, "bottom"]];
        const edge = edges.sort((a, b) => a[0] - b[0])[0][1];
        start.current = { ...p, edge };
        ref.current!.setPointerCapture(e.pointerId);
        setPeel({ edge, amount: 0, dragging: true });
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!start.current) return;
        const amount = amountFor(e);
        if (amount >= PEEL_MAX) { turn(); return; }
        setPeel({ edge: start.current.edge, amount, dragging: true });
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!start.current) return;
        const amount = amountFor(e);
        if (amount >= PEEL_TURN) { turn(); return; }
        const edge = start.current.edge;
        start.current = null;
        setPeel({ edge, amount: 0, dragging: false });
    };

    // the face shows through the peeled strip, from the edge being lifted
    const a = peel ? peel.amount : 0;
    const hide = `${((1 - a) * 100).toFixed(1)}%`;
    const clip = !peel ? "inset(0 100% 0 0)"
        : peel.edge === "left" ? `inset(0 ${hide} 0 0)` : peel.edge === "right" ? `inset(0 0 0 ${hide})`
        : peel.edge === "top" ? `inset(0 0 ${hide} 0)` : `inset(${hide} 0 0 0)`;
    const fold: React.CSSProperties | null = !peel || a <= 0 ? null
        : peel.edge === "left" ? { left: `${a * 100}%`, top: 0, bottom: 0, width: 12, background: "linear-gradient(to right, rgba(0,0,0,0.35), transparent)" }
        : peel.edge === "right" ? { right: `${a * 100}%`, top: 0, bottom: 0, width: 12, background: "linear-gradient(to left, rgba(0,0,0,0.35), transparent)" }
        : peel.edge === "top" ? { top: `${a * 100}%`, left: 0, right: 0, height: 12, background: "linear-gradient(to bottom, rgba(0,0,0,0.35), transparent)" }
        : { bottom: `${a * 100}%`, left: 0, right: 0, height: 12, background: "linear-gradient(to top, rgba(0,0,0,0.35), transparent)" };

    return (
        <button
            ref={ref}
            type="button"
            className={`relative block ${CARD_SIZE} ${canPeel ? "cursor-grab active:cursor-grabbing" : active && !faceUp ? "cursor-pointer" : "cursor-default"}`}
            style={{ touchAction: canPeel ? "none" : undefined, transform: peel?.dragging ? "translateY(-2px)" : undefined }}
            data-card={card.id}
            data-face-up={faceUp ? "true" : "false"}
            data-key-reveal={active ? (faceUp ? "up" : "down") : undefined}
            data-mine={mine ? "true" : "false"}
            aria-label={faceUp ? `${card.rank} of ${card.suit}` : mine ? "Your card, face down. Drag from an edge to peel it." : "Dealer card, face down. Click to turn it over."}
            disabled={!active || faceUp}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            // the dealer's cards turn on a click; your own only on a double click or a number key
            onClick={(e) => { if (faceUp || !active) return; if (!mine || e.detail === 0 || e.detail >= 2) turn(); }}
        >
            <PlayingCard card={toShared(card, false)} className={CARD_SIZE} />
            {!faceUp && (
                <div
                    className="pointer-events-none absolute inset-0 rounded-[inherit]"
                    style={{ clipPath: clip, transition: peel?.dragging ? "none" : "clip-path 0.22s ease-out" }}
                    onTransitionEnd={() => { if (peel && !peel.dragging) setPeel(null); }}
                >
                    <PipFace card={card} corners={false} />
                </div>
            )}
            {fold && <div className="pointer-events-none absolute" style={fold} />}
            {faceUp && (
                <motion.div
                    className="pointer-events-none absolute inset-0 rounded-[inherit]"
                    initial={{ rotateY: 90 }}
                    animate={{ rotateY: 0 }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                >
                    <PipFace card={card} corners />
                </motion.div>
            )}
        </button>
    );
}

// ─── The printed card boxes ───────────────────────────────────────────────────

/**
 * One side's printed box on the felt: two cards, and a third laid sideways the way a dealer
 * deals it. The box keeps its size from the start, so nothing moves as cards arrive.
 */
export function CardBox({ label, total, outcome, children, third }: {
    label: string; total: number | null; outcome: "neutral" | "win" | "tie";
    children: React.ReactNode; third: React.ReactNode;
}) {
    const line = outcome === "win" ? "border-gold" : "border-white/35";
    return (
        <div className="flex flex-col items-center gap-1" data-card-box={label.toLowerCase()}>
            <div className={`text-[15px] font-extrabold tracking-[0.25em] ${outcome === "win" ? "text-gold" : "text-white/85"}`}>
                {label}<span className="inline-block w-8 text-center tabular-nums">{total ?? ""}</span>
            </div>
            <div className={`flex items-center gap-2 rounded-[10px] border-2 ${line} px-2 py-2 transition-colors`}>
                <div className="flex h-[var(--ch)] items-center gap-2">{children}</div>
                {/* the third card lies sideways in a square of its own */}
                <div className="flex h-[var(--ch)] w-[var(--ch)] items-center justify-center">{third}</div>
            </div>
        </div>
    );
}

/** A card that lies sideways (a third card). */
export function Sideways({ children }: { children: React.ReactNode }) {
    return <div className="rotate-90">{children}</div>;
}

/** An empty card place, so a box holds its size before its cards arrive. */
export function CardPlace() {
    return <div className="h-[var(--ch)] w-[var(--cw)]" />;
}

export { PlayingCard, toShared, CARD_SIZE };

// ─── The betting bands ────────────────────────────────────────────────────────

// The bands are drawn as arcs of big circles whose centre sits far above the layout, so they
// bow gently like the rows on a real table. Units are pixels down, and a share of the width across.
const W = 680, H = 260, CX = 340, CY = -1100, X0 = 30, X1 = 650;
const yAt = (r: number, x: number) => CY + Math.sqrt(r * r - (x - CX) * (x - CX));

type BandId = "tie" | "banker" | "player";
const BANDS: Record<BandId, { rIn: number; rOut: number }> = {
    tie: { rIn: 1150, rOut: 1196 },
    banker: { rIn: 1200, rOut: 1278 },
    player: { rIn: 1282, rOut: 1360 },
};
function bandBox(id: BandId) {
    const { rIn, rOut } = BANDS[id];
    return { top: Math.floor(yAt(rIn, X0)), bottom: Math.ceil(yAt(rOut, CX)) };
}
function bandPath(id: BandId) {
    const { rIn, rOut } = BANDS[id];
    const pts: string[] = [];
    for (let x = X0; x <= X1; x += 10) pts.push(`${x},${yAt(rIn, x).toFixed(1)}`);
    for (let x = X1; x >= X0; x -= 10) pts.push(`${x},${yAt(rOut, x).toFixed(1)}`);
    return `M${pts.join("L")}Z`;
}
const middle = (id: BandId, x: number) => (yAt(BANDS[id].rIn, x) + yAt(BANDS[id].rOut, x)) / 2;
const pct = (x: number) => `${(x / W) * 100}%`;
const CHIPS_X = 110;      // where a band's chips sit
const SIDE_X = 560;       // where the Dragon 7 and Panda 8 spots sit
const SIDE_DIM = 70;      // their size: room for the name on one line, in Large text too

export type BandBet = { chips: ChipDenomination[]; total: number; selected: boolean; winner: boolean };

function Band({ id, title, pays, paysLong, bet, canBet, onSelect, onRemove }: {
    id: BandId; title: string; pays?: string; paysLong?: string; bet: BandBet; canBet: boolean;
    onSelect: () => void; onRemove: () => void;
}) {
    const { top, bottom } = bandBox(id);
    const selected = canBet && bet.selected;
    const stroke = bet.winner ? "#fbbf24" : selected ? "#ffffff" : "rgba(255,255,255,0.5)";
    const fill = bet.winner || selected ? "rgba(0,0,0,0.32)" : "rgba(0,0,0,0.16)";
    const midX = middle(id, CX);
    const chipY = middle(id, CHIPS_X);
    return (
        <div className="pointer-events-none absolute inset-0" data-bet-spot={id} data-selected={selected ? "true" : "false"} data-total={bet.total}>
            {/* the band itself: only its painted shape takes clicks */}
            <button
                onClick={onSelect}
                disabled={!canBet}
                aria-pressed={selected}
                aria-label={`${title} bet`}
                className="pointer-events-none absolute left-0 right-0 block"
                style={{ top, height: bottom - top }}
            >
                <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 ${top} ${W} ${bottom - top}`} preserveAspectRatio="none">
                    <path
                        d={bandPath(id)}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={bet.winner || selected ? 3 : 2}
                        strokeDasharray={bet.winner || selected ? undefined : "7 6"}
                        vectorEffect="non-scaling-stroke"
                        style={{ pointerEvents: "visiblePainted", cursor: canBet ? "pointer" : "default", transition: "fill 0.15s" }}
                    />
                </svg>
            </button>
            {/* the printed name, across the middle of the band (a little left on a phone, clear of
                the Dragon 7 and Panda 8 chips) */}
            <div className="absolute left-[40%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center leading-tight sm:left-1/2" style={{ top: midX }}>
                <span className={`whitespace-nowrap font-extrabold tracking-[0.1em] sm:tracking-[0.25em] ${id === "tie" ? "text-[12px] sm:text-[13px]" : "text-[15px] sm:text-[17px]"} ${bet.winner ? "text-gold" : "text-white/90"}`}>{title}</span>
                {pays && <span className={`whitespace-nowrap text-[11px] font-semibold text-white/75 ${paysLong ? "sm:hidden" : ""}`}>{pays}</span>}
                {paysLong && <span className="hidden whitespace-nowrap text-[11px] font-semibold text-white/75 sm:inline">{paysLong}</span>}
            </div>
            {/* the chips, and how much is on the band */}
            <div className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full" style={{ left: pct(CHIPS_X), top: chipY + 14 }}>
                {bet.chips.length > 0 && <ChipStack chips={bet.chips} onRemove={canBet ? onRemove : undefined} />}
            </div>
            {bet.total > 0 && (
                <div className="absolute hidden -translate-y-1/2 whitespace-nowrap text-[12px] font-bold text-gold-soft sm:block" style={{ left: `calc(${pct(CHIPS_X)} + 30px)`, top: chipY }}>
                    {formatMoney(bet.total)}
                </div>
            )}
        </div>
    );
}

export type SideBet = BandBet & { onSelect: () => void; onRemove: () => void };

/**
 * The betting layout of an EZ Baccarat table: Tie across the top, then Banker, then Player
 * nearest you. Dragon 7 sits on the Banker row, Panda 8 on the Player row.
 */
export function BettingLayout({ bets, canBet, onSelect, onRemove, dragon, panda }: {
    bets: Record<BandId, BandBet>; canBet: boolean;
    onSelect: (id: BandId) => void; onRemove: (id: BandId) => void;
    dragon: SideBet; panda: SideBet;
}) {
    const side = (id: "dragon" | "panda", band: BandId, bet: SideBet, label: string, sub: string) => {
        const y = middle(band, SIDE_X);
        const selected = canBet && bet.selected;
        const ring = bet.winner ? "border-[3px] border-solid border-gold" : selected ? "border-[3px] border-solid border-white" : "border-2 border-dashed border-white/45";
        return (
            <div className="pointer-events-none absolute inset-0" data-bet-spot={id} data-selected={selected ? "true" : "false"} data-total={bet.total}>
                <button
                    onClick={bet.onSelect}
                    disabled={!canBet}
                    aria-pressed={selected}
                    className={`pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full leading-tight transition-colors ${ring} ${bet.winner || selected ? "bg-black/35" : "bg-black/20"} ${canBet ? "cursor-pointer hover:bg-black/40" : "cursor-default"}`}
                    style={{ left: pct(SIDE_X), top: y, width: SIDE_DIM, height: SIDE_DIM }}
                >
                    <span className="whitespace-nowrap text-[12px] font-bold text-white">{label}</span>
                    <span className="whitespace-nowrap text-[11px] text-white/80">{sub}</span>
                </button>
                {/* the chips sit just left of the spot, so two spots never cover each other */}
                <div className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full" style={{ left: `calc(${pct(SIDE_X)} - ${SIDE_DIM / 2 + 30}px)`, top: y + 14 }}>
                    {bet.chips.length > 0 && <ChipStack chips={bet.chips} onRemove={canBet ? bet.onRemove : undefined} />}
                </div>
                {bet.total > 0 && (
                    <div className="absolute hidden -translate-x-full -translate-y-1/2 whitespace-nowrap text-[12px] font-bold text-gold-soft sm:block" style={{ left: `calc(${pct(SIDE_X)} - ${SIDE_DIM / 2 + 60}px)`, top: y }}>
                        {formatMoney(bet.total)}
                    </div>
                )}
            </div>
        );
    };
    return (
        <div className="relative w-full max-w-[700px] select-none" style={{ height: H }} data-testid="betting-layout">
            <Band id="tie" title="TIE PAYS 8 TO 1" bet={bets.tie} canBet={canBet} onSelect={() => onSelect("tie")} onRemove={() => onRemove("tie")} />
            <Band id="banker" title="BANKER" pays="1 to 1" paysLong="1 to 1 · pushes on a 3-card 7" bet={bets.banker} canBet={canBet} onSelect={() => onSelect("banker")} onRemove={() => onRemove("banker")} />
            <Band id="player" title="PLAYER" pays="1 to 1" bet={bets.player} canBet={canBet} onSelect={() => onSelect("player")} onRemove={() => onRemove("player")} />
            {side("dragon", "banker", dragon, "Dragon 7", "40 to 1")}
            {side("panda", "player", panda, "Panda 8", "25 to 1")}
        </div>
    );
}
