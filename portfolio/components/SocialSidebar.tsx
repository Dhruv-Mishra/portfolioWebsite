"use client";

import { motion } from "framer-motion";
import { Github, Linkedin, Mail, Phone, BarChart2, Trophy } from "lucide-react";

const SOCIALS = [
    {
        name: "GitHub",
        icon: Github,
        url: "https://github.com/Dhruv-Mishra",
        color: "hover:text-gray-800"
    },
    {
        name: "LinkedIn",
        icon: Linkedin,
        url: "https://www.linkedin.com/in/dhruv-mishra-id/",
        color: "hover:text-blue-700"
    },
    {
        name: "Codeforces",
        icon: BarChart2,
        url: "https://codeforces.com/profile/DhruvMishra",
        color: "hover:text-yellow-600"
    },
    {
        name: "CP History",
        icon: Trophy,
        url: "https://zibada.guru/gcj/profile/Dhruv985",
        color: "hover:text-amber-500"
    },
    {
        name: "Email",
        icon: Mail,
        url: "mailto:dhruvmishra.id@gmail.com",
        color: "hover:text-red-600"
    },
    {
        name: "Phone",
        icon: Phone,
        url: "tel:+919599377944",
        color: "hover:text-green-600"
    }
];

export default function SocialSidebar() {
    return (
        <div 
            className="hidden md:flex fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 flex-col gap-6"
            role="complementary"
            aria-label="Social media links"
        >
            {SOCIALS.map((social, i) => (
                <motion.a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
                    whileHover={{ scale: 1.2, rotate: [3, -4, 2, -3, 4, -2][i % 6] }}
                    className={`text-gray-400 transition-colors duration-300 ${social.color} relative group`}
                    title={social.name}
                >
                    {/* Sketchy Circle Background on Hover */}
                    <div className="absolute inset-0 bg-gray-200/50 rounded-full scale-0 group-hover:scale-150 transition-transform -z-10 blur-sm" />

                    <social.icon size={24} strokeWidth={2.5} className="md:w-7 md:h-7" />

                    {/* Tooltip Label (Handwritten) */}
                    <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 text-sm font-hand font-bold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none bg-white/80 px-2 py-1 rounded shadow-sm">
                        {social.name}
                    </span>
                </motion.a>
            ))}

            {/* Vertical Line Connecting them (optional, makes it look like a list) */}
            <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-gray-300 -z-20 -translate-x-1/2 hidden md:block opacity-30 mask-gradient" />
        </div>
    );
}
