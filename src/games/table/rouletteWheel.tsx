import { useEffect, useLayoutEffect, useRef } from "react";

// The roulette wheel, drawn like a real one: a wooden rim, an ivory ball track with deflector
// diamonds, the number ring with metal frets between the pockets, and a cone with a turret in
// the middle. On a spin the wheel turns one way and the white ball rides the track the other,
// slows, drops, and settles in the winning pocket, then rides round with the wheel.

export type WheelNumber = number | "0" | "00";
type Color = "red" | "black" | "green";

const C = 200;                 // centre of the 400 by 400 drawing
const RIM_OUT = 198, RIM_IN = 186;
const TRACK_OUT = 186, TRACK_IN = 164;
const NUM_OUT = 164, NUM_IN = 138;
const POCKET_OUT = 138, POCKET_IN = 112;
const CONE = 112;
const BALL_TRACK_R = 175;      // where the ball rides before it drops
const BALL_POCKET_R = 125;     // where it sits in a pocket

const FILL: Record<Color, string> = { red: "#b3171d", black: "#141414", green: "#0f7a3b" };
const POCKET_FILL: Record<Color, string> = { red: "#8f1217", black: "#0b0b0b", green: "#0b5e2d" };

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => ({ x: C + r * Math.cos(rad(deg)), y: C + r * Math.sin(rad(deg)) });
function ring(rOut: number, rIn: number, a0: number, a1: number) {
    const o0 = pt(rOut, a0), o1 = pt(rOut, a1), i1 = pt(rIn, a1), i0 = pt(rIn, a0);
    return `M${o0.x},${o0.y} A${rOut},${rOut} 0 0 1 ${o1.x},${o1.y} L${i1.x},${i1.y} A${rIn},${rIn} 0 0 0 ${i0.x},${i0.y}Z`;
}
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const easeInQuad = (t: number) => t * t;
const mod = (a: number, m: number) => ((a % m) + m) % m;

export function RouletteWheel({ order, colorOf, spin, durationMs, winnerIdx, size }: {
    order: WheelNumber[];
    colorOf: (n: WheelNumber) => Color;
    /** a new id starts a spin that ends on pocket winIdx */
    spin: { id: number; winIdx: number } | null;
    durationMs: number;
    /** the pocket to light up while the wheel is at rest, or null */
    winnerIdx: number | null;
    size: string;
}) {
    const slice = 360 / order.length;
    const centre = (i: number) => i * slice + slice / 2;

    const head = useRef<SVGGElement>(null);
    const ball = useRef<SVGGElement>(null);
    // where everything is now: wheel turn, ball angle (on the page), ball radius
    const now = useRef({ w: 0, b: 180, r: BALL_TRACK_R, shown: false });
    const frame = useRef(0);

    const draw = () => {
        const s = now.current;
        head.current?.setAttribute("transform", `rotate(${s.w} ${C} ${C})`);
        ball.current?.setAttribute("transform", `rotate(${s.b} ${C} ${C}) translate(0 ${-s.r})`);
        ball.current?.setAttribute("opacity", s.shown ? "1" : "0");
    };
    // React never sets these transforms itself, so every render puts them back where they were
    useLayoutEffect(draw);

    useEffect(() => {
        if (!spin) return;
        const T = durationMs, tDrop = 0.55 * T, tLand = 0.8 * T;
        const w0 = now.current.w, b0 = now.current.b;
        const turn = 360 * 3 + Math.random() * 360;
        const wheelAt = (t: number) => w0 + turn * easeOutCubic(Math.min(1, t / T));
        // the ball travels the other way and lands exactly where the winning pocket is by then
        const pocketAtLand = wheelAt(tLand) + centre(spin.winIdx);
        const travel = 360 * 5 + mod(b0 - pocketAtLand, 360);
        const start = performance.now();
        now.current.shown = true;
        const step = (time: number) => {
            const t = time - start;
            const s = now.current;
            s.w = wheelAt(t);
            if (t < tLand) {
                s.b = b0 - travel * easeOutQuad(t / tLand);
                s.r = t < tDrop ? BALL_TRACK_R : BALL_TRACK_R - (BALL_TRACK_R - BALL_POCKET_R) * easeInQuad((t - tDrop) / (tLand - tDrop));
            } else {
                // in the pocket: rides with the wheel, with a small bounce that dies away
                const since = (t - tLand) / 1000;
                s.b = wheelAt(t) + centre(spin.winIdx);
                s.r = BALL_POCKET_R + 7 * Math.exp(-7 * since) * Math.abs(Math.sin(since * 22));
            }
            draw();
            if (t < T) frame.current = requestAnimationFrame(step);
            else { s.w = mod(wheelAt(T), 360); s.b = mod(s.w + centre(spin.winIdx), 360); s.r = BALL_POCKET_R; draw(); }
        };
        frame.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spin?.id]);

    // eight deflector diamonds on the track
    const diamonds = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);

    return (
        <svg viewBox="0 0 400 400" className={size} role="img" aria-label="Roulette wheel" data-testid="wheel">
            <defs>
                <radialGradient id="rwRim" cx="50%" cy="50%" r="50%">
                    <stop offset="88%" stopColor="#3b1d0c" />
                    <stop offset="96%" stopColor="#6b3a1a" />
                    <stop offset="100%" stopColor="#2a1408" />
                </radialGradient>
                <radialGradient id="rwTrack" cx="50%" cy="45%" r="50%">
                    <stop offset="80%" stopColor="#efe5cf" />
                    <stop offset="100%" stopColor="#c8b58f" />
                </radialGradient>
                <radialGradient id="rwCone" cx="45%" cy="40%" r="60%">
                    <stop offset="0%" stopColor="#a8683a" />
                    <stop offset="70%" stopColor="#6e3d1d" />
                    <stop offset="100%" stopColor="#4a2711" />
                </radialGradient>
                <radialGradient id="rwChrome" cx="40%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="55%" stopColor="#c9ccd2" />
                    <stop offset="100%" stopColor="#7d828c" />
                </radialGradient>
                <radialGradient id="rwBall" cx="38%" cy="34%" r="70%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="70%" stopColor="#ecebe7" />
                    <stop offset="100%" stopColor="#b9b6ae" />
                </radialGradient>
            </defs>

            {/* the parts that stay still: rim and ball track */}
            <circle cx={C} cy={C} r={RIM_OUT} fill="url(#rwRim)" />
            <circle cx={C} cy={C} r={RIM_IN} fill="url(#rwTrack)" />
            <circle cx={C} cy={C} r={TRACK_IN} fill="#2a1408" />
            {diamonds.map((a) => {
                const p = pt((TRACK_OUT + TRACK_IN) / 2 - 2, a);
                return <rect key={a} x={p.x - 4} y={p.y - 4} width={8} height={8} fill="url(#rwChrome)" stroke="#8a8f98" strokeWidth={0.6} transform={`rotate(${a + 45} ${p.x} ${p.y})`} />;
            })}

            {/* the turning head: numbers, pockets, frets, cone and turret */}
            <g ref={head}>
                {order.map((n, i) => {
                    const a0 = i * slice, a1 = (i + 1) * slice, col = colorOf(n);
                    const tp = pt((NUM_OUT + NUM_IN) / 2, centre(i));
                    return (
                        <g key={`${n}-${i}`}>
                            <path d={ring(NUM_OUT, NUM_IN, a0, a1)} fill={FILL[col]} />
                            <path d={ring(POCKET_OUT, POCKET_IN, a0, a1)} fill={POCKET_FILL[col]} />
                            <text x={tp.x} y={tp.y} fill="#ffffff" fontSize="15" fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${centre(i)} ${tp.x} ${tp.y})`}>{n}</text>
                        </g>
                    );
                })}
                {/* frets: thin metal walls between the pockets */}
                {order.map((_, i) => {
                    const p0 = pt(POCKET_IN, i * slice), p1 = pt(NUM_OUT, i * slice);
                    return <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#d9dce1" strokeWidth={1.2} />;
                })}
                <circle cx={C} cy={C} r={NUM_OUT} fill="none" stroke="#d9dce1" strokeWidth={1.5} />
                <circle cx={C} cy={C} r={NUM_IN} fill="none" stroke="#d9dce1" strokeWidth={1.2} />
                {/* the winning pocket, lit while the wheel is at rest */}
                {winnerIdx !== null && (
                    <path d={ring(NUM_OUT, POCKET_IN, winnerIdx * slice, (winnerIdx + 1) * slice)} fill="none" stroke="#fbbf24" strokeWidth={3} />
                )}
                <circle cx={C} cy={C} r={CONE} fill="url(#rwCone)" stroke="#d9dce1" strokeWidth={1.5} />
                <circle cx={C} cy={C} r={CONE - 34} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={2} />
                {/* turret: a chrome cross with knobs */}
                {[0, 90, 180, 270].map((a) => {
                    const end = pt(46, a);
                    return (
                        <g key={a}>
                            <line x1={C} y1={C} x2={end.x} y2={end.y} stroke="#c9ccd2" strokeWidth={7} strokeLinecap="round" />
                            <circle cx={end.x} cy={end.y} r={7} fill="url(#rwChrome)" />
                        </g>
                    );
                })}
                <circle cx={C} cy={C} r={16} fill="url(#rwChrome)" stroke="#8a8f98" strokeWidth={1} />
            </g>

            {/* the ball */}
            <g ref={ball} opacity={0}>
                <circle cx={C} cy={C} r={8} fill="url(#rwBall)" stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
            </g>
        </svg>
    );
}
