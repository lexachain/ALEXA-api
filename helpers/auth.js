/* ==========================================================
   ALEXA API
   File : helpers/auth.js
   Description : Firebase Auth & Google API Helpers
========================================================== */

/* ==========================================================
   CONFIG
========================================================== */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

let accessToken = null;
let tokenExpire = 0;

/* ==========================================================
   FIREBASE SERVICE ACCOUNT
========================================================== */

export function firebaseConfig(env) {
    if (!env?.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error("Missing FIREBASE_SERVICE_ACCOUNT.");
    }

    const raw = env.FIREBASE_SERVICE_ACCOUNT;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export function projectId(env) {
    const cfg = firebaseConfig(env);

    if (!cfg.project_id) {
        throw new Error("Missing Firebase project_id.");
    }

    return cfg.project_id;
}

/* ==========================================================
   BASE64 HELPERS
========================================================== */

function base64UrlEncode(data) {
    return btoa(data)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
    input = String(input || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const pad = input.length % 4;
    if (pad) input += "=".repeat(4 - pad);

    return atob(input);
}

/* ==========================================================
   PRIVATE KEY IMPORT
========================================================== */

async function importPrivateKey(key) {
    const pem = String(key || "")
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\n/g, "")
        .trim();

    if (!pem) {
        throw new Error("Missing private key.");
    }

    const binary = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

    return crypto.subtle.importKey(
        "pkcs8",
        binary,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256"
        },
        false,
        ["sign"]
    );
}

/* ==========================================================
   JWT
========================================================== */

function jwtHeader() {
    return {
        alg: "RS256",
        typ: "JWT"
    };
}

function jwtPayload(config) {
    const now = Math.floor(Date.now() / 1000);

    return {
        iss: config.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: GOOGLE_TOKEN_URL,
        exp: now + 3600,
        iat: now
    };
}

export async function createJWT(env) {
    const cfg = firebaseConfig(env);
    const encoder = new TextEncoder();

    if (!cfg.client_email) {
        throw new Error("Missing client_email.");
    }

    if (!cfg.private_key) {
        throw new Error("Missing private_key.");
    }

    const header = base64UrlEncode(JSON.stringify(jwtHeader()));
    const payload = base64UrlEncode(JSON.stringify(jwtPayload(cfg)));
    const unsigned = `${header}.${payload}`;

    const key = await importPrivateKey(cfg.private_key);

    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        encoder.encode(unsigned)
    );

    const signed = base64UrlEncode(
        String.fromCharCode(...new Uint8Array(signature))
    );

    return `${unsigned}.${signed}`;
}

/* ==========================================================
   ACCESS TOKEN
========================================================== */

export async function getAccessToken(env) {
    if (accessToken && Date.now() < tokenExpire) {
        return accessToken;
    }

    const jwt = await createJWT(env);

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Failed to get Google Access Token${text ? `: ${text}` : ""}`);
    }

    const json = await response.json();

    accessToken = json.access_token || null;
    tokenExpire = Date.now() + ((Number(json.expires_in || 3600) - 60) * 1000);

    if (!accessToken) {
        throw new Error("Google access_token missing.");
    }

    return accessToken;
}

/* ==========================================================
   VERIFY FIREBASE ID TOKEN
========================================================== */

export async function verifyFirebaseIdToken(env, idToken) {
    if (!idToken) {
        throw new Error("Missing Firebase ID token.");
    }

    const parts = String(idToken).split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid Firebase ID token.");
    }

    const [headerB64, payloadB64] = parts;

    let header;
    let payload;

    try {
        header = JSON.parse(base64UrlDecode(headerB64));
        payload = JSON.parse(base64UrlDecode(payloadB64));
    } catch {
        throw new Error("Invalid Firebase ID token payload.");
    }

    const now = Math.floor(Date.now() / 1000);
    const project = projectId(env);

    if (payload.aud !== project) {
        throw new Error("Invalid token audience.");
    }

    if (payload.iss !== `https://securetoken.google.com/${project}`) {
        throw new Error("Invalid token issuer.");
    }

    if (payload.exp && now >= payload.exp) {
        throw new Error("Token expired.");
    }

    if (!payload.sub) {
        throw new Error("Invalid token subject.");
    }

    if (!header.kid) {
        throw new Error("Missing token key id.");
    }

    return {
        uid: payload.user_id || payload.sub,
        email: payload.email || null,
        emailVerified: Boolean(payload.email_verified),
        name: payload.name || "",
        picture: payload.picture || "",
        firebase: payload
    };
}

/* ==========================================================
   CACHE CONTROL
========================================================== */

export function clearAuthCache() {
    accessToken = null;
    tokenExpire = 0;
}