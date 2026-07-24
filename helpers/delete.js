/* ==========================================================
   ALEXA
   File : helpers/delete.js
========================================================== */

import { deleteUser } from "./user.js";
import { deleteWallet } from "./wallet.js";
import { deleteMining } from "./mining.js";
import { deleteReferral } from "./referral.js";

export async function deleteAccount(env, uid) {

    await Promise.all([

        deleteWallet(env, uid),
        deleteMining(env, uid),
        deleteReferral(env, uid)

    ]);

    // User dihapus terakhir
    await deleteUser(env, uid);

    return true;

}