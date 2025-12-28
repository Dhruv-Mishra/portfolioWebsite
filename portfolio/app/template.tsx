"use client";

import { motion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ rotateY: 90, opacity: 0, transformOrigin: "left" }}
            animate={{ rotateY: 0, opacity: 1, transformOrigin: "left" }}
            exit={{ rotateY: -90, opacity: 0, transformOrigin: "left" }}
            transition={{ ease: "easeInOut", duration: 0.6 }}
            className="h-full overflow-y-auto p-8 md:p-12 scrollbar-thin scrollbar-thumb-gray-300"
            style={{ perspective: "1000px" }}
        >
            {children}
        </motion.div>
    );
}
