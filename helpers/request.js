/* ==========================================================
   ALEXA API
   File : helpers/request.js
   Description : Request & Utility Helpers
========================================================== */

/* ==========================================================
   REQUEST
========================================================== */

export async function readJson(request) {

    try {

        return await request.json();

    } catch {

        return {};

    }

}

/* ==========================================================
   TIME
========================================================== */

export function getNow() {

    return Date.now();

}

export function addMs(timestamp, milliseconds) {

    return Number(timestamp || 0) + Number(milliseconds || 0);

}

export function remainingMs(nextClaim, now) {

    return Math.max(

        0,

        Number(nextClaim || 0) -

        Number(now || 0)

    );

}

/* ==========================================================
   UUID
========================================================== */

export function uuid() {

    return crypto.randomUUID();

}