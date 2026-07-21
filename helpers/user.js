/* ==========================================================
   ALEXA API
   File : helpers/user.js
   Description : User Profile Helpers
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import {
    getDocument,
    setDocument
} from "./firestore.js";

import {
    getNow
} from "./request.js";

/* ==========================================================
   DEFAULT DATA
========================================================== */

export function defaultUserData() {
    return {
        firebaseUid: "",
        uid: "",

        username: "",
        displayName: "",
        email: "",
        avatar: "",

        provider: "google",

        status: "active",

        verified: "none", // none | pending | verified | rejected

        createdAt: null,
        updatedAt: null,
        lastLogin: null
    };
}

/* ==========================================================
   NORMALIZE
========================================================== */

export function normalizeUser(doc = {}) {
    return {
        ...defaultUserData(),
        ...doc
    };
}

/* ==========================================================
   DOCUMENT
========================================================== */

export async function getUserDoc(env, firebaseUid) {
    if (!firebaseUid) {
        throw new Error("Missing firebaseUid.");
    }

    return getDocument(
        env,
        `users/${firebaseUid}`
    );
}

export async function setUserDoc(env, firebaseUid, data = {}) {
    if (!firebaseUid) {
        throw new Error("Missing firebaseUid.");
    }

    return setDocument(
        env,
        `users/${firebaseUid}`,
        data
    );
}

/* ==========================================================
   UID GENERATOR
========================================================== */

const UID_PREFIX = "LX";
const UID_DIGITS = 10;
const UID_MAX_ATTEMPTS = 20;

function generateRandomDigits(length = UID_DIGITS) {
    let out = "";
    for (let i = 0; i < length; i++) {
        out += Math.floor(Math.random() * 10).toString();
    }
    return out;
}

export function generateALEXAUid() {
    return `${UID_PREFIX}${generateRandomDigits(UID_DIGITS)}`;
}

async function aLexaUidExists(env, aLexaUid) {
    if (!aLexaUid) return false;

    const users = await getDocument(env, "users").catch(() => null);
    if (!users) return false;

    const values = Array.isArray(users)
        ? users
        : Object.values(users || {});

    return values.some((item) => item?.uid === aLexaUid);
}

export async function generateUniqueALEXAUid(env) {
    for (let i = 0; i < UID_MAX_ATTEMPTS; i++) {
        const candidate = generateALEXAUid();
        const exists = await aLexaUidExists(env, candidate);
        if (!exists) return candidate;
    }

    throw new Error("Failed to generate a unique ALEXA UID.");
}

/* ==========================================================
   CREATE
========================================================== */

function buildDisplayName(user) {
    const emailName = user?.email?.split("@")?.[0]?.trim();
    const fromName =
        user?.displayName?.trim() ||
        emailName ||
        "ALEXA User";

    return fromName.length > 24 ? fromName.slice(0, 24) : fromName;
}

function buildUsername(user) {
    const base = buildDisplayName(user)
        .replace(/\s+/g, "")
        .replace(/[^a-zA-Z0-9_.-]/g, "");

    return base || "User";
}

export async function createUser(env, authUser, extraData = {}) {
    if (!authUser?.uid) {
        throw new Error("authUser.uid is required.");
    }

    const existing = await getUserDoc(env, authUser.uid).catch(() => null);
    if (existing) {
        const updated = normalizeUser(existing);

        await updateLastLogin(env, authUser.uid, extraData);

        return {
            firebaseUid: authUser.uid,
            ...updated,
            existed: true
        };
    }

    const alexaUid = await generateUniqueALEXAUid(env);
    const now = getNow();

    const user = normalizeUser({
        firebaseUid: authUser.uid,
        uid: alexaUid,

        username: extraData.username || buildUsername(authUser),
        displayName: extraData.displayName || buildDisplayName(authUser),
        email: authUser.email || "",
        avatar: authUser.photoURL || "",

        provider:
            authUser.providerData?.[0]?.providerId ||
            "google",

        status: "active",
        verified: "none",

        createdAt: now,
        updatedAt: now,
        lastLogin: now
    });

    await setUserDoc(env, authUser.uid, user);

    return {
        firebaseUid: authUser.uid,
        ...user,
        existed: false
    };
}

/* ==========================================================
   UPDATE
========================================================== */

export async function updateUser(env, firebaseUid, data = {}) {
    if (!firebaseUid) throw new Error("firebaseUid is required.");
    if (!data || typeof data !== "object") {
        throw new Error("data object is required.");
    }

    const current = normalizeUser(
        await getUserDoc(env, firebaseUid)
    );

    const updated = {
        ...current,
        ...data,
        firebaseUid,
        updatedAt: getNow()
    };

    await setUserDoc(env, firebaseUid, updated);
    return updated;
}

export async function updateAvatar(env, firebaseUid, avatarUrl) {
    if (!avatarUrl) throw new Error("avatarUrl is required.");

    return updateUser(env, firebaseUid, {
        avatar: avatarUrl
    });
}

export async function updateUsername(env, firebaseUid, username) {
    if (!username) throw new Error("username is required.");

    return updateUser(env, firebaseUid, {
        username: username.trim()
    });
}

export async function updateProfile(env, firebaseUid, profile = {}) {
    const allowed = {
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatar,
        verified: profile.verified
    };

    Object.keys(allowed).forEach((key) => {
        if (allowed[key] === undefined) delete allowed[key];
    });

    return updateUser(env, firebaseUid, allowed);
}

export async function updateLastLogin(env, firebaseUid, extraData = {}) {
    if (!firebaseUid) {
        throw new Error("firebaseUid is required.");
    }

    return updateUser(env, firebaseUid, {
        lastLogin: getNow(),
        status: extraData.status ?? "active",
        avatar: extraData.avatar ?? "",
        provider: extraData.provider ?? "google"
    });
}

export async function updateUserStatus(env, firebaseUid, status = "active") {
    if (!firebaseUid) throw new Error("firebaseUid is required.");

    return updateUser(env, firebaseUid, {
        status
    });
}

/* ==========================================================
   DELETE
========================================================== */

export async function deleteUser(env, firebaseUid) {
    if (!firebaseUid) throw new Error("firebaseUid is required.");

    return setDocument(env, `users/${firebaseUid}`, null);
}

/* ==========================================================
   SEARCH
========================================================== */

export async function getUser(env, firebaseUid) {
    const doc = await getUserDoc(env, firebaseUid).catch(() => null);
    return doc ? normalizeUser(doc) : null;
}

export async function userExists(env, firebaseUid) {
    if (!firebaseUid) return false;

    const doc = await getUserDoc(env, firebaseUid).catch(() => null);
    return Boolean(doc);
}

export async function getUserByALEXAUid(env, aLexaUid) {
    if (!aLexaUid) throw new Error("aLexaUid is required.");

    const users = await getDocument(env, "users").catch(() => null);
    if (!users) return null;

    const values = Array.isArray(users)
        ? users
        : Object.values(users || {});

    const found = values.find((item) => item?.uid === aLexaUid);
    return found ? normalizeUser(found) : null;
}

export async function findUserByUsername(env, username) {
    if (!username) throw new Error("username is required.");

    const users = await getDocument(env, "users").catch(() => null);
    if (!users) return null;

    const values = Array.isArray(users)
        ? users
        : Object.values(users || {});

    const found = values.find((item) => item?.username === username);
    return found ? normalizeUser(found) : null;
}

export async function findUserByEmail(env, email) {
    if (!email) throw new Error("email is required.");

    const users = await getDocument(env, "users").catch(() => null);
    if (!users) return null;

    const values = Array.isArray(users)
        ? users
        : Object.values(users || {});

    const found = values.find((item) => item?.email === email);
    return found ? normalizeUser(found) : null;
}

/* ==========================================================
   UTIL
========================================================== */

export function buildInitialUserPayload(authUser, extraData = {}) {
    return {
        firebaseUid: authUser?.uid || "",
        uid: "",

        provider: authUser?.providerData?.[0]?.providerId || extraData.provider || "google",
        username: extraData.username || buildUsername(authUser),
        displayName: extraData.displayName || buildDisplayName(authUser),
        email: authUser?.email || "",
        avatar: authUser?.photoURL || extraData.avatar || "",

        status: "active",
        verified: "none",

        createdAt: null,
        updatedAt: null,
        lastLogin: null
    };
}