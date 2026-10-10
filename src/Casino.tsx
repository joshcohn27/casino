import { useEffect, useMemo, useRef, useState } from "react"
import UltimateTexasHoldem from "./UltimateTexasHoldem"
import Blackjack from "./Blackjack"
import FreeBetBlackjack from "./FreeBetBlackjack"
import DoubleDownMadness from "./DoubleDownMadness"
import Roulette from "./Roulette"
import BaccaratTable from "./Baccarat"
import VideoPoker from "./VideoPoker"
import PaiGowPoker from "./PaiGow"
import ThreeCardPoker from "./ThreeCardPoker"
import MississippiStud from "./MississippiStud"
import ILuvSuits from "./ILuvSuits"
import DJWild from "./DJWild"
import Feedback from "./Feedback"
import Settings from "./Settings"
import WhatsNew from "./WhatsNew"
import { VERSION } from "./changelog"
import { feedMeterFromWager } from "./shared/progressiveMeter"

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
    | "threecardpoker"
    | "mississippistud"
    | "iluvsuits"
    | "djwild"
    | "feedback"
    | "settings"
    | "changelog"

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
        raw === "threecardpoker" ||
        raw === "mississippistud" ||
        raw === "iluvsuits" ||
        raw === "djwild" ||
        raw === "feedback" ||
        raw === "settings" ||
        raw === "changelog" ||
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
            className={`border-b-2 px-1 py-2 text-[15px] font-semibold transition-colors ${active ? "border-room-accent text-room-text" : "border-transparent text-room-muted hover:text-room-text"}`}
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
                className={`border-b-2 px-1 py-2 text-[15px] font-semibold transition-colors ${active ? "border-room-accent text-room-text" : "border-transparent text-room-muted hover:text-room-text"}`}
            >
                <span className="flex items-center gap-1.5">
                    {label}
                    <span className="text-[11px]">▾</span>
                </span>
            </button>

            <div
                className={`absolute left-0 top-full z-50 min-w-[240px] rounded-[4px] border border-room-line bg-room-panel p-1
                ${open ? "visible" : "invisible"}
                group-hover:visible`}
            >
                <div className="flex flex-col">
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
            className={`border-l-2 px-3 py-2 text-left text-[15px] transition-colors ${active
                ? "border-room-accent bg-room-raised font-semibold text-room-text"
                : "border-transparent text-room-text hover:bg-room-raised"
                }`}
        >
            {children}
        </button>
    )
}

function GameCard({
    title,
    subtitle,
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
            className="group relative overflow-hidden rounded-[4px] border border-room-line bg-room-panel p-6 pl-7 text-left transition-colors hover:border-room-line-hover"
            data-testid="game-card"
        >
            <div className="relative flex h-full flex-col justify-between gap-6">
                <div>
                    <h3 className="text-room-text">{title}</h3>
                    <div className="mt-1 text-sm font-semibold text-room-text">{label}</div>
                    <div className="mt-4 max-w-[52ch] text-base leading-6 text-room-muted">{subtitle}</div>
                </div>

                <div className="flex items-end justify-between gap-4">
                    <div>
                        <div className="text-sm text-room-muted">Shared bankroll</div>
                        <div className="text-lg font-bold text-room-text">{bankroll}</div>
                    </div>

                    <div className="rounded-[4px] border border-room-red-pressed bg-room-red px-4 py-2 text-sm font-bold text-room-text transition-colors group-hover:bg-room-red-hover">
                        Play
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
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        window.localStorage.setItem(STORAGE_BANKROLL_KEY, String(bankroll))
    }, [bankroll])

    // A wager at any table feeds the DJ Wild progressive meter a little, standing in for the
    // other players who would be building a real jackpot. DJ Wild looks after its own meter.
    const lastBankroll = useRef(bankroll)
    useEffect(() => {
        const wagered = lastBankroll.current - bankroll
        lastBankroll.current = bankroll
        if (wagered > 0 && game !== "djwild" && game !== "home" && game !== "feedback" && game !== "settings" && game !== "changelog") feedMeterFromWager(wagered)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bankroll])

    useEffect(() => {
        window.localStorage.setItem(STORAGE_GAME_KEY, game)
    }, [game])

    useEffect(() => {
        setBankrollInput(String(bankroll))
    }, [bankroll])

    const bankrollDisplay = useMemo(() => formatMoney(bankroll), [bankroll])

    // Setting the bankroll by hand is not a wager, so it must not feed the meter
    const resetBankroll = () => {
        lastBankroll.current = DEFAULT_BANKROLL
        setBankroll(DEFAULT_BANKROLL)
    }

    const applyBankroll = () => {
        const value = Number(bankrollInput)
        if (!Number.isFinite(value) || value < 0) return
        lastBankroll.current = Math.floor(value)
        setBankroll(Math.floor(value))
    }

    const navigate = (g: Game) => {
        setGame(g)
        setMobileMenuOpen(false)
        // the What's New link sits in the footer, so start that page from the top
        if (g === "changelog") window.scrollTo(0, 0)
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

        if (game === "threecardpoker") {
            return <ThreeCardPoker bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "mississippistud") {
            return <MississippiStud bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "iluvsuits") {
            return <ILuvSuits bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "djwild") {
            return <DJWild bankroll={bankroll} setBankroll={setBankroll} />
        }

        if (game === "feedback") {
            return <Feedback onBack={() => setGame("home")} />
        }

        if (game === "settings") {
            return <Settings onBack={() => setGame("home")} />
        }

        if (game === "changelog") {
            return <WhatsNew onBack={() => setGame("home")} />
        }

        return (
            <div
                className="min-h-screen bg-room text-room-text"
            >
                <div className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-8 sm:px-6">
                    <div className="mb-8 border-b border-room-line pb-6">
                        <h1 className="home-title">
                            Cohn Casino
                        </h1>
                        <p className="home-subtitle mt-2">
                            A collection of casino table games
                        </p>
                        <p className="mt-4 max-w-[62ch] text-base leading-6 text-room-muted">
                            A browser-based casino simulator built for fun. Play blackjack, poker, roulette, and more
                            with a shared bankroll that carries across every table. No real money, no ads, no accounts.
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <GameCard
                            title="Blackjack"
                            subtitle="6-deck shoe · Blackjack pays 3 to 2 · Dealer stands on all 17s · Split up to 4 hands · Double after split · Reshuffles at 85% penetration"
                            feltColor="#1f7a45"
                            onClick={() => setGame("blackjack")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Free Bet Blackjack"
                            subtitle="Free doubles on hard 9, 10, and 11 · Free splits on pairs through 9s and aces · Dealer 22 pushes all live hands · Push 22 side bet pays 11 to 1 · Pot of Gold side bet pays by free-bet token count"
                            feltColor="#7f1d1d"
                            onClick={() => setGame("freebetblackjack")}
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
                            title="Ultimate Texas Hold'em"
                            subtitle="Bet 4x or 3x preflop · 2x on the flop · 1x or fold on the river · Dealer qualifies with pair or better · Blind pays on straight or better · Trips and 6 Card Bonus side bets available"
                            feltColor="#1a3a5c"
                            onClick={() => setGame("uth")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Pai Gow Poker"
                            subtitle="7 cards set into a 5-card back hand and 2-card front hand · Joker plays as semi-wild · Fortune and Ace High side bets · Dealer qualifies with Ace-high low hand"
                            feltColor="#1a5c2e"
                            onClick={() => setGame("paigow")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Three Card Poker"
                            subtitle="3-card hands · Trips beats straights · Dealer qualifies with Queen-high · Pair Plus side bet pays up to 40 to 1 · 6 Card Bonus uses best 5 of all 6 cards"
                            feltColor="#0c4a6e"
                            onClick={() => setGame("threecardpoker")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Mississippi Stud"
                            subtitle="No dealer hand · Pair of 6s or better pays · Bet 1× or 3× at each of 3 streets · 3 Card Bonus side bet"
                            feltColor="#1a6b3a"
                            onClick={() => setGame("mississippistud")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="I Luv Suits"
                            subtitle="7 cards · Longest flush wins · Play up to 3x with a 6-card flush · Dealer qualifies with a 3-card flush, 9 high · Flush Rush and Super Flush Rush side bets"
                            feltColor="#6b1d3a"
                            onClick={() => setGame("iluvsuits")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="DJ Wild"
                            subtitle="Deuces and the Joker are wild · Play 2x or fold · Dealer always qualifies · Blind pays up to 1,000 to 1 · Trips pays more on natural hands"
                            feltColor="#3b1a6b"
                            onClick={() => setGame("djwild")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Baccarat"
                            subtitle="EZ Baccarat — banker pushes on any 3-card 7 · Player pays 1 to 1 · Tie pays 8 to 1 · Dragon 7 side bet pays 40 to 1 · Panda 8 side bet pays 25 to 1 · 8-deck shoe"
                            feltColor="#7f1d1d"
                            onClick={() => setGame("baccarat")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Roulette"
                            subtitle="American wheel with 38 pockets · Straight up pays 35 to 1 · Proximity-based bet inference for splits, streets, and corners · Full outside bet support · Recent results tracker"
                            feltColor="#1b6b3a"
                            onClick={() => setGame("roulette")}
                            bankroll={bankrollDisplay}
                        />
                        <GameCard
                            title="Video Poker"
                            subtitle="Jacks or Better · Bonus Poker · Deuces Wild · Choose your game and variant from the bar-top machine"
                            feltColor="#0f172a"
                            onClick={() => setGame("videopoker")}
                            bankroll={bankrollDisplay}
                            label="Video Poker"
                        />
                    </div>

                    <div className="mt-8 rounded-[4px] border border-room-line bg-room-panel p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="text-sm text-room-muted">
                                    Bankroll
                                </div>
                                <div className="text-3xl font-bold text-room-text">{bankrollDisplay}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    step={5}
                                    value={bankrollInput}
                                    onChange={(e) => setBankrollInput(e.target.value)}
                                    className="h-11 w-[140px] rounded-[4px] border border-room-line bg-room-deep px-3 text-base text-room-text outline-none focus:border-room-accent"
                                />
                                <button
                                    onClick={applyBankroll}
                                    className="h-11 rounded-[4px] border px-5 text-sm font-bold transition-colors border-room-red-pressed bg-room-red text-room-text hover:bg-room-red-hover active:bg-room-red-pressed"
                                >
                                    Set
                                </button>
                                <button
                                    onClick={resetBankroll}
                                    className="h-11 rounded-[4px] border px-5 text-sm font-bold transition-colors border-room-red-pressed bg-room-red text-room-text hover:bg-room-red-hover active:bg-room-red-pressed"
                                >
                                    Reset to $1,000
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8">
                        <p className="text-sm text-room-muted">
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
        game === "paigow" ||
        game === "threecardpoker" ||
        game === "mississippistud" ||
        game === "iluvsuits" ||
        game === "djwild"

    return (
        <div className="min-h-screen bg-page text-text">
            <div className="sticky top-0 z-50 border-b border-room-line bg-room-panel px-4 sm:px-6" data-testid="site-nav">
                <div className="mx-auto flex min-h-[56px] max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">

                    {/* Mobile-only site title — acts as Home link */}
                    <button
                        onClick={() => navigate("home")}
                        className="text-lg font-bold text-room-text sm:hidden"
                    >
                        Cohn Casino
                    </button>

                    {/* Nav links — hidden on mobile, shown sm: and above */}
                    <div className="hidden sm:flex flex-wrap items-center gap-x-5 gap-y-1">
                        <NavButton active={game === "home"} onClick={() => navigate("home")}>Home</NavButton>

                        <NavDropdown label="Blackjack" active={blackjackActive}>
                            <DropdownItem active={game === "blackjack"} onClick={() => navigate("blackjack")}>
                                Classic Blackjack
                            </DropdownItem>
                            <DropdownItem active={game === "freebetblackjack"} onClick={() => navigate("freebetblackjack")}>
                                Free Bet Blackjack
                            </DropdownItem>
                            <DropdownItem active={game === "doubledownmadness"} onClick={() => navigate("doubledownmadness")}>
                                Double Down Madness
                            </DropdownItem>
                        </NavDropdown>

                        <NavDropdown label="Poker Games" active={pokerActive}>
                            <DropdownItem active={game === "uth"} onClick={() => navigate("uth")}>
                                Ultimate Texas Hold'em
                            </DropdownItem>
                            <DropdownItem active={game === "paigow"} onClick={() => navigate("paigow")}>
                                Pai Gow Poker
                            </DropdownItem>
                            <DropdownItem active={game === "threecardpoker"} onClick={() => navigate("threecardpoker")}>
                                Three Card Poker
                            </DropdownItem>
                            <DropdownItem active={game === "mississippistud"} onClick={() => navigate("mississippistud")}>
                                Mississippi Stud
                            </DropdownItem>
                            <DropdownItem active={game === "iluvsuits"} onClick={() => navigate("iluvsuits")}>
                                I Luv Suits
                            </DropdownItem>
                            <DropdownItem active={game === "djwild"} onClick={() => navigate("djwild")}>
                                DJ Wild
                            </DropdownItem>
                            <DropdownItem active={game === "videopoker"} onClick={() => navigate("videopoker")}>
                                Video Poker
                            </DropdownItem>
                        </NavDropdown>

                        <NavButton active={game === "roulette"} onClick={() => navigate("roulette")}>Roulette</NavButton>
                        <NavButton active={game === "baccarat"} onClick={() => navigate("baccarat")}>Baccarat</NavButton>

                        <NavButton active={game === "feedback"} onClick={() => navigate("feedback")}>Give Feedback</NavButton>

                        <NavButton active={game === "settings"} onClick={() => navigate("settings")}>Settings</NavButton>
                    </div>

                    {/* Bankroll controls — hidden on mobile, shown sm: and above */}
                    <div className="hidden sm:flex flex-wrap items-center gap-2">
                        <div className="mr-2 flex items-baseline gap-2">
                            <span className="text-sm text-room-muted">Bankroll</span>
                            <span className="text-xl font-bold text-room-text" data-testid="nav-bankroll">{bankrollDisplay}</span>
                        </div>

                        <input
                            type="number"
                            min={0}
                            step={5}
                            value={bankrollInput}
                            onChange={(e) => setBankrollInput(e.target.value)}
                            className="h-9 w-[110px] rounded-[4px] border border-room-line bg-room-deep px-3 text-[15px] text-room-text outline-none focus:border-room-accent"
                        />

                        <button
                            onClick={applyBankroll}
                            className="h-9 rounded-[4px] border px-4 text-sm font-bold transition-colors border-room-red-pressed bg-room-red text-room-text hover:bg-room-red-hover active:bg-room-red-pressed"
                        >
                            Set
                        </button>

                        <button
                            onClick={resetBankroll}
                            className="h-9 rounded-[4px] border px-4 text-sm font-bold transition-colors border-room-red-pressed bg-room-red text-room-text hover:bg-room-red-hover active:bg-room-red-pressed"
                        >
                            Reset
                        </button>
                    </div>

                    {/* Hamburger button — mobile only */}
                    <button
                        className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-room-line bg-room-deep text-room-text sm:hidden"
                        onClick={() => setMobileMenuOpen(o => !o)}
                        aria-label="Toggle menu"
                    >
                        {mobileMenuOpen ? (
                            <span className="text-lg font-bold">×</span>
                        ) : (
                            <span className="flex flex-col gap-[5px] items-center justify-center">
                                <span className="block h-[2px] w-5 bg-room-text"/>
                                <span className="block h-[2px] w-5 bg-room-text"/>
                                <span className="block h-[2px] w-5 bg-room-text"/>
                            </span>
                        )}
                    </button>
                </div>

                {/* Mobile dropdown menu — hidden on sm: and above */}
                {mobileMenuOpen && (
                    <div className="-mx-4 border-t border-room-line bg-room-panel sm:hidden">
                        <div className="mx-auto flex max-w-[1600px] flex-col px-4 py-2">

                            <button
                                onClick={() => navigate("home")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "home"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Home
                            </button>

                            <div className="px-3 pt-1 text-sm font-semibold text-room-muted">
                                Blackjack
                            </div>
                            <button
                                onClick={() => navigate("blackjack")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "blackjack"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Classic Blackjack
                            </button>
                            <button
                                onClick={() => navigate("freebetblackjack")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "freebetblackjack"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Free Bet Blackjack
                            </button>
                            <button
                                onClick={() => navigate("doubledownmadness")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "doubledownmadness"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Double Down Madness
                            </button>

                            <div className="px-3 pt-1 text-sm font-semibold text-room-muted">
                                Poker
                            </div>
                            <button
                                onClick={() => navigate("uth")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "uth"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Ultimate Texas Hold'em
                            </button>
                            <button
                                onClick={() => navigate("paigow")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "paigow"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Pai Gow Poker
                            </button>
                            <button
                                onClick={() => navigate("threecardpoker")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "threecardpoker"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Three Card Poker
                            </button>
                            <button
                                onClick={() => navigate("mississippistud")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "mississippistud"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Mississippi Stud
                            </button>
                            <button
                                onClick={() => navigate("iluvsuits")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "iluvsuits"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                I Luv Suits
                            </button>
                            <button
                                onClick={() => navigate("djwild")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "djwild"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                DJ Wild
                            </button>
                            <button
                                onClick={() => navigate("videopoker")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "videopoker"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Video Poker
                            </button>

                            <div className="my-1 h-px bg-room-line"/>

                            <button
                                onClick={() => navigate("roulette")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "roulette"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Roulette
                            </button>
                            <button
                                onClick={() => navigate("baccarat")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "baccarat"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Baccarat
                            </button>

                            <div className="my-1 h-px bg-room-line"/>

                            <button
                                onClick={() => navigate("feedback")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "feedback" ? "border-room-accent bg-room-raised font-semibold text-room-text" : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Give Feedback
                            </button>

                            <button
                                onClick={() => navigate("settings")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "settings"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                Settings
                            </button>

                            <button
                                onClick={() => navigate("changelog")}
                                className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${game === "changelog"
                                    ? "border-room-accent bg-room-raised font-semibold text-room-text"
                                    : "border-transparent text-room-text hover:bg-room-raised"}`}
                            >
                                What&apos;s New
                            </button>

                        </div>
                    </div>
                )}
            </div>

            {renderScreen()}

            {(game === "home" || game === "settings" || game === "feedback" || game === "changelog") && (
                <footer className="border-t border-room-line bg-room-panel px-4 py-4 text-sm text-room-muted sm:px-6" data-testid="site-footer">
                    <div className="mx-auto flex max-w-[1600px] flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span>Cohn Casino</span>
                    <span className="text-base font-bold text-room-text" data-testid="site-version">v{VERSION}</span>
                    <button
                        onClick={() => navigate("changelog")}
                        className="border-b-2 border-transparent font-semibold text-room-text transition-colors hover:border-room-accent"
                    >
                        What&apos;s New
                    </button>
                    </div>
                </footer>
            )}
        </div>
    )
}
