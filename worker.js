/* ==========================================================
   ALEXA API
   File : worker.js
   Description : Cloudflare Worker API
========================================================== */

/* ==========================================================
   CONFIG
========================================================== */

const APP_NAME = "ALEXA API";
const APP_VERSION = "1.0.0";

const APP_URL = "https://alexa-chain.web.app";
const MINING_DURATION = 24 * 60 * 60 * 1000; // 24 jam
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects";

let accessToken = null;
let tokenExpire = 0;

/* ==========================================================
   CORS
========================================================== */

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": APP_URL,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
};

/* ==========================================================
   RESPONSE
========================================================== */

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...CORS_HEADERS
        }
    });
}

function success(data = {}, status = 200) {
    return jsonResponse({
        success: true,
        app: APP_NAME,
        version: APP_VERSION,
        ...data
    }, status);
}

function error(message = "Unknown Error", status = 500, extra = {}) {
    return jsonResponse({
        success: false,
        app: APP_NAME,
        version: APP_VERSION,
        message,
        ...extra
    }, status);
}

/* ==========================================================
   REQUEST HELPERS
========================================================== */

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return {};
    }
}

function getNow() {
    return Date.now();
}

function addMs(ts, ms) {
    return Number(ts || 0) + Number(ms || 0);
}

function remainingMs(nextClaim, now) {
    return Math.max(0, Number(nextClaim || 0) - Number(now || 0));
}

function uuid() {
    return crypto.randomUUID();
}

/* ==========================================================
   FIREBASE SERVICE ACCOUNT
========================================================== */

function firebaseConfig(env) {
    return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
}

function projectId(env) {
    return firebaseConfig(env).project_id;
}

async function importPrivateKey(key) {
    const pem = String(key)
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\n/g, "");

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

function base64UrlEncode(data) {
    return btoa(data)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

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

async function createJWT(env) {
    const config = firebaseConfig(env);
    const encoder = new TextEncoder();

    const header = base64UrlEncode(JSON.stringify(jwtHeader()));
    const payload = base64UrlEncode(JSON.stringify(jwtPayload(config)));
    const unsigned = `${header}.${payload}`;

    const key = await importPrivateKey(config.private_key);
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        encoder.encode(unsigned)
    );

    const signed = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");

    return `${unsigned}.${signed}`;
}

async function getAccessToken(env) {
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
        throw new Error("Failed to get Google Access Token");
    }

    const json = await response.json();

    accessToken = json.access_token;
    tokenExpire = Date.now() + ((Number(json.expires_in || 3600) - 60) * 1000);

    return accessToken;
}

/* ==========================================================
   FIRESTORE REST
========================================================== */

function firestoreUrl(env, path) {
    return `${FIRESTORE_BASE}/${projectId(env)}/databases/(default)/documents/${path}`;
}

function encodeValue(value) {
    if (value === null) return { nullValue: null };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };

    if (typeof value === "number") {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
    }

    if (Array.isArray(value)) {
        return {
            arrayValue: {
                values: value.map(encodeValue)
            }
        };
    }

    if (typeof value === "object") {
        return {
            mapValue: {
                fields: encodeFields(value)
            }
        };
    }

    return { stringValue: String(value) };
}

function encodeFields(obj) {
    const fields = {};
    for (const key in obj) {
        fields[key] = encodeValue(obj[key]);
    }
    return fields;
}

function decodeValue(value) {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return Number(value.integerValue);
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.nullValue !== undefined) return null;
    if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
    if (value.mapValue) return decodeFields(value.mapValue.fields || {});
    return null;
}

function decodeFields(fields) {
    const obj = {};
    for (const key in fields) {
        obj[key] = decodeValue(fields[key]);
    }
    return obj;
}

async function getDocument(env, path) {
    const token = await getAccessToken(env);

    const response = await fetch(firestoreUrl(env, path), {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error("Firestore GET failed");
    }

    const json = await response.json();
    return decodeFields(json.fields || {});
}

async function patchDocument(env, path, data) {
    const token = await getAccessToken(env);

    const response = await fetch(firestoreUrl(env, path), {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fields: encodeFields(data)
        })
    });

    if (!response.ok) {
        throw new Error("Firestore PATCH failed");
    }

    return true;
}

async function setDocument(env, path, data) {
    return patchDocument(env, path, data);
}

async function deleteDocument(env, path) {
    const token = await getAccessToken(env);

    const response = await fetch(firestoreUrl(env, path), {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return response.ok;
}

async function runQuery(env, structuredQuery) {
    const token = await getAccessToken(env);

    const response = await fetch(
        `${FIRESTORE_BASE}/${projectId(env)}/databases/(default)/documents:runQuery`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ structuredQuery })
        }
    );

    if (!response.ok) {
        throw new Error("Firestore Query Failed");
    }

    const result = await response.json();

    return result
        .filter(x => x.document)
        .map(x => decodeFields(x.document.fields || {}));
}

/* ==========================================================
   MINING HELPERS
========================================================== */

function defaultMiningData() {
    return {
        status: "idle",
        miningRate: 0.7,
        miningDuration: MINING_DURATION,
        boost: 1,
        multiplier: 1,
        rewardVersion: 1,
        currentReward: 0.7,
        pendingLexa: 0,
        totalLexa: 0,
        stats: {
            totalSession: 0,
            totalStart: 0,
            totalClaimed: 0
        },
        settings: {
            autoRestart: false
        },
        time: {
            lastStart: null,
            nextClaim: null,
            lastClaim: null
        }
    };
}

function normalizeMining(doc = {}) {
    const base = defaultMiningData();
    return {
        ...base,
        ...doc,
        stats: {
            ...base.stats,
            ...(doc.stats || {})
        },
        settings: {
            ...base.settings,
            ...(doc.settings || {})
        },
        time: {
            ...base.time,
            ...(doc.time || {})
        }
    };
}

function calculateMiningStatus(mining) {
    const now = getNow();
    const nextClaim = mining.time?.nextClaim || null;

    let status = mining.status || "idle";
    let remaining = 0;

    if (status === "mining" && nextClaim) {
        remaining = remainingMs(nextClaim, now);
        if (remaining === 0) {
            status = "claim";
        }
    }

    return { status, remaining, nextClaim };
}

async function getMiningDoc(env, uid) {
    return getDocument(env, `mining/${uid}`);
}

async function setMiningDoc(env, uid, data) {
    return setDocument(env, `mining/${uid}`, data);
}

async function getWalletDoc(env, uid) {
    return getDocument(env, `wallet/${uid}`);
}

async function setWalletDoc(env, uid, data) {
    return setDocument(env, `wallet/${uid}`, data);
}

async function getUserDoc(env, uid) {
    return getDocument(env, `users/${uid}`);
}

async function setUserDoc(env, uid, data) {
    return setDocument(env, `users/${uid}`, data);
}

async function appendHistory(env, uid, item) {
    const id = uuid();
    return setDocument(env, `history/${uid}_${id}`, {
        uid,
        ...item,
        createdAt: item.createdAt || getNow()
    });
}

/* ==========================================================
   REFERRAL HELPERS
========================================================== */

function buildReferralCode(user = {}, uid = "") {
    if (user.referralCode) return user.referralCode;
    const suffix = String(uid || "").slice(-6).toUpperCase() || "XXXXXX";
    return `LEXA-${suffix}`;
}

async function ensureUserReferral(env, uid) {
    const user = await getUserDoc(env, uid);
    if (!user) return null;

    const referralCode = buildReferralCode(user, uid);
    const referralLink = `${APP_URL}/register.html?ref=${encodeURIComponent(referralCode)}`;

    if (user.referralCode !== referralCode || user.referralLink !== referralLink) {
        await setUserDoc(env, uid, {
            ...user,
            referralCode,
            referralLink,
            updatedAt: getNow()
        });
    }

    return {
        ...user,
        referralCode,
        referralLink
    };
}

function sortLeaderboard(items = []) {
    return [...items].sort((a, b) => {
        const ra = Number(b?.referralCount || 0);
        const rb = Number(a?.referralCount || 0);
        if (ra !== rb) return ra - rb;
        return String(a?.username || "").localeCompare(String(b?.username || ""));
    });
}
/* ==========================================================
   SECURITY HELPERS
========================================================== */

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 30;

const rateMap = new Map();
const lockMap = new Map();

function getBearerToken(request) {
    const auth = request.headers.get("Authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

function getRateKey(request, uid = "") {
    const ip =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("x-forwarded-for") ||
        "unknown";

    return `${ip}:${uid || "anon"}`;
}

function checkRateLimit(request, uid = "") {
    const key = getRateKey(request, uid);
    const now = Date.now();

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

function withLock(key) {
    if (lockMap.has(key)) {
        return false;
    }
    lockMap.set(key, true);
    return true;
}

function releaseLock(key) {
    lockMap.delete(key);
}

/* ==========================================================
   FIREBASE TOKEN VERIFICATION
========================================================== */

const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certCache = null;
let certExpire = 0;

async function getFirebaseCerts() {
    if (certCache && Date.now() < certExpire) {
        return certCache;
    }

    const response = await fetch(FIREBASE_CERTS_URL);
    if (!response.ok) {
        throw new Error("Failed to load Firebase public certs.");
    }

    const json = await response.json();
    certCache = json;
    certExpire = Date.now() + 60 * 60 * 1000;
    return certCache;
}

function base64UrlDecode(input) {
    input = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = input.length % 4;
    if (pad) input += "=".repeat(4 - pad);
    return atob(input);
}

async function verifyFirebaseIdToken(env, idToken) {
    if (!idToken) {
        throw new Error("Missing Firebase ID token.");
    }

    const [headerB64, payloadB64, sigB64] = idToken.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) {
        throw new Error("Invalid Firebase ID token.");
    }

    const payload = JSON.parse(base64UrlDecode(payloadB64));
    const header = JSON.parse(base64UrlDecode(headerB64));

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

    const certs = await getFirebaseCerts();
    const pem = certs[header.kid];

    if (!pem) {
        throw new Error("Unknown Firebase token key.");
    }

    const key = await crypto.subtle.importKey(
        "spki",
        pemToArrayBuffer(pem),
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256"
        },
        false,
        ["verify"]
    );

    const signedContent = `${headerB64}.${payloadB64}`;
    const signature = base64UrlToUint8Array(sigB64);

    const ok = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        signature,
        new TextEncoder().encode(signedContent)
    );

    if (!ok) {
        throw new Error("Invalid Firebase token signature.");
    }

    return {
        uid: payload.user_id || payload.sub,
        email: payload.email || null,
        emailVerified: Boolean(payload.email_verified)
    };
}

function pemToArrayBuffer(pem) {
    const b64 = pem
        .replace("-----BEGIN CERTIFICATE-----", "")
        .replace("-----END CERTIFICATE-----", "")
        .replace(/\s+/g, "");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

function base64UrlToUint8Array(input) {
    input = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = input.length % 4;
    if (pad) input += "=".repeat(4 - pad);
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function listWalletHistory(env, uid) {
    const history = await runQuery(env, {
        from: [{ collectionId: "history" }],
        where: {
            fieldFilter: {
                field: { fieldPath: "uid" },
                op: "EQUAL",
                value: { stringValue: uid }
            }
        },
        orderBy: [
            {
                field: { fieldPath: "createdAt" },
                direction: "DESCENDING"
            }
        ],
        limit: 50
    });

    return history;
}


/* ==========================================================
   ENDPOINTS
========================================================== */

async function handleServerPing() {
    return success({
        message: "ALEXA API Online"
    });
}

async function handleServerTime() {
    return success({
        timestamp: getNow(),
        iso: new Date().toISOString()
    });
}

async function handleMiningSync(env, request) {
    const body = await readJson(request);
    const uid = body.firebaseUid || body.uid;

    if (!uid) return error("firebaseUid is required.", 400);

    const now = getNow();
    const raw = await getMiningDoc(env, uid);
    const mining = normalizeMining(raw || {});
    const statusInfo = calculateMiningStatus(mining);

    if (statusInfo.status === "claim" && mining.status !== "claim") {
        await setMiningDoc(env, uid, {
            ...mining,
            status: "claim",
            updatedAt: now
        });
    }

    return success({
        serverTime: now,
        mining: {
            ...mining,
            status: statusInfo.status,
            time: {
                ...mining.time,
                nextClaim: statusInfo.nextClaim
            }
        },
        status: statusInfo.status,
        remaining: statusInfo.remaining,
        currentReward: mining.currentReward,
        pendingLexa: mining.pendingLexa,
        nextClaim: statusInfo.nextClaim
    });
}

async function handleMiningStart(env, request) {
    const body = await readJson(request);
    const uid = body.firebaseUid || body.uid;

    if (!uid) return error("firebaseUid is required.", 400);

    const now = getNow();
    const raw = await getMiningDoc(env, uid);
    const mining = normalizeMining(raw || {});

    if (mining.status === "mining") {
        const statusInfo = calculateMiningStatus(mining);
        return success({
            status: statusInfo.status,
            nextClaim: statusInfo.nextClaim,
            remaining: statusInfo.remaining,
            message: "Mining is already running."
        });
    }

    if (mining.status === "claim") {
        return success({
            status: "claim",
            nextClaim: mining.time?.nextClaim || null,
            remaining: 0,
            message: "Mining is ready to claim."
        });
    }

    const nextClaim = addMs(now, MINING_DURATION);

    const updated = {
        ...mining,
        status: "mining",
        miningDuration: MINING_DURATION,
        time: {
            ...mining.time,
            lastStart: now,
            nextClaim,
            lastClaim: mining.time?.lastClaim || null
        },
        stats: {
            ...mining.stats,
            totalSession: Number(mining.stats?.totalSession || 0) + 1,
            totalStart: Number(mining.stats?.totalStart || 0) + 1
        },
        updatedAt: now
    };

    await setMiningDoc(env, uid, updated);

    return success({
        status: "mining",
        serverTime: now,
        nextClaim,
        remaining: MINING_DURATION,
        mining: updated
    });
}

async function handleMiningStatus(env, request) {
    const body = await readJson(request);
    const uid = body.firebaseUid || body.uid;

    if (!uid) return error("firebaseUid is required.", 400);

    const now = getNow();
    const raw = await getMiningDoc(env, uid);
    const mining = normalizeMining(raw || {});
    const statusInfo = calculateMiningStatus(mining);

    if (statusInfo.status === "claim" && mining.status !== "claim") {
        await setMiningDoc(env, uid, {
            ...mining,
            status: "claim",
            updatedAt: now
        });
    }

    return success({
        status: statusInfo.status,
        serverTime: now,
        remaining: statusInfo.remaining,
        nextClaim: statusInfo.nextClaim
    });
}

async function handleMiningClaim(env, request) {
    const body = await readJson(request);
    const uid = body.firebaseUid || body.uid;

    if (!uid) return error("firebaseUid is required.", 400);

    const token = getBearerToken(request);
    const authUser = await verifyFirebaseIdToken(env, token);

    if (authUser.uid !== uid) {
        return error("Unauthorized mining claim.", 403);
    }

    if (!checkRateLimit(request, uid)) {
        return error("Too many requests.", 429);
    }

    const lockKey = `mining:${uid}`;
    if (!withLock(lockKey)) {
        return error("Mining claim is already processing.", 409);
    }

    try {
        const now = getNow();
        const raw = await getMiningDoc(env, uid);
        const mining = normalizeMining(raw || {});
        const statusInfo = calculateMiningStatus(mining);

        const canClaim = mining.status === "claim" || statusInfo.status === "claim";
        if (!canClaim) {
            return error("Mining is not ready to claim.", 400, {
                status: mining.status || "idle",
                remaining: statusInfo.remaining
            });
        }

        const reward = Number(mining.currentReward || mining.miningRate || 0.7) *
            Number(mining.boost || 1) *
            Number(mining.multiplier || 1);

        const pendingLexa = Number(mining.pendingLexa || 0) + reward;
        const totalLexa = Number(mining.totalLexa || 0) + reward;

        const wallet = await getWalletDoc(env, uid);
        const balance = Number(wallet?.balance || 0);

        await setWalletDoc(env, uid, {
            ...(wallet||{}),

balance:balance+reward,

updatedAt:now
        });

        await appendHistory(env, uid, {
            type: "mining",
            title: "Mining Reward",
            description: "Mining completed successfully",
            amount: reward,
            token: "LEXA",
            status: "success",
            createdAt: now
        });

        const updated = {
            ...mining,
            status: "idle",
            pendingLexa,
            totalLexa,
            time: {
                ...mining.time,
                lastClaim: now,
                nextClaim: null,
                lastStart: null
            },
            stats: {
                ...mining.stats,
                totalClaimed: Number(mining.stats?.totalClaimed || 0) + 1
            },
            updatedAt: now
        };

        await setMiningDoc(env, uid, updated);

        return success({
            status: "idle",
            serverTime: now,
            reward,
            pendingLexa,
            mining: updated
        });

    } finally {
        releaseLock(lockKey);
    }
}

async function handleReferral(env, request) {
    const body = await readJson(request);
    const uid = body.firebaseUid || body.uid;

    if (!uid) return error("firebaseUid is required.", 400);

    const user = await ensureUserReferral(env, uid);
    if (!user) return error("User not found.", 404);

    const referralCode = user.referralCode || buildReferralCode(user, uid);
    const referralLink = `${APP_URL}/register.html?ref=${encodeURIComponent(referralCode)}`;

    const history = await runQuery(env, {
        from: [{ collectionId: "users" }],
        where: {
            fieldFilter: {
                field: { fieldPath: "referredBy" },
                op: "EQUAL",
                value: { stringValue: referralCode }
            }
        }
    });

    const historyList = history.map(item => ({
        uid: item.uid || item.id || "",
        username: item.username || "User",
        avatar: item.avatar || "",
        joinedAt: item.createdAt || item.updatedAt || getNow(),
        status: item.status || "active",
        bonus: Number(item.referralBonus || item.invitedBonus || 0)
    }));

    const leaderboard = await runQuery(env, {
        from: [{ collectionId: "users" }],
        where: {
            fieldFilter: {
                field: { fieldPath: "referralCount" },
                op: "GREATER_THAN",
                value: { integerValue: "0" }
            }
        },
        orderBy: [
            {
                field: { fieldPath: "referralCount" },
                direction: "DESCENDING"
            }
        ],
        limit: 10
    });

    const topList = sortLeaderboard(leaderboard).map(item => ({
        uid: item.uid || item.id || "",
        username: item.username || "User",
        avatar: item.avatar || "",
        referralCount: Number(item.referralCount || 0),
        reward: Number(item.referralReward || item.referralBonus || 0)
    }));

    const invitedMembers = historyList.length;
    const referralBonus = historyList.reduce((sum, item) => sum + Number(item.bonus || 0), 0);

    return success({
        user: {
            uid: user.id || uid,
            username: user.username || user.displayName || "User",
            avatar: user.avatar || ""
        },
        referralCode,
        referralLink,
        invitedMembers,
        referralBonus,
        history: historyList,
        leaderboard: topList
    });
}
async function handleWallet(env, request) {
    const body = await readJson(request);
    const uid = body.firebaseUid || body.uid;

    if (!uid) return error("firebaseUid is required.", 400);

    const token = getBearerToken(request);
    const authUser = await verifyFirebaseIdToken(env, token);

    if (authUser.uid !== uid) {
        return error("Unauthorized wallet access.", 403);
    }

    if (!checkRateLimit(request, uid)) {
        return error("Too many requests.", 429);
    }

    const wallet = await getWalletDoc(env, uid);
    const mining = await getMiningDoc(env, uid);
    const user = await getUserDoc(env, uid);

    const safeWallet = wallet || {
        uid,
        address: `LX${uid.slice(0, 12).toUpperCase()}`,
        balance: 0,
        gold: 0,
        pending: mining?.pendingLexa || 0,
        status: "Active",
        chain: "LEXA Chain",
        createdAt: getNow(),
        updatedAt: getNow()
    };
if (!wallet) {
    await setWalletDoc(env, uid, safeWallet);
}
    return success({
        wallet: safeWallet,
        user: {
            uid,
            username: user?.username || user?.displayName || "User",
            avatar: user?.avatar || ""
        }
    });
}

async function handleWalletHistory(env, request) {
    const body = await readJson(request);
    const uid = body.firebaseUid || body.uid;

    if (!uid) return error("firebaseUid is required.", 400);

    const token = getBearerToken(request);
    const authUser = await verifyFirebaseIdToken(env, token);

    if (authUser.uid !== uid) {
        return error("Unauthorized wallet history access.", 403);
    }

    if (!checkRateLimit(request, uid)) {
        return error("Too many requests.", 429);
    }

    const history = await listWalletHistory(env, uid);

    return success({
        history
    });
}


/* ==========================================================
   ROUTER
========================================================== */

const routes = {
    "GET /server/ping": handleServerPing,
    "GET /server/time": handleServerTime,
    "POST /mining/sync": handleMiningSync,
    "POST /mining/start": handleMiningStart,
    "POST /mining/status": handleMiningStatus,
    "POST /mining/claim": handleMiningClaim,
    "POST /referral": handleReferral, 
"POST /wallet": handleWallet,
"POST /wallet/history": handleWalletHistory

};

export default {
    async fetch(request, env) {
        try {
            if (request.method === "OPTIONS") {
                return new Response(null, { headers: CORS_HEADERS });
            }

            const url = new URL(request.url);
            const method = request.method.toUpperCase();
            const path = url.pathname;

            console.log(`[${method}] ${path}`);

            const route = `${method} ${path}`;
            const handler = routes[route];

            if (handler) {
                return await handler(env, request);
            }

            return error("Endpoint Not Found", 404);
        } catch (err) {
            console.error(err);
            return error(err?.message || "Internal Error", 500);
        }
    }
};