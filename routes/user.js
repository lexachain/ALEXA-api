/* ==========================================================
   ALEXA API
   File : routes/user.js
   Description : User Routes
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import { success, error } from "../helpers/response.js";
import { requireUser, checkRateLimit } from "../helpers/security.js";

import {
    createUser,
    getUser,
    updateUser,
    updateAvatar,
    updateUsername,
    updateProfile,
    updateLastLogin,
    updateUserStatus,
    deleteUser,
    userExists,
    findUserByUsername,
    findUserByEmail,
    findUserByFirebaseUid,
    buildInitialUserPayload
} from "../helpers/user.js";
import { deleteAccount } from "../helpers/delete.js";
/* ==========================================================
   ROUTE
========================================================== */

export async function userRoute(env, request, path) {
    try {
        const method = request.method.toUpperCase();

        switch (path) {
            case "/user/sync":
                if (method === "POST") {
                    return userSync(env, request);
                }
                break;

            case "/user/profile":
                if (method === "GET") {
                    return userProfile(env, request);
                }
                if (method === "POST" || method === "PUT") {
                    if (!checkRateLimit(request)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return userUpdateProfile(env, request);
                }
                break;

            case "/user/avatar":
                if (method === "POST") {
                    if (!checkRateLimit(request)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return userUpdateAvatar(env, request);
                }
                break;

            case "/user/username":
                if (method === "POST") {
                    if (!checkRateLimit(request)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return userUpdateUsername(env, request);
                }
                break;

            case "/user/status":
                if (method === "POST") {
                    if (!checkRateLimit(request)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return userUpdateStatus(env, request);
                }
                break;

            case "/user/delete":
                if (method === "POST" || method === "DELETE") {
                    if (!checkRateLimit(request)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return userDelete(env, request);
                }
                break;

            case "/user/check":
                if (method === "GET") {
                    return userCheck(env, request);
                }
                break;

            case "/user/search/username":
                if (method === "GET") {
                    return userSearchUsername(env, request);
                }
                break;

            case "/user/search/email":
                if (method === "GET") {
                    return userSearchEmail(env, request);
                }
                break;

            default:
                break;
        }

        return error(env, "User route not found.", 404);
    } catch (err) {
        return error(env, err?.message || "Internal Error", 500);
    }
}

/* ==========================================================
   POST /user/sync
========================================================== */

async function userSync(env, request) {
    const auth = await requireUser(env, request);
    const uid = auth.uid;

    if (!uid) {
        return error(env, "Unauthorized user.", 401);
    }

    let profile = await getUser(env, uid);

    if (!profile) {
        return error(env, "User not found.", 404);
    }

    profile = await updateLastLogin(env, profile.uid, {
        status: "active",
        avatar: auth?.picture || auth?.photoURL || "",
        provider: auth?.provider || "google"
    });

    return success(env, {
        user: profile
    });
}
/* ==========================================================
   GET /user/profile
========================================================== */

async function userProfile(env, request) {
    const auth = await requireUser(env, request);
const uid = auth.uid;

if (!uid) {
    return error(env, "Unauthorized user.", 401);
}

const profile = await getUser(env, uid);

    return success(env, {
        user: profile
    });
}

/* ==========================================================
   POST /user/profile
========================================================== */

async function userUpdateProfile(env, request) {
    const auth = await requireUser(env, request);
const uid = auth.uid;

if (!uid) {
    return error(env, "Unauthorized user.", 401);
}

const profile = await getUser(env, uid);

    if (!profile) {
        return error(env, "User not found.", 404);
    }

    const body = await request.json().catch(() => ({}));
    const data = body?.data || body || {};

    const updated = await updateProfile(env, profile.uid, data);

    return success(env, {
        user: updated
    });
}

/* ==========================================================
   POST /user/avatar
========================================================== */

async function userUpdateAvatar(env, request) {
    const auth = await requireUser(env, request);
const uid = auth.uid;

if (!uid) {
    return error(env, "Unauthorized user.", 401);
}

const profile = await getUser(env, uid);

    if (!profile) {
        return error(env, "User not found.", 404);
    }

    const body = await request.json().catch(() => ({}));
    const avatar = String(body?.avatar || body?.avatarUrl || "").trim();

    if (!avatar) {
        return error(env, "avatar is required.", 400);
    }

    const updated = await updateAvatar(env, profile.uid, avatar);

    return success(env, {
        user: updated
    });
}

/* ==========================================================
   POST /user/username
========================================================== */

async function userUpdateUsername(env, request) {
    const auth = await requireUser(env, request);
const uid = auth.uid;

if (!uid) {
    return error(env, "Unauthorized user.", 401);
}

const profile = await getUser(env, uid);

    if (!profile) {
        return error(env, "User not found.", 404);
    }

    const body = await request.json().catch(() => ({}));
    const username = String(body?.username || "").trim();

    if (!username) {
        return error(env, "username is required.", 400);
    }

    const updated = await updateUsername(env, profile.uid, username);

    return success(env, {
        user: updated
    });
}

/* ==========================================================
   POST /user/status
========================================================== */

async function userUpdateStatus(env, request) {
    const auth = await requireUser(env, request);
const uid = auth.uid;

if (!uid) {
    return error(env, "Unauthorized user.", 401);
}

const profile = await getUser(env, uid);

    if (!profile) {
        return error(env, "User not found.", 404);
    }

    const body = await request.json().catch(() => ({}));
    const status = String(body?.status || "active").trim();

    const updated = await updateUserStatus(env, profile.uid, status);

    return success(env, {
        user: updated
    });
}

/* ==========================================================
   DELETE /user/delete
========================================================== */

async function userDelete(env, request) {
    const auth = await requireUser(env, request);
const uid = auth.uid;

if (!uid) {
    return error(env, "Unauthorized user.", 401);
}

const profile = await getUser(env, uid);

    if (!profile) {
        return error(env, "User not found.", 404);
    }

    await deleteAccount(env, profile.uid);
    return success(env, {
        deleted: true
    });
}

/* ==========================================================
   GET /user/check
========================================================== */

async function userCheck(env, request) {
    const auth = await requireUser(env, request);
const uid = auth.uid;

if (!uid) {
    return error(env, "Unauthorized user.", 401);
}

const profile = await getUser(env, uid);

    return success(env, {
        exists: Boolean(profile)
    });
}

/* ==========================================================
   GET /user/search/username
========================================================== */

async function userSearchUsername(env, request) {
    const url = new URL(request.url);
    const username = String(url.searchParams.get("username") || "").trim();

    if (!username) {
        return error(env, "username is required.", 400);
    }

    const user = await findUserByUsername(env, username);

    return success(env, {
        user
    });
}

/* ==========================================================
   GET /user/search/email
========================================================== */

async function userSearchEmail(env, request) {
    const url = new URL(request.url);
    const email = String(url.searchParams.get("email") || "").trim();

    if (!email) {
        return error(env, "email is required.", 400);
    }

    const user = await findUserByEmail(env, email);

    return success(env, {
        user
    });
}