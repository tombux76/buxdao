// Coin flip game – same flow as slots: buy flips, choose heads/tails, flip (win 1.9x)
const BUX_TOKEN_MINT = 'AaKrMsZkuAdJL6TKZbj7X1VaH5qWioL7oDHagQZa1w59';
const KNUKL_TOKEN_MINT = '6sYhJZDwqHpv1shyVeZ91tx8QYSiHJh2bio97Qdhq1br';
const TREASURY_WALLET = '9M7Jqyqasd2SYxXPsLCW32wUsZ8NE9iY5LL2mw2PbHpL';
const BUX_DECIMALS = 9;
const KNUKL_DECIMALS = 6;
const PURCHASE_FEE_SOL = 0.002;
const FEE_TREASURY_LAMPORTS = 2_000_000;
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
  return BUX_TOKEN_MINT;
}

function getTokenDecimals() {
  return BUX_DECIMALS;
}

function getCoinImagePath(side) {
  return `images/bux-${side}.png`;
}

let wallet = null;
let connection = null;
let tokenBalance = 0;
let flipsRemaining = 0;
let totalWon = 0;
let selectedSide = null;
let isFlipping = false;
let isCollecting = false;
let RPC_URL = window.__BUX_CASINO_RPC__ || 'https://api.mainnet-beta.solana.com';

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
}

function initConnection() {
  if (typeof window.solanaWeb3 !== 'undefined') {
    connection = new window.solanaWeb3.Connection(RPC_URL, 'confirmed', { commitment: 'confirmed', disableRetryOnRateLimit: false, httpHeaders: { 'Content-Type': 'application/json' } });
  } else if (typeof solanaWeb3 !== 'undefined') {
    connection = new solanaWeb3.Connection(RPC_URL, 'confirmed', { commitment: 'confirmed', disableRetryOnRateLimit: false, httpHeaders: { 'Content-Type': 'application/json' } });
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
  wallet = addr;
  if (walletAddressEl) walletAddressEl.textContent = addr ? (addr.slice(0, 4) + '...' + addr.slice(-4)) : '';
  if (connectContainer) connectContainer.style.display = addr ? 'none' : 'block';
  if (walletInfo) walletInfo.style.display = addr ? 'flex' : 'none';
  if (addr) {
    initConnection();
    await waitForSplToken();
    await updateBalance();
    await loadPlayerData();
    updateDisplay();
    updateButtonStates();
    try { window.parent.postMessage({ type: 'WALLET_CONNECTED', address: addr }, '*'); } catch (_) {}
  } else {
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

async function updateBalance() {
  if (!wallet || !connection || !window.splToken) return;
  try {
    const { PublicKey } = window.solanaWeb3 || solanaWeb3;
    const { getAssociatedTokenAddress, getAccount } = window.splToken;
    const tokenMint = new PublicKey(getTokenMint());
    const userPublicKey = new PublicKey(wallet);
    const tokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
    try {
      const account = await getAccount(connection, tokenAccount);
      tokenBalance = Number(account.amount) / Math.pow(10, getTokenDecimals());
    } catch (_) {
      tokenBalance = 0;
    }
    updateDisplay();
  } catch (err) {
    console.error('Balance error:', err);
    tokenBalance = 0;
    updateDisplay();
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
    if (data.unclaimedRewards > 0) totalWon = data.unclaimedRewards;
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
  if (!wallet || !connection) {
    showMessage({ title: 'Wallet required', message: 'Please connect your wallet first.', isError: true });
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
  if (tokenBalance < totalCost) {
    showMessage({ title: 'Insufficient balance', message: `You need ${totalCost} ${getTokenLabel()} but only have ${tokenBalance.toFixed(2)} ${getTokenLabel()}.`, isError: true });
    return;
  }
  const solBalance = await connection.getBalance(new (window.solanaWeb3 || solanaWeb3).PublicKey(wallet));
  const minSol = FEE_TREASURY_LAMPORTS + 10000;
  if (solBalance < minSol) {
    showMessage({ title: 'Insufficient SOL', message: `Need ~${(minSol / 1e9).toFixed(4)} SOL for fee. You have ${(solBalance / 1e9).toFixed(4)} SOL.`, isError: true });
    return;
  }
  if (!window.splToken) {
    showMessage({ title: 'Loading', message: 'Token library still loading. Try again in a moment.', isError: true });
    return;
  }
  try {
    const { PublicKey, Transaction, SystemProgram } = window.solanaWeb3 || solanaWeb3;
    const { getAssociatedTokenAddress, createTransferInstruction } = window.splToken;
    const createATA = window.splToken.createAssociatedTokenAccountInstruction || window.splToken.createAssociatedTokenAccountIdempotentInstruction;
    const tokenMint = new PublicKey(getTokenMint());
    const userPublicKey = new PublicKey(wallet);
    const treasuryPublicKey = new PublicKey(TREASURY_WALLET);
    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
    const treasuryTokenAccount = await getAssociatedTokenAddress(tokenMint, treasuryPublicKey);
    const transaction = new Transaction();
    try {
      await connection.getAccountInfo(treasuryTokenAccount);
    } catch (_) {
      if (createATA) {
        transaction.add(createATA(userPublicKey, treasuryTokenAccount, treasuryPublicKey, tokenMint));
      }
    }
    const transferAmount = BigInt(Math.floor(totalCost * Math.pow(10, getTokenDecimals())));
    transaction.add(createTransferInstruction(userTokenAccount, treasuryTokenAccount, userPublicKey, transferAmount));
    if (FEE_TREASURY_LAMPORTS > 0) {
      transaction.add(SystemProgram.transfer({ fromPubkey: userPublicKey, toPubkey: treasuryPublicKey, lamports: FEE_TREASURY_LAMPORTS }));
    }
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;
    const signed = await window.solana.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(signature, 'confirmed');

    flipsRemaining += numFlips;
    try {
      await fetch('/api/save-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet,
          flipCost: costPerFlip,
          flipsPurchased: numFlips,
          gameType: 'coinflip',
          tokenUsed: isBuxToken() ? 'bux' : 'bux'
        })
      });
    } catch (_) {}
    await updateBalance();
    updateDisplay();
    updateButtonStates();
    showMessage({ title: 'Purchase complete', message: `Purchased ${numFlips} flip(s) for ${totalCost} ${getTokenLabel()}${PURCHASE_FEE_SOL > 0 ? ' + ' + PURCHASE_FEE_SOL + ' SOL fee' : ''}.`, txSignature: signature });
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

  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const won = result === selectedSide ? costPerFlip * WIN_MULTIPLIER : 0;
  if (won > 0) totalWon += won;
  flipsRemaining -= 1;

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

    fetch('/api/save-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: wallet,
        gameType: 'coinflip',
        flipCost: costPerFlip,
        choice: selectedSide,
        result,
        wonAmount: won,
        updateFlipsRemaining: flipsRemaining,
        updateUnclaimedRewards: totalWon,
        tokenUsed: isBuxToken() ? 'bux' : 'bux'
      })
    }).then((res) => {
      if (res && res.ok) {
        loadGameStats();
        loadLeaderboard('flips');
      }
    }).catch(() => {});

    updateDisplay();
    updateButtonStates();
    isFlipping = false;
  }, COIN_SPIN_DURATION_MS);
}

async function withdrawWinnings() {
  if (totalWon <= 0 || !wallet || !connection) {
    showMessage({ title: 'No winnings', message: 'No winnings to withdraw.', isError: true });
    return;
  }
  if (!window.splToken) {
    showMessage({ title: 'Loading', message: 'Token library still loading.', isError: true });
    return;
  }
  isCollecting = true;
  const withdrawBtn = document.getElementById('withdraw-button');
  if (withdrawBtn) withdrawBtn.disabled = true;
  try {
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
      const errData = await response.json();
      throw new Error(errData.error || errData.message || 'Collect failed');
    }
    const { transaction: transactionBase64, actualAmount } = await response.json();
    const { Transaction } = window.solanaWeb3 || solanaWeb3;
    const transactionBytes = Uint8Array.from(atob(transactionBase64), c => c.charCodeAt(0));
    const tx = Transaction.from(transactionBytes);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(sig, 'confirmed');

    let confirmed = false;
    for (let i = 0; i < 10; i++) {
      const confirmRes = await fetch('/api/confirm-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userWallet: wallet, signature: sig, amount: actualAmount, gameType: 'coinflip', token: typeof window.__COINFLIP_TOKEN__ !== 'undefined' ? window.__COINFLIP_TOKEN__ : 'bux' })
      });
      const confirmData = await confirmRes.json();
      if (confirmRes.status === 200 && !confirmData.alreadyCleared) {
        confirmed = true;
        break;
      }
      if (confirmRes.status === 202) await new Promise(r => setTimeout(r, 1500));
      else break;
    }
    totalWon = 0;
    await updateBalance();
    await loadPlayerData();
    updateDisplay();
    updateButtonStates();
    showMessage({ title: 'Collect complete', message: `Withdrew ${actualAmount} ${getTokenLabel()}.`, txSignature: sig });
  } catch (err) {
    const msg = err.message || err.toString();
    if (msg.includes('User rejected') || msg.includes('rejected')) return;
    showMessage({ title: 'Collect failed', message: msg, isError: true });
    await loadPlayerData();
    updateDisplay();
    updateButtonStates();
  } finally {
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
