# Dhruv's Sketchbook — [whoisdhruv.com](https://whoisdhruv.com)

A creative portfolio website with a hand-drawn sketchbook aesthetic, featuring an interactive terminal, AI chat, and project showcase.
<img width="1600" height="793" alt="Image" src="https://github.com/user-attachments/assets/c9af02b4-147f-4066-b56c-ee98e093b642" />
## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS 4 with CSS custom properties for theming
- **Animation:** Framer Motion 12

## Infrastructure

- **Multi-cloud deployment** across Azure, GCP, and Oracle Cloud VMs
- **Custom traffic manager** for request routing across instances
- **Cloudflare** for edge caching, CDN, and strict SSL
- **Nginx** reverse proxies on each VM
- **Parallel CI/CD** via GitHub Actions (matrix strategy deploys to all machines simultaneously)
- **systemd** managed Node.js services with per-machine deploy scripts

## Features

- 🎨 Sketchbook UI — graph-paper light mode, chalkboard dark mode, custom pencil/chalk cursor
- 💬 AI Chat — streaming LLM responses via Server-Sent Events with automatic fallback
- 🖥️ Interactive Terminal — persistent command history across page navigation
- 📁 Project Showcase — polaroid-style cards with tape effects and hand-drawn aesthetics
- 📄 Resume — embedded PDF viewer (desktop) / download card (mobile)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view locally.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
