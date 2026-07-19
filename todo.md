DON'T IMPLEMENT THESE TASKS, THIS FILE IS JUST FOR PERSONAL TRACKING: 
- Quantum safe encryption: Implement on application layer? Or is there any other TLS upgrade/infra required? Lock sign on chats and stuff when active, settings page/icon to enable this stuff. 
- Voice agent/ gemini API integration? Grok api check . Jarvis themed agent if possible, seamless integration, siri style visual, tools exposed for ALL website functionality which voice agent can control?  OR TALK TO DHRUV FEATURE? 
- Any 3d elements? 
- Authorized API endpoints to possible change content without redeployments? Or private github repo as source of truth for this stuff, with fallbacks? 
- Rust port of some components for faster stuff? 
- UI redesign for components 
- Background sprites movement
- Idea: My own talking sprite which can click stuff of website with hands 
= Idea: Video call on website with gemini live api 
- ADD A RIGHT CLICK !!!!!!!!!!
- SPEED UP DEPLOYMENTS, USE BUN, TS7

Next:
- Tech stack upgrade? TS 7 builds 
- Private github repo for feedback, comments, matrix notes etc. 
- CHANGE TO POCKET TTS, deploy backend on server, use cloudflare for everything else
- Cloudflare worker based deployments? 
- Check groq deprecation 
- Check agent experience to reduce bloat while still keeping highly purposeful 
- Fix page flip animations: Too fast and not fluid enough so doesn't seem like a page flip, may conflict with entry animations of other components on the page. The MARGIN is on the left, so all pages should flip around the left side, for forward flip the current page should flip out to left, for backward flip the previous page should flip in from left in a fluid way, currently the pages flip around both left and right axes ocasionally. Think hard, go deep and MAKE SURE THE PAGE FLIP ANIMATION BECOMES FULLY PRODUCTION GRADE
- Add social bar on mobile to auto disapper ( collapse down with ANIMATION after a certain time without user action), but should reappear when user scrolls down. This is a common pattern in other software, read about it and implement correctly 

Possible Done: 
- FIX REGRESSION, PROJECTS PAGE MODAL NOT OPENING 
- Fix NOT ALLOWED ON MIC on chat page
- Implement page flip animation, SHOULD BE VERY PERFORMANT, SHOULD NOT INCREASE BUNDLE SIZE MUCH 
- SETTINGS PAGE: PORT ALL SETTINGS HERE, IF USER SELECTS ENABLE EXPERIMENTAL, SHOULD REDIRECT TO STAGING FROM PROD, STICKER TOAST SETTINGS, REDUCE MOTION SETTINGS, ANIMATION SETTINGS, ANY OTHER USEFUL SETTINGS