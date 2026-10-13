import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import HandRow from "../../shared/components/HandRow";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import type { Card as SharedCard } from "../../shared/lib/cards";
import { addChipToStack, type ChipDenomination, buildChipStackFromAmount, formatMoney, BTN_GOLD, BTN_NEUTRAL } from "../../shared/lib/money";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { defaultBet, defaultToggle } from "../../shared/state/settings";
import { sortByPower } from "../../shared/lib/handSort";
import { readMeter, writeMeter, ambientHands, simulateOtherPlayers, makeRng, type OtherPlayerHit } from "../../shared/state/progressiveMeter";
import {
    type Card, type Settlement,
    HAND_SIZE, MIN_ANTE, PLAY_MULTIPLE,
    BLIND_PAYTABLE, TRIPS_NATURAL_PAYTABLE, TRIPS_WILD_PAYTABLE, BAD_BEAT_PAYTABLE,
    PROGRESSIVE_BET, PROGRESSIVE_CONTRIBUTION, PROGRESSIVE_PAYTABLE, progressiveRow,
    TRIPS_TABLE_ROWS, createDeck, shuffle, evaluateHand, isWild, tripsMultiplier, suggestAction, settle,
} from "./djWildLogic";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "betting" | "dealt" | "showdown" | "done";
type ZoneId = "ante" | "trips" | "badBeat";
type Props = { bankroll: number; setBankroll: React.Dispatch<React.SetStateAction<number>> };

// ─── Constants ────────────────────────────────────────────────────────────────

const FELT_COLOR = "#3b1a6b";
// How often the jackpot meter creeps up on its own while the table is open
const METER_TICK_MS = 2500;
// How long the table holds on a progressive win before the next hand can be dealt
const PROGRESSIVE_WIN_HOLD_MS = 3500;
// How long the "another player hit it" notice stays up
const OTHER_HIT_NOTICE_MS = 9000;
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
        "• Pays by the hand that was beaten: Three of a Kind 9 to 1, Straight 100, Flush 300, Full House 400, Four of a Kind or better 500.",
        "• Ties lose. The odds for the lesser of the two hands (dealer or player) will be paid.",
    ]],
    ["Progressive", [
        "• Optional $5 bet. Tap the red light to switch it on.",
        "• Pays on your own hand, with a Straight or better. Wild cards count, as they do in the main game.",
        "• Five Wilds wins the whole meter. A natural Royal Flush wins 10% of it.",
        "• Wild Royal Flush pays $1,000, Five of a Kind $750, Straight Flush $250, Four of a Kind $50, Full House $45, Flush $40, Straight $25.",
        "• A deuce that plays as an ordinary deuce counts as natural.",
        "• The meter keeps climbing as other players bet, and they can hit it too. It resets if it reaches $999,999.",
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
    const mode = category === "Flush" ? "flush"
        : category === "Straight" || category === "Straight Flush" || category === "Royal Flush" ? "straight"
        : "groups";
    return sortByPower(cards.map((c) => ({ id: c.id, value: c.value, suit: c.suit, wild: isWild(c) ? "full" as const : undefined })), mode);
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
                        className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[4px] border border-[#725a94] bg-[#160a29] text-text"
                    >
                        <div className="flex items-center justify-between border-b border-[#725a94] px-4 py-3 sm:px-5 sm:py-4">
                            <div>
                                <div className="text-[13px] font-extrabold text-amber-200/90">Help</div>
                                <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">DJ Wild Rules</div>
                            </div>
                            <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#725a94] bg-[#251042] text-xl font-bold text-text transition-colors hover:bg-[#2f1556] active:bg-[#160a29]">×</button>
                        </div>
                        <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                            <div className="space-y-4 text-base leading-6 text-text">
                                {RULES_SECTIONS.map(([title, items]) => (
                                    <div key={title} className="rounded-[4px] border border-[#725a94] bg-[#251042] p-4">
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

function PayoutColumn({ title, entries, highlight, unit = " to 1", extra, note, headers }: {
    title: string; entries: Partial<Record<string, number>>; highlight?: string | null;
    unit?: string;
    /** Small print under the table */
    note?: string;
    /** Column headings, as on the felt */
    headers?: readonly [string, string];
    /** Rows shown above the numeric ones, e.g. shares of the jackpot */
    extra?: ReadonlyArray<readonly [string, string]>;
}) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[13px] font-extrabold text-amber-200">{title}</div>
            {headers && (
                <div className="flex items-center justify-between gap-2 px-1.5 text-[13px] font-bold text-white/75">
                    <span>{headers[0]}</span>
                    <span>{headers[1]}</span>
                </div>
            )}
            {(extra ?? []).map(([hand, text]) => {
                const hit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={`min-w-0 ${hit ? "text-amber-100 [text-shadow:0_0_0.6px_currentColor,0_0_0.6px_currentColor]" : "text-white/75"}`}>{hand}</span>
                        <span className={`shrink-0 font-bold text-gold`}>{text}</span>
                    </div>
                );
            })}
            {Object.entries(entries).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([hand, mult]) => {
                const hit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={`min-w-0 ${hit ? "text-amber-100 [text-shadow:0_0_0.6px_currentColor,0_0_0.6px_currentColor]" : "text-white/75"}`}>{hand}</span>
                        <span className={`shrink-0 font-bold text-gold`}>{(mult ?? 0).toLocaleString()}{unit}</span>
                    </div>
                );
            })}
            {note && <p className="mt-1 px-1.5 text-[10px] leading-snug text-white/75" data-testid="payout-note">{note}</p>}
        </div>
    );
}

// ─── Trips table: one table, natural and wild payouts side by side ────────────

function TripsTable({ hitHand, hitNatural }: { hitHand: string | null; hitNatural: boolean }) {
    // laid out like the table felt: every cell reads "x to 1", and a hand that can only be
    // made with wild cards shows its one payout in both columns
    // on the row that hits, the column that pays is tinted green and the other one grey
    const TINT = "relative isolate before:absolute before:inset-y-0 before:-inset-x-0.5 before:-z-10 before:rounded-[2px] before:content-['']";
    const cell = (value: number | undefined, state: "pays" | "misses" | "plain") => (
        <span
            data-trips-cell={state}
            className={`w-[62px] shrink-0 whitespace-nowrap text-right font-bold tabular-nums ${
                state === "pays" ? `${TINT} text-emerald-300 before:bg-emerald-400/25`
                : state === "misses" ? `${TINT} text-white/60 before:bg-white/10`
                : "text-gold"
            }`}
        >
            {(value ?? 0).toLocaleString()} to 1
        </span>
    );
    return (
        <div className="flex flex-col gap-1 pt-2" data-testid="trips-table">
            <div className="mb-1 text-center text-[13px] font-extrabold text-amber-200">Trips Pays</div>
            <div className="flex items-center justify-between gap-1 px-1.5 text-[13px] font-bold text-white/75">
                <span className="flex-1">Hand</span>
                <span className="w-[62px] shrink-0 text-right">Natural</span>
                <span className="w-[62px] shrink-0 text-right">Wild</span>
            </div>
            {TRIPS_TABLE_ROWS.map((hand) => {
                const hit = hitHand === hand;
                const wild = TRIPS_WILD_PAYTABLE[hand];
                const natural = TRIPS_NATURAL_PAYTABLE[hand] ?? wild;
                return (
                    <div key={hand} data-trips-row={hand} className={`flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-[11px] transition ${hit ? "bg-amber-300/12" : ""}`}>
                        <span className={`min-w-0 flex-1 ${hit ? "text-amber-100 [text-shadow:0_0_0.6px_currentColor,0_0_0.6px_currentColor]" : "text-white/75"}`}>{hand}</span>
                        {cell(natural, !hit ? "plain" : hitNatural ? "pays" : "misses")}
                        {cell(wild, !hit ? "plain" : hitNatural ? "misses" : "pays")}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DJWild({ bankroll, setBankroll }: Props) {
    // two decks take turns, gold backs then purple: every hand is dealt from the other deck
    const [deckNo, setDeckNo] = useState(0);
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Set your bets and press Deal.");
    const [showRules, setShowRules] = useState(false);

    // Chips on the table while betting
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [selectedZone, setSelectedZone] = useState<ZoneId>("ante");
    const [anteChips, setAnteChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("djwild", "ante")));
    const [tripsChips, setTripsChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("djwild", "trips")));
    const [badBeatChips, setBadBeatChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("djwild", "badBeat")));
    // Progressive: a fixed $5 bet switched on with the red light, and a jackpot meter that is remembered
    const [progressiveOn, setProgressiveOn] = useState(() => defaultToggle("djwild", "progressive"));
    const [meter, setMeter] = useState<number>(readMeter);
    const meterRef = useRef(meter);
    useEffect(() => { meterRef.current = meter; writeMeter(meter); }, [meter]);
    // Other players: every few seconds a few simulated hands feed the meter, and each one has
    // the real chance of hitting the jackpot or a natural Royal.
    const [otherHit, setOtherHit] = useState<OtherPlayerHit | null>(null);
    useEffect(() => {
        const rng = makeRng(Date.now());
        const id = window.setInterval(() => {
            const next = simulateOtherPlayers(meterRef.current, ambientHands(), rng);
            setMeter(next.meter);
            if (next.hit) setOtherHit(next.hit);
        }, METER_TICK_MS);
        return () => window.clearInterval(id);
    }, []);
    useEffect(() => {
        if (!otherHit) return;
        const id = window.setTimeout(() => setOtherHit(null), OTHER_HIT_NOTICE_MS);
        return () => window.clearTimeout(id);
    }, [otherHit]);
    // true while the table is holding on a progressive win so it cannot be dealt past
    const [progressiveHold, setProgressiveHold] = useState(false);

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
        if (selectedZone === "ante") setAnteChips((prev) => addChipToStack(prev, chip));
        else if (selectedZone === "trips") setTripsChips((prev) => addChipToStack(prev, chip));
        else setBadBeatChips((prev) => addChipToStack(prev, chip));
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
        setDeckNo((n) => n + 1);
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
            // a progressive win holds the table for a moment so the amount can be read
            if (settled.progressiveReturn > 0) {
                setProgressiveHold(true);
                await wait(PROGRESSIVE_WIN_HOLD_MS);
                setProgressiveHold(false);
            }
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
    const progressiveHit = playerReady && progressiveLit && playerHand ? progressiveRow(playerHand)?.label ?? null : null;
    const badBeatHit = done && result && result.badBeatMultiplier > 0
        ? (result.compare > 0 ? result.dealerHand.category : result.playerHand.category)
        : null;
    const playView = spotView([], playBet, result?.playReturn ?? 0);

    const blindHit = done && result && result.blindMultiplier > 0 ? result.playerHand.category : null;
    const tripsPays = playerReady && playerHand && tripsMultiplier(playerHand) > 0;
    const tripsHit = tripsPays ? playerHand.category : null;
    const tripsHitNatural = !!(tripsPays && playerHand.natural);
    // Strategy suggestion, from the cards the player has actually turned over
    const suggestion = stage === "dealt" ? suggestAction(playerCards.filter((c) => peeled.includes(c.id))) : null;
    const netColor = !result ? "" : result.net > 0 ? "text-emerald-300" : result.net < 0 ? "text-red-300" : "text-amber-100";

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell deckNo={deckNo}
                feltColor={FELT_COLOR}
                gameName="DJ Wild"
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
                                    <SlideBtn key="deal">
                                        <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal}>Deal</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && !allPeeled && (
                                    <SlideBtn key="reveal">
                                        <button data-hotkey="R" className={BTN_NEUTRAL} onClick={revealAll}>Reveal Cards</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && (
                                    <SlideBtn key="fold">
                                        <button data-hotkey="F" className={BTN_NEUTRAL} onClick={handleFold}>Fold</button>
                                    </SlideBtn>
                                )}
                                {stage === "dealt" && (
                                    <SlideBtn key="play">
                                        <button data-hotkey="C" className={BTN_GOLD} onClick={handlePlay} disabled={bankroll < anteBet * PLAY_MULTIPLE}>Play {PLAY_MULTIPLE}x</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="clear-done">
                                        <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={handleClear} disabled={progressiveHold}>Clear</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="change-bet">
                                        <button data-hotkey="B" className={BTN_NEUTRAL} onClick={handleChangeBet} disabled={progressiveHold}>Change Bet</button>
                                    </SlideBtn>
                                )}
                                {stage === "done" && (
                                    <SlideBtn key="rebet-deal">
                                        <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={handleDeal} disabled={!canDeal || progressiveHold}>Rebet &amp; Deal</button>
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
                            DJ Wild
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
                        <span>Deuces and the Joker are wild</span>
                        <span className="text-white/75">·</span>
                        <span>Play 2x or fold</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm font-semibold text-white/75">
                        <span>Blind pays on straight or better</span>
                        <span className="text-white/75">·</span>
                        <span>Dealer always qualifies</span>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* Left column - betting. On narrow screens it sits under the cards and stays there: the two never swap, so dealing moves nothing */}
                    <div className={`order-2 flex w-full flex-col items-center justify-center gap-2 px-4 py-2 lg:order-1 lg:w-64 lg:shrink-0 lg:gap-1 lg:px-0 lg:py-0`}>
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
                                    progressiveLit ? "border-white" : "border-white/45 hover:border-white"
                                }`}
                                style={{ background: progressiveLit ? "#ef2a2a" : "#3a0f0f", outline: progressiveWon ? "3px solid #fbbf24" : undefined, outlineOffset: 2 }}
                            >
                                <span className={`text-[10px] font-extrabold ${progressiveLit ? "text-white" : "text-white/75"}`}>${PROGRESSIVE_BET}</span>
                            </button>
                            <div className="flex flex-col">
                                <span className="text-[13px] font-extrabold text-white/75">Progressive</span>
                                <span
                                    className="rounded-[4px] border border-red-500/25 bg-black/60 px-2 py-0.5 text-sm font-bold tabular-nums text-red-400"
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
                                dim={94}
                                canBet={isBetting}
                                isSelected={selectedZone === "trips"}
                                isWinner={tripsView.win}
                                onSelect={() => setSelectedZone("trips")}
                                onRemove={() => removeLastChip("trips")}
                            />
                            <BetSpot
                                testId="badBeat"
                                label="Two-Way Bad Beat"
                                chips={badBeatView.chips} totalBet={badBeatView.total}
                                dim={94}
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
                            <span className="pb-10 text-base font-bold text-white/90">=</span>
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

                    </div>

                    {/* Center column - cards */}
                    <div className={`order-1 flex w-full flex-col items-center justify-center gap-3 px-2 py-2 lg:order-2 lg:flex-1`}>

                        {/* Dealer */}
                        <div className="flex w-full flex-col items-center gap-2">
                            <span className="text-[13px] font-bold text-white/75">Dealer</span>
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
                            <span className="min-h-[16px] text-[11px] font-semibold text-amber-100" data-testid="dealer-hand">
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
                            <span className="min-h-[16px] text-[11px] font-semibold text-amber-100" data-testid="player-hand">
                                {playerReady && playerHand ? playerHand.label : ""}
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
                                                suggestion === "play"
                                                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                                                    : "border-red-400/30 bg-red-500/10 text-red-300"
                                            }`}
                                        >
                                            <span className="text-[13px] opacity-70">Suggest</span>
                                            <span>{suggestion === "play" ? "Play" : "Fold"}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <p className="text-center text-sm font-semibold text-amber-50" data-testid="message">{message}</p>
                        {/* Reserved rows: the result lines, then any progressive notice. Their space is always
                            there, so nothing on the felt moves when they appear. */}
                        <div className="flex min-h-[72px] w-full flex-col items-center">
                        {done && result && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className="flex flex-col items-center gap-1 text-center"
                                data-testid="result-lines"
                            >
                                {/* a line that only repeats the message above is left out */}
                                {result.lines.map((line, i) => line === message ? null : (
                                    <p key={i} className={`text-[11px] leading-snug ${i === 0 ? `font-bold ${netColor}` : "text-white/90"}`}>{line}</p>
                                ))}
                            </motion.div>
                        )}
                        </div>
                        <div className="flex min-h-[88px] w-full max-w-sm flex-col items-center justify-start">
                        <AnimatePresence>
                            {progressiveWon && result && (
                                <motion.div
                                    key="progressive-win"
                                    initial={{ opacity: 0, scale: 0.85 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 18 }}
                                    data-testid="progressive-win"
                                    className="w-full rounded-[4px] border border-amber-300/60 bg-amber-400/15 px-3 py-2 text-center"
                                >
                                    <div className="text-[13px] font-extrabold text-amber-200">Progressive Win</div>
                                    <div className="text-xl font-extrabold text-amber-100">{formatMoney(result.progressiveReturn)}</div>
                                    <div className="text-[11px] font-semibold text-amber-100">{progressiveRow(result.playerHand)?.label}</div>
                                </motion.div>
                            )}
                            {otherHit && !progressiveWon && (
                                <motion.div
                                    key="other-hit"
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    data-testid="other-hit"
                                    className="w-full rounded-[4px] border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-center text-[11px] font-semibold text-red-200"
                                >
                                    {otherHit.kind === "jackpot"
                                        ? `Another player hit Five Wilds and took the ${formatMoney(otherHit.amount)} jackpot. The meter has reset.`
                                        : `Another player hit a natural Royal Flush for ${formatMoney(otherHit.amount)}.`}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        </div>
                    </div>

                    {/* Right column - payout tables, desktop only */}
                    {/* a pay table never scrolls sideways: long names wrap inside their column */}
                    <div className="order-3 hidden lg:flex lg:w-[24rem] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
                        {/* centred when it fits, scrolls when it does not (short screens, Large text) */}
                        <div className="my-auto grid grid-cols-[1fr_1.55fr] gap-3 py-2">
                            <div>
                                <PayoutColumn title="Blind Pays" entries={BLIND_PAYTABLE} highlight={blindHit} />
                                <div className="mt-3">
                                    <PayoutColumn
                                        title="Progressive"
                                        extra={PROGRESSIVE_PAYTABLE.map((r) => [r.label, r.share !== undefined ? `${r.share * 100}%` : `$${((r.pays ?? 0) * PROGRESSIVE_BET).toLocaleString()}`] as const)}
                                        entries={{}}
                                        highlight={progressiveHit}
                                    />
                                </div>
                            </div>
                            <div>
                                <TripsTable hitHand={tripsHit} hitNatural={tripsHitNatural} />
                                <div className="mt-3">
                                    <PayoutColumn
                                        title="Two-Way Bad Beat"
                                        headers={["Hand Beaten", "Payout"]}
                                        entries={BAD_BEAT_PAYTABLE}
                                        highlight={badBeatHit}
                                        note="Ties Lose. The odds for the lesser of the two hands (dealer or player) will be paid."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </TableShell>
        </>
    );
}
