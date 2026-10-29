---
id: project-port-solace
tags: [port solace, solace, voxel game, voxelgame, game, browser game, open world, three.js, threejs, webgl, webrtc, multiplayer, co-op, coop, heist, web workers, cloudflare workers, durable objects, game engine, graphics, streaming, lod, vercel]
priority: 10
category: projects
slug: port-solace
---

Port Solace is a voxel open-world game I built that runs entirely in the browser, set in a harbour city "where the lights never quite go out". Play it at port-solace.vercel.app. You pick a character, then walk, drive cars and motorbikes, fly planes, ride jet skis, take jobs, visit the zoo and a casino liner, and get into police chases. The story mission, "The Harbour Trust Job", is a co-op heist for two to four players with stealth, minigames such as lockpicking and keypads, voiced lines, and getaway chases. Co-op is peer-to-peer over WebRTC data channels with the host as session authority; a small Cloudflare Worker with a Durable Object per lobby only brokers the join, and players exchange compact binary snapshots, so the ambient world is never sent over the network. The engine is single-page three.js with a custom streaming system: a 0.25 m voxel city plus an outland four times its size, greedy meshing in Web Workers, dithered LOD cross-fades, a Catmull-Rom upscale pass with sharpening, and shader pre-warming so no shader program links during play. Per-frame code allocates nothing; measured wins include cutting garbage while walking from about 85 to 30 MB/s and the first six frames after a teleport from 120-300 ms to about 20 ms in total. Phones get touch controls and a lean shader. Stack: JavaScript, three.js, WebGL, WebRTC, Web Workers, Web Audio, Cloudflare Workers, Vercel. Year: 2026, ongoing. Repo: github.com/Dhruv-Mishra/VoxelGame.
