import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import PlayingCard from "./shared/Card";
import { SlideBtn } from "./shared/SlideBtn";
import { createShoe, type Card } from "./shared/cards";
import { BTN_BASE, BTN_GOLD, BTN_NEUTRAL, formatMoney } from "./shared/money";

// Card Ladder: a free game for winning chips. Four cards come off a fresh 52-card deck,
// one at a time, and you call something about each before it is turned over. Get all four
// right and the prize is yours. Nothing is bet, so a miss costs nothing.

type Props = { bankroll: number; setBankroll: Dispatch<SetStateAction<number>> };

const FELT_COLOR = "#5b3a1a";
const PRIZE = 1000;
/** How long the buttons stay locked while a card turns over (ms). */
const FLIP_MS = 450;

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";
const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
};
const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});

const BTN_RED = `${BTN_BASE} border-red-400 bg-red-600 text-white hover:bg-red-500 active:bg-red-700`;

// ─── Rules of the game ────────────────────────────────────────────────────────

const RANK_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const rankValue = (card: Card) => RANK_ORDER.indexOf(card.rank);
const isRed = (card: Card) => card.suit === "♥" || card.suit === "♦";

const RANK_NAMES: Record<string, string> = { T: "10", J: "Jack", Q: "Queen", K: "King", A: "Ace" };
const SUIT_NAMES: Record<string, string> = { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" };
const cardName = (card: Card) => `${RANK_NAMES[card.rank] ?? card.rank} of ${SUIT_NAMES[card.suit]}`;

type Call = "red" | "black" | "higher" | "lower" | "inside" | "outside" | "♠" | "♥" | "♦" | "♣";

const CALL_LABELS: Record<Call, string> = {
    red: "Red", black: "Black", higher: "Higher", lower: "Lower", inside: "Inside", outside: "Outside",
    "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs",
};

const STEPS = [
    { name: "Red or Black", prompt: "Red or black?" },
    { name: "Higher or Lower", prompt: "Higher or lower than the first card?" },
    { name: "Inside or Outside", prompt: "Inside or outside the first two cards?" },
    { name: "Suit", prompt: "Last one. Which suit?" },
] as const;

/** Was the call right for this card, given the cards already on the table? */
function callIsRight(call: Call, card: Card, earlier: Card[]): boolean {
    const v = rankValue(card);
    switch (call) {
        case "red": return isRed(card);
        case "black": return !isRed(card);
        // the same rank is neither higher nor lower
        case "higher": return v > rankValue(earlier[0]);
        case "lower": return v < rankValue(earlier[0]);
        case "inside":
        case "outside": {
            const lo = Math.min(rankValue(earlier[0]), rankValue(earlier[1]));
            const hi = Math.max(rankValue(earlier[0]), rankValue(earlier[1]));
            // matching either card is neither inside nor outside
            return call === "inside" ? v > lo && v < hi : v < lo || v > hi;
        }
        default: return card.suit === call;
    }
}

// ─── Rules popup ──────────────────────────────────────────────────────────────

const RULES_SECTIONS: [string, string[]][] = [
    ["How to win", [
        `• It costs nothing to play. Get all four calls right and you win ${formatMoney(PRIZE)}.`,
        "• Four cards are dealt one at a time from a freshly shuffled 52-card deck.",
        "• One wrong call ends the run. Press Play Again to start over with a new deck.",
    ]],
    ["The four calls", [
        "• Card 1: red or black.",
        "• Card 2: higher or lower than card 1. Aces are high. The same rank loses.",
        "• Card 3: inside or outside cards 1 and 2. Matching either of them loses.",
        "• Card 4: the suit.",
    ]],
    ["Keys", [
        "• R red, B black. H higher, L lower. I inside, O outside.",
        "• S spades, H hearts, D diamonds, C clubs. Space plays again.",
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
                        className="relative z-[101] max-h-[88dvh] w-full max-w-[720px] overflow-hidden rounded-[4px] border border-[#a07a4f] bg-[#24160a] text-text"
                    >
                        <div className="flex items-center justify-between border-b border-[#a07a4f] px-4 py-3 sm:px-5 sm:py-4">
                            <div>
                                <div className="text-[13px] font-extrabold text-amber-200/90">Help</div>
                                <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">Card Ladder Rules</div>
                            </div>
                            <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#a07a4f] bg-[#3a2412] text-xl font-bold text-text transition-colors hover:bg-[#4a2f18]" aria-label="Close rules modal">&times;</button>
                        </div>
                        <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                            <div className="space-y-4 text-base leading-6 text-text">
                                {RULES_SECTIONS.map(([title, items]) => (
                                    <div key={title} className="rounded-[4px] border border-[#a07a4f] bg-[#3a2412] p-4">
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

// ─── The game ─────────────────────────────────────────────────────────────────

type Stage = "playing" | "won" | "lost";

export default function CardLadder({ bankroll, setBankroll }: Props) {
    const [showRules, setShowRules] = useState(false);
    const [deck, setDeck] = useState<Card[]>(() => createShoe(1));
    const [deckNo, setDeckNo] = useState(1);
    const [cards, setCards] = useState<Card[]>([]);
    const [calls, setCalls] = useState<Call[]>([]);
    const [stage, setStage] = useState<Stage>("playing");
    const [message, setMessage] = useState<string>(STEPS[0].prompt);
    const [tries, setTries] = useState(0);
    const [wins, setWins] = useState(0);
    // one call at a time: a second press is ignored while the card is turning over
    const busy = useRef(false);

    const step = cards.length;

    const makeCall = (call: Call) => {
        if (stage !== "playing" || busy.current || step >= STEPS.length) return;
        busy.current = true;
        const [drawn, ...rest] = deck;
        const card = { ...drawn, faceUp: true };
        const right = callIsRight(call, card, cards);
        const nextCards = [...cards, card];
        setDeck(rest);
        setCards(nextCards);
        setCalls((prev) => [...prev, call]);

        if (!right) {
            setStage("lost");
            setTries((n) => n + 1);
            setMessage(`${cardName(card)}. Not ${CALL_LABELS[call].toLowerCase()}. Run over.`);
        } else if (nextCards.length === STEPS.length) {
            setStage("won");
            setTries((n) => n + 1);
            setWins((n) => n + 1);
            setBankroll((b) => b + PRIZE);
            setMessage(`${cardName(card)}. All four right. You win ${formatMoney(PRIZE)}!`);
        } else {
            setMessage(`${cardName(card)}. Right. ${STEPS[nextCards.length].prompt}`);
        }
        window.setTimeout(() => { busy.current = false; }, FLIP_MS);
    };

    const playAgain = () => {
        if (busy.current) return;
        // every run comes from the other deck, freshly shuffled
        setDeck(createShoe(1));
        setDeckNo((n) => n + 1);
        setCards([]);
        setCalls([]);
        setStage("playing");
        setMessage(STEPS[0].prompt);
    };

    const messageColor = stage === "won" ? "text-emerald-300" : stage === "lost" ? "text-red-300" : "text-amber-50";

    // the buttons for the call being made now
    const callButtons: { call: Call; label: string; hotkey: string; cls: string }[] =
        step === 0 ? [
            { call: "red", label: "Red", hotkey: "R", cls: BTN_RED },
            { call: "black", label: "Black", hotkey: "B", cls: BTN_NEUTRAL },
        ] : step === 1 ? [
            { call: "lower", label: "Lower", hotkey: "L", cls: BTN_NEUTRAL },
            { call: "higher", label: "Higher", hotkey: "H", cls: BTN_GOLD },
        ] : step === 2 ? [
            { call: "inside", label: "Inside", hotkey: "I", cls: BTN_GOLD },
            { call: "outside", label: "Outside", hotkey: "O", cls: BTN_NEUTRAL },
        ] : [
            { call: "♠", label: "♠ Spades", hotkey: "S", cls: BTN_NEUTRAL },
            { call: "♥", label: "♥ Hearts", hotkey: "H", cls: BTN_RED },
            { call: "♦", label: "♦ Diamonds", hotkey: "D", cls: BTN_RED },
            { call: "♣", label: "♣ Clubs", hotkey: "C", cls: BTN_NEUTRAL },
        ];

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            <TableShell deckNo={deckNo}
                feltColor={FELT_COLOR}
                gameName="Card Ladder"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <div className="flex min-h-[80px] flex-wrap items-center justify-center gap-2 border-t border-line bg-ink px-4 py-3" data-testid="ladder-bar">
                        <AnimatePresence mode="popLayout" initial={false}>
                            {stage === "playing" && callButtons.map((b) => (
                                <SlideBtn key={`${deckNo}-${step}-${b.call}`}>
                                    <button data-hotkey={b.hotkey} data-call={b.call} className={b.cls} onClick={() => makeCall(b.call)}>{b.label}</button>
                                </SlideBtn>
                            ))}
                            {stage !== "playing" && (
                                <SlideBtn key={`again-${deckNo}`}>
                                    <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={playAgain}>Play Again</button>
                                </SlideBtn>
                            )}
                        </AnimatePresence>
                    </div>
                }
            >
                {/* Title */}
                <div className="mb-3 flex shrink-0 select-none flex-col items-center gap-0.5">
                    <div className="flex items-center gap-2">
                        <h1 className="text-center text-2xl font-bold text-gold-soft">Card Ladder</h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>Free to play</span>
                        <span className="text-white/75">·</span>
                        <span>Four right calls in a row</span>
                        <span className="text-white/75">·</span>
                        <span>Wins {formatMoney(PRIZE)}</span>
                    </div>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center gap-5 py-2">

                    {/* Prize and tally. Fixed in place: nothing here changes size. */}
                    <div className="flex items-stretch rounded-[4px] border border-line bg-ink py-2" data-testid="ladder-tally">
                        {[
                            { label: "Prize", value: formatMoney(PRIZE), color: "text-gold" },
                            { label: "Tries", value: String(tries), color: "text-white" },
                            { label: "Wins", value: String(wins), color: wins > 0 ? "text-emerald-300" : "text-white" },
                        ].map(({ label, value, color }, i) => (
                            <div key={label} className={`w-[96px] text-center sm:w-[112px] ${i > 0 ? "border-l border-line" : ""}`}>
                                <div className="text-sm text-text-muted">{label}</div>
                                <div className={`text-base font-bold ${color}`} data-tally={label}>{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* The message keeps one line of height whatever it says */}
                    <p className={`flex min-h-[44px] max-w-md items-center px-2 text-center text-sm font-semibold ${messageColor}`} data-testid="message">{message}</p>

                    {/* Four places, always on the felt. A card is dealt into its place when its call is made. */}
                    <div className="flex items-start justify-center gap-2 sm:gap-4">
                        {STEPS.map((s, i) => {
                            const card = cards[i];
                            const call = calls[i];
                            const isCurrent = stage === "playing" && i === step;
                            const right = card && call ? callIsRight(call, card, cards.slice(0, i)) : null;
                            return (
                                <div key={s.name} className="flex w-[78px] flex-col items-center gap-1.5 sm:w-[112px]" data-step={i} data-current={isCurrent ? "true" : undefined}>
                                    <div className={`text-[13px] font-bold ${isCurrent ? "text-gold-soft" : "text-white/75"}`}>Card {i + 1}</div>
                                    <div className={`${CARD_CLS} relative`}>
                                        <div className={`absolute inset-0 rounded-[10px] border-2 border-dashed sm:rounded-[12px] ${isCurrent ? "border-gold bg-black/25" : "border-white/25 bg-black/15"}`} />
                                        {card && (
                                            <motion.div
                                                key={`${deckNo}-${card.id}`}
                                                className="absolute inset-0"
                                                variants={CARD_VARIANTS}
                                                initial="initial"
                                                animate="animate"
                                                transition={CARD_TRANSITION(0)}
                                            >
                                                <PlayingCard card={card} className={CARD_CLS} />
                                            </motion.div>
                                        )}
                                    </div>
                                    <div className="text-center text-[12px] font-semibold leading-tight text-white/85">{s.name}</div>
                                    {/* the call that was made, and how it went: its line is always there */}
                                    <div className={`min-h-[18px] text-center text-[12px] font-bold leading-tight ${right === null ? "" : right ? "text-emerald-300" : "text-red-300"}`} data-result={right === null ? undefined : right ? "right" : "wrong"}>
                                        {call ? `${CALL_LABELS[call]} ${right ? "✓" : "✗"}` : ""}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </TableShell>
        </>
    );
}
