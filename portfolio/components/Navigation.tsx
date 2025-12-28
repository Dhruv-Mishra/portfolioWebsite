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
    ];

    return (
        <nav className="fixed top-6 right-8 md:right-12 z-50 flex gap-6 text-xl md:text-2xl font-hand font-bold text-gray-600 rotate-1">
            {links.map((item) => (
                <Link key={item.name} href={item.href} legacyBehavior={false} passHref>
                    <motion.span
                        whileHover={{ scale: 1.1, rotate: -2, color: "#4f46e5" }}
                        className={cn(
                            "cursor-pointer inline-block transition-colors decoration-wavy decoration-2 hover:decoration-indigo-500",
                            pathname === item.href ? "text-indigo-700 underline decoration-indigo-500" : "decoration-transparent"
                        )}
                    >
                        {item.name}
                    </motion.span>
                </Link>
            ))}
        </nav>
    );
}
