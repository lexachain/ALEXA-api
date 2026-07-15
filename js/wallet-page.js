/* ==========================================================
   ALEXA
   File : wallet-page.js
   Description : Wallet Page Controller
========================================================== */

import {
    auth,
    onAuthStateChanged
} from "./firebase.js";

import {
    getWallet,
    createWallet,
    updateWallet,
    addWalletBalance,
    subtractWalletBalance,
    addPendingWalletAmount,
    migratePendingToBalance,
    updateWalletStatus
} from "./wallet.js";

import {
    getDoc,
    doc,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { db } from "./firebase.js";

/* ==========================================================
   DOM
========================================================== */

const walletPage = document.getElementById("walletPage");
const btnBackWallet = document.getElementById("btnBackWallet");
const btnCreateWallet = document.getElementById("btnCreateWallet");
const btnCopyWalletAddress = document.getElementById("btnCopyWalletAddress");
const btnSendLexa = document.getElementById("btnSendLexa");
const btnReceiveLexa = document.getElementById("btnReceiveLexa");
const btnMigrateLexa = document.getElementById("btnMigrateLexa");
const btnHistoryLexa = document.getElementById("btnHistoryLexa");
const btnSeeAllHistory = document.getElementById("btnSeeAllHistory");

const walletHeaderBalance = document.getElementById("walletHeaderBalance");
const walletAddressText = document.getElementById("walletAddressText");
const walletChainText = document.getElementById("walletChainText");
const walletStatusText = document.getElementById("walletStatusText");

const walletBalanceText = document.getElementById("walletBalanceText");
const walletPendingText = document.getElementById("walletPendingText");
const walletReceivedText = document.getElementById("walletReceivedText");
const walletSentText = document.getElementById("walletSentText");

const walletMigrationValue = document.getElementById("walletMigrationValue");
const walletMigrationFill = document.getElementById("walletMigrationFill");
const walletReleaseRateText = document.getElementById("walletReleaseRateText");

const walletHistoryList = document.getElementById("walletHistoryList");
const walletCreateSection = document.getElementById("walletCreateSection");

/* ==========================================================
   STATE
========================================================== */

let currentUser = null;
let currentWallet = null;
let walletUnsubscribe = null;

/* ==========================================================
   INIT
========================================================== */

document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    setupAuthWatcher();
});

/* ==========================================================
   EVENTS
========================================================== */

function bindEvents() {
    btnBackWallet?.addEventListener("click", () => {
        window.history.back();
    });

    btnCreateWallet?.addEventListener("click", handleCreateWallet);
    btnCopyWalletAddress?.addEventListener("click", handleCopyAddress);
    btnSendLexa?.addEventListener("click", handleSendLexa);
    btnReceiveLexa?.addEventListener("click", handleReceiveLexa);
    btnMigrateLexa?.addEventListener("click", handleMigrateLexa);
    btnHistoryLexa?.addEventListener("click", handleHistory);
    btnSeeAllHistory?.addEventListener("click", handleHistory);
}

/* ==========================================================
   AUTH
========================================================== */

function setupAuthWatcher() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        currentUser = user;
        await loadWallet(user.uid);
    });
}

/* ==========================================================
   LOAD WALLET
========================================================== */

async function loadWallet(firebaseUid) {
    try {
        setLoadingState(true);

        if (walletUnsubscribe) {
            walletUnsubscribe();
            walletUnsubscribe = null;
        }

        const wallet = await getWallet(firebaseUid);

        if (!wallet) {
            currentWallet = null;
            renderEmptyWallet();
            setLoadingState(false);
            return;
        }

        currentWallet = wallet;
        renderWallet(wallet);
        listenWalletRealtime(firebaseUid);

        setLoadingState(false);
    } catch (error) {
        console.error(error);
        setLoadingState(false);
        showToast("error", "Wallet Error", error?.message || "Failed to load wallet.");
    }
}

/* ==========================================================
   REALTIME
========================================================== */

function listenWalletRealtime(firebaseUid) {
    const ref = doc(db, "wallets", firebaseUid);

    walletUnsubscribe = onSnapshot(ref, (snap) => {
        if (!snap.exists()) {
            currentWallet = null;
            renderEmptyWallet();
            return;
        }

        currentWallet = {
            firebaseUid: snap.id,
            ...snap.data()
        };

        renderWallet(currentWallet);
    });
}

/* ==========================================================
   RENDER
========================================================== */

function renderEmptyWallet() {
    walletHeaderBalance.textContent = "0.000000";
    walletAddressText.textContent = "LX7XXXXXXXXXXXXXXX";
    walletChainText.textContent = "BNB Smart Chain";
    walletStatusText.textContent = "Inactive";

    walletBalanceText.textContent = "0.000000";
    walletPendingText.textContent = "0.000000";
    walletReceivedText.textContent = "0.000000";
    walletSentText.textContent = "0.000000";

    walletMigrationValue.textContent = "0.000000 LEXA";
    walletMigrationFill.style.width = "0%";
    walletReleaseRateText.textContent = "30%";

    walletCreateSection.style.display = "flex";

    walletHistoryList.innerHTML = `
        <article class="wallet-history-item">
            <div class="wallet-history-icon">
                <i class="fa-solid fa-circle-info"></i>
            </div>
            <div class="wallet-history-content">
                <strong>No Wallet Yet</strong>
                <small>Create your wallet to start</small>
            </div>
            <span class="wallet-history-value">—</span>
        </article>
    `;
}

function renderWallet(wallet) {
    walletHeaderBalance.textContent = formatNumber(wallet.balance || 0);
    walletAddressText.textContent = wallet.address || "LX7XXXXXXXXXXXXXXX";
    walletChainText.textContent = chainLabel(wallet.chain);
    walletStatusText.textContent = capitalize(wallet.status || "active");

    walletBalanceText.textContent = formatNumber(wallet.balance || 0);
    walletPendingText.textContent = formatNumber(wallet.pending || 0);
    walletReceivedText.textContent = formatNumber(wallet.totalReceived || 0);
    walletSentText.textContent = formatNumber(wallet.totalSent || 0);

    walletMigrationValue.textContent = `${formatNumber(wallet.pending || 0)} LEXA`;
    walletReleaseRateText.textContent = "30%";

    const pendingPercent = Math.min(100, Math.max(0, (wallet.pending || 0) % 100));
    walletMigrationFill.style.width = `${pendingPercent}%`;

    walletCreateSection.style.display = wallet ? "none" : "flex";

    renderHistory(wallet);
}

/* ==========================================================
   HISTORY
========================================================== */

function renderHistory(wallet) {
    const items = [
        {
            icon: "fa-arrow-down",
            title: "Mining Reward",
            subtitle: "Pending LEXA added",
            value: `+${formatNumber((wallet.totalLexa || 0) - (wallet.balance || 0))}`
        },
        {
            icon: "fa-arrow-up",
            title: "Wallet Balance",
            subtitle: "Available on wallet",
            value: `${formatNumber(wallet.balance || 0)}`
        },
        {
            icon: "fa-rotate",
            title: "Migration",
            subtitle: "7-day release cycle",
            value: `${formatNumber(wallet.pending || 0)}`
        }
    ];

    walletHistoryList.innerHTML = items.map((item) => `
        <article class="wallet-history-item">
            <div class="wallet-history-icon">
                <i class="fa-solid ${item.icon}"></i>
            </div>
            <div class="wallet-history-content">
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.subtitle)}</small>
            </div>
            <span class="wallet-history-value">${escapeHtml(item.value)}</span>
        </article>
    `).join("");
}

/* ==========================================================
   ACTIONS
========================================================== */

async function handleCreateWallet() {
    if (!currentUser) return;

    try {
        setButtonLoading(btnCreateWallet, true);

        const wallet = await createWallet(currentUser.uid, {
            chain: "bsc",
            status: "active",
            label: "ALEXA Wallet"
        });

        currentWallet = wallet;
        renderWallet(wallet);
        showToast("success", "Wallet Created", `Address: ${wallet.address}`);
    } catch (error) {
        console.error(error);
        showToast("error", "Create Wallet Failed", error?.message || "Unable to create wallet.");
    } finally {
        setButtonLoading(btnCreateWallet, false);
    }
}

async function handleCopyAddress() {
    const address = currentWallet?.address;
    if (!address) {
        showToast("warning", "No Address", "Create wallet first.");
        return;
    }

    try {
        await navigator.clipboard.writeText(address);
        showToast("success", "Copied", "Wallet address copied.");
    } catch (error) {
        console.error(error);
        showToast("error", "Copy Failed", "Clipboard access denied.");
    }
}

function handleSendLexa() {
    if (!currentWallet) {
        showToast("warning", "Wallet Required", "Create wallet first.");
        return;
    }

    showToast("info", "Send", "Send feature will be connected later.");
}

function handleReceiveLexa() {
    if (!currentWallet) {
        showToast("warning", "Wallet Required", "Create wallet first.");
        return;
    }

    showToast("info", "Receive", "Receive QR feature will be added later.");
}

function handleMigrateLexa() {
    if (!currentWallet) {
        showToast("warning", "Wallet Required", "Create wallet first.");
        return;
    }

    showToast("info", "Migration", "Migration action will be connected later.");
}

function handleHistory() {
    showToast("info", "History", "Full history page will be added later.");
}

/* ==========================================================
   UI HELPERS
========================================================== */

function setLoadingState(loading) {
    if (btnCreateWallet) {
        btnCreateWallet.disabled = loading;
        btnCreateWallet.innerHTML = loading
            ? `<i class="fa-solid fa-spinner fa-spin"></i><span>Loading...</span>`
            : `<i class="fa-solid fa-wallet"></i><span>Create Wallet</span>`;
    }
}

function setButtonLoading(button, loading) {
    if (!button) return;

    button.disabled = loading;

    const icon = loading
        ? `<i class="fa-solid fa-spinner fa-spin"></i>`
        : `<i class="fa-solid fa-wallet"></i>`;

    const text = loading ? "Creating..." : "Create Wallet";

    button.innerHTML = `${icon}<span>${text}</span>`;
}

function chainLabel(chain) {
    const map = {
        bsc: "BNB Smart Chain",
        ethereum: "Ethereum",
        polygon: "Polygon"
    };
    return map[chain] || chain || "Unknown";
}

function capitalize(text) {
    return String(text)
        .charAt(0)
        .toUpperCase() + String(text).slice(1);
}

function formatNumber(value) {
    const num = Number(value) || 0;
    return num.toFixed(6);
}

function escapeHtml(text = "") {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(type, title, message) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fa-solid ${
                type === "success" ? "fa-circle-check" :
                type === "error" ? "fa-triangle-exclamation" :
                type === "warning" ? "fa-circle-exclamation" :
                "fa-circle-info"
            }"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" type="button" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="toast-progress"></div>
    `;

    container.appendChild(toast);
    toast.querySelector(".toast-close")?.addEventListener("click", () => toast.remove());

    setTimeout(() => toast.remove(), 3500);
}