"use client";

import { motion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ease: "easeOut", duration: 0.3 }}
            className="h-full overflow-y-auto p-8 md:p-12 scrollbar-thin scrollbar-thumb-gray-300"
        >
            {children}
        </motion.div>
    );
}

