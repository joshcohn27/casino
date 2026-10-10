import { useContext } from "react";
import { formatMoney } from "./money";
import { SessionContext, TableContext } from "./sessionContext";

// The session read-out in the top left of every table: hands played, average bet, and the
// net result. A table you have not played yet this session shows zeros.
export default function SessionBadge() {
    const session = useContext(SessionContext)?.session;
    const table = useContext(TableContext);
    if (!session || !table) return null;

    const mine = session.gameId === table.id;
    const hands = mine ? session.hands : 0;
    const average = hands > 0 ? session.wagered / hands : 0;
    const net = mine ? session.net : 0;
    const netColor = net > 0 ? "text-emerald-300" : net < 0 ? "text-red-300" : "text-white";

    return (
        <div
            data-testid="session"
            data-hands={hands}
            data-average={average.toFixed(2)}
            data-net={net.toFixed(2)}
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-b border-line bg-ink px-3 py-1 text-[12px] text-text-muted lg:absolute lg:left-3 lg:top-2 lg:z-10 lg:rounded-[4px] lg:border"
        >
            <span className="font-bold text-white">Session</span>
            <span>Hands <span className="font-bold text-white">{hands}</span></span>
            <span>Avg bet <span className="font-bold text-white">{formatMoney(average)}</span></span>
            <span>Net <span className={`font-bold ${netColor}`}>{net > 0 ? "+" : ""}{formatMoney(net)}</span></span>
        </div>
    );
}
