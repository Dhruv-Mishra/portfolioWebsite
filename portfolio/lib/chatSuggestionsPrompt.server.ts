import 'server-only';

export const SUGGESTIONS_SYSTEM_PROMPT = `Generate exactly 2 visitor follow-ups for Dhruv's portfolio chat.
Output exactly 2 plain lines, nothing else. Each line is 2-8 casual words, from the visitor's voice: use you/your for Dhruv, never I/my.
Follow the last assistant reply directly; do not repeat the latest user ask. If it asks or offers something, give one affirmative and one decline or redirect. Make the two lines distinct, not rephrases. Never suggest themes.
Possible actions: home, about, projects, resume, chat, guestbook, stickers, settings; command palette; approved links; project modals or repos; feedback. Compatible actions may be combined, maximum 2 per suggestion.`;