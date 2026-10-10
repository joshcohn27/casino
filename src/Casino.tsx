import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Link, Route, Routes, useLocation, useNavigate } from "react-router"
import Feedback from "./Feedback"
import Settings from "./Settings"
import WhatsNew from "./WhatsNew"
import NotFound from "./NotFound"
import { VERSION } from "./changelog"
import { GAMES, HOME_GAMES, NAV_GROUPS, gameAtPath } from "./games"
import { DEFAULT_BANKROLL, useBankroll } from "./shared/bankrollContext"
import { feedMeterFromWager } from "./shared/progressiveMeter"
import { TableContext } from "./shared/sessionContext"
import SessionBadge from "./shared/SessionBadge"

// the site used to reopen the last table from this key. Pages have URLs now, so it is cleared.
const OLD_SELECTED_GAME_KEY = "casino-selected-game"

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
    to,
    children,
}: {
    active: boolean
    to: string
    children: React.ReactNode
}) {
    return (
        <Link
            to={to}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-1 py-2 text-[15px] font-semibold transition-colors ${active ? "border-room-accent text-room-text" : "border-transparent text-room-muted hover:text-room-text"}`}
        >
            {children}
        </Link>
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
        <div className="group relative" data-nav-group={label} data-active={active ? "true" : "false"}>
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
    to,
    children,
}: {
    active: boolean
    to: string
    children: React.ReactNode
}) {
    return (
        <Link
            to={to}
            aria-current={active ? "page" : undefined}
            className={`border-l-2 px-3 py-2 text-left text-[15px] transition-colors ${active
                ? "border-room-accent bg-room-raised font-semibold text-room-text"
                : "border-transparent text-room-text hover:bg-room-raised"
                }`}
        >
            {children}
        </Link>
    )
}

function MenuItem({
    active,
    to,
    children,
}: {
    active: boolean
    to: string
    children: React.ReactNode
}) {
    return (
        <Link
            to={to}
            aria-current={active ? "page" : undefined}
            className={`border-l-2 px-3 py-2.5 text-left text-base transition-colors ${active
                ? "border-room-accent bg-room-raised font-semibold text-room-text"
                : "border-transparent text-room-text hover:bg-room-raised"}`}
        >
            {children}
        </Link>
    )
}

function GameCard({
    title,
    subtitle,
    to,
    bankroll,
    label = "Table Game",
}: {
    title: string
    subtitle: string
    to: string
    bankroll: string
    label?: string
}) {
    return (
        <Link
            to={to}
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
        </Link>
    )
}

export default function Casino() {
    const { bankroll, setBankroll } = useBankroll()
    const [bankrollInput, setBankrollInput] = useState(() => String(bankroll))
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const location = useLocation()
    const navigateTo = useNavigate()
    // "/blackjack/" and "/blackjack" are the same page
    const pathname = location.pathname.replace(/\/+$/, "") || "/"
    const table = gameAtPath(pathname)

    // Your seat is held: a table you have opened stays in the background when you go to
    // another page, so a hand in progress is still there when you come back.
    const [seated, setSeated] = useState<string[]>(() => (table ? [table.id] : []))
    useEffect(() => {
        if (table) setSeated((prev) => (prev.includes(table.id) ? prev : [...prev, table.id]))
    }, [table])
    const heldTables = table && !seated.includes(table.id) ? [...seated, table.id] : seated

    useEffect(() => {
        window.localStorage.removeItem(OLD_SELECTED_GAME_KEY)
    }, [])

    // every page starts at the top, and the phone menu closes once you have picked a page
    useEffect(() => {
        window.scrollTo(0, 0)
        setMobileMenuOpen(false)
    }, [pathname])

    // A wager at any table feeds the DJ Wild progressive meter a little, standing in for the
    // other players who would be building a real jackpot. DJ Wild looks after its own meter,
    // both when you are sitting at it and while its seat is being held in the background.
    const lastBankroll = useRef(bankroll)
    const djWildSeated = heldTables.includes("djwild")
    useEffect(() => {
        const wagered = lastBankroll.current - bankroll
        lastBankroll.current = bankroll
        if (wagered > 0 && table && !djWildSeated) feedMeterFromWager(wagered)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bankroll])

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

    const goHome = () => navigateTo("/")

    const home = (
        <div
            className="min-h-screen bg-room text-room-text"
        >
            <div className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-8 sm:px-6">
                <div className="mb-8 border-b border-room-line pb-6 text-center">
                    <h1 className="home-title">
                        Cohn Casino
                    </h1>
                    <p className="home-subtitle mt-2">
                        A collection of casino table games
                    </p>
                    <p className="mx-auto mt-4 max-w-[62ch] text-base leading-6 text-room-muted">
                        A browser-based casino simulator built for fun. Play blackjack, poker, roulette, and more
                        with a shared bankroll that carries across every table. No real money, no ads, no accounts.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {HOME_GAMES.map((g) => (
                        <GameCard
                            key={g.id}
                            title={g.title}
                            subtitle={g.subtitle}
                            to={g.path}
                            bankroll={bankrollDisplay}
                            label={g.cardLabel}
                        />
                    ))}
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

    return (
        <div className="min-h-screen bg-page text-text">
            <div className="sticky top-0 z-50 border-b border-room-line bg-room-panel px-4 sm:px-6" data-testid="site-nav">
                <div className="mx-auto flex min-h-[56px] max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">

                    {/* Mobile-only site title — acts as Home link */}
                    <Link
                        to="/"
                        className="text-lg font-bold text-room-text sm:hidden"
                    >
                        Cohn Casino
                    </Link>

                    {/* Nav links — hidden on mobile, shown sm: and above */}
                    <div className="hidden sm:flex flex-wrap items-center gap-x-5 gap-y-1">
                        <NavButton active={pathname === "/"} to="/">Home</NavButton>

                        {NAV_GROUPS.map((group) => (
                            <NavDropdown
                                key={group.id}
                                label={group.label}
                                active={pathname === group.base || pathname.startsWith(group.base + "/")}
                            >
                                {GAMES.filter((g) => g.group === group.id).map((g) => (
                                    <DropdownItem key={g.id} active={pathname === g.path} to={g.path}>
                                        {g.navLabel ?? g.title}
                                    </DropdownItem>
                                ))}
                            </NavDropdown>
                        ))}

                        {GAMES.filter((g) => g.group === "table").map((g) => (
                            <NavButton key={g.id} active={pathname === g.path} to={g.path}>{g.navLabel ?? g.title}</NavButton>
                        ))}

                        <NavButton active={pathname === "/feedback"} to="/feedback">Give Feedback</NavButton>

                        <NavButton active={pathname === "/settings"} to="/settings">Settings</NavButton>
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

                            <MenuItem active={pathname === "/"} to="/">Home</MenuItem>

                            {NAV_GROUPS.map((group) => (
                                <div key={group.id} className="contents">
                                    <div className="px-3 pt-1 text-sm font-semibold text-room-muted">
                                        {group.menuLabel}
                                    </div>
                                    {GAMES.filter((g) => g.group === group.id).map((g) => (
                                        <MenuItem key={g.id} active={pathname === g.path} to={g.path}>
                                            {g.navLabel ?? g.title}
                                        </MenuItem>
                                    ))}
                                </div>
                            ))}

                            <div className="my-1 h-px bg-room-line"/>

                            {GAMES.filter((g) => g.group === "table").map((g) => (
                                <MenuItem key={g.id} active={pathname === g.path} to={g.path}>
                                    {g.navLabel ?? g.title}
                                </MenuItem>
                            ))}

                            <div className="my-1 h-px bg-room-line"/>

                            <MenuItem active={pathname === "/feedback"} to="/feedback">Give Feedback</MenuItem>

                            <MenuItem active={pathname === "/settings"} to="/settings">Settings</MenuItem>

                            <MenuItem active={pathname === "/whats-new"} to="/whats-new">What&apos;s New</MenuItem>

                        </div>
                    </div>
                )}
            </div>

            {/* Tables: each one you have opened stays here, hidden unless it is the page you are on */}
            {GAMES.filter((g) => heldTables.includes(g.id)).map((g) => (
                <div key={g.id} hidden={g.id !== table?.id} data-table={g.id} className="relative">
                    <TableContext.Provider value={{ id: g.id, active: g.id === table?.id }}>
                        <SessionBadge />
                        <Suspense fallback={<div className="min-h-screen bg-room" />}>
                            <g.component bankroll={bankroll} setBankroll={setBankroll} />
                        </Suspense>
                    </TableContext.Provider>
                </div>
            ))}

            {/* Pages. A table's URL renders nothing here: the table itself is in the list above. */}
            <Routes>
                <Route path="/" element={home} />
                <Route path="/settings" element={<Settings onBack={goHome} />} />
                <Route path="/feedback" element={<Feedback onBack={goHome} />} />
                <Route path="/whats-new" element={<WhatsNew onBack={goHome} />} />
                {GAMES.map((g) => (
                    <Route key={g.id} path={g.path} element={null} />
                ))}
                <Route path="*" element={<NotFound />} />
            </Routes>

            {!table && (
                <footer className="border-t border-room-line bg-room-panel px-4 py-4 text-sm text-room-muted sm:px-6" data-testid="site-footer">
                    <div className="mx-auto flex max-w-[1600px] flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span>Cohn Casino</span>
                    <span className="text-base font-bold text-room-text" data-testid="site-version">v{VERSION}</span>
                    <Link
                        to="/whats-new"
                        className="border-b-2 border-transparent font-semibold text-room-text transition-colors hover:border-room-accent"
                    >
                        What&apos;s New
                    </Link>
                    </div>
                </footer>
            )}
        </div>
    )
}
