import { useEffect, useMemo, useState } from "react"
import UltimateTexasHoldem from "./UltimateTexasHoldem"
import Blackjack from "./Blackjack"
import FreeBetBlackjack from "./FreeBetBlackjack"
import DoubleDownMadness from "./DoubleDownMadness"
import Roulette from "./Roulette"
import BaccaratTable from "./Baccarat"
import VideoPoker from "./VideoPoker"
import PaiGowPoker from "./PaiGow"
import Feedback from "./Feedback"

type Game =
    | "home"
    | "uth"
    | "blackjack"
    | "freebetblackjack"
    | "doubledownmadness"
    | "roulette"
    | "baccarat"
    | "videopoker"
    | "paigow"
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
        raw === "doubledownmadness" ||
        raw === "roulette" ||
        raw === "baccarat" ||
        raw === "videopoker" ||
        raw === "paigow" ||
        raw === "feedback" ||
        raw === "home"
        ? raw
        : "home"
}

function formatMoney(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
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

function NavDropdown({
    label,
    active,
    children,
}: {
    label: string
    active?: boolean
    children: React.ReactNode
}) {
    const [open, setOpen] = useState(false)

    return (
        <div className="group relative">
            <button
                onClick={() => setOpen((prev) => !prev)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition ${active
                    ? "border-amber-200 bg-amber-400 text-black shadow-lg"
                    : "border-white/15 bg-white/8 text-white hover:bg-white/14"
                    }`}
            >
                <span className="flex items-center gap-2">
                    {label}
                    <span className="text-[10px]">▼</span>
                </span>
            </button>

            <div
                className={`absolute left-0 top-full z-50 mt-2 min-w-[240px] rounded-2xl border border-white/10 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur transition-all
                ${open
                        ? "visible translate-y-0 opacity-100"
                        : "invisible translate-y-1 opacity-0"
                    }
                group-hover:visible group-hover:translate-y-0 group-hover:opacity-100`}
            >
                <div className="flex flex-col gap-1">
                    {children}
                </div>
            </div>
        </div>
    )
}

function DropdownItem({
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
            className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${active
                ? "bg-amber-400 text-black"
                : "text-white hover:bg-white/10"
                }`}
        >
            {children}
        </button>
    )
}

function GameCard({
    title,
    subtitle,
    feltColor,
    onClick,
    bankroll,
    label = "Table Game",
}: {
    title: string
    subtitle: string
    feltColor: string
    onClick: () => void
    bankroll: string
    label?: string
}) {
    return (
        <button
            onClick={onClick}
            className="group relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/30 p-6 text-left shadow-2xl backdrop-blur transition hover:-translate-y-1 hover:border-white/22 hover:bg-black/38"
        >
            <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: feltColor }} />

            <div className="relative flex h-full flex-col justify-between gap-8">
                <div>
                    <div className="mb-3 inline-flex rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-100/90">
                        {label}
                    </div>

                    <div className="text-3xl font-extrabold tracking-[0.02em] text-white">{title}</div>
                    <div className="mt-3 max-w-[48ch] text-sm leading-6 text-white/72">{subtitle}</div>
                </div>

                <div className="flex items-end justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200/90">Shared bankroll</div>
                        <div className="mt-1 text-xl font-extrabold text-amber-100">{bankroll}</div>
                    </div>

                    <div className="rounded-full border border-amber-200/20 bg-amber-300/12 px-4 py-2 text-sm font-bold text-amber-100 transition group-hover:bg-amber-300/20">
                        Enter →
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

        if (game === "doubledownmadness") {
            return <DoubleDownMadness bankroll={bankroll} setBankroll={setBankroll} />
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

        if (game === "paigow") {
            return <PaiGowPoker bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "feedback") {
            return <Feedback onBack={() => setGame("home")} />
        }

        return (
            <div
                className="min-h-screen text-white"
                style={{ background: "radial-gradient(circle at top, #0f1a0f, #050d05 50%, #020502 100%)" }}
            >
                <div className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-12">
                    <div className="mb-14 text-center">
                        <h1
                            className="text-6xl font-bold md:text-7xl"
                            style={{
                                fontFamily: "Georgia, serif",
                                background: "linear-gradient(135deg, #f59e0b, #fbbf24, #d97706)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                            }}
                        >
                            Cohn Casino
                        </h1>
                        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
                            Eight games · One bankroll
                        </p>
                        <p className="mx-auto mt-5 max-w-[60ch] text-base leading-7 text-white/65">
                            A browser-based casino simulator built for fun. Play blackjack, poker, roulette, and more
                            with a shared bankroll that carries across every table. No real money, no ads, no accounts.
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <GameCard
                            title="Blackjack"
                            subtitle="6-deck shoe · Blackjack pays 3:2 · Dealer stands on all 17s · Split up to 4 hands · Double after split · Reshuffles at 85% penetration"
                            feltColor="#1f7a45"
                            onClick={() => setGame("blackjack")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Free Bet Blackjack"
                            subtitle="Free doubles on hard 9, 10, and 11 · Free splits on pairs through 9s and aces · Dealer 22 pushes all live hands · Push 22 side bet pays 11:1 · Pot of Gold side bet pays by free-bet token count"
                            feltColor="#7f1d1d"
                            onClick={() => setGame("freebetblackjack")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Ultimate Texas Hold'em"
                            subtitle="Bet 4x or 3x preflop · 2x on the flop · 1x or fold on the river · Dealer qualifies with pair or better · Blind pays on straight or better · Trips and 6 Card Bonus side bets available"
                            feltColor="#1a3a5c"
                            onClick={() => setGame("uth")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Roulette"
                            subtitle="American wheel with 38 pockets · Straight up pays 35:1 · Proximity-based bet inference for splits, streets, and corners · Full outside bet support · Recent results tracker"
                            feltColor="#1b6b3a"
                            onClick={() => setGame("roulette")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Baccarat"
                            subtitle="EZ Baccarat — banker pushes on any 3-card 7 · Player pays 1:1 · Tie pays 8:1 · Dragon 7 side bet pays 40:1 · Panda 8 side bet pays 25:1 · 8-deck shoe"
                            feltColor="#7f1d1d"
                            onClick={() => setGame("baccarat")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Double Down Madness"
                            subtitle="One-card blackjack with aggressive re-doubling · Push 22 side bet · Configurable blackjack pay · Insurance available"
                            feltColor="#18181b"
                            onClick={() => setGame("doubledownmadness")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Jacks or Better"
                            subtitle="Classic video poker · Hold and draw · Full pay table displayed · Retro machine aesthetic"
                            feltColor="#0f172a"
                            onClick={() => setGame("videopoker")}
                            bankroll={bankrollDisplay}
                            label="Video Poker"
                        />
                        <GameCard
                            title="Pai Gow Poker"
                            subtitle="7 cards set into a 5-card back hand and 2-card front hand · Joker plays as semi-wild · Fortune and Ace High side bets · Dealer qualifies with Ace-high low hand"
                            feltColor="#1a5c2e"
                            onClick={() => setGame("paigow")}
                            bankroll={bankrollDisplay}
                        />
                    </div>

                    <div className="mt-10 rounded-[1.5rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">
                                    Bankroll
                                </div>
                                <div className="mt-1 text-3xl font-extrabold text-amber-100">{bankrollDisplay}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    step={5}
                                    value={bankrollInput}
                                    onChange={(e) => setBankrollInput(e.target.value)}
                                    className="w-[140px] rounded-full border border-white/15 bg-white/8 px-4 py-2 text-white outline-none"
                                />
                                <button
                                    onClick={applyBankroll}
                                    className="rounded-full border border-emerald-200 bg-emerald-400 px-5 py-2 text-sm font-bold text-black shadow-lg transition hover:scale-[1.02]"
                                >
                                    Set
                                </button>
                                <button
                                    onClick={resetBankroll}
                                    className="rounded-full border border-red-300/40 bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-lg transition hover:scale-[1.02]"
                                >
                                    Reset to $1,000
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 text-center">
                        <p className="text-xs text-white/35">
                            Purely for entertainment · No real money · Bankroll saves locally in your browser
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    const blackjackActive =
        game === "blackjack" ||
        game === "freebetblackjack" ||
        game === "doubledownmadness"

    const pokerActive =
        game === "uth" ||
        game === "videopoker" ||
        game === "paigow"

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="sticky top-0 z-50 border-b border-amber-300/15 bg-black/70 px-4 py-3 backdrop-blur-xl">
                <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <NavButton active={game === "home"} onClick={() => setGame("home")}>Home</NavButton>

                        <NavDropdown label="Blackjack" active={blackjackActive}>
                            <DropdownItem active={game === "blackjack"} onClick={() => setGame("blackjack")}>
                                Classic Blackjack
                            </DropdownItem>
                            <DropdownItem active={game === "freebetblackjack"} onClick={() => setGame("freebetblackjack")}>
                                Free Bet Blackjack
                            </DropdownItem>
                            <DropdownItem active={game === "doubledownmadness"} onClick={() => setGame("doubledownmadness")}>
                                Double Down Madness
                            </DropdownItem>
                        </NavDropdown>

                        <NavDropdown label="Poker Games" active={pokerActive}>
                            <DropdownItem active={game === "uth"} onClick={() => setGame("uth")}>
                                Ultimate Texas Hold'em
                            </DropdownItem>
                            <DropdownItem active={game === "videopoker"} onClick={() => setGame("videopoker")}>
                                Jacks or Better
                            </DropdownItem>
                            <DropdownItem active={game === "paigow"} onClick={() => setGame("paigow")}>
                                Pai Gow Poker
                            </DropdownItem>
                        </NavDropdown>

                        <NavButton active={game === "roulette"} onClick={() => setGame("roulette")}>Roulette</NavButton>
                        <NavButton active={game === "baccarat"} onClick={() => setGame("baccarat")}>Baccarat</NavButton>

                        <button
                            onClick={() => setGame("feedback")}
                            className={`rounded-full border px-4 py-2 text-sm font-bold transition ${game === "feedback"
                                ? "border-amber-200 bg-amber-400 text-black shadow-lg"
                                : "border-amber-200/40 bg-amber-300/12 text-amber-100 hover:bg-amber-300/20"
                                }`}
                        >
                            Give Feedback
                        </button>
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
