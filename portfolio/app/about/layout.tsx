import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Dhruv Mishra",
  description:
    "Learn about Dhruv Mishra — Software Engineer at Microsoft on the M365 Shell Team, competitive programmer (Codeforces Expert), and IIIT-Delhi alumnus.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About | Dhruv Mishra",
    description:
      "Software Engineer at Microsoft building high-performance systems at 7B+ hits/day. Competitive programmer and open-source contributor.",
    url: "https://whoisdhruv.com/about",
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
