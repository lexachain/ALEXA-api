/* ==========================================================
   ALEXA API
   File : helpers/config.js
   Description : App Configuration Helpers
========================================================== */

/* ==========================================================
   CONSTANTS
========================================================== */

export const GOOGLE_TOKEN_URL =
    "https://oauth2.googleapis.com/token";

export const FIRESTORE_BASE =
    "https://firestore.googleapis.com/v1/projects";

export const MINING_DURATION =
    24 * 60 * 60 * 1000; // 24 jam

/* ==========================================================
   APP CONFIG
========================================================== */

export function config(env = {}) {
    return {
        APP_NAME: env.APP_NAME || "ALEXA API",
        APP_VERSION: env.APP_VERSION || "1.0.0",
        APP_URL: env.APP_URL || "https://alexa-chain.web.app",
        LOCAL_URL: env.LOCAL_URL || "http://localhost:7077",
        ENV: env.ENV || "production"
    };
}

/* ==========================================================
   HELPERS
========================================================== */

export function isDevelopment(env = {}) {
    const cfg = config(env);
    return String(cfg.ENV).toLowerCase() === "development";
}

export function isProduction(env = {}) {
    const cfg = config(env);
    return !isDevelopment(env);
}

export function getAllowedOrigins(env = {}) {
    const cfg = config(env);
    const origins = [cfg.APP_URL, cfg.LOCAL_URL].filter(Boolean);
    return [...new Set(origins)];
}