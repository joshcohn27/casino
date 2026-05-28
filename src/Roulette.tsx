import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ActionBar from "./shared/ActionBar";
import { type ChipDenomination, formatMoney } from "./shared/money";

// ─── Types ────────────────────────────────────────────────────────────────────

type RouletteNumber = number | "0" | "00";
type BetType =
    | "straight" | "split" | "street" | "corner" | "line" | "basket"
    | "red" | "black" | "even" | "odd" | "low" | "high"
    | "dozen1" | "dozen2" | "dozen3" | "column1" | "column2" | "column3";

type BetSpot = { id: string; label: string; type: BetType; numbers: RouletteNumber[]; payout: number; };
type SettledBet = { id: string; label: string; amount: number; won: boolean; payout: number; returned: number; };
type SpinResult = {
    result: RouletteNumber; color: "red" | "black" | "green";
    totalBet: number; totalReturn: number; net: number;
    winningBets: SettledBet[]; losingBets: SettledBet[];
};

// ─── Constants (game logic — untouched) ──────────────────────────────────────

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BLACK_NUMBERS = new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

const AMERICAN_WHEEL_ORDER: RouletteNumber[] = [
    "0",28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,
    "00",27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2,
];

const NUMBER_ROWS: number[][] = [
    [3, 6, 9,12,15,18,21,24,27,30,33,36],
    [2, 5, 8,11,14,17,20,23,26,29,32,35],
    [1, 4, 7,10,13,16,19,22,25,28,31,34],
];

const STREETS: number[][] = Array.from({length:12}, (_,i) => [i*3+1, i*3+2, i*3+3]);
const LINES:   number[][] = Array.from({length:11}, (_,i) => [i*3+1, i*3+2, i*3+3, i*3+4, i*3+5, i*3+6]);

const SPECIAL_ZERO_BETS = [
    { id:"split-0-00",        label:"0/00",        type:"split"  as BetType, numbers:["0","00"]    as RouletteNumber[], payout:17 },
    { id:"split-0-1",         label:"0/1",         type:"split"  as BetType, numbers:["0",1]       as RouletteNumber[], payout:17 },
    { id:"split-0-2",         label:"0/2",         type:"split"  as BetType, numbers:["0",2]       as RouletteNumber[], payout:17 },
    { id:"split-00-2",        label:"00/2",        type:"split"  as BetType, numbers:["00",2]      as RouletteNumber[], payout:17 },
    { id:"split-00-3",        label:"00/3",        type:"split"  as BetType, numbers:["00",3]      as RouletteNumber[], payout:17 },
    { id:"street-0-1-2",      label:"0/1/2",       type:"street" as BetType, numbers:["0",1,2]     as RouletteNumber[], payout:11 },
    { id:"street-00-2-3",     label:"00/2/3",      type:"street" as BetType, numbers:["00",2,3]    as RouletteNumber[], payout:11 },
    { id:"basket-top-line",   label:"0/00/1/2/3",  type:"basket" as BetType, numbers:["0","00",1,2,3] as RouletteNumber[], payout:6 },
];

const WHEEL_SLICE = 360 / AMERICAN_WHEEL_ORDER.length;
const BALL_TRACK_RADIUS = 99;
const BALL_VISUAL_OFFSET_DEG = 2.5;

// ─── Helpers (game logic — untouched) ────────────────────────────────────────

function getNumberColor(n: RouletteNumber): "red"|"black"|"green" {
    if (n === "0" || n === "00") return "green";
    return RED_NUMBERS.has(n as number) ? "red" : "black";
}

function makeComboId(prefix: string, values: number[]) {
    return `${prefix}-${[...values].sort((a,b)=>a-b).join("-")}`;
}
function makeComboLabel(values: number[]) {
    return [...values].sort((a,b)=>a-b).join("/");
}

function normalizeAngle(a: number) { return ((a%360)+360)%360; }
function getPocketCenterAngle(i: number) { return i*WHEEL_SLICE + WHEEL_SLICE/2; }

function getWheelStopRotation(cur: number, idx: number) {
    return cur + 360*6 + normalizeAngle(normalizeAngle(360-getPocketCenterAngle(idx)) - normalizeAngle(cur));
}
function getBallStopRotation(cur: number) {
    return cur - 360*9 + normalizeAngle(normalizeAngle(BALL_VISUAL_OFFSET_DEG) - normalizeAngle(cur));
}

// ─── Bet spot builder (game logic — untouched) ───────────────────────────────

function getAllBoardSpots(): BetSpot[] {
    const spots: BetSpot[] = [];
    spots.push({id:"straight-0",  label:"0",  type:"straight", numbers:["0"],  payout:35});
    spots.push({id:"straight-00", label:"00", type:"straight", numbers:["00"], payout:35});
    for (let n=1; n<=36; n++)
        spots.push({id:`straight-${n}`, label:String(n), type:"straight", numbers:[n], payout:35});

    SPECIAL_ZERO_BETS.forEach(b => spots.push({id:b.id, label:b.label, type:b.type, numbers:b.numbers, payout:b.payout}));

    const seenS = new Set<string>(), seenC = new Set<string>();
    for (let r=0; r<NUMBER_ROWS.length; r++) {
        for (let c=0; c<NUMBER_ROWS[r].length; c++) {
            const cur = NUMBER_ROWS[r][c];
            if (c < NUMBER_ROWS[r].length-1) {
                const id = makeComboId("split",[cur, NUMBER_ROWS[r][c+1]]);
                if (!seenS.has(id)) { seenS.add(id); spots.push({id, label:makeComboLabel([cur,NUMBER_ROWS[r][c+1]]), type:"split", numbers:[cur,NUMBER_ROWS[r][c+1]], payout:17}); }
            }
            if (r < NUMBER_ROWS.length-1) {
                const id = makeComboId("split",[cur, NUMBER_ROWS[r+1][c]]);
                if (!seenS.has(id)) { seenS.add(id); spots.push({id, label:makeComboLabel([cur,NUMBER_ROWS[r+1][c]]), type:"split", numbers:[cur,NUMBER_ROWS[r+1][c]], payout:17}); }
            }
            if (r < NUMBER_ROWS.length-1 && c < NUMBER_ROWS[r].length-1) {
                const vals=[cur, NUMBER_ROWS[r][c+1], NUMBER_ROWS[r+1][c], NUMBER_ROWS[r+1][c+1]];
                const id = makeComboId("corner",vals);
                if (!seenC.has(id)) { seenC.add(id); spots.push({id, label:makeComboLabel(vals), type:"corner", numbers:vals, payout:8}); }
            }
        }
    }
    STREETS.forEach((s,i) => spots.push({id:`street-${i+1}`, label:makeComboLabel(s), type:"street", numbers:s, payout:11}));
    LINES.forEach((l,i)   => spots.push({id:`line-${i+1}`,   label:makeComboLabel(l), type:"line",   numbers:l, payout:5}));

    spots.push({id:"dozen1", label:"1st 12", type:"dozen1", numbers:Array.from({length:12},(_,i)=>i+1),  payout:2});
    spots.push({id:"dozen2", label:"2nd 12", type:"dozen2", numbers:Array.from({length:12},(_,i)=>i+13), payout:2});
    spots.push({id:"dozen3", label:"3rd 12", type:"dozen3", numbers:Array.from({length:12},(_,i)=>i+25), payout:2});

    spots.push({id:"column1", label:"2 to 1", type:"column1", numbers:[1,4,7,10,13,16,19,22,25,28,31,34], payout:2});
    spots.push({id:"column2", label:"2 to 1", type:"column2", numbers:[2,5,8,11,14,17,20,23,26,29,32,35], payout:2});
    spots.push({id:"column3", label:"2 to 1", type:"column3", numbers:[3,6,9,12,15,18,21,24,27,30,33,36], payout:2});

    spots.push({id:"low",   label:"1 to 18",  type:"low",   numbers:Array.from({length:18},(_,i)=>i+1),   payout:1});
    spots.push({id:"even",  label:"EVEN",      type:"even",  numbers:Array.from({length:18},(_,i)=>(i+1)*2), payout:1});
    spots.push({id:"red",   label:"RED",       type:"red",   numbers:Array.from({length:36},(_,i)=>i+1).filter(n=>RED_NUMBERS.has(n)), payout:1});
    spots.push({id:"black", label:"BLACK",     type:"black", numbers:Array.from({length:36},(_,i)=>i+1).filter(n=>BLACK_NUMBERS.has(n)), payout:1});
    spots.push({id:"odd",   label:"ODD",       type:"odd",   numbers:Array.from({length:18},(_,i)=>i*2+1), payout:1});
    spots.push({id:"high",  label:"19 to 36",  type:"high",  numbers:Array.from({length:18},(_,i)=>i+19),  payout:1});
    return spots;
}

const ALL_SPOTS = getAllBoardSpots();
const SPOT_MAP  = new Map(ALL_SPOTS.map(s=>[s.id,s]));

// ─── SVG board geometry ───────────────────────────────────────────────────────

const CELL     = 50;   // number cell size
const ZW       = 55;   // zero-column width
const ZH       = 75;   // each zero cell height  (2 × 75 = 150 = CELL × 3)
const CBW      = 60;   // column-bet column width
const GRID_W   = CELL * 12;   // 600
const GRID_H   = CELL * 3;    // 150
const STREET_H = 30;
const DOZEN_H  = 38;
const OUT_H    = 38;
const SVG_W    = ZW + GRID_W + CBW;                        // 715
const SVG_H    = GRID_H + STREET_H + DOZEN_H + OUT_H;     // 256

// Number → (row, col) lookup
const NUM_POS: Record<number, {row:number; col:number}> = {};
NUMBER_ROWS.forEach((row,r) => row.forEach((n,c) => { NUM_POS[n] = {row:r, col:c}; }));

// Canonical chip position for every spot id
function chipXY(id: string): {x:number; y:number} | null {
    if (id === "straight-0")       return {x:ZW/2,          y:ZH/2};
    if (id === "straight-00")      return {x:ZW/2,          y:ZH+ZH/2};
    if (id === "split-0-00")       return {x:ZW/2,          y:ZH};
    if (id === "split-0-2")        return {x:ZW,            y:ZH*0.4};
    if (id === "split-0-1")        return {x:ZW,            y:ZH*0.8};
    if (id === "split-00-3")       return {x:ZW,            y:ZH+ZH*0.2};
    if (id === "split-00-2")       return {x:ZW,            y:ZH+ZH*0.6};
    if (id === "street-0-1-2")     return {x:ZW/2,          y:ZH-10};
    if (id === "street-00-2-3")    return {x:ZW/2,          y:ZH+10};
    if (id === "basket-top-line")  return {x:ZW/2,          y:ZH};

    const straight = id.match(/^straight-(\d+)$/);
    if (straight) {
        const p = NUM_POS[+straight[1]];
        return p ? {x: ZW+p.col*CELL+CELL/2, y: p.row*CELL+CELL/2} : null;
    }

    const street = id.match(/^street-(\d+)$/);
    if (street) {
        const col = +street[1]-1;
        return {x: ZW+col*CELL+CELL/2, y: GRID_H+STREET_H/2};
    }

    const split = id.match(/^split-(\d+)-(\d+)$/);
    if (split) {
        const pa = NUM_POS[+split[1]], pb = NUM_POS[+split[2]];
        if (!pa || !pb) return null;
        if (pa.row === pb.row) {
            return {x: ZW+Math.max(pa.col,pb.col)*CELL, y: pa.row*CELL+CELL/2};
        }
        return {x: ZW+pa.col*CELL+CELL/2, y: Math.max(pa.row,pb.row)*CELL};
    }

    const corner = id.match(/^corner-(\d+)-(\d+)-(\d+)-(\d+)$/);
    if (corner) {
        const ps = [1,2,3,4].map(i=>NUM_POS[+corner[i]]).filter(Boolean);
        if (ps.length < 4) return null;
        return {x: ZW+Math.max(...ps.map(p=>p.col))*CELL, y: Math.max(...ps.map(p=>p.row))*CELL};
    }

    if (id === "column3") return {x: ZW+GRID_W+CBW/2, y: 0*CELL+CELL/2};
    if (id === "column2") return {x: ZW+GRID_W+CBW/2, y: 1*CELL+CELL/2};
    if (id === "column1") return {x: ZW+GRID_W+CBW/2, y: 2*CELL+CELL/2};

    const DY = GRID_H+STREET_H+DOZEN_H/2;
    if (id === "dozen1") return {x: ZW+2*CELL,  y: DY};
    if (id === "dozen2") return {x: ZW+6*CELL,  y: DY};
    if (id === "dozen3") return {x: ZW+10*CELL, y: DY};

    const OW = GRID_W/6, OY = GRID_H+STREET_H+DOZEN_H+OUT_H/2;
    const outOrder = ["low","even","red","black","odd","high"];
    const oi = outOrder.indexOf(id);
    if (oi >= 0) return {x: ZW+oi*OW+OW/2, y: OY};

    return null;
}

// ─── Hover inference for the number grid ─────────────────────────────────────

type HoverBet = {
    spotId: string; label: string;
    hx: number; hy: number; hw: number; hh: number;
    chipX: number; chipY: number;
} | null;

const T = 10; // SVG-unit edge threshold

function inferGridBet(svgX: number, svgY: number): HoverBet {
    const gx = svgX - ZW;
    const gy = svgY;
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return null;

    const col  = Math.min(Math.floor(gx / CELL), 11);
    const row  = Math.min(Math.floor(gy / CELL), 2);
    const rx   = gx - col*CELL;
    const ry   = gy - row*CELL;

    const nearL = rx < T, nearR = rx > CELL-T;
    const nearT = ry < T, nearB = ry > CELL-T;
    const hasL = col > 0, hasR = col < 11;
    const hasT = row > 0, hasB = row < 2;

    const wantL = nearL && hasL, wantR = nearR && hasR;
    const wantT = nearT && hasT, wantB = nearB && hasB;

    // Left edge of leftmost column → street
    if (nearL && !hasL) {
        const id = `street-${col+1}`;
        const spot = SPOT_MAP.get(id);
        const xy = chipXY(id);
        if (!spot || !xy) return null;
        return {spotId:id, label:spot.label, hx:ZW+col*CELL, hy:0, hw:CELL, hh:GRID_H+STREET_H, chipX:xy.x, chipY:xy.y};
    }

    // Corners (highest priority among edge bets)
    const tryCorner = (r: number, c: number): HoverBet => {
        if (r < 0 || r > 1 || c < 0 || c > 10) return null;
        const vals = [NUMBER_ROWS[r][c], NUMBER_ROWS[r][c+1], NUMBER_ROWS[r+1][c], NUMBER_ROWS[r+1][c+1]];
        const id = makeComboId("corner", vals);
        const spot = SPOT_MAP.get(id);
        if (!spot) return null;
        return {spotId:id, label:spot.label, hx:ZW+c*CELL, hy:r*CELL, hw:CELL*2, hh:CELL*2, chipX:ZW+(c+1)*CELL, chipY:(r+1)*CELL};
    };

    if (wantR && wantB) { const h = tryCorner(row,   col  ); if (h) return h; }
    if (wantL && wantB) { const h = tryCorner(row,   col-1); if (h) return h; }
    if (wantR && wantT) { const h = tryCorner(row-1, col  ); if (h) return h; }
    if (wantL && wantT) { const h = tryCorner(row-1, col-1); if (h) return h; }

    // Horizontal splits (same row, adjacent column)
    const tryHSplit = (r: number, c1: number, c2: number): HoverBet => {
        const id = makeComboId("split",[NUMBER_ROWS[r][c1], NUMBER_ROWS[r][c2]]);
        const spot = SPOT_MAP.get(id);
        if (!spot) return null;
        const borderCol = Math.max(c1, c2);
        return {spotId:id, label:spot.label, hx:ZW+Math.min(c1,c2)*CELL, hy:r*CELL, hw:CELL*2, hh:CELL, chipX:ZW+borderCol*CELL, chipY:r*CELL+CELL/2};
    };
    if (wantR) { const h = tryHSplit(row, col, col+1); if (h) return h; }
    if (wantL) { const h = tryHSplit(row, col-1, col); if (h) return h; }

    // Vertical splits (same column, adjacent row)
    const tryVSplit = (r1: number, r2: number, c: number): HoverBet => {
        const id = makeComboId("split",[NUMBER_ROWS[r1][c], NUMBER_ROWS[r2][c]]);
        const spot = SPOT_MAP.get(id);
        if (!spot) return null;
        const borderRow = Math.max(r1, r2);
        return {spotId:id, label:spot.label, hx:ZW+c*CELL, hy:Math.min(r1,r2)*CELL, hw:CELL, hh:CELL*2, chipX:ZW+c*CELL+CELL/2, chipY:borderRow*CELL};
    };
    if (wantB) { const h = tryVSplit(row, row+1, col); if (h) return h; }
    if (wantT) { const h = tryVSplit(row-1, row, col); if (h) return h; }

    // Straight up
    const n = NUMBER_ROWS[row][col];
    const id = `straight-${n}`;
    const spot = SPOT_MAP.get(id);
    if (!spot) return null;
    return {spotId:id, label:spot.label, hx:ZW+col*CELL, hy:row*CELL, hw:CELL, hh:CELL, chipX:ZW+col*CELL+CELL/2, chipY:row*CELL+CELL/2};
}

// ─── Wheel SVG (logic untouched, rendered size reduced) ──────────────────────

function polarToCartesian(cx:number, cy:number, r:number, deg:number) {
    const rad = ((deg-90)*Math.PI)/180;
    return {x: cx+r*Math.cos(rad), y: cy+r*Math.sin(rad)};
}
function describeArc(cx:number, cy:number, rO:number, rI:number, s:number, e:number) {
    const oS=polarToCartesian(cx,cy,rO,e), oE=polarToCartesian(cx,cy,rO,s);
    const iS=polarToCartesian(cx,cy,rI,s), iE=polarToCartesian(cx,cy,rI,e);
    const laf = e-s<=180?"0":"1";
    return [
        `M ${oS.x} ${oS.y}`, `A ${rO} ${rO} 0 ${laf} 0 ${oE.x} ${oE.y}`,
        `L ${iS.x} ${iS.y}`, `A ${rI} ${rI} 0 ${laf} 1 ${iE.x} ${iE.y}`, "Z",
    ].join(" ");
}

function RouletteWheel({result, wheelRotation, ballRotation, spinning}: {
    result: RouletteNumber|null; wheelRotation:number; ballRotation:number; spinning:boolean;
}) {
    const cx=150, cy=150, outer=138, inner=100;
    return (
        <div className="flex flex-col items-center">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-amber-200/80 mb-2">Wheel</div>
            <div className="relative flex h-[260px] w-[260px] items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,231,170,0.2),rgba(111,53,9,0.35)_30%,rgba(42,21,6,0.75)_60%,rgba(10,5,2,0.95)_100%)] shadow-[0_16px_40px_rgba(0,0,0,0.5)]"/>
                <motion.div
                    animate={{rotate:wheelRotation}}
                    transition={{duration:spinning?4.8:0, ease:[0.16,1,0.3,1]}}
                    className="relative z-10"
                >
                    <svg viewBox="0 0 300 300" className="h-[244px] w-[244px] drop-shadow-[0_14px_28px_rgba(0,0,0,0.5)]">
                        <defs>
                            <radialGradient id="wWood" cx="50%" cy="42%" r="70%">
                                <stop offset="0%"   stopColor="#7a4718"/>
                                <stop offset="55%"  stopColor="#4f2508"/>
                                <stop offset="100%" stopColor="#2a1406"/>
                            </radialGradient>
                            <radialGradient id="wHub" cx="35%" cy="30%" r="70%">
                                <stop offset="0%"   stopColor="#fff3c4"/>
                                <stop offset="45%"  stopColor="#fbbf24"/>
                                <stop offset="100%" stopColor="#9a6700"/>
                            </radialGradient>
                        </defs>
                        <circle cx={cx} cy={cy} r={148} fill="#1b0c03" stroke="#f8d27a" strokeWidth="2.5"/>
                        <circle cx={cx} cy={cy} r={144} fill="url(#wWood)" stroke="#8d5a1c" strokeWidth="3"/>
                        {AMERICAN_WHEEL_ORDER.map((n,i) => {
                            const start=i*WHEEL_SLICE, end=(i+1)*WHEEL_SLICE, mid=getPocketCenterAngle(i);
                            const clr = getNumberColor(n);
                            const fill = clr==="red"?"#b91c1c":clr==="black"?"#111827":"#15803d";
                            const tp = polarToCartesian(cx,cy,119,mid);
                            return (
                                <g key={`${n}-${i}`}>
                                    <path d={describeArc(cx,cy,outer,inner,start,end)} fill={fill} stroke="#f8e7b0" strokeWidth="0.9"/>
                                    <text x={tp.x} y={tp.y} fill="#fff7db" fontSize={n==="0"||n==="00"?"10":"11"} fontWeight="800" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${mid} ${tp.x} ${tp.y})`}>{n}</text>
                                </g>
                            );
                        })}
                        <circle cx={cx} cy={cy} r={94} fill="#8b5a2b" stroke="#f8e7b0" strokeWidth="2"/>
                        <circle cx={cx} cy={cy} r={54} fill="#4c250b" stroke="#f8e7b0" strokeWidth="1.5"/>
                        <circle cx={cx} cy={cy} r={22} fill="url(#wHub)" stroke="#fff3c4" strokeWidth="2"/>
                        <circle cx={cx} cy={cy} r={9}  fill="#fff4d0" stroke="#d9a11f" strokeWidth="1.2"/>
                    </svg>
                </motion.div>
                <motion.div
                    animate={{rotate:ballRotation}}
                    transition={{duration:spinning?4.8:0, ease:[0.08,0.95,0.18,1]}}
                    className="pointer-events-none absolute inset-0 z-30"
                >
                    <div className="absolute left-1/2 top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 bg-[radial-gradient(circle_at_35%_35%,#fff,#d5d9e3)] shadow-[0_0_12px_rgba(255,255,255,0.5),0_2px_6px_rgba(0,0,0,0.4)]"
                        style={{transform:`translate(-50%,-50%) translateY(-${BALL_TRACK_RADIUS}px)`}}/>
                </motion.div>
                <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
                    <div className="rounded-full border border-white/15 bg-black/38 px-3 py-1.5 text-center backdrop-blur">
                        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200/90">Result</div>
                        <div className={`mt-0.5 text-xl font-extrabold ${
                            result==null ? "text-white"
                            : getNumberColor(result)==="red" ? "text-red-300"
                            : getNumberColor(result)==="black" ? "text-slate-100"
                            : "text-emerald-300"
                        }`}>{result ?? "—"}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── SVG Board ────────────────────────────────────────────────────────────────

function chipLabel(amount: number) {
    if (amount >= 1000) return `${amount/1000}K`;
    return String(amount);
}

function RouletteSVGBoard({bets, onBet, onRemove, canBet, selectedChip}: {
    bets: Record<string,number>;
    onBet: (id:string) => void;
    onRemove: (id:string) => void;
    canBet: boolean;
    selectedChip: number;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hover, setHover] = useState<HoverBet>(null);

    function toSVGCoords(e: React.MouseEvent) {
        const svg = svgRef.current;
        if (!svg) return null;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const m = svg.getScreenCTM();
        if (!m) return null;
        return pt.matrixTransform(m.inverse());
    }

    function handleGridMove(e: React.MouseEvent) {
        if (!canBet) { setHover(null); return; }
        const c = toSVGCoords(e);
        if (!c) return;
        setHover(inferGridBet(c.x, c.y));
    }

    function handleGridClick() {
        if (!canBet || !hover) return;
        onBet(hover.spotId);
    }

    // Static bet zones (outside the grid overlay)
    function zone(id: string, hx:number, hy:number, hw:number, hh:number) {
        const xy = chipXY(id);
        return {
            onMouseEnter: () => {
                if (!canBet || !xy) return;
                setHover({spotId:id, label:SPOT_MAP.get(id)?.label??id, hx, hy, hw, hh, chipX:xy.x, chipY:xy.y});
            },
            onMouseLeave: () => setHover(null),
            onClick: () => { if (canBet) { onBet(id); } },
            style: {cursor: canBet ? "pointer" as const : "default" as const},
        };
    }

    const DOZEN_Y = GRID_H + STREET_H;
    const OUT_Y   = DOZEN_Y + DOZEN_H;
    const OW      = GRID_W / 6;

    return (
        <svg ref={svgRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" className="select-none" style={{display:"block"}}>
            <defs>
                <radialGradient id="chipG" cx="35%" cy="30%" r="65%">
                    <stop offset="0%"   stopColor="#fde68a"/>
                    <stop offset="100%" stopColor="#c97c0a"/>
                </radialGradient>
                <radialGradient id="chipGh" cx="35%" cy="30%" r="65%">
                    <stop offset="0%"   stopColor="#fef3c7"/>
                    <stop offset="100%" stopColor="#f59e0b"/>
                </radialGradient>
            </defs>

            {/* ── Zero column ─────────────────────────────────────────── */}

            {/* 0 */}
            <rect x={0} y={0} width={ZW} height={ZH} rx={3} fill="#166534" stroke="#4ade80" strokeWidth="0.8" {...zone("straight-0",0,0,ZW,ZH)}/>
            <text x={ZW/2} y={ZH/2} textAnchor="middle" dominantBaseline="middle" fontSize="17" fontWeight="800" fill="#dcfce7" pointerEvents="none">0</text>

            {/* 00 */}
            <rect x={0} y={ZH} width={ZW} height={ZH} rx={3} fill="#166534" stroke="#4ade80" strokeWidth="0.8" {...zone("straight-00",0,ZH,ZW,ZH)}/>
            <text x={ZW/2} y={ZH+ZH/2} textAnchor="middle" dominantBaseline="middle" fontSize="17" fontWeight="800" fill="#dcfce7" pointerEvents="none">00</text>

            {/* 0/00 border split zone (thin band straddling the border) */}
            <rect x={0} y={ZH-8} width={ZW} height={16} fill="transparent" {...zone("split-0-00", 0, 0, ZW, ZH*2)} style={{cursor: canBet?"pointer":"default"}}/>

            {/* Right-edge zero splits — thin interactive strips */}
            <rect x={ZW-8} y={0}      width={16} height={ZH/2}   fill="transparent" {...zone("split-0-2",  0,0,ZW,ZH)}     style={{cursor:canBet?"pointer":"default"}}/>
            <rect x={ZW-8} y={ZH/2}   width={16} height={ZH/2}   fill="transparent" {...zone("split-0-1",  0,0,ZW,ZH)}     style={{cursor:canBet?"pointer":"default"}}/>
            <rect x={ZW-8} y={ZH}     width={16} height={ZH/2}   fill="transparent" {...zone("split-00-3", 0,ZH,ZW,ZH)}    style={{cursor:canBet?"pointer":"default"}}/>
            <rect x={ZW-8} y={ZH+ZH/2} width={16} height={ZH/2}  fill="transparent" {...zone("split-00-2", 0,ZH,ZW,ZH)}    style={{cursor:canBet?"pointer":"default"}}/>

            {/* ── Number grid background ──────────────────────────────── */}
            {NUMBER_ROWS.map((row,r) => row.map((n,c) => {
                const clr = getNumberColor(n);
                return (
                    <rect key={n}
                        x={ZW+c*CELL} y={r*CELL} width={CELL} height={CELL} rx={1}
                        fill={clr==="red"?"#991b1b":clr==="black"?"#0f172a":"#166534"}
                        stroke="rgba(255,255,255,0.12)" strokeWidth="0.5"
                    />
                );
            }))}

            {/* Number labels */}
            {NUMBER_ROWS.map((row,r) => row.map((n,c) => (
                <text key={`t${n}`}
                    x={ZW+c*CELL+CELL/2} y={r*CELL+CELL/2}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="13" fontWeight="700"
                    fill={getNumberColor(n)==="red"?"#fca5a5":"#e2e8f0"}
                    pointerEvents="none"
                >{n}</text>
            )))}

            {/* Grid overlay — single transparent rect handles all grid hover/click */}
            <rect
                x={ZW} y={0} width={GRID_W} height={GRID_H}
                fill="transparent"
                style={{cursor: canBet?"crosshair":"default"}}
                onMouseMove={handleGridMove}
                onMouseLeave={() => setHover(null)}
                onClick={handleGridClick}
            />

            {/* ── Street zones (bottom strip, one per grid column) ────── */}
            {STREETS.map((street,i) => {
                const id = `street-${i+1}`;
                return (
                    <g key={id}>
                        <rect x={ZW+i*CELL} y={GRID_H} width={CELL} height={STREET_H} rx={2}
                            fill="#1e3a5f" stroke="rgba(147,197,253,0.25)" strokeWidth="0.6"
                            {...zone(id, ZW+i*CELL, 0, CELL, GRID_H+STREET_H)}
                        />
                        <text x={ZW+i*CELL+CELL/2} y={GRID_H+STREET_H/2}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize="7.5" fontWeight="600" fill="#93c5fd" pointerEvents="none"
                        >{street[0]}–{street[2]}</text>
                    </g>
                );
            })}

            {/* ── Column bets (right edge) ─────────────────────────────── */}
            {(["column3","column2","column1"] as const).map((id,r) => (
                <g key={id}>
                    <rect x={ZW+GRID_W} y={r*CELL} width={CBW} height={CELL} rx={2}
                        fill="#1c1917" stroke="rgba(251,191,36,0.25)" strokeWidth="0.6"
                        {...zone(id, ZW+GRID_W, r*CELL, CBW, CELL)}
                    />
                    <text x={ZW+GRID_W+CBW/2} y={r*CELL+CELL/2}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize="10" fontWeight="700" fill="#fbbf24" pointerEvents="none"
                    >2:1</text>
                </g>
            ))}

            {/* ── Dozen zones ──────────────────────────────────────────── */}
            {(["dozen1","dozen2","dozen3"] as const).map((id,i) => (
                <g key={id}>
                    <rect x={ZW+i*4*CELL} y={DOZEN_Y} width={4*CELL} height={DOZEN_H} rx={2}
                        fill="#1c1917" stroke="rgba(251,191,36,0.2)" strokeWidth="0.6"
                        {...zone(id, ZW+i*4*CELL, DOZEN_Y, 4*CELL, DOZEN_H)}
                    />
                    <text x={ZW+i*4*CELL+2*CELL} y={DOZEN_Y+DOZEN_H/2}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize="11" fontWeight="700" fill="#fbbf24" pointerEvents="none"
                    >{SPOT_MAP.get(id)?.label}</text>
                </g>
            ))}

            {/* ── Outside bets ─────────────────────────────────────────── */}
            {(["low","even","red","black","odd","high"] as const).map((id,i) => {
                const isRed   = id==="red";
                const isBlack = id==="black";
                return (
                    <g key={id}>
                        <rect x={ZW+i*OW} y={OUT_Y} width={OW} height={OUT_H} rx={2}
                            fill={isRed?"#991b1b":isBlack?"#0f172a":"#1c1917"}
                            stroke={isRed?"rgba(252,165,165,0.3)":isBlack?"rgba(255,255,255,0.12)":"rgba(251,191,36,0.2)"}
                            strokeWidth="0.6"
                            {...zone(id, ZW+i*OW, OUT_Y, OW, OUT_H)}
                        />
                        {id==="red" && <circle cx={ZW+i*OW+OW/2-18} cy={OUT_Y+OUT_H/2} r={8} fill="#dc2626" pointerEvents="none"/>}
                        {id==="black" && <rect x={ZW+i*OW+OW/2-26} y={OUT_Y+OUT_H/2-8} width={16} height={16} rx={2} fill="#1e293b" stroke="#475569" strokeWidth="1" pointerEvents="none"/>}
                        <text x={ZW+i*OW+(id==="red"?OW/2+4:id==="black"?OW/2+13:OW/2)} y={OUT_Y+OUT_H/2}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize="10" fontWeight="700"
                            fill={isRed?"#fca5a5":isBlack?"#f1f5f9":"#fbbf24"}
                            pointerEvents="none"
                        >{SPOT_MAP.get(id)?.label}</text>
                    </g>
                );
            })}

            {/* ── Hover highlight ──────────────────────────────────────── */}
            {hover && (
                <rect
                    x={hover.hx} y={hover.hy} width={hover.hw} height={hover.hh}
                    fill="rgba(251,191,36,0.22)" stroke="rgba(251,191,36,0.85)" strokeWidth="1.5"
                    rx={2} pointerEvents="none"
                />
            )}

            {/* ── Hover chip preview ───────────────────────────────────── */}
            {hover && canBet && (
                <g pointerEvents="none" opacity={0.82}>
                    <circle cx={hover.chipX} cy={hover.chipY} r={15} fill="url(#chipGh)" stroke="#d97706" strokeWidth="1.5"/>
                    <circle cx={hover.chipX} cy={hover.chipY} r={12} fill="none" stroke="#fde68a" strokeWidth="0.8" strokeDasharray="2.5 2"/>
                    <text x={hover.chipX} y={hover.chipY} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="800" fill="#1c1917">
                        {chipLabel(selectedChip)}
                    </text>
                </g>
            )}

            {/* ── Placed chips (click to remove) ───────────────────────── */}
            {Object.entries(bets).map(([spotId, amount]) => {
                const pos = chipXY(spotId);
                if (!pos || amount <= 0) return null;
                return (
                    <g key={spotId}
                        style={{cursor: canBet?"pointer":"default"}}
                        onClick={(e) => { e.stopPropagation(); if (canBet) onRemove(spotId); }}
                    >
                        <circle cx={pos.x} cy={pos.y} r={15} fill="url(#chipG)" stroke="#92400e" strokeWidth="1.5"/>
                        <circle cx={pos.x} cy={pos.y} r={12} fill="none" stroke="#fde68a" strokeWidth="0.8" strokeDasharray="2.5 2"/>
                        <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="800" fill="#1c1917">
                            {chipLabel(amount)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ─── Rules modal ─────────────────────────────────────────────────────────────

function RulesModal({open, onClose}: {open:boolean; onClose:()=>void}) {
    if (!open) return null;
    return (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                <button className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" onClick={onClose} aria-label="Close"/>
                <motion.div initial={{opacity:0,y:20,scale:0.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:12,scale:0.98}} transition={{duration:0.2,ease:"easeOut"}}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[760px] overflow-hidden rounded-[1.5rem] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(7,20,14,0.98),rgba(3,10,7,0.98))] text-white shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90">Help</div>
                            <div className="text-xl font-extrabold text-amber-50">Roulette Rules</div>
                        </div>
                        <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-bold text-white/85 hover:bg-white/10">×</button>
                    </div>
                    <div className="max-h-[calc(88dvh-72px)] overflow-y-auto px-5 py-4 space-y-3 text-sm leading-6 text-emerald-50/90">
                        {([
                            ["How to Bet", [
                                "Select a chip from the bar at the bottom.",
                                "Click a number cell for a straight-up bet.",
                                "Click near the border between two numbers for a split.",
                                "Click near the corner where four numbers meet for a corner bet.",
                                "Click the blue strip below a column of 3 for a street bet.",
                                "Click dozen or outside bet zones at the bottom of the board.",
                                "Click any placed chip to remove it.",
                            ]],
                            ["Payouts", ["Straight up 35:1","Split 17:1","Street 11:1","Corner 8:1","Dozen / Column 2:1","Red/Black · Even/Odd · 1-18/19-36  1:1"]],
                            ["House Rules", ["American wheel — 38 pockets (0, 00, 1–36).","0 and 00 are green; not red/black, odd/even, or high/low.","Payouts include return of the original wager plus profit.","Six-line bets are not offered on this layout."]],
                        ] as [string, string[]][]).map(([title, items]) => (
                            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">{title}</div>
                                <div className="space-y-1">{items.map(s=><div key={s}>• {s}</div>)}</div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { bankroll:number; setBankroll: React.Dispatch<React.SetStateAction<number>>; }

export default function Roulette({bankroll, setBankroll}: Props) {
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(5);
    const [bets,         setBets]         = useState<Record<string,number>>({});
    const [message,      setMessage]      = useState("Click the layout to place bets, then spin.");
    const [isSpinning,   setIsSpinning]   = useState(false);
    const [lastResult,   setLastResult]   = useState<RouletteNumber|null>(null);
    const [spinSummary,  setSpinSummary]  = useState<SpinResult|null>(null);
    const [recentResults,setRecentResults]= useState<RouletteNumber[]>([]);
    const [wheelRotation,setWheelRotation]= useState(0);
    const [ballRotation, setBallRotation] = useState(0);
    const [showRules,    setShowRules]    = useState(false);

    const totalBet      = useMemo(()=>Object.values(bets).reduce((s,a)=>s+a,0), [bets]);
    const activeBetCount= useMemo(()=>Object.values(bets).filter(n=>n>0).length, [bets]);
    const canBet        = !isSpinning;

    // Game logic — untouched ──────────────────────────────────────────────────

    const placeBet = (spotId: string) => {
        if (!canBet) return;
        setBets(prev => ({...prev, [spotId]: (prev[spotId]||0)+selectedChip}));
        setMessage(`+${formatMoney(selectedChip)} on ${SPOT_MAP.get(spotId)?.label ?? "bet"}.`);
    };

    const removeBet = (spotId: string) => {
        if (!canBet) return;
        setBets(prev => {
            const cur = prev[spotId]||0;
            if (cur<=0) return prev;
            const next = {...prev};
            const amt = Math.max(0, cur-selectedChip);
            if (amt===0) delete next[spotId]; else next[spotId]=amt;
            return next;
        });
        setMessage(`Removed ${formatMoney(selectedChip)} from ${SPOT_MAP.get(spotId)?.label ?? "bet"}.`);
    };

    const clearBets = () => { if (!canBet) return; setBets({}); setMessage("All bets cleared."); };

    const repeatLastBets = () => {
        if (!canBet || !spinSummary) return;
        const r: Record<string,number> = {};
        [...spinSummary.winningBets, ...spinSummary.losingBets].forEach(b=>{ r[b.id]=b.amount; });
        setBets(r);
        setMessage("Repeated previous wager layout.");
    };

    const spinWheel = () => {
        if (isSpinning) return;
        if (totalBet<=0)        { setMessage("Place at least one bet before spinning."); return; }
        if (bankroll<totalBet)  { setMessage("Not enough bankroll."); return; }

        setBankroll(b=>b-totalBet);
        setIsSpinning(true);
        setSpinSummary(null);
        setMessage("No more bets. Spinning…");

        const winIdx = Math.floor(Math.random()*AMERICAN_WHEEL_ORDER.length);
        const result = AMERICAN_WHEEL_ORDER[winIdx];
        setWheelRotation(r=>getWheelStopRotation(r, winIdx));
        setBallRotation(r=>getBallStopRotation(r));

        window.setTimeout(() => {
            const winningBets: SettledBet[]=[], losingBets: SettledBet[]=[];
            let totalReturn=0;
            Object.entries(bets).forEach(([id,amount])=>{
                const spot = SPOT_MAP.get(id);
                if (!spot||amount<=0) return;
                const won = spot.numbers.includes(result);
                const returned = won ? amount+amount*spot.payout : 0;
                const settled: SettledBet = {id, label:spot.label, amount, won, payout:spot.payout, returned};
                if (won) { winningBets.push(settled); totalReturn+=returned; }
                else losingBets.push(settled);
            });
            const net=totalReturn-totalBet, color=getNumberColor(result);
            setBankroll(b=>b+totalReturn);
            setLastResult(result);
            setRecentResults(prev=>[result,...prev].slice(0,15));
            setSpinSummary({result,color,totalBet,totalReturn,net,winningBets,losingBets});
            setIsSpinning(false);
            setBets({});
            setMessage(winningBets.length>0
                ? `${result} ${color}. ${winningBets.length} winning bet${winningBets.length===1?"":"s"}.`
                : `${result} ${color}. No winning bets.`);
        }, 4850);
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            <RulesModal open={showRules} onClose={()=>setShowRules(false)}/>
            <TableShell
                feltColor="#1b6b3a"
                gameName="Roulette"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <ActionBar
                        selectedChip={selectedChip}
                        onChipSelect={setSelectedChip}
                        onDeal={spinWheel}
                        onClear={clearBets}
                        onDoubleAndDeal={repeatLastBets}
                        canDeal={!isSpinning && totalBet>0}
                        canClear={!isSpinning && totalBet>0}
                        canDoubleAndDeal={!isSpinning && spinSummary!==null}
                        disabled={isSpinning}
                        dealLabel="Spin"
                        doubleLabel="Repeat Last"
                    />
                }
            >
                {/* Table label */}
                <div className="mb-2 flex select-none flex-col items-center gap-1">
                    <div className="flex items-center gap-2">
                        <h1
                            className="text-2xl font-extrabold uppercase tracking-[0.18em] text-amber-100/90"
                            style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                        >
                            Roulette
                        </h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/25 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.15em] text-white/35">
                        <span>AMERICAN WHEEL</span>
                        <span className="text-white/20">·</span>
                        <span>38 POCKETS</span>
                        <span className="text-white/20">·</span>
                        <span>STRAIGHT UP PAYS 35 TO 1</span>
                    </div>
                </div>

                {/* Message bar */}
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <p className="text-sm font-semibold text-amber-50">{message}</p>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-white/60">
                        <span>{activeBetCount} spot{activeBetCount!==1?"s":""}</span>
                        <span className="font-bold text-amber-200">{formatMoney(totalBet)}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">

                    {/* ── Left sidebar ─────────────────────────────────── */}
                    <div className="flex shrink-0 flex-col gap-3 lg:w-[272px]">

                        <div className="flex justify-center">
                            <RouletteWheel result={lastResult} wheelRotation={wheelRotation} ballRotation={ballRotation} spinning={isSpinning}/>
                        </div>

                        {/* Recent results */}
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.22em] text-amber-200/80">Recent</div>
                            <div className="flex flex-wrap gap-1.5">
                                {recentResults.length===0
                                    ? <span className="text-xs text-white/50">No spins yet.</span>
                                    : recentResults.map((n,i)=>{
                                        const c=getNumberColor(n);
                                        return <div key={i} className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-extrabold ${c==="red"?"border-red-400/50 bg-red-500/20 text-red-100":c==="black"?"border-white/15 bg-slate-900/80 text-white":"border-emerald-400/40 bg-emerald-500/20 text-emerald-100"}`}>{n}</div>;
                                    })}
                            </div>
                        </div>

                        {/* Settlement */}
                        {spinSummary && (
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.22em] text-amber-200/80">Last Spin</div>
                                <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-center">
                                        <div className="text-white/55">Result</div>
                                        <div className={`font-extrabold ${spinSummary.color==="red"?"text-red-300":spinSummary.color==="black"?"text-white":"text-emerald-300"}`}>{spinSummary.result}</div>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-center">
                                        <div className="text-white/55">Net</div>
                                        <div className={`font-extrabold ${spinSummary.net>0?"text-emerald-300":spinSummary.net<0?"text-red-300":"text-amber-100"}`}>{formatMoney(spinSummary.net)}</div>
                                    </div>
                                </div>
                                <div className="max-h-[180px] space-y-1 overflow-y-auto">
                                    {spinSummary.winningBets.map(b=>(
                                        <div key={b.id} className="flex items-center justify-between rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1.5 text-xs">
                                            <span className="font-bold text-emerald-100">{b.label}</span>
                                            <span className="text-emerald-200">{formatMoney(b.returned)}</span>
                                        </div>
                                    ))}
                                    {spinSummary.losingBets.slice(0,7).map(b=>(
                                        <div key={b.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs">
                                            <span className="text-white/75">{b.label}</span>
                                            <span className="text-red-300">−{formatMoney(b.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Payout table */}
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.22em] text-amber-200/80">Payouts</div>
                            {[["Straight","35:1"],["Split","17:1"],["Street","11:1"],["Corner","8:1"],["Dozen / Column","2:1"],["Even money","1:1"]].map(([b,p])=>(
                                <div key={b} className="flex justify-between border-b border-white/5 py-1 text-xs text-white/75">
                                    <span>{b}</span><span className="font-bold text-amber-100">{p}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Board ────────────────────────────────────────── */}
                    <div className="min-w-0 flex-1">
                        <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                            <div className="mb-2 text-center text-[9px] font-extrabold uppercase tracking-[0.2em] text-amber-200/70">
                                Click number · edge for split · corner for corner · chip to remove
                            </div>
                            <RouletteSVGBoard
                                bets={bets}
                                onBet={placeBet}
                                onRemove={removeBet}
                                canBet={canBet}
                                selectedChip={selectedChip}
                            />
                        </div>
                    </div>
                </div>
            </TableShell>
        </>
    );
}
