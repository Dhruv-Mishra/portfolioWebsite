import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resume | Dhruv Mishra",
  description:
    "View or download Dhruv Mishra's resume — Software Engineer at Microsoft with expertise in C++, C#, Android, and distributed systems.",
  alternates: { canonical: "/resume" },
  openGraph: {
    title: "Resume | Dhruv Mishra",
    description:
      "Software Engineer at Microsoft. C++, C#, Kotlin, Python, TypeScript. IIIT-Delhi CSAM Honours.",
    url: "https://whoisdhruv.com/resume",
  },
};

export default function ResumeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
