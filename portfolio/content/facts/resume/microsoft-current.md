---
id: resume-microsoft-current
tags: [microsoft, ai agents, llm agents, incident triage, on-call, mcp, tool calling, kusto, azure, service fabric, redis, cosmos db, vm scale sets, autoscaling, cost savings, office for the web, pdf encryption, sandboxing, rms, ipc, office android, wxp, excel, compose shimmer, baseline profiles, fluent ui android, security compliance, hackathon, shell assistant, wxp actionease, ai champ]
priority: 10
category: resume
---

Software Engineer at Microsoft (June 2024 to present, Noida, India). I build production AI agents and the Azure backend services they run on. Highlights from the current role:

- Built and shipped LLM incident-triage agents for on-call engineers. MCP servers give the agent Kusto, service-health, and config tools through structured tool calls, with fallback logic and escalation to a human. They cut manual triage of low and mid-severity incidents by 40%, measured by replaying resolved incidents with known mitigations and confirmed by developer usage.
- Cut Azure spend by $240k a year (about 15%) on a Service Fabric backend that handles more than 7 billion requests a day. I raised the Redis cache hit ratio from 31% to 80%, tuned Cosmos DB and log retention, and retuned autoscaling across 12+ VM Scale Sets while staying within the 99.99% availability target. The savings were measured over three months of Geneva/Kusto telemetry.
- Shipped PDF encryption for Word, Excel, and PowerPoint in Office for the web by sandboxing a C++ encryption SDK. The native code no longer has direct network access, and its Azure Rights Management Service (RMS) calls go through a C# proxy over IPC.
- Cut Office Android cold-start and file-open latency by about 500ms with custom baseline profiles for Word, Excel, and PowerPoint, and brought Excel's loading-shimmer time down from 300ms to 3ms. Both were validated through staged-rollout telemetry.
- Primary maintainer of Fluent UI Android, Microsoft's open-source Jetpack Compose library. Shipped 10 releases used by Copilot, Office, Outlook, OneDrive, and Teams, and owned its security compliance.
- Won Most Voted at Microsoft Hackathon 2026 with "Shell Assistant", an incident-response agent, and the Fundamental Category at Microsoft Hackathon 2025 with "WXP ActionEase".
- AI Champ on the Microsoft AI Productivity team, where I run workshops on multi-agent engineering and LLM automation.
