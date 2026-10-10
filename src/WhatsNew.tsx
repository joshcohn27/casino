import { CHANGELOG, VERSION, formatChangeDate, type ChangeKind } from "./changelog";
import { BTN_BASE } from "./shared/money";

type Props = { onBack: () => void };

const KIND_LABEL: Record<ChangeKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
// the left edge of the tag tells the kinds apart: red, white, gray
const KIND_STYLE: Record<ChangeKind, string> = { new: "border-l-room-accent", improved: "border-l-room-text", fixed: "border-l-room-line-hover" };
const BTN_PLAIN = `${BTN_BASE} border-room-line bg-room-deep text-room-text hover:bg-room-raised active:bg-room-panel`;

export default function WhatsNew({ onBack }: Props) {
    return (
        <div className="min-h-[calc(100vh-88px)] bg-room px-4 py-8 text-room-text sm:px-6">
            <div className="mx-auto max-w-3xl">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-room-line pb-4">
                    <div>
                        <h1 className="text-room-text">What&apos;s New</h1>
                        <p className="mt-2 text-base text-room-muted">
                            Every update to Cohn Casino, newest first. You are on version{" "}
                            <span className="font-bold text-room-text">{VERSION}</span>.
                        </p>
                    </div>
                    <button className={BTN_PLAIN} onClick={onBack}>Back</button>
                </div>

                <div className="space-y-4">
                    {CHANGELOG.map((entry, i) => (
                        <section
                            key={entry.version}
                            data-version={entry.version}
                            data-testid="release-card"
                            className={`rounded-[4px] border bg-room-panel p-4 ${i === 0 ? "border-room-line border-l-4 border-l-room-accent" : "border-room-line"}`}
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <h2 className="text-room-text">
                                    <span className={`mr-3 ${"text-room-text"}`}>{entry.version}</span>
                                    {entry.title}
                                </h2>
                                <span className="text-sm text-room-muted">
                                    {formatChangeDate(entry.date)}{i === 0 ? " · Latest" : ""}
                                </span>
                            </div>
                            <ul className="mt-4 space-y-2">
                                {entry.changes.map(([kind, text]) => (
                                    <li key={text} className="flex items-start gap-3 text-base leading-6 text-room-text">
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
