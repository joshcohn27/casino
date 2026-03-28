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
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#151d33,_#0a1020_42%,_#05070d_78%)] text-white">
            <div className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-4 pb-8 pt-8">
                <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/26 shadow-2xl backdrop-blur">
                    <div className="border-b border-white/10 bg-[radial-gradient(circle_at_left,_rgba(251,191,36,0.12),_transparent_38%)] px-6 py-6 md:px-8">
                        <div className="mb-4 inline-flex rounded-full border border-amber-200/18 bg-amber-300/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-amber-200">
                            Feedback Desk
                        </div>

                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h1 className="text-4xl font-extrabold leading-[1.02] tracking-[0.01em] text-white md:text-5xl">
                                    Tell me what should be better.
                                </h1>

                                <p className="mt-4 max-w-[60ch] text-base leading-7 text-white/72 md:text-lg">
                                    Found a bug, want a new game, or think something should feel smoother?
                                    Send feedback here and it goes straight to email.
                                </p>
                            </div>

                            <button
                                onClick={onBack}
                                className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/14"
                            >
                                Back to Casino
                            </button>
                        </div>
                    </div>

                    <div className="p-6 md:p-8">
                        {status === "success" ? (
                            <div className="rounded-[1.5rem] border border-emerald-400/30 bg-emerald-500/10 p-6">
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
                                        <span className="text-sm font-semibold text-white/86">Name / nickname</span>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            placeholder="Optional"
                                            className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-white outline-none placeholder:text-white/35"
                                        />
                                    </label>

                                    <label className="grid gap-2">
                                        <span className="text-sm font-semibold text-white/86">Email</span>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            placeholder="Optional"
                                            className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-white outline-none placeholder:text-white/35"
                                        />
                                    </label>
                                </div>

                                <div className="grid gap-5 md:grid-cols-2">
                                    <label className="grid gap-2">
                                        <span className="text-sm font-semibold text-white/86">Type</span>
                                        <select
                                            name="type"
                                            value={formData.type}
                                            onChange={handleChange}
                                            className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-white outline-none"
                                        >
                                            <option className="bg-slate-900">General feedback</option>
                                            <option className="bg-slate-900">Bug report</option>
                                            <option className="bg-slate-900">Game balance suggestion</option>
                                            <option className="bg-slate-900">UI / animation feedback</option>
                                            <option className="bg-slate-900">New game request</option>
                                        </select>
                                    </label>

                                    <label className="grid gap-2">
                                        <span className="text-sm font-semibold text-white/86">Game / page</span>
                                        <select
                                            name="page"
                                            value={formData.page}
                                            onChange={handleChange}
                                            className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-white outline-none"
                                        >
                                            <option className="bg-slate-900">Casino site</option>
                                            <option className="bg-slate-900">Ultimate Texas Hold'em</option>
                                            <option className="bg-slate-900">Blackjack</option>
                                            <option className="bg-slate-900">Free Bet Blackjack</option>
                                            <option className="bg-slate-900">Roulette</option>
                                            <option className="bg-slate-900">Baccarat</option>
                                            <option className="bg-slate-900">Jacks or Better</option>
                                            <option className="bg-slate-900">Other</option>
                                        </select>
                                    </label>
                                </div>

                                <label className="grid gap-2">
                                    <span className="text-sm font-semibold text-white/86">Feedback</span>
                                    <textarea
                                        name="message"
                                        value={formData.message}
                                        onChange={handleChange}
                                        rows={8}
                                        placeholder="What should I fix, improve, or add?"
                                        className="min-h-[190px] rounded-[1.5rem] border border-white/12 bg-white/8 px-4 py-3 text-white outline-none placeholder:text-white/35"
                                    />
                                </label>

                                <label className="flex items-center gap-3 text-sm text-white/82">
                                    <input
                                        type="checkbox"
                                        name="replyWanted"
                                        checked={formData.replyWanted}
                                        onChange={handleChange}
                                        className="h-4 w-4"
                                    />
                                    I’d like a reply if I left my email
                                </label>

                                {status === "error" ? (
                                    <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
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
        </div>
    );
}