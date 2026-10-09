import { useState } from "react";
import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE_ID = "service_el7cq78";
const EMAILJS_TEMPLATE_ID = "template_uwbifke";
const EMAILJS_PUBLIC_KEY = "A3nD7GQpC0z1yCokT";

type FeedbackProps = {
    onBack: () => void;
};

export default function Feedback({ onBack }: FeedbackProps) {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        type: "General feedback",
        page: "Casino site",
        message: "",
        replyWanted: false,
    });

    const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [emailTouched, setEmailTouched] = useState(false);

    function handleChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) {
        const target = e.target as HTMLInputElement;
        const { name, value, type } = target;

        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? target.checked : value,
        }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!formData.message.trim()) {
            setStatus("error");
            setErrorMessage("Please enter your feedback.");
            return;
        }

        setStatus("sending");
        setErrorMessage("");

        try {
            await emailjs.send(
                EMAILJS_SERVICE_ID,
                EMAILJS_TEMPLATE_ID,
                {
                    name: formData.name || "Anonymous",
                    email: formData.email || "Not provided",
                    type: formData.type,
                    page: formData.page,
                    message: formData.message,
                    replyWanted: formData.replyWanted ? "Yes" : "No",
                    submittedAt: new Date().toLocaleString(),
                },
                {
                    publicKey: EMAILJS_PUBLIC_KEY,
                }
            );

            setStatus("success");
            setEmailTouched(false);
            setFormData({
                name: "",
                email: "",
                type: "General feedback",
                page: "Casino site",
                message: "",
                replyWanted: false,
            });
        } catch {
            setStatus("error");
            setErrorMessage("Something went wrong sending your feedback.");
        }
    }

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);

    return (
        <div
            className="min-h-screen w-full bg-room text-room-text"
        >
            <div className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
                {/* Page header */}
                <div className="mb-6 border-b border-room-line pb-4">
                    <h1 className="text-room-text">
                        Feedback
                    </h1>
                    <p className="mt-2 text-base font-semibold text-room-text">
                        Bugs, suggestions and new games
                    </p>
                    <p className="mt-2 max-w-[56ch] text-base leading-6 text-room-muted">
                        Found something broken, want a game added, or think something could feel better? Let me know.
                    </p>
                    <div className="mt-6">
                        <button
                            onClick={onBack}
                            className="rounded-[4px] border-2 px-4 py-2.5 text-sm font-bold transition-colors border-room-line bg-room-deep text-room-text hover:bg-room-raised active:bg-room-panel"
                        >
                            Back to Casino
                        </button>
                    </div>
                </div>

                {/* Form card */}
                <div className="rounded-[4px] border border-room-line bg-room-panel p-6">
                    {status === "success" ? (
                        <div className="rounded-[4px] border border-room-line bg-room-deep p-6">
                            <h2 className="text-room-text">Feedback sent</h2>
                            <p className="mt-3 max-w-[56ch] text-room-muted">
                                Thanks — I got it. This helps improve the site.
                            </p>

                            <div className="mt-6">
                                <button
                                    onClick={() => setStatus("idle")}
                                    className="rounded-[4px] border-2 px-5 py-2.5 text-sm font-bold transition-colors border-room-red-pressed bg-room-red text-room-text hover:bg-room-red-hover active:bg-room-red-pressed"
                                >
                                    Send Another
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="grid gap-5">
                            <div className="grid gap-5 md:grid-cols-2">
                                <label className="grid gap-2">
                                    <span className="text-sm font-bold text-room-muted">Name / nickname</span>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="Optional"
                                        className="rounded-[4px] border border-room-line bg-room-deep px-4 py-3 text-room-text outline-none placeholder:text-room-text/75 transition focus:border-room-accent"
                                    />
                                </label>

                                <label className="grid gap-2">
                                    <span className="text-sm font-bold text-room-muted">Email</span>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        onBlur={() => setEmailTouched(true)}
                                        placeholder="Optional"
                                        className="rounded-[4px] border border-room-line bg-room-deep px-4 py-3 text-room-text outline-none placeholder:text-room-text/75 transition focus:border-room-accent"
                                    />
                                    {emailTouched && formData.email && !emailValid && (
                                        <span className="text-[11px] text-red-400/80">Please enter a valid email (e.g. name@example.com)</span>
                                    )}
                                </label>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                                <label className="grid gap-2">
                                    <span className="text-sm font-bold text-room-muted">Type</span>
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                        className="rounded-[4px] border border-room-line bg-room-deep px-4 py-3 text-room-text outline-none transition focus:border-room-accent"
                                    >
                                        <option className="bg-room-deep">General feedback</option>
                                        <option className="bg-room-deep">Bug report</option>
                                        <option className="bg-room-deep">Game balance suggestion</option>
                                        <option className="bg-room-deep">UI / animation feedback</option>
                                        <option className="bg-room-deep">New game request</option>
                                    </select>
                                </label>

                                <label className="grid gap-2">
                                    <span className="text-sm font-bold text-room-muted">Game / page</span>
                                    <select
                                        name="page"
                                        value={formData.page}
                                        onChange={handleChange}
                                        className="rounded-[4px] border border-room-line bg-room-deep px-4 py-3 text-room-text outline-none transition focus:border-room-accent"
                                    >
                                        <option className="bg-room-deep">Casino site</option>
                                        <option className="bg-room-deep">Ultimate Texas Hold'em</option>
                                        <option className="bg-room-deep">Blackjack</option>
                                        <option className="bg-room-deep">Free Bet Blackjack</option>
                                        <option className="bg-room-deep">Double Down Madness</option>
                                        <option className="bg-room-deep">Pai Gow Poker</option>
                                        <option className="bg-room-deep">Three Card Poker</option>
                                        <option className="bg-room-deep">Mississippi Stud</option>
                                        <option className="bg-room-deep">Baccarat</option>
                                        <option className="bg-room-deep">Roulette</option>
                                        <option className="bg-room-deep">Video Poker</option>
                                        <option className="bg-room-deep">Other</option>
                                    </select>
                                </label>
                            </div>

                            <label className="grid gap-2">
                                <span className="text-sm font-bold text-room-muted">Feedback</span>
                                <textarea
                                    name="message"
                                    value={formData.message}
                                    onChange={handleChange}
                                    rows={8}
                                    placeholder="What should I fix, improve, or add?"
                                    className="min-h-[180px] rounded-[4px] border border-room-line bg-room-deep px-4 py-3 text-room-text outline-none placeholder:text-room-text/75 transition focus:border-room-accent"
                                />
                            </label>

                            <div className="flex flex-col gap-1.5">
                                <label className={`flex items-center gap-3 text-sm ${emailValid ? "text-room-muted" : "cursor-not-allowed text-room-text/75"}`}>
                                    <input
                                        type="checkbox"
                                        name="replyWanted"
                                        checked={formData.replyWanted}
                                        onChange={handleChange}
                                        disabled={!emailValid}
                                        className="h-4 w-4 accent-room-accent disabled:cursor-not-allowed"
                                    />
                                    I'd like a reply if I left my email
                                </label>
                                {!emailValid && (
                                    <p className="pl-7 text-[11px] text-room-text/75">Enter a valid email address above to enable this option.</p>
                                )}
                            </div>

                            {status === "error" ? (
                                <div className="rounded-[4px] border border-red-400/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
                                    {errorMessage}
                                </div>
                            ) : null}

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={status === "sending"}
                                    className="rounded-[4px] border-2 px-5 py-2.5 text-sm font-bold transition-colors border-room-red-pressed bg-room-red text-room-text hover:bg-room-red-hover active:bg-room-red-pressed disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {status === "sending" ? "Sending..." : "Send Feedback"}
                                </button>

                                <button
                                    type="button"
                                    onClick={onBack}
                                    className="rounded-[4px] border-2 px-4 py-2.5 text-sm font-bold transition-colors border-room-line bg-room-deep text-room-text hover:bg-room-raised active:bg-room-panel"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
