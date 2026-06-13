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
    addPurchaseSolFeeTransfers,
  };
})(window);
