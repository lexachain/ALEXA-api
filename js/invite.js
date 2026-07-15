/* ==========================================================
   ALEXA
   File : invite.js
   Description : Referral / Invite Controller
========================================================== */

import { auth, onAuthStateChanged } from "./firebase.js";
import * as Worker from "./app-worker.js";

/* ==========================================================
   CONFIG
========================================================== */

const LOGIN_PAGE = "login.html";
const DEFAULT_AVATAR = "assets/avatar/default.png";

/* ==========================================================
   DOM
========================================================== */

const $ = (id) => document.getElementById(id);

const dom = {
    referralCode: $("referralCode"),
    referralLink: $("referralLink"),
    invitedMembers: $("invitedMembers"),
    referralBonus: $("referralBonus"),
    historyContent: $("historyContent"),
    leaderboardList: $("leaderboardList"),

    copyCodeBtn: $("copyCodeBtn"),
    copyLinkBtn: $("copyLinkBtn"),
    toggleHistory: $("toggleHistory"),
    leaderboardBtn: $("leaderboardBtn"),
    closeLeaderboard: $("closeLeaderboard"),

    copyModal: $("copyModal"),
    copyTitle: $("copyTitle"),
    copyMessage: $("copyMessage"),
    copyOkBtn: $("copyOkBtn"),

    userAvatar: $("userAvatar"),
    username: $("username"),
    loadingOverlay: $("loadingOverlay"),
    loadingText: $("loadingText"),
    overlay: $("overlay"),

    navHome: $("navHome"),
    navApps: $("navApps"),
    navCommunity: $("navCommunity"),
    navInvite: $("navInvite"),
    navWallet: $("navWallet")
};

/* ==========================================================
   STATE
========================================================== */

const state = {
    firebaseUser: null,
    referralData: null,
    initialized: false
};

/* ==========================================================
   INIT
========================================================== */

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
    if (state.initialized) return;
    state.initialized = true;

    bindEvents();
    setActiveNavigation();
    observeAuth();
}

/* ==========================================================
   AUTH
========================================================== */

function observeAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            location.replace(LOGIN_PAGE);
            return;
        }

        state.firebaseUser = user;
        await loadReferral();
    });
}

/* ==========================================================
   LOAD REFERRAL
========================================================== */

async function loadReferral() {
    try {
        showLoading("Loading referral...", true);

        const data = await Worker.syncReferral(state.firebaseUser.uid);
        state.referralData = data || {};

        renderReferral();
        renderHistory();
        renderLeaderboard();
    } catch (error) {
        console.error(error);
        showToast("error", "Referral Error", error.message || "Failed to load referral data.");
    } finally {
        hideLoading();
    }
}

/* ==========================================================
   RENDER
========================================================== */

function renderReferral() {
    const data = state.referralData || {};
    const profile = data.user || {};

    if (dom.referralCode) {
        dom.referralCode.textContent = data.referralCode || "LEXA-XXXXXX";
    }

    if (dom.referralLink) {
        dom.referralLink.textContent = data.referralLink || buildReferralLink(data.referralCode || "");
    }

    if (dom.invitedMembers) {
        dom.invitedMembers.textContent = String(data.invitedMembers ?? 0);
    }

    if (dom.referralBonus) {
        dom.referralBonus.textContent = `+${Number(data.referralBonus ?? 0).toFixed(2)} Ł`;
    }

    if (dom.userAvatar) {
        dom.userAvatar.src = profile.avatar || DEFAULT_AVATAR;
    }

    if (dom.username) {
        dom.username.textContent = profile.username || profile.displayName || "User";
    }
}

function renderHistory() {
    if (!dom.historyContent) return;

    const history = state.referralData?.history || [];

    if (!history.length) {
        dom.historyContent.innerHTML = `
            <div class="empty-state">
                No referrals yet
            </div>
        `;
        return;
    }

    dom.historyContent.innerHTML = history.map((item) => {
        const name = escapeHtml(item.username || "User");
        const date = escapeHtml(formatDate(item.joinedAt || item.createdAt));
        const status = escapeHtml(item.status || "active");
        const bonus = Number(item.bonus ?? 0).toFixed(2);

        return `
            <div class="history-item">
                <div class="history-left">
                    <strong>${name}</strong>
                    <span>${date}</span>
                </div>
                <div class="history-right">
                    <span class="history-status">${status}</span>
                    <span class="history-bonus">+${bonus} Ł</span>
                </div>
            </div>
        `;
    }).join("");
}

function renderLeaderboard() {
    if (!dom.leaderboardList) return;

    const leaderboard = state.referralData?.leaderboard || [];

    if (!leaderboard.length) {
        dom.leaderboardList.innerHTML = `
            <div class="empty-state">
                No ranking available
            </div>
        `;
        return;
    }

    dom.leaderboardList.innerHTML = leaderboard.map((item, index) => {
        const name = escapeHtml(item.username || "User");
        const count = Number(item.referralCount ?? 0);
        const avatar = item.avatar || DEFAULT_AVATAR;
        const rank = String(index + 1).padStart(2, "0");

        return `
            <div class="rank-item">
                <div class="rank-left">
                    <img class="rank-avatar" src="${avatar}" alt="Avatar">
                    <div>
                        <strong>${rank}. ${name}</strong>
                        <p>${count} Friends</p>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

/* ==========================================================
   EVENTS
========================================================== */

function bindEvents() {
    dom.copyCodeBtn?.addEventListener("click", copyReferralCode);
    dom.copyLinkBtn?.addEventListener("click", copyReferralLink);
    dom.toggleHistory?.addEventListener("click", toggleHistory);
    dom.leaderboardBtn?.addEventListener("click", openLeaderboard);
    dom.closeLeaderboard?.addEventListener("click", closeLeaderboard);
    dom.copyOkBtn?.addEventListener("click", closeCopyModal);
    dom.overlay?.addEventListener("click", closeLeaderboard);

    dom.navHome?.addEventListener("click", () => location.href = "index.html");
    dom.navApps?.addEventListener("click", () => location.href = "apps.html");
    dom.navCommunity?.addEventListener("click", () => location.href = "community.html");
    dom.navInvite?.addEventListener("click", () => location.href = "invite.html");
    dom.navWallet?.addEventListener("click", () => location.href = "wallet.html");
}

function toggleHistory() {
    dom.historyContent?.classList.toggle("show");
}

function openLeaderboard() {
    dom.leaderboardList?.closest(".leaderboard-sheet")?.classList.add("show");
    dom.overlay && (dom.overlay.hidden = false);
}

function closeLeaderboard() {
    dom.leaderboardList?.closest(".leaderboard-sheet")?.classList.remove("show");
    if (dom.overlay) dom.overlay.hidden = true;
}

/* ==========================================================
   COPY
========================================================== */

async function copyReferralCode() {
    try {
        const code = dom.referralCode?.textContent?.trim();
        if (!code) return;

        await navigator.clipboard.writeText(code);
        showCopyModal("Code Copied", "Referral code copied successfully");
    } catch (error) {
        console.error(error);
        showToast("error", "Copy Failed", "Unable to copy referral code.");
    }
}

async function copyReferralLink() {
    try {
        const code = dom.referralCode?.textContent?.trim();
        if (!code) return;

        const link = buildReferralLink(code);
        await navigator.clipboard.writeText(link);
        showCopyModal("Link Copied", "Referral link copied successfully");
    } catch (error) {
        console.error(error);
        showToast("error", "Copy Failed", "Unable to copy referral link.");
    }
}

function buildReferralLink(code) {
    const base = `${location.origin}/register.html`;
    return code ? `${base}?ref=${encodeURIComponent(code)}` : base;
}

/* ==========================================================
   MODAL
========================================================== */

function showCopyModal(title, message) {
    if (dom.copyTitle) dom.copyTitle.textContent = title;
    if (dom.copyMessage) dom.copyMessage.textContent = message;
    if (dom.copyModal) dom.copyModal.classList.add("show");
}

function closeCopyModal() {
    dom.copyModal?.classList.remove("show");
}

/* ==========================================================
   NAV ACTIVE
========================================================== */

function setActiveNavigation() {
    document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.remove("active");
    });

    dom.navInvite?.classList.add("active");
}

/* ==========================================================
   LOADING
========================================================== */

function showLoading(text = "Loading...", visible = true) {
    if (dom.loadingOverlay) {
        dom.loadingOverlay.hidden = !visible;
    }

    if (dom.loadingText) {
        dom.loadingText.textContent = text;
    }
}

function hideLoading() {
    if (dom.loadingOverlay) {
        dom.loadingOverlay.hidden = true;
    }
}

/* ==========================================================
   UTIL
========================================================== */

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(value) {
    if (!value) return "-";

    try {
        const date = typeof value === "string" || typeof value === "number"
            ? new Date(value)
            : value.toDate
                ? value.toDate()
                : new Date(value);

        return new Intl.DateTimeFormat("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    } catch {
        return "-";
    }
}

function showToast(type, title, message) {
    const container = dom.toastContainer;
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(message)}</p>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}