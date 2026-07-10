// Coin flip game – same flow as slots: buy flips, choose heads/tails, flip (win 1.9x)
const BUX_TOKEN_MINT = 'AaKrMsZkuAdJL6TKZbj7X1VaH5qWioL7oDHagQZa1w59';
const KNUKL_TOKEN_MINT = '6sYhJZDwqHpv1shyVeZ91tx8QYSiHJh2bio97Qdhq1br';
const TREASURY_WALLET = 'FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75'; // BUX casino pool fallback
const BUX_DECIMALS = 9;
const KNUKL_DECIMALS = 6;
const WIN_MULTIPLIER = 1.9;
const MAX_COST_PER_FLIP = 1500;
const MAX_FLIPS_PER_PURCHASE = 500;
const SOLSCAN_TX_BASE = 'https://solscan.io/tx/';

function isBuxToken() {
  return true;
}

function getTokenLabel() {
  return 'BUX';
}

function getTokenMint() {
  return window.__BUX_TOKEN_MINT__ || BUX_TOKEN_MINT;
}

function getTreasuryWallet() {
  const fromConfig = window.__TREASURY_WALLET__ || (window.CasinoFees && window.CasinoFees.getTreasuryWallet());
  return fromConfig || TREASURY_WALLET;
}

function getPurchaseFeeSol() {
  return window.CasinoFees ? window.CasinoFees.getPurchaseFeeSol() : 0.002;
}

function getMinSolForPurchase() {
  const fee = window.CasinoFees ? window.CasinoFees.getTotalPurchaseFeeLamports() : 2_000_000;
  return fee + 10000;
}

function getTokenDecimals() {
  return typeof window.__BUX_DECIMALS__ === 'number' ? window.__BUX_DECIMALS__ : BUX_DECIMALS;
}

function getCoinImagePath(side) {
  return `images/bux-${side}.png`;
}

let wallet = null;
let connection = null;
let tokenBalance = 0;
let balanceFetchId = 0;
let walletSetupPromise = null;
let flipsRemaining = 0;
let totalWon = 0;
let selectedSide = null;
let isFlipping = false;
let isCollecting = false;

function getRpcUrl() {
  if (window.CasinoFees && window.CasinoFees.getCasinoRpcUrl) {
    return window.CasinoFees.getCasinoRpcUrl();
  }
  return window.location.origin + '/api/solana/rpc';
}

function initConnection() {
  const rpcUrl = getRpcUrl();
  if (typeof window.solanaWeb3 !== 'undefined') {
    connection = new window.solanaWeb3.Connection(rpcUrl, 'confirmed', { commitment: 'confirmed', disableRetryOnRateLimit: false, httpHeaders: { 'Content-Type': 'application/json' } });
  } else if (typeof solanaWeb3 !== 'undefined') {
    connection = new solanaWeb3.Connection(rpcUrl, 'confirmed', { commitment: 'confirmed', disableRetryOnRateLimit: false, httpHeaders: { 'Content-Type': 'application/json' } });
  }
}

function showMessage(options) {
  const { title, message, txSignature, isError } = options;
  const modal = document.getElementById('message-modal');
  const titleEl = document.getElementById('message-modal-title');
  const textEl = document.getElementById('message-modal-text');
  const txLink = document.getElementById('message-modal-tx-link');
  if (!modal || !titleEl || !textEl) return;
  modal.classList.remove('success', 'error');
  modal.classList.add(isError ? 'error' : 'success');
  titleEl.textContent = title || (isError ? 'Error' : 'Success');
  textEl.textContent = message || '';
  if (txSignature && txLink) {
    txLink.href = SOLSCAN_TX_BASE + txSignature;
    txLink.style.display = '';
  } else if (txLink) txLink.style.display = 'none';
  modal.classList.add('show');
}

function setupMessageModal() {
  const modal = document.getElementById('message-modal');
  const closeBtn = document.getElementById('close-message-modal');
  const okBtn = document.getElementById('message-modal-ok');
  if (!modal) return;
  function close() { modal.classList.remove('show'); }
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (okBtn) okBtn.addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('show')) close(); });
}

function setCurrencyLabels() {
  const label = getTokenLabel();
  const balanceEl = document.getElementById('token-balance');
  const totalWonEl = document.getElementById('total-won');
  const grandWonEl = document.getElementById('grand-total-won');
  if (balanceEl) balanceEl.textContent = `0.00 ${label}`;
  if (totalWonEl) totalWonEl.textContent = `0.00 ${label}`;
  if (grandWonEl) grandWonEl.textContent = `0 ${label}`;
  const costLabel = document.querySelector('label[for="cost-per-flip"]');
  if (costLabel) costLabel.textContent = `Cost Per Flip (${label}):`;
  const costSelect = document.getElementById('cost-per-flip');
  if (costSelect && window.CasinoFees?.updateBuxCostSelect) {
    window.CasinoFees.updateBuxCostSelect(costSelect);
  }
}

function waitForSplToken() {
  if (window.splToken) return Promise.resolve();
  return new Promise(function (resolve) {
    var t = setTimeout(function () { resolve(); }, 5000);
    window.addEventListener('splTokenLoaded', function () { clearTimeout(t); resolve(); }, { once: true });
  });
}

async function applyWalletConnected(addr, connectContainer, walletInfo, walletAddressEl) {
  if (addr && wallet === addr && walletSetupPromise) {
    await walletSetupPromise;
    return;
  }
  wallet = addr;
  if (walletAddressEl) {
    if (addr) walletAddressEl.dataset.fullAddress = addr;
    else delete walletAddressEl.dataset.fullAddress;
  }
  if (typeof window.updateCasinoPlayerBadge === 'function') window.updateCasinoPlayerBadge(addr);
  if (connectContainer) connectContainer.style.display = addr ? 'none' : 'block';
  if (walletInfo) walletInfo.style.display = addr ? 'flex' : 'none';
  if (addr) {
    walletSetupPromise = (async function () {
      initConnection();
      await updateBalance();
      await loadPlayerData();
      updateDisplay();
      updateButtonStates();
      try { window.parent.postMessage({ type: 'WALLET_CONNECTED', address: addr }, '*'); } catch (_) {}
    })();
    try {
      await walletSetupPromise;
    } finally {
      walletSetupPromise = null;
    }
  } else {
    walletSetupPromise = null;
    try { window.parent.postMessage({ type: 'WALLET_DISCONNECTED' }, '*'); } catch (_) {}
  }
}

async function setupWalletConnection() {
  const connectBtn = document.getElementById('connect-wallet');
  const disconnectBtn = document.getElementById('disconnect-wallet');
  const walletInfo = document.getElementById('wallet-info');
  const walletAddress = document.getElementById('wallet-address');
  const connectContainer = document.getElementById('connect-wallet');

  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'CONNECT_WALLET' && connectBtn) connectBtn.click();
    if (e.data.type === 'WALLET_ADDRESS' && e.data.address) {
      applyWalletConnected(e.data.address, connectContainer, walletInfo, walletAddress);
    }
    if (e.data.type === 'TOKEN_CHANGED') {
      window.__COINFLIP_TOKEN__ = (e.data.token === 'bux') ? 'bux' : 'bux';
      tokenBalance = 0;
      flipsRemaining = 0;
      totalWon = 0;
      selectedSide = null;
      updateDisplay();
      updateButtonStates();
      loadGameStats();
      loadLeaderboard('flips');
      if (wallet) {
        updateBalance().then(() => loadPlayerData()).then(() => {
          updateDisplay();
          updateButtonStates();
        }).catch(() => {});
      }
    }
    if (e.data.type === 'DISCONNECT_WALLET') {
      if (window.solana && window.solana.disconnect) window.solana.disconnect().catch(function () {});
      wallet = null;
      connection = null;
      connectContainer.style.display = 'block';
      walletInfo.style.display = 'none';
      tokenBalance = 0;
      flipsRemaining = 0;
      totalWon = 0;
      selectedSide = null;
      updateDisplay();
      updateButtonStates();
      try { window.parent.postMessage({ type: 'WALLET_DISCONNECTED' }, '*'); } catch (_) {}
    }
  });

  if (window.self !== window.top) {
    try { window.parent.postMessage({ type: 'REQUEST_WALLET' }, '*'); } catch (_) {}
  }

  const isPhantom = typeof window.solana !== 'undefined' && (window.solana.isPhantom || typeof window.solana.connect === 'function');
  if (isPhantom) {
    try {
      if (window.solana.isConnected) {
        const resp = await window.solana.connect({ onlyIfTrusted: true });
        if (resp) await applyWalletConnected(resp.publicKey.toString(), connectContainer, walletInfo, walletAddress);
      }
    } catch (_) {}
    connectBtn.addEventListener('click', async () => {
      try {
        const resp = await window.solana.connect({ onlyIfTrusted: false });
        await applyWalletConnected(resp.publicKey.toString(), connectContainer, walletInfo, walletAddress);
      } catch (err) {
        if (err.message && (err.message.includes('User rejected') || err.message.includes('not been authorized'))) return;
        showMessage({ title: 'Connection failed', message: 'Failed to connect wallet: ' + (err.message || err), isError: true });
      }
    });
    disconnectBtn.addEventListener('click', async () => {
      if (window.solana && window.solana.disconnect) await window.solana.disconnect();
      wallet = null;
      connection = null;
      connectContainer.style.display = 'block';
      walletInfo.style.display = 'none';
      tokenBalance = 0;
      flipsRemaining = 0;
      totalWon = 0;
      selectedSide = null;
      updateDisplay();
      updateButtonStates();
      try { window.parent.postMessage({ type: 'WALLET_DISCONNECTED' }, '*'); } catch (_) {}
    });
  } else {
    connectBtn.textContent = 'Install Phantom';
    connectBtn.onclick = function () { window.open('https://phantom.app/', '_blank'); };
  }
}

async function fetchServerBuxBalance() {
  if (!wallet) return null;
  const response = await fetch(`/api/casino/token-balance?wallet=${encodeURIComponent(wallet)}`);
  if (!response.ok) return null;
  const data = await response.json();
  if (typeof data.balance === 'number' && Number.isFinite(data.balance)) return data.balance;
  return null;
}

async function updateBalance() {
  if (!wallet) return;
  const fetchId = ++balanceFetchId;

  try {
    const balance = await fetchServerBuxBalance();
    if (fetchId !== balanceFetchId) return;
    if (balance !== null) {
      tokenBalance = balance;
      updateDisplay();
      return;
    }
  } catch (error) {
    if (fetchId !== balanceFetchId) return;
    console.warn('Server balance lookup failed:', error);
  }

  if (fetchId !== balanceFetchId) return;
  if (!connection) initConnection();
  if (!connection || !window.splToken) return;

  try {
    const { PublicKey } = window.solanaWeb3 || solanaWeb3;
    const { getAssociatedTokenAddress, getAccount } = window.splToken;
    const tokenMint = new PublicKey(getTokenMint());
    const userPublicKey = new PublicKey(wallet);
    const tokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
    try {
      const account = await getAccount(connection, tokenAccount);
      if (fetchId !== balanceFetchId) return;
      tokenBalance = Number(account.amount) / Math.pow(10, getTokenDecimals());
    } catch (error) {
      if (fetchId !== balanceFetchId) return;
      const errorMsg = (error && (error.message || error.toString())) || '';
      const isNotFound = errorMsg.includes('not found') || errorMsg.includes('TokenAccountNotFoundError');
      if (errorMsg.includes('403') || errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        console.warn('RPC rate limited. Balance may not update.');
      } else if (isNotFound) {
        tokenBalance = 0;
      }
    }
    if (fetchId !== balanceFetchId) return;
    updateDisplay();
  } catch (err) {
    if (fetchId !== balanceFetchId) return;
    console.error('Balance error:', err);
  }
}

function updateDisplay() {
  const label = getTokenLabel();
  const balanceEl = document.getElementById('token-balance');
  const totalWonEl = document.getElementById('total-won');
  const flipsRemainingEl = document.getElementById('flips-remaining');
  if (balanceEl) balanceEl.textContent = `${tokenBalance.toFixed(2)} ${label}`;
  if (totalWonEl) totalWonEl.textContent = `${totalWon.toFixed(2)} ${label}`;
  if (flipsRemainingEl) flipsRemainingEl.textContent = flipsRemaining;
}

// Only one of Buy / Flip / Collect is ever enabled
function updateButtonStates() {
  const purchaseBtn = document.getElementById('purchase-flips');
  const flipBtn = document.getElementById('flip-button');
  const withdrawBtn = document.getElementById('withdraw-button');
  if (!purchaseBtn || !flipBtn || !withdrawBtn) return;

  const buyEnabled = !!wallet && !isCollecting && flipsRemaining === 0 && totalWon === 0;
  const flipEnabled = !!wallet && !isCollecting && flipsRemaining > 0 && !!selectedSide && !isFlipping;
  const collectEnabled = !!wallet && !isCollecting && flipsRemaining === 0 && totalWon > 0;

  purchaseBtn.disabled = !buyEnabled;
  flipBtn.disabled = !flipEnabled;
  withdrawBtn.disabled = !collectEnabled;
}

function setupSelectionButtons() {
  const btnHeads = document.getElementById('btn-heads');
  const btnTails = document.getElementById('btn-tails');
  const coinImage = document.getElementById('coin-image');

  function setSelection(side) {
    selectedSide = side;
    btnHeads.classList.toggle('selected', side === 'heads');
    btnTails.classList.toggle('selected', side === 'tails');
    updateButtonStates();
  }

  btnHeads.addEventListener('click', () => setSelection('heads'));
  btnTails.addEventListener('click', () => setSelection('tails'));
}

async function loadGameStats() {
  try {
    const tokenUsed = (typeof window.__COINFLIP_TOKEN__ !== 'undefined' ? window.__COINFLIP_TOKEN__ : 'bux');
    const response = await fetch(`/api/game-stats?gameType=coinflip&tokenUsed=${encodeURIComponent(tokenUsed)}`);
    if (!response.ok) return;
    const data = await response.json();
    const grandFlipsEl = document.getElementById('grand-total-flips');
    const grandWonEl = document.getElementById('grand-total-won');
    if (grandFlipsEl) grandFlipsEl.textContent = (data.grandTotalFlips || 0).toLocaleString();
    if (grandWonEl) grandWonEl.textContent = `${(data.grandTotalWon || 0).toFixed(2)} ${getTokenLabel()}`;
  } catch (_) {}
}

let isLoadingPlayer = false;
async function loadPlayerData() {
  if (!wallet || isLoadingPlayer) return;
  isLoadingPlayer = true;
  try {
    const response = await fetch(`/api/load-player?walletAddress=${encodeURIComponent(wallet)}&gameType=coinflip&tokenUsed=${typeof window.__COINFLIP_TOKEN__ !== 'undefined' ? window.__COINFLIP_TOKEN__ : 'bux'}`, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) return;
    const data = await response.json();
    totalWon = typeof data.unclaimedRewards === 'number' ? data.unclaimedRewards : 0;
    flipsRemaining = data.flipsRemaining || 0;
    if (data.costPerFlip != null && flipsRemaining > 0) {
      const costSelect = document.getElementById('cost-per-flip');
      if (costSelect) {
        const opts = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
        const nearest = opts.reduce((a, b) => Math.abs(b - data.costPerFlip) < Math.abs(a - data.costPerFlip) ? b : a);
        costSelect.value = String(nearest);
      }
    }
    updateDisplay();
    updateButtonStates();
  } catch (e) {
    if (e.name !== 'AbortError' && e.name !== 'TimeoutError') console.error('loadPlayerData', e);
  } finally {
    isLoadingPlayer = false;
  }
}

async function purchaseFlips() {
  if (!wallet) {
    showMessage({ title: 'Wallet required', message: 'Please connect your wallet first.', isError: true });
    return;
  }
  if (!connection) initConnection();
  if (!connection) {
    showMessage({ title: 'Connection error', message: 'Could not connect to Solana RPC.', isError: true });
    return;
  }
  let costPerFlip = parseInt(document.getElementById('cost-per-flip').value, 10);
  let numFlips = parseInt(document.getElementById('number-of-flips').value, 10);
  if (!costPerFlip || costPerFlip <= 0 || !numFlips || numFlips <= 0) {
    showMessage({ title: 'Invalid input', message: 'Please enter valid cost per flip and number of flips.', isError: true });
    return;
  }
  costPerFlip = Math.min(costPerFlip, MAX_COST_PER_FLIP);
  numFlips = Math.min(numFlips, MAX_FLIPS_PER_PURCHASE);
  const totalCost = costPerFlip * numFlips;

  try {
    const serverBalance = await fetchServerBuxBalance();
    if (serverBalance !== null) {
      tokenBalance = serverBalance;
      updateDisplay();
    }
  } catch (error) {
    console.warn('Could not refresh balance before purchase:', error);
  }

  if (tokenBalance < totalCost) {
    showMessage({ title: 'Insufficient balance', message: `You need ${totalCost} ${getTokenLabel()} but only have ${tokenBalance.toFixed(2)} ${getTokenLabel()}.`, isError: true });
    return;
  }
  const solBalance = await connection.getBalance(new (window.solanaWeb3 || solanaWeb3).PublicKey(wallet));
  const minSol = getMinSolForPurchase();
  if (solBalance < minSol) {
    showMessage({ title: 'Insufficient SOL', message: `Need ~${(minSol / 1e9).toFixed(4)} SOL for transaction fee (includes ${getPurchaseFeeSol()} SOL fee). You have ${(solBalance / 1e9).toFixed(4)} SOL.`, isError: true });
    return;
  }
  if (!window.splToken) {
    showMessage({ title: 'Loading', message: 'SPL token library is still loading. Please wait a moment and try again.', isError: true });
    return;
  }
  try {
    const { PublicKey, Transaction, SystemProgram } = window.solanaWeb3 || solanaWeb3;
    const { getAssociatedTokenAddress, createTransferInstruction } = window.splToken;
    const createAssociatedTokenAccountInstruction = window.splToken.createAssociatedTokenAccountInstruction || window.splToken.createAssociatedTokenAccountIdempotentInstruction;
    const tokenMint = new PublicKey(getTokenMint());
    const userPublicKey = new PublicKey(wallet);
    const treasuryPublicKey = new PublicKey(getTreasuryWallet());
    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
    const treasuryTokenAccount = await getAssociatedTokenAddress(tokenMint, treasuryPublicKey);
    const treasuryAccountInfo = await connection.getAccountInfo(treasuryTokenAccount);
    const transaction = new Transaction();
    if (!treasuryAccountInfo) {
      if (createAssociatedTokenAccountInstruction) {
        transaction.add(createAssociatedTokenAccountInstruction(
          userPublicKey,
          treasuryTokenAccount,
          treasuryPublicKey,
          tokenMint
        ));
      } else {
        showMessage({ title: 'Setup error', message: 'Could not prepare treasury token account.', isError: true });
        return;
      }
    }
    const transferAmount = BigInt(Math.floor(totalCost * Math.pow(10, getTokenDecimals())));
    transaction.add(createTransferInstruction(userTokenAccount, treasuryTokenAccount, userPublicKey, transferAmount));
    if (window.CasinoFees) {
      window.CasinoFees.addPurchaseSolFeeTransfers(transaction, SystemProgram, PublicKey, userPublicKey);
    }
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;
    let purchaseProcessing = false;
    try {
      if (window.CasinoFees?.showPurchaseProcessing) {
        window.CasinoFees.showPurchaseProcessing(
          'Confirm the purchase in your wallet.',
          'Waiting for wallet'
        );
        purchaseProcessing = true;
      }
      const signed = await window.solana.signTransaction(transaction);
      if (window.CasinoFees?.showPurchaseProcessing) {
        window.CasinoFees.showPurchaseProcessing(
          'Confirming your purchase on-chain. This may take a minute.',
          'Processing purchase'
        );
      }
      const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
      if (window.CasinoFees?.confirmTransactionBestEffort) {
        window.CasinoFees.confirmTransactionBestEffort(connection, signature);
      } else {
        connection.confirmTransaction(signature, 'confirmed').catch(function (confirmError) {
          console.warn('Client confirmation timed out; server will verify on-chain:', confirmError);
        });
      }

      flipsRemaining += numFlips;
      try {
        const saveRes = await fetch('/api/save-game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: wallet,
            flipCost: costPerFlip,
            flipsPurchased: numFlips,
            purchaseSignature: signature,
            gameType: 'coinflip',
            tokenUsed: isBuxToken() ? 'bux' : 'bux'
          })
        });
        if (!saveRes.ok) {
          const err = await saveRes.json().catch(() => ({}));
          throw new Error(err.error || 'Purchase could not be recorded');
        }
        const saveData = await saveRes.json();
        if (typeof saveData.flipsRemaining === 'number') {
          flipsRemaining = saveData.flipsRemaining;
        }
      } catch (saveErr) {
        showMessage({ title: 'Purchase sync failed', message: saveErr.message || 'Contact support if flips do not appear.', isError: true });
        return;
      }
      await updateBalance();
      updateDisplay();
      updateButtonStates();
      const successCost = window.CasinoFees?.formatBuxWithUsd
        ? await window.CasinoFees.formatBuxWithUsd(totalCost, { label: getTokenLabel() })
        : `${totalCost} ${getTokenLabel()}`;
      showMessage({ title: 'Purchase complete', message: `Purchased ${numFlips} flip(s) for ${successCost}${getPurchaseFeeSol() > 0 ? ' + ' + getPurchaseFeeSol() + ' SOL fee' : ''}.`, txSignature: signature });
    } finally {
      if (purchaseProcessing && window.CasinoFees?.hidePurchaseProcessing) {
        window.CasinoFees.hidePurchaseProcessing();
      }
    }
  } catch (err) {
    const msg = err.message || err.toString();
    if (msg.includes('User rejected') || msg.includes('rejected')) return;
    showMessage({ title: 'Purchase failed', message: 'Failed to purchase flips: ' + msg, isError: true });
  }
}

const COIN_SPIN_DURATION_MS = 1600;

async function doFlip() {
  if (isFlipping || flipsRemaining <= 0 || !selectedSide || !wallet) return;
  const costPerFlip = parseInt(document.getElementById('cost-per-flip').value, 10) || 100;
  isFlipping = true;
  updateButtonStates();

  let serverData;
  try {
    const res = await fetch('/api/save-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: wallet,
        gameType: 'coinflip',
        choice: selectedSide,
        flipCost: costPerFlip,
        tokenUsed: isBuxToken() ? 'bux' : 'bux'
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Flip failed');
    }
    serverData = await res.json();
  } catch (err) {
    isFlipping = false;
    updateButtonStates();
    showMessage({ title: 'Flip failed', message: err.message || String(err), isError: true });
    return;
  }

  const result = serverData.result;
  const won = serverData.wonAmount || 0;
  flipsRemaining = serverData.flipsRemaining ?? Math.max(0, flipsRemaining - 1);
  if (typeof serverData.unclaimedRewards === 'number') {
    totalWon = serverData.unclaimedRewards;
  } else if (won > 0) {
    totalWon += won;
  }

  const coinImage = document.getElementById('coin-image');
  if (coinImage) {
    coinImage.src = getCoinImagePath(result);
    coinImage.classList.add('coin-spinning');
  }

  setTimeout(() => {
    if (coinImage) coinImage.classList.remove('coin-spinning');

    const resultEl = document.getElementById('flip-result');
    const resultMsg = document.getElementById('flip-result-message');
    const resultAmount = document.getElementById('flip-result-amount');
    if (resultEl && resultMsg && resultAmount) {
      resultMsg.textContent = result === selectedSide ? 'You win!' : 'You lose';
      resultAmount.textContent = won > 0 ? `${won.toFixed(2)} ${getTokenLabel()}` : '';
      resultEl.style.display = 'block';
      setTimeout(() => { resultEl.style.display = 'none'; }, 2000);
    }

    loadGameStats();
    loadLeaderboard('flips');
    updateDisplay();
    updateButtonStates();
    isFlipping = false;
  }, COIN_SPIN_DURATION_MS);
}

async function withdrawWinnings() {
  if (totalWon <= 0 || !wallet) {
    showMessage({ title: 'No winnings', message: 'No winnings to withdraw.', isError: true });
    return;
  }
  if (!connection) initConnection();
  if (!connection) {
    showMessage({ title: 'Connection error', message: 'Could not connect to Solana RPC.', isError: true });
    return;
  }
  if (!window.splToken) {
    showMessage({ title: 'Loading', message: 'Token library still loading.', isError: true });
    return;
  }
  isCollecting = true;
  const withdrawBtn = document.getElementById('withdraw-button');
  if (withdrawBtn) withdrawBtn.disabled = true;
  let collectProcessing = false;
  try {
    if (window.CasinoFees?.showCasinoProcessing) {
      window.CasinoFees.showCasinoProcessing('Preparing your collect…', 'Processing collect');
      collectProcessing = true;
    }
    const response = await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userWallet: wallet,
        amount: totalWon,
        gameType: 'coinflip',
        token: typeof window.__COINFLIP_TOKEN__ !== 'undefined' ? window.__COINFLIP_TOKEN__ : 'bux'
      })
    });
    if (!response.ok) {
      let errData = {};
      try {
        errData = await response.json();
      } catch (_) {}
      if (response.status === 409) {
        throw new Error(
          errData.message ||
            errData.error ||
            'Collect already in progress. Wait a few minutes and try again, or refresh the page.',
        );
      }
      throw new Error(errData.error || errData.message || 'Collect failed');
    }
    const collectData = await response.json();
    if (collectData.reconciled) {
      totalWon = 0;
      await loadPlayerData();
      await updateBalance();
      updateDisplay();
      updateButtonStates();
      showMessage({
        title: 'Collect complete',
        message: collectData.message || 'Your previous collect has been finalized.',
        txSignature: collectData.signature,
      });
      return;
    }
    const { transaction: transactionBase64, actualAmount } = collectData;
    if (window.CasinoFees?.showCasinoProcessing) {
      window.CasinoFees.showCasinoProcessing(
        'Confirming your collect on-chain. This may take a minute.',
        'Processing collect'
      );
    }
    const { Transaction } = window.solanaWeb3 || solanaWeb3;
    const transactionBytes = Uint8Array.from(atob(transactionBase64), c => c.charCodeAt(0));
    const tx = Transaction.from(transactionBytes);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    if (window.CasinoFees?.confirmTransactionBestEffort) {
      window.CasinoFees.confirmTransactionBestEffort(connection, sig);
    } else {
      connection.confirmTransaction(sig, 'confirmed').catch(function (confirmError) {
        console.warn('Client confirmation timed out; server will verify on-chain:', confirmError);
      });
    }

    const tokenUsed = typeof window.__COINFLIP_TOKEN__ !== 'undefined' ? window.__COINFLIP_TOKEN__ : 'bux';
    if (window.CasinoFees?.confirmCollectWithServer) {
      await window.CasinoFees.confirmCollectWithServer({
        wallet: wallet,
        signature: sig,
        amount: actualAmount,
        gameType: 'coinflip',
        token: tokenUsed,
      });
    } else {
      let confirmed = false;
      for (let i = 0; i < 10; i++) {
        const confirmRes = await fetch('/api/confirm-collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userWallet: wallet, signature: sig, amount: actualAmount, gameType: 'coinflip', token: tokenUsed })
        });
        const confirmData = await confirmRes.json();
        if (confirmRes.status === 200) {
          confirmed = true;
          break;
        }
        if (confirmRes.status === 202) await new Promise(r => setTimeout(r, 1500));
        else break;
      }
      if (!confirmed) throw new Error('Could not confirm collect with server');
    }
    totalWon = 0;
    await updateBalance();
    await loadPlayerData();
    updateDisplay();
    updateButtonStates();
    const collectedLabel = window.CasinoFees?.formatBuxWithUsd
      ? await window.CasinoFees.formatBuxWithUsd(actualAmount, { label: getTokenLabel() })
      : `${actualAmount} ${getTokenLabel()}`;
    showMessage({ title: 'Collect complete', message: `Withdrew ${collectedLabel}.`, txSignature: sig });
  } catch (err) {
    const msg = err.message || err.toString();
    if (msg.includes('User rejected') || msg.includes('rejected')) return;
    showMessage({ title: 'Collect failed', message: msg, isError: true });
    await loadPlayerData();
    updateDisplay();
    updateButtonStates();
  } finally {
    if (collectProcessing && window.CasinoFees?.hideCasinoProcessing) {
      window.CasinoFees.hideCasinoProcessing();
    }
    isCollecting = false;
    if (withdrawBtn) withdrawBtn.disabled = !wallet || totalWon <= 0 || isCollecting;
  }
}

function setupLeaderboard() {
  const openBtn = document.getElementById('leaderboard-btn');
  const modal = document.getElementById('leaderboard-modal');
  const closeBtn = document.getElementById('close-leaderboard-modal');
  const sortSelect = document.getElementById('leaderboard-sort');
  if (openBtn) openBtn.addEventListener('click', () => { modal.classList.add('show'); loadLeaderboard(sortSelect ? sortSelect.value : 'flips'); });
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
  if (sortSelect) sortSelect.addEventListener('change', e => loadLeaderboard(e.target.value));
}

async function loadLeaderboard(sortBy) {
  const loadingEl = document.getElementById('leaderboard-loading');
  const listEl = document.getElementById('leaderboard-list');
  if (loadingEl) loadingEl.style.display = 'block';
  if (listEl) listEl.innerHTML = '';
  try {
    const tokenUsed = (typeof window.__COINFLIP_TOKEN__ !== 'undefined' ? window.__COINFLIP_TOKEN__ : 'bux');
    const response = await fetch(`/api/leaderboard?gameType=coinflip&tokenUsed=${encodeURIComponent(tokenUsed)}&sortBy=${sortBy || 'flips'}&limit=100`);
    if (!response.ok) throw new Error('Failed to load leaderboard');
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    if (listEl && data.leaderboard) {
      if (data.leaderboard.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">No players yet. Be the first!</p>';
      } else {
        listEl.innerHTML = data.leaderboard.map((player, index) => `
          <div class="leaderboard-item">
            <div class="leaderboard-rank">#${index + 1}</div>
            <div class="leaderboard-wallet">${player.displayAddress}</div>
            <div class="leaderboard-stats">
              <div class="leaderboard-stat"><span class="stat-label">Flips:</span> <span class="stat-value">${(player.totalFlips || 0).toLocaleString()}</span></div>
              <div class="leaderboard-stat"><span class="stat-label">Won:</span> <span class="stat-value">${(player.totalWon || 0).toFixed(2)} ${getTokenLabel()}</span></div>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = '<p style="text-align:center;color:#c00;">Failed to load leaderboard.</p>';
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function setupControls() {
  document.getElementById('purchase-flips').addEventListener('click', purchaseFlips);
  document.getElementById('flip-button').addEventListener('click', doFlip);
  document.getElementById('withdraw-button').addEventListener('click', withdrawWinnings);
  ['cost-per-flip', 'number-of-flips'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateButtonStates);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  setCurrencyLabels();
  setupMessageModal();
  setupWalletConnection();
  setupSelectionButtons();
  setupControls();
  setupLeaderboard();
  loadGameStats();

  const costEl = document.getElementById('cost-per-flip');
  const flipsEl = document.getElementById('number-of-flips');
  if (costEl) costEl.value = '100';
  if (flipsEl) flipsEl.value = '10';
  const coinImage = document.getElementById('coin-image');
  if (coinImage) coinImage.src = getCoinImagePath('heads');
  updateDisplay();
  updateButtonStates();
});
