import { useState } from "react";
import {
    GAME_SETTINGS, type BetField, type Settings as SettingsData,
    factorySettings, loadSettings, saveSettings, sanitizeBet,
    type FontSize, loadFontSize, saveFontSize,
} from "./shared/settings";
import { formatMoney, BTN_NEUTRAL } from "./shared/money";

type Props = { onBack: () => void };

const FIELD = "h-11 shrink-0 rounded-[4px] border border-line bg-ink text-right text-base font-bold text-gold-soft outline-none transition-colors focus:border-gold";

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
        <div className="flex items-center justify-between gap-4">
            <label htmlFor={id} className="min-w-0">
                <div className="text-base font-semibold text-text">{field.label}</div>
                <div className="text-sm text-text-muted">{field.choices ? "Choose one" : limits}</div>
            </label>
            {field.choices ? (
                <select
                    id={id}
                    value={value}
                    onChange={(e) => onCommit(sanitizeBet(field, e.target.value))}
                    data-setting={`${gameId}.${field.key}`}
                    className={`${FIELD} w-28 px-3`}
                >
                    {field.choices.map((c) => (
                        <option key={c} value={c}>{field.unit === "credits" ? c : formatMoney(c)}</option>
                    ))}
                </select>
            ) : (
                <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-text-muted">$</span>
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
                        className={`${FIELD} w-full pl-7 pr-3`}
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
        <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
                <div className="text-base font-semibold text-text">{label}</div>
                <div className="text-sm text-text-muted">{hint}</div>
            </div>
            <button
                role="switch"
                aria-checked={on}
                aria-label={label}
                onClick={() => onChange(!on)}
                data-setting={id}
                className={`flex h-11 w-[84px] shrink-0 overflow-hidden rounded-[4px] border-2 text-sm font-bold transition-colors ${on ? "border-gold-deep" : "border-[#3a4a66]"}`}
            >
                <span className={`flex flex-1 items-center justify-center ${on ? "bg-ink text-text-muted" : "bg-panel-2 text-text"}`}>Off</span>
                <span className={`flex flex-1 items-center justify-center ${on ? "bg-gold text-ink" : "bg-ink text-text-muted"}`}>On</span>
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
        <div className="min-h-[calc(100vh-88px)] bg-page px-4 py-8 text-text sm:px-6">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
                    <div>
                        <h1 className="text-gold">Settings</h1>
                        <p className="mt-2 max-w-[62ch] text-base leading-6 text-text-muted">
                            Text size, and the chips each table starts with when you sit down. Changes save as you make them.
                            You can still change or clear your bets at the table.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`mr-2 text-sm font-bold text-good transition-opacity ${saved ? "opacity-100" : "opacity-0"}`} data-testid="settings-saved" aria-live="polite">
                            Saved
                        </span>
                        <button className={BTN_NEUTRAL} onClick={resetAll}>Reset to defaults</button>
                        <button className={BTN_NEUTRAL} onClick={onBack}>Back</button>
                    </div>
                </div>

                {/* Display sits apart from the bet cards: a gold edge marks it as the site-wide setting */}
                <section className="mb-4 rounded-[4px] border border-line-gold border-l-4 border-l-gold bg-panel p-4" data-settings-game="display">
                    <h2 className="mb-4 text-gold-soft">Display</h2>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-base font-semibold text-text">Text size</div>
                            <div className="text-sm text-text-muted">Large makes labels, pay tables and messages bigger on every page</div>
                        </div>
                        <div className="flex shrink-0 overflow-hidden rounded-[4px] border-2 border-[#3a4a66]" role="group" aria-label="Text size">
                            {(["normal", "large"] as const).map((size) => (
                                <button
                                    key={size}
                                    onClick={() => chooseFont(size)}
                                    aria-pressed={fontSize === size}
                                    data-setting={`display.font.${size}`}
                                    className={`h-11 px-5 text-sm font-bold capitalize transition-colors ${fontSize === size ? "bg-gold text-ink" : "bg-ink text-text hover:bg-panel-2"}`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {GAME_SETTINGS.map((game) => (
                        <section key={game.id} className="rounded-[4px] border border-line bg-panel p-4" data-settings-game={game.id}>
                            <h2 className="mb-4 text-gold-soft">{game.name}</h2>
                            <div className="space-y-4">
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

                <p className="mt-6 text-sm text-text-muted">
                    Roulette has no default bet: you place chips on the layout each spin.
                </p>
            </div>
        </div>
    );
}
