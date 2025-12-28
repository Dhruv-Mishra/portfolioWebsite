"use client";
import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function Navigation() {
    const pathname = usePathname();

    const links = [
        { name: 'Home', href: '/' },
        { name: 'Projects', href: '/projects' },
        { name: 'About', href: '/about' },
        { name: 'Resume', href: '/resume' },
    ];

    return (
        <nav className="fixed top-0 right-12 z-50 flex gap-4 perspective-[500px]">
            {links.map((item, i) => {
                const colors = [
                    "bg-[#ff9b9b] text-red-900 border-red-300", // Pink
                    "bg-[#fff9c4] text-yellow-900 border-yellow-300", // Yellow
                    "bg-[#c5e1a5] text-green-900 border-green-300", // Green
                    "bg-[#b3e5fc] text-blue-900 border-blue-300"    // Blue for Resume
                ];
                const active = pathname === item.href;
                const isExternal = item.name === 'Resume';

                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        legacyBehavior={false}
                        passHref
                    >
                        <motion.div
                            // Start way up hidden (-80), animate to visible state (-40 inactive, -30 active)
                            // The large negative values + large padding ensures top edge is never seen
                            initial={{ y: -100 }}
                            animate={{ y: active ? -30 : -45 }}
                            whileHover={{ y: -25 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className={cn(
                                "cursor-pointer pt-16 pb-4 px-5 rounded-b-lg shadow-md border-x-2 border-b-2 font-hand font-bold text-lg md:text-xl tracking-wide",
                                colors[i % 4], // Cycle colors (mod 4 now)
                                active ? "z-20 scale-110 shadow-lg" : "z-10 opacity-90 hover:opacity-100"
                            )}
                            style={{
                                clipPath: 'polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)' // Slightly steeper taper
                            }}
                        >
                            {item.name}
                        </motion.div>
                    </Link>
                );
            })}
        </nav>
    );

}
