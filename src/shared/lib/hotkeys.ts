import { useEffect } from "react";

// Keyboard shortcuts. A button says which key presses it with data-hotkey (and
// data-hotkey-alt for more keys, which work but are not shown). One listener, here, presses whichever button on the
// table in view owns the key. The games themselves add no listeners.
//
//   data-hotkey="H"     on a button, or on an element that wraps one button
//   data-key-hold       Video Poker cards: 1 to 5 hold them, left to right
//   data-key-card       Pai Gow cards: arrows move between them, Space picks one
//   data-key-reveal     cards you turn over yourself ("down" until turned): 5 turns over the fifth
//   data-key-number     Pai Gow cards once sorted: that number moves the card to Low and back

const HOTKEYS_KEY = "casino-hotkeys";

export function loadHotkeys(): boolean {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(HOTKEYS_KEY) !== "off";
}

/** Put the choice on the page: the stylesheet hides the key hints when it is off. */
export function applyHotkeys(on: boolean): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.hotkeys = on ? "on" : "off";
}

export function saveHotkeys(on: boolean): void {
    if (typeof window !== "undefined") window.localStorage.setItem(HOTKEYS_KEY, on ? "on" : "off");
    applyHotkeys(on);
}

applyHotkeys(loadHotkeys());

const TYPING = "input, textarea, select, [contenteditable='true']";

/** The button to press for an element, or null if it cannot be pressed right now. */
function pressable(el: Element): HTMLButtonElement | null {
    const button = el instanceof HTMLButtonElement ? el : el.querySelector("button");
    if (!button || button.disabled || button.getClientRects().length === 0) return null;
    // a button that is sliding in or out ignores clicks, so it ignores keys too
    if (window.getComputedStyle(button).pointerEvents === "none") return null;
    return button;
}

function readingOrder(a: Element, b: Element): number {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return Math.abs(ra.top - rb.top) > ra.height / 2 ? ra.top - rb.top : ra.left - rb.left;
}

export function useHotkeys(): void {
    useEffect(() => {
        // someone moving through the page with Tab keeps the browser's own Space and Enter
        let tabbing = false;
        let swallowKeyUp: string | null = null;

        const onPointer = () => { tabbing = false; };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Tab") { tabbing = true; return; }
            if (document.documentElement.dataset.hotkeys === "off") return;
            if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
            if (e.target instanceof Element && e.target.closest(TYPING)) return;

            const table = document.querySelector<HTMLElement>("[data-table]:not([hidden])");
            if (!table) return;

            const key = e.key === " " ? "space" : e.key.toLowerCase();
            const done = () => { e.preventDefault(); swallowKeyUp = e.key; };

            // a rules popup is open: Escape closes it, and nothing else reaches the table
            const close = [...table.querySelectorAll('button[aria-label^="Close"]')].map(pressable).find(Boolean);
            if (close) {
                if (key === "escape") { close.click(); done(); }
                return;
            }

            const focused = document.activeElement instanceof HTMLElement && table.contains(document.activeElement) ? document.activeElement : null;
            const onCard = focused?.matches("[data-key-card]") ? pressable(focused) : null;
            if (tabbing && focused instanceof HTMLButtonElement && !onCard && (key === "space" || key === "enter")) return;

            // Pai Gow: arrows walk the cards, Space picks the one in hand
            if (key.startsWith("arrow")) {
                const cards = [...table.querySelectorAll("[data-key-card]")].filter((c) => pressable(c)).sort(readingOrder) as HTMLElement[];
                if (cards.length === 0) return;
                const at = focused ? cards.indexOf(focused) : -1;
                const step = key === "arrowleft" || key === "arrowup" ? -1 : 1;
                const next = at < 0 ? (step > 0 ? 0 : cards.length - 1) : (at + step + cards.length) % cards.length;
                cards[next].focus();
                done();
                return;
            }
            if (key === "space" && onCard) { onCard.click(); done(); return; }

            // cards still face down: a number turns over the card in that place
            if (/^[1-9]$/.test(key)) {
                const cards = [...table.querySelectorAll<HTMLElement>("[data-key-reveal]")].filter((c) => c.getClientRects().length > 0).sort(readingOrder);
                if (cards.some((c) => c.dataset.keyReveal === "down" && pressable(c))) {
                    const card = cards[Number(key) - 1];
                    const button = card?.dataset.keyReveal === "down" ? pressable(card) : null;
                    if (button) button.click();
                    done();
                    return;
                }
            }

            // Pai Gow, hand sorted: a number moves that card to the Low hand, or back
            if (/^[1-9]$/.test(key)) {
                const numbered = table.querySelector<HTMLElement>(`[data-key-number="${key}"]`);
                const button = numbered ? pressable(numbered) : null;
                if (button) { button.click(); done(); return; }
            }

            // Video Poker: 1 to 5 hold the cards
            if (/^[1-5]$/.test(key)) {
                const holds = [...table.querySelectorAll("[data-key-hold]")];
                if (holds.length > 0) {
                    const hold = holds[Number(key) - 1] ? pressable(holds[Number(key) - 1]) : null;
                    if (hold) { hold.click(); done(); }
                    return;
                }
            }

            for (const el of table.querySelectorAll<HTMLElement>("[data-hotkey]")) {
                // data-hotkey-alt may list several keys, separated by spaces: they work but are not shown
                if (el.dataset.hotkey?.toLowerCase() !== key && !(el.dataset.hotkeyAlt ?? "").toLowerCase().split(" ").includes(key)) continue;
                const button = pressable(el);
                if (!button) continue;
                // the key did the job, so a button left in focus by the mouse must not fire as well
                if (focused && !onCard) focused.blur();
                button.click();
                done();
                return;
            }

            // Space with nothing to press (a button still sliding in, say) must not scroll the page,
            // and Space or Enter must not fire a button the mouse left in focus
            if (key === "space" || (key === "enter" && focused instanceof HTMLButtonElement)) { done(); }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (swallowKeyUp === e.key) { e.preventDefault(); swallowKeyUp = null; }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("pointerdown", onPointer);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("pointerdown", onPointer);
        };
    }, []);
}
