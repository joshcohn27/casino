import { Link } from "react-router";
import { BTN_BASE } from "./shared/money";

export default function NotFound() {
    return (
        <div className="min-h-[calc(100vh-88px)] bg-room px-4 py-8 text-room-text sm:px-6" data-testid="not-found">
            <div className="mx-auto max-w-3xl border-b border-room-line pb-6 text-center">
                <h1 className="text-room-text">Page not found</h1>
                <p className="mx-auto mt-2 max-w-[56ch] text-base leading-6 text-room-muted">
                    There is no page at this address. It may have moved, or the link may be mistyped.
                </p>
                <div className="mt-6">
                    <Link
                        to="/"
                        className={`inline-block ${BTN_BASE} border-room-red-pressed bg-room-red text-room-text hover:bg-room-red-hover active:bg-room-red-pressed`}
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
