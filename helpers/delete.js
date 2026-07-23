/* ==========================================================
   ALEXA
   File : helpers/delete.js
========================================================== */

import { deleteUser } from "./users.js";
import { deleteWallet } from "./wallet.js";
import { deleteMining } from "./mining.js";
import { deletePet } from "./pet.js";
import { deleteReferral } from "./referral.js";

export async function deleteAccount(env, uid) {

    await Promise.all([

        deleteWallet(env, uid),
        deleteMining(env, uid),
        deletePet(env, uid),
        deleteReferral(env, uid)

    ]);

    // User dihapus terakhir
    await deleteUser(env, uid);

    return true;

}