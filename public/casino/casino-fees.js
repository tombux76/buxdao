/**
 * Shared casino purchase fee helpers (SOL split: project wallet + treasury gas).
 * Config injected by /api/casino/config.
 */
(function (global) {
  function getProjectWallet() {
    return global.__PROJECT_WALLET__ || "";
  }

  function getTreasuryWallet() {
    return global.__TREASURY_WALLET__ || "";
  }

  function getTotalPurchaseFeeLamports() {
    return typeof global.__PURCHASE_FEE_LAMPORTS__ === "number"
      ? global.__PURCHASE_FEE_LAMPORTS__
      : 2_000_000;
  }

  function getFeeToProjectLamports() {
    return typeof global.__FEE_TO_PROJECT_LAMPORTS__ === "number"
      ? global.__FEE_TO_PROJECT_LAMPORTS__
      : 1_500_000;
  }

  function getFeeToTreasuryGasLamports() {
    return typeof global.__FEE_TO_TREASURY_GAS_LAMPORTS__ === "number"
      ? global.__FEE_TO_TREASURY_GAS_LAMPORTS__
      : 500_000;
  }

  function getPurchaseFeeSol() {
    return getTotalPurchaseFeeLamports() / 1e9;
  }

  /** web3.js Connection requires an absolute http(s) URL. */
  function getCasinoRpcUrl() {
    const configured = global.__BUX_CASINO_RPC__;
    if (configured && (configured.startsWith("http://") || configured.startsWith("https://"))) {
      return configured;
    }
    const path =
      configured && configured.startsWith("/") ? configured : "/api/solana/rpc";
    if (typeof global.location !== "undefined" && global.location.origin) {
      return global.location.origin + path;
    }
    return path;
  }

  let cachedTokenValueUsd = null;
  let tokenValueUsdPromise = null;

  async function fetchTokenValueUsd() {
    if (cachedTokenValueUsd != null) return cachedTokenValueUsd;
    if (tokenValueUsdPromise) return tokenValueUsdPromise;
    tokenValueUsdPromise = (async function () {
      try {
        const res = await fetch("/api/token-metrics");
        if (!res.ok) return null;
        const data = await res.json();
        const v = data.tokenValueUsd;
        cachedTokenValueUsd = typeof v === "number" && v > 0 ? v : null;
        return cachedTokenValueUsd;
      } catch {
        return null;
      } finally {
        tokenValueUsdPromise = null;
      }
    })();
    return tokenValueUsdPromise;
  }

  function formatUsd(usd) {
    if (usd >= 1) return "$" + usd.toFixed(2);
    if (usd >= 0.01) return "$" + usd.toFixed(2);
    return "$" + usd.toFixed(4);
  }

  function decorateBuxCostLabel(buxAmount, tokenValueUsd) {
    if (!tokenValueUsd) return String(buxAmount);
    const usd = buxAmount * tokenValueUsd;
    return buxAmount + " (" + formatUsd(usd) + ")";
  }

  async function formatBuxWithUsd(buxAmount, options) {
    const opts = options || {};
    const label = opts.label || "$BUX";
    const num = Number(buxAmount);
    const buxStr = Number.isFinite(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : String(buxAmount);
    const tokenValueUsd = await fetchTokenValueUsd();
    if (!tokenValueUsd || !Number.isFinite(num)) {
      return buxStr + " " + label;
    }
    return buxStr + " " + label + " (" + formatUsd(num * tokenValueUsd) + ")";
  }

  async function updateBuxCostSelect(selectEl) {
    if (!selectEl) return;
    const tokenValueUsd = await fetchTokenValueUsd();
    const selected = selectEl.value;
    for (const opt of selectEl.options) {
      const bux = Number.parseInt(opt.value, 10);
      if (!Number.isFinite(bux)) continue;
      opt.textContent = decorateBuxCostLabel(bux, tokenValueUsd);
    }
    if (selected) selectEl.value = selected;
  }

  function ensurePurchaseProcessingOverlay() {
    let el = document.getElementById("casino-purchase-processing");
    if (el) return el;

    if (!document.getElementById("casino-purchase-processing-styles")) {
      const style = document.createElement("style");
      style.id = "casino-purchase-processing-styles";
      style.textContent =
        "#casino-purchase-processing{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.72);backdrop-filter:blur(4px)}" +
        "#casino-purchase-processing.show{display:flex}" +
        ".casino-processing-panel{max-width:400px;width:100%;padding:28px 24px;border-radius:14px;border:1px solid rgba(139,92,246,.45);background:#1a1228;box-shadow:0 12px 40px rgba(0,0,0,.45);text-align:center}" +
        ".casino-processing-spinner{width:40px;height:40px;margin:0 auto 18px;border:3px solid rgba(139,92,246,.25);border-top-color:#8b5cf6;border-radius:50%;animation:casino-processing-spin .85s linear infinite}" +
        "@keyframes casino-processing-spin{to{transform:rotate(360deg)}}" +
        ".casino-processing-title{margin:0 0 10px;font-size:20px;font-weight:700;color:#f3f0ff}" +
        ".casino-processing-text{margin:0 0 12px;font-size:15px;line-height:1.5;color:#d4cce8}" +
        ".casino-processing-warning{margin:0;font-size:13px;font-weight:600;color:#fbbf24}";
      document.head.appendChild(style);
    }

    el = document.createElement("div");
    el.id = "casino-purchase-processing";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-live", "assertive");
    el.innerHTML =
      '<div class="casino-processing-panel">' +
      '<div class="casino-processing-spinner" aria-hidden="true"></div>' +
      '<h2 class="casino-processing-title">Processing purchase</h2>' +
      '<p class="casino-processing-text"></p>' +
      '<p class="casino-processing-warning">Please do not refresh or close this page.</p>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function showPurchaseProcessing(message, title) {
    const el = ensurePurchaseProcessingOverlay();
    const titleEl = el.querySelector(".casino-processing-title");
    const textEl = el.querySelector(".casino-processing-text");
    if (titleEl) titleEl.textContent = title || "Processing purchase";
    if (textEl) {
      textEl.textContent =
        message || "Confirming your purchase on-chain. This may take a minute.";
    }
    el.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function hidePurchaseProcessing() {
    const el = document.getElementById("casino-purchase-processing");
    if (el) el.classList.remove("show");
    document.body.style.overflow = "";
  }

  async function confirmTransactionBestEffort(connection, signature) {
    if (!connection || !signature) return;
    try {
      await connection.confirmTransaction(signature, "confirmed");
    } catch (err) {
      console.warn("Client confirmation timed out; server will verify on-chain:", err);
    }
  }

  async function confirmCollectWithServer(params) {
    const wallet = params.wallet;
    const signature = params.signature;
    const amount = params.amount;
    const gameType = params.gameType || "slots";
    const token = params.token || "bux";
    const maxAttempts = params.maxAttempts || 20;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch("/api/confirm-collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: wallet,
          signature: signature,
          amount: amount,
          gameType: gameType,
          token: token,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {}

      if (res.status === 200) {
        return data;
      }
      if (
        res.status === 202 ||
        (res.status === 400 && data.error === "Transaction not found")
      ) {
        await sleep(Math.min(1500 + attempt * 400, 6000));
        continue;
      }
      lastError = new Error(data.message || data.error || "Confirm collect failed");
      if (attempt < maxAttempts - 1 && res.status >= 500) {
        await sleep(2000);
        continue;
      }
      throw lastError;
    }

    throw lastError || new Error("Could not confirm collect with server. Try again in a minute.");
  }

  function addPurchaseSolFeeTransfers(transaction, SystemProgram, PublicKey, userPublicKey) {
    const project = getProjectWallet();
    const treasury = getTreasuryWallet();
    const toProject = getFeeToProjectLamports();
    const toTreasury = getFeeToTreasuryGasLamports();

    if (project && toProject > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userPublicKey,
          toPubkey: new PublicKey(project),
          lamports: toProject,
        }),
      );
    }

    if (treasury && toTreasury > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userPublicKey,
          toPubkey: new PublicKey(treasury),
          lamports: toTreasury,
        }),
      );
    }
  }

  global.CasinoFees = {
    getProjectWallet,
    getTreasuryWallet,
    getTotalPurchaseFeeLamports,
    getFeeToProjectLamports,
    getFeeToTreasuryGasLamports,
    getPurchaseFeeSol,
    getCasinoRpcUrl,
    addPurchaseSolFeeTransfers,
    fetchTokenValueUsd,
    updateBuxCostSelect,
    formatBuxWithUsd,
    showPurchaseProcessing,
    hidePurchaseProcessing,
    showCasinoProcessing: showPurchaseProcessing,
    hideCasinoProcessing: hidePurchaseProcessing,
    confirmTransactionBestEffort,
    confirmCollectWithServer,
  };
})(window);
