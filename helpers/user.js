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

    uid: "",

    email: "",

    username: "",

    displayName: "",

    avatar: "",

    cover: "",

    bio: "",

    level: 1,

    exp: 0,

    inviteCode: "",

    referralCount: 0,

    provider: "google",

    verified: false,

    banned: false,

    role: "user",

    lastLoginAt: null,

    createdAt: null,

    updatedAt: null

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

    return getDocument(
        env,
        `users/${uid}`
    );

}

export async function setUserDoc(env, uid, data = {}) {

    if (!uid) {
        throw new Error("Missing uid.");
    }

    return setDocument(
        env,
        `users/${uid}`,
        data
    );

}

/* ==========================================================
   CREATE
========================================================== */

export async function createUser(
    env,
    firebaseUser
) {

    const uid = firebaseUser.uid;

    const exists =
        await getUserDoc(
            env,
            uid
        );

    if (exists) {
        return normalizeUser(exists);
    }

    const now = getNow();

    const user = {

        ...defaultUserData(),

        uid,

        email:
            firebaseUser.email || "",

        username:
            firebaseUser.name ||
            firebaseUser.email?.split("@")[0] ||
            uid.substring(0, 8),

        displayName:
            firebaseUser.name || "",

        avatar:
            firebaseUser.picture || "",

        verified:
            Boolean(firebaseUser.emailVerified),

inviteCode:
    uid.substring(0, 8).toUpperCase(),

provider:
    "google",

lastLoginAt:
    now,

        createdAt: now,

        updatedAt: now

    };

    await setUserDoc(
        env,
        uid,
        user
    );

    return user;

}

/* ==========================================================
   UPDATE
========================================================== */

export async function updateUser(
    env,
    uid,
    data = {}
) {

    const current =
        normalizeUser(
            await getUserDoc(
                env,
                uid
            )
        );

    const updated = {

        ...current,

        ...data,

        uid,

        updatedAt: getNow()

    };

    await setUserDoc(
        env,
        uid,
        updated
    );

    return updated;

}

/* ==========================================================
   PROFILE
========================================================== */

export async function getUser(
    env,
    uid
) {

    return normalizeUser(
        await getUserDoc(
            env,
            uid
        )
    );

}

/* ==========================================================
   EXISTS
========================================================== */

export async function userExists(
    env,
    uid
) {

    const user =
        await getUserDoc(
            env,
            uid
        );

    return Boolean(user);

}