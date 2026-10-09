import { useState } from "react";
import {
    GAME_SETTINGS, type BetField, type Settings as SettingsData,
    factorySettings, loadSettings, saveSettings, sanitizeBet,
    type FontSize, loadFontSize, saveFontSize,
} from "./shared/settings";
import { formatMoney, BTN_NEUTRAL } from "./shared/money";

type Props = { onBack: () => void };

// ─── Money field ──────────────────────────────────────────────────────────────

function BetInput({ gameId, field, value, onCommit }: {
    gameId: string; field: BetField; value: number; onCommit: (value: number) => void;
}) {
    // what is typed stays as typed until the field is left, then it snaps to a bet the chips can make
    const [draft, setDraft] = useState<string | null>(null);
    const id = `setting-${gameId}-${field.key}`;
    const commit = () => {
        if (draft !== null) onCommit(sanitizeBet(field, draft === "" ? 0 : draft));
        setDraft(null);
    };
    const limits = field.optional
        ? `${formatMoney(field.min)} to ${formatMoney(field.max)}, or 0 for none`
        : `${formatMoney(field.min)} to ${formatMoney(field.max)}`;

    return (
        <div className="flex items-center justify-between gap-3">
            <label htmlFor={id} className="min-w-0">
                <div className="text-sm font-bold text-white/90">{field.label}</div>
                <div className="text-[11px] text-white/40">{field.choices ? "Choose one" : limits}</div>
            </label>
            {field.choices ? (
                <select
                    id={id}
                    value={value}
                    onChange={(e) => onCommit(sanitizeBet(field, e.target.value))}
                    data-setting={`${gameId}.${field.key}`}
                    className="h-11 w-28 shrink-0 rounded-xl border border-white/15 bg-black/40 px-3 text-right text-sm font-extrabold text-amber-100 outline-none transition focus:border-amber-300/60"
                >
                    {field.choices.map((c) => (
                        <option key={c} value={c}>{field.unit === "credits" ? c : formatMoney(c)}</option>
                    ))}
                </select>
            ) : (
                <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-white/40">$</span>
                    <input
                        id={id}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={field.max}
                        step={0.5}
                        value={draft ?? String(value)}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        data-setting={`${gameId}.${field.key}`}
                        className="h-11 w-full rounded-xl border border-white/15 bg-black/40 pl-7 pr-3 text-right text-sm font-extrabold text-amber-100 outline-none transition focus:border-amber-300/60"
                    />
                </div>
            )}
        </div>
    );
}

// ─── Switch ───────────────────────────────────────────────────────────────────

function Toggle({ id, label, hint, on, onChange }: {
    id: string; label: string; hint: string; on: boolean; onChange: (on: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="text-sm font-bold text-white/90">{label}</div>
                <div className="text-[11px] text-white/40">{hint}</div>
            </div>
            <button
                role="switch"
                aria-checked={on}
                aria-label={label}
                onClick={() => onChange(!on)}
                data-setting={id}
                className={`relative h-11 w-[68px] shrink-0 rounded-full border transition ${on ? "border-red-300/60 bg-red-500/70" : "border-white/15 bg-black/40"}`}
            >
                <span className={`absolute top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-white shadow transition-all ${on ? "left-[32px]" : "left-[3px]"}`} />
            </button>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Settings({ onBack }: Props) {
    const [settings, setSettings] = useState<SettingsData>(loadSettings);
    const [saved, setSaved] = useState(false);
    const [fontSize, setFontSize] = useState<FontSize>(loadFontSize);
    const chooseFont = (size: FontSize) => { saveFontSize(size); setFontSize(size); setSaved(true); };

    const update = (gameId: string, key: string, value: number | boolean) => {
        setSettings((prev) => {
            const next = { ...prev, [gameId]: { ...prev[gameId], [key]: value } };
            saveSettings(next);
            return next;
        });
        setSaved(true);
    };

    const resetAll = () => {
        const fresh = factorySettings();
        saveSettings(fresh);
        setSettings(fresh);
        saveFontSize("normal");
        setFontSize("normal");
        setSaved(true);
    };

    return (
        <div className="min-h-[calc(100vh-88px)] bg-[radial-gradient(circle_at_top,_#243042_0%,_#0b1220_45%,_#040816_100%)] px-4 py-8 text-white">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90">Settings</div>
                        <h1 className="mt-1 text-2xl font-extrabold text-amber-50 sm:text-3xl" style={{ fontFamily: "Georgia, serif" }}>
                            Display and Default Bets
                        </h1>
                        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-white/55">
                            Text size, and the chips each table starts with when you sit down. Changes save as you make them.
                            You can still change or clear your bets at the table.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold text-emerald-300 transition-opacity ${saved ? "opacity-100" : "opacity-0"}`} data-testid="settings-saved" aria-live="polite">
                            Saved
                        </span>
                        <button className={BTN_NEUTRAL} onClick={resetAll}>Reset to defaults</button>
                        <button className={BTN_NEUTRAL} onClick={onBack}>Back</button>
                    </div>
                </div>

                <section className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4" data-settings-game="display">
                    <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">Display</h2>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-white/90">Text size</div>
                            <div className="text-[11px] text-white/40">Large makes labels, pay tables and messages bigger on every page</div>
                        </div>
                        <div className="flex shrink-0 overflow-hidden rounded-xl border border-white/15" role="group" aria-label="Text size">
                            {(["normal", "large"] as const).map((size) => (
                                <button
                                    key={size}
                                    onClick={() => chooseFont(size)}
                                    aria-pressed={fontSize === size}
                                    data-setting={`display.font.${size}`}
                                    className={`h-11 px-5 text-sm font-extrabold capitalize transition ${fontSize === size ? "bg-amber-400 text-black" : "bg-black/40 text-white/70 hover:bg-white/10"}`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {GAME_SETTINGS.map((game) => (
                        <section key={game.id} className="rounded-2xl border border-white/10 bg-white/5 p-4" data-settings-game={game.id}>
                            <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">{game.name}</h2>
                            <div className="space-y-3">
                                {game.bets.map((field) => (
                                    <BetInput
                                        key={field.key}
                                        gameId={game.id}
                                        field={field}
                                        value={Number(settings[game.id]?.[field.key] ?? field.fallback)}
                                        onCommit={(v) => update(game.id, field.key, v)}
                                    />
                                ))}
                                {(game.toggles ?? []).map((t) => (
                                    <Toggle
                                        key={t.key}
                                        id={`${game.id}.${t.key}`}
                                        label={t.label}
                                        hint={t.hint}
                                        on={settings[game.id]?.[t.key] === true}
                                        onChange={(on) => update(game.id, t.key, on)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>

                <p className="mt-6 text-center text-[11px] text-white/35">
                    Roulette has no default bet: you place chips on the layout each spin.
                </p>
            </div>
        </div>
    );
}
