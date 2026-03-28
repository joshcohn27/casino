import { useEffect, useMemo, useState } from "react"
import UltimateTexasHoldem from "./UltimateTexasHoldem"
import Blackjack from "./Blackjack"
import FreeBetBlackjack from "./FreeBetBlackjack"
import Roulette from "./Roulette"
import BaccaratTable from "./Baccarat"
import VideoPoker from "./VideoPoker"
import Feedback from "./Feedback"
import heroImage from "./assets/hero.png"

type Game =
    | "home"
    | "uth"
    | "blackjack"
    | "freebetblackjack"
    | "roulette"
    | "baccarat"
    | "videopoker"
    | "feedback"

const DEFAULT_BANKROLL = 1000
const STORAGE_BANKROLL_KEY = "casino-bankroll"
const STORAGE_GAME_KEY = "casino-selected-game"

function readStoredNumber(key: string, fallback: number) {
    if (typeof window === "undefined") return fallback
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? Number(raw) : fallback
    return Number.isFinite(parsed) ? parsed : fallback
}

function readStoredGame(): Game {
    if (typeof window === "undefined") return "home"
    const raw = window.localStorage.getItem(STORAGE_GAME_KEY)
    return raw === "uth" ||
        raw === "blackjack" ||
        raw === "freebetblackjack" ||
        raw === "roulette" ||
        raw === "baccarat" ||
        raw === "videopoker" ||
        raw === "feedback" ||
        raw === "home"
        ? raw
        : "home"
}

function formatMoney(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(value)
}

function NavButton({
    active,
    onClick,
    children,
}: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            onClick={onClick}
            className={`rounded-full border px-4 py-2 text-sm font-bold transition ${active
                ? "border-amber-200 bg-amber-400 text-black shadow-lg"
                : "border-white/15 bg-white/8 text-white hover:bg-white/14"
                }`}
        >
            {children}
        </button>
    )
}

function GameCard({
    title,
    subtitle,
    accent,
    onClick,
    bankroll,
    label = "Table Game",
}: {
    title: string
    subtitle: string
    accent: string
    onClick: () => void
    bankroll: string
    label?: string
}) {
    return (
        <button
            onClick={onClick}
            className="group relative overflow-hidden rounded-[1.8rem] border border-white/12 bg-black/30 p-6 text-left shadow-2xl backdrop-blur transition hover:-translate-y-1 hover:border-white/22 hover:bg-black/38"
        >
            <div className={`absolute inset-x-0 top-0 h-1.5 ${accent}`} />

            <div className="relative flex h-full flex-col justify-between gap-8">
                <div>
                    <div className="mb-3 inline-flex rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-100/90">
                        {label}
                    </div>

                    <div className="text-3xl font-extrabold tracking-[0.02em] text-white">{title}</div>
                    <div className="mt-3 max-w-[28ch] text-sm leading-6 text-white/72">{subtitle}</div>
                </div>

                <div className="flex items-end justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200/90">Shared bankroll</div>
                        <div className="mt-1 text-xl font-extrabold text-amber-100">{bankroll}</div>
                    </div>

                    <div className="rounded-full border border-amber-200/20 bg-amber-300/12 px-4 py-2 text-sm font-bold text-amber-100 transition group-hover:bg-amber-300/20">
                        Enter
                    </div>
                </div>
            </div>
        </button>
    )
}

export default function Casino() {
    const [game, setGame] = useState<Game>(() => readStoredGame())
    const [bankroll, setBankroll] = useState<number>(() => readStoredNumber(STORAGE_BANKROLL_KEY, DEFAULT_BANKROLL))
    const [bankrollInput, setBankrollInput] = useState(() => String(readStoredNumber(STORAGE_BANKROLL_KEY, DEFAULT_BANKROLL)))

    useEffect(() => {
        window.localStorage.setItem(STORAGE_BANKROLL_KEY, String(bankroll))
    }, [bankroll])

    useEffect(() => {
        window.localStorage.setItem(STORAGE_GAME_KEY, game)
    }, [game])

    useEffect(() => {
        setBankrollInput(String(bankroll))
    }, [bankroll])

    const bankrollDisplay = useMemo(() => formatMoney(bankroll), [bankroll])

    const resetBankroll = () => {
        setBankroll(DEFAULT_BANKROLL)
    }

    const applyBankroll = () => {
        const value = Number(bankrollInput)
        if (!Number.isFinite(value) || value < 0) return
        setBankroll(Math.floor(value))
    }

    const renderScreen = () => {
        if (game === "uth") {
            return <UltimateTexasHoldem bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "blackjack") {
            return <Blackjack bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "freebetblackjack") {
            return <FreeBetBlackjack bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "roulette") {
            return <Roulette bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "baccarat") {
            return <BaccaratTable bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "videopoker") {
            return <VideoPoker bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "feedback") {
            return <Feedback onBack={() => setGame("home")} />
        }

        return (
            <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#151d33,_#0a1020_42%,_#05070d_78%)] text-white">
                <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 pb-8 pt-6">
                    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/26 shadow-2xl backdrop-blur">
                        <div className="grid min-h-[420px] gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="flex flex-col justify-center p-8 md:p-10 lg:p-12">
                                <div className="mb-4 inline-flex w-fit rounded-full border border-amber-200/18 bg-amber-300/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-amber-200">
                                    Main Casino Floor
                                </div>

                                <h1 className="max-w-[12ch] text-5xl font-extrabold leading-[1.02] tracking-[0.01em] text-white md:text-6xl">
                                    Pick your table and play.
                                </h1>

                                <p className="mt-5 max-w-[54ch] text-base leading-7 text-white/72 md:text-lg">
                                    One shared bankroll, clean table layouts, and saved progress through local storage so you can close the app and come right back.
                                </p>

                                <div className="mt-8 flex flex-wrap gap-4">
                                    <div className="min-w-[280px] flex-1">
                                        <GameCard
                                            title="Ultimate Texas Hold'em"
                                            subtitle="Full pay tables, staged betting, hand result tracking, and the same bankroll used across the whole casino."
                                            accent="bg-gradient-to-r from-emerald-400 via-green-300 to-amber-200"
                                            onClick={() => setGame("uth")}
                                            bankroll={bankrollDisplay}
                                        />
                                    </div>

                                    <div className="min-w-[280px] flex-1">
                                        <GameCard
                                            title="Blackjack"
                                            subtitle="Multi-hand splitting, double down, dealer blackjack handling, and a table style that now matches UTH."
                                            accent="bg-gradient-to-r from-amber-300 via-orange-300 to-red-300"
                                            onClick={() => setGame("blackjack")}
                                            bankroll={bankrollDisplay}
                                        />
                                    </div>

                                    <div className="min-w-[280px] flex-1">
                                        <GameCard
                                            title="Free Bet Blackjack"
                                            subtitle="Free doubles on hard 9, 10, and 11, free splits through 9s, Push 22, and Pot of Gold side bets."
                                            accent="bg-gradient-to-r from-yellow-300 via-amber-300 to-lime-300"
                                            onClick={() => setGame("freebetblackjack")}
                                            bankroll={bankrollDisplay}
                                        />
                                    </div>

                                    <div className="min-w-[280px] flex-1">
                                        <GameCard
                                            title="Roulette"
                                            subtitle="American roulette with a wheel, clickable board betting, outside bets, dozens, columns, and recent result tracking."
                                            accent="bg-gradient-to-r from-rose-300 via-red-300 to-amber-200"
                                            onClick={() => setGame("roulette")}
                                            bankroll={bankrollDisplay}
                                        />
                                    </div>

                                    <div className="min-w-[280px] flex-1">
                                        <GameCard
                                            title="Baccarat"
                                            subtitle="No commission baccarat with Player, Banker, Tie, plus Panda 8 and Dragon 7 side bets on a red felt table."
                                            accent="bg-gradient-to-r from-red-400 via-rose-300 to-pink-200"
                                            onClick={() => setGame("baccarat")}
                                            bankroll={bankrollDisplay}
                                        />
                                    </div>

                                    <div className="min-w-[280px] flex-1">
                                        <GameCard
                                            title="Jacks or Better"
                                            subtitle="Classic video poker with hold-and-draw gameplay, retro machine styling, and a full payout table."
                                            accent="bg-gradient-to-r from-cyan-300 via-blue-300 to-indigo-300"
                                            onClick={() => setGame("videopoker")}
                                            bankroll={bankrollDisplay}
                                        />
                                    </div>

                                </div>
                                <div className="mt-10 rounded-[1.5rem] border border-white/10 bg-white/5 p-5 md:p-6">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">
                                                Support
                                            </div>

                                            <div className="mt-1 text-xl font-extrabold text-white">
                                                Help improve the casino
                                            </div>

                                            <div className="mt-2 max-w-[48ch] text-sm leading-6 text-white/70">
                                                Found a bug, want a new game, or think something feels off?
                                                Send feedback directly.
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setGame("feedback")}
                                            className="rounded-full border border-amber-200 bg-amber-400 px-5 py-2.5 text-sm font-bold text-black shadow-lg transition hover:scale-[1.02]"
                                        >
                                            Give Feedback
                                        </button>
                                    </div>
                                </div>
                            </div>



                            <div className="relative flex items-center justify-center overflow-hidden border-t border-white/10 bg-[radial-gradient(circle_at_center,_rgba(168,85,247,0.22),_rgba(15,23,42,0.2)_45%,_rgba(0,0,0,0.1)_78%)] p-8 lg:border-l lg:border-t-0">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_rgba(251,191,36,0.08),_transparent_28%),radial-gradient(circle_at_80%_70%,_rgba(16,185,129,0.08),_transparent_24%)]" />
                                <img
                                    src={heroImage}
                                    alt="Casino hero"
                                    className="relative max-h-[440px] w-full max-w-[400px] object-contain opacity-90 drop-shadow-[0_20px_60px_rgba(168,85,247,0.3)]"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="sticky top-0 z-50 border-b border-amber-300/15 bg-black/70 px-4 py-3 backdrop-blur-xl">
                <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <NavButton active={game === "home"} onClick={() => setGame("home")}>Home</NavButton>
                        <NavButton active={game === "uth"} onClick={() => setGame("uth")}>Ultimate Texas Hold'em</NavButton>
                        <NavButton active={game === "blackjack"} onClick={() => setGame("blackjack")}>Blackjack</NavButton>
                        <NavButton active={game === "freebetblackjack"} onClick={() => setGame("freebetblackjack")}>Free Bet Blackjack</NavButton>
                        <NavButton active={game === "roulette"} onClick={() => setGame("roulette")}>Roulette</NavButton>
                        <NavButton active={game === "baccarat"} onClick={() => setGame("baccarat")}>Baccarat</NavButton>
                        <NavButton active={game === "videopoker"} onClick={() => setGame("videopoker")}>Jacks or Better</NavButton>
                        <NavButton active={game === "feedback"} onClick={() => setGame("feedback")}>Feedback</NavButton>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-full border border-amber-300/18 bg-black/35 px-4 py-2">
                            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200">Bankroll</div>
                            <div className="text-lg font-extrabold text-white">{bankrollDisplay}</div>
                        </div>

                        <input
                            type="number"
                            min={0}
                            step={5}
                            value={bankrollInput}
                            onChange={(e) => setBankrollInput(e.target.value)}
                            className="w-[120px] rounded-full border border-white/15 bg-white/8 px-3 py-2 text-white outline-none"
                        />

                        <button
                            onClick={applyBankroll}
                            className="rounded-full border border-emerald-200 bg-emerald-400 px-4 py-2 text-sm font-bold text-black shadow-lg"
                        >
                            Set
                        </button>

                        <button
                            onClick={resetBankroll}
                            className="rounded-full border border-red-300/40 bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            {renderScreen()}
        </div>
    )
}