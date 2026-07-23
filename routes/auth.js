/* ==========================================================
   ALEXA API
   File : routes/auth.js
   Description : Auth Routes
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import { success, error } from "../helpers/response.js";
import { readJson } from "../helpers/request.js";
import { verifyFirebaseIdToken } from "../helpers/auth.js";

import {
    getUser,
    createUser,
    updateUser, 
findUserByFirebaseUid
} from "../helpers/user.js";

import {
    createReferral,
    applyReferral,
    getReferralDoc
} from "../helpers/referral.js";

import {
    getMiningState,
    setMiningDoc,
    defaultMiningData
} from "../helpers/mining.js";

/* ==========================================================
   AUTH ROUTE
========================================================== */

export async function authRoute(env, request) {
    try {
        if (request.method.toUpperCase() !== "POST") {
            return error(env, "Method Not Allowed", 405);
        }

        const body = await readJson(request);

const authHeader = request.headers.get("Authorization") || "";

const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

const inviterUid = String(
    body?.inviterUid || body?.ref || ""
).trim();

        if (!idToken) {
            return error(env, "Missing idToken.", 400);
        }

        const firebaseUser = await verifyFirebaseIdToken(env, idToken);
        const uid = firebaseUser.uid;

        if (!uid) {
            return error(env, "Unauthorized user.", 401);
        }

        let user = await findUserByFirebaseUid(env, uid);
        const isNewUser = !user || !user.uid;

        if (isNewUser) {
            user = await createUser(env, {
                uid,
                email: firebaseUser.email || "",
                name: firebaseUser.name || "",
                picture: firebaseUser.picture || "",
                emailVerified: firebaseUser.emailVerified
            });
const alexaUid = user.uid;
            await createReferral(env, alexaUid);

            const miningData = defaultMiningData();
            miningData.uid = alexaUid;
            miningData.createdAt = Date.now();
            miningData.updatedAt = Date.now();

            await setMiningDoc(env, alexaUid, miningData);

if (inviterUid && inviterUid !== alexaUid) {
    await applyReferral(env, alexaUid, inviterUid);
            }
        } else {
            await updateUser(env, user.uid, {
                email: firebaseUser.email || user.email || "",
                displayName:
                    firebaseUser.name ||
                    user.displayName ||
                    user.username ||
                    "",
                username:
                    user.username ||
                    firebaseUser.name ||
                    firebaseUser.email?.split("@")[0] ||
                    uid.slice(0, 8),
                avatar: firebaseUser.picture || user.avatar || "",
                verified: Boolean(firebaseUser.emailVerified),
                lastLoginAt: Date.now()
            });
        }

        const latestUser = await getUser(env, user.uid);
const mining = await getMiningState(env, user.uid).catch(() => null);
const referral = await getReferralDoc(env, user.uid).catch(() => null);

        return success(env, {
            isNewUser,
            user: latestUser,
            mining,
            referral
        });
    } catch (err) {
        return error(env, err?.message || "Internal Error", 500);
    }
}