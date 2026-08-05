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
    setDocument,
    deleteDocument,
    runQuery
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

export async function getUserDoc(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return getDocument(env, `users/${uid}`);
}

export async function setUserDoc(env, uid, data = {}) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return setDocument(env, `users/${uid}`, data);
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

async function alexaUidExists(env, alexaUid) {
    if (!alexaUid) return false;

    const result = await runQuery(env, {
        from: [
            { collectionId: "users" }
        ],
        where: {
            fieldFilter: {
                field: { fieldPath: "uid" },
                op: "EQUAL",
                value: { stringValue: alexaUid }
            }
        },
        limit: 1
    });

    return Array.isArray(result) && result.length > 0;
}

export async function generateUniqueALEXAUid(env) {
    for (let i = 0; i < UID_MAX_ATTEMPTS; i++) {
        const candidate = generateALEXAUid();
        const exists = await alexaUidExists(env, candidate);
        if (!exists) return candidate;
    }

    throw new Error("Failed to generate a unique ALEXA UID.");
}

/* ==========================================================
   SEARCH BY FIREBASE UID
========================================================== */

export async function findUserByFirebaseUid(env, firebaseUid) {
    if (!firebaseUid) {
        throw new Error("firebaseUid is required.");
    }

    const result = await runQuery(env, {
        from: [
            { collectionId: "users" }
        ],
        where: {
            fieldFilter: {
                field: { fieldPath: "firebaseUid" },
                op: "EQUAL",
                value: { stringValue: firebaseUid }
            }
        },
        limit: 1
    });

    const found = Array.isArray(result) ? result[0] : null;
    return found ? normalizeUser(found) : null;
}

export async function findUserByUid(env, uid) {
    if (!uid) {
        throw new Error("uid is required.");
    }

    const doc = await getUserDoc(env, uid).catch(() => null);
    return doc ? normalizeUser(doc) : null;
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

    const existing = await findUserByFirebaseUid(env, authUser.uid);

    if (existing) {
        const updated = await updateLastLogin(env, existing.uid, extraData);

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
            extraData.provider ||
            "google",

        status: "active",
        verified: "none",

        createdAt: now,
        updatedAt: now,
        lastLogin: now
    });

    await setUserDoc(env, alexaUid, user);

    return {
        firebaseUid: authUser.uid,
        ...user,
        existed: false
    };
}

/* ==========================================================
   UPDATE
========================================================== */

export async function updateUser(env, uid, data = {}) {
    if (!uid) {
        throw new Error("uid is required.");
    }

    if (!data || typeof data !== "object") {
        throw new Error("data object is required.");
    }

    const current = normalizeUser(
        await getUserDoc(env, uid).catch(() => null)
    );

    const updated = {
        ...current,
        ...data,
        uid,
        updatedAt: getNow()
    };

    await setUserDoc(env, uid, updated);
    return updated;
}

export async function updateAvatar(env, uid, avatarUrl) {
    if (!avatarUrl) {
        throw new Error("avatarUrl is required.");
    }

    return updateUser(env, uid, {
        avatar: avatarUrl
    });
}

export async function updateUsername(env, uid, username) {
    if (!username) {
        throw new Error("username is required.");
    }

    return updateUser(env, uid, {
        username: username.trim()
    });
}

export async function updateProfile(env, uid, profile = {}) {
    const allowed = {
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatar,
        verified: profile.verified
    };

    Object.keys(allowed).forEach((key) => {
        if (allowed[key] === undefined) delete allowed[key];
    });

    return updateUser(env, uid, allowed);
}

export async function updateLastLogin(env, uid, extraData = {}) {
    if (!uid) {
        throw new Error("uid is required.");
    }

    const current = normalizeUser(
        await getUserDoc(env, uid).catch(() => null)
    );

    const updated = {
        ...current,
        lastLogin: getNow(),
        status: extraData.status ?? current.status ?? "active",
        provider: extraData.provider ?? current.provider ?? "google"
    };

    if (extraData.avatar !== undefined && String(extraData.avatar).trim()) {
        updated.avatar = String(extraData.avatar).trim();
    }

    return updateUser(env, uid, updated);
}

export async function updateUserStatus(env, uid, status = "active") {
    if (!uid) {
        throw new Error("uid is required.");
    }

    return updateUser(env, uid, {
        status
    });
}

/* ==========================================================
   DELETE
========================================================== */

export async function deleteUser(env, uid) {

    if (!uid) {
        throw new Error("uid is required.");
    }

    return deleteDocument(env, `users/${uid}`);

}

/* ==========================================================
   SEARCH
========================================================== */

export async function getUser(env, uid) {
    const doc = await getUserDoc(env, uid).catch(() => null);
    return doc ? normalizeUser(doc) : null;
}

export async function userExists(env, uid) {
    if (!uid) return false;

    const doc = await getUserDoc(env, uid).catch(() => null);
    return Boolean(doc);
}

export async function findUserByUsername(env, username) {
    if (!username) {
        throw new Error("username is required.");
    }

    const result = await runQuery(env, {
        from: [
            { collectionId: "users" }
        ],
        where: {
            fieldFilter: {
                field: { fieldPath: "username" },
                op: "EQUAL",
                value: { stringValue: username }
            }
        },
        limit: 1
    });

    const found = Array.isArray(result) ? result[0] : null;
    return found ? normalizeUser(found) : null;
}

export async function findUserByEmail(env, email) {
    if (!email) {
        throw new Error("email is required.");
    }

    const result = await runQuery(env, {
        from: [
            { collectionId: "users" }
        ],
        where: {
            fieldFilter: {
                field: { fieldPath: "email" },
                op: "EQUAL",
                value: { stringValue: email }
            }
        },
        limit: 1
    });

    const found = Array.isArray(result) ? result[0] : null;
    return found ? normalizeUser(found) : null;
}

/* ==========================================================
   UTIL
========================================================== */

export function buildInitialUserPayload(authUser, extraData = {}) {
    return {
        firebaseUid: authUser?.uid || "",
        uid: "",

        provider:
            authUser?.providerData?.[0]?.providerId ||
            extraData.provider ||
            "google",

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

