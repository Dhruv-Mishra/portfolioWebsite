import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects | Dhruv Mishra",
  description:
    "Explore Dhruv Mishra's projects — from Microsoft Fluent UI Android to computer-vision health kiosks, recommendation engines, and more.",
  alternates: { canonical: "/projects" },
  openGraph: {
    title: "Projects | Dhruv Mishra",
    description:
      "Open-source contributions, Android libraries, full-stack apps, and systems projects by Dhruv Mishra.",
    url: "https://whoisdhruv.com/projects",
  },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
