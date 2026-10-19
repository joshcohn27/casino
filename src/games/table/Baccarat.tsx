import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import { type ChipDenomination, buildChipStackFromAmount, popLastChip, BTN_NEUTRAL, BTN_GOLD } from "../../shared/lib/money";
import { BetBar } from "../../shared/components/BetSpot";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { defaultBet, defaultToggle, loadSettings, saveSettings } from "../../shared/state/settings";
import { BettingLayout, BigRoad, CARD_SIZE, CARD_VARS, HELD_VARS, CardBox, CardPlace, PlayingCard, Sideways, SqueezeCard, toShared } from "./baccaratFelt";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

type BacCard = {
    rank: Rank;
    suit: Suit;
    value: number;
    baccaratValue: number;
    id: string;
};

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

type Stage = "betting" | "dealing" | "squeeze" | "done";
type Winner = "player" | "banker" | "tie";
type BetSpotId = "player" | "tie" | "banker" | "panda" | "dragon";

type HandHistoryEntry = {
    winner: Winner;
    natural: boolean;
    pandaHit: boolean;
    dragonHit: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const BET_STEP = 2.5;
const SHOE_DECKS = 8;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.82;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));
const SHUFFLE_DELAY_MS = 1800;
const CARD_REVEAL_DELAY_MS = 1100;
const SQUEEZE_DEAL_MS = 320;     // between face-down cards going out
const SQUEEZE_STEP_MS = 650;     // after the last card turns, before the next card or the result

const PLAYER_BET_STORAGE_KEY     = "casino-baccarat-player-bet";
const BANKER_BET_STORAGE_KEY     = "casino-baccarat-banker-bet";
const TIE_BET_STORAGE_KEY        = "casino-baccarat-tie-bet";
const PANDA_BET_STORAGE_KEY      = "casino-baccarat-panda-bet";
const DRAGON_BET_STORAGE_KEY     = "casino-baccarat-dragon-bet";
const BACCARAT_SELECTED_CHIP_KEY = "casino-baccarat-selected-chip";
const THIRD_RULES_KEY            = "casino-baccarat-third-rules";

// ─── Game-logic functions (preserved exactly) ─────────────────────────────────

function shuffle<T>(arr: T[]) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createShoe(): BacCard[] {
    const shoe: BacCard[] = [];
    for (let deckIndex = 0; deckIndex < SHOE_DECKS; deckIndex++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                let value = Number(rank);
                if (["J", "Q", "K"].includes(rank)) value = 10;
                if (rank === "A") value = 11;

                let baccaratValue = 0;
                if (rank === "A") baccaratValue = 1;
                else if (["2", "3", "4", "5", "6", "7", "8", "9"].includes(rank)) baccaratValue = Number(rank);
                else baccaratValue = 0;

                shoe.push({
                    rank,
                    suit,
                    value,
                    baccaratValue,
                    id: `${deckIndex}-${rank}${suit}-${Math.random().toString(36).slice(2, 9)}`,
                });
            }
        }
    }
    return shuffle(shoe);
}

function sanitizeBet(value: number) {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    return Math.floor(value / BET_STEP) * BET_STEP;
}

function baccaratTotal(cards: BacCard[]) {
    return cards.reduce((sum, card) => sum + card.baccaratValue, 0) % 10;
}

function isNatural(total: number) {
    return total === 8 || total === 9;
}

function getWinner(playerCards: BacCard[], bankerCards: BacCard[]): Winner {
    const playerTotal = baccaratTotal(playerCards);
    const bankerTotal = baccaratTotal(bankerCards);
    if (playerTotal > bankerTotal) return "player";
    if (bankerTotal > playerTotal) return "banker";
    return "tie";
}

function shouldPlayerDraw(playerTotal: number) {
    return playerTotal <= 5;
}

function shouldBankerDrawTwoCardTotal(bankerTotal: number) {
    return bankerTotal <= 5;
}

function shouldBankerDraw(bankerTotal: number, playerThirdCardValue?: number) {
    if (playerThirdCardValue === undefined) {
        return bankerTotal <= 5;
    }
    if (bankerTotal <= 2) return true;
    if (bankerTotal === 3) return playerThirdCardValue !== 8;
    if (bankerTotal === 4) return [2, 3, 4, 5, 6, 7].includes(playerThirdCardValue);
    if (bankerTotal === 5) return [4, 5, 6, 7].includes(playerThirdCardValue);
    if (bankerTotal === 6) return [6, 7].includes(playerThirdCardValue);
    return false;
}

function isNoCommissionBankerPush(bankerCards: BacCard[], winner: Winner) {
    return winner === "banker" && bankerCards.length === 3 && baccaratTotal(bankerCards) === 7;
}

function isPanda8(playerCards: BacCard[], bankerCards: BacCard[]) {
    return getWinner(playerCards, bankerCards) === "player" && playerCards.length === 3 && baccaratTotal(playerCards) === 8;
}

function isDragon7(playerCards: BacCard[], bankerCards: BacCard[]) {
    return getWinner(playerCards, bankerCards) === "banker" && bankerCards.length === 3 && baccaratTotal(bankerCards) === 7;
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldShuffle(shoe: BacCard[]) {
    return shoe.length <= RESHUFFLE_REMAINING_CARDS || shoe.length < 12;
}

// ─── Animation constants (matching Blackjack) ─────────────────────────────────

const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0,   scale: 1    },
};

const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});


// ─── Sub-components ───────────────────────────────────────────────────────────

function TableLabel({ onRules }: { onRules: () => void }) {
    return (
        <div className="flex select-none flex-col items-center gap-1">
            <div className="flex items-center gap-2">
                <h1
                    className="text-2xl font-bold text-gold-soft"
                >
                    Baccarat
                </h1>
                <button
                    onClick={onRules}
                    className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                    aria-label="Show rules"
                >
                    i
                </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                <span>Ez baccarat</span>
                <span className="text-white/75">·</span>
                <span>Banker pushes on 3-card 7</span>
                <span className="text-white/75">·</span>
                <span>Tie pays 8 to 1</span>
            </div>
        </div>
    );
}

function ResultBanner({ winner, pandaHit, dragonHit }: {
    winner: Winner | null; pandaHit: boolean; dragonHit: boolean;
}) {
    if (!winner) return null;

    const text  = dragonHit  ? "DRAGON 7 - BANKER WINS"
                : pandaHit   ? "PANDA 8 - PLAYER WINS"
                : winner === "player" ? "PLAYER WINS"
                : winner === "banker" ? "BANKER WINS"
                :                      "TIE";

    const color = dragonHit  ? "text-fuchsia-200"
                : pandaHit   ? "text-emerald-200"
                : winner === "player" ? "text-sky-200"
                : winner === "banker" ? "text-rose-200"
                :                      "text-amber-200";

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 8 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{    opacity: 0, scale: 0.88,  y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`text-center text-xl font-extrabold ${color}`}
        >
            {text}
        </motion.div>
    );
}

// ─── RulesModal ───────────────────────────────────────────────────────────────

// ─── Felt panels ─────────────────────────────────────────────────────────────

function FeltPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <div className="mb-1 text-center text-[13px] font-extrabold text-amber-200">{title}</div>
            {children}
        </div>
    );
}

function FeltHeading({ children }: { children: React.ReactNode }) {
    return <div className="mt-2 border-b border-white/15 pb-0.5 text-[11px] font-bold text-white/75">{children}</div>;
}

function FeltRow({ label, value, hit, note }: { label: string; value: string; hit?: boolean; note?: string }) {
    return (
        <div className={`rounded px-1.5 py-0.5 ${hit ? "bg-amber-300/15" : ""}`} data-hit={hit ? "true" : undefined}>
            <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className={hit ? "font-extrabold text-amber-100" : "text-white/90"}>{label}</span>
                <span className="shrink-0 font-bold text-gold">{value}</span>
            </div>
            {note && <div className="text-[11px] leading-snug text-white/75">{note}</div>}
        </div>
    );
}

/** What every bet pays. The line that just won lights up. */
function PaysPanel({ winner, pandaHit, dragonHit }: { winner: Winner | null; pandaHit: boolean; dragonHit: boolean }) {
    return (
        <div data-testid="pays-panel">
            <FeltPanel title="Pays">
                <FeltHeading>Main bets</FeltHeading>
                <FeltRow label="Player" value="1 to 1" hit={winner === "player"} />
                <FeltRow label="Banker" value="1 to 1" hit={winner === "banker" && !dragonHit} note="No commission. Pushes on a Dragon 7." />
                <FeltRow label="Tie" value="8 to 1" hit={winner === "tie"} note="Player and Banker bets push on a tie." />
                <FeltHeading>Side bets</FeltHeading>
                <FeltRow label="Panda 8" value="25 to 1" hit={pandaHit} note="Player wins with a three-card total of 8." />
                <FeltRow label="Dragon 7" value="40 to 1" hit={dragonHit} note="Banker wins with a three-card total of 7." />
            </FeltPanel>
        </div>
    );
}

/** When each hand takes a third card. The rule that applies to the hand on the felt lights up. */
function ThirdCardPanel({ playerCards, bankerCards }: { playerCards: BacCard[]; bankerCards: BacCard[] }) {
    const two = (cards: BacCard[]) => (cards.length >= 2 ? (cards[0].baccaratValue + cards[1].baccaratValue) % 10 : null);
    const p2 = two(playerCards), b2 = two(bankerCards);
    const dealt = p2 !== null && b2 !== null;
    const natural = dealt && (p2 >= 8 || b2 >= 8);
    const live = dealt && !natural;
    const playerDraws = live && p2 <= 5;
    const playerStood = live && p2 >= 6;
    const third = playerCards.length === 3 ? playerCards[2].baccaratValue : null;
    // Banker rows only light once the Player's third card is on the felt
    const bankerRow = (lo: number, hi: number) => playerDraws && third !== null && b2 !== null && b2 >= lo && b2 <= hi;
    return (
        <div data-testid="third-card-panel">
            <FeltPanel title="Third Card Rules">
                <FeltRow label="8 or 9 on two cards" value="Natural" hit={natural} note="Either hand. No more cards for anyone." />
                <FeltHeading>Player goes first</FeltHeading>
                <FeltRow label="Player has 0 to 5" value="Draws" hit={playerDraws} />
                <FeltRow label="Player has 6 or 7" value="Stands" hit={playerStood} />
                <FeltHeading>Banker, if Player stood</FeltHeading>
                <FeltRow label="Banker has 0 to 5" value="Draws" hit={playerStood && b2 !== null && b2 <= 5} />
                <FeltRow label="Banker has 6 or 7" value="Stands" hit={playerStood && b2 !== null && b2 >= 6} />
                <FeltHeading>Banker, if Player drew</FeltHeading>
                <div className="flex items-center justify-between gap-2 px-1.5 pt-0.5 text-[11px] text-white/75">
                    <span>Banker has</span>
                    <span>Draws if Player's 3rd card is</span>
                </div>
                <FeltRow label="0, 1 or 2" value="Any card" hit={bankerRow(0, 2)} />
                <FeltRow label="3" value="Anything but 8" hit={bankerRow(3, 3)} />
                <FeltRow label="4" value="2 to 7" hit={bankerRow(4, 4)} />
                <FeltRow label="5" value="4 to 7" hit={bankerRow(5, 5)} />
                <FeltRow label="6" value="6 or 7" hit={bankerRow(6, 6)} />
                <FeltRow label="7" value="Never" hit={bankerRow(7, 7)} />
                <div className="mt-2 px-1.5 text-[11px] leading-snug text-white/75">
                    Aces count 1. Tens and face cards count 0. Only the last digit of a total counts.
                </div>
            </FeltPanel>
        </div>
    );
}

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={onClose}
                >
                    <div className="absolute inset-0 bg-black/70" />
                    <motion.div
                        className="relative w-full max-w-md rounded-[4px] border border-[#a35c5c] bg-[#300b0b] text-white"
                        initial={{ opacity: 0, scale: 0.92, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 16 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                            <h2 className="text-gold-soft">
                                Baccarat Rules
                            </h2>
                            <button
                                onClick={onClose}
                                className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-white/20 bg-white/10 text-white/90 transition hover:bg-white/20"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-4 overflow-y-auto px-6 py-5" style={{ maxHeight: "70vh" }}>
                            <section>
                                <h3 className="mb-1.5 text-rose-300">
                                    How the Hand Works
                                </h3>
                                <ul className="space-y-1 text-[13px] text-white/90">
                                    <li>Player and Banker each receive 2 cards.</li>
                                    <li>Ace = 1, 2–9 = face value, 10 / J / Q / K = 0.</li>
                                    <li>Only the last digit of the total counts (e.g. 15 = 5).</li>
                                    <li><span className="font-semibold text-white">Player draws</span> a third card on 0–5; stands on 6–7.</li>
                                    <li><span className="font-semibold text-white">Banker draw rules</span> depend on Banker's total and Player's third card value.</li>
                                </ul>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-rose-300">
                                    EZ Baccarat
                                </h3>
                                <ul className="space-y-1 text-[13px] text-white/90">
                                    <li>No commission on Banker wins - the house edge is built into the push rule.</li>
                                    <li>When Banker wins with a <span className="font-bold text-gold">3-card total of 7</span>, the Banker bet pushes (stake returned, no profit).</li>
                                </ul>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-rose-300">
                                    Main Bet Payouts
                                </h3>
                                <div className="space-y-1 text-[13px] text-white/90">
                                    <div className="flex justify-between"><span>Player wins</span><span className="font-bold text-gold">1 to 1</span></div>
                                    <div className="flex justify-between"><span>Banker wins</span><span className="font-bold text-gold">1 to 1 (push on 3-card 7)</span></div>
                                    <div className="flex justify-between"><span>Tie</span><span className="font-bold text-gold">8 to 1</span></div>
                                    <p className="pt-0.5 text-[12px] text-white/90">On a Tie, Player and Banker bets push.</p>
                                </div>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-rose-300">
                                    Side Bets
                                </h3>
                                <div className="space-y-1 text-[13px] text-white/90">
                                    <div className="flex justify-between"><span>Panda 8 - Player wins with 3-card 8</span><span className="font-bold text-gold">25 to 1</span></div>
                                    <div className="flex justify-between"><span>Dragon 7 - Banker wins with 3-card 7</span><span className="font-bold text-gold">40 to 1</span></div>
                                    <p className="pt-0.5 text-[12px] text-white/90">Side bets are independent of main bets and pay only on the specific outcome.</p>
                                </div>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-rose-300">
                                    Squeeze
                                </h3>
                                <ul className="space-y-1 text-[13px] text-white/90">
                                    <li>Switch to Squeeze above the table (or set it as your default in Settings) and the cards come out face down.</li>
                                    <li>You squeeze the side you bet more on. Your cards come up in front of you while the bets fade back. Drag in from a long edge to count the pips down the side, from a short end to see the middle, or lift the top right or bottom left corner (the corners without the number). Let go and the card drops back; drag past halfway and it turns over and goes back into its box.</li>
                                    <li>The dealer turns the other side. Click one of those cards, or press Flip Dealer Cards (D), whenever you like.</li>
                                    <li>Flip My Cards (R), a double click, or a number key turns your cards over without squeezing.</li>
                                    <li>Third cards come out only once every card on the table is face up. When both sides draw, both third cards come out together and you choose which to turn first.</li>
                                </ul>
                            </section>
                            <section>
                                <h3 className="mb-1.5 text-rose-300">
                                    Natural
                                </h3>
                                <ul className="space-y-1 text-[13px] text-white/90">
                                    <li>A 2-card total of 8 or 9 is a <span className="font-semibold text-white">Natural</span> — no more cards are drawn.</li>
                                    <li>Naturals cannot trigger Dragon 7 or Panda 8 (those require 3 cards).</li>
                                </ul>
                            </section>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ─── BaccaratBar ──────────────────────────────────────────────────────────────

function BaccaratBar({
    stage, isShuffling, totalBet, bankroll,
    selectedChip, onChipSelect,
    onClear, onDeal, onChangeBet,
    myFaceDown, dealerFaceDown, onTurnMine, onTurnDealer,
}: {
    stage: Stage; isShuffling: boolean; totalBet: number; bankroll: number;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onDeal: () => void; onChangeBet: () => void;
    myFaceDown: number; dealerFaceDown: number; onTurnMine: () => void; onTurnDealer: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone    = stage === "done";
    const isDealing = stage === "dealing";
    const isSqueeze = stage === "squeeze";

    const canDeal       = (isBetting || isDone) && !isShuffling && totalBet > 0 && bankroll >= totalBet;
    const canChangeBet  = isDone;
    const canClear      = isBetting || isDone;

    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">

            {/* Left: chip tray */}
            <div className="flex items-center">
                <ChipTray
                    selectedChip={selectedChip}
                    onSelect={onChipSelect}
                    disabled={isDealing || isSqueeze || isShuffling}
                />
            </div>

            {/* Center: buttons */}
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {canClear && (
                        <SlideBtn key="clear">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear} disabled={isShuffling || totalBet <= 0}>Clear</button>
                        </SlideBtn>
                    )}
                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button data-hotkey="B" className={BTN_NEUTRAL} onClick={onChangeBet} disabled={!canChangeBet}>
                                Change Bet
                            </button>
                        </SlideBtn>
                    )}
                    {isBetting && (
                        <SlideBtn key="deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    {isDone && (
                        <SlideBtn key="rebet-deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Rebet &amp; Deal</button>
                        </SlideBtn>
                    )}
                    {isSqueeze && (
                        <SlideBtn key="turn-dealer">
                            <button data-hotkey="D" className={BTN_NEUTRAL} onClick={onTurnDealer} disabled={dealerFaceDown === 0}>Flip Dealer Cards</button>
                        </SlideBtn>
                    )}
                    {isSqueeze && (
                        <SlideBtn key="turn-mine">
                            <button data-hotkey="R" className={BTN_GOLD} onClick={onTurnMine} disabled={myFaceDown === 0}>Flip My Cards</button>
                        </SlideBtn>
                    )}

                    {isDealing && (
                        <motion.span
                            key="dealing"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="text-sm italic text-white/75"
                        >
                            Dealing…
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            {/* Right: invisible mirror for true centering */}
            <div className="invisible hidden sm:block">
                <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
            </div>
        </div>
    );
}

/** Quick or Squeeze. Change it between hands. */
function ModeSwitch({ squeeze, disabled, onChange }: { squeeze: boolean; disabled: boolean; onChange: (squeeze: boolean) => void }) {
    const opt = (on: boolean, label: string) => (
        <button
            onClick={() => onChange(on)}
            disabled={disabled}
            aria-pressed={squeeze === on}
            className={`min-h-[44px] px-4 text-sm font-bold transition-colors ${squeeze === on ? "bg-room-red text-room-text" : "bg-room-deep text-room-muted hover:bg-room-raised"} disabled:opacity-60`}
        >
            {label}
        </button>
    );
    return (
        <div className="flex overflow-hidden rounded-[4px] border border-room-line" data-testid="mode-switch" title="Squeeze: cards come face down and you peel your own">
            {opt(false, "Quick")}
            {opt(true, "Squeeze")}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

type BetOverrides = Partial<Record<BetSpotId, number>>;
type Bets = Record<BetSpotId, number>;

/** What the hand pays on every bet. The same rules for Quick and Squeeze. */
function settle(player: BacCard[], banker: BacCard[], bets: Bets) {
    const winner    = getWinner(player, banker);
    const bankerPush = isNoCommissionBankerPush(banker, winner);
    const pandaHit  = isPanda8(player, banker);
    const dragonHit = isDragon7(player, banker);
    let payout = 0;
    if (bets.player > 0) {
        if (winner === "player")      payout += bets.player * 2;
        else if (winner === "tie")    payout += bets.player;
    }
    if (bets.banker > 0) {
        if (winner === "banker") {
            payout += bankerPush ? bets.banker : bets.banker * 2;
        } else if (winner === "tie")  payout += bets.banker;
    }
    if (bets.tie > 0) {
        if (winner === "tie")         payout += bets.tie * 9;
    }
    if (bets.panda > 0) {
        if (pandaHit)                 payout += bets.panda * 26;
    }
    if (bets.dragon > 0) {
        if (dragonHit)                payout += bets.dragon * 41;
    }
    return { winner, pandaHit, dragonHit, payout };
}

/** The cards from the left up to the first one still face down: what the table can see. */
function shown(cards: BacCard[], up: (c: BacCard) => boolean) {
    const i = cards.findIndex((c) => !up(c));
    return i < 0 ? cards : cards.slice(0, i);
}

export default function BaccaratTable({ bankroll, setBankroll }: Props) {
    // two shoes take turns, gold backs then purple: a reshuffle brings out the other one
    const [deckNo, setDeckNo] = useState(1);

    const [deck,        setDeck]        = useState<BacCard[]>(() => createShoe());
    const [playerCards, setPlayerCards] = useState<BacCard[]>([]);
    const [bankerCards, setBankerCards] = useState<BacCard[]>([]);
    const [roadHistory, setRoadHistory] = useState<HandHistoryEntry[]>([]);

    const [playerBet, setPlayerBet] = useState<number>(() => sanitizeBet(defaultBet("baccarat", "player")));
    const [bankerBet, setBankerBet] = useState<number>(() => sanitizeBet(defaultBet("baccarat", "banker")));
    const [tieBet, setTieBet] = useState<number>(() => sanitizeBet(defaultBet("baccarat", "tie")));
    const [pandaBet, setPandaBet] = useState<number>(() => sanitizeBet(defaultBet("baccarat", "panda")));
    const [dragonBet, setDragonBet] = useState<number>(() => sanitizeBet(defaultBet("baccarat", "dragon")));

    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(() => {
        if (typeof window === "undefined") return 25;
        const raw    = window.localStorage.getItem(BACCARAT_SELECTED_CHIP_KEY);
        const parsed = raw ? Number(raw) : 25;
        const valid: number[] = [1, 2.5, 5, 25, 100, 500, 1000, 5000];
        return valid.includes(parsed) ? (parsed as ChipDenomination) : 25;
    });

    const [stage,       setStage]       = useState<Stage>("betting");
    const [message,     setMessage]     = useState("Select a chip, click a betting zone, then press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [showRules,   setShowRules]   = useState(false);

    // Squeeze: the cards come face down. You peel the side you bet more on; the dealer turns the
    // other side's cards when you say. The Settings page sets the default; the switch here changes it.
    const [squeeze, setSqueeze] = useState(() => defaultToggle("baccarat", "squeeze"));
    const changeMode = (on: boolean) => {
        setSqueeze(on);
        const s = loadSettings();
        s.baccarat = { ...s.baccarat, squeeze: on };
        saveSettings(s);
    };
    // the third card rules panel on the left: shown or hidden, remembered between visits
    const [showThirdRules, setShowThirdRules] = useState(() => {
        try { return window.localStorage.getItem(THIRD_RULES_KEY) !== "hidden"; } catch { return true; }
    });
    const toggleThirdRules = (show: boolean) => {
        setShowThirdRules(show);
        try { window.localStorage.setItem(THIRD_RULES_KEY, show ? "shown" : "hidden"); } catch { /* not saved */ }
    };
    const [faceUp, setFaceUp] = useState<string[]>([]);
    const [mySide, setMySide] = useState<"player" | "banker">("player");
    // whether the hand on the table was dealt for squeezing (the switch may change after)
    const handIsSqueeze = useRef(false);
    const handBets = useRef<Bets>({ player: 0, banker: 0, tie: 0, panda: 0, dragon: 0 });
    const shoeRef = useRef<BacCard[]>(deck);
    useEffect(() => { shoeRef.current = deck; }, [deck]);

    // Deal runs one at a time, so a double-click cannot take the bet twice. The lock is held
    // a moment longer so a hand that ends instantly is not dealt over by the second click.
    const dealLock = useRef(false);
    const dealOnce = async () => {
        if (dealLock.current) return;
        dealLock.current = true;
        try { await deal(); } finally { window.setTimeout(() => { dealLock.current = false; }, 300); }
    };
    const [winner,      setWinner]      = useState<Winner | null>(null);
    const [pandaHitResult,  setPandaHitResult]  = useState(false);
    const [dragonHitResult, setDragonHitResult] = useState(false);
    const [lastPayout,  setLastPayout]  = useState(0);
    const [lastWagered, setLastWagered] = useState(0);

    const [selectedSpot, setSelectedSpot] = useState<BetSpotId | null>(null);
    const [playerChips,  setPlayerChips]  = useState<ChipDenomination[]>([]);
    const [bankerChips,  setBankerChips]  = useState<ChipDenomination[]>([]);
    const [tieChips,     setTieChips]     = useState<ChipDenomination[]>([]);
    const [pandaChips,   setPandaChips]   = useState<ChipDenomination[]>([]);
    const [dragonChips,  setDragonChips]  = useState<ChipDenomination[]>([]);

    const dealOverridesRef = useRef<BetOverrides | null>(null);

    useEffect(() => { window.localStorage.setItem(PLAYER_BET_STORAGE_KEY,     String(sanitizeBet(playerBet)));  }, [playerBet]);
    useEffect(() => { window.localStorage.setItem(BANKER_BET_STORAGE_KEY,     String(sanitizeBet(bankerBet)));  }, [bankerBet]);
    useEffect(() => { window.localStorage.setItem(TIE_BET_STORAGE_KEY,        String(sanitizeBet(tieBet)));     }, [tieBet]);
    useEffect(() => { window.localStorage.setItem(PANDA_BET_STORAGE_KEY,      String(sanitizeBet(pandaBet)));   }, [pandaBet]);
    useEffect(() => { window.localStorage.setItem(DRAGON_BET_STORAGE_KEY,     String(sanitizeBet(dragonBet)));  }, [dragonBet]);
    useEffect(() => { window.localStorage.setItem(BACCARAT_SELECTED_CHIP_KEY, String(selectedChip));            }, [selectedChip]);

    useEffect(() => {
        if (playerBet > 0) setPlayerChips(buildChipStackFromAmount(playerBet));
        if (bankerBet > 0) setBankerChips(buildChipStackFromAmount(bankerBet));
        if (tieBet    > 0) setTieChips(buildChipStackFromAmount(tieBet));
        if (pandaBet  > 0) setPandaChips(buildChipStackFromAmount(pandaBet));
        if (dragonBet > 0) setDragonChips(buildChipStackFromAmount(dragonBet));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalBet   = sanitizeBet(playerBet) + sanitizeBet(bankerBet) + sanitizeBet(tieBet) + sanitizeBet(pandaBet) + sanitizeBet(dragonBet);
    const canBet     = stage === "betting" && !isShuffling;

    // in Squeeze a card counts only once it is face up; in Quick every card is face up
    const isUp = (c: BacCard) => !squeezing || faceUp.includes(c.id);
    const squeezing = handIsSqueeze.current && (playerCards.length > 0 || bankerCards.length > 0);
    const visiblePlayer = shown(playerCards, isUp);
    const visibleBanker = shown(bankerCards, isUp);

    const getChips = (s: BetSpotId) => {
        if (s === "player") return playerChips;
        if (s === "banker") return bankerChips;
        if (s === "tie")    return tieChips;
        if (s === "panda")  return pandaChips;
        return dragonChips;
    };
    const setChips = (s: BetSpotId, v: ChipDenomination[]) => {
        if (s === "player") setPlayerChips(v);
        else if (s === "banker") setBankerChips(v);
        else if (s === "tie")    setTieChips(v);
        else if (s === "panda")  setPandaChips(v);
        else                     setDragonChips(v);
    };
    const getBet = (s: BetSpotId) => {
        if (s === "player") return playerBet;
        if (s === "banker") return bankerBet;
        if (s === "tie")    return tieBet;
        if (s === "panda")  return pandaBet;
        return dragonBet;
    };
    const setBet = (s: BetSpotId, v: number) => {
        const n = sanitizeBet(v);
        if (s === "player") setPlayerBet(n);
        else if (s === "banker") setBankerBet(n);
        else if (s === "tie")    setTieBet(n);
        else if (s === "panda")  setPandaBet(n);
        else setDragonBet(n);
    };

    const addChip = (spot: BetSpotId, chip: ChipDenomination) => {
        if (!canBet) return;
        setBet(spot, getBet(spot) + chip);
        setChips(spot, [...getChips(spot), chip]);
    };

    const clearSpot = (spot: BetSpotId) => {
        if (!canBet) return;
        const next = popLastChip(getBet(spot));
        setBet(spot, next);
        setChips(spot, buildChipStackFromAmount(next));
    };

    const clearAllBets = () => {
        if (!canBet) return;
        setPlayerBet(0); setBankerBet(0); setTieBet(0); setPandaBet(0); setDragonBet(0);
        setPlayerChips([]); setBankerChips([]); setTieChips([]); setPandaChips([]); setDragonChips([]);
        setSelectedSpot(null);
    };

    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (canBet && selectedSpot) addChip(selectedSpot, chip);
    };

    // Clicking a spot only highlights it; tray chips go onto the highlighted spot
    const handleZoneClick = (spot: BetSpotId) => {
        if (!canBet) return;
        setSelectedSpot(spot);
    };

    const performShuffleIfNeeded = async (shoe: BacCard[]) => {
        if (!shouldShuffle(shoe)) return shoe;
        setIsShuffling(true);
        setDeckNo((n) => n + 1);
        setMessage("Shuffling 8-deck shoe...");
        await wait(SHUFFLE_DELAY_MS);
        const fresh = createShoe();
        setDeck(fresh);
        setRoadHistory([]);
        setIsShuffling(false);
        return fresh;
    };

    const drawOne = (shoe: BacCard[]) => {
        const next = [...shoe];
        const card = next.shift();
        return { card, nextDeck: next };
    };

    /** Pay the hand and show the result. */
    const finishHand = (player: BacCard[], banker: BacCard[], bets: Bets, handIsNatural: boolean, nextDeck: BacCard[]) => {
        const { winner: finalWinner, pandaHit, dragonHit, payout } = settle(player, banker, bets);

        setBankroll((b) => b + payout);
        setDeck(nextDeck);
        setWinner(finalWinner);
        setPandaHitResult(pandaHit);
        setDragonHitResult(dragonHit);
        setLastPayout(payout);
        setStage("done");
        setRoadHistory((prev) => [
            ...prev,
            { winner: finalWinner, natural: handIsNatural, pandaHit, dragonHit },
        ]);

        if (dragonHit)                  setMessage("Banker wins with a 3-card 7. Dragon 7 hits. Banker bets push.");
        else if (pandaHit)              setMessage("Player wins with a 3-card 8. Panda 8 hits.");
        else if (finalWinner === "tie") setMessage(`Tie ${baccaratTotal(player)}-${baccaratTotal(banker)}.`);
        else                            setMessage(finalWinner === "player" ? "Player wins." : "Banker wins.");
    };

    const deal = async () => {
        if (isShuffling) return;

        const ov = dealOverridesRef.current;
        dealOverridesRef.current = null;

        const bets: Bets = {
            player: sanitizeBet(ov?.player ?? playerBet),
            banker: sanitizeBet(ov?.banker ?? bankerBet),
            tie:    sanitizeBet(ov?.tie    ?? tieBet),
            panda:  sanitizeBet(ov?.panda  ?? pandaBet),
            dragon: sanitizeBet(ov?.dragon ?? dragonBet),
        };
        const wagerTotal = bets.player + bets.banker + bets.tie + bets.panda + bets.dragon;

        if (wagerTotal <= 0) { setMessage("You need at least one wager to deal."); return; }
        if (bankroll < wagerTotal) { setMessage("Not enough bankroll for those wagers."); return; }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);
        if (nextDeck.length < 6) nextDeck = await performShuffleIfNeeded([]);

        setBankroll((b) => b - wagerTotal);
        setLastWagered(wagerTotal);
        setStage("dealing");
        setWinner(null);
        setPandaHitResult(false);
        setDragonHitResult(false);
        setLastPayout(0);
        setPlayerCards([]);
        setBankerCards([]);
        setFaceUp([]);
        handIsSqueeze.current = squeeze;

        if (squeeze) { await dealSqueeze(bets, nextDeck); return; }

        let player: BacCard[] = [];
        let banker: BacCard[] = [];

        setMessage("Dealing first card to Player...");
        let draw = drawOne(nextDeck);
        if (!draw.card) return;
        player = [draw.card]; nextDeck = draw.nextDeck;
        setPlayerCards([...player]); setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing first card to Banker...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        banker = [draw.card]; nextDeck = draw.nextDeck;
        setBankerCards([...banker]); setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing second card to Player...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        player = [...player, draw.card]; nextDeck = draw.nextDeck;
        setPlayerCards([...player]); setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        setMessage("Dealing second card to Banker...");
        draw = drawOne(nextDeck);
        if (!draw.card) return;
        banker = [...banker, draw.card]; nextDeck = draw.nextDeck;
        setBankerCards([...banker]); setDeck(nextDeck);
        await wait(CARD_REVEAL_DELAY_MS);

        const initialPlayerTotal = baccaratTotal(player);
        const initialBankerTotal = baccaratTotal(banker);
        const handIsNatural = isNatural(initialPlayerTotal) || isNatural(initialBankerTotal);

        if (!isNatural(initialPlayerTotal) && !isNatural(initialBankerTotal)) {
            let playerThirdCardValue: number | undefined;

            if (shouldPlayerDraw(initialPlayerTotal)) {
                setMessage("Player draws third card...");
                draw = drawOne(nextDeck);
                if (draw.card) {
                    player = [...player, draw.card];
                    nextDeck = draw.nextDeck;
                    playerThirdCardValue = draw.card.baccaratValue;
                    setPlayerCards([...player]); setDeck(nextDeck);
                    await wait(CARD_REVEAL_DELAY_MS);
                }
            } else {
                setMessage("Player stands.");
                await wait(CARD_REVEAL_DELAY_MS);
            }

            const bankerTwoCardTotal = (banker[0].baccaratValue + banker[1].baccaratValue) % 10;

            if (playerThirdCardValue === undefined) {
                if (shouldBankerDrawTwoCardTotal(bankerTwoCardTotal)) {
                    setMessage("Banker draws third card...");
                    draw = drawOne(nextDeck);
                    if (draw.card) {
                        banker = [...banker, draw.card]; nextDeck = draw.nextDeck;
                        setBankerCards([...banker]); setDeck(nextDeck);
                        await wait(CARD_REVEAL_DELAY_MS);
                    }
                } else {
                    setMessage("Banker stands.");
                    await wait(CARD_REVEAL_DELAY_MS);
                }
            } else {
                if (shouldBankerDraw(bankerTwoCardTotal, playerThirdCardValue)) {
                    setMessage("Banker draws third card...");
                    draw = drawOne(nextDeck);
                    if (draw.card) {
                        banker = [...banker, draw.card]; nextDeck = draw.nextDeck;
                        setBankerCards([...banker]); setDeck(nextDeck);
                        await wait(CARD_REVEAL_DELAY_MS);
                    }
                } else {
                    setMessage("Banker stands.");
                    await wait(CARD_REVEAL_DELAY_MS);
                }
            }
        } else {
            setMessage("Natural. No more cards.");
            await wait(CARD_REVEAL_DELAY_MS);
        }

        finishHand(player, banker, bets, handIsNatural, nextDeck);
    };

    /** Squeeze: four cards go out face down, in the usual order. Then you turn them. */
    const dealSqueeze = async (bets: Bets, shoe: BacCard[]) => {
        handBets.current = bets;
        setMessage("Dealing...");
        const side = bets.banker > bets.player ? "banker" : "player";
        setMySide(side);
        let nextDeck = shoe;
        const player: BacCard[] = [], banker: BacCard[] = [];
        for (const to of ["player", "banker", "player", "banker"] as const) {
            const draw = drawOne(nextDeck);
            if (!draw.card) return;
            nextDeck = draw.nextDeck;
            if (to === "player") { player.push(draw.card); setPlayerCards([...player]); }
            else { banker.push(draw.card); setBankerCards([...banker]); }
            setDeck(nextDeck);
            await wait(SQUEEZE_DEAL_MS);
        }
        shoeRef.current = nextDeck;
        setStage("squeeze");
        setMessage(`Peel your ${side === "player" ? "Player" : "Banker"} cards: drag in from an edge or corner. Click a dealer card to turn it.`);
    };

    // Squeeze: once every card on the table is face up, the next card is dealt, or the hand ends.
    // The same drawing rules as Quick. When both sides draw, both third cards come out together.
    useEffect(() => {
        if (stage !== "squeeze") return;
        if (![...playerCards, ...bankerCards].every((c) => faceUp.includes(c.id))) return;
        const id = window.setTimeout(() => {
            const p = playerCards, b = bankerCards, bets = handBets.current;
            const take = () => {
                const draw = drawOne(shoeRef.current);
                shoeRef.current = draw.nextDeck;
                setDeck(draw.nextDeck);
                return draw.card;
            };
            const pt = baccaratTotal(p.slice(0, 2)), bt = baccaratTotal(b.slice(0, 2));
            const natural = isNatural(pt) || isNatural(bt);
            if (p.length === 2 && b.length === 2) {
                if (natural) { finishHand(p, b, bets, true, shoeRef.current); return; }
                if (shouldPlayerDraw(pt)) {
                    const c = take(); if (!c) return;
                    // when the Banker draws too, both third cards come out face down together, and
                    // you choose which to turn first (still dealt in order: Player, then Banker)
                    if (shouldBankerDraw(bt, c.baccaratValue)) {
                        const d = take(); if (!d) return;
                        setPlayerCards([...p, c]); setBankerCards([...b, d]);
                        setMessage("Player and Banker each draw a third card.");
                        return;
                    }
                    setPlayerCards([...p, c]); setMessage("Player draws a third card.");
                    return;
                }
                if (shouldBankerDrawTwoCardTotal(bt)) {
                    const c = take(); if (!c) return;
                    setBankerCards([...b, c]); setMessage("Player stands. Banker draws a third card.");
                    return;
                }
                finishHand(p, b, bets, false, shoeRef.current);
                return;
            }
            if (p.length === 3 && b.length === 2 && shouldBankerDraw(bt, p[2].baccaratValue)) {
                const c = take(); if (!c) return;
                setBankerCards([...b, c]); setMessage("Banker draws a third card.");
                return;
            }
            finishHand(p, b, bets, false, shoeRef.current);
        }, SQUEEZE_STEP_MS);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, faceUp, playerCards, bankerCards]);

    const turnOver = (ids: string[]) => setFaceUp((up) => [...up, ...ids.filter((id) => !up.includes(id))]);
    const myCards = mySide === "player" ? playerCards : bankerCards;
    const dealerCards = mySide === "player" ? bankerCards : playerCards;
    const myFaceDown = stage === "squeeze" ? myCards.filter((c) => !faceUp.includes(c.id)) : [];
    const dealerFaceDown = stage === "squeeze" ? dealerCards.filter((c) => !faceUp.includes(c.id)) : [];

    const nextRound = (clearChips = false) => {
        setPlayerCards([]); setBankerCards([]); setFaceUp([]);
        setWinner(null); setPandaHitResult(false); setDragonHitResult(false);
        setLastPayout(0); setLastWagered(0);
        setStage("betting");
        if (clearChips) {
            setPlayerBet(0); setBankerBet(0); setTieBet(0); setPandaBet(0); setDragonBet(0);
            setPlayerChips([]); setBankerChips([]); setTieChips([]); setPandaChips([]); setDragonChips([]);
        }
        setMessage(
            shouldShuffle(deck)
                ? "Cut card reached. Next hand will shuffle the shoe."
                : "Select a chip, click a betting zone, then press Deal."
        );
    };

    const outcomeOf = (side: Winner): "neutral" | "win" | "tie" => winner === side ? "win" : winner === "tie" ? "tie" : "neutral";

    /** One side's cards: face up in Quick; in Squeeze, face down until turned. */
    // Squeeze: your face-down cards are held up in front of you, over the faded bets. Turned
    // over, a card goes back into its box on the table.
    const holding = squeezing && stage === "squeeze";
    const inHand = (card: BacCard, side: "player" | "banker") => holding && side === mySide && !faceUp.includes(card.id);
    const renderCard = (card: BacCard, side: "player" | "banker", i: number) => {
        if (inHand(card, side)) return i === 2 ? null : <CardPlace key={card.id} />;
        const inner = squeezing ? (
            <SqueezeCard
                card={card}
                faceUp={faceUp.includes(card.id)}
                mine={side === mySide}
                active={stage === "squeeze"}
                sideways={i === 2}
                onTurn={() => turnOver([card.id])}
            />
        ) : (
            <PlayingCard card={toShared(card, true)} className={CARD_SIZE} />
        );
        const dealt = (
            <motion.div key={card.id} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(0)}>
                {inner}
            </motion.div>
        );
        return i === 2 ? <Sideways key={card.id}>{dealt}</Sideways> : dealt;
    };
    const box = (side: "player" | "banker") => {
        const cards = side === "player" ? playerCards : bankerCards;
        const seen = side === "player" ? visiblePlayer : visibleBanker;
        return (
            <CardBox
                label={side === "player" ? "PLAYER" : "BANKER"}
                total={seen.length > 0 ? baccaratTotal(seen) : null}
                outcome={outcomeOf(side)}
                third={cards[2] ? renderCard(cards[2], side, 2) : null}
            >
                {cards[0] ? renderCard(cards[0], side, 0) : <CardPlace />}
                {cards[1] ? renderCard(cards[1], side, 1) : <CardPlace />}
            </CardBox>
        );
    };

    const front = !holding ? [] : myCards.slice(0, 2).some((c) => !faceUp.includes(c.id)) ? myCards.slice(0, 2) : myCards.slice(2).filter((c) => !faceUp.includes(c.id));
    const inFront = (
        <div className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-4 sm:gap-6 ${HELD_VARS}`} data-testid="in-front">
            {front.map((card) => faceUp.includes(card.id) ? <CardPlace key={card.id} /> : (
                <motion.div key={card.id} className="pointer-events-auto" initial={{ opacity: 0, y: 40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                    <SqueezeCard card={card} faceUp={false} mine active onTurn={() => turnOver([card.id])} />
                </motion.div>
            ))}
        </div>
    );

    const band = (id: "player" | "banker" | "tie", chips: ChipDenomination[], total: number) => ({
        chips, total, selected: selectedSpot === id, winner: winner === id,
    });

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="rounded-[4px] border border-room-line bg-room-panel px-10 py-8 text-center">
                        <div className="text-sm font-extrabold text-room-muted">Baccarat</div>
                        <div className="mt-2 text-3xl font-extrabold text-room-text">Shuffling Shoe</div>
                        <div className="mt-2 text-sm text-room-muted">Please wait…</div>
                    </div>
                </div>
            )}

            <TableShell deckNo={deckNo}
                feltColor="#7f1d1d"
                gameName="Baccarat"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <BaccaratBar
                        stage={stage}
                        isShuffling={isShuffling}
                        totalBet={totalBet}
                        bankroll={bankroll}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={() => {
                            if (stage === "done") nextRound(true);
                            else clearAllBets();
                        }}
                        onDeal={() => void dealOnce()}
                        onChangeBet={() => nextRound(false)}
                        myFaceDown={myFaceDown.length}
                        dealerFaceDown={dealerFaceDown.length}
                        onTurnMine={() => turnOver(myFaceDown.map((c) => c.id))}
                        onTurnDealer={() => turnOver(dealerFaceDown.map((c) => c.id))}
                    />
                }
            >
                <div className="relative flex flex-1 flex-col items-center gap-3 lg:gap-2">

                    <TableLabel onRules={() => setShowRules(true)} />

                    {/* Quick or Squeeze: beside the title on a desktop, under it on smaller screens */}
                    <div className="lg:absolute lg:right-2 lg:top-0">
                        <ModeSwitch squeeze={squeeze} disabled={!(stage === "betting" || stage === "done")} onChange={changeMode} />
                    </div>

                    {/* On the felt either side of the cards: when a third card is drawn, and what pays.
                        The third card rules can be hidden; the Big Road then takes their place on the left. */}
                    <div className="hidden xl:absolute xl:left-2 xl:top-[76px] xl:block xl:w-[272px]">
                        {showThirdRules ? <ThirdCardPanel playerCards={visiblePlayer} bankerCards={visibleBanker} /> : <BigRoad history={roadHistory} />}
                    </div>
                    <div className="hidden xl:absolute xl:right-2 xl:top-[76px] xl:block xl:w-[272px]">
                        <PaysPanel winner={winner} pandaHit={pandaHitResult} dragonHit={dragonHitResult} />
                    </div>
                    {/* the shoe so far, in the bottom right corner; it starts over when the shoe is shuffled */}
                    {showThirdRules && (
                        <div className="hidden xl:absolute xl:bottom-0 xl:right-2 xl:block xl:w-[272px]">
                            <BigRoad history={roadHistory} />
                        </div>
                    )}
                    <div className="hidden xl:absolute xl:bottom-0 xl:left-2 xl:z-10 xl:block">
                        <button
                            onClick={() => toggleThirdRules(!showThirdRules)}
                            aria-pressed={!showThirdRules}
                            className="min-h-[44px] rounded-[4px] border border-room-line bg-room-deep px-4 text-sm font-bold text-room-text transition-colors hover:bg-room-raised"
                            data-testid="rules-toggle"
                        >
                            {showThirdRules ? "Hide rules" : "Show rules"}
                        </button>
                    </div>

                    {/* The printed card boxes: Player and Banker, side by side from 640px */}
                    <div className={`flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4 ${CARD_VARS}`} data-testid="card-area">
                        {box("player")}
                        {box("banker")}
                    </div>

                    <BetBar
                        pendingBet={lastWagered > 0 ? lastWagered : totalBet}
                        returned={lastPayout}
                        net={lastPayout - lastWagered}
                        showResult={stage === "done"}
                    />

                    {/* One fixed line: the message while the hand plays, then the result. It keeps its
                        height (room for two lines on a phone), so the layout below does not move. */}
                    <div className="flex min-h-[40px] items-center justify-center px-2 text-center lg:min-h-[32px]" data-testid="status-line">
                        {winner ? (
                            <ResultBanner winner={winner} pandaHit={pandaHitResult} dragonHit={dragonHitResult} />
                        ) : (
                            <p className="text-sm font-semibold leading-5 text-white/80">
                                {canBet && selectedSpot === null ? "Tap a betting area, then tap chips to bet." : message}
                            </p>
                        )}
                    </div>

                    {/* the bets stay on the felt; while you squeeze they fade back and your cards come up in front */}
                    <div className="relative flex w-full justify-center">
                    <div className={`flex w-full justify-center transition-opacity duration-300 ${holding ? "pointer-events-none opacity-20" : ""}`}>
                    <BettingLayout
                        bets={{ player: band("player", playerChips, playerBet), banker: band("banker", bankerChips, bankerBet), tie: band("tie", tieChips, tieBet) }}
                        canBet={canBet}
                        onSelect={handleZoneClick}
                        onRemove={clearSpot}
                        dragon={{ chips: dragonChips, total: dragonBet, selected: selectedSpot === "dragon", winner: dragonHitResult, onSelect: () => handleZoneClick("dragon"), onRemove: () => clearSpot("dragon") }}
                        panda={{ chips: pandaChips, total: pandaBet, selected: selectedSpot === "panda", winner: pandaHitResult, onSelect: () => handleZoneClick("panda"), onRemove: () => clearSpot("panda") }}
                    />
                    </div>
                    {inFront}
                    </div>

                </div>
            </TableShell>
        </>
    );
}
