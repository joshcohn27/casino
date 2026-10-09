import { CHANGELOG, VERSION, formatChangeDate, type ChangeKind } from "./changelog";
import { BTN_NEUTRAL } from "./shared/money";

type Props = { onBack: () => void };

const KIND_LABEL: Record<ChangeKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
// a colored word with a colored left edge
const KIND_STYLE: Record<ChangeKind, string> = { new: "text-good", improved: "text-gold", fixed: "text-info" };

export default function WhatsNew({ onBack }: Props) {
    return (
        <div className="min-h-[calc(100vh-88px)] bg-page px-4 py-8 text-text sm:px-6">
            <div className="mx-auto max-w-3xl">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
                    <div>
                        <h1 className="text-gold">What&apos;s New</h1>
                        <p className="mt-2 text-base text-text-muted">
                            Every update to Cohn Casino, newest first. You are on version{" "}
                            <span className="font-bold text-gold">{VERSION}</span>.
                        </p>
                    </div>
                    <button className={BTN_NEUTRAL} onClick={onBack}>Back</button>
                </div>

                <div className="space-y-4">
                    {CHANGELOG.map((entry, i) => (
                        <section
                            key={entry.version}
                            data-version={entry.version}
                            data-testid="release-card"
                            className={`rounded-[4px] border bg-panel p-4 ${i === 0 ? "border-line-gold border-l-4 border-l-gold" : "border-line"}`}
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <h2 className="text-text">
                                    <span className={`mr-3 ${"text-gold"}`}>{entry.version}</span>
                                    {entry.title}
                                </h2>
                                <span className="text-sm text-text-muted">
                                    {formatChangeDate(entry.date)}{i === 0 ? " · Latest" : ""}
                                </span>
                            </div>
                            <ul className="mt-4 space-y-2">
                                {entry.changes.map(([kind, text]) => (
                                    <li key={text} className="flex items-start gap-3 text-base leading-6 text-text">
                                        <span className={`tag w-[92px] shrink-0 ${KIND_STYLE[kind]}`} data-testid="tag">
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
