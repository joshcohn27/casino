import { useMemo, useState } from "react";
import { GAMES } from "../app/games";
import { BTN_BASE, formatMoney } from "../shared/lib/money";
import ConfirmDialog from "../shared/components/ConfirmDialog";
import { clearYearStats, loadYearStats, type BetYear, type YearStats } from "../shared/state/yearStats";

type Props = { onBack: () => void };

const BTN_PLAIN = `${BTN_BASE} border-room-line bg-room-deep text-room-text hover:bg-room-raised active:bg-room-panel`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// winning months up in green, losing months down in red (checked for colour-blind readers on this background)
const UP = "#059669", DOWN = "#ef4444";

const gameName = (id: string) => GAMES.find((g) => g.id === id)?.title ?? id;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${formatMoney(Math.abs(n))}`;
const netClass = (n: number) => (n > 0 ? "text-emerald-300" : n < 0 ? "text-red-300" : "text-room-text");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");
function dayLabel(day: string) {
    const [y, m, d] = day.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function playTime(minutes: number) {
    if (minutes < 1) return "-";
    const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** One game's bets, folded away until opened: how often each was made and won, and what it hit. */
function GameBets({ name, bets }: { name: string; bets: Record<string, BetYear> }) {
    const rows = Object.entries(bets).sort((a, b) => b[1].placed - a[1].placed);
    return (
        <details className="rounded-[4px] border border-room-line bg-room-deep" data-game-bets={name}>
            <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3 py-2 font-semibold text-room-text">
                <span>{name}</span>
                <span className="text-[12px] font-normal text-room-muted">{rows.length} bet{rows.length === 1 ? "" : "s"}</span>
            </summary>
            <div className="border-t border-room-line px-3 py-2">
                <table className="w-full table-fixed text-[13px] tabular-nums">
                    <thead>
                        <tr className="text-left text-room-muted">
                            <th className="w-[34%] py-1 font-semibold">Bet</th>
                            <th className="py-1 text-right font-semibold">Made</th>
                            <th className="py-1 text-right font-semibold">Won</th>
                            <th className="py-1 text-right font-semibold">Net</th>
                            <th className="hidden py-1 text-right font-semibold sm:table-cell">Returned</th>
                            <th className="hidden py-1 text-right font-semibold sm:table-cell">Biggest</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(([bet, b]) => {
                            const net = b.returned - b.wagered;
                            const hits = Object.entries(b.hits).sort((x, y) => y[1] - x[1]);
                            return (
                                <tr key={bet} className="border-t border-room-line align-top" data-bet-row={bet}>
                                    <td className="py-1.5 pr-2">
                                        <span className="text-room-text">{bet}</span>
                                        {hits.length > 0 && (
                                            <span className="mt-0.5 block text-[11px] leading-4 text-room-muted">
                                                {hits.slice(0, 6).map(([h, n]) => `${h} ×${n}`).join(", ")}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-1.5 text-right">{b.placed.toLocaleString("en-US")}</td>
                                    <td className="py-1.5 text-right">{pct(b.won, b.placed)}</td>
                                    <td className={`py-1.5 text-right font-semibold ${netClass(net)}`}>{signed(net)}</td>
                                    <td className="hidden py-1.5 text-right sm:table-cell">{pct(b.returned, b.wagered)}</td>
                                    <td className="hidden py-1.5 text-right sm:table-cell">{b.best > 0 ? `+${formatMoney(b.best)}` : "-"}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </details>
    );
}

// 54o reads "5 4 off", 73s "7 3 suited", AA "A A"
function startingHandLabel(hand: string): string {
    const rank = (c: string) => (c === "T" ? "10" : c);
    const pair = `${rank(hand[0])} ${rank(hand[1])}`;
    return hand[2] === "s" ? `${pair} suited` : hand[2] === "o" ? `${pair} off` : pair;
}

const TOP_HANDS_SHOWN = 20;
type HandSort = "dealt" | "win";

/** Ultimate Texas Hold'em, by starting hand: the 169 kinds of two cards, as many as have come up. */
function StartingHands({ bets }: { bets: Record<string, BetYear> }) {
    const [sort, setSort] = useState<HandSort>("dealt");
    const [showAll, setShowAll] = useState(false);
    const rows = Object.entries(bets)
        .filter(([name]) => name.startsWith("Hole "))
        .map(([name, b]) => {
            const hand = name.slice(5);
            const folded = bets[`Fold ${hand}`]?.placed ?? 0;
            return { hand, b, folded, played: b.placed - folded, net: b.returned - b.wagered };
        })
        .sort((x, y) => (sort === "dealt"
            ? y.b.placed - x.b.placed
            : y.b.won / y.b.placed - x.b.won / x.b.placed || y.b.placed - x.b.placed));
    const shown = showAll ? rows : rows.slice(0, TOP_HANDS_SHOWN);
    return (
        <>
            <p className="mb-2 text-[12px] text-room-muted">
                {rows.length} of the 169 starting hands so far. Won means your Ante, Blind and Play came back ahead, and win % counts every time you were dealt the hand, folds included.
            </p>
            <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Sort starting hands">
                {([["dealt", "Most dealt"], ["win", "Best win %"]] as const).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setSort(key)}
                        aria-pressed={sort === key}
                        className={`min-h-[44px] rounded-[4px] border-2 border-room-line px-3 text-sm font-bold transition-colors ${sort === key ? "bg-room-red text-room-text" : "bg-room-deep text-room-muted hover:text-room-text"}`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <table className="w-full table-fixed text-[13px] tabular-nums sm:text-sm">
                <thead>
                    <tr className="text-left text-room-muted">
                        <th className="w-[34%] py-1 font-semibold sm:w-[22%]">Hand</th>
                        <th className="py-1 text-right font-semibold">Dealt</th>
                        <th className="py-1 text-right font-semibold">Won</th>
                        <th className="py-1 text-right font-semibold">Win %</th>
                        <th className="hidden py-1 text-right font-semibold sm:table-cell">Folded</th>
                        <th className="hidden py-1 text-right font-semibold sm:table-cell">Win % when played</th>
                        <th className="hidden py-1 text-right font-semibold sm:table-cell">Net</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map(({ hand, b, folded, played, net }) => (
                        <tr key={hand} className="border-t border-room-line" data-starting-hand={hand}>
                            <td className="py-1.5 font-bold">{startingHandLabel(hand)}</td>
                            <td className="py-1.5 text-right">{b.placed.toLocaleString("en-US")}</td>
                            <td className="py-1.5 text-right">{b.won.toLocaleString("en-US")}</td>
                            <td className={`py-1.5 text-right font-semibold ${b.won > 0 ? "text-emerald-300" : ""}`}>{pct(b.won, b.placed)}</td>
                            <td className="hidden py-1.5 text-right sm:table-cell">{folded.toLocaleString("en-US")}</td>
                            <td className="hidden py-1.5 text-right sm:table-cell">{pct(b.won, played)}</td>
                            <td className={`hidden py-1.5 text-right font-semibold sm:table-cell ${netClass(net)}`}>{signed(net)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {rows.length > TOP_HANDS_SHOWN && (
                <button className="mt-1 min-h-[44px] px-2 text-sm text-room-muted underline hover:text-room-text" onClick={() => setShowAll((on) => !on)}>
                    {showAll ? `Show the top ${TOP_HANDS_SHOWN}` : `Show all ${rows.length}`}
                </button>
            )}
        </>
    );
}

/** The deal number 1 to 7 with the highest win %. A tie goes to the one with more hands behind it. */
function luckiestNumber(bets: Record<string, BetYear>): { n: number; b: BetYear } | null {
    let best: { n: number; b: BetYear } | null = null;
    for (let n = 1; n <= 7; n++) {
        const b = bets[`Deal number ${n}`];
        if (!b || b.won === 0) continue;
        const rate = b.won / b.placed, bestRate = best ? best.b.won / best.b.placed : -1;
        if (rate > bestRate || (rate === bestRate && best && b.placed > best.b.placed)) best = { n, b };
    }
    return best;
}

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
    return (
        <section className="rounded-[4px] border border-room-line bg-room-panel p-4" data-testid={testId}>
            <h2 className="mb-3 text-room-text">{title}</h2>
            {children}
        </section>
    );
}

function Figure({ label, value, sub, valueClass = "text-room-text" }: { label: string; value: string; sub?: string; valueClass?: string }) {
    return (
        <div className="flex min-w-0 flex-col">
            <span className="text-sm text-room-muted">{label}</span>
            <span className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</span>
            {sub && <span className="text-[12px] text-room-muted">{sub}</span>}
        </div>
    );
}

/** Net by month: bars up from the zero line for a winning month, down for a losing one. */
function MonthChart({ year }: { year: YearStats }) {
    const [hover, setHover] = useState<number | null>(null);
    const [asTable, setAsTable] = useState(false);
    const top = Math.max(1, ...year.months.map((m) => Math.abs(m.net)));
    const HALF = 90; // px from the zero line to the top (or bottom) of the chart

    if (asTable) {
        return (
            <div>
                <table className="w-full text-sm tabular-nums" data-testid="month-table">
                    <thead><tr className="text-left text-room-muted"><th className="py-1 font-semibold">Month</th><th className="py-1 text-right font-semibold">Hands</th><th className="py-1 text-right font-semibold">Bet</th><th className="py-1 text-right font-semibold">Net</th></tr></thead>
                    <tbody>
                        {year.months.map((m, i) => (
                            <tr key={i} className="border-t border-room-line">
                                <td className="py-1">{MONTHS[i]}</td>
                                <td className="py-1 text-right">{m.hands}</td>
                                <td className="py-1 text-right">{formatMoney(m.wagered)}</td>
                                <td className={`py-1 text-right font-semibold ${netClass(m.net)}`}>{m.hands ? signed(m.net) : "-"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <button className={`${BTN_PLAIN} mt-3`} onClick={() => setAsTable(false)}>Show chart</button>
            </div>
        );
    }

    return (
        <div>
            <div className="relative flex items-stretch gap-1 sm:gap-2" style={{ height: HALF * 2 }} data-testid="month-chart">
                {/* the zero line */}
                <div className="pointer-events-none absolute inset-x-0 border-t border-room-line-hover" style={{ top: HALF }} />
                {year.months.map((m, i) => {
                    const h = m.hands ? Math.max(2, (Math.abs(m.net) / top) * (HALF - 6)) : 0;
                    const up = m.net >= 0;
                    return (
                        <button
                            key={i}
                            className="relative flex-1 cursor-default rounded-[2px] hover:bg-white/5 focus-visible:bg-white/5"
                            onMouseEnter={() => setHover(i)}
                            onMouseLeave={() => setHover(null)}
                            onFocus={() => setHover(i)}
                            onBlur={() => setHover(null)}
                            onClick={() => setHover(hover === i ? null : i)}
                            aria-label={`${MONTHS[i]}: ${m.hands ? `${signed(m.net)} over ${m.hands} hands` : "no hands"}`}
                            data-month={i}
                        >
                            {h > 0 && (
                                <span
                                    className="absolute left-1/2 w-[70%] max-w-[28px] -translate-x-1/2"
                                    style={{
                                        background: up ? UP : DOWN,
                                        height: h,
                                        top: up ? HALF - h : HALF,
                                        borderRadius: up ? "4px 4px 0 0" : "0 0 4px 4px",
                                    }}
                                />
                            )}
                            {hover === i && (
                                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max -translate-x-1/2 rounded-[4px] border border-room-line bg-room-deep px-2 py-1 text-left text-[12px] leading-4 text-room-text shadow-lg">
                                    <span className="block font-bold">{MONTHS[i]}</span>
                                    {m.hands ? (
                                        <>
                                            <span className={`block font-semibold ${netClass(m.net)}`}>{signed(m.net)}</span>
                                            <span className="block text-room-muted">{m.hands} hands, {formatMoney(m.wagered)} bet</span>
                                        </>
                                    ) : <span className="block text-room-muted">No hands</span>}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            <div className="mt-1 flex gap-1 sm:gap-2">
                {MONTHS.map((m) => <span key={m} className="flex-1 text-center text-[11px] text-room-muted">{m}</span>)}
            </div>
            <div className="mt-2 flex items-center justify-end text-[12px] text-room-muted">
                <button className="min-h-[44px] px-2 underline hover:text-room-text" onClick={() => setAsTable(true)}>Show as a table</button>
            </div>
        </div>
    );
}

export default function Stats({ onBack }: Props) {
    const [version, setVersion] = useState(0);
    const years = useMemo(() => loadYearStats(), [version]);
    const yearList = Object.keys(years).sort((a, b) => Number(b) - Number(a));
    const thisYear = String(new Date().getFullYear());
    const [picked, setPicked] = useState<string | null>(null);
    const shown = picked && years[picked] ? picked : yearList.includes(thisYear) ? thisYear : yearList[0] ?? null;
    const year = shown ? years[shown] : null;
    const [confirmClear, setConfirmClear] = useState(false);

    const games = year ? Object.entries(year.games).sort((a, b) => b[1].hands - a[1].hands) : [];
    const total = games.reduce((t, [, g]) => ({
        hands: t.hands + g.hands, wagered: t.wagered + g.wagered, net: t.net + g.net, wins: t.wins + g.wins,
    }), { hands: 0, wagered: 0, net: 0, wins: 0 });
    const days = year ? Object.entries(year.days).filter(([, d]) => d.hands > 0) : [];
    const bestDay = days.length ? days.reduce((a, b) => (b[1].net > a[1].net ? b : a)) : null;
    const worstDay = days.length ? days.reduce((a, b) => (b[1].net < a[1].net ? b : a)) : null;

    return (
        <div className="min-h-[calc(100vh-88px)] bg-room px-4 py-8 text-room-text sm:px-6">
            {confirmClear && (
                <ConfirmDialog
                    testId="clear-stats"
                    title="Clear all your stats?"
                    body="This removes every year of stats saved in this browser. It cannot be undone. Your bankroll is not touched."
                    keepLabel="Keep My Stats"
                    goLabel="Clear Stats"
                    onKeep={() => setConfirmClear(false)}
                    onGo={() => { clearYearStats(); setConfirmClear(false); setPicked(null); setVersion((v) => v + 1); }}
                />
            )}
            <div className="mx-auto max-w-3xl">
                <div className="mb-6 flex flex-col items-center gap-4 border-b border-room-line pb-4 text-center">
                    <div>
                        <h1 className="text-room-text">Stats</h1>
                        <p className="mt-2 text-base text-room-muted">
                            Your play in this browser, year by year. The last five years are kept.
                        </p>
                    </div>
                    <button className={BTN_PLAIN} onClick={onBack}>Back</button>
                </div>

                {!year ? (
                    <div className="rounded-[4px] border border-room-line bg-room-panel p-6 text-center text-room-muted" data-testid="stats-empty">
                        No stats yet. Play a hand at any table and it will show up here.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* which year */}
                        {yearList.length > 1 && (
                            <div className="flex flex-wrap justify-center gap-2" data-testid="year-picker">
                                {yearList.map((y) => (
                                    <button key={y} onClick={() => setPicked(y)} aria-pressed={y === shown}
                                        className={`${BTN_BASE} ${y === shown ? "border-room-red-pressed bg-room-red text-room-text" : "border-room-line bg-room-deep text-room-muted hover:bg-room-raised"}`}>
                                        {y}
                                    </button>
                                ))}
                            </div>
                        )}

                        <Section title={`${shown} at a glance`} testId="year-summary">
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <Figure label="Hands" value={total.hands.toLocaleString("en-US")} />
                                <Figure label="Total bet" value={formatMoney(total.wagered)} />
                                <Figure label="Net" value={signed(total.net)} valueClass={netClass(total.net)} />
                                <Figure label="Hands won" value={pct(total.wins, total.hands)} sub={`${total.wins.toLocaleString("en-US")} of ${total.hands.toLocaleString("en-US")}`} />
                                <Figure label="Average bet" value={total.hands ? formatMoney(total.wagered / total.hands) : "-"} />
                                <Figure label="Returned" value={pct(total.wagered + total.net, total.wagered)} sub="of everything bet" />
                                <Figure label="Time played" value={playTime(year.minutes ?? 0)} />
                                <Figure label="Longest streaks" value={`${year.streak?.longestWin ?? 0} won`} sub={`${year.streak?.longestLoss ?? 0} lost in a row`} />
                            </div>
                        </Section>

                        <Section title="Net by month">
                            <MonthChart year={year} />
                        </Section>

                        <Section title="By game" testId="by-game">
                            <table className="w-full table-fixed text-[13px] tabular-nums sm:text-sm">
                                <thead>
                                    <tr className="text-left text-room-muted">
                                        <th className="w-[38%] py-1 font-semibold">Game</th>
                                        <th className="py-1 text-right font-semibold">Hands</th>
                                        <th className="py-1 text-right font-semibold">Bet</th>
                                        <th className="py-1 text-right font-semibold">Net</th>
                                        <th className="hidden py-1 text-right font-semibold sm:table-cell">Won</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {games.map(([id, g]) => (
                                        <tr key={id} className="border-t border-room-line">
                                            <td className="py-1.5 pr-2">{gameName(id)}</td>
                                            <td className="py-1.5 text-right">{g.hands.toLocaleString("en-US")}</td>
                                            <td className="py-1.5 text-right">{formatMoney(g.wagered)}</td>
                                            <td className={`py-1.5 text-right font-semibold ${netClass(g.net)}`}>{signed(g.net)}</td>
                                            <td className="hidden py-1.5 text-right sm:table-cell">{pct(g.wins, g.hands)}</td>
                                        </tr>
                                    ))}
                                    <tr className="border-t-2 border-room-line-hover font-bold">
                                        <td className="py-1.5">All games</td>
                                        <td className="py-1.5 text-right">{total.hands.toLocaleString("en-US")}</td>
                                        <td className="py-1.5 text-right">{formatMoney(total.wagered)}</td>
                                        <td className={`py-1.5 text-right ${netClass(total.net)}`}>{signed(total.net)}</td>
                                        <td className="hidden py-1.5 text-right sm:table-cell">{pct(total.wins, total.hands)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </Section>

                        <Section title="Every bet" testId="every-bet">
                            {!year.bets || Object.keys(year.bets).length === 0 ? (
                                <p className="text-sm text-room-muted">Each bet, side bets too, shows up here once a hand settles.</p>
                            ) : (
                                <div className="space-y-2">
                                    {Object.entries(year.bets)
                                        .sort((a, b) => (year.games[b[0]]?.hands ?? 0) - (year.games[a[0]]?.hands ?? 0))
                                        .map(([gameId, bets]) => <GameBets key={gameId} name={gameName(gameId)} bets={Object.fromEntries(Object.entries(bets).filter(([name]) => !/^(Deal number|Hole |Fold )/.test(name)))} />)}
                                </div>
                            )}
                        </Section>

                        {year.bets?.uth && Object.keys(year.bets.uth).some((k) => k.startsWith("Hole ")) && (
                            <Section title="Ultimate Texas Hold'em by starting hand" testId="starting-hands">
                                <StartingHands bets={year.bets.uth} />
                            </Section>
                        )}

                        {year.bets?.paigow && Object.keys(year.bets.paigow).some((k) => k.startsWith("Deal number")) && (
                            <Section title="Pai Gow by deal number" testId="deal-numbers">
                                {(() => {
                                    const lucky = luckiestNumber(year.bets!.paigow);
                                    return lucky && (
                                        <div className="mb-3 text-room-text" data-testid="luckiest-number">
                                            <span className="text-room-muted">Luckiest number: </span>
                                            <span className="text-lg font-extrabold">{lucky.n}</span>
                                            <span className="text-room-muted"> - </span>
                                            <span className="font-bold text-emerald-300">{pct(lucky.b.won, lucky.b.placed)}</span>
                                            <span className="text-room-muted"> won, over {lucky.b.placed.toLocaleString("en-US")} hand{lucky.b.placed === 1 ? "" : "s"}</span>
                                        </div>
                                    );
                                })()}
                                <p className="mb-2 text-[12px] text-room-muted">Your main bet, by the deal number each hand came from. Won means you won both hands; a split is a push.</p>
                                <table className="w-full table-fixed text-[13px] tabular-nums sm:text-sm">
                                    <thead>
                                        <tr className="text-left text-room-muted">
                                            <th className="py-1 font-semibold">Number</th>
                                            <th className="py-1 text-right font-semibold">Hands</th>
                                            <th className="py-1 text-right font-semibold">Won</th>
                                            <th className="py-1 text-right font-semibold">Pushed</th>
                                            <th className="py-1 text-right font-semibold">Lost</th>
                                            <th className="hidden py-1 text-right font-semibold sm:table-cell">Net</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                                            const b = year.bets!.paigow[`Deal number ${n}`];
                                            const net = b ? b.returned - b.wagered : 0;
                                            return (
                                                <tr key={n} className="border-t border-room-line" data-deal-number-row={n}>
                                                    <td className="py-1.5 font-bold">{n}</td>
                                                    <td className="py-1.5 text-right">{b ? b.placed : 0}</td>
                                                    <td className="py-1.5 text-right font-semibold text-emerald-300">{b ? pct(b.won, b.placed) : "-"}</td>
                                                    <td className="py-1.5 text-right">{b ? pct(b.pushed, b.placed) : "-"}</td>
                                                    <td className="py-1.5 text-right text-red-300">{b ? pct(b.placed - b.won - b.pushed, b.placed) : "-"}</td>
                                                    <td className={`hidden py-1.5 text-right font-semibold sm:table-cell ${netClass(net)}`}>{b ? signed(net) : "-"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </Section>
                        )}

                        <Section title="Bests and worsts" testId="bests">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Figure label="Biggest win" value={year.bestWin ? signed(year.bestWin.amount) : "-"} valueClass={year.bestWin ? "text-emerald-300" : "text-room-text"}
                                    sub={year.bestWin ? `${gameName(year.bestWin.gameId)}, ${dayLabel(year.bestWin.date)}` : "No winning hands yet"} />
                                <Figure label="Biggest loss" value={year.worstLoss ? signed(year.worstLoss.amount) : "-"} valueClass={year.worstLoss ? "text-red-300" : "text-room-text"}
                                    sub={year.worstLoss ? `${gameName(year.worstLoss.gameId)}, ${dayLabel(year.worstLoss.date)}` : "No losing hands yet"} />
                                <Figure label="Best day" value={bestDay ? signed(bestDay[1].net) : "-"} valueClass={bestDay ? netClass(bestDay[1].net) : "text-room-text"}
                                    sub={bestDay ? `${dayLabel(bestDay[0])}, ${bestDay[1].hands} hands` : undefined} />
                                <Figure label="Worst day" value={worstDay ? signed(worstDay[1].net) : "-"} valueClass={worstDay ? netClass(worstDay[1].net) : "text-room-text"}
                                    sub={worstDay ? `${dayLabel(worstDay[0])}, ${worstDay[1].hands} hands` : undefined} />
                                <Figure label="Favorite game" value={games[0] ? gameName(games[0][0]) : "-"} sub={games[0] ? `${games[0][1].hands.toLocaleString("en-US")} hands` : undefined} />
                                <Figure label="Days played" value={String(days.length)} />
                            </div>
                        </Section>

                        <Section title="Free chips and bankroll" testId="free-chips">
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                                <Figure label="Card Ladder runs" value={String(year.ladder.runs)} sub={`${year.ladder.wins} won`} />
                                <Figure label="Won at Card Ladder" value={formatMoney(year.ladder.won)} />
                                <Figure label="Bankroll resets" value={String(year.bankroll.resets)} />
                                <Figure label="Set by hand" value={String(year.bankroll.sets)} />
                                <Figure label="Added by hand" value={formatMoney(year.bankroll.added)} sub="through Set and Reset" />
                                <Figure label="Taken off by hand" value={formatMoney(year.bankroll.removed)} sub="through Set and Reset" />
                            </div>
                        </Section>
                    </div>
                )}

                <div className="mt-6 flex justify-center">
                    <button className={BTN_PLAIN} onClick={() => setConfirmClear(true)} disabled={yearList.length === 0}>Clear stats</button>
                </div>
            </div>
        </div>
    );
}
