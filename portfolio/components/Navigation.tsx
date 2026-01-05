"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
    { name: 'Home', href: '/' },
    { name: 'Projects', href: '/projects' },
    { name: 'About', href: '/about' },
    { name: 'Resume', href: '/resume' },
];

const COLORS = [
    "bg-[#ff9b9b] text-red-900 border-red-300", // Pink
    "bg-[#fff9c4] text-yellow-900 border-yellow-300", // Yellow
    "bg-[#c5e1a5] text-green-900 border-green-300", // Green
    "bg-[#b3e5fc] text-blue-900 border-blue-300"    // Blue for Resume
];

export default function Navigation() {
    const pathname = usePathname();

    return (
        <nav 
            className="fixed top-0 left-0 w-full md:w-auto md:left-auto md:right-12 z-50 flex justify-center md:justify-end gap-2 md:gap-4 perspective-[500px]"
            aria-label="Main navigation"
            role="navigation"
        >
            {LINKS.map((item, i) => {
                const active = pathname === item.href;

                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        legacyBehavior={false}
                        passHref
                    >
                        {/* CSS-only animation for faster LCP - no framer-motion on initial load */}
                        <div
                            className={cn(
                                "cursor-pointer pt-12 md:pt-16 pb-3 md:pb-4 px-3 md:px-5 rounded-b-lg shadow-md border-x-2 border-b-2 font-hand font-bold text-sm md:text-xl tracking-wide",
                                "animate-nav-tab transition-transform duration-200 ease-out hover:-translate-y-5",
                                COLORS[i % COLORS.length],
                                active ? "z-20 scale-110 shadow-lg -translate-y-[5px]" : "z-10 opacity-90 hover:opacity-100 -translate-y-[25px]"
                            )}
                            style={{
                                clipPath: 'polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)', // Slightly steeper taper
                                animationDelay: `${i * 50}ms`
                            }}
                        >
                            {item.name}
                        </div>
                    </Link>
                );
            })}
        </nav>
    );
}
