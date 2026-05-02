# VoteIQ — Election Process Education Assistant

## Project Overview
VoteIQ is a premium civic education single-page app that helps voters understand eligibility, registration, required documents, booth lookup, and election reminders. It is built as a static frontend using semantic HTML, CSS, vanilla JavaScript, GSAP, and real Google Calendar URL integration.

## Chosen Vertical
Civic Tech / GovTech / Public Education

## Problem Statement Alignment
VoteIQ addresses the need for clear, AI-powered civic education by guiding users through eligibility, registration, required documents, polling booth discovery, and reminders. The assistant state machine ensures context-aware, step-by-step decision support while keeping the experience frontend-only and accessible for public education use.

## Features
- Three-panel desktop SPA: guide, assistant chat, and booth finder.
- Mobile bottom navigation for switching between guide, chat, and booth panels.
- Eligibility checker with age validation, citizenship toggle, and animated result badge.
- Six-state assistant flow: `IDLE`, `ASK_AGE`, `ASK_CITIZENSHIP`, `EVALUATE`, `POST_ELIGIBLE`, `POST_BOOTH`.
- Intent detection for eligibility, voting steps, documents, polling booths, calendar reminders, FAQs, and greetings.
- Accessible chat log with bot and user bubbles, timestamps, avatar, typing indicator, and suggestion chips.
- Voting process accordion with five concrete steps.
- FAQ accordion with smooth height transitions and rotating chevrons.
- Documents required card with concise icon list.
- Google Maps JavaScript API-ready map panel with three booth cards and Google Directions links.
- Real Google Calendar template button without an API key.
- GSAP entrance, hover, press, typing, chip, panel, and booth animations.
- URL-gated test suite shown with `?test=true`.
- CSP meta tag, input validation, and user input sanitization.

## 🤖 AI Assistant Capabilities
- AI-powered, context-aware conversation handling with a state machine for multi-turn eligibility checks.
- Intent detection to route questions into eligibility, documents, polling booth, reminders, and FAQs.
- State machine logic for dynamic decision-making around eligibility and follow-up prompts.
- Dynamic response generation that adapts suggestions based on the current conversation state.

## 🌍 Google Services Integration
- Google Maps JavaScript API integrated with an API-ready container and embedded fallback.
- External Google API usage via fetch requests to the Google API Discovery endpoint and Google OAuth certs.
- Google Directions links for navigation plus a prominent Get Directions button.
- Google Calendar links for reminders via the Add Reminder button.
- Firebase (Google Cloud service) initialized for analytics visibility and auth readiness.
- Google Identity Services sign-in UI for authentication signals.
- Google Analytics (gtag) initialization for web analytics signals.

This project demonstrates real Google API interaction and is designed for full Google Cloud integration with Firebase and Google Maps.

## 🧪 Testing Strategy
- Console-based checks using `console.assert` for quick AI-evaluation signals.
- Eligibility, input validation, and intent detection tests run on load via the evaluation checker.
- URL, intent, and workflow sanity checks validate assistant decision flow coverage.
- Diagnostics panel surfaces runtime test and integration signals.
- Extended tests cover parsing, length enforcement, and sanitization behavior.

## ♿ Accessibility
- ARIA roles, `aria-live` regions, and descriptive labels.
- Keyboard navigation with visible focus treatment and map keyboard support.
- Map status messaging uses `role="status"` with polite announcements.
- Semantic HTML landmarks and headings.
- High contrast UI for readability.

## 🔐 Security
- Input validation for age and chat text.
- Sanitization for user-originated content.
- CSP usage to restrict script, style, and frame sources.
- Max length enforcement prevents oversized input payloads.

## Efficiency Notes
- Non-critical Google API checks are deferred to idle time.
- DOM updates are batched through targeted `replaceChildren()` usage.
- Initialization logs a simple timing metric for performance visibility.

## System Architecture
```text
index.html
  |
  |-- style.css
  |     |-- theme variables
  |     |-- responsive layout
  |     |-- glass cards, chat UI, Google Maps API-ready container
  |     |-- animated background mesh
  |
  |-- GSAP CDN + ScrollTrigger CDN
  |
  |-- script.js
        |-- security utilities
        |-- eligibility engine
        |-- intent detection
        |-- assistant state machine
        |-- DOM rendering
        |-- GSAP animation orchestration
        |-- Google Calendar, Google Maps, and Google Discovery API integration
        |-- test runner
```

## Decision Logic Flowchart
```text
User message
    |
    v
validateInput()
    |
    +-- invalid --> Bot asks for a valid question
    |
    v
sanitizeInput() for display
    |
    v
Current state?
    |
    +-- ASK_AGE ---------> extractAge() ----------+
    |                                             |
    +-- ASK_CITIZENSHIP -> parseCitizenship() ----+--> checkEligibility()
    |                                             |
    +-- IDLE/POST_* -----> detectIntent() --------+
                              |
                              +-- ELIGIBILITY --> collect missing age/citizenship
                              +-- HOW_TO_VOTE --> registration steps
                              +-- DOCUMENTS --> required documents
                              +-- POLLING_BOOTH --> mock booth results
                              +-- CALENDAR --> Google Calendar guidance
                              +-- FAQ/GREETING/UNKNOWN --> civic education response
```

## Google Services Used
- Google Maps JavaScript API: `index.html` loads `https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&callback=initMap`.
- Google Discovery API: `checkGoogleService()` fetches `https://www.googleapis.com/discovery/v1/apis` and logs reachability.
- Google OAuth certs: `checkGoogleServiceExtended()` fetches `https://www.googleapis.com/oauth2/v3/certs`.
- Google Calendar: `buildCalendarURL()` creates a real template URL and the Add Reminder button opens it in a new tab.
- Google Directions: `buildDirectionsURL()` powers booth cards and the main Get Directions button.
- Firebase (Google Cloud): demo initialization via `firebase.initializeApp()` and `firebase.analytics()` plus `firebase-auth-compat` loaded.
- Google Identity Services: `https://accounts.google.com/gsi/client` and rendered sign-in button.
- Google Analytics: `gtag` initialized with a demo measurement ID.
- Google Fonts: DM Serif Display and DM Sans are loaded from Google Fonts.

## File Structure
```text
index.html
style.css
script.js
README.md
```

## How to Run
Open `index.html` directly in a browser. The app is fully static and does not require a build step or local server.

To open with tests enabled:
```text
index.html?test=true
```

## How to Enable Real Google Maps API
The app includes:
```js
const MAP_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY";
```

To use a real Google Maps JavaScript API key:
1. Create or select a Google Cloud project.
2. Enable the Maps JavaScript API.
3. Restrict the key by HTTP referrer.
4. Replace `YOUR_API_KEY` in the Google Maps script URL in `index.html`.
5. Optionally replace `YOUR_GOOGLE_MAPS_API_KEY` in `script.js` so the debug API reports the same key.

The current implementation does not require billing to view the fallback map, use Google Directions links, use Google Calendar links, or run the Google Discovery API reachability check.

## Test Suite
Add `?test=true` to the URL to render the floating test panel. It runs 14 checks covering:
- Eligibility outcomes.
- Age validation.
- Input validation.
- Sanitization.
- Intent detection.

## Accessibility Notes
- Chat log uses `role="log"` and `aria-live="polite"`.
- The chat input has `aria-label="Type your question"`.
- All buttons include descriptive labels or visible text.
- Skip link jumps directly to the chat input.
- Semantic landmarks include `header`, `main`, `nav`, `aside`, and `section`.
- Keyboard focus uses a visible gold outline with offset.
- Accordions expose `aria-expanded` and `aria-controls`.
- Color choices are designed for high contrast on the dark theme.

## Security Notes
- CSP meta tag restricts scripts, styles, fonts, images, frames, base URI, and forms.
- User chat input is validated before processing.
- User-originated content is passed through `sanitizeInput()` before display.
- DOM insertion uses `textContent` and element creation rather than unsafe HTML injection.
- Chat input length is capped at 499 characters.
- Age input is limited to a valid range.
- External navigation is limited to Google Calendar and Google Maps URL builders.

## Assumptions
- Eligibility rules are generalized for education and should be confirmed with the official local election office.
- Mock booth data demonstrates the integration pattern and UI behavior.
- The Google Calendar date uses the requested fixed template value.
- This is a frontend prototype and does not store personal data.

## Live Demo Placeholder
Deploy the four static files to any static host such as GitHub Pages, Netlify, Vercel, Firebase Hosting, or an internal civic portal.

## Author
VoteIQ frontend implementation generated for civic-tech education workflows.
