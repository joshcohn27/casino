import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import HandRow from "./shared/HandRow";
import BetSpot, { BetBar } from "./shared/BetSpot";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination, buildChipStackFromAmount, formatMoney, BTN_GOLD, BTN_NEUTRAL } from "./shared/money";
import { SlideBtn } from "./shared/SlideBtn";
import { sortByPower } from "./shared/handSort";
import { readMeter, writeMeter, ambientTick } from "./shared/progressiveMeter";
import {
    type Card, type Settlement,
    HAND_SIZE, MIN_ANTE, PLAY_MULTIPLE,
    BLIND_PAYTABLE, TRIPS_NATURAL_PAYTABLE, TRIPS_WILD_PAYTABLE, BAD_BEAT_PAYTABLE,
    PROGRESSIVE_BET, PROGRESSIVE_CONTRIBUTION, PROGRESSIVE_FIXED_PAYTABLE,
    createDeck, shuffle, evaluateHand, isWild, tripsMultiplier, suggestAction, settle,
} from "./djWildLogic";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "betting" | "dealt" | "showdown" | "done";
type ZoneId = "ante" | "trips" | "badBeat";
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };

// ─── Constants ────────────────────────────────────────────────────────────────

const FELT_COLOR = "#3b1a6b";
// How often the jackpot meter creeps up on its own while the table is open
const METER_TICK_MS = 2500;
const CARD_FLIP_MS = 160;
const SORT_DELAY_MS = 520;
// Cards the player left face down are turned slowly, after the dealer has shown
const BLIND_FLIP_MS = 520;

const RULES_SECTIONS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ["How the Hand Works", [
        "• Played with 53 cards: a standard deck plus one Joker.",
        "• All four deuces and the Joker are wild.",
        "• You bet an Ante, and the Blind always matches it. Trips is an optional side bet.",
        "• You and the dealer each get 5 cards.",
    ]],
    ["Hand Rankings", [
        "• Highest to lowest: Five Wilds, Royal Flush, Five of a Kind, Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, Pair, High Card.",
        "• A deuce can also play as an ordinary deuce, for example in A-2-3-4-5.",
    ]],
    ["Your Decision", [
        "• After looking at your cards, fold and lose the Ante and Blind, or make a Play bet of 2x the Ante.",
        "• You do not have to look first: you can play blind, or after turning over only some of your cards. The dealer then shows first and your face-down cards are turned last.",
        "• The dealer always qualifies. There is no minimum dealer hand.",
    ]],
    ["Strategy", [
        "• Play with a pair of fours or better. Otherwise fold.",
        "• One exception: fold two fours if your other cards include a three.",
        "• Any deuce or the Joker means you always play.",
        "• The Suggest indicator follows this strategy using only the cards you have turned over.",
    ]],
    ["Payouts", [
        "• You win: Ante and Play pay 1 to 1, and the Blind pays from its table on a Straight or better. Otherwise the Blind pushes.",
        "• Dealer wins: Ante, Blind and Play lose.",
        "• Tie: Ante, Blind and Play push.",
    ]],
    ["Two-Way Bad Beat", [
        "• Optional side bet. It wins when a Three of a Kind or better loses, whether that hand is yours or the dealer's.",
        "• Pays by the hand that was beaten: Three of a Kind 15 to 1, Straight 50, Flush 100, Full House 200, Four of a Kind 300, Straight Flush or better 500.",
        "• A tie is not a beat.",
    ]],
    ["Five Card Progressive", [
        "• Optional $1 bet. Tap the red light to switch it on.",
        "• Pays on your own hand, with Three of a Kind or better, whether or not wild cards made it.",
        "• Five Wilds or a Royal Flush wins the whole meter. Five of a Kind or a Straight Flush wins 10% of it.",
        "• The meter keeps climbing on its own, and from play at every other table.",
        "• Four of a Kind 300 for 1, Full House 50, Flush 40, Straight 30, Three of a Kind 9.",
    ]],
    ["Trips", [
        "• Pays on your own hand with Three of a Kind or better, win or lose, even if you fold.",
        "• A natural hand, made without using any wild card as wild, pays much more than a wild hand.",
    ]],
];

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toRowCard(card: Card): Pick<SharedCard, "id" | "rank" | "suit"> {
    if (card.rank === "JOKER") return { id: card.id, suit: "JOKER", rank: "JOKER" };
    return { id: card.id, suit: card.suit as SharedCard["suit"], rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"] };
}

function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

// Display order once a hand is face up: by power. The cards that make the hand come first
// (with the wild cards that complete it), then the rest by rank.
function sortedIds(cards: Card[]): string[] {
    if (cards.length !== HAND_SIZE) return cards.map((c) => c.id);
    const category = evaluateHand(cards).category;
    const mode = category === "Flush" || category === "Straight Flush" || category === "Royal Flush" ? "flush"
        : category === "Straight" ? "straight"
        : "groups";
    return sortByPower(cards.map((c) => ({ id: c.id, value: c.value, suit: c.suit, wild: isWild(c) ? "full" as const : undefined })), mode);
}

// ─── Rules modal ──────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" onClick={onClose} aria-label="Close rules modal" />
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[1.5rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(7,20,14,0.98),_rgba(3,10,7,0.98))] text-white shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
                    >
                        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
                            <div>
                                <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90 sm:text-[11px]">Help</div>
                                <div className="mt-1 text-lg font-extrabold text-amber-50 sm:text-2xl">DJ Wild Rules</div>
                            </div>
                            <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl font-bold text-white/85 transition hover:bg-white/10">×</button>
                        </div>
                        <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                            <div className="space-y-4 text-sm leading-6 text-emerald-50/90">
                                {RULES_SECTIONS.map(([title, items]) => (
                                    <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">{title}</div>
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

function PayoutColumn({ title, entries, highlight, unit = ":1", extra }: {
    title: string; entries: Partial<Record<string, number>>; highlight?: string | null;
    unit?: string;
    /** Rows shown above the numeric ones, e.g. shares of the jackpot */
    extra?: ReadonlyArray<readonly [string, string]>;
}) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">{title}</div>
            {(extra ?? []).map(([hand, text]) => {
                const hit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={hit ? "font-extrabold text-amber-100" : "text-white/45"}>{hand}</span>
                        <span className={`shrink-0 font-bold ${hit ? "text-amber-300" : "text-white/35"}`}>{text}</span>
                    </div>
                );
            })}
            {Object.entries(entries).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([hand, mult]) => {
                const hit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={hit ? "font-extrabold text-amber-100" : "text-white/45"}>{hand}</span>
                        <span className={`shrink-0 font-bold ${hit ? "text-amber-300" : "text-white/35"}`}>{(mult ?? 0).toLocaleString()}{unit}</span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DJWild({ bankroll, setBankroll }: Props) {
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Set your bets and press Deal.");
    const [showRules, setShowRules] = useState(false);

    // Chips on the table while betting
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [selectedZone, setSelectedZone] = useState<ZoneId>("ante");
    const [anteChips, setAnteChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(25));
    const [tripsChips, setTripsChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(5));
    const [badBeatChips, setBadBeatChips] = useState<ChipDenomination[]>([]);
    // Progressive: a fixed $1 bet switched on with the red light, and a jackpot meter that is remembered
    const [progressiveOn, setProgressiveOn] = useState(false);
    const [meter, setMeter] = useState<number>(readMeter);
    const meterRef = useRef(meter);
    useEffect(() => { meterRef.current = meter; writeMeter(meter); }, [meter]);
    // the meter creeps up on its own, as if other players were feeding it
    useEffect(() => {
        const id = window.setInterval(() => setMeter((m) => Math.round((m + ambientTick()) * 100) / 100), METER_TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    // Bets locked in for the hand in play
    const [anteBet, setAnteBet] = useState(0);
    const [tripsBet, setTripsBet] = useState(0);
    const [badBeatBet, setBadBeatBet] = useState(0);
    const [progressiveBet, setProgressiveBet] = useState(0);
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
    const pendingTrips = sum(tripsChips);
    const pendingBadBeat = sum(badBeatChips);
    const pendingProgressive = progressiveOn ? PROGRESSIVE_BET : 0;
    // the Blind always matches the Ante
    const pendingTotal = pendingAnte * 2 + pendingTrips + pendingBadBeat + pendingProgressive;
    const isBetting = stage === "betting";

    // ── Chip handlers ─────────────────────────────────────────────────────────

    // Tray chip goes onto the highlighted spot
    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (!isBetting) return;
        if (selectedZone === "ante") setAnteChips((prev) => [...prev, chip]);
        else if (selectedZone === "trips") setTripsChips((prev) => [...prev, chip]);
        else setBadBeatChips((prev) => [...prev, chip]);
    };

    // Clicking the chips on a spot takes the last chip back
    const removeLastChip = (zone: ZoneId) => {
        if (!isBetting) return;
        if (zone === "ante") setAnteChips((prev) => prev.slice(0, -1));
        else if (zone === "trips") setTripsChips((prev) => prev.slice(0, -1));
        else setBadBeatChips((prev) => prev.slice(0, -1));
    };

    // ── Round flow ────────────────────────────────────────────────────────────

    const resetRound = () => {
        setPlayerCards([]); setDealerCards([]); setResult(null);
        setAnteBet(0); setTripsBet(0); setBadBeatBet(0); setProgressiveBet(0); setPlayBet(0);
        setPeeled([]); setPlayerSorted(false); setDealerShown(0); setDealerSorted(false);
    };

    const handleDeal = () => {
        if (busy.current) return;
        if (pendingAnte < MIN_ANTE) { setMessage(`The Ante must be at least $${MIN_ANTE}.`); return; }
        // the Play bet is 2x the Ante, so that money has to be there too
        if (bankroll < pendingTotal + pendingAnte * PLAY_MULTIPLE) { setMessage("Not enough bankroll to cover the bets and a Play bet."); return; }
        const deck = shuffle(createDeck());
        resetRound();
        setAnteBet(pendingAnte); setTripsBet(pendingTrips); setBadBeatBet(pendingBadBeat); setProgressiveBet(pendingProgressive);
        // every progressive bet feeds the jackpot
        if (progressiveOn) setMeter((m) => Math.round((m + PROGRESSIVE_CONTRIBUTION) * 100) / 100);
        setBankroll((b) => b - pendingTotal);
        setPlayerCards(deck.slice(0, HAND_SIZE));
        setDealerCards(deck.slice(HAND_SIZE, HAND_SIZE * 2));
        setStage("dealt");
        setMessage("Turn your cards over, or play blind.");
    };

    const peelCard = (cardId: string) => {
        setPeeled((prev) => (prev.includes(cardId) ? prev : [...prev, cardId]));
    };
    const revealAll = () => {
        playerCards.filter((c) => !peeled.includes(c.id)).forEach((c, i) => {
            window.setTimeout(() => peelCard(c.id), i * 130);
        });
    };

    // Once every card is face up, give the last flip a moment and then sort the hand
    const allPeeled = playerCards.length === HAND_SIZE && peeled.length === HAND_SIZE;
    useEffect(() => {
        if (stage !== "dealt" || !allPeeled || playerSorted) return;
        const id = window.setTimeout(() => setPlayerSorted(true), SORT_DELAY_MS);
        return () => window.clearTimeout(id);
    }, [stage, allPeeled, playerSorted]);

    const playerReady = stage !== "betting" && playerSorted;
    const playerHand = playerCards.length === HAND_SIZE ? evaluateHand(playerCards) : null;
    const dealerHand = dealerCards.length === HAND_SIZE ? evaluateHand(dealerCards) : null;

    useEffect(() => {
        if (stage !== "dealt" || !playerSorted || !playerHand || busy.current) return;
        setMessage(`${playerHand.label}. Play ${PLAY_MULTIPLE}x, or fold.`);
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
            // Playing blind: the dealer shows first, then the player's face-down cards turn one at a time
            const hidden = playerCards.filter((c) => !peeled.includes(c.id));
            if (hidden.length > 0) {
                setMessage("Your cards.");
                for (const c of hidden) {
                    await wait(BLIND_FLIP_MS);
                    peelCard(c.id);
                }
                await wait(SORT_DELAY_MS);
            }
            setPlayerSorted(true);
            await wait(hidden.length > 0 ? 500 : 0);
            const settled = settle({
                player: playerCards, dealer: dealerCards, ante: anteBet, play, trips: tripsBet, folded,
                badBeat: badBeatBet, progressive: progressiveBet > 0, meter: meterRef.current,
            });
            if (progressiveBet > 0) setMeter(settled.meterAfter);
            setBankroll((b) => b + settled.totalReturn);
            setResult(settled);
            setStage("done");
            setMessage(settled.lines[0]);
        } finally {
            busy.current = false;
        }
    };

    const handlePlay = () => {
        if (stage !== "dealt") return;
        const play = anteBet * PLAY_MULTIPLE;
        if (bankroll < play) { setMessage("Not enough bankroll for the Play bet."); return; }
        void finishHand(play, false);
    };
    const handleFold = () => {
        if (stage !== "dealt") return;
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
        setAnteChips([]); setTripsChips([]); setBadBeatChips([]); setProgressiveOn(false);
        setSelectedZone("ante");
        setStage("betting");
        setMessage("Set your bets and press Deal.");
    };

    // ── Derived render values ─────────────────────────────────────────────────

    const canDeal = pendingAnte >= MIN_ANTE && bankroll >= pendingTotal + pendingAnte * PLAY_MULTIPLE;
    const displayBet = isBetting ? pendingTotal : anteBet * 2 + tripsBet + badBeatBet + progressiveBet + playBet;
    const done = stage === "done" && result !== null;

    const playerOrder = playerSorted ? sortedIds(playerCards) : undefined;
    const dealerOrder = dealerSorted ? sortedIds(dealerCards) : undefined;

    // What each spot shows once the hand has settled: losing chips leave, winning stacks grow
    const spotView = (chips: ChipDenomination[], bet: number, returned: number) => {
        if (isBetting) return { chips, total: sum(chips), win: false };
        if (!done) return { chips: buildChipStackFromAmount(bet), total: bet, win: false };
        return { chips: buildChipStackFromAmount(returned), total: returned, win: returned > bet };
    };
    const anteView = spotView(anteChips, anteBet, result?.anteReturn ?? 0);
    const blindView = spotView(anteChips, anteBet, result?.blindReturn ?? 0);
    const tripsView = spotView(tripsChips, tripsBet, result?.tripsReturn ?? 0);
    const badBeatView = spotView(badBeatChips, badBeatBet, result?.badBeatReturn ?? 0);
    const progressiveLit = isBetting ? progressiveOn : progressiveBet > 0;
    const progressiveWon = done && (result?.progressiveReturn ?? 0) > 0;
    const progressiveHit = playerReady && progressiveLit && playerHand ? playerHand.category : null;
    const badBeatHit = done && result && result.badBeatMultiplier > 0
        ? (result.compare > 0 ? result.dealerHand.category : result.playerHand.category)
        : null;
    const playView = spotView([], playBet, result?.playReturn ?? 0);

    const blindHit = done && result && result.blindMultiplier > 0 ? result.playerHand.category : null;
    const tripsPays = playerReady && playerHand && tripsMultiplier(playerHand) > 0;
    const tripsNaturalHit = tripsPays && playerHand.natural ? playerHand.category : null;
    const tripsWildHit = tripsPays && !playerHand.natural ? playerHand.category : null;
    // Strategy suggestion, from the cards the player has actually turned over
    const suggestion = stage === "dealt" ? suggestAction(playerCards.filter((c) => peeled.includes(c.id))) : null;
    const netColor = !result ? "" : result.net > 0 ? "text-emerald-300" : result.net < 0 ? "text-red-300" : "text-amber-100";

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell
                feltColor={FELT_COLOR}
                gameName="DJ Wild"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <div className="flex flex-col gap-2 border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
                        <ChipTray selectedChip={selectedChip} onSelect={handleChipSelect} disabled={!isBetting} />
                        <div className="flex min-h-[46px] items-center justify-center gap-2">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {isBetting && (
                                    <SlideBtn key="clear">
                                        <button className={BTN_NEUTRAL} onClick={handleClear} disabled={pendingTotal <= 0}>Clear</button>
                                    </SlideBtn>
                                )}
                                {isBetting && (
                                    <SlideBtn key="deal">
                                        <button className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal}>Deal</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && !allPeeled && (
                                    <SlideBtn key="reveal">
                                        <button className={BTN_NEUTRAL} onClick={revealAll}>Reveal Cards</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && (
                                    <SlideBtn key="fold">
                                        <button className={BTN_NEUTRAL} onClick={handleFold}>Fold</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && (
                                    <SlideBtn key="play">
                                        <button className={BTN_GOLD} onClick={handlePlay} disabled={bankroll < anteBet * PLAY_MULTIPLE}>Play {PLAY_MULTIPLE}x</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="clear-done">
                                        <button className={BTN_NEUTRAL} onClick={handleClear}>Clear</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="change-bet">
                                        <button className={BTN_NEUTRAL} onClick={handleChangeBet}>Change Bet</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="rebet-deal">
                                        <button className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal}>Rebet &amp; Deal</button>
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
                            className="text-center text-xl font-extrabold uppercase tracking-[0.18em] text-amber-100/90"
                            style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                        >
                            DJ Wild
                        </h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/25 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[10px] font-bold tracking-[0.15em] text-white/35">
                        <span>DEUCES AND THE JOKER ARE WILD</span>
                        <span className="text-white/20">·</span>
                        <span>PLAY 2x OR FOLD</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[10px] font-bold tracking-[0.12em] text-white/25">
                        <span>BLIND PAYS ON STRAIGHT OR BETTER</span>
                        <span className="text-white/15">·</span>
                        <span>DEALER ALWAYS QUALIFIES</span>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* Left column - betting. On mobile it sits above the cards while betting and below them during the hand */}
                    <div className={`${isBetting ? "order-1" : "order-2"} flex w-full flex-col items-center justify-center gap-4 px-4 py-2 lg:order-1 lg:w-64 lg:shrink-0 lg:px-0`}>
                        <BetBar
                            compact
                            pendingBet={displayBet}
                            returned={result?.totalReturn ?? 0}
                            net={result?.net ?? 0}
                            showResult={done}
                        />

                        {/* Progressive: jackpot meter and the red light that switches the $1 bet on */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setProgressiveOn((on) => !on)}
                                disabled={!isBetting}
                                aria-pressed={progressiveLit}
                                aria-label={`Progressive bet, ${formatMoney(PROGRESSIVE_BET)}`}
                                data-testid="progressive-light"
                                data-lit={progressiveLit ? "true" : "false"}
                                className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition ${isBetting ? "cursor-pointer" : "cursor-default"} ${
                                    progressiveLit ? "border-red-300/70" : "border-white/20 hover:border-white/40"
                                }`}
                                style={{
                                    background: progressiveLit
                                        ? "radial-gradient(circle at 50% 45%, #ffb4b4 0%, #ff2a2a 38%, #b00000 72%, #5a0000 100%)"
                                        : "radial-gradient(circle at 50% 45%, #4a1414 0%, #2a0a0a 60%, #140505 100%)",
                                    boxShadow: progressiveLit
                                        ? `0 0 18px 4px rgba(255,40,40,0.55), inset 0 0 8px rgba(255,255,255,0.35)${progressiveWon ? ", 0 0 30px 10px rgba(251,191,36,0.55)" : ""}`
                                        : "inset 0 2px 6px rgba(0,0,0,0.7)",
                                }}
                            >
                                <span className={`text-[10px] font-extrabold ${progressiveLit ? "text-white" : "text-white/30"}`}>$1</span>
                            </button>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/45">Progressive</span>
                                <span
                                    className="rounded-md border border-red-500/25 bg-black/60 px-2 py-0.5 font-mono text-sm font-bold tabular-nums text-red-400"
                                    style={{ textShadow: "0 0 8px rgba(255,60,60,0.6)" }}
                                    data-testid="progressive-meter"
                                >
                                    {formatMoney(meter)}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-end gap-6">
                            <BetSpot
                                testId="trips"
                                label="Trips" sublabel="optional"
                                chips={tripsView.chips} totalBet={tripsView.total}
                                dim={82}
                                canBet={isBetting}
                                isSelected={selectedZone === "trips"}
                                isWinner={tripsView.win}
                                onSelect={() => setSelectedZone("trips")}
                                onRemove={() => removeLastChip("trips")}
                            />
                            <BetSpot
                                testId="badBeat"
                                label="Bad Beat" sublabel="optional"
                                chips={badBeatView.chips} totalBet={badBeatView.total}
                                dim={82}
                                canBet={isBetting}
                                isSelected={selectedZone === "badBeat"}
                                isWinner={badBeatView.win}
                                onSelect={() => setSelectedZone("badBeat")}
                                onRemove={() => removeLastChip("badBeat")}
                            />
                        </div>

                        <div className="flex items-end gap-3">
                            <BetSpot
                                testId="ante"
                                label="Ante" sublabel={`min $${MIN_ANTE}`}
                                chips={anteView.chips} totalBet={anteView.total}
                                dim={100}
                                canBet={isBetting}
                                isSelected={selectedZone === "ante"}
                                isWinner={anteView.win}
                                onSelect={() => setSelectedZone("ante")}
                                onRemove={() => removeLastChip("ante")}
                            />
                            <span className="pb-10 text-base font-bold text-white/50">=</span>
                            <BetSpot
                                testId="blind"
                                label="Blind" sublabel="matches ante"
                                chips={blindView.chips} totalBet={blindView.total}
                                dim={100}
                                isLocked
                                canBet={false}
                                isSelected={false}
                                isWinner={blindView.win}
                            />
                        </div>

                        <BetSpot
                            testId="play"
                            label="Play" sublabel={`${PLAY_MULTIPLE}x ante`}
                            chips={playView.chips} totalBet={playView.total}
                            dim={100}
                            isLocked
                            canBet={false}
                            isSelected={false}
                            isWinner={playView.win}
                        />

                        {/* Result lines */}
                        {done && result && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className="flex flex-col items-center gap-1 text-center"
                                data-testid="result-lines"
                            >
                                {result.lines.map((line, i) => (
                                    <p key={i} className={`text-[11px] leading-snug ${i === 0 ? `font-bold ${netColor}` : "text-white/55"}`}>{line}</p>
                                ))}
                            </motion.div>
                        )}
                    </div>

                    {/* Center column - cards */}
                    <div className={`${isBetting ? "order-2" : "order-1"} flex w-full flex-col items-center justify-center gap-3 px-2 py-2 lg:order-2 lg:flex-1`}>

                        {/* Dealer */}
                        <div className="flex w-full flex-col items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Dealer</span>
                            {dealerCards.length > 0 ? (
                                <HandRow
                                    testId="dealer-cards"
                                    size="md"
                                    cards={dealerCards.map(toRowCard)}
                                    order={dealerOrder}
                                    isFaceUp={(id) => dealerCards.findIndex((c) => c.id === id) < dealerShown}
                                />
                            ) : (
                                <div className="h-[80px] sm:h-[94px]" />
                            )}
                            <span className="min-h-[16px] text-[11px] font-semibold text-amber-100/65" data-testid="dealer-hand">
                                {dealerSorted && dealerHand ? dealerHand.label : ""}
                            </span>
                        </div>

                        <div className="h-px w-full max-w-md shrink-0 bg-white/8" />

                        {/* Player */}
                        <div className="flex w-full flex-col items-center gap-2">
                            {playerCards.length > 0 ? (
                                <HandRow
                                    testId="player-cards"
                                    size="md"
                                    cards={playerCards.map(toRowCard)}
                                    order={playerOrder}
                                    isFaceUp={(id) => peeled.includes(id) || stage === "done"}
                                    onCardClick={peelCard}
                                    canClick={(id) => stage === "dealt" && !peeled.includes(id)}
                                    cardLabel={(id) => (peeled.includes(id) ? "Card" : "Turn card over")}
                                />
                            ) : (
                                <div className="h-[80px] sm:h-[94px]" />
                            )}
                            <span className="min-h-[16px] text-[11px] font-semibold text-amber-100/65" data-testid="player-hand">
                                {playerReady && playerHand ? playerHand.label : ""}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Player</span>
                            <div className="flex min-h-[28px] items-center">
                                <AnimatePresence>
                                    {suggestion && (
                                        <motion.div
                                            key="suggestion"
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            data-testid="suggestion"
                                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-extrabold ${
                                                suggestion === "play"
                                                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                                                    : "border-red-400/30 bg-red-500/10 text-red-300"
                                            }`}
                                        >
                                            <span className="text-[10px] uppercase tracking-[0.15em] opacity-70">Suggest</span>
                                            <span>{suggestion === "play" ? "Play" : "Fold"}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <p className="text-center text-sm font-semibold text-amber-50/60" data-testid="message">{message}</p>
                    </div>

                    {/* Right column - payout tables, desktop only */}
                    <div className="order-3 hidden lg:flex lg:w-72 lg:shrink-0 lg:flex-col lg:justify-center">
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <PayoutColumn title="Blind Pays" entries={BLIND_PAYTABLE} highlight={blindHit} />
                                <div className="mt-3">
                                    <PayoutColumn title="Trips Natural" entries={TRIPS_NATURAL_PAYTABLE} highlight={tripsNaturalHit} />
                                </div>
                                <div className="mt-3">
                                    <PayoutColumn
                                        title="Progressive"
                                        unit=" for 1"
                                        extra={[["Five Wilds", "100%"], ["Royal Flush", "100%"], ["Five of a Kind", "10%"], ["Straight Flush", "10%"]]}
                                        entries={PROGRESSIVE_FIXED_PAYTABLE}
                                        highlight={progressiveHit}
                                    />
                                </div>
                            </div>
                            <div className="flex-1">
                                <PayoutColumn title="Trips Wild" entries={TRIPS_WILD_PAYTABLE} highlight={tripsWildHit} />
                                <div className="mt-3">
                                    <PayoutColumn title="Bad Beat" entries={BAD_BEAT_PAYTABLE} highlight={badBeatHit} />
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </TableShell>
        </>
    );
}
