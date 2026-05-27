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

    return (
        <div
            className="min-h-screen w-full text-white"
            style={{ background: "radial-gradient(circle at top, #0f1a0f, #050d05 50%, #020502 100%)" }}
        >
            <div className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-12">
                {/* Hero header */}
                <div className="mb-10 text-center">
                    <h1
                        className="text-5xl font-bold"
                        style={{
                            fontFamily: "Georgia, serif",
                            background: "linear-gradient(135deg, #f59e0b, #fbbf24, #d97706)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                        }}
                    >
                        Feedback
                    </h1>
                    <p className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
                        Bugs · Suggestions · New Games
                    </p>
                    <p className="mx-auto mt-4 max-w-[52ch] text-base leading-7 text-white/65">
                        Found something broken, want a game added, or think something could feel better? Let me know.
                    </p>
                    <div className="mt-6">
                        <button
                            onClick={onBack}
                            className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/14"
                        >
                            Back to Casino
                        </button>
                    </div>
                </div>

                {/* Form card */}
                <div className="rounded-[1.8rem] border border-white/10 bg-black/30 p-6 shadow-2xl backdrop-blur md:p-8">
                    {status === "success" ? (
                        <div className="rounded-[1.5rem] border border-emerald-400/25 bg-emerald-500/8 p-6">
                            <h2 className="text-2xl font-extrabold text-white">Feedback sent</h2>
                            <p className="mt-3 max-w-[56ch] text-white/78">
                                Thanks — I got it. This helps improve the site.
                            </p>

                            <div className="mt-6">
                                <button
                                    onClick={() => setStatus("idle")}
                                    className="rounded-full border border-amber-200 bg-amber-400 px-5 py-2.5 text-sm font-bold text-black shadow-lg"
                                >
                                    Send Another
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="grid gap-5">
                            <div className="grid gap-5 md:grid-cols-2">
                                <label className="grid gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Name / nickname</span>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="Optional"
                                        className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/25 transition focus:border-amber-300/30"
                                    />
                                </label>

                                <label className="grid gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Email</span>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="Optional"
                                        className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/25 transition focus:border-amber-300/30"
                                    />
                                </label>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                                <label className="grid gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Type</span>
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                        className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-amber-300/30"
                                    >
                                        <option className="bg-zinc-950">General feedback</option>
                                        <option className="bg-zinc-950">Bug report</option>
                                        <option className="bg-zinc-950">Game balance suggestion</option>
                                        <option className="bg-zinc-950">UI / animation feedback</option>
                                        <option className="bg-zinc-950">New game request</option>
                                    </select>
                                </label>

                                <label className="grid gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Game / page</span>
                                    <select
                                        name="page"
                                        value={formData.page}
                                        onChange={handleChange}
                                        className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-amber-300/30"
                                    >
                                        <option className="bg-zinc-950">Casino site</option>
                                        <option className="bg-zinc-950">Ultimate Texas Hold'em</option>
                                        <option className="bg-zinc-950">Blackjack</option>
                                        <option className="bg-zinc-950">Free Bet Blackjack</option>
                                        <option className="bg-zinc-950">Double Down Madness</option>
                                        <option className="bg-zinc-950">Roulette</option>
                                        <option className="bg-zinc-950">Baccarat</option>
                                        <option className="bg-zinc-950">Jacks or Better</option>
                                        <option className="bg-zinc-950">Pai Gow Poker</option>
                                        <option className="bg-zinc-950">Other</option>
                                    </select>
                                </label>
                            </div>

                            <label className="grid gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Feedback</span>
                                <textarea
                                    name="message"
                                    value={formData.message}
                                    onChange={handleChange}
                                    rows={8}
                                    placeholder="What should I fix, improve, or add?"
                                    className="min-h-[180px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/25 transition focus:border-amber-300/30"
                                />
                            </label>

                            <label className="flex items-center gap-3 text-sm text-white/65">
                                <input
                                    type="checkbox"
                                    name="replyWanted"
                                    checked={formData.replyWanted}
                                    onChange={handleChange}
                                    className="h-4 w-4"
                                />
                                I'd like a reply if I left my email
                            </label>

                            {status === "error" ? (
                                <div className="rounded-2xl border border-red-400/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
                                    {errorMessage}
                                </div>
                            ) : null}

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={status === "sending"}
                                    className="rounded-full border border-amber-200 bg-amber-400 px-5 py-2.5 text-sm font-bold text-black shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {status === "sending" ? "Sending..." : "Send Feedback"}
                                </button>

                                <button
                                    type="button"
                                    onClick={onBack}
                                    className="rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/14"
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
