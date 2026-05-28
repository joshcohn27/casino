import { motion } from "motion/react";
import type { ReactNode } from "react";

export function SlideBtn({ children }: { children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
        >
            {children}
        </motion.div>
    );
}
