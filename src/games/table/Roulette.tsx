import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { BetBar } from "../../shared/components/BetSpot";
import { BTN_GOLD, BTN_NEUTRAL, type ChipDenomination, formatMoney, popLastChip } from "../../shared/lib/money";
import { RouletteWheel } from "./rouletteWheel";
import { RouletteBoard } from "./rouletteBoard";

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

// ─── Constants (game logic, untouched) ──────────────────────────────────────

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


// ─── Helpers (game logic, untouched) ────────────────────────────────────────

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


// ─── Bet spot builder (game logic, untouched) ───────────────────────────────

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

// ─── Table pieces ─────────────────────────────────────────────────────────────

const SPIN_MS = 4800;
const HOW_TO_BET = "Click a number, the line between two for a split, a corner for four, or a row's outer edge for a street.";

const PAYS: [string, string][] = [
    ["Straight up", "35 to 1"], ["Split", "17 to 1"], ["Street", "11 to 1"], ["Corner", "8 to 1"],
    ["Top line (0, 00, 1, 2, 3)", "6 to 1"], ["Dozen or column", "2 to 1"], ["Red, black, odd, even, 1 to 18, 19 to 36", "1 to 1"],
];

const RESULT_BG: Record<"red" | "black" | "green", string> = { red: "#b3171d", black: "#141414", green: "#0f7a3b" };

/** A result as a round marker in its own colour. */
function ResultDot({ n, big }: { n: RouletteNumber; big?: boolean }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full border border-white/70 font-extrabold text-white ${big ? "h-12 w-12 text-xl" : "h-7 w-7 text-[11px]"}`}
            style={{ background: RESULT_BG[getNumberColor(n)] }}
        >
            {n}
        </span>
    );
}

type Stage = "betting" | "spinning" | "done";

function RouletteBar({ stage, selectedChip, onChipSelect, totalBet, bankroll, onClear, onSpin, onChangeBet }: {
    stage: Stage; selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    totalBet: number; bankroll: number; onClear: () => void; onSpin: () => void; onChangeBet: () => void;
}) {
    const betting = stage === "betting", done = stage === "done", spinning = stage === "spinning";
    const canSpin = (betting || done) && totalBet > 0 && bankroll >= totalBet;
    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
            <ChipTray selectedChip={selectedChip} onSelect={onChipSelect} disabled={!betting} />
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {(betting || done) && (
                        <SlideBtn key="clear">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear} disabled={totalBet <= 0}>Clear</button>
                        </SlideBtn>
                    )}
                    {done && (
                        <SlideBtn key="change-bet">
                            <button data-hotkey="B" className={BTN_NEUTRAL} onClick={onChangeBet}>Change Bet</button>
                        </SlideBtn>
                    )}
                    {betting && (
                        <SlideBtn key="spin">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onSpin} disabled={!canSpin}>Spin</button>
                        </SlideBtn>
                    )}
                    {done && (
                        <SlideBtn key="rebet-spin">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onSpin} disabled={!canSpin}>Rebet &amp; Spin</button>
                        </SlideBtn>
                    )}
                    {spinning && (
                        <motion.span key="spinning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm italic text-white/75">
                            No more bets…
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
            <div className="invisible hidden sm:block">
                <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
            </div>
        </div>
    );
}

// ─── Rules modal ─────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;
    return (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close" />
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.2, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[640px] overflow-hidden rounded-[4px] border border-room-line bg-room-panel text-room-text"
                >
                    <div className="flex items-center justify-between border-b border-room-line px-5 py-4">
                        <div className="text-xl font-bold text-gold-soft">Roulette Rules</div>
                        <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-room-line bg-room-deep text-xl font-bold text-room-text hover:bg-room-raised" aria-label="Close rules">&times;</button>
                    </div>
                    <div className="max-h-[calc(88dvh-72px)] space-y-4 overflow-y-auto px-5 py-4 text-sm leading-6">
                        {([
                            ["How to bet", [
                                "Pick a chip at the bottom, then click the layout.",
                                "On a number: straight up. On the line between two numbers: a split. Where four numbers meet: a corner.",
                                "On the outer edge of a row of three (next to the dozens): a street.",
                                "The corner where 0 meets 1 and the dozens line: the top line, 0, 00, 1, 2 and 3.",
                                "Click a chip on the layout to take back the top chip.",
                            ]],
                            ["Pays", PAYS.map(([b, p]) => `${b}: ${p}`)],
                            ["House rules", [
                                "American wheel: 38 pockets, 0, 00 and 1 to 36.",
                                "0 and 00 are green: they are not red or black, odd or even, high or low.",
                                "A win returns your bet as well as what it pays.",
                                "Six-line bets are not offered on this layout.",
                            ]],
                        ] as [string, string[]][]).map(([title, items]) => (
                            <section key={title}>
                                <div className="mb-1 text-sm font-extrabold text-amber-200">{title}</div>
                                <ul className="space-y-1 text-room-text/90">{items.map((s) => <li key={s}>• {s}</li>)}</ul>
                            </section>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>>; }

export default function Roulette({ bankroll, setBankroll }: Props) {
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(5);
    const [bets, setBets] = useState<Record<string, number>>({});
    const [message, setMessage] = useState(HOW_TO_BET);
    const [stage, setStage] = useState<Stage>("betting");
    const [lastResult, setLastResult] = useState<RouletteNumber | null>(null);
    const [spinSummary, setSpinSummary] = useState<SpinResult | null>(null);
    const [recentResults, setRecentResults] = useState<RouletteNumber[]>([]);
    const [spin, setSpin] = useState<{ id: number; winIdx: number } | null>(null);
    const [showRules, setShowRules] = useState(false);

    const totalBet = useMemo(() => Object.values(bets).reduce((s, a) => s + a, 0), [bets]);
    const canBet = stage === "betting";
    const spinLock = useRef(false);

    const placeBet = (spotId: string) => {
        if (!canBet) return;
        setBets((prev) => ({ ...prev, [spotId]: (prev[spotId] || 0) + selectedChip }));
        setMessage(`${formatMoney(selectedChip)} on ${SPOT_MAP.get(spotId)?.label ?? "bet"}.`);
    };

    // clicking a chip on the layout takes back its top chip, as on every other table
    const removeBet = (spotId: string) => {
        if (!canBet) return;
        setBets((prev) => {
            const cur = prev[spotId] || 0;
            if (cur <= 0) return prev;
            const next = { ...prev };
            const amt = popLastChip(cur);
            if (amt <= 0) delete next[spotId]; else next[spotId] = amt;
            return next;
        });
    };

    const clearBets = () => {
        if (stage === "spinning") return;
        setBets({}); setStage("betting"); setSpinSummary(null);
        setMessage("Bets cleared.");
    };
    const changeBet = () => { setStage("betting"); setSpinSummary(null); setMessage(HOW_TO_BET); };

    const spinWheel = () => {
        if (stage === "spinning" || spinLock.current) return;
        if (totalBet <= 0) { setMessage("Place at least one bet before spinning."); return; }
        if (bankroll < totalBet) { setMessage("Not enough bankroll."); return; }
        spinLock.current = true;

        setBankroll((b) => b - totalBet);
        setStage("spinning");
        setSpinSummary(null);
        setMessage("No more bets. Spinning…");

        const winIdx = Math.floor(Math.random() * AMERICAN_WHEEL_ORDER.length);
        const result = AMERICAN_WHEEL_ORDER[winIdx];
        setSpin((s) => ({ id: (s?.id ?? 0) + 1, winIdx }));
        const placed = bets;

        window.setTimeout(() => {
            const winningBets: SettledBet[] = [], losingBets: SettledBet[] = [];
            let totalReturn = 0;
            Object.entries(placed).forEach(([id, amount]) => {
                const spot = SPOT_MAP.get(id);
                if (!spot || amount <= 0) return;
                const won = spot.numbers.includes(result);
                const returned = won ? amount + amount * spot.payout : 0;
                const settled: SettledBet = { id, label: spot.label, amount, won, payout: spot.payout, returned };
                if (won) { winningBets.push(settled); totalReturn += returned; }
                else losingBets.push(settled);
            });
            const net = totalReturn - totalBet, color = getNumberColor(result);
            setBankroll((b) => b + totalReturn);
            setLastResult(result);
            setRecentResults((prev) => [result, ...prev].slice(0, 15));
            setSpinSummary({ result, color, totalBet, totalReturn, net, winningBets, losingBets });
            setStage("done");
            spinLock.current = false;
            setMessage(winningBets.length > 0
                ? `${result} ${color}. ${winningBets.length} winning bet${winningBets.length === 1 ? "" : "s"}.`
                : `${result} ${color}. No winning bets.`);
        }, SPIN_MS + 150);
    };

    const winnerIdx = stage === "done" && lastResult !== null ? AMERICAN_WHEEL_ORDER.indexOf(lastResult) : null;
    const numbersOf = (id: string) => SPOT_MAP.get(id)?.numbers ?? [];

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell
                feltColor="#1b6b3a"
                gameName="Roulette"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <RouletteBar
                        stage={stage}
                        selectedChip={selectedChip}
                        onChipSelect={setSelectedChip}
                        totalBet={totalBet}
                        bankroll={bankroll}
                        onClear={clearBets}
                        onSpin={spinWheel}
                        onChangeBet={changeBet}
                    />
                }
            >
                <div className="flex flex-1 flex-col items-center gap-3">
                    {/* title */}
                    <div className="flex select-none flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-gold-soft">Roulette</h1>
                            <button
                                onClick={() => setShowRules(true)}
                                className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                                aria-label="Show rules"
                            >
                                i
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                            <span>American wheel</span>
                            <span>·</span>
                            <span>0 and 00</span>
                            <span>·</span>
                            <span>Straight up pays 35 to 1</span>
                        </div>
                    </div>

                    {/* the bet, what came back, and the net: centred under the title */}
                    <BetBar
                        pendingBet={stage === "done" && spinSummary ? spinSummary.totalBet : totalBet}
                        returned={spinSummary?.totalReturn ?? 0}
                        net={spinSummary?.net ?? 0}
                        showResult={stage === "done" && spinSummary !== null}
                    />

                    <div className="flex w-full flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
                        {/* the wheel, the last result, and the results so far */}
                        <div className="flex w-full flex-col items-center gap-3 lg:w-[340px] lg:shrink-0 lg:gap-2">
                            <RouletteWheel
                                order={AMERICAN_WHEEL_ORDER}
                                colorOf={getNumberColor}
                                spin={spin}
                                durationMs={SPIN_MS}
                                winnerIdx={winnerIdx}
                                size="h-[280px] w-[280px] sm:h-[320px] sm:w-[320px] lg:h-[280px] lg:w-[280px]"
                            />
                            {/* one line of fixed height: the result once the ball lands */}
                            <div className="flex h-12 items-center justify-center gap-3" data-testid="result">
                                {stage === "done" && lastResult !== null ? (
                                    <>
                                        <ResultDot n={lastResult} big />
                                        <span className="text-lg font-extrabold text-white">{getNumberColor(lastResult) === "green" ? "Green" : getNumberColor(lastResult) === "red" ? "Red" : "Black"}</span>
                                    </>
                                ) : (
                                    <span className="text-sm font-semibold text-white/60">{stage === "spinning" ? "Ball in play" : "Place your bets"}</span>
                                )}
                            </div>
                            {/* the last results, newest first, on one line */}
                            <div className="flex h-7 w-full max-w-[360px] items-center justify-center gap-1 overflow-hidden" data-testid="recent">
                                <span className="mr-1 shrink-0 text-[12px] font-bold text-amber-200">Recent</span>
                                {recentResults.length === 0
                                    ? <span className="text-[12px] text-white/60">No spins yet</span>
                                    : recentResults.slice(0, 10).map((n, i) => <ResultDot key={i} n={n} />)}
                            </div>
                        </div>

                        {/* bets: the bar, the message, and the layout */}
                        <div className="flex w-full min-w-0 max-w-[1000px] flex-col items-center gap-3 lg:flex-1 lg:gap-2">
                            <div className="flex min-h-[40px] w-full items-center justify-center px-2 text-center lg:min-h-[28px]" data-testid="status-line">
                                <p className="text-sm font-semibold leading-5 text-white/85">{message}</p>
                            </div>
                            <RouletteBoard
                                bets={bets}
                                onBet={placeBet}
                                onRemove={removeBet}
                                canBet={canBet}
                                result={stage === "done" ? lastResult : null}
                                numbersOf={numbersOf}
                                colorOf={getNumberColor}
                                done={stage === "done"}
                            />
                            {/* what each bet pays, printed on the felt */}
                            <div className="grid w-full max-w-[640px] grid-cols-1 gap-x-8 gap-y-0.5 text-[12px] sm:grid-cols-2" data-testid="pays">
                                {PAYS.map(([b, p]) => (
                                    <div key={b} className="flex justify-between gap-3 border-b border-white/10 py-0.5">
                                        <span className="text-white/85">{b}</span>
                                        <span className="shrink-0 font-bold text-gold">{p}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </TableShell>
        </>
    );
}
