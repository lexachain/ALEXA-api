/* ==========================================================
   ALEXA
   File : app-worker.js
   Description : Cloudflare Worker SDK
========================================================== */

/* ==========================================================
   CONFIG
========================================================== */

const API_BASE = "https://api.alexa.app";

const API_VERSION = "v1";

const API = `${API_BASE}/${API_VERSION}`;

/* ==========================================================
   DEFAULT HEADERS
========================================================== */

const DEFAULT_HEADERS = {

    "Content-Type":"application/json"

};

/* ==========================================================
   REQUEST
========================================================== */

async function request(

    endpoint,

    options={}

){

    const response = await fetch(

        API + endpoint,

        {

            headers:{

                ...DEFAULT_HEADERS,

                ...(options.headers||{})

            },

            ...options

        }

    );

    const data = await response.json();

    if(!response.ok){

        throw new Error(

            data.message ||

            "Server Error"

        );

    }

    return data;

}

/* ==========================================================
   SERVER
========================================================== */

export async function getServerTime(){

    return request(

        "/server/time"

    );

}

export async function pingServer(){

    return request(

        "/server/ping"

    );

}

/* ==========================================================
   DASHBOARD
========================================================== */

export async function syncDashboard(uid){

    return request(

        "/dashboard",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

/* ==========================================================
   MINING
========================================================== */

export async function syncMining(uid){

    return request(

        "/mining/sync",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

export async function startMining(uid){

    return request(

        "/mining/start",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

export async function claimMining(uid){

    return request(

        "/mining/claim",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

export async function miningStatus(uid){

    return request(

        "/mining/status",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

/* ==========================================================
   GOLD
========================================================== */

export async function convertGold(uid){

    return request(

        "/gold/convert",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

/* ==========================================================
   WALLET
========================================================== */

export async function syncWallet(uid){

    return request(

        "/wallet",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

export async function walletHistory(uid){

    return request(

        "/wallet/history",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

/* ==========================================================
   REFERRAL
========================================================== */

export async function syncReferral(uid){

    return request(

        "/referral",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}

/* ==========================================================
   LOGOUT
========================================================== */

export async function logout(uid){

    return request(

        "/logout",

        {

            method:"POST",

            body:JSON.stringify({

                uid

            })

        }

    );

}