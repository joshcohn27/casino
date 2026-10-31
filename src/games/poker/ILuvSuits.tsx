import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import HandRow from "../../shared/components/HandRow";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import type { Card as SharedCard } from "../../shared/lib/cards";
import { addChipToStack, type ChipDenomination, buildChipStackFromAmount, formatMoney, BTN_GOLD, BTN_NEUTRAL } from "../../shared/lib/money";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { defaultBet } from "../../shared/state/settings";
import { resultLineClass } from "../../shared/lib/resultTone";
import {
    type Card, type Settlement,
    HAND_SIZE, MIN_ANTE, SUITS, FLUSH_RUSH_PAYTABLE, SUPER_FLUSH_PAYTABLE, longestStraightFlush,
    createDeck, shuffle, evaluateFlushHand, describeFlushHand, maxRaiseMultiple, suggestAction, settle,
} from "./iLuvSuitsLogic";
import { useBetRecorder } from "../../shared/state/sessionContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "betting" | "dealt" | "showdown" | "done";
type ZoneId = "ante" | "flushRush" | "superFlush";
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };

// ─── Constants ────────────────────────────────────────────────────────────────

const FELT_COLOR = "#6b1d3a";
const CARD_FLIP_MS = 120;
const SORT_DELAY_MS = 520;

const RULES_SECTIONS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ["How the Hand Works", [
        "• You and the dealer each get 7 cards from a standard 52-card deck.",
        "• Your hand is the longest flush you can make: the most cards in one suit.",
        "• More cards in the flush wins. If both flushes are the same length, the ranks are compared from the highest card down.",
    ]],
    ["Your Decision", [
        "• After looking at your cards, fold and lose the Ante, or make a Play bet.",
        "• With a flush of 4 cards or fewer, the Play bet is 1x the Ante.",
        "• With a 5-card flush you may bet up to 2x the Ante.",
        "• With a 6 or 7-card flush you may bet up to 3x the Ante.",
    ]],
    ["Strategy", [
        "• Fold any hand with a flush of two cards or fewer.",
        "• With a three-card flush, play 10-8-6 or better and fold anything weaker.",
        "• With four cards or more, always play, and bet the most you are allowed.",
        "• The Suggest indicator follows this strategy once your cards are turned over.",
    ]],
    ["Dealer and Payouts", [
        "• The dealer needs at least a 3-card flush, nine-high, to qualify.",
        "• Dealer does not qualify: the Ante pays 1 to 1 and the Play bet is returned.",
        "• Dealer qualifies and you win: Ante and Play both pay 1 to 1.",
        "• Dealer qualifies and wins: Ante and Play lose. An exact tie pushes both.",
    ]],
    ["Flush Rush", [
        "• Optional side bet on the length of your flush, paid whatever the dealer has.",
        "• 4 cards pays 2 to 1, 5 cards 5 to 1, 6 cards 75 to 1, 7 cards 300 to 1.",
    ]],
    ["Super Flush Rush", [
        "• Optional side bet on your longest straight flush: consecutive ranks in one suit. The ace plays high or low.",
        "• 3 cards pays 7 to 1, 4 cards 60 to 1, 5 cards 100 to 1, 6 cards 1,000 to 1, 7 cards 8,000 to 1.",
    ]],
];

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toRowCard(card: Card): Pick<SharedCard, "id" | "rank" | "suit"> {
    return { id: card.id, suit: card.suit, rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"] };
}

function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

// Display order once a hand is face up: by power. The flush comes first in rank order,
// then the other cards by rank.
function sortedIds(cards: Card[]): string[] {
    if (cards.length === 0) return [];
    const best = evaluateFlushHand(cards);
    const inFlush = (c: Card) => (c.suit === best.suit ? 0 : 1);
    return [...cards].sort((a, b) => inFlush(a) - inFlush(b) || b.value - a.value || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)).map((c) => c.id);
}

// ─── Rules modal ──────────────────────────────────────────────────────────────

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
                        className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[4px] border border-[#945c71] bg-[#290b16] text-text"
                    >
                        <div className="flex items-center justify-between border-b border-[#945c71] px-4 py-3 sm:px-5 sm:py-4">
                            <div>
                                <div className="text-[13px] font-extrabold text-amber-200/90">Help</div>
                                <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">I Luv Suits Rules</div>
                            </div>
                            <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#945c71] bg-[#421224] text-xl font-bold text-text transition-colors hover:bg-[#56172e] active:bg-[#290b16]">×</button>
                        </div>
                        <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                            <div className="space-y-4 text-base leading-6 text-text">
                                {RULES_SECTIONS.map(([title, items]) => (
                                    <div key={title} className="rounded-[4px] border border-[#945c71] bg-[#421224] p-4">
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

// ─── Payout column ────────────────────────────────────────────────────────────

function PayoutColumn({ title, entries, unit, highlight }: {
    title: string; entries: Record<number, number>; unit: string; highlight?: number | null;
}) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[13px] font-extrabold text-amber-200">{title}</div>
            {Object.entries(entries).sort((a, b) => Number(b[0]) - Number(a[0])).map(([count, mult]) => {
                const hit = highlight === Number(count);
                return (
                    <div key={count} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={hit ? "font-extrabold text-amber-100" : "text-white/75"}>{count}-card {unit}</span>
                        <span className={`shrink-0 font-bold text-gold`}>{mult.toLocaleString()} to 1</span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ILuvSuits({ bankroll, setBankroll }: Props) {
    // for the yearly stats: each bet on its own, as the hand settles
    const recordBet = useBetRecorder();
    const reportBets = (b: Parameters<typeof settle>[0], r: ReturnType<typeof settle>) => {
        recordBet("Ante", b.ante, r.anteReturn);
        recordBet("Play", b.play, r.playReturn);
        recordBet("Flush Rush", b.flushRush, r.flushRushReturn, r.flushRushMultiplier > 0 ? `Pays ${r.flushRushMultiplier} to 1` : undefined);
        recordBet("Super Flush Rush", b.superFlush, r.superFlushReturn, r.superFlushMultiplier > 0 ? `${r.superFlushCount}-card straight flush` : undefined);
    };
    // two decks take turns, gold backs then purple: every hand is dealt from the other deck
    const [deckNo, setDeckNo] = useState(0);
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Set your bets and press Deal.");
    const [showRules, setShowRules] = useState(false);

    // Chips on the table while betting
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [selectedZone, setSelectedZone] = useState<ZoneId>("ante");
    const [anteChips, setAnteChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("iluvsuits", "ante")));
    const [flushRushChips, setFlushRushChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("iluvsuits", "flushRush")));
    const [superFlushChips, setSuperFlushChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("iluvsuits", "superFlush")));

    // Bets locked in for the hand in play
    const [anteBet, setAnteBet] = useState(0);
    const [flushRushBet, setFlushRushBet] = useState(0);
    const [superFlushBet, setSuperFlushBet] = useState(0);
    const [playBet, setPlayBet] = useState(0);

    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [dealerCards, setDealerCards] = useState<Card[]>([]);
    const [result, setResult] = useState<Settlement | null>(null);

    // Reveal state: the player turns their own cards, then the dealer's turn one at a time
    const [peeled, setPeeled] = useState<string[]>([]);
    const [playerSorted, setPlayerSorted] = useState(false);
    const [dealerShown, setDealerShown] = useState(0);
    const [dealerSorted, setDealerSorted] = useState(false);

    // One action at a time, so a double-click cannot act twice
    const busy = useRef(false);

    const sum = (chips: ChipDenomination[]) => chips.reduce((s, d) => s + Number(d), 0);
    const pendingAnte = sum(anteChips);
    const pendingFlushRush = sum(flushRushChips);
    const pendingSuperFlush = sum(superFlushChips);
    const pendingTotal = pendingAnte + pendingFlushRush + pendingSuperFlush;
    const isBetting = stage === "betting";

    // ── Chip handlers ─────────────────────────────────────────────────────────

    const setZoneChips = (zone: ZoneId, update: (prev: ChipDenomination[]) => ChipDenomination[]) => {
        if (zone === "ante") setAnteChips(update);
        else if (zone === "flushRush") setFlushRushChips(update);
        else setSuperFlushChips(update);
    };

    // Tray chip goes onto the highlighted spot
    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (isBetting) setZoneChips(selectedZone, (prev) => addChipToStack(prev, chip));
    };

    // Clicking the chips on a spot takes the last chip back
    const removeLastChip = (zone: ZoneId) => {
        if (isBetting) setZoneChips(zone, (prev) => prev.slice(0, -1));
    };

    // ── Round flow ────────────────────────────────────────────────────────────

    const resetRound = () => {
        setPlayerCards([]); setDealerCards([]); setResult(null);
        setAnteBet(0); setFlushRushBet(0); setSuperFlushBet(0); setPlayBet(0);
        setPeeled([]); setPlayerSorted(false); setDealerShown(0); setDealerSorted(false);
    };

    const handleDeal = () => {
        if (busy.current) return;
        if (pendingAnte < MIN_ANTE) { setMessage(`The Ante must be at least $${MIN_ANTE}.`); return; }
        // the Ante must be matched by a Play bet later, so that money has to be there too
        if (bankroll < pendingTotal + pendingAnte) { setMessage("Not enough bankroll to cover the Ante and a Play bet."); return; }
        setDeckNo((n) => n + 1);
        const deck = shuffle(createDeck());
        resetRound();
        setAnteBet(pendingAnte); setFlushRushBet(pendingFlushRush); setSuperFlushBet(pendingSuperFlush);
        setBankroll((b) => b - pendingTotal);
        setPlayerCards(deck.slice(0, HAND_SIZE));
        setDealerCards(deck.slice(HAND_SIZE, HAND_SIZE * 2));
        setStage("dealt");
        setMessage("Tap your cards to turn them over, or press Reveal Cards.");
    };

    const peelCard = (cardId: string) => {
        setPeeled((prev) => (prev.includes(cardId) ? prev : [...prev, cardId]));
    };
    const revealAll = () => {
        playerCards.filter((c) => !peeled.includes(c.id)).forEach((c, i) => {
            window.setTimeout(() => peelCard(c.id), i * 110);
        });
    };

    // Once every card is face up, give the last flip a moment and then sort the hand
    const allPeeled = playerCards.length === HAND_SIZE && peeled.length === HAND_SIZE;
    useEffect(() => {
        if (stage !== "dealt" || !allPeeled || playerSorted) return;
        const id = window.setTimeout(() => setPlayerSorted(true), SORT_DELAY_MS);
        return () => window.clearTimeout(id);
    }, [stage, allPeeled, playerSorted]);

    const playerReady = stage !== "betting" && (playerSorted || stage === "showdown" || stage === "done");
    const playerHand = playerCards.length === HAND_SIZE ? evaluateFlushHand(playerCards) : null;
    const dealerHand = dealerCards.length === HAND_SIZE ? evaluateFlushHand(dealerCards) : null;
    const maxMultiple = playerHand ? maxRaiseMultiple(playerHand.count) : 1;

    useEffect(() => {
        if (stage !== "dealt" || !playerSorted || !playerHand) return;
        setMessage(maxMultiple > 1
            ? `${describeFlushHand(playerHand)}. Play up to ${maxMultiple}x, or fold.`
            : `${describeFlushHand(playerHand)}. Play 1x, or fold.`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, playerSorted]);

    // Dealer turns their cards one at a time, sorts them, then the hand settles
    const finishHand = async (play: number, folded: boolean) => {
        if (busy.current) return;
        busy.current = true;
        try {
            if (play > 0) { setBankroll((b) => b - play); setPlayBet(play); }
            setStage("showdown");
            setMessage(folded ? "You fold. Dealer reveals." : "Dealer reveals.");
            for (let n = 1; n <= HAND_SIZE; n++) {
                await wait(CARD_FLIP_MS);
                setDealerShown(n);
            }
            await wait(SORT_DELAY_MS);
            setDealerSorted(true);
            await wait(500);
            const betsAtSettle = {
                player: playerCards, dealer: dealerCards,
                ante: anteBet, play, flushRush: flushRushBet, superFlush: superFlushBet, folded,
            };
        const settled = settle(betsAtSettle);
        reportBets(betsAtSettle, settled);
            setBankroll((b) => b + settled.totalReturn);
            setResult(settled);
            setStage("done");
            setMessage(settled.lines[0]);
        } finally {
            busy.current = false;
        }
    };

    const handlePlay = (multiple: number) => {
        if (stage !== "dealt" || !playerSorted || multiple > maxMultiple) return;
        const play = anteBet * multiple;
        if (bankroll < play) { setMessage("Not enough bankroll for that Play bet."); return; }
        void finishHand(play, false);
    };
    const handleFold = () => {
        if (stage !== "dealt" || !playerSorted) return;
        void finishHand(0, true);
    };

    const handleChangeBet = () => {
        if (busy.current) return;
        resetRound();
        setStage("betting");
        setMessage("Adjust your bets and press Deal.");
    };
    const handleClear = () => {
        if (busy.current) return;
        resetRound();
        setAnteChips([]); setFlushRushChips([]); setSuperFlushChips([]);
        setSelectedZone("ante");
        setStage("betting");
        setMessage("Set your bets and press Deal.");
    };

    // Reset: back to the bets saved in Settings
    const handleReset = () => {
        if (busy.current) return;
        setAnteChips(buildChipStackFromAmount(defaultBet("iluvsuits", "ante")));
        setFlushRushChips(buildChipStackFromAmount(defaultBet("iluvsuits", "flushRush")));
        setSuperFlushChips(buildChipStackFromAmount(defaultBet("iluvsuits", "superFlush")));
        setSelectedZone("ante");
    };

    // ── Derived render values ─────────────────────────────────────────────────

    const canDeal = pendingAnte >= MIN_ANTE && bankroll >= pendingTotal + pendingAnte;
    const displayBet = isBetting ? pendingTotal : anteBet + flushRushBet + superFlushBet + playBet;
    const done = stage === "done" && result !== null;
    const dealerRevealed = dealerShown >= HAND_SIZE;

    const playerOrder = playerSorted || stage === "showdown" || stage === "done" ? sortedIds(playerCards) : undefined;
    const dealerOrder = dealerSorted ? sortedIds(dealerCards) : undefined;
    const playerEmphasis = playerReady && playerHand ? new Set(playerHand.cards.map((c) => c.id)) : undefined;
    const dealerEmphasis = dealerSorted && dealerHand ? new Set(dealerHand.cards.map((c) => c.id)) : undefined;

    // What each spot shows once the hand has settled: losing chips leave, winning stacks grow
    const spotView = (chips: ChipDenomination[], bet: number, returned: number) => {
        if (isBetting) return { chips, total: sum(chips), win: false };
        if (!done) return { chips: buildChipStackFromAmount(bet), total: bet, win: false };
        return { chips: buildChipStackFromAmount(returned), total: returned, win: returned > bet };
    };
    const anteView = spotView(anteChips, anteBet, result?.anteReturn ?? 0);
    const flushRushView = spotView(flushRushChips, flushRushBet, result?.flushRushReturn ?? 0);
    const superFlushView = spotView(superFlushChips, superFlushBet, result?.superFlushReturn ?? 0);
    const playView = spotView([], playBet, result?.playReturn ?? 0);

    const flushRushHit = playerReady && playerHand && FLUSH_RUSH_PAYTABLE[playerHand.count] ? playerHand.count : null;
    // both side bets light their row as soon as the player's cards are up, bet or not, like the hands themselves
    const superFlushCount = playerReady && playerCards.length === HAND_SIZE ? longestStraightFlush(playerCards) : 0;
    const superFlushHit = SUPER_FLUSH_PAYTABLE[superFlushCount] ? superFlushCount : null;
    // Strategy suggestion, once the player's cards are all showing
    const suggestion = stage === "dealt" && playerSorted && playerHand ? suggestAction(playerHand) : null;

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell deckNo={deckNo}
                feltColor={FELT_COLOR}
                gameName="I Luv Suits"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
                        <ChipTray selectedChip={selectedChip} onSelect={handleChipSelect} disabled={!isBetting} />
                        <div className="flex min-h-[46px] items-center justify-center gap-2">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {isBetting && (
                                    <SlideBtn key="clear">
                                        <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={handleClear} disabled={pendingTotal <= 0}>Clear</button>
                                    </SlideBtn>
                                )}
                                {isBetting && (
                                    <SlideBtn key="reset">
                                        <button data-hotkey="E" className={BTN_NEUTRAL} onClick={handleReset}>Reset</button>
                                    </SlideBtn>
                                )}
                                {isBetting && (
                                    <SlideBtn key="deal">
                                        <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal}>Deal</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && !playerSorted && (
                                    <SlideBtn key="reveal">
                                        <button data-hotkey="R" className={BTN_GOLD} onClick={revealAll} disabled={allPeeled}>Reveal Cards</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && playerSorted && (
                                    <SlideBtn key="fold">
                                        <button data-hotkey="F" className={BTN_NEUTRAL} onClick={handleFold}>Fold</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && playerSorted && [1, 2, 3].filter((m) => m <= maxMultiple).map((m) => (
                                    <SlideBtn key={`play-${m}`}>
                                        <button
                                            data-hotkey={maxMultiple === 1 ? "C" : String(m)}
                                            data-hotkey-alt={maxMultiple === 1 ? "1" : m === maxMultiple ? "C" : undefined}
                                            className={m === maxMultiple ? BTN_GOLD : BTN_NEUTRAL}
                                            onClick={() => handlePlay(m)}
                                            disabled={bankroll < anteBet * m}
                                        >
                                            Play {m}x
                                        </button>
                                    </SlideBtn>
                                ))}
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
                                        <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal}>Rebet &amp; Deal</button>
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
                        <h1
                            className="text-center text-2xl font-bold text-gold-soft"
                        >
                            I Luv Suits
                        </h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>Longest flush wins</span>
                        <span className="text-white/75">·</span>
                        <span>Dealer qualifies with 3-card flush, 9 high</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>Play 1x</span>
                        <span className="text-white/75">·</span>
                        <span>Up to 2x with 5-card flush</span>
                        <span className="text-white/75">·</span>
                        <span>Up to 3x with 6 or 7</span>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* Left column - betting. On narrow screens it sits under the cards and stays there: the two never swap, so dealing moves nothing */}
                    <div className={`order-2 flex w-full flex-col items-center justify-center gap-4 px-4 py-2 lg:order-1 lg:w-64 lg:shrink-0 lg:px-0`}>
                        <BetBar
                            compact
                            pendingBet={displayBet}
                            returned={result?.totalReturn ?? 0}
                            net={result?.net ?? 0}
                            showResult={done}
                        />

                        <div className="flex items-end gap-6">
                            <BetSpot
                                testId="flushRush"
                                label="Flush Rush" sublabel="optional"
                                chips={flushRushView.chips} totalBet={flushRushView.total}
                                dim={94}
                                canBet={isBetting}
                                isSelected={selectedZone === "flushRush"}
                                isWinner={flushRushView.win}
                                onSelect={() => setSelectedZone("flushRush")}
                                onRemove={() => removeLastChip("flushRush")}
                            />
                            <BetSpot
                                testId="superFlush"
                                label="Super Flush" sublabel="optional"
                                chips={superFlushView.chips} totalBet={superFlushView.total}
                                dim={94}
                                canBet={isBetting}
                                isSelected={selectedZone === "superFlush"}
                                isWinner={superFlushView.win}
                                onSelect={() => setSelectedZone("superFlush")}
                                onRemove={() => removeLastChip("superFlush")}
                            />
                        </div>

                        <div className="flex items-end gap-4">
                            <BetSpot
                                testId="ante"
                                label="Ante" sublabel={`min $${MIN_ANTE}`}
                                chips={anteView.chips} totalBet={anteView.total}
                                dim={110}
                                canBet={isBetting}
                                isSelected={selectedZone === "ante"}
                                isWinner={anteView.win}
                                onSelect={() => setSelectedZone("ante")}
                                onRemove={() => removeLastChip("ante")}
                            />
                            <BetSpot
                                testId="play"
                                label="Play" sublabel={`up to ${maxMultiple}x`}
                                chips={playView.chips} totalBet={playView.total}
                                dim={110}
                                isLocked
                                canBet={false}
                                isSelected={false}
                                isWinner={playView.win}
                            />
                        </div>

                        {/* Result lines: their space is always reserved, so the circles above do not move */}
                        <div className="flex min-h-[76px] w-full flex-col items-center">
                        {done && result && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className="flex flex-col items-center gap-1 text-center"
                                data-testid="result-lines"
                            >
                                {result.lines.map((line, i) => (
                                    <p key={i} className={`text-[11px] leading-snug ${i === 0 ? "font-bold " : ""}${resultLineClass(line)}`}>{line}</p>
                                ))}
                            </motion.div>
                        )}
                        </div>
                    </div>

                    {/* Center column - cards */}
                    <div className={`order-1 flex w-full flex-col items-center justify-center gap-3 px-2 py-2 lg:order-2 lg:flex-1`}>

                        {/* Dealer */}
                        <div className="flex w-full flex-col items-center gap-2">
                            <span className="text-[13px] font-bold text-white/75">Dealer</span>
                            {dealerCards.length > 0 ? (
                                <HandRow
                                    testId="dealer-cards"
                                    cards={dealerCards.map(toRowCard)}
                                    order={dealerOrder}
                                    isFaceUp={(id) => dealerCards.findIndex((c) => c.id === id) < dealerShown}
                                    emphasis={dealerEmphasis}
                                />
                            ) : (
                                <div className="h-[70px] sm:h-[82px]" />
                            )}
                            <span className="min-h-[18px] text-[11px] font-semibold leading-[18px] text-amber-100" data-testid="dealer-hand">
                                {dealerSorted && dealerHand
                                    ? `${describeFlushHand(dealerHand)}${done && result && !result.dealerQualified ? " (does not qualify)" : ""}`
                                    : ""}
                            </span>
                        </div>

                        <div className="h-px w-full max-w-md shrink-0 bg-white/8" />

                        {/* Player */}
                        <div className="flex w-full flex-col items-center gap-2">
                            {playerCards.length > 0 ? (
                                <HandRow
                                    testId="player-cards"
                                    cards={playerCards.map(toRowCard)}
                                    order={playerOrder}
                                    isFaceUp={(id) => peeled.includes(id) || stage === "showdown" || stage === "done"}
                                    emphasis={playerEmphasis}
                                    onCardClick={peelCard}
                                    canClick={(id) => stage === "dealt" && !peeled.includes(id)}
                                    cardLabel={(id) => (peeled.includes(id) ? "Card" : "Turn card over")}
                                />
                            ) : (
                                <div className="h-[70px] sm:h-[82px]" />
                            )}
                            <span className="min-h-[18px] text-[11px] font-semibold leading-[18px] text-amber-100" data-testid="player-hand">
                                {playerReady && playerHand ? describeFlushHand(playerHand) : ""}
                            </span>
                            <span className="text-[13px] font-bold text-white/75">Player</span>
                            <div className="flex min-h-[32px] items-center">
                                <AnimatePresence>
                                    {suggestion && (
                                        <motion.div
                                            key="suggestion"
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            data-testid="suggestion"
                                            className={`flex items-center gap-1.5 rounded-[2px] border px-3 py-1 text-sm font-bold ${
                                                suggestion !== "fold"
                                                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                                                    : "border-red-400/30 bg-red-500/10 text-red-300"
                                            }`}
                                        >
                                            <span className="text-[13px] opacity-70">Suggest</span>
                                            <span>{suggestion === "fold" ? "Fold" : `Play ${suggestion}x`}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <p className="text-center text-sm font-semibold text-amber-50" data-testid="message">{message}</p>
                        {dealerRevealed && !done && <span className="sr-only">Settling</span>}
                    </div>

                    {/* Right column - payout tables, desktop only */}
                    <div className="order-3 hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:justify-center">
                        <PayoutColumn title="Flush Rush" entries={FLUSH_RUSH_PAYTABLE} unit="flush" highlight={flushRushHit} />
                        <div className="mt-4">
                            <PayoutColumn title="Super Flush Rush" entries={SUPER_FLUSH_PAYTABLE} unit="straight flush" highlight={superFlushHit} />
                        </div>
                        <div className="mt-4 text-center text-[10px] leading-relaxed text-white/75">
                            Ante and Play pay 1 to 1 · {formatMoney(MIN_ANTE)} minimum
                        </div>
                    </div>

                </div>
            </TableShell>
        </>
    );
}
