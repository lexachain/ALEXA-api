/* ==========================================================
   ALEXA
   File : app.js
   Description : Main Dashboard Controller
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase.js";

import {
    getUser
} from "./user.js";

import * as Worker from "./app-worker.js";

import {
    getWallet
} from "./wallet.js";

/* ==========================================================
   CONFIG
========================================================== */

const APP_NAME = "ALEXA";

const APP_VERSION = "1.0.0";

const LOGIN_PAGE = "login.html";

const DEFAULT_AVATAR =
"assets/avatar/default.png";

const COUNTDOWN_INTERVAL = 1000;

const DASHBOARD_REFRESH = 60000;
/* ==========================================================
   GLOBAL STATE
========================================================== */

const appState = {

    initialized:false,

    loading:false,

    authenticated:false,

    online:navigator.onLine,

    firebaseUser:null,

    user:null,

    mining:null,

    wallet:null, 

countdownTimer: null,

refreshTimer: null
};

/* ==========================================================
   DOM CACHE
========================================================== */

const $ = (id) => document.getElementById(id);

const dom = {

    /* APP */

    body: $("body"),

    app: $("app"),

    overlay: $("overlay"),

    loadingOverlay: $("loadingOverlay"),

    loadingText: $("loadingText"),

    loadingBar: $("loadingBar"),

    toastContainer: $("toastContainer"),

    modalContainer: $("modalContainer"),

    /* HEADER */

    walletLexaBalance: $("walletLexaBalance"),

    btnMenu: $("btnMenu"),

    btnInbox: $("btnInbox"),

    btnNotification: $("btnNotification"),

    /* HERO */

    heroLevel: $("heroLevel"),

    heroPetStatus: $("heroPetStatus"),

    heroMiningRate: $("heroMiningRate"),

    heroNextMining: $("heroNextMining"),

    btnCollect: $("btnCollect"),

    btnCalendar: $("btnCalendar"),

    btnGift: $("btnGift"),

    btnLeaderboard: $("btnLeaderboard"),

    btnInviteQuick: $("btnInviteQuick"),

    /* DRAWER */

    drawer: $("drawerMenu"),

    drawerAvatar: $("drawerAvatar"),

    drawerUsername: $("drawerUsername"),

    drawerUid: $("drawerUid"),

    drawerLevel: $("drawerLevel"),

    menuProfile: $("menuProfile"),

    menuInvite: $("menuInvite"),

    menuRedeem: $("menuRedeem"),

    menuInviteCode: $("menuInviteCode"),

    menuLeaderboard: $("menuLeaderboard"),

    menuChannel: $("menuChannel"),

    menuSocial: $("menuSocial"),

    menuHelp: $("menuHelp"),

    menuSettings: $("menuSettings"),

    menuPrivacy: $("menuPrivacy"),

    menuLogout: $("menuLogout"),

    /* NAVIGATION */

    navHome: $("navHome"),

    navApps: $("navApps"),

    navCommunity: $("navCommunity"),

    navInvite: $("navInvite"),

    navWallet: $("navWallet"),

    /* NETWORK */

    offlineBanner: $("offlineBanner")

};
function bindEvents(){

    /* Header */

    dom.btnMenu
        ?.addEventListener(
            "click",
            toggleDrawer
        );

    /* Hero */

    dom.btnCollect
        ?.addEventListener(
            "click",
            handleMiningButton
        );

    dom.btnCalendar
        ?.addEventListener(
            "click",
            openCalendar
        );

    dom.btnGift
        ?.addEventListener(
            "click",
            openReward
        );

    dom.btnLeaderboard
        ?.addEventListener(
            "click",
            openLeaderboard
        );

    dom.btnInviteQuick
        ?.addEventListener(
            "click",
            openInvite
        );

    /* Navigation */

    dom.navHome
        ?.addEventListener(
            "click",
            ()=>location.href="index.html"
        );

    dom.navApps
        ?.addEventListener(
            "click",
            ()=>location.href="apps.html"
        );

    dom.navCommunity
?.addEventListener(
    "click",
    openCommunity
);

    dom.navInvite
        ?.addEventListener(
            "click",
            openInvite
        );

    dom.navWallet
        ?.addEventListener(
            "click",
            openWallet
        );

    /* Drawer */

    dom.menuProfile
        ?.addEventListener(
            "click",
            openProfile
        );

    dom.menuSettings
        ?.addEventListener(
            "click",
            openSettings
        );

    dom.menuLogout
        ?.addEventListener(
            "click",
            logout
        );

dom.overlay
?.addEventListener(
    "click",
    closeDrawer
);

}
function setActiveNavigation(){

    document
        .querySelectorAll(".nav-item")
        .forEach(item=>{

            item.classList.remove("active");

        });

    const page =
        location.pathname
        .split("/")
        .pop()
        .toLowerCase();

    switch(page){

        case "":
        case "index.html":
            dom.navHome?.classList.add("active");
        break;

        case "apps.html":
            dom.navApps?.classList.add("active");
        break;

        case "community.html":
            dom.navCommunity?.classList.add("active");
        break;

        case "invite.html":
            dom.navInvite?.classList.add("active");
        break;

        case "wallet.html":
            dom.navWallet?.classList.add("active");
        break;

    }

}

/* ==========================================================
   INITIALIZE
========================================================== */

document.addEventListener(

    "DOMContentLoaded",

    initializeApp

);

/* ==========================================================
   APP INITIALIZE
========================================================== */

async function initializeApp(){

    if(appState.initialized){

        return;

    }

    appState.initialized=true;

    bindGlobalEvents();

bindEvents();

setActiveNavigation();

observeNetwork();

checkAuthentication();

}

/* ==========================================================
   AUTHENTICATION
========================================================== */

function checkAuthentication(){

    onAuthStateChanged(

        auth,

        async(firebaseUser)=>{

            if(!firebaseUser){

                location.replace(LOGIN_PAGE);

                return;

            }

            appState.firebaseUser=
            firebaseUser;

            appState.authenticated=true;

            await loadDashboard();

        }

    );

}

/* ==========================================================
   DASHBOARD LOADER
========================================================== */

async function loadDashboard(){

    try{

        showLoading("Loading dashboard...",20);

const uid = appState.firebaseUser.uid;

const [

    user,
    mining,
    wallet

] = await Promise.all([

    getUser(uid),
    Worker.syncMining(uid),
    getWallet(uid).catch(() => null)

]);

appState.user = user;

appState.mining = mining;

appState.wallet = wallet;

        renderDashboard();

        hideLoading();

    }catch(error){

        console.error(error);

        hideLoading();

        showToast(

            "error",

            "Dashboard Error",

            error.message

        );

    }

}

/* ==========================================================
   RENDER ENGINE
========================================================== */

function renderDashboard(){

    renderHeader();

    renderDrawer();

    renderHero();

    renderMiningMode();

    renderWallet();    

}

/* ==========================================================
   HEADER
========================================================== */

function renderHeader(){

    if(dom.walletLexaBalance){

        dom.walletLexaBalance.textContent =
            Number(
                appState.wallet?.balance ?? 0
            ).toFixed(6);

    }

}

/* ==========================================================
   DRAWER
========================================================== */

function renderDrawer(){

    if(!appState.user){

        return;

    }

    if(dom.drawerAvatar){

        dom.drawerAvatar.src =
            appState.user.avatar ||
            DEFAULT_AVATAR;

    }

    if(dom.drawerUsername){

        dom.drawerUsername.textContent =
            appState.user.username ||
            "User";

    }

    if(dom.drawerUid){

        dom.drawerUid.textContent =
            "UID : " +
            (
                appState.user.uid ??
                "-"
            );

    }

    if(dom.drawerLevel){

        dom.drawerLevel.textContent =
            "⭐ Level " +
            (
                appState.user.level ??
                1
            );

    }

}

/* ==========================================================
   HERO
========================================================== */

function renderHero(){

    if (!appState.mining) {
    return;
}
if(dom.heroLevel){

    dom.heroLevel.textContent =
        `Lv.${appState.user?.level ?? 1}`;

}
    if(dom.heroMiningRate){

        dom.heroMiningRate.textContent =
            `${appState.mining.miningRate} LEXA / SESSION`;

    }

    if(dom.heroNextMining){

        dom.heroNextMining.textContent =
            formatCountdown(
                appState.mining.time?.nextClaim
            );

    }

}

/* ==========================================================
   MINING MODE
========================================================== */

function renderMiningMode(){

    if(!appState.mining){

        return;

    }

    const status =
        appState.mining.status;

    if(!dom.heroPetStatus ||
   !dom.btnCollect){

    return;

}

    switch(status){

        case "idle":

            dom.heroPetStatus.innerHTML =
                `<span class="status-dot ready"></span> READY`;

            dom.btnCollect.disabled = false;

            dom.btnCollect.innerHTML = `
                <i class="fa-solid fa-play"></i>
                <span>START</span>
            `;

        break;

        case "mining":

            dom.heroPetStatus.innerHTML =
                `<span class="status-dot mining"></span> MINING`;

            dom.btnCollect.disabled = true;

            dom.btnCollect.innerHTML = `
                <i class="fa-solid fa-hammer"></i>
                <span>MINING...</span>
            `;

        break;

        case "claim":

            dom.heroPetStatus.innerHTML =
                `<span class="status-dot claim"></span> CLAIM`;

            dom.btnCollect.disabled = false;

            dom.btnCollect.innerHTML = `
                <i class="fa-solid fa-gem"></i>
                <span>COLLECT</span>
            `;

        break;

        default:

            dom.heroPetStatus.innerHTML =
                `<span class="status-dot ready"></span> READY`;

    }

}
async function handleMiningButton(){

    switch(appState.mining.status){

        case "idle":

            await Worker.startMining(
    appState.firebaseUser.uid
);

await refreshDashboard();

        break;

        case "claim":

            await Worker.claimMining(
    appState.firebaseUser.uid
);

await refreshDashboard();

        break;

        default:

            return;

    }

}
/* ==========================================================
   WALLET
========================================================== */

function renderWallet(){

    if(!appState.wallet){

        return;

    }

    // Placeholder
    // Akan diisi ketika wallet page selesai.

}


/* ==========================================================
   REFRESH
========================================================== */

async function refreshDashboard(){

    if(!appState.firebaseUser){

        return;

    }

    const uid = appState.firebaseUser.uid;

const [

    user,

    mining,

    wallet

] = await Promise.all([

    getUser(uid),

    Worker.syncMining(uid),

    getWallet(uid).catch(()=>null)

]);

appState.user = user;

appState.mining = mining;

appState.wallet = wallet;

    renderDashboard();

}
function syncDashboard(){

    renderHeader();

    renderHero();

    renderMiningMode();

}
/* ==========================================================
   GLOBAL EVENTS
========================================================== */

function bindGlobalEvents(){

    window.addEventListener(

        "error",

        handleGlobalError

    );

    window.addEventListener(

        "unhandledrejection",

        handlePromiseError

    );

}

/* ==========================================================
   NETWORK
========================================================== */

function observeNetwork(){

    window.addEventListener("online",()=>{

        appState.online=true;

        if(dom.offlineBanner){

            dom.offlineBanner.hidden=true;

        }

    });

    window.addEventListener("offline",()=>{

        appState.online=false;

        if(dom.offlineBanner){

            dom.offlineBanner.hidden=false;

        }

    });

}
/* ==========================================================
   LOADING
========================================================== */

function showLoading(

    text="Loading...",

    progress=0

){

    if(dom.loadingOverlay){

        dom.loadingOverlay.hidden=false;

    }

    if(dom.loadingText){

        dom.loadingText.textContent=text;

    }

    if(dom.loadingBar){

        dom.loadingBar.style.width=

        `${progress}%`;

    }

}

function hideLoading(){

    if(dom.loadingOverlay){

        dom.loadingOverlay.hidden=true;

    }

}
function toggleDrawer(){

    dom.drawer.classList.toggle("open");

    dom.overlay.hidden =
        !dom.drawer.classList.contains("open");

}
function closeDrawer(){

    dom.drawer.classList.remove("open");

    dom.overlay.hidden=true;

}
function openWallet(){

    location.href="wallet.html";

}
function openCommunity(){

    location.href = "community.html";

}
function openInvite(){

    location.href="invite.html";

}
function openCalendar(){

    location.href="calendar.html";

}
function openReward(){

    location.href="reward.html";

}
function openLeaderboard(){

    location.href="leaderboard.html";

}
function openProfile(){

    location.href="profile.html";

}
function openSettings(){

    location.href="settings.html";

}
function sleep(ms){

    return new Promise(

        resolve =>

        setTimeout(resolve, ms)

    );

}
function escapeHtml(text){

    return String(text)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");

}
/* ==========================================================
   LOGOUT
========================================================== */

async function logout(){

    try{

        showLoading("Signing out...",100);

        await signOut(auth);

        location.replace(LOGIN_PAGE);

    }catch(error){

        console.error(error);

        showToast(
            "error",
            "Logout Failed",
            error.message
        );

    }finally{

        hideLoading();

    }

}
/* ==========================================================
   ERROR
========================================================== */

function handleGlobalError(event){

    console.error(event.error);

}

function handlePromiseError(event){

    console.error(event.reason);

}

/* ==========================================================
   TOAST PLACEHOLDER
   (Implemented on Part 4)
========================================================== */

function showToast(

    type,

    title,

    message

){

    console.log(

        type,

        title,

        message

    );

}