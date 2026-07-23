/* ==========================================================
   ALEXA API
   File : helpers/referral.js
   Description : Referral Helpers
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import {
    getDocument,
    setDocument,
    runQuery,
    deleteDocument
} from "./firestore.js";

import {
    appendHistory
} from "./history.js";

import {
    getMiningDoc,
    setMiningDoc,
    normalizeMining
} from "./mining.js";

import {
    getNow
} from "./request.js";

/* ==========================================================
   CONFIG
========================================================== */

const INVITER_REWARD = 0.7;
const INVITEE_REWARD = 0.35;

/* ==========================================================
   DEFAULT
========================================================== */

export function defaultReferralData() {

    return {

        uid: "",

        referredBy: null,

        rewardClaimed: false,

        rewardedAt: null,

        createdAt: null,

        updatedAt: null

    };

}

export function normalizeReferral(doc = {}) {

    return {

        ...defaultReferralData(),

        ...doc

    };

}

/* ==========================================================
   DOCUMENT
========================================================== */

export async function getReferralDoc(env, uid) {

    if (!uid) {
        throw new Error("Missing uid.");
    }

    return getDocument(
        env,
        `referrals/${uid}`
    );

}

export async function setReferralDoc(env, uid, data = {}) {

    if (!uid) {
        throw new Error("Missing uid.");
    }

    return setDocument(
        env,
        `referrals/${uid}`,
        data
    );

}

/* ==========================================================
   CREATE
========================================================== */

export async function createReferral(env, uid) {

    const now = getNow();

    const exists = await getReferralDoc(env, uid);

    if (exists) {
        return normalizeReferral(exists);
    }

    const data = {

        ...defaultReferralData(),

        uid,

        createdAt: now,

        updatedAt: now

    };

    await setReferralDoc(
        env,
        uid,
        data
    );

    return data;

}

/* ==========================================================
   APPLY
========================================================== */

export async function applyReferral(
    env,
    uid,
    inviterUid
) {

    if (!uid || !inviterUid) {
        return false;
    }

    if (uid === inviterUid) {
        return false;
    }

    const referral =
        normalizeReferral(
            await getReferralDoc(env, uid)
        );

    if (referral.referredBy) {
        return false;
    }

    referral.referredBy = inviterUid;
    referral.updatedAt = getNow();

    await setReferralDoc(
        env,
        uid,
        referral
    );

    const mining =
        normalizeMining(
            await getMiningDoc(env, uid)
        );

    mining.pendingLexa =
        Number(mining.pendingLexa || 0) +
        INVITEE_REWARD;

    await setMiningDoc(
        env,
        uid,
        mining
    );

    await appendHistory(
        env,
        uid,
        {
            type: "referral",
            title: "Referral Reward",
            description: "Referral registration reward",
            amount: INVITEE_REWARD,
            token: "LEXA",
            status: "success"
        }
    );

    return true;

}

/* ==========================================================
   INVITER REWARD
========================================================== */

export async function rewardReferral(
    env,
    uid
) {

    const referral =
        normalizeReferral(
            await getReferralDoc(env, uid)
        );

    if (!referral.referredBy) {
        return false;
    }

    if (referral.rewardClaimed) {
        return false;
    }

    const inviterUid =
        referral.referredBy;

    const mining =
        normalizeMining(
            await getMiningDoc(
                env,
                inviterUid
            )
        );

    mining.pendingLexa =
        Number(mining.pendingLexa || 0) +
        INVITER_REWARD;

    await setMiningDoc(
        env,
        inviterUid,
        mining
    );

    referral.rewardClaimed = true;
    referral.rewardedAt = getNow();
    referral.updatedAt = getNow();

    await setReferralDoc(
        env,
        uid,
        referral
    );

    await appendHistory(
        env,
        inviterUid,
        {
            type: "referral",
            title: "Referral Reward",
            description: "Your referral started mining.",
            amount: INVITER_REWARD,
            token: "LEXA",
            status: "success"
        }
    );

    return true;

}

/* ==========================================================
   LINK
========================================================== */

export function getReferralLink(
    env,
    uid
) {

    const base =
        env.APP_URL ||
        "https://alexa-chain.web.app";

    return `${base}/?ref=${uid}`;

}

/* ==========================================================
   HISTORY
========================================================== */

export async function getReferralHistory(
    env,
    inviterUid
) {

    return runQuery(env, {

        from: [

            {
                collectionId: "referrals"
            }

        ],

        where: {

            fieldFilter: {

                field: {
                    fieldPath: "referredBy"
                },

                op: "EQUAL",

                value: {
                    stringValue: inviterUid
                }

            }

        }

    });

}
export async function deleteReferral(env, uid) {

    return deleteDocument(env, `referrals/${uid}`);

}
/* ==========================================================
   LEADERBOARD
========================================================== */

export async function getReferralLeaderboard(
    env,
    limit = 100
) {

    return runQuery(env, {

        from: [

            {
                collectionId: "referrals"
            }

        ],

        limit

    });

}
