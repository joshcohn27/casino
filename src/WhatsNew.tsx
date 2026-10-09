import { CHANGELOG, VERSION, formatChangeDate, type ChangeKind } from "./changelog";
import { BTN_NEUTRAL } from "./shared/money";

type Props = { onBack: () => void };

const KIND_LABEL: Record<ChangeKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
const KIND_STYLE: Record<ChangeKind, string> = {
    new: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
    improved: "border-amber-300/40 bg-amber-400/15 text-amber-100",
    fixed: "border-sky-400/40 bg-sky-500/15 text-sky-200",
};

export default function WhatsNew({ onBack }: Props) {
    return (
        <div className="min-h-[calc(100vh-88px)] bg-[radial-gradient(circle_at_top,_#243042_0%,_#0b1220_45%,_#040816_100%)] px-4 py-8 text-white">
            <div className="mx-auto max-w-3xl">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90">Version {VERSION}</div>
                        <h1 className="mt-1 text-2xl font-extrabold text-amber-50 sm:text-3xl" style={{ fontFamily: "Georgia, serif" }}>
                            What&apos;s New
                        </h1>
                        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-white/55">
                            Every update to Cohn Casino, newest first.
                        </p>
                    </div>
                    <button className={BTN_NEUTRAL} onClick={onBack}>Back</button>
                </div>

                <div className="space-y-4">
                    {CHANGELOG.map((entry, i) => (
                        <section
                            key={entry.version}
                            data-version={entry.version}
                            className={`rounded-2xl border p-4 ${i === 0 ? "border-amber-300/30 bg-amber-300/[0.06]" : "border-white/10 bg-white/5"}`}
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <h2 className="text-base font-extrabold text-amber-50">
                                    <span className="mr-2 text-amber-300">v{entry.version}</span>
                                    {entry.title}
                                </h2>
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                                    {formatChangeDate(entry.date)}{i === 0 ? " · Latest" : ""}
                                </span>
                            </div>
                            <ul className="mt-3 space-y-2">
                                {entry.changes.map(([kind, text]) => (
                                    <li key={text} className="flex items-start gap-2.5 text-sm leading-6 text-white/80">
                                        <span className={`mt-0.5 w-[74px] shrink-0 rounded-full border px-2 py-0.5 text-center text-[10px] font-extrabold uppercase tracking-[0.1em] ${KIND_STYLE[kind]}`}>
                                            {KIND_LABEL[kind]}
                                        </span>
                                        <span>{text}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
