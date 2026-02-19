import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat | Dhruv Mishra",
  description:
    "Chat with Dhruv — an AI-powered conversation about projects, experience, and tech. Ask anything!",
  alternates: { canonical: "/chat" },
  openGraph: {
    title: "Chat with Dhruv",
    description:
      "Have a conversation with an AI version of Dhruv Mishra. Ask about projects, experience, or tech.",
    url: "https://whoisdhruv.com/chat",
  },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
