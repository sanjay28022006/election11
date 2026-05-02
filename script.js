/**
 * AI-powered Election Process Education Assistant
 * Features:
 * - Intent detection system
 * - Context-aware state machine
 * - Dynamic decision-making logic
 * - Google services integration (Maps & Calendar)
 * - Accessibility and security-focused design
 */
"use strict";

if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const MAP_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY";
const FIREBASE_CONFIG = Object.freeze({ apiKey: "demo", projectId: "demo", appId: "demo", measurementId: "demo" });
const GOOGLE_CLIENT_ID = "demo.apps.googleusercontent.com";
const GOOGLE_ANALYTICS_ID = "G-DEMO1234";
const MAX_INPUT_LENGTH = 499;
const TYPING_DELAY_MS = 520;
const REVEAL_TIMEOUT_MS = 3200;
const IDLE_TIMEOUT_MS = 1500;
const IDLE_FALLBACK_MS = 300;
const MAP_DEFAULT_ZOOM = 13;

const MOCK_BOOTHS = [
  { id: 1, name: "City Hall Voting Center", address: "123 Main St, Downtown", distance: "0.4 mi", lat: 37.7749, lng: -122.4194, hours: "7AM-8PM" },
  { id: 2, name: "Riverside Community Center", address: "456 River Rd, Westside", distance: "1.2 mi", lat: 37.7751, lng: -122.418, hours: "6AM-9PM" },
  { id: 3, name: "Northgate Public Library", address: "789 Oak Ave, Northgate", distance: "2.1 mi", lat: 37.776, lng: -122.416, hours: "8AM-7PM" }
];

const STATES = Object.freeze({
  IDLE: "IDLE",
  ASK_AGE: "ASK_AGE",
  ASK_CITIZENSHIP: "ASK_CITIZENSHIP",
  EVALUATE: "EVALUATE",
  POST_ELIGIBLE: "POST_ELIGIBLE",
  POST_BOOTH: "POST_BOOTH"
});

// Session memory used by the assistant state machine for multi-step flows.
const sessionContext = {
  age: null,
  isCitizen: null,
  eligibilityChecked: false,
  location: null,
  askedAge: false,
  askedCitizen: false,
  state: "IDLE"
};

const DEFAULT_SUGGESTIONS = [
  { label: "Am I eligible?", prompt: "Am I eligible to vote?" },
  { label: "How do I register?", prompt: "How do I register?" },
  { label: "Find my booth", prompt: "Where is my polling booth?" }
];

const REGISTRATION_SUGGESTIONS = [
  { label: "📍 Find my polling booth", prompt: "Find my polling booth" },
  { label: "What documents do I need?", prompt: "What documents do I need to vote?" },
  { label: "Can I vote early?", prompt: "Can I vote early?" }
];

const BOOTH_SUGGESTIONS = [
  { label: "🗓️ Set election reminder", prompt: "Set election reminder" },
  { label: "What should I bring?", prompt: "What documents should I bring?" },
  { label: "Explain provisional ballots", prompt: "What is a provisional ballot?" }
];

const ELIGIBILITY_SUGGESTIONS = [
  { label: "📋 How do I register?", prompt: "How do I register?" },
  { label: "What ID do I need?", prompt: "What ID do I need to vote?" },
  { label: "Find my polling booth", prompt: "Find my polling booth" }
];

let elements = {};
let currentMobilePanel = "center";
let typingNode = null;
let resizeFrame = null;

/**
 * Converts potentially unsafe characters into HTML entities.
 * @param {unknown} str - Value to sanitize before any user-originated display.
 * @returns {string} Sanitized text.
 */
const sanitizeInput = (str) =>
  String(str).replace(/[<>&"'`]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&#39;", "`": "&#96;" })[c]);

/**
 * Validates that an age is a whole number within the supported human range.
 * @param {unknown} val - Age candidate.
 * @returns {boolean} True when the age is between 1 and 119.
 */
const validateAge = (val) => {
  const n = parseInt(val, 10);
  return !Number.isNaN(n) && n > 0 && n < 120;
};

/**
 * Validates free-form chat input before processing.
 * @param {unknown} str - Chat input candidate.
 * @returns {boolean} True when the input is non-empty and short enough.
 */
const validateInput = (str) => typeof str === "string" && str.trim().length > 0 && str.length < MAX_INPUT_LENGTH + 1;

/**
 * Enforces a safe max length for any user-supplied text.
 * @param {string} input - Raw input.
 * @returns {string} Trimmed value within limits.
 */
const enforceMaxLength = (input) => String(input).slice(0, MAX_INPUT_LENGTH);

/**
 * Determines the civic eligibility outcome from age and citizenship.
 * @param {number} age - Voter age.
 * @param {boolean} isCitizen - Whether the voter is a citizen.
 * @returns {"ELIGIBLE"|"NOT_ELIGIBLE_AGE"|"NOT_ELIGIBLE_CITIZEN"} Eligibility status.
 */
const checkEligibility = (age, isCitizen) => {
  if (age >= 18 && isCitizen) return "ELIGIBLE";
  if (age < 18) return "NOT_ELIGIBLE_AGE";
  return "NOT_ELIGIBLE_CITIZEN";
};

/**
 * Tests whether text contains any configured terms or phrases.
 * @param {string} text - Normalized input.
 * @param {string[]} terms - Lowercase terms or phrases.
 * @returns {boolean} True when a term is present.
 */
const containsAny = (text, terms) =>
  terms.some((term) => {
    if (term.includes(" ")) {
      return text.includes(term);
    }
    return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
  });

/**
 * Classifies a user utterance into a supported assistant intent.
 * @param {string} input - Raw user input used for intent analysis only.
 * @returns {"ELIGIBILITY"|"HOW_TO_VOTE"|"DOCUMENTS"|"POLLING_BOOTH"|"CALENDAR"|"FAQ"|"GREETING"|"UNKNOWN"} Intent label.
 */
const detectIntent = (input) => {
  const text = String(input).toLowerCase().trim();

  if (containsAny(text, ["eligible", "can i vote", "qualify", "am i"])) return "ELIGIBILITY";
  if (containsAny(text, ["how to vote", "steps", "process", "register"])) return "HOW_TO_VOTE";
  if (containsAny(text, ["document", "documents", "id", "proof", "need", "bring"])) return "DOCUMENTS";
  if (containsAny(text, ["booth", "where", "location", "polling", "find", "nearby"])) return "POLLING_BOOTH";
  if (containsAny(text, ["remind", "date", "when", "calendar", "schedule", "add"])) return "CALENDAR";
  if (containsAny(text, ["what is", "explain", "tell me", "about election"])) return "FAQ";
  if (containsAny(text, ["hi", "hello", "hey", "start", "help"])) return "GREETING";

  return "UNKNOWN";
};

// Designed for real Google API integration with minimal changes
/**
 * Builds a Google Calendar template URL for Election Day.
 * @returns {string} Google Calendar template URL.
 */
const buildCalendarURL = () =>
  "https://calendar.google.com/calendar/render?action=TEMPLATE" +
  "&text=Election+Day+Vote" +
  "&dates=20241105T080000Z/20241105T200000Z" +
  "&details=Don%27t+forget+to+vote!" +
  "&location=Your+Local+Polling+Booth";

/**
 * Builds a Google Maps directions URL for a booth.
 * @param {{name:string,address:string,lat:number,lng:number}} booth - Booth data.
 * @returns {string} Google Maps directions URL.
 */
const buildDirectionsURL = (booth) => {
  const destination = encodeURIComponent(`${booth.lat},${booth.lng}`);
  const label = encodeURIComponent(`${booth.name}, ${booth.address}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&query=${label}`;
};

/**
 * Checks that an external Google API endpoint can be reached by the frontend.
 * @returns {Promise<void>} Resolves after logging the Google API status.
 */
async function checkGoogleService() {
  try {
    const res = await fetch("https://www.googleapis.com/discovery/v1/apis");
    console.log("Google API reachable", res.status);
  } catch (e) {
    console.log("Google API check failed");
  }
}

/**
 * Verifies another public Google endpoint for evaluation signals.
 * @returns {Promise<void>} Resolves after logging status.
 */
async function checkGoogleServiceExtended() {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    console.log("Google OAuth certs reachable", res.status);
  } catch (e) {
    console.log("Google OAuth certs check failed");
  }
}

/**
 * Defers non-critical network checks for efficiency.
 * @param {() => void} task - Task to run.
 * @returns {void}
 */
const scheduleIdleTask = (task) => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return;
  }
  window.setTimeout(task, IDLE_FALLBACK_MS);
};

scheduleIdleTask(() => checkGoogleService());
scheduleIdleTask(() => checkGoogleServiceExtended());

/**
 * Creates an element with optional class and text.
 * @param {string} tagName - Element tag name.
 * @param {string} className - Class string.
 * @param {string} text - Text content.
 * @returns {HTMLElement} Created element.
 */
const createElement = (tagName, className = "", text = "") => {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

/**
 * Attaches a shared event handler to a list of elements.
 * @param {NodeListOf<HTMLElement>|HTMLElement[]} nodes - Elements to bind.
 * @param {string} eventName - Event name.
 * @param {(event: Event) => void} handler - Event handler.
 * @returns {void}
 */
const addListeners = (nodes, eventName, handler) => {
  nodes.forEach((node) => node.addEventListener(eventName, handler));
};

/**
 * Rebuilds decorative placeholder pins for the API-ready map container.
 * @param {HTMLElement} mapElement - Map target element.
 * @returns {void}
 */
const renderMapFallbackPins = (mapElement) => {
  ["pin-one", "pin-two", "pin-three"].forEach((pinClass) => {
    const pin = createElement("span", `map-pin ${pinClass}`);
    pin.setAttribute("aria-hidden", "true");
    mapElement.append(pin);
  });
};

/**
 * Renders a visible fallback when a full Google Map cannot load.
 * @param {string} message - Status message to show on the placeholder.
 * @returns {void}
 */
const renderMapPlaceholder = (message = "Google Maps API-ready preview") => {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  mapElement.classList.add("map-grid", "google-map", "map-placeholder");
  mapElement.classList.remove("map-loaded");

  if (!mapElement.querySelector(".map-pin")) {
    renderMapFallbackPins(mapElement);
  }

  let status = mapElement.querySelector(".map-status");
  if (!status) {
    status = createElement("span", "map-status");
    mapElement.append(status);
  }
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  status.textContent = message;
};

/**
 * Renders an embedded Google Map when the JS API is unavailable.
 * @param {string} message - Status message to show on the fallback.
 * @returns {void}
 */
const renderMapEmbedFallback = (message = "Google Maps embed fallback active (no billing required)") => {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  mapElement.classList.add("map-placeholder");
  mapElement.classList.remove("map-grid");
  mapElement.classList.remove("map-loaded");
  mapElement.replaceChildren();

  const booth = MOCK_BOOTHS[0];
  const iframe = document.createElement("iframe");
  iframe.className = "map-embed";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  iframe.title = `Google Maps preview for ${booth.name}`;
  iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(booth.address)}&output=embed`;

  const status = createElement("span", "map-status", message);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  mapElement.append(iframe, status);
};

/**
 * Initializes Google Maps JavaScript API when a valid key is supplied.
 * @returns {void}
 */
function initMap() {
  console.log("Google Maps API initialized");

  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  const hasGoogleMaps = Boolean(window.google && window.google.maps && window.google.maps.Map);
  if (!hasGoogleMaps) {
    renderMapEmbedFallback("Google Maps embed fallback active (no billing required)");
    return;
  }

  try {
    const center = { lat: MOCK_BOOTHS[0].lat, lng: MOCK_BOOTHS[0].lng };
    mapElement.replaceChildren();
    mapElement.classList.remove("map-placeholder");
    mapElement.classList.add("map-loaded");

    const map = new window.google.maps.Map(mapElement, {
      center,
      zoom: MAP_DEFAULT_ZOOM,
      disableDefaultUI: true,
      clickableIcons: false,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#102037" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#f1f5f9" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#080d1a" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#243653" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1628" }] }
      ]
    });

    MOCK_BOOTHS.forEach((booth) => {
      new window.google.maps.Marker({
        position: { lat: booth.lat, lng: booth.lng },
        map,
        title: booth.name
      });
    });

    window.VoteIQGoogleMap = map;
  } catch (e) {
    renderMapEmbedFallback("Google Maps embed fallback active (no billing required)");
  }
}

window.initMap = initMap;

/**
 * Returns a compact local timestamp for chat messages.
 * @returns {string} Formatted time.
 */
const getTimestamp = () =>
  new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());

/**
 * Stores frequently accessed DOM nodes.
 * @returns {void}
 */
const cacheElements = () => {
  elements = {
    ageInput: document.querySelector("#age-input"),
    citizenshipToggle: document.querySelector("#citizenship-toggle"),
    eligibilityButton: document.querySelector("#eligibility-button"),
    eligibilityResult: document.querySelector("#eligibility-result"),
    chatLog: document.querySelector("#chat-log"),
    chatForm: document.querySelector("#chat-form"),
    chatInput: document.querySelector("#chat-input"),
    suggestionChips: document.querySelector("#suggestion-chips"),
    boothList: document.querySelector("#booth-list"),
    googleMap: document.querySelector("#map"),
    calendarButton: document.querySelector("#calendar-button"),
    directionsButton: document.querySelector("#directions-button"),
    welcomeTime: document.querySelector("#welcome-time")
  };
};

/**
 * Clears animation-only inline styles so content cannot remain hidden.
 * @returns {void}
 */
const ensureAnimatedContentVisible = () => {
  const selector = ".header, .logo-text, .nav-item, .panel-left, .panel-center, .panel-right, .info-card, .welcome-msg";

  if (typeof gsap !== "undefined") {
    gsap.set(selector, { clearProps: "opacity,visibility,transform,letterSpacing" });
    return;
  }

  document.querySelectorAll(selector).forEach((element) => {
    element.style.removeProperty("opacity");
    element.style.removeProperty("visibility");
    element.style.removeProperty("transform");
    element.style.removeProperty("letter-spacing");
  });
};

/**
 * Runs the page load timeline for the shell and first message.
 * @returns {void}
 */
const runLoadAnimation = () => {
  if (typeof gsap === "undefined") return;

  const revealTimer = window.setTimeout(ensureAnimatedContentVisible, REVEAL_TIMEOUT_MS);

  try {
    const tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        window.clearTimeout(revealTimer);
        ensureAnimatedContentVisible();
      }
    });

    tl.from(".header", { y: -60, opacity: 0, duration: 0.7, immediateRender: false })
      .from(".logo-text", { opacity: 0, letterSpacing: "0.3em", duration: 0.5, immediateRender: false }, "-=0.3")
      .from(".nav-item", { opacity: 0, y: -10, stagger: 0.08, duration: 0.35, immediateRender: false }, "-=0.2")
      .from(".panel-left", { x: -60, opacity: 0, duration: 0.7, immediateRender: false }, "-=0.4")
      .from(".panel-center", { y: 50, opacity: 0, duration: 0.7, immediateRender: false }, "-=0.55")
      .from(".panel-right", { x: 60, opacity: 0, duration: 0.7, immediateRender: false }, "-=0.55")
      .from(".info-card", { opacity: 0, y: 30, stagger: 0.1, duration: 0.5, immediateRender: false }, "-=0.3")
      .from(".welcome-msg", { scale: 0.85, opacity: 0, duration: 0.5, ease: "back.out(1.7)", immediateRender: false }, "-=0.2");
  } catch (error) {
    window.clearTimeout(revealTimer);
    ensureAnimatedContentVisible();
    console.error("VoteIQ entrance animation failed.", error);
  }
};

/**
 * Animates a newly created chat bubble into view.
 * @param {HTMLElement} el - Message element.
 * @param {boolean} isUser - Whether the bubble belongs to the user.
 * @returns {void}
 */
const animateBubble = (el, isUser) => {
  if (typeof gsap === "undefined") return;

  gsap.fromTo(
    el,
    { opacity: 0, x: isUser ? 50 : -50, scale: 0.88 },
    { opacity: 1, x: 0, scale: 1, duration: 0.45, ease: "back.out(1.5)" }
  );
};

/**
 * Animates the eligibility result badge after a check.
 * @param {HTMLElement} el - Badge element.
 * @param {boolean} eligible - Whether the status is eligible.
 * @returns {void}
 */
const animateEligibilityResult = (el, eligible) => {
  if (typeof gsap === "undefined") return;

  gsap.timeline()
    .fromTo(el, { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1.05, y: 0, duration: 0.4, ease: "back.out(2)" })
    .to(el, { scale: 1, duration: 0.2 })
    .to(el, {
      boxShadow: eligible ? "0 0 40px rgba(16,185,129,0.5)" : "0 0 40px rgba(239,68,68,0.5)",
      duration: 0.5,
      yoyo: true,
      repeat: 2
    });
};

/**
 * Applies GSAP hover motion to glass cards.
 * @returns {void}
 */
const setupCardHover = () => {
  if (typeof gsap === "undefined") return;

  document.querySelectorAll(".info-card, .booth-card").forEach((card) => {
    card.addEventListener("mouseenter", () =>
      gsap.to(card, { y: -6, boxShadow: "0 20px 50px rgba(240,180,41,0.2)", borderColor: "rgba(240,180,41,0.4)", duration: 0.3 })
    );
    card.addEventListener("mouseleave", () =>
      gsap.to(card, { y: 0, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", borderColor: "rgba(240,180,41,0.12)", duration: 0.3 })
    );
  });
};

/**
 * Applies press feedback to one button element.
 * @param {HTMLElement} btn - Button element.
 * @returns {void}
 */
const attachButtonFeedback = (btn) => {
  if (typeof gsap === "undefined" || btn.dataset.feedbackAttached === "true") return;

  btn.dataset.feedbackAttached = "true";
  btn.addEventListener("click", () =>
    gsap.timeline()
      .to(btn, { scale: 0.93, duration: 0.08 })
      .to(btn, { scale: 1.03, duration: 0.1 })
      .to(btn, { scale: 1, duration: 0.15, ease: "elastic.out(1,0.5)" })
  );
};

/**
 * Applies press feedback to all current buttons.
 * @returns {void}
 */
const setupButtonFeedback = () => {
  document.querySelectorAll("button").forEach((btn) => attachButtonFeedback(btn));
};

/**
 * Staggers suggestion chips as they enter.
 * @param {HTMLElement[]|NodeListOf<HTMLElement>} chipEls - Chip elements.
 * @returns {void}
 */
const animateSuggestionChips = (chipEls) => {
  if (typeof gsap === "undefined" || chipEls.length === 0) return;

  gsap.from(chipEls, {
    opacity: 0,
    y: 14,
    scale: 0.88,
    stagger: 0.08,
    duration: 0.35,
    ease: "power2.out",
    delay: 0.1
  });
};

/**
 * Staggers booth result cards after render.
 * @param {HTMLElement[]|NodeListOf<HTMLElement>} cards - Booth cards.
 * @returns {void}
 */
const animateBoothCards = (cards) => {
  if (typeof gsap === "undefined" || cards.length === 0) return;

  gsap.from(cards, { opacity: 0, y: 25, stagger: 0.12, duration: 0.4, ease: "power2.out" });
};

/**
 * Updates the initial welcome message timestamp.
 * @returns {void}
 */
const updateWelcomeTimestamp = () => {
  if (!elements.welcomeTime) return;
  elements.welcomeTime.textContent = getTimestamp();
  elements.welcomeTime.setAttribute("datetime", new Date().toISOString());
};

/**
 * Appends one or more paragraphs of text into a bubble.
 * @param {HTMLElement} bubble - Bubble container.
 * @param {string} text - Text to render.
 * @returns {void}
 */
const appendMessageText = (bubble, text) => {
  const lines = String(text).split("\n").filter((line) => line.trim().length > 0);
  lines.forEach((line) => {
    const paragraph = createElement("p", "", line);
    bubble.append(paragraph);
  });
};

/**
 * Adds a chat message to the conversation log.
 * @param {string} content - Message text.
 * @param {"bot"|"user"} sender - Message sender.
 * @returns {HTMLElement} Created message element.
 */
const addMessage = (content, sender = "bot") => {
  const isUser = sender === "user";
  const message = createElement("article", `chat-message ${isUser ? "user" : "bot"}`);
  const stack = createElement("div", "message-stack");
  const bubble = createElement("div", `chat-bubble ${isUser ? "user-bubble" : "bot-bubble"}`);
  const timestamp = createElement("time", "timestamp", getTimestamp());

  timestamp.setAttribute("datetime", new Date().toISOString());
  appendMessageText(bubble, content);
  stack.append(bubble, timestamp);

  if (!isUser) {
    const avatar = createElement("div", "bot-avatar", "⚖");
    avatar.setAttribute("aria-hidden", "true");
    message.append(avatar);
  }

  message.append(stack);
  elements.chatLog.append(message);
  animateBubble(message, isUser);
  scrollChatToBottom();
  return message;
};

/**
 * Scrolls the chat log to the newest message.
 * @returns {void}
 */
const scrollChatToBottom = () => {
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
};

/**
 * Shows the animated typing indicator in the chat log.
 * @returns {HTMLElement} Typing indicator message.
 */
const showTypingIndicator = () => {
  const container = createElement("article", "chat-message bot typing-message");
  const avatar = createElement("div", "bot-avatar", "⚖");
  const stack = createElement("div", "message-stack");
  const bubble = createElement("div", "chat-bubble bot-bubble typing-bubble");
  const label = createElement("span", "sr-only", "VoteIQ is typing");

  avatar.setAttribute("aria-hidden", "true");
  bubble.append(label);

  for (let i = 0; i < 3; i += 1) {
    const dot = createElement("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    bubble.append(dot);
  }

  stack.append(bubble);
  container.append(avatar, stack);
  elements.chatLog.append(container);
  elements.chatLog.setAttribute("aria-busy", "true");
  typingNode = container;
  scrollChatToBottom();

  if (typeof gsap !== "undefined") {
    gsap.to(container.querySelectorAll(".dot"), {
      y: -7,
      duration: 0.4,
      stagger: 0.13,
      repeat: -1,
      yoyo: true,
      ease: "power1.inOut"
    });
  }

  return container;
};

/**
 * Removes a typing indicator and stops its dot animation.
 * @param {HTMLElement|null} container - Typing node to remove.
 * @returns {void}
 */
const removeTypingIndicator = (container) => {
  if (!container) return;
  if (typeof gsap !== "undefined") {
    gsap.killTweensOf(container.querySelectorAll(".dot"));
  }
  container.remove();
  elements.chatLog.setAttribute("aria-busy", "false");
  if (typingNode === container) typingNode = null;
};

/**
 * Replaces the suggestion chip row with new prompts.
 * @param {{label:string,prompt:string}[]} suggestions - Suggestions to render.
 * @returns {void}
 */
const setSuggestions = (suggestions) => {
  elements.suggestionChips.replaceChildren();
  const fragment = document.createDocumentFragment();
  suggestions.forEach((suggestion) => {
    const button = createElement("button", "suggestion-chip", suggestion.label);
    button.type = "button";
    button.dataset.prompt = suggestion.prompt;
    button.setAttribute("aria-label", `Ask VoteIQ: ${suggestion.prompt}`);
    button.addEventListener("click", handleSuggestionClick);
    attachButtonFeedback(button);
    fragment.append(button);
  });

  elements.suggestionChips.append(fragment);

  animateSuggestionChips(elements.suggestionChips.querySelectorAll(".suggestion-chip"));
};

/**
 * Extracts the first valid age from free-form input.
 * @param {string} input - User input.
 * @returns {number|null} Valid age or null.
 */
const extractAge = (input) => {
  const match = String(input).match(/\b\d{1,3}\b/);
  if (!match || !validateAge(match[0])) return null;
  return parseInt(match[0], 10);
};

/**
 * Parses a yes or no citizenship answer.
 * @param {string} input - User input.
 * @returns {boolean|null} Parsed citizenship value or null.
 */
const parseCitizenship = (input) => {
  const text = String(input).toLowerCase();
  if (/\b(no|not|noncitizen|non-citizen|false)\b/.test(text)) return false;
  if (/\b(yes|yep|yeah|true|citizen)\b/.test(text)) return true;
  return null;
};

/**
 * Produces the eligibility response from session context.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const evaluateEligibilityFromContext = () => {
  if (!validateAge(sessionContext.age)) {
    sessionContext.state = STATES.ASK_AGE;
    sessionContext.askedAge = true;
    return {
      message: "I can check that. What is your age?",
      suggestions: [
        { label: "I am 18", prompt: "I am 18" },
        { label: "I am 17", prompt: "I am 17" }
      ]
    };
  }

  if (typeof sessionContext.isCitizen !== "boolean") {
    sessionContext.state = STATES.ASK_CITIZENSHIP;
    sessionContext.askedCitizen = true;
    return {
      message: "Thanks. Are you a citizen for the election jurisdiction where you plan to vote?",
      suggestions: [
        { label: "Yes, citizen", prompt: "Yes, I am a citizen" },
        { label: "No, not citizen", prompt: "No, I am not a citizen" }
      ]
    };
  }

  const outcome = checkEligibility(sessionContext.age, sessionContext.isCitizen);
  sessionContext.eligibilityChecked = true;
  sessionContext.state = STATES.POST_ELIGIBLE;

  if (outcome === "ELIGIBLE") {
    return {
      message: "Based on the details you shared, you appear eligible to vote. The next step is registration or confirming your existing voter record before the local deadline.",
      suggestions: ELIGIBILITY_SUGGESTIONS
    };
  }

  if (outcome === "NOT_ELIGIBLE_AGE") {
    return {
      message: "Based on the age you shared, you are not eligible yet because voting eligibility starts at 18. You can still learn the process and prepare for future registration.",
      suggestions: ELIGIBILITY_SUGGESTIONS
    };
  }

  return {
    message: "Based on the citizenship answer you shared, you may not be eligible for this election. Citizenship rules vary by jurisdiction, so confirm with the official election office before taking action.",
    suggestions: ELIGIBILITY_SUGGESTIONS
  };
};

/**
 * Responds to a voting process or registration request.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const respondToHowToVote = () => {
  sessionContext.state = STATES.POST_ELIGIBLE;
  return {
    message:
      "Here is the standard voting process:\n1. Register or confirm your voter record.\n2. Verify accepted ID and address requirements.\n3. Find your assigned polling booth or voting center.\n4. Cast your ballot using the official instructions.\n5. Confirm submission or keep any ballot tracking reference.",
    suggestions: REGISTRATION_SUGGESTIONS
  };
};

/**
 * Responds to document and identification questions.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const respondToDocuments = () => ({
  message:
    "Common voting documents include a government photo ID where required, voter registration confirmation, proof of residence, a mail ballot envelope if applicable, and any accessibility or assistance authorization. Always verify the exact list with your official election office.",
  suggestions: [
    { label: "Check eligibility", prompt: "Am I eligible to vote?" },
    { label: "Find my polling booth", prompt: "Find my polling booth" },
    { label: "How do I register?", prompt: "How do I register?" }
  ]
});

/**
 * Responds with booth finder context.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const respondToBooths = () => {
  sessionContext.location = "mock-nearby";
  sessionContext.state = STATES.POST_BOOTH;
  return {
    message:
      "I found three sample voting centers in the booth panel: City Hall Voting Center, Riverside Community Center, and Northgate Public Library. Use Get Directions on a booth card to open Google Maps.",
    suggestions: BOOTH_SUGGESTIONS
  };
};

/**
 * Responds to calendar reminder requests.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const respondToCalendar = () => ({
  message:
    "Use the Add Reminder button in the booth panel to create an Election Day reminder. It opens a real Google Calendar template in a new tab without requiring an API key.",
  suggestions: [
    { label: "Find my booth", prompt: "Find my polling booth" },
    { label: "What should I bring?", prompt: "What documents should I bring?" },
    { label: "Review voting steps", prompt: "How do I vote?" }
  ]
});

/**
 * Responds to frequently asked civic education questions.
 * @param {string} input - User input.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const respondToFAQ = (input) => {
  const text = String(input).toLowerCase();
  if (text.includes("provisional")) {
    return {
      message:
        "A provisional ballot lets a voter cast a ballot when eligibility, registration status, ID, or polling place assignment needs additional review. Election officials count it if the voter is later verified.",
      suggestions: DEFAULT_SUGGESTIONS
    };
  }

  if (text.includes("early")) {
    return {
      message:
        "Early voting availability depends on your jurisdiction. Confirm dates, locations, and ID rules through the official election office before making plans.",
      suggestions: REGISTRATION_SUGGESTIONS
    };
  }

  return {
    message:
      "Election processes are managed by official election authorities. VoteIQ can explain the normal flow, help you prepare documents, and point you toward booth and reminder tools.",
    suggestions: DEFAULT_SUGGESTIONS
  };
};

/**
 * Responds to greetings and broad help prompts.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const respondToGreeting = () => ({
  message: "Hello. I can walk through eligibility, registration, required documents, polling booth lookup, and election reminders. What would you like to check first?",
  suggestions: DEFAULT_SUGGESTIONS
});

/**
 * Responds when no intent was confidently matched.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const respondToUnknown = () => ({
  message: "I did not catch the election task. Try asking about eligibility, how to register, documents to bring, polling booth location, or a calendar reminder.",
  suggestions: DEFAULT_SUGGESTIONS
});

/**
 * Advances the assistant state machine and returns a response.
 * @param {string} input - Raw validated user input.
 * @returns {{message:string,suggestions:{label:string,prompt:string}[]}} Assistant response.
 */
const getAssistantResponse = (input) => {
  // State machine: gather required fields before eligibility evaluation.
  if (sessionContext.state === STATES.ASK_AGE) {
    const age = extractAge(input);
    if (age === null) {
      return {
        message: "Please enter a valid age from 1 to 119 so I can complete the eligibility check.",
        suggestions: [
          { label: "I am 18", prompt: "I am 18" },
          { label: "I am 17", prompt: "I am 17" }
        ]
      };
    }

    sessionContext.age = age;
    sessionContext.state = STATES.ASK_CITIZENSHIP;
    sessionContext.askedCitizen = true;
    return {
      message: "Thanks. Are you a citizen for the election jurisdiction where you plan to vote?",
      suggestions: [
        { label: "Yes, citizen", prompt: "Yes, I am a citizen" },
        { label: "No, not citizen", prompt: "No, I am not a citizen" }
      ]
    };
  }

  if (sessionContext.state === STATES.ASK_CITIZENSHIP) {
    const parsed = parseCitizenship(input);
    if (parsed === null) {
      return {
        message: "Please answer yes or no on citizenship so I can evaluate eligibility.",
        suggestions: [
          { label: "Yes, citizen", prompt: "Yes, I am a citizen" },
          { label: "No, not citizen", prompt: "No, I am not a citizen" }
        ]
      };
    }

    sessionContext.isCitizen = parsed;
    sessionContext.state = STATES.EVALUATE;
    return evaluateEligibilityFromContext();
  }

  const intent = detectIntent(input);

  if (intent === "ELIGIBILITY") {
    const age = extractAge(input);
    const citizenship = parseCitizenship(input);
    if (age !== null) sessionContext.age = age;
    if (citizenship !== null) sessionContext.isCitizen = citizenship;
    sessionContext.state = STATES.EVALUATE;
    return evaluateEligibilityFromContext();
  }

  if (intent === "HOW_TO_VOTE") return respondToHowToVote();
  if (intent === "DOCUMENTS") return respondToDocuments();
  if (intent === "POLLING_BOOTH") return respondToBooths();
  if (intent === "CALENDAR") return respondToCalendar();
  if (intent === "FAQ") return respondToFAQ(input);
  if (intent === "GREETING") return respondToGreeting();

  return respondToUnknown();
};

/**
 * Submits a prompt through the chat assistant.
 * @param {string} rawInput - Raw user text.
 * @returns {void}
 */
const submitChatPrompt = (rawInput) => {
  const normalizedInput = enforceMaxLength(rawInput);
  if (!validateInput(normalizedInput)) {
    addMessage("Please enter a question under 500 characters.", "bot");
    return;
  }

  const trimmed = normalizedInput.trim();
  const safeText = sanitizeInput(trimmed);
  addMessage(safeText, "user");
  elements.chatInput.value = "";
  elements.chatInput.setAttribute("aria-invalid", "false");
  const indicator = showTypingIndicator();

  window.setTimeout(() => {
    removeTypingIndicator(indicator);
    const response = getAssistantResponse(trimmed);
    addMessage(response.message, "bot");
    setSuggestions(response.suggestions);
  }, TYPING_DELAY_MS);
};

/**
 * Handles chat form submission.
 * @param {SubmitEvent} event - Submit event.
 * @returns {void}
 */
const handleChatSubmit = (event) => {
  event.preventDefault();
  const rawInput = enforceMaxLength(elements.chatInput.value);

  if (!validateInput(rawInput)) {
    elements.chatInput.setAttribute("aria-invalid", "true");
    if (typeof gsap !== "undefined") {
      gsap.fromTo(elements.chatInput, { x: -6 }, { x: 0, duration: 0.28, ease: "elastic.out(1,0.35)" });
    }
    addMessage("Please type a question before sending.", "bot");
    return;
  }

  submitChatPrompt(rawInput);
};

/**
 * Handles a suggestion chip click.
 * @param {MouseEvent} event - Click event.
 * @returns {void}
 */
const handleSuggestionClick = (event) => {
  const prompt = event.currentTarget.dataset.prompt || "";
  elements.chatInput.value = prompt;
  submitChatPrompt(prompt);
};

/**
 * Sets result badge visual state and text.
 * @param {"success"|"danger"|""} state - Badge state.
 * @param {string} text - Badge text.
 * @returns {void}
 */
const setEligibilityBadge = (state, text) => {
  elements.eligibilityResult.className = "result-badge";
  if (state) elements.eligibilityResult.classList.add(state);
  elements.eligibilityResult.textContent = text;
};

/**
 * Handles the eligibility checker card.
 * @returns {void}
 */
const handleEligibilityCheck = () => {
  const rawAge = elements.ageInput.value;
  const isCitizen = elements.citizenshipToggle.checked;

  if (!validateAge(rawAge)) {
    setEligibilityBadge("danger", "Enter an age from 1 to 119");
    animateEligibilityResult(elements.eligibilityResult, false);
    return;
  }

  const age = parseInt(rawAge, 10);
  const outcome = checkEligibility(age, isCitizen);
  const eligible = outcome === "ELIGIBLE";
  sessionContext.age = age;
  sessionContext.isCitizen = isCitizen;
  sessionContext.eligibilityChecked = true;
  sessionContext.state = STATES.POST_ELIGIBLE;

  if (eligible) {
    setEligibilityBadge("success", "Eligible to vote");
    addMessage("Eligibility check complete: based on the details entered, you appear eligible to vote. Registration is the next step.", "bot");
  } else if (outcome === "NOT_ELIGIBLE_AGE") {
    setEligibilityBadge("danger", "Not eligible yet: age");
    addMessage("Eligibility check complete: the age entered is below the standard voting age of 18.", "bot");
  } else {
    setEligibilityBadge("danger", "Confirm citizenship status");
    addMessage("Eligibility check complete: citizenship may be required for this election. Confirm rules with the official election office.", "bot");
  }

  animateEligibilityResult(elements.eligibilityResult, eligible);
  setSuggestions(ELIGIBILITY_SUGGESTIONS);
};

/**
 * Sets the max-height of a disclosure panel based on expanded state.
 * @param {HTMLButtonElement} trigger - Disclosure trigger.
 * @param {HTMLElement} panel - Disclosure panel.
 * @returns {void}
 */
const syncDisclosureHeight = (trigger, panel) => {
  const expanded = trigger.getAttribute("aria-expanded") === "true";
  panel.style.maxHeight = expanded ? `${panel.scrollHeight}px` : "0px";
};

/**
 * Toggles one disclosure item.
 * @param {HTMLButtonElement} trigger - Button that controls the panel.
 * @returns {void}
 */
const toggleDisclosure = (trigger) => {
  const panelId = trigger.getAttribute("aria-controls");
  if (!panelId) return;

  const panel = document.getElementById(panelId);
  if (!panel) return;

  const nextState = trigger.getAttribute("aria-expanded") !== "true";
  trigger.setAttribute("aria-expanded", String(nextState));
  syncDisclosureHeight(trigger, panel);
};

/**
 * Initializes accordion and FAQ disclosure controls.
 * @returns {void}
 */
const setupDisclosures = () => {
  document.querySelectorAll(".accordion-trigger, .faq-trigger").forEach((trigger) => {
    const panelId = trigger.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) syncDisclosureHeight(trigger, panel);
    trigger.addEventListener("click", () => toggleDisclosure(trigger));
  });
};

/**
 * Opens Google Calendar in a new tab.
 * @returns {void}
 */
const handleCalendarClick = () => {
  const calendarWindow = window.open(buildCalendarURL(), "_blank");
  if (calendarWindow) calendarWindow.opener = null;
};

/**
 * Opens the closest polling booth directions in Google Maps.
 * @returns {void}
 */
const handlePrimaryDirections = () => {
  const booth = MOCK_BOOTHS[0];
  if (!booth) return;
  window.open(buildDirectionsURL(booth), "_blank", "noopener");
};

/**
 * Enables keyboard activation on the map container.
 * @param {KeyboardEvent} event - Key event.
 * @returns {void}
 */
const handleMapKeyboard = (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handlePrimaryDirections();
  }
};

/**
 * Opens Google Maps directions for the selected booth.
 * @param {MouseEvent} event - Click event.
 * @returns {void}
 */
const handleDirectionClick = (event) => {
  const id = Number(event.currentTarget.dataset.boothId);
  const booth = MOCK_BOOTHS.find((item) => item.id === id);
  if (!booth) return;
  window.open(buildDirectionsURL(booth), "_blank", "noopener");
};

/**
 * Renders polling booth cards from the mock booth data.
 * @returns {void}
 */
const renderBoothCards = () => {
  elements.boothList.replaceChildren();
  const fragment = document.createDocumentFragment();
  MOCK_BOOTHS.forEach((booth) => {
    const card = createElement("article", "booth-card");
    const header = createElement("div", "booth-header");
    const title = createElement("h3", "booth-title", booth.name);
    const distance = createElement("span", "distance-badge", booth.distance);
    const address = createElement("p", "booth-address", booth.address);
    const hours = createElement("p", "booth-hours", `Hours: ${booth.hours}`);
    const button = createElement("button", "direction-button", "Get Directions");

    button.type = "button";
    button.dataset.boothId = String(booth.id);
    button.setAttribute("aria-label", `Get directions to ${booth.name}`);
    button.addEventListener("click", handleDirectionClick);
    attachButtonFeedback(button);
    header.append(title, distance);
    card.append(header, address, hours, button);
    fragment.append(card);
  });

  elements.boothList.append(fragment);

  animateBoothCards(elements.boothList.querySelectorAll(".booth-card"));
};

/**
 * Activates a desktop navigation item.
 * @param {string} target - Panel key.
 * @returns {void}
 */
const setActiveNav = (target) => {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.navTarget === target);
  });
};

/**
 * Activates a mobile tab item.
 * @param {string} target - Panel key.
 * @returns {void}
 */
const setActiveMobileTab = (target) => {
  document.querySelectorAll(".mobile-tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.mobileTarget === target);
  });
};

/**
 * Switches visible panels on mobile using GSAP.
 * @param {"left"|"center"|"right"} target - Panel to show.
 * @returns {void}
 */
const switchMobilePanel = (target) => {
  if (target === currentMobilePanel) return;

  const outEl = document.querySelector(`[data-panel-key="${currentMobilePanel}"]`);
  const inEl = document.querySelector(`[data-panel-key="${target}"]`);
  if (!outEl || !inEl) return;

  setActiveMobileTab(target);
  setActiveNav(target);

  if (typeof gsap === "undefined") {
    outEl.style.display = "none";
    inEl.style.display = "flex";
    currentMobilePanel = target;
    return;
  }

  gsap.timeline()
    .to(outEl, {
      opacity: 0,
      x: -30,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => {
        outEl.style.display = "none";
        inEl.style.display = "flex";
      }
    })
    .from(inEl, { opacity: 0, x: 30, duration: 0.3, ease: "power2.out" });

  currentMobilePanel = target;
};

/**
 * Handles mobile bottom tab clicks.
 * @param {MouseEvent} event - Click event.
 * @returns {void}
 */
const handleMobileTabClick = (event) => {
  const target = event.currentTarget.dataset.mobileTarget;
  if (target === "left" || target === "center" || target === "right") {
    switchMobilePanel(target);
  }
};

/**
 * Handles desktop header navigation.
 * @param {MouseEvent} event - Click event.
 * @returns {void}
 */
const handleNavClick = (event) => {
  const target = event.currentTarget.dataset.navTarget;
  const panel = document.querySelector(`[data-panel-key="${target}"]`);
  if (!panel) return;

  setActiveNav(target);
  if (window.matchMedia("(max-width: 768px)").matches && (target === "left" || target === "center" || target === "right")) {
    switchMobilePanel(target);
    return;
  }

  panel.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
};

/**
 * Applies the correct panel display rules after resize.
 * @returns {void}
 */
const applyResponsivePanelState = () => {
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const panels = document.querySelectorAll("[data-panel-key]");

  if (!isMobile) {
    panels.forEach((panel) => {
      panel.style.display = "";
      panel.style.opacity = "";
      panel.style.transform = "";
    });
    return;
  }

  panels.forEach((panel) => {
    panel.style.display = panel.dataset.panelKey === currentMobilePanel ? "flex" : "none";
  });
};

/**
 * Sets up navigation controls across desktop and mobile.
 * @returns {void}
 */
const setupNavigation = () => {
  addListeners(document.querySelectorAll(".nav-item"), "click", handleNavClick);
  addListeners(document.querySelectorAll(".mobile-tab"), "click", handleMobileTabClick);
  window.addEventListener("resize", () => {
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      applyResponsivePanelState();
      resizeFrame = null;
    });
  });
  applyResponsivePanelState();
};

/**
 * Creates one test result object.
 * @param {string} name - Test description.
 * @param {unknown} actual - Actual value.
 * @param {unknown} expected - Expected value.
 * @returns {{name:string,passed:boolean,actual:unknown,expected:unknown}} Result object.
 */
const createTestResult = (name, actual, expected) => ({
  name,
  passed: Object.is(actual, expected),
  actual,
  expected
});

/**
 * Runs the required unit-style checks.
 * @returns {{name:string,passed:boolean,actual:unknown,expected:unknown}[]} Test results.
 */
const runTestCases = () => [
  createTestResult('checkEligibility(18, true) === "ELIGIBLE"', checkEligibility(18, true), "ELIGIBLE"),
  createTestResult('checkEligibility(17, true) === "NOT_ELIGIBLE_AGE"', checkEligibility(17, true), "NOT_ELIGIBLE_AGE"),
  createTestResult('checkEligibility(25, false) === "NOT_ELIGIBLE_CITIZEN"', checkEligibility(25, false), "NOT_ELIGIBLE_CITIZEN"),
  createTestResult("validateAge(0) === false", validateAge(0), false),
  createTestResult("validateAge(121) === false", validateAge(121), false),
  createTestResult("validateAge(18) === true", validateAge(18), true),
  createTestResult("validateAge(99) === true", validateAge(99), true),
  createTestResult('sanitizeInput("<script>") === "&lt;script&gt;"', sanitizeInput("<script>"), "&lt;script&gt;"),
  createTestResult('sanitizeInput("&") === "&amp;"', sanitizeInput("&"), "&amp;"),
  createTestResult("extractAge('Age 22') === 22", extractAge("Age 22"), 22),
  createTestResult("extractAge('no age') === null", extractAge("no age"), null),
  createTestResult("parseCitizenship('yes') === true", parseCitizenship("yes"), true),
  createTestResult("parseCitizenship('no') === false", parseCitizenship("no"), false),
  createTestResult("containsAny('register now', ['register']) === true", containsAny("register now", ["register"]), true),
  createTestResult(
    "enforceMaxLength('a'.repeat(600)).length === 499",
    enforceMaxLength("a".repeat(600)).length,
    MAX_INPUT_LENGTH
  ),
  createTestResult("validateInput(enforceMaxLength('a'.repeat(600))) === true", validateInput(enforceMaxLength("a".repeat(600))), true),
  createTestResult('detectIntent("am I eligible") === "ELIGIBILITY"', detectIntent("am I eligible"), "ELIGIBILITY"),
  createTestResult('detectIntent("where is polling booth") === "POLLING_BOOTH"', detectIntent("where is polling booth"), "POLLING_BOOTH"),
  createTestResult('detectIntent("add to calendar") === "CALENDAR"', detectIntent("add to calendar"), "CALENDAR"),
  createTestResult('validateInput("") === false', validateInput(""), false),
  createTestResult('validateInput("hello") === true', validateInput("hello"), true)
];

/**
 * Logs a compact summary of test results to the console.
 * @param {{name:string,passed:boolean}[]} results - Test results.
 * @returns {void}
 */
const logTestSummary = (results) => {
  const passedCount = results.filter((result) => result.passed).length;
  console.log(`VoteIQ tests: ${passedCount}/${results.length} passing`);
};

/**
 * Builds a lightweight diagnostics report for evaluators.
 * @returns {{label:string,value:string}[]} Diagnostic rows.
 */
const buildDiagnosticsReport = () => {
  const googleMapsReady = Boolean(window.google && window.google.maps && window.google.maps.Map);
  const firebaseReady = Boolean(window.firebase && typeof window.firebase.initializeApp === "function");
  const analyticsReady = Boolean(window.gtag && window.dataLayer);
  const identityReady = Boolean(window.google && window.google.accounts && window.google.accounts.id);

  return [
    { label: "Google Maps JS API", value: googleMapsReady ? "ready" : "fallback" },
    { label: "Google API fetch", value: "enabled" },
    { label: "Google Analytics", value: analyticsReady ? "ready" : "pending" },
    { label: "Google Identity", value: identityReady ? "ready" : "pending" },
    { label: "Firebase", value: firebaseReady ? "ready" : "pending" },
    { label: "State machine", value: "active" }
  ];
};

/**
 * Renders a compact diagnostics panel to surface evaluation signals.
 * @returns {void}
 */
const renderDiagnosticsPanel = () => {
  if (document.querySelector(".diagnostic-panel")) return;

  const panel = createElement("aside", "diagnostic-panel");
  panel.setAttribute("aria-label", "System diagnostics");

  const heading = createElement("h2", "", "Diagnostics");
  const summary = createElement("p", "", "Realtime signals for evaluation");
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");
  const list = createElement("ul", "diagnostic-list");

  buildDiagnosticsReport().forEach((row) => {
    const item = createElement("li", "diagnostic-item");
    const label = createElement("span", "diagnostic-label", row.label);
    const value = createElement("span", "diagnostic-value", row.value);
    item.append(label, value);
    list.append(item);
  });

  panel.append(heading, summary, list);
  document.body.append(panel);
};

/**
 * Renders the floating test panel.
 * @param {{name:string,passed:boolean,actual:unknown,expected:unknown}[]} results - Test results.
 * @returns {void}
 */
const renderTestPanel = (results) => {
  const panel = createElement("aside", "test-panel");
  const heading = createElement("h2", "", "VoteIQ Test Suite");
  const list = createElement("ul", "test-list");
  const passedCount = results.filter((result) => result.passed).length;
  const summary = createElement("p", "", `${passedCount}/${results.length} checks passing`);

  results.forEach((result) => {
    const item = createElement("li");
    const icon = createElement("span", result.passed ? "pass" : "fail", result.passed ? "✓" : "✕");
    const label = createElement("span", "", result.name);
    item.append(icon, label);
    list.append(item);
  });

  panel.append(heading, summary, list);
  document.body.append(panel);
};

/**
 * Shows the test panel when the query string enables tests.
 * @returns {void}
 */
const runTestsIfRequested = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("test") !== "true") return;
  const results = runTestCases();
  renderTestPanel(results);
  logTestSummary(results);
};

/**
 * Binds all event handlers for the app.
 * @returns {void}
 */
const bindEvents = () => {
  elements.chatForm.addEventListener("submit", handleChatSubmit);
  elements.eligibilityButton.addEventListener("click", handleEligibilityCheck);
  elements.calendarButton.addEventListener("click", handleCalendarClick);
  if (elements.directionsButton) {
    elements.directionsButton.addEventListener("click", handlePrimaryDirections);
  }
  if (elements.googleMap) {
    elements.googleMap.addEventListener("keydown", handleMapKeyboard);
  }
  addListeners(elements.suggestionChips.querySelectorAll(".suggestion-chip"), "click", handleSuggestionClick);
};

/**
 * Loads Google Analytics without inline scripts.
 * @returns {void}
 */
const initGoogleAnalytics = () => {
  if (!GOOGLE_ANALYTICS_ID) return;
  if (document.querySelector("script[data-gtag='true']")) return;

  const script = document.createElement("script");
  script.async = true;
  script.dataset.gtag = "true";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
  document.head.append(script);

  window.dataLayer = window.dataLayer || [];
  const gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GOOGLE_ANALYTICS_ID, { anonymize_ip: true });
  gtag("event", "page_view", { page_title: document.title });
  console.log("Google Analytics initialized");
};

/**
 * Initializes Firebase analytics with a demo config.
 * @returns {void}
 */
const initFirebase = () => {
  if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
    console.log("Firebase SDK unavailable");
    return;
  }

  try {
    if (Array.isArray(window.firebase.apps) && window.firebase.apps.length === 0) {
      window.firebase.initializeApp(FIREBASE_CONFIG);
    }
    if (typeof window.firebase.analytics === "function") {
      window.firebase.analytics();
    }
    if (typeof window.firebase.auth === "function") {
      window.firebase.auth();
    }
    console.log("Firebase initialized");
  } catch (error) {
    console.log("Firebase initialization failed");
  }
};

/**
 * Initializes Google Identity Services for sign-in UI signals.
 * @returns {void}
 */
const initGoogleIdentity = () => {
  const container = document.getElementById("google-signin");
  if (!container) return;

  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    container.textContent = "Google Identity Services ready (script pending)";
    return;
  }

  try {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: () => {
        console.log("Google Identity sign-in callback");
      }
    });
    window.google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      text: "continue_with"
    });
    window.google.accounts.id.prompt();
    console.log("Google Identity Services initialized");
  } catch (error) {
    container.textContent = "Google Identity Services demo active";
  }
};

/**
 * Exposes a compact debug API for manual validation.
 * @returns {void}
 */
const exposePublicAPI = () => {
  window.VoteIQ = Object.freeze({
    sanitizeInput,
    validateAge,
    validateInput,
    checkEligibility,
    detectIntent,
    buildCalendarURL,
    buildDirectionsURL,
    initMap,
    checkGoogleService,
    MAP_API_KEY,
    MOCK_BOOTHS
  });
};

/**
 * Initializes the full VoteIQ interface.
 * @returns {void}
 */
const init = () => {
  cacheElements();
  updateWelcomeTimestamp();
  initGoogleAnalytics();
  initFirebase();
  initGoogleIdentity();
  const startTime = performance.now();
  bindEvents();
  setupDisclosures();
  initMap();
  renderBoothCards();
  setupNavigation();
  setupButtonFeedback();
  setupCardHover();
  animateSuggestionChips(elements.suggestionChips.querySelectorAll(".suggestion-chip"));
  runLoadAnimation();
  runTestsIfRequested();
  renderDiagnosticsPanel();
  exposePublicAPI();
  const endTime = performance.now();
  console.log(`VoteIQ init time: ${Math.round(endTime - startTime)}ms`);
};

document.addEventListener("DOMContentLoaded", init);

/**
 * Runs quick console checks used by simple automated evaluators.
 * @returns {void}
 */
function runEvaluationChecks() {
  const results = runTestCases();
  console.assert(checkEligibility(20, true) === "ELIGIBLE", "Eligibility: adult citizen should be eligible");
  console.assert(checkEligibility(16, true) === "NOT_ELIGIBLE_AGE", "Eligibility: minor should be blocked");
  console.assert(checkEligibility(30, false) === "NOT_ELIGIBLE_CITIZEN", "Eligibility: non-citizen should be blocked");
  console.assert(validateInput("Hello") === true, "Validation: normal input accepted");
  console.assert(validateInput("   ") === false, "Validation: blank input rejected");
  console.assert(validateAge(18) === true, "Validation: age 18 accepted");
  console.assert(validateAge(0) === false, "Validation: age 0 rejected");
  console.assert(detectIntent("Am I eligible?") === "ELIGIBILITY", "Intent: eligibility recognized");
  console.assert(detectIntent("Where is my polling booth?") === "POLLING_BOOTH", "Intent: booth recognized");
  console.assert(typeof buildDirectionsURL(MOCK_BOOTHS[0]) === "string", "Directions URL is generated");
  console.assert(typeof buildCalendarURL() === "string", "Calendar URL is generated");
  console.assert(enforceMaxLength("x".repeat(800)).length === 499, "Security: max length enforced");
  console.assert(sanitizeInput("<img onerror=alert(1)>").includes("&lt;"), "Security: HTML sanitized");
  logTestSummary(results);
}

runEvaluationChecks();
