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
    addPendingLexa
} from "./pendingLexa.js";

import {
    getNow
} from "./request.js";
import {
    getMiningDoc,
    setMiningDoc,
    normalizeMining
} from "./mining.js";

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

        rewardAmount: 0,

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

    await addPendingLexa(
    env,
    uid,
    INVITEE_REWARD
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

    await addPendingLexa(
    env,
    inviterUid,
    INVITER_REWARD
);
const mining = normalizeMining(
    await getMiningDoc(env, inviterUid)
);

mining.referralBonus =
    Number(mining.referralBonus || 0) +
    INVITER_REWARD;

await setMiningDoc(
    env,
    inviterUid,
    mining
);
    referral.rewardClaimed = true;
referral.rewardAmount = INVITER_REWARD;
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

    const referrals = await runQuery(env, {

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

    const history = [];

    for (const referral of referrals) {

        const uid = referral.uid;

        if (!uid) continue;

        const user =
            await getDocument(
                env,
                `users/${uid}`
            );

        history.push({

            uid,

            username:
                user?.username ||
                user?.displayName ||
                "User",

            avatar:
                user?.avatar ||
                "assets/avatar/default.png",

            joinedAt:
                referral.createdAt,

            status:
                referral.rewardClaimed
                    ? "rewarded"
                    : "active",

            bonus:
    Number(referral.rewardAmount || 0)

        });

    }

    return history;

}
export async function deleteReferral(env, uid) {

    return deleteDocument(env, `referrals/${uid}`);

}
/* ==========================================================
   LEADERBOARD
========================================================== */

export async function getReferralLeaderboard(
    env,
    limit = 20
) {

    const referrals = await runQuery(env, {
        from: [
            {
                collectionId: "referrals"
            }
        ]
    });

    const counter = new Map();

    for (const item of referrals) {

        if (!item.referredBy) continue;

        counter.set(
            item.referredBy,
            (counter.get(item.referredBy) || 0) + 1
        );

    }

    const leaderboard = [];

    for (const [uid, referralCount] of counter.entries()) {

        const user =
            await getDocument(
                env,
                `users/${uid}`
            );

        leaderboard.push({

    uid,

    username:
        user?.username ||
        user?.displayName ||
        "User",

    avatar:
        user?.avatar ||
        "assets/avatar/default.png",

    referralCount

});

    }

    leaderboard.sort(
    (a, b) =>
        b.referralCount - a.referralCount
);

    return leaderboard.slice(0, limit);

}
