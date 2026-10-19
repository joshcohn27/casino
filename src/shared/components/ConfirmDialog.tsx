import { motion } from "motion/react";

// An "are you sure?" popup in the site's colors: a dark panel, grey border, and the red main
// button. The safe choice is the red one and has the focus, so Enter or Space keeps you where
// you were. Escape or a click outside does the same (the backdrop's "Close" label is what the
// hotkey listener looks for).
export default function ConfirmDialog({
    title, body, keepLabel, goLabel, onKeep, onGo, testId,
}: {
    title: string;
    body: string;
    keepLabel: string;
    goLabel: string;
    onKeep: () => void;
    onGo: () => void;
    testId?: string;
}) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid={testId}>
            <button className="absolute inset-0 bg-black/70" onClick={onKeep} aria-label="Close confirm" />
            <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="relative z-[101] w-full max-w-[400px] rounded-[4px] border border-room-line bg-room-panel px-5 py-5 text-room-text"
                role="alertdialog"
                aria-modal="true"
                aria-label={title}
            >
                <div className="text-lg font-bold">{title}</div>
                <p className="mt-2 text-[14px] leading-5 text-room-muted">{body}</p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button
                        onClick={onGo}
                        className="min-h-[44px] rounded-[4px] border border-room-line bg-room-deep px-5 py-3 text-sm font-bold text-room-text transition-colors hover:bg-room-raised active:bg-room-panel"
                    >
                        {goLabel}
                    </button>
                    <button
                        onClick={onKeep}
                        autoFocus
                        className="min-h-[44px] rounded-[4px] border border-room-red-pressed bg-room-red px-5 py-3 text-sm font-bold text-room-text transition-colors hover:bg-room-red-hover active:bg-room-red-pressed"
                    >
                        {keepLabel}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
