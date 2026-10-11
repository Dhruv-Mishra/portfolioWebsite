---
id: project-invoke
tags: [invoke, invoke voice, voice assistant, voice controlled, coding agents, github copilot cli, copilot cli, agency, git worktree, worktrees, electron, node.js, python, llama.cpp, local llm, gemma, qwen, parakeet, kokoro, whisper, speech to text, text to speech, speculative decoding, mcp, windows]
priority: 10
category: projects
slug: invoke
---

Invoke is an open-source Windows voice assistant I built for running coding agents by voice. It answers simple requests itself and hands bigger coding and research tasks to GitHub Copilot CLI agents, each coding task in its own Git worktree, so several can run in parallel without stepping on each other. Speech-to-text, the language model, and text-to-speech can all run locally: NVIDIA Parakeet for speech recognition, quantized Gemma or Qwen models on llama.cpp, and Kokoro for speech. Speculative decoding with a draft model plus thread tuning made local generation 35% faster, and a benchmark harness I wrote picked a speech model with 57% fewer errors than Whisper Small at 5x the speed. It also keeps tasks, follow-ups, notifications, and files in one place, and ships as a Windows installer with an in-app updater. Stack: Electron, Node.js, Python, llama.cpp, MCP. Year: 2026, ongoing. Repo: github.com/Dhruv-Mishra/Invoke-Voice.
