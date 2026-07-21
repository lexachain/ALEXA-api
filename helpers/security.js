/* ==========================================================
   ALEXA API
   File : helpers/security.js
   Description : Security Helpers
========================================================== */

import { verifyFirebaseIdToken } from "./auth.js";
import { getNow } from "./request.js";

/* ==========================================================
   BEARER TOKEN
========================================================== */

export function getBearerToken(request) {
    const auth = request?.headers?.get("Authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

/* ==========================================================
   AUTH
========================================================== */

export async function requireUser(env, request) {
    const token = getBearerToken(request);

    if (!token) {
        throw new Error("Missing Authorization Bearer token.");
    }

    const user = await verifyFirebaseIdToken(env, token);

    if (!user?.uid) {
        throw new Error("Unauthorized user.");
    }

    return user;
}
export async function requireOwner(env, request, uid) {

    const user = await requireUser(env, request);

    if (user.uid !== uid) {
        throw new Error("Forbidden.");
    }

    return user;

}
/* ==========================================================
   RATE LIMIT
========================================================== */

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 30;

const rateMap = new Map();

export function getRateKey(request, uid = "") {
    const ip =
        request?.headers?.get("CF-Connecting-IP") ||
        request?.headers?.get("x-forwarded-for") ||
        "unknown";

    return `${ip}:${uid || "anon"}`;
}

export function checkRateLimit(request, uid = "") {
    const key = getRateKey(request, uid);
    const now = getNow();

    const current = rateMap.get(key);

    if (!current || now > current.resetAt) {
        rateMap.set(key, {
            count: 1,
            resetAt: now + RATE_WINDOW_MS
        });
        return true;
    }

    if (current.count >= RATE_MAX_REQUESTS) {
        return false;
    }

    current.count += 1;
    rateMap.set(key, current);
    return true;
}


/* ==========================================================
   VALIDATION
========================================================== */

export function isUUID(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "")
    );
}

export function validateUUID(value, message = "Invalid UUID.") {
    if (!isUUID(value)) {
        throw new Error(message);
    }
    return true;
}

export function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

export function validateEmail(value, message = "Invalid email.") {
    if (!isEmail(value)) {
        throw new Error(message);
    }
    return true;
}

export function isUsername(value) {
    return /^[a-zA-Z0-9_.-]{3,24}$/.test(String(value || ""));
}

export function validateUsername(value, message = "Invalid username.") {
    if (!isUsername(value)) {
        throw new Error(message);
    }
    return true;
}

/* ==========================================================
   REQUEST META
========================================================== */

export function getClientIP(request) {
    return (
        request?.headers?.get("CF-Connecting-IP") ||
        request?.headers?.get("x-forwarded-for") ||
        "unknown"
    );
}

export function getUserAgent(request) {
    return request?.headers?.get("User-Agent") || "";
}

export function getOrigin(request) {
    return request?.headers?.get("Origin") || "";
}

export function isAllowedOrigin(request, allowedOrigins = []) {
    const origin = getOrigin(request);
    if (!origin) return false;
    return allowedOrigins.includes(origin);
}

/* ==========================================================
   SANITIZER
========================================================== */

export function sanitizeString(value, maxLength = 200) {
    return String(value ?? "")
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, maxLength);
}

export function sanitizeObject(input) {
    if (!input || typeof input !== "object") return {};

    const output = Array.isArray(input) ? [] : {};

    for (const [key, value] of Object.entries(input)) {
        if (typeof value === "string") {
            output[key] = sanitizeString(value);
        } else if (value && typeof value === "object") {
            output[key] = sanitizeObject(value);
        } else {
            output[key] = value;
        }
    }

    return output;
}

/* ==========================================================
   HASH / TOKEN
========================================================== */

export async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text || ""));
    const hash = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

export function randomToken(length = 32) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    let out = "";

    for (let i = 0; i < length; i++) {
        out += chars[bytes[i] % chars.length];
    }

    return out;
}

/* ==========================================================
   TIME
========================================================== */

export function unixTime() {
    return Math.floor(getNow() / 1000);
}