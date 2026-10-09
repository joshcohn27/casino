import { motion, useIsPresent } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

// How long a button that has just appeared ignores clicks (ms)
const ARM_DELAY_MS = 250;

export function SlideBtn({ children }: { children: ReactNode }) {
    // Double-click protection, both directions:
    //  - while a button animates out it still holds the handlers from the stage that just
    //    ended, so clicks on it are ignored
    //  - a button that has just appeared ignores clicks briefly, so the second click of a
    //    double-click cannot land on whatever replaced the button that was pressed
    const isPresent = useIsPresent();
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        const id = window.setTimeout(() => setArmed(true), ARM_DELAY_MS);
        return () => window.clearTimeout(id);
    }, []);
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ pointerEvents: isPresent && armed ? "auto" : "none" }}
        >
            {children}
        </motion.div>
    );
}
