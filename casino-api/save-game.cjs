// Save casino game data — server-authoritative wins, verified purchases only
const { getSql, setCors, json } = require("./slots-helpers.cjs");
const { isValidWalletAddress } = require("./wallet-utils.cjs");
const { verifyPurchaseSignature, markSignatureUsed } = require("./purchase-verify.cjs");
const {
  DB_DECIMALS,
  MAX_COST_PER_SPIN,
  MAX_SPINS_PER_PURCHASE,
  MAX_FLIPS_PER_PURCHASE,
  MAX_CHIPS_PER_PURCHASE,
  toRaw6,
  calculateSlotsWin,
  generateSlotsSpin,
  generateCoinflipResult,
  calculateCoinflipWin,
  normalizeRouletteBets,
  sumRouletteStakes,
  calculateRouletteWinnings,
  generateRouletteResult,
  isCasinoPaused,
} = require("./game-logic.cjs");

function getDateET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function bumpCasinoDailyTotals({ walletAddress, tokenUsed, gameType, spentRaw }) {
  const sql = getSql();
  if (!sql) return;
  const dateEt = getDateET();
  const game = (gameType || "").toLowerCase();
  const tokenNorm = "bux";
  if (game !== "slots" && game !== "coinflip" && game !== "roulette") return;
  const spent = spentRaw != null ? BigInt(spentRaw) : 0n;
  await sql`
    INSERT INTO casino_daily_totals (date_et, wallet_address, token_used, game_type, plays, spent_raw, updated_at)
    VALUES (${dateEt}, ${walletAddress}, ${tokenNorm}, ${game}, 1, ${spent.toString()}, NOW())
    ON CONFLICT (date_et, wallet_address, token_used, game_type) DO UPDATE SET
      plays = casino_daily_totals.plays + 1,
      spent_raw = casino_daily_totals.spent_raw + ${spent.toString()},
      updated_at = NOW()
  `;
}

async function verifyAndRecordPurchase({
  walletAddress,
  gameTypeNorm,
  tokenUsedNorm,
  purchaseSignature,
  num,
  unitCost,
  purchaseTable,
}) {
  const totalTokenAmount = unitCost * num;
  await verifyPurchaseSignature({
    signature: purchaseSignature,
    walletAddress,
    gameType: gameTypeNorm,
    expectedTokenAmount: totalTokenAmount,
    recordUsed: false,
  });
  const totalCostRaw = toRaw6(totalTokenAmount).toString();
  const sql = getSql();
  if (purchaseTable === "slots_purchases") {
    await sql`INSERT INTO slots_purchases (wallet_address, token_used, cost_per_spin, num_spins, total_cost_raw) VALUES (${walletAddress}, ${tokenUsedNorm}, ${unitCost}, ${num}, ${totalCostRaw})`;
  } else if (purchaseTable === "coinflip_purchases") {
    await sql`INSERT INTO coinflip_purchases (wallet_address, token_used, cost_per_flip, num_flips, total_cost_raw) VALUES (${walletAddress}, ${tokenUsedNorm}, ${unitCost}, ${num}, ${totalCostRaw})`;
  } else {
    await sql`INSERT INTO roulette_purchases (wallet_address, token_used, cost_per_chip, num_chips, total_cost_raw) VALUES (${walletAddress}, ${tokenUsedNorm}, ${unitCost}, ${num}, ${totalCostRaw})`;
  }
  return { num, unitCost, purchaseSignature };
}

async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const sql = getSql();
  if (!sql) return json(res, 500, { error: "Database not configured" });

  try {
    const body = req.body || {};
    const {
      walletAddress,
      spinCost,
      resultSymbols,
      gameType = "slots",
      purchaseSignature,
      spinsPurchased,
      flipsPurchased,
      chipsPurchased,
      costPerChip,
      flipCost,
      choice,
      bets,
    } = body;

    const tokenUsedNorm = "bux";
    const gameTypeNorm = (gameType || "slots").toLowerCase();

    if (gameTypeNorm !== "slots" && gameTypeNorm !== "coinflip" && gameTypeNorm !== "roulette") {
      return json(res, 400, { error: "gameType must be slots, coinflip, or roulette" });
    }
    if (!walletAddress) return json(res, 400, { error: "walletAddress is required" });
    if (!isValidWalletAddress(walletAddress)) {
      return json(res, 400, { error: "Invalid wallet address format" });
    }

    // SECURITY: never accept client-set absolute unclaimed balance
    if (body.updateUnclaimedRewards !== undefined) {
      return json(res, 400, { error: "Invalid request: unclaimed rewards are server-managed" });
    }

    const now = new Date().toISOString();

    // ── Coinflip ──────────────────────────────────────────────────────────
    if (gameTypeNorm === "coinflip") {
      const rows = await sql`SELECT total_flips, total_won, total_wagered, unclaimed_rewards, flips_remaining, cost_per_flip FROM coinflip_players WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;
      let player = rows[0];

      if (flipsPurchased !== undefined && flipsPurchased > 0) {
        if (!Number.isFinite(flipsPurchased) || flipsPurchased <= 0 || flipsPurchased > MAX_FLIPS_PER_PURCHASE) {
          return json(res, 400, { error: `Invalid purchase quantity (max ${MAX_FLIPS_PER_PURCHASE})` });
        }
        if ((player?.flips_remaining || 0) > 0) {
          return json(res, 400, { error: "Cannot purchase flips while flips are remaining. Use existing flips first.", flipsRemaining: player.flips_remaining });
        }
        if (!purchaseSignature) {
          return json(res, 400, { error: "purchaseSignature is required" });
        }
        const unitCost = Math.max(Math.floor(Number(flipCost || player?.cost_per_flip || 100)), 1);
        try {
          await verifyAndRecordPurchase({
            walletAddress,
            gameTypeNorm,
            tokenUsedNorm,
            purchaseSignature,
            num: flipsPurchased,
            unitCost,
            purchaseTable: "coinflip_purchases",
          });
        } catch (e) {
          return json(res, 400, { error: e.message || "Purchase verification failed" });
        }

        if (!player) {
          await sql`INSERT INTO coinflip_players (wallet_address, total_flips, total_wagered, total_won, unclaimed_rewards, flips_remaining, cost_per_flip, token_used, created_at, updated_at)
            VALUES (${walletAddress}, 0, 0, 0, 0, ${flipsPurchased}, ${unitCost}, ${tokenUsedNorm}, ${now}, ${now})`;
        } else {
          await sql`UPDATE coinflip_players SET flips_remaining = ${flipsPurchased}, cost_per_flip = ${unitCost}, updated_at = ${now} WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;
        }
        await markSignatureUsed(sql, purchaseSignature, walletAddress, gameTypeNorm);
        return json(res, 200, { success: true, flipsRemaining: flipsPurchased, message: "Purchase recorded" });
      }

      if (!choice) {
        return json(res, 400, { error: "choice is required for coinflip" });
      }
      if (body.result !== undefined) {
        return json(res, 400, { error: "Client-provided flip result is not accepted" });
      }
      if (!player || (player.flips_remaining || 0) <= 0) {
        return json(res, 400, { error: "No flips remaining", flipsRemaining: player?.flips_remaining || 0 });
      }
      if (isCasinoPaused()) {
        return json(res, 503, { error: "Casino is temporarily paused" });
      }

      const costPerFlip = player.cost_per_flip || 100;
      const flipResult = generateCoinflipResult();
      const serverWin = calculateCoinflipWin(choice, flipResult, costPerFlip);
      const winRaw = toRaw6(serverWin);
      const wagerRaw = toRaw6(costPerFlip);
      const flipsRemaining = (player.flips_remaining || 0) - 1;

      const newUnclaimed = (BigInt(player.unclaimed_rewards || 0) + winRaw).toString();
      const newTotalWon = (BigInt(player.total_won || 0) + winRaw).toString();
      const newWagered = (BigInt(player.total_wagered || 0) + wagerRaw).toString();

      await sql`UPDATE coinflip_players SET
        total_flips = ${(player.total_flips || 0) + 1},
        total_wagered = ${newWagered},
        total_won = ${newTotalWon},
        unclaimed_rewards = ${newUnclaimed},
        flips_remaining = ${flipsRemaining},
        cost_per_flip = ${flipsRemaining === 0 ? null : costPerFlip},
        updated_at = ${now}
        WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;

      await sql`INSERT INTO coinflip_game_history (wallet_address, flip_cost, choice, result, won_amount, token_used, timestamp)
        VALUES (${walletAddress}, ${wagerRaw.toString()}, ${String(choice).toLowerCase()}, ${flipResult}, ${winRaw.toString()}, ${tokenUsedNorm}, ${now})`;
      await bumpCasinoDailyTotals({ walletAddress, tokenUsed: tokenUsedNorm, gameType: "coinflip", spentRaw: wagerRaw.toString() });

      return json(res, 200, {
        success: true,
        result: flipResult,
        wonAmount: serverWin,
        flipsRemaining,
        unclaimedRewards: Number(newUnclaimed) / Math.pow(10, DB_DECIMALS),
      });
    }

    // ── Roulette ──────────────────────────────────────────────────────────
    if (gameTypeNorm === "roulette") {
      const rows = await sql`SELECT total_spins, total_won, total_wagered, unclaimed_rewards, chips_balance, cost_per_chip FROM roulette_players WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;
      let player = rows[0];

      if (chipsPurchased !== undefined && chipsPurchased > 0) {
        if (!Number.isFinite(chipsPurchased) || chipsPurchased <= 0 || chipsPurchased > MAX_CHIPS_PER_PURCHASE) {
          return json(res, 400, { error: `Invalid purchase quantity (max ${MAX_CHIPS_PER_PURCHASE})` });
        }
        if ((player?.chips_balance || 0) > 0) {
          return json(res, 400, { error: "Use or collect chips before buying more.", chipsBalance: player.chips_balance });
        }
        if (!purchaseSignature) {
          return json(res, 400, { error: "purchaseSignature is required" });
        }
        const unitCost = Math.max(Math.floor(Number(costPerChip || player?.cost_per_chip || 100)), 1);
        try {
          await verifyAndRecordPurchase({
            walletAddress,
            gameTypeNorm,
            tokenUsedNorm,
            purchaseSignature,
            num: chipsPurchased,
            unitCost,
            purchaseTable: "roulette_purchases",
          });
        } catch (e) {
          return json(res, 400, { error: e.message || "Purchase verification failed" });
        }

        if (!player) {
          await sql`INSERT INTO roulette_players (wallet_address, token_used, total_spins, total_wagered, total_won, unclaimed_rewards, chips_balance, cost_per_chip, created_at, updated_at)
            VALUES (${walletAddress}, ${tokenUsedNorm}, 0, 0, 0, 0, ${chipsPurchased}, ${unitCost}, ${now}, ${now})`;
        } else {
          await sql`UPDATE roulette_players SET chips_balance = ${chipsPurchased}, cost_per_chip = ${unitCost}, updated_at = ${now} WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;
        }
        await markSignatureUsed(sql, purchaseSignature, walletAddress, gameTypeNorm);
        return json(res, 200, { success: true, chipsBalance: chipsPurchased, message: "Purchase recorded" });
      }

      const normalizedBets = normalizeRouletteBets(bets);
      if (!normalizedBets) {
        return json(res, 400, { error: "Valid bets object is required for roulette spin" });
      }
      if (body.resultSymbols !== undefined || body.wonAmount !== undefined || body.updateChipsBalance !== undefined) {
        return json(res, 400, { error: "Roulette spin outcome is server-managed" });
      }
      if (!player || (player.chips_balance || 0) <= 0) {
        return json(res, 400, { error: "No chips remaining", chipsBalance: player?.chips_balance || 0 });
      }

      const totalStaked = sumRouletteStakes(normalizedBets);
      if (totalStaked > (player.chips_balance || 0)) {
        return json(res, 400, { error: "Insufficient chips for bet", chipsBalance: player.chips_balance, totalStaked });
      }
      if (isCasinoPaused()) {
        return json(res, 503, { error: "Casino is temporarily paused" });
      }

      const costPerChipVal = player.cost_per_chip || 100;
      const spinResult = generateRouletteResult();
      const profitChips = calculateRouletteWinnings(normalizedBets, spinResult);
      const wonToken = profitChips * costPerChipVal;
      const spinCostToken = totalStaked * costPerChipVal;

      const winRaw = toRaw6(wonToken);
      const wagerRaw = toRaw6(spinCostToken);
      const chipsBalance = (player.chips_balance || 0) - totalStaked;

      const newUnclaimed = (BigInt(player.unclaimed_rewards || 0) + winRaw).toString();
      const newTotalWon = (BigInt(player.total_won || 0) + winRaw).toString();
      const newWagered = (BigInt(player.total_wagered || 0) + wagerRaw).toString();

      await sql`UPDATE roulette_players SET
        total_spins = ${(player.total_spins || 0) + 1},
        total_wagered = ${newWagered},
        total_won = ${newTotalWon},
        unclaimed_rewards = ${newUnclaimed},
        chips_balance = ${chipsBalance},
        updated_at = ${now}
        WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;

      await sql`INSERT INTO roulette_game_history (wallet_address, spin_cost, result_number, won_amount, token_used, timestamp)
        VALUES (${walletAddress}, ${wagerRaw.toString()}, ${String(spinResult)}, ${winRaw.toString()}, ${tokenUsedNorm}, ${now})`;
      await bumpCasinoDailyTotals({ walletAddress, tokenUsed: tokenUsedNorm, gameType: "roulette", spentRaw: wagerRaw.toString() });

      return json(res, 200, {
        success: true,
        result: spinResult,
        profitChips,
        wonAmount: wonToken,
        chipsBalance,
        unclaimedRewards: Number(newUnclaimed) / Math.pow(10, DB_DECIMALS),
      });
    }

    // ── Slots ─────────────────────────────────────────────────────────────
    const rows = await sql`SELECT total_spins, total_won, total_wagered, unclaimed_rewards, spins_remaining, cost_per_spin FROM slots_players WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;
    let player = rows[0];

    if (spinsPurchased !== undefined && spinsPurchased > 0) {
      if (!Number.isFinite(spinsPurchased) || spinsPurchased <= 0 || spinsPurchased > MAX_SPINS_PER_PURCHASE) {
        return json(res, 400, { error: `Invalid purchase quantity (max ${MAX_SPINS_PER_PURCHASE})` });
      }
      if ((player?.spins_remaining || 0) > 0) {
        return json(res, 400, { error: "Cannot purchase spins while spins are remaining. Use existing spins first.", spinsRemaining: player.spins_remaining });
      }
      if (!purchaseSignature) {
        return json(res, 400, { error: "purchaseSignature is required" });
      }
      const unitCost = Math.max(Math.floor(Number(spinCost || player?.cost_per_spin || 100)), 1);
      try {
        await verifyAndRecordPurchase({
          walletAddress,
          gameTypeNorm,
          tokenUsedNorm,
          purchaseSignature,
          num: spinsPurchased,
          unitCost,
          purchaseTable: "slots_purchases",
        });
      } catch (e) {
        return json(res, 400, { error: e.message || "Purchase verification failed" });
      }

      if (!player) {
        await sql`INSERT INTO slots_players (wallet_address, total_spins, total_wagered, total_won, unclaimed_rewards, spins_remaining, cost_per_spin, token_used, created_at, updated_at)
          VALUES (${walletAddress}, 0, 0, 0, 0, ${spinsPurchased}, ${unitCost}, ${tokenUsedNorm}, ${now}, ${now})`;
      } else {
        await sql`UPDATE slots_players SET spins_remaining = ${spinsPurchased}, cost_per_spin = ${unitCost}, updated_at = ${now} WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;
      }
      await markSignatureUsed(sql, purchaseSignature, walletAddress, gameTypeNorm);
      return json(res, 200, { success: true, spinsRemaining: spinsPurchased, message: "Purchase recorded" });
    }

    const spinRequested = body.spin === true || body.requestSpin === true;
    if (!spinRequested) {
      return json(res, 400, { error: "spin: true is required to play slots" });
    }
    if (resultSymbols !== undefined || body.wonAmount !== undefined || body.updateSpinsRemaining !== undefined) {
      return json(res, 400, { error: "Spin outcome is server-managed" });
    }
    if (!player || (player.spins_remaining || 0) <= 0) {
      return json(res, 400, { error: "No spins remaining", spinsRemaining: player?.spins_remaining || 0 });
    }
    if (isCasinoPaused()) {
      return json(res, 503, { error: "Casino is temporarily paused" });
    }

    const costPerSpin = player.cost_per_spin || 100;
    const resultSymbolsArr = generateSlotsSpin();
    const serverWin = calculateSlotsWin(resultSymbolsArr, costPerSpin);
    const winRaw = toRaw6(serverWin);
    const wagerRaw = toRaw6(costPerSpin);
    const spinsRemaining = (player.spins_remaining || 0) - 1;

    const newUnclaimed = (BigInt(player.unclaimed_rewards || 0) + winRaw).toString();
    const newTotalWon = (BigInt(player.total_won || 0) + winRaw).toString();
    const newWagered = (BigInt(player.total_wagered || 0) + wagerRaw).toString();

    await sql`UPDATE slots_players SET
      total_spins = ${(player.total_spins || 0) + 1},
      total_wagered = ${newWagered},
      total_won = ${newTotalWon},
      unclaimed_rewards = ${newUnclaimed},
      spins_remaining = ${spinsRemaining},
      cost_per_spin = ${spinsRemaining === 0 ? null : costPerSpin},
      updated_at = ${now}
      WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsedNorm}`;

    await sql`INSERT INTO slots_game_history (wallet_address, spin_cost, result_symbols, won_amount, token_used, timestamp)
      VALUES (${walletAddress}, ${wagerRaw.toString()}, ${resultSymbolsArr}, ${winRaw.toString()}, ${tokenUsedNorm}, ${now})`;
    await bumpCasinoDailyTotals({ walletAddress, tokenUsed: tokenUsedNorm, gameType: "slots", spentRaw: wagerRaw.toString() });

    return json(res, 200, {
      success: true,
      resultSymbols: resultSymbolsArr,
      wonAmount: serverWin,
      spinsRemaining,
      unclaimedRewards: Number(newUnclaimed) / Math.pow(10, DB_DECIMALS),
    });
  } catch (err) {
    console.error("Save game error:", err);
    return json(res, 500, { error: "Failed to save game data", message: err.message });
  }
}

module.exports = { handler };
