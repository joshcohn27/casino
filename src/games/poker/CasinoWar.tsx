import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import PlayingCard from "../../shared/components/Card";
import ChipTray from "../../shared/components/ChipTray";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { createShoe, type Card } from "../../shared/lib/cards";
import { defaultBet } from "../../shared/state/settings";
import { addChipToStack, BTN_GOLD, BTN_NEUTRAL, buildChipStackFromAmount, formatMoney, type ChipDenomination } from "../../shared/lib/money";
import {
    BURN_CARDS, DECKS, MIN_BET, TIE_AFTER_TIE_BONUS, TIE_PAYS,
    compareFirst, compareWar, mainReturn, rankName, surrenderReturn, tieBetReturn, warReturn,
    type FirstResult, type WarResult,
} from "./casinoWarLogic";

// Casino War: one card each, high card wins. On a tie, go to war or surrender.
// The rules and payouts are in casinoWarLogic.ts.

type Props = { bankroll: number; setBankroll: Dispatch<SetStateAction<number>> };

// royal blue felt: the table shell deepens whatever color it is given
const FELT_COLOR = "#2f6fb3";
const CHIP_KEY = "casino-war-chip";
/** Reshuffle when this few cards are left: about three quarters of the way through the shoe. */
const RESHUFFLE_AT = Math.ceil(DECKS * 52 * 0.25);
// Pace, in ms: the same beat as the Blackjack tables. Your card arrives face up; the dealer's
// is dealt face down and turned over, then the result is called.
const DEAL_MS = 380;
const FLIP_MS = 480;
const BURN_MS = 200;

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";
// a card travels in from the shoe, up and to the right, exactly as at the Blackjack tables
const CARD_VARIANTS = {
    initial: { opacity: 0, x: 36, y: -44, scale: 0.94 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
};
const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type Stage = "betting" | "dealing" | "tie" | "war" | "done";
type Zone = "main" | "tie";
/** Which line of the pay table the hand ended on. */
type Outcome = "win" | "lose" | "surrender" | "warWin" | "warTie" | "warLose";

type Settled = {
    outcome: Outcome;
    /** Everything returned to the player this hand, Tie bet included. */
    returned: number;
    lines: string[];
};

// ─── Rules popup ──────────────────────────────────────────────────────────────

const RULES_SECTIONS: [string, string[]][] = [
    ["The game", [
        `• Played from a ${DECKS}-deck shoe. You and the dealer get one card each.`,
        "• Aces are high and suits do not matter. The higher card wins even money. The lower card loses.",
    ]],
    ["A tie", [
        "• Surrender: give up half your bet and the hand is over.",
        "• Go to War: raise by an amount equal to your bet.",
        `• The dealer burns ${BURN_CARDS} cards, then deals one more card each.`,
        "• If your card ties or beats the dealer's, the raise wins even money and your original bet is returned.",
        "• If the dealer's card is higher, you lose both bets.",
        ...(TIE_AFTER_TIE_BONUS ? ["• A tie during the war pays a bonus equal to your original bet on top."] : []),
    ]],
    ["Tie bet", [
        `• An optional side bet that the first two cards tie. It pays ${TIE_PAYS} to 1.`,
        "• It is settled on the first two cards, whatever you do next.",
    ]],
    ["Strategy", [
        "• Always go to war. Surrendering costs more in the long run.",
        "• The Tie bet has a much higher house edge than the main game.",
    ]],
    ["Keys", [
        "• Space deals. W goes to war. S surrenders.",
        "• After a hand: Q clears, B changes the bet, Space rebets and deals.",
    ]],
];

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close rules modal" />
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="relative z-[101] max-h-[88dvh] w-full max-w-[760px] overflow-hidden rounded-[4px] border border-[#7fb2d9] bg-[#0d2233] text-text"
                    >
                        <div className="flex items-center justify-between border-b border-[#7fb2d9] px-4 py-3 sm:px-5 sm:py-4">
                            <div>
                                <div className="text-[13px] font-extrabold text-amber-200/90">Help</div>
                                <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">Casino War Rules</div>
                            </div>
                            <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#7fb2d9] bg-[#16344d] text-xl font-bold text-text transition-colors hover:bg-[#1f4666]" aria-label="Close rules modal">&times;</button>
                        </div>
                        <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                            <div className="space-y-4 text-base leading-6 text-text">
                                {RULES_SECTIONS.map(([title, items]) => (
                                    <div key={title} className="rounded-[4px] border border-[#7fb2d9] bg-[#16344d] p-4">
                                        <div className="mb-2 text-sm font-extrabold text-amber-200">{title}</div>
                                        <div className="space-y-1">{items.map((s) => <div key={s}>{s}</div>)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ─── Pay table ────────────────────────────────────────────────────────────────

/** A lit row changes color and background only, never its size, so nothing moves. */
function PayRow({ label, value, hit, note }: { label: string; value: string; hit?: boolean; note?: string }) {
    return (
        <div className={`rounded px-1.5 py-0.5 ${hit ? "bg-amber-300/15" : ""}`} data-hit={hit ? "true" : undefined}>
            <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className={`min-w-0 ${hit ? "text-amber-100 [text-shadow:0_0_0.6px_currentColor,0_0_0.6px_currentColor]" : "text-white/90"}`}>{label}</span>
                <span className="shrink-0 font-bold text-gold">{value}</span>
            </div>
            {note && <div className="text-[11px] leading-snug text-white/75">{note}</div>}
        </div>
    );
}

function PayTable({ outcome, tieBetHit }: { outcome: Outcome | null; tieBetHit: boolean }) {
    return (
        <div className="flex flex-col gap-0.5" data-testid="war-paytable">
            <div className="mb-1 text-center text-[13px] font-extrabold text-amber-200">Pays</div>
            <PayRow label="Higher card" value="1 to 1" hit={outcome === "win"} />
            <PayRow label="Lower card" value="Loses" hit={outcome === "lose"} />
            <div className="mt-2 border-b border-white/15 pb-0.5 text-[11px] font-bold text-white/75">On a tie</div>
            <PayRow label="Surrender" value="Lose half" hit={outcome === "surrender"} />
            <PayRow label="Win the war" value="1 to 1" hit={outcome === "warWin"} note="On the raise. Your original bet is returned." />
            {TIE_AFTER_TIE_BONUS && <PayRow label="Tie the war" value="2 to 1" hit={outcome === "warTie"} note="The raise wins, plus a bonus equal to your bet." />}
            <PayRow label="Lose the war" value="Lose both" hit={outcome === "warLose"} />
            <div className="mt-2 border-b border-white/15 pb-0.5 text-[11px] font-bold text-white/75">Side bet</div>
            <PayRow label="Tie" value={`${TIE_PAYS} to 1`} hit={tieBetHit} note="The first two cards tie." />
        </div>
    );
}

// ─── Cards on the felt ────────────────────────────────────────────────────────

/** A card as it is dealt onto the felt. A face-down card is turned over where it lies. */
function DealtCard({ card, deckNo }: { card: Card; deckNo: number }) {
    return (
        <motion.div
            key={`${deckNo}-${card.id}`}
            variants={CARD_VARIANTS}
            initial="initial"
            animate="animate"
            transition={CARD_TRANSITION(0)}
        >
            <PlayingCard card={card} className={CARD_CLS} />
        </motion.div>
    );
}

/**
 * One side of the table. The first card sits in the middle and the war card lands beside it.
 * Nothing marks where a card will go: the room for it is simply kept, so nothing moves.
 */
function Lane({ label, cards, deckNo, testId }: { label: string; cards: Card[]; deckNo: number; testId: string }) {
    const shown = cards.filter((c) => c.faceUp);
    return (
        <div className="flex w-full flex-col items-center gap-2" data-testid={testId}>
            <span className="text-[13px] font-bold text-white/85">{label}</span>
            <div className={`${CARD_CLS} relative`}>
                {cards[0] && <DealtCard card={cards[0]} deckNo={deckNo} />}
                {/* the war card lies at a slight angle, so it reads apart from the first card */}
                <div className="absolute left-full top-0 ml-4 origin-bottom-left rotate-[8deg]" data-war-card>
                    {cards[1] && <DealtCard card={cards[1]} deckNo={deckNo} />}
                </div>
            </div>
            {/* a fixed line: the name appearing must not nudge anything by even a pixel */}
            <span className="h-[18px] text-[11px] font-semibold leading-[18px] text-amber-100" data-testid={`${testId}-rank`}>
                {shown.map((c) => rankName(c)).join(" · ")}
            </span>
        </div>
    );
}

// ─── The table ────────────────────────────────────────────────────────────────

export default function CasinoWar({ bankroll, setBankroll }: Props) {
    const [showRules, setShowRules] = useState(false);
    const [shoe, setShoe] = useState<Card[]>(() => createShoe(DECKS));
    const [deckNo, setDeckNo] = useState(1);

    const [mainChips, setMainChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("casinowar", "main")));
    const [tieChips, setTieChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("casinowar", "tie")));
    const [selectedZone, setSelectedZone] = useState<Zone>("main");
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(() => {
        const v = Number(window.localStorage.getItem(CHIP_KEY));
        return ([1, 2.5, 5, 25, 100, 500, 1000, 5000].includes(v) ? v : 25) as ChipDenomination;
    });
    useEffect(() => { window.localStorage.setItem(CHIP_KEY, String(selectedChip)); }, [selectedChip]);

    // the bets locked in for the hand in play
    const [mainBet, setMainBet] = useState(0);
    const [tieBet, setTieBet] = useState(0);
    const [raiseBet, setRaiseBet] = useState(0);

    const [stage, setStage] = useState<Stage>("betting");
    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [dealerCards, setDealerCards] = useState<Card[]>([]);
    const [burnCards, setBurnCards] = useState<Card[]>([]);
    const [first, setFirst] = useState<FirstResult | null>(null);
    /** Paid as soon as the first two cards are out: the Tie bet. */
    const [tiePaid, setTiePaid] = useState(0);
    const [settled, setSettled] = useState<Settled | null>(null);
    const [message, setMessage] = useState("Place your bet and press Deal.");
    // one action at a time: a second press is ignored while cards are being dealt
    const busy = useRef(false);

    const pendingMain = mainChips.reduce((s, d) => s + Number(d), 0);
    const pendingTie = tieChips.reduce((s, d) => s + Number(d), 0);
    const isBetting = stage === "betting";
    const canDeal = pendingMain >= MIN_BET && bankroll >= pendingMain + pendingTie;
    const canWar = bankroll >= mainBet;

    // ─── Betting ──────────────────────────────────────────────────────────────

    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (!isBetting) return;
        if (selectedZone === "main") setMainChips((p) => addChipToStack(p, chip));
        else setTieChips((p) => addChipToStack(p, chip));
    };
    const removeLastChip = (zone: Zone) => {
        if (!isBetting) return;
        if (zone === "main") setMainChips((p) => p.slice(0, -1));
        else setTieChips((p) => p.slice(0, -1));
    };
    const clearTable = () => {
        setPlayerCards([]); setDealerCards([]); setBurnCards([]);
        setFirst(null); setTiePaid(0); setSettled(null);
        setMainBet(0); setTieBet(0); setRaiseBet(0);
    };
    const handleClear = () => {
        if (busy.current) return;
        setMainChips([]); setTieChips([]);
        clearTable();
        setSelectedZone("main");
        setStage("betting");
        setMessage("Place your bet and press Deal.");
    };
    const handleChangeBet = () => {
        if (busy.current) return;
        clearTable();
        setStage("betting");
        setMessage(shoe.length < RESHUFFLE_AT ? "Cut card reached. The next hand shuffles the shoe." : "Place your bet and press Deal.");
    };

    // ─── Play ─────────────────────────────────────────────────────────────────

    const finish = (result: Settled, text: string) => {
        setSettled(result);
        setMessage(text);
        setStage("done");
        busy.current = false;
    };

    const handleDeal = async () => {
        if (busy.current || (stage !== "betting" && stage !== "done") || !canDeal) return;
        busy.current = true;
        const bet = pendingMain, side = pendingTie;
        setBankroll((b) => b - bet - side);
        clearTable();
        setMainBet(bet); setTieBet(side);
        setStage("dealing");

        let cards = shoe;
        if (cards.length < RESHUFFLE_AT) {
            // a new shoe comes from the other color of deck
            cards = createShoe(DECKS);
            setDeckNo((n) => n + 1);
            setMessage("Shuffling a new shoe.");
            await wait(700);
        }
        setMessage("Dealing.");
        const [playerCard, dealerCard, ...rest] = cards;
        setShoe(rest);
        // yours face up, the dealer's face down, then the dealer's is turned over
        setPlayerCards([{ ...playerCard, faceUp: true }]);
        await wait(DEAL_MS);
        setDealerCards([{ ...dealerCard, faceUp: false }]);
        await wait(DEAL_MS);
        setDealerCards([{ ...dealerCard, faceUp: true }]);
        await wait(FLIP_MS);

        const result = compareFirst(playerCard, dealerCard);
        setFirst(result);
        // the Tie bet is settled on these two cards, whatever happens next
        const sidePaid = tieBetReturn(side, result);
        if (sidePaid > 0) setBankroll((b) => b + sidePaid);
        setTiePaid(sidePaid);
        const sideLine = side > 0 ? [sidePaid > 0 ? `Tie bet: wins ${TIE_PAYS} to 1` : "Tie bet: lost"] : [];

        if (result === "tie") {
            setStage("tie");
            setMessage(`${rankName(playerCard)}s. It's a tie. Go to war or surrender.`);
            busy.current = false;
            return;
        }
        const back = mainReturn(bet, result);
        if (back > 0) setBankroll((b) => b + back);
        finish(
            { outcome: result, returned: back + sidePaid, lines: [result === "win" ? "Bet: wins 1 to 1" : "Bet: lost", ...sideLine] },
            result === "win" ? `${rankName(playerCard)} beats ${rankName(dealerCard)}. You win.` : `${rankName(dealerCard)} beats ${rankName(playerCard)}. Dealer wins.`,
        );
    };

    const sideLine = () => (tieBet > 0 ? [tiePaid > 0 ? `Tie bet: wins ${TIE_PAYS} to 1` : "Tie bet: lost"] : []);

    const handleSurrender = () => {
        if (busy.current || stage !== "tie") return;
        busy.current = true;
        const back = surrenderReturn(mainBet);
        setBankroll((b) => b + back);
        finish({ outcome: "surrender", returned: back + tiePaid, lines: ["Bet: surrendered, half returned", ...sideLine()] }, "You surrender. Half your bet is returned.");
    };

    const handleWar = async () => {
        if (busy.current || stage !== "tie" || !canWar) return;
        busy.current = true;
        const raise = mainBet;
        setBankroll((b) => b - raise);
        setRaiseBet(raise);
        setStage("war");
        setMessage(`War! The dealer burns ${BURN_CARDS} cards.`);
        await wait(DEAL_MS - 120);
        // the burn cards come off the shoe one at a time, face down, onto the felt
        const burn = shoe.slice(0, BURN_CARDS).map((c) => ({ ...c, faceUp: false }));
        for (let i = 0; i < burn.length; i++) {
            setBurnCards(burn.slice(0, i + 1));
            await wait(BURN_MS);
        }
        await wait(DEAL_MS - BURN_MS);

        const [playerCard, dealerCard, ...rest] = shoe.slice(BURN_CARDS);
        setShoe(rest);
        setMessage("One more card each.");
        setPlayerCards((prev) => [...prev, { ...playerCard, faceUp: true }]);
        await wait(DEAL_MS);
        setDealerCards((prev) => [...prev, { ...dealerCard, faceUp: false }]);
        await wait(DEAL_MS);
        setDealerCards((prev) => prev.map((c, i) => (i === 1 ? { ...c, faceUp: true } : c)));
        await wait(FLIP_MS);

        const war: WarResult = compareWar(playerCard, dealerCard);
        const back = warReturn(mainBet, raise, war);
        if (back > 0) setBankroll((b) => b + back);
        const outcome: Outcome = war === "win" ? "warWin" : war === "tie" ? "warTie" : "warLose";
        const line = war === "win" ? "War: raise wins 1 to 1, bet returned"
            : war === "tie" ? (TIE_AFTER_TIE_BONUS ? "War tied: raise wins, plus a bonus equal to your bet" : "War tied: raise wins 1 to 1, bet returned")
            : "War: bet and raise lost";
        const text = war === "win" ? `${rankName(playerCard)} beats ${rankName(dealerCard)}. You win the war.`
            : war === "tie" ? `${rankName(playerCard)}s again. A tie wins the war${TIE_AFTER_TIE_BONUS ? ", with a bonus" : ""}.`
            : `${rankName(dealerCard)} beats ${rankName(playerCard)}. Dealer wins the war.`;
        finish({ outcome, returned: back + tiePaid, lines: [line, ...sideLine()] }, text);
    };

    // ─── Derived for the render ───────────────────────────────────────────────

    const wagered = mainBet + tieBet + raiseBet;
    const returned = settled?.returned ?? 0;
    const net = returned - wagered;
    const mainWon = settled ? settled.outcome === "win" || settled.outcome === "warWin" || settled.outcome === "warTie" : false;
    const tieWon = tiePaid > 0;

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            <TableShell deckNo={deckNo}
                feltColor={FELT_COLOR}
                gameName="Casino War"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
                        <ChipTray selectedChip={selectedChip} onSelect={handleChipSelect} disabled={!isBetting} />
                        <div className="flex min-h-[48px] items-center justify-center gap-2">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {isBetting && (
                                    <SlideBtn key="clear">
                                        <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={handleClear} disabled={pendingMain === 0 && pendingTie === 0}>Clear</button>
                                    </SlideBtn>
                                )}
                                {isBetting && (
                                    <SlideBtn key="deal">
                                        <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={() => void handleDeal()} disabled={!canDeal}>Deal</button>
                                    </SlideBtn>
                                )}
                                {stage === "tie" && (
                                    <SlideBtn key="surrender">
                                        <button data-hotkey="S" className={BTN_NEUTRAL} onClick={handleSurrender}>Surrender</button>
                                    </SlideBtn>
                                )}
                                {stage === "tie" && (
                                    <SlideBtn key="war">
                                        <button data-hotkey="W" className={BTN_GOLD} onClick={() => void handleWar()} disabled={!canWar}>Go to War</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="clear-done">
                                        <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={handleClear}>Clear</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="change-bet">
                                        <button data-hotkey="B" className={BTN_NEUTRAL} onClick={handleChangeBet}>Change Bet</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="rebet-deal">
                                        <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={() => void handleDeal()} disabled={!canDeal}>Rebet &amp; Deal</button>
                                    </SlideBtn>
                                )}
                            </AnimatePresence>
                        </div>
                        <div className="invisible hidden sm:block">
                            <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
                        </div>
                    </div>
                }
            >
                {/* Title */}
                <div className="mb-3 flex shrink-0 select-none flex-col items-center gap-0.5">
                    <div className="flex items-center gap-2">
                        <h1 className="text-center text-2xl font-bold text-gold-soft">Casino War</h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>One card each</span>
                        <span className="text-white/75">·</span>
                        <span>High card wins</span>
                        <span className="text-white/75">·</span>
                        <span>Tie: go to war or surrender</span>
                        <span className="text-white/75">·</span>
                        <span>Tie bet pays {TIE_PAYS} to 1</span>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* Left column - betting. On narrow screens it sits under the cards, and it stays there:
                        the two never swap places, so dealing a hand moves nothing. */}
                    <div className={`order-2 flex w-full flex-col items-center justify-center gap-3 px-4 py-2 lg:order-1 lg:w-64 lg:shrink-0 lg:px-0`}>
                        <BetBar
                            compact
                            pendingBet={isBetting ? pendingMain + pendingTie : wagered}
                            returned={returned}
                            net={net}
                            showResult={stage === "done"}
                        />
                        <div className="flex items-end gap-4">
                            <BetSpot
                                testId="tie"
                                label="Tie" sublabel={`${TIE_PAYS} to 1`}
                                chips={isBetting ? tieChips : buildChipStackFromAmount(tieBet)}
                                totalBet={isBetting ? pendingTie : tieBet}
                                dim={82}
                                canBet={isBetting}
                                isSelected={selectedZone === "tie"}
                                isWinner={tieWon}
                                onSelect={() => setSelectedZone("tie")}
                                onRemove={() => removeLastChip("tie")}
                            />
                            <BetSpot
                                testId="main"
                                label="Bet" sublabel={`min $${MIN_BET}`}
                                chips={isBetting ? mainChips : buildChipStackFromAmount(mainBet)}
                                totalBet={isBetting ? pendingMain : mainBet}
                                dim={110}
                                canBet={isBetting}
                                isSelected={selectedZone === "main"}
                                isWinner={mainWon}
                                onSelect={() => setSelectedZone("main")}
                                onRemove={() => removeLastChip("main")}
                            />
                        </div>
                        {/* The raise goes here when you go to war. It is always on the felt. */}
                        <BetSpot
                            testId="war"
                            label="War" sublabel="matches bet"
                            chips={buildChipStackFromAmount(raiseBet)}
                            totalBet={raiseBet}
                            dim={94}
                            isLocked
                            canBet={false}
                            isSelected={false}
                            isWinner={raiseBet > 0 && mainWon}
                        />
                        {/* How each bet came out. The space is always reserved, so nothing above moves. */}
                        <div className="flex min-h-[52px] w-full flex-col items-center gap-1 text-center" data-testid="result-lines">
                            {stage === "done" && settled?.lines.map((line, i) => (
                                <p key={i} className={`text-[11px] leading-snug ${i === 0 ? (net > 0 ? "font-bold text-emerald-300" : net < 0 ? "font-bold text-red-300" : "font-bold text-amber-100") : "text-white/90"}`}>{line}</p>
                            ))}
                        </div>
                    </div>

                    {/* Center column - cards */}
                    <div className="order-1 flex w-full flex-col items-center justify-center gap-3 px-2 py-2 lg:order-2 lg:flex-1">
                        <Lane label="Dealer" cards={dealerCards} deckNo={deckNo} testId="dealer" />

                        {/* The burn cards are dealt here at full size, between the two hands. The row is
                            always this tall, so they push nothing when they land. */}
                        <div className="flex h-[80px] w-full items-center justify-center sm:h-[94px]" data-testid="burn" data-burned={burnCards.length || undefined} aria-label={burnCards.length ? `${burnCards.length} cards burned` : undefined}>
                            {burnCards.map((card, i) => (
                                <div key={`${deckNo}-${card.id}`} className={i > 0 ? "-ml-7 sm:-ml-8" : ""} style={{ zIndex: i }}>
                                    <DealtCard card={card} deckNo={deckNo} />
                                </div>
                            ))}
                        </div>

                        <Lane label="Player" cards={playerCards} deckNo={deckNo} testId="player" />

                        {/* The message keeps the same room whatever it says */}
                        <p className="flex min-h-[40px] max-w-md items-center px-2 text-center text-sm font-semibold text-amber-50" data-testid="message">{message}</p>
                        {first === "tie" && stage === "tie" && !canWar && <span className="sr-only">Not enough chips to go to war</span>}
                    </div>

                    {/* Right column - pay table, desktop only */}
                    <div className="order-3 hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:justify-center">
                        <PayTable outcome={settled?.outcome ?? null} tieBetHit={tieWon} />
                        <div className="mt-4 text-center text-[11px] leading-relaxed text-white/75">
                            {DECKS}-deck shoe · {formatMoney(MIN_BET)} minimum
                        </div>
                    </div>
                </div>
            </TableShell>
        </>
    );
}
