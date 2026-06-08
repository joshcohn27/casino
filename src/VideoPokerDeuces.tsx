import React, { useMemo, useState } from "react"

type Props = {
    bankroll: number
    setBankroll: React.Dispatch<React.SetStateAction<number>>
}

type Suit = "♠" | "♥" | "♦" | "♣"
type Rank =
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "10"
    | "J"
    | "Q"
    | "K"
    | "A"

type Card = {
    rank: Rank
    suit: Suit
    id: string
}

type Stage = "ready" | "dealt" | "drawn"

type PayoutKey =
    | "naturalRoyal"
    | "fiveKind"
    | "wildRoyal"
    | "straightFlush"
    | "fourKind"
    | "fullHouse"
    | "flush"
    | "straight"
    | "threeKind"

type EvalResult = {
    key: PayoutKey | null
    label: string
    payout: number
}

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"]
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
const BET_COLUMNS = [1, 2, 3, 4, 5] as const
const DENOM_VALUES = [1, 2, 5, 10, 25] as const

const PAY_TABLE: { key: PayoutKey; label: string; pays: [number, number, number, number, number] }[] = [
    { key: "naturalRoyal", label: "NATURAL ROYAL FLUSH", pays: [250, 500, 750, 1000, 4000] },
    { key: "fiveKind",     label: "FIVE OF A KIND",      pays: [15, 30, 45, 60, 75] },
    { key: "wildRoyal",    label: "WILD ROYAL FLUSH",    pays: [25, 50, 75, 100, 125] },
    { key: "straightFlush",label: "STRAIGHT FLUSH",      pays: [9, 18, 27, 36, 45] },
    { key: "fourKind",     label: "FOUR OF A KIND",      pays: [5, 10, 15, 20, 25] },
    { key: "fullHouse",    label: "FULL HOUSE",           pays: [3, 6, 9, 12, 15] },
    { key: "flush",        label: "FLUSH",                pays: [2, 4, 6, 8, 10] },
    { key: "straight",     label: "STRAIGHT",             pays: [2, 4, 6, 8, 10] },
    { key: "threeKind",    label: "THREE OF A KIND",      pays: [1, 2, 3, 4, 5] },
]

const CONTROL_SHADOW = {
    textShadow: "2px 2px 0 #8b0000, -1px -1px 0 #ffef61",
}

const PANEL_SHADOW = {
    boxShadow: "inset 0 0 0 3px #efe957, inset 0 0 0 6px #001b85, 0 18px 40px rgba(0,0,0,0.45)",
}

const rankValue = (rank: Rank) => {
    if (rank === "A") return 14
    if (rank === "K") return 13
    if (rank === "Q") return 12
    if (rank === "J") return 11
    return Number(rank)
}

const isRedSuit = (suit: Suit) => suit === "♥" || suit === "♦"

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function makeDeck(): Card[] {
    const deck: Card[] = []
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({
                rank,
                suit,
                id: `${rank}-${suit}-${Math.random().toString(36).slice(2, 10)}`,
            })
        }
    }
    return deck
}

function shuffleDeck(deck: Card[]) {
    const copy = [...deck]
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
}

// Returns true if sorted-desc natural values + wild count can form a 5-card straight
function canFormStraight(vals: number[], wilds: number): boolean {
    if (new Set(vals).size !== vals.length) return false

    for (let low = 1; low <= 10; low++) {
        const allInWindow = vals.every(v => v >= low && v <= low + 4)
        if (!allInWindow) continue
        const gaps = 5 - vals.length
        if (gaps <= wilds) return true
    }

    // Wheel A-2-3-4-5: treat A(14) as 1
    if (vals.includes(14)) {
        const wheelVals = vals.map(v => v === 14 ? 1 : v)
        if (new Set(wheelVals).size === wheelVals.length) {
            const allInWheel = wheelVals.every(v => v >= 1 && v <= 5)
            if (allInWheel) {
                const gaps = 5 - wheelVals.length
                if (gaps <= wilds) return true
            }
        }
    }

    return false
}

function evaluateHand(hand: Card[], creditsBet: number, denom: number): EvalResult {
    if (hand.length !== 5) return { key: null, label: "", payout: 0 }

    const payoutFor = (key: PayoutKey) =>
        PAY_TABLE.find(r => r.key === key)!.pays[creditsBet - 1] * denom

    // Step A
    const deuces = hand.filter(c => c.rank === "2").length
    const naturals = hand.filter(c => c.rank !== "2")
    const natVals = naturals.map(c => rankValue(c.rank)).sort((a, b) => b - a)
    const allSameSuit = naturals.length === 0 || naturals.every(c => c.suit === naturals[0].suit)

    // Step B
    const rankCounts = new Map<number, number>()
    for (const v of natVals) rankCounts.set(v, (rankCounts.get(v) ?? 0) + 1)
    const maxCount = Math.max(0, ...rankCounts.values())
    const hasDuplicateNaturals = maxCount > 1

    // 1. Natural Royal Flush (0 deuces only)
    if (deuces === 0) {
        if (
            allSameSuit &&
            natVals[0] === 14 && natVals[1] === 13 &&
            natVals[2] === 12 && natVals[3] === 11 && natVals[4] === 10
        ) {
            return { key: "naturalRoyal", label: "NATURAL ROYAL FLUSH", payout: payoutFor("naturalRoyal") }
        }
    }

    // 2. Five of a Kind
    if (deuces === 4) {
        return { key: "fiveKind", label: "FIVE OF A KIND", payout: payoutFor("fiveKind") }
    }
    if (deuces >= 1 && maxCount === 5 - deuces) {
        return { key: "fiveKind", label: "FIVE OF A KIND", payout: payoutFor("fiveKind") }
    }

    // 3. Wild Royal Flush (1+ deuces)
    if (
        deuces >= 1 &&
        allSameSuit &&
        naturals.every(c => rankValue(c.rank) >= 10) &&
        new Set(natVals).size === naturals.length
    ) {
        return { key: "wildRoyal", label: "WILD ROYAL FLUSH", payout: payoutFor("wildRoyal") }
    }

    // 4. Straight Flush
    if (allSameSuit && naturals.length > 0 && canFormStraight(natVals, deuces)) {
        return { key: "straightFlush", label: "STRAIGHT FLUSH", payout: payoutFor("straightFlush") }
    }

    // 5. Four of a Kind
    if (deuces === 0 && maxCount === 4) {
        return { key: "fourKind", label: "FOUR OF A KIND", payout: payoutFor("fourKind") }
    }
    if (deuces >= 1 && maxCount >= 4 - deuces) {
        return { key: "fourKind", label: "FOUR OF A KIND", payout: payoutFor("fourKind") }
    }
    if (deuces === 3) {
        return { key: "fourKind", label: "FOUR OF A KIND", payout: payoutFor("fourKind") }
    }

    // 6. Full House
    if (deuces === 0) {
        const freqs = [...rankCounts.values()].sort((a, b) => b - a)
        if (freqs[0] === 3 && freqs[1] === 2) {
            return { key: "fullHouse", label: "FULL HOUSE", payout: payoutFor("fullHouse") }
        }
    }
    if (deuces === 1) {
        const pairs = [...rankCounts.values()].filter(c => c >= 2).length
        if (pairs >= 2) {
            return { key: "fullHouse", label: "FULL HOUSE", payout: payoutFor("fullHouse") }
        }
    }

    // 7. Flush
    if (allSameSuit && naturals.length > 0) {
        return { key: "flush", label: "FLUSH", payout: payoutFor("flush") }
    }

    // 8. Straight
    if (!hasDuplicateNaturals && canFormStraight(natVals, deuces)) {
        return { key: "straight", label: "STRAIGHT", payout: payoutFor("straight") }
    }

    // 9. Three of a Kind
    if (deuces === 0 && maxCount === 3) {
        return { key: "threeKind", label: "THREE OF A KIND", payout: payoutFor("threeKind") }
    }
    if (deuces === 1 && maxCount >= 2) {
        return { key: "threeKind", label: "THREE OF A KIND", payout: payoutFor("threeKind") }
    }
    if (deuces >= 2) {
        return { key: "threeKind", label: "THREE OF A KIND", payout: payoutFor("threeKind") }
    }

    return { key: null, label: "NO WIN", payout: 0 }
}

function CardView({
    card,
    held,
    onToggle,
    canHold,
}: {
    card: Card | null
    held: boolean
    onToggle: () => void
    canHold: boolean
}) {
    const red = card ? isRedSuit(card.suit) : false
    const isWild = card?.rank === "2"

    return (
        <div className="flex flex-col items-center">
            <div className="mb-1 h-[24px]">
                {held ? (
                    <div
                        className="rounded-sm border-[3px] border-black bg-yellow-300 px-2 py-[1px] text-[18px] font-black leading-none text-red-600"
                        style={{ ...CONTROL_SHADOW, fontFamily: '"Arial Black", Impact, sans-serif' }}
                    >
                        HELD
                    </div>
                ) : null}
            </div>

            <button
                type="button"
                onClick={onToggle}
                disabled={!canHold || !card}
                className={`relative h-[180px] w-[122px] overflow-hidden rounded-[10px] border-[3px] transition ${held ? "border-yellow-300" : "border-black"
                    } ${canHold ? "cursor-pointer" : "cursor-default"}`}
                style={{
                    background: "#f6f6f6",
                    boxShadow: held ? "0 0 0 4px rgba(255,235,59,0.25)" : "none",
                }}
            >
                {card ? (
                    <>
                        <div
                            className={`absolute left-[8px] top-[6px] text-[50px] font-black leading-[0.8] ${red ? "text-red-600" : "text-black"
                                }`}
                            style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}
                        >
                            {card.rank}
                        </div>

                        <div
                            className={`absolute left-[10px] top-[56px] text-[52px] leading-none ${red ? "text-red-600" : "text-black"
                                }`}
                        >
                            {card.suit}
                        </div>

                        <div
                            className={`absolute bottom-[10px] left-1/2 -translate-x-1/2 text-[96px] leading-none ${red ? "text-red-600" : "text-black"
                                }`}
                        >
                            {card.suit}
                        </div>

                        {isWild && (
                            <div
                                className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-emerald-400 py-[3px] text-[14px] font-black leading-none text-black"
                                style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}
                            >
                                WILD
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center text-4xl font-black text-slate-500">?</div>
                )}
            </button>
        </div>
    )
}

function RetroButton({
    label,
    onClick,
    disabled,
    small,
    tone = "yellow",
}: {
    label: string
    onClick: () => void
    disabled?: boolean
    small?: boolean
    tone?: "yellow" | "white" | "disabled"
}) {
    const base =
        tone === "yellow"
            ? "bg-gradient-to-b from-yellow-200 to-yellow-400 text-[#132b9a]"
            : tone === "white"
                ? "bg-gradient-to-b from-white to-slate-200 text-black"
                : "bg-gradient-to-b from-slate-500 to-slate-700 text-slate-200"

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`border-[3px] border-[#897700] font-black uppercase transition disabled:cursor-not-allowed disabled:opacity-70 ${small ? "min-h-[38px] px-3 text-[20px]" : "min-h-[46px] px-4 text-[24px]"
                } ${base}`}
            style={{
                fontFamily: '"Arial Black", Impact, sans-serif',
                boxShadow: "inset 0 2px 0 rgba(255,255,255,0.7), 0 2px 0 rgba(0,0,0,0.35)",
            }}
        >
            {label}
        </button>
    )
}

function DenomBadge({
    denom,
    onClick,
    disabled,
}: {
    denom: number
    onClick: () => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-[4px] border-[#efe957] bg-[#ff2a00] text-center transition disabled:cursor-not-allowed disabled:opacity-70"
            style={{
                boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35), 0 4px 0 rgba(0,0,0,0.35)",
                fontFamily: '"Arial Black", Impact, sans-serif',
            }}
        >
            <div className="leading-none">
                <div className="text-[14px] font-black text-yellow-200" style={CONTROL_SHADOW}>
                    DENOM
                </div>
                <div className="mt-1 text-[28px] font-black text-yellow-300" style={CONTROL_SHADOW}>
                    ${denom}
                </div>
            </div>
        </button>
    )
}

export default function VideoPokerDeuces({ bankroll, setBankroll }: Props) {
    const [stage, setStage] = useState<Stage>("ready")
    const [bet, setBet] = useState(5)
    const [denom, setDenom] = useState<(typeof DENOM_VALUES)[number]>(1)
    const [hand, setHand] = useState<Card[]>([])
    const [held, setHeld] = useState<boolean[]>([false, false, false, false, false])
    const [deck, setDeck] = useState<Card[]>([])
    const [lastWin, setLastWin] = useState(0)
    const [message, setMessage] = useState("BET 5")
    const [activeRow, setActiveRow] = useState<PayoutKey | null>(null)
    const [helpOpen, setHelpOpen] = useState(false)

    const canDeal = stage === "ready" || stage === "drawn"
    const canDraw = stage === "dealt"

    const totalBet = bet * denom
    const creditDisplay = useMemo(() => formatNumber(bankroll), [bankroll])
    const winDisplay = useMemo(() => formatNumber(lastWin), [lastWin])
    const wagerDisplay = useMemo(() => formatNumber(totalBet), [totalBet])

    const startNewHand = () => {
        if (bankroll < totalBet) {
            setMessage("NOT ENOUGH CREDITS")
            return
        }

        const freshDeck = shuffleDeck(makeDeck())
        const nextHand = freshDeck.slice(0, 5)
        const remainingDeck = freshDeck.slice(5)

        setBankroll((current) => current - totalBet)
        setDeck(remainingDeck)
        setHand(nextHand)
        setHeld([false, false, false, false, false])
        setLastWin(0)
        setActiveRow(null)
        setStage("dealt")
        setMessage("SELECT CARDS TO HOLD")
    }

    const drawCards = () => {
        const workingDeck = [...deck]
        const nextHand = [...hand]

        for (let i = 0; i < nextHand.length; i += 1) {
            if (!held[i]) {
                const replacement = workingDeck.shift()
                if (replacement) {
                    nextHand[i] = replacement
                }
            }
        }

        const result = evaluateHand(nextHand, bet, denom)

        setHand(nextHand)
        setDeck(workingDeck)
        setStage("drawn")
        setHeld([false, false, false, false, false])
        setLastWin(result.payout)
        setActiveRow(result.key)
        setMessage(result.label || "NO WIN")

        if (result.payout > 0) {
            setBankroll((current) => current + result.payout)
        }
    }

    const onDealDraw = () => {
        if (canDeal) {
            startNewHand()
            return
        }

        if (canDraw) {
            drawCards()
        }
    }

    const toggleHold = (index: number) => {
        if (stage !== "dealt") return
        setHeld((current) => current.map((value, i) => (i === index ? !value : value)))
    }

    const handleBetOne = () => {
        if (!canDeal) return
        const nextBet = bet >= 5 ? 1 : bet + 1
        setBet(nextBet)
        setMessage(`BET ${nextBet}`)
        setActiveRow(null)
        setLastWin(0)
    }

    const handleBetMax = () => {
        if (!canDeal) return
        setBet(5)
        setMessage("BET 5")
        setActiveRow(null)
        setLastWin(0)
    }

    const handleDenom = () => {
        if (!canDeal) return
        const currentIndex = DENOM_VALUES.indexOf(denom)
        const nextDenom = DENOM_VALUES[(currentIndex + 1) % DENOM_VALUES.length]
        setDenom(nextDenom)
        setMessage(`DENOM ${nextDenom}`)
        setActiveRow(null)
        setLastWin(0)
    }

    return (
        <div className="min-h-screen bg-[#020202] px-2 py-4 text-white md:px-4">
            <div
                className="mx-auto w-full max-w-[980px] overflow-hidden border-[4px] border-[#efe957] bg-[#0825b2]"
                style={PANEL_SHADOW}
            >
                {/* Game subtitle */}
                <div className="border-b-[4px] border-[#efe957] bg-[#020202] py-1.5 text-center">
                    <div
                        className="text-[16px] font-black text-yellow-300 md:text-[20px]"
                        style={{ ...CONTROL_SHADOW, fontFamily: '"Arial Black", Impact, sans-serif' }}
                    >
                        DEUCES WILD · FULL PAY
                    </div>
                </div>

                <div id="video-poker-paytable" className="border-b-[4px] border-[#efe957]">
                    <div className="grid grid-cols-[1.9fr_repeat(5,1fr)]">
                        <div className="border-r-[3px] border-[#efe957] bg-[#0825b2]" />
                        {BET_COLUMNS.map((value, index) => {
                            const isActiveColumn = bet === value
                            return (
                                <div
                                    key={value}
                                    className={`border-t-0 border-[#efe957] py-1 text-center text-[28px] font-black leading-none ${index < BET_COLUMNS.length - 1 ? "border-r-[3px]" : ""
                                        } ${isActiveColumn ? "bg-[#ff2a00] text-yellow-300" : "bg-[#0825b2] text-yellow-300"}`}
                                    style={{ ...CONTROL_SHADOW, fontFamily: '"Arial Black", Impact, sans-serif' }}
                                >
                                    {value}
                                </div>
                            )
                        })}
                    </div>

                    {PAY_TABLE.map((row) => {
                        const isWinningRow = activeRow === row.key

                        return (
                            <div key={row.key} className="grid grid-cols-[1.9fr_repeat(5,1fr)]">
                                <div
                                    className={`border-r-[3px] border-t-[3px] border-[#efe957] px-2 py-[2px] text-[18px] font-black uppercase leading-none md:text-[21px] ${isWinningRow ? "bg-[#0b7d12] text-white" : "bg-[#0825b2] text-yellow-300"
                                        }`}
                                    style={{ ...CONTROL_SHADOW, fontFamily: '"Arial Black", Impact, sans-serif' }}
                                >
                                    {row.label}
                                </div>

                                {row.pays.map((value, index) => {
                                    const columnBet = index + 1
                                    const isActiveColumn = bet === columnBet

                                    let cellClass = "bg-[#0825b2] text-yellow-300"
                                    if (isWinningRow) {
                                        cellClass = "bg-[#0b7d12] text-white"
                                    } else if (isActiveColumn) {
                                        cellClass = "bg-[#ff2a00] text-yellow-300"
                                    }

                                    return (
                                        <div
                                            key={`${row.key}-${index}`}
                                            className={`border-t-[3px] border-[#efe957] py-[2px] text-center text-[18px] font-black leading-none md:text-[21px] ${index < row.pays.length - 1 ? "border-r-[3px]" : ""
                                                } ${cellClass}`}
                                            style={{ ...CONTROL_SHADOW, fontFamily: '"Arial Black", Impact, sans-serif' }}
                                        >
                                            {value}
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>

                <div className="px-1 pb-1 pt-2 md:px-2">
                    <div className="flex flex-wrap items-start justify-center gap-2 md:gap-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <CardView
                                key={hand[index]?.id ?? `empty-${index}`}
                                card={hand[index] ?? null}
                                held={held[index]}
                                canHold={stage === "dealt"}
                                onToggle={() => toggleHold(index)}
                            />
                        ))}
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-3 border-t-[4px] border-[#efe957] px-1 pt-2">
                        <div className="flex items-end gap-3">
                            <div>
                                <div
                                    className="text-[26px] font-black leading-none text-yellow-300 md:text-[34px]"
                                    style={{ ...CONTROL_SHADOW, fontFamily: '"Arial Black", Impact, sans-serif' }}
                                >
                                    WIN
                                </div>
                                <div
                                    className="mt-1 min-w-[92px] text-center text-[34px] font-black leading-none text-yellow-300 md:min-w-[120px] md:text-[48px]"
                                    style={{ ...CONTROL_SHADOW, fontFamily: '"Arial Black", Impact, sans-serif' }}
                                >
                                    {winDisplay}
                                </div>
                            </div>

                            <div className="pb-0">
                                <div
                                    className="text-center text-[20px] font-black leading-none text-white md:text-[24px]"
                                    style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}
                                >
                                    BET {bet}
                                </div>
                                <div
                                    className="mt-1 text-center text-[14px] font-black leading-none text-yellow-200 md:text-[16px]"
                                    style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}
                                >
                                    WAGER ${wagerDisplay}
                                </div>
                                <div
                                    className="mt-1 text-center text-[12px] font-bold uppercase tracking-[0.14em] text-yellow-200 md:text-[13px]"
                                    style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}
                                >
                                    {message}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-center pb-1">
                            <DenomBadge denom={denom} onClick={handleDenom} disabled={!canDeal} />
                        </div>

                        <div className="text-right">
                            <div
                                className="text-[26px] font-black leading-none text-yellow-300 md:text-[34px]"
                                style={{ ...CONTROL_SHADOW, fontFamily: '"Arial Black", Impact, sans-serif' }}
                            >
                                CREDIT {creditDisplay}
                            </div>
                        </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-[auto_auto_auto_auto_1fr] md:items-end">
                        <RetroButton label="HELP" onClick={() => setHelpOpen((current) => !current)} />
                        <RetroButton label="MORE GAMES" onClick={() => { }} disabled tone="disabled" />
                        <RetroButton label="BET ONE" onClick={handleBetOne} tone="white" />
                        <RetroButton label="BET MAX" onClick={handleBetMax} tone="white" />
                        <div className="flex justify-end">
                            <RetroButton
                                label={stage === "dealt" ? "DRAW" : "DEAL"}
                                onClick={onDealDraw}
                                small={false}
                            />
                        </div>
                    </div>

                    {helpOpen ? (
                        <div className="mt-3 border-[3px] border-[#efe957] bg-[#001a88] px-4 py-3 text-sm text-white">
                            <div
                                className="font-black uppercase text-yellow-300"
                                style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}
                            >
                                How to play — Deuces Wild
                            </div>
                            <div className="mt-2 leading-6 text-white/95">
                                All four 2s are wild and can substitute for any card.{" "}
                                Minimum paying hand is <span className="font-bold text-yellow-300">THREE OF A KIND</span>.{" "}
                                2s are highlighted <span className="font-bold text-emerald-300">WILD</span> on the card.{" "}
                                <span className="font-bold text-yellow-300">BET ONE</span> changes the active column and{" "}
                                <span className="font-bold text-yellow-300">BET MAX</span> sets it to 5.{" "}
                                <span className="font-bold text-yellow-300">DENOM</span> cycles the dollar value of each
                                credit: 1, 2, 5, 10, 25.
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
