// Slot Machine Game Logic
// Note: This is a frontend simulation. Replace with actual Solana program integration when ready.

// Symbol definitions with rarity (most common to rarest)
// Note: We no longer use emoji symbols - only images. SYMBOL_NAMES kept for alt text.
const SYMBOL_NAMES = ['Grapes', 'Cherry', 'Lemon', 'Orange', 'Watermelon', 'Star', 'Diamond', 'Seven'];

// Symbol distribution per reel (36 symbols total per reel for unique rarities)
// Index matches SYMBOL_NAMES array: [Grapes, Cherry, Lemon, Orange, Watermelon, Star, Diamond, Seven]
// Each symbol has unique rarity:
const SYMBOL_COUNTS = [8, 7, 6, 5, 4, 3, 2, 1]; // Total = 36
// Rarities: Grapes 22.2%, Cherry 19.4%, Lemon 16.7%, Orange 13.9%, Watermelon 11.1%, Star 8.3%, Diamond 5.6%, Seven 2.8%

// Payout multipliers for 3-of-a-kind (based on 100 per spin, targeting 80% RTP)
// Probabilities: (count/36)³ for each symbol
// Expected payout = Σ(probability × payout) = 80
// Probabilities: Grapes 1.097%, Cherry 0.735%, Lemon 0.463%, Orange 0.268%, Watermelon 0.137%, Star 0.058%, Diamond 0.017%, Seven 0.002%
// Total win probability ≈ 1.88%, so payouts need to be high to reach 80% RTP
const PAYOUT_MULTIPLIERS = {
    0: 13,   // 3 Grapes (1.097% chance) - 13x
    1: 16,   // 3 Cherries (0.735% chance) - 16x
    2: 21,   // 3 Lemons (0.463% chance) - 21x
    3: 35,   // 3 Oranges (0.268% chance) - 35x
    4: 70,   // 3 Watermelons (0.137% chance) - 70x
    5: 165,  // 3 Stars (0.058% chance) - 165x
    6: 550,  // 3 Diamonds (0.017% chance) - 550x
    7: 3300  // 3 Sevens (0.002% chance) - 3300x
};
// Expected RTP: 80% (calculated and verified)

// Calculate actual payout amount based on cost per spin
function getPayoutAmount(symbolIndex, costPerSpin) {
    return PAYOUT_MULTIPLIERS[symbolIndex] * costPerSpin;
}

const SPIN_COST = 100; // Default cost per spin
const MAX_COST_PER_SPIN = 1500; // Cap cost per spin to protect bank
const MAX_SPINS_PER_PURCHASE = 500; // Max spins per purchase
const SLOT_MACHINE_PROGRAM_ID = 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'; // Update with actual program ID
// Token mints: BUX (1000s) and KNUKL — must match the token selected via ?token=bux
const BUX_TOKEN_MINT = 'AaKrMsZkuAdJL6TKZbj7X1VaH5qWioL7oDHagQZa1w59';
const KNUKL_TOKEN_MINT = '6sYhJZDwqHpv1shyVeZ91tx8QYSiHJh2bio97Qdhq1br';
const TREASURY_WALLET = 'FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75'; // BUX casino pool fallback
const BUX_DECIMALS = 9;
const KNUKL_DECIMALS = 6;

function isBuxToken() {
    return true;
}

function getTokenLabel() {
    return 'BUX';
}

function getTokenMint() {
    return window.__BUX_TOKEN_MINT__ || BUX_TOKEN_MINT;
}

function getTokenDecimals() {
    return typeof window.__BUX_DECIMALS__ === 'number' ? window.__BUX_DECIMALS__ : BUX_DECIMALS;
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

function getSymbolsBasePath() {
    return '/images/bux-slots/';
}

function updatePrizeModalSymbols() {
    const base = getSymbolsBasePath();
    document.querySelectorAll('.prize-symbol-image').forEach(function (img) {
        const num = img.getAttribute('data-symbol');
        if (num) img.src = base + num + '.png';
    });
}

function setCurrencyLabels() {
    const label = getTokenLabel();
    const costLabel = document.querySelector('label[for="cost-per-spin"]');
    if (costLabel) costLabel.textContent = `Cost Per Spin (${label}):`;
    const costSelect = document.getElementById('cost-per-spin');
    if (costSelect) costSelect.title = `Cost per spin (${label})`;
    if (costSelect && window.CasinoFees?.updateBuxCostSelect) {
        window.CasinoFees.updateBuxCostSelect(costSelect);
    }
    updatePrizeModalSymbols();
    const el = (id) => document.getElementById(id);
    if (el('xma-balance')) el('xma-balance').textContent = `0.00 ${label}`;
    if (el('total-won')) el('total-won').textContent = `0.00 ${label}`;
    if (el('grand-total-won')) el('grand-total-won').textContent = `0 ${label}`;
    const mobileBalance = el('mobile-xma-balance');
    const mobileWon = el('mobile-total-won');
    if (mobileBalance) mobileBalance.textContent = `0.00 ${label}`;
    if (mobileWon) mobileWon.textContent = `0.00 ${label}`;
}

let wallet = null;
let connection = null;
let xmaBalance = 0;
let balanceFetchId = 0;
let walletSetupPromise = null;
let spinsRemaining = 0;
let totalWon = 0;
let isSpinning = false;
let isCollecting = false;
let isAutoSpinning = false;
let backgroundMusic = null;
let isMusicPlaying = true; // Default to on

const SOLSCAN_TX_BASE = 'https://solscan.io/tx/';

// Themed popup for success/error (buy, collect, wallet). Replaces alert().
function showSlotsMessage(options) {
    const { title, message, txSignature, isError } = options;
    const modal = document.getElementById('message-modal');
    const titleEl = document.getElementById('message-modal-title');
    const textEl = document.getElementById('message-modal-text');
    const txLink = document.getElementById('message-modal-tx-link');
    const okBtn = document.getElementById('message-modal-ok');
    if (!modal || !titleEl || !textEl) return;
    modal.classList.remove('success', 'error');
    modal.classList.add(isError ? 'error' : 'success');
    titleEl.textContent = title || (isError ? 'Error' : 'Success');
    textEl.textContent = message || '';
    if (txSignature && txLink) {
        txLink.href = SOLSCAN_TX_BASE + txSignature;
        txLink.style.display = '';
    } else if (txLink) {
        txLink.style.display = 'none';
    }
    modal.classList.add('show');
}

function setupMessageModal() {
    const modal = document.getElementById('message-modal');
    const closeBtn = document.getElementById('close-message-modal');
    const okBtn = document.getElementById('message-modal-ok');
    if (!modal) return;
    function close() {
        modal.classList.remove('show');
    }
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (okBtn) okBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('show')) close();
    });
}

// Global so HTML onclick can call it – no addEventListener timing issues
window.toggleSlotsMusic = function () {
    isMusicPlaying = !isMusicPlaying;
    var btn = document.getElementById('music-toggle');
    var iconOn = document.getElementById('music-icon-on');
    var iconOff = document.getElementById('music-icon-off');
    if (btn) {
        if (isMusicPlaying) {
            btn.classList.add('active');
            if (iconOn) iconOn.style.display = 'block';
            if (iconOff) iconOff.style.display = 'none';
        } else {
            btn.classList.remove('active');
            if (iconOn) iconOn.style.display = 'block';
            if (iconOff) iconOff.style.display = 'none';
        }
    }
    if (backgroundMusic) {
        if (isMusicPlaying) backgroundMusic.play().catch(function () {});
        else backgroundMusic.pause();
    }
};

// Fixed reel order (created once, same for all reels)
let FIXED_REEL_ORDER = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Listen for parent (GamePage) music toggle immediately so header button works before SPL loads
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'TOGGLE_MUSIC' && typeof window.toggleSlotsMusic === 'function') {
            window.toggleSlotsMusic();
        }
    });

    // Create fixed reel order once (same for all reels)
    FIXED_REEL_ORDER = createFixedReelOrder();
    
    checkOrientation();
    
    // Wait for SPL token library to load before setting up wallet
    const initWhenReady = () => {
        setCurrencyLabels();
        setupMessageModal();
        setupWalletConnection();
        setupGameControls();
        setupPrizeModal();
        setupLeaderboardModal();
        setupBackgroundMusic();
        initializeReels();
        loadGameStats(); // Load grand totals
        
        // Set default cost per spin (100) and number of spins (10)
        const costEl = document.getElementById('cost-per-spin');
        if (costEl) costEl.value = String(SPIN_COST);
        const spinsEl = document.getElementById('number-of-spins');
        if (spinsEl) spinsEl.value = '10';
        updateDisplay();
        updateButtonStates();
    };
    
    // Check if SPL token is already loaded
    if (window.splToken) {
        initWhenReady();
    } else {
        // Wait for SPL token to load
        window.addEventListener('splTokenLoaded', initWhenReady);
        // Fallback timeout in case event doesn't fire
        setTimeout(() => {
            if (window.splToken) {
                initWhenReady();
            } else {
                console.warn('SPL token library not loaded, some features may not work');
                initWhenReady(); // Initialize anyway
            }
        }, 2000);
    }
    
    // Check orientation on resize
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
});

// Orientation prompt disabled – wallet browsers don't support rotate; game works in portrait
function checkOrientation() {
    const prompt = document.getElementById('orientation-prompt');
    if (prompt) prompt.classList.remove('show');
}

// Initialize Reels
function initializeReels() {
    // Wait for DOM to be fully rendered and layout to be calculated
    setTimeout(() => {
        for (let i = 1; i <= 3; i++) {
            const reel = document.getElementById(`reel-${i}`);
            const strip = reel.querySelector('.reel-strip');
            if (!reel || !strip) return;
            
            strip.innerHTML = '';
            
            // Get reel height - force layout calculation
            let reelHeight = reel.offsetHeight || reel.clientHeight || 200;
            
            // If height is still too small, use parent container height
            if (reelHeight < 50) {
                const parent = reel.parentElement;
                if (parent) {
                    const parentHeight = parent.offsetHeight || parent.clientHeight;
                    if (parentHeight > 50) {
                        reel.style.height = `${parentHeight}px`;
                        reelHeight = reel.offsetHeight || parentHeight;
                    }
                }
            }
            
            // Ensure minimum height
            if (reelHeight < 100) {
                reel.style.minHeight = '200px';
                reelHeight = Math.max(reel.offsetHeight || reelHeight, 200);
            }
            
            // Create reel with fixed symbol order (same on all reels, no consecutive repeats)
            // Each reel has 36 symbols matching SYMBOL_COUNTS distribution
            const numSymbols = 36;
            
            // Use the pre-created fixed order (same for all reels)
            if (!FIXED_REEL_ORDER) {
                FIXED_REEL_ORDER = createFixedReelOrder();
            }
            
            // Create symbols in the strip using the fixed order
            for (let j = 0; j < numSymbols; j++) {
                const symbol = document.createElement('div');
                symbol.className = 'reel-symbol';
                const symbolIndex = FIXED_REEL_ORDER[j];
                // Map symbol index to image number: 0 (Grapes, smallest win) -> 1.png, 7 (Seven, biggest win) -> 8.png
                const imageNumber = symbolIndex + 1;
                const basePath = getSymbolsBasePath();
                const img = document.createElement('img');
                img.src = `${basePath}${imageNumber}.png`;
                img.alt = ''; // Empty alt to prevent text fallback
                img.className = 'symbol-image';
                img.onerror = function() {
                    console.error(`Failed to load image: ${img.src}`);
                    this.style.display = 'none';
                };
                symbol.appendChild(img);
                symbol.dataset.symbolIndex = symbolIndex; // Store symbol index for win calculation
                symbol.style.height = `${reelHeight}px`;
                strip.appendChild(symbol);
            }
            
            // Set strip height
            strip.style.height = `${numSymbols * reelHeight}px`;
            
            // Position to show:
            // - Bottom half of symbol 17 (visible in top 50% of reel: 0 to reelHeight/2)
            // - Full symbol 18 (visible in center: reelHeight/2 is the center)
            // - Top half of symbol 19 (visible in bottom 50% of reel: reelHeight/2 to reelHeight)
            // Symbol 18's center should be at reelHeight/2 (center of visible reel)
            // Symbol 18's center in strip is at: (centerIndex * reelHeight) + (reelHeight / 2)
            // To position it at reelHeight/2: offset = -(centerIndex * reelHeight)
            const centerIndex = 18;
            const offset = -(centerIndex * reelHeight);
            strip.style.transform = `translateY(${offset}px)`;
            strip.style.transition = 'none';
            
            console.log(`Reel ${i} initialized: height=${reelHeight}, offset=${offset}, should show symbol ${centerIndex} centered`);
        }
    }, 200);
}

// Wallet Connection
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

async function applyWalletConnected(addr, connectContainer, walletInfo, walletAddressEl) {
    if (addr && wallet === addr && walletSetupPromise) {
        await walletSetupPromise;
        return;
    }
    wallet = addr;
    if (walletAddressEl) walletAddressEl.textContent = addr ? (addr.slice(0, 4) + '...' + addr.slice(-4)) : '';
    if (connectContainer) connectContainer.style.display = addr ? 'none' : 'block';
    if (walletInfo) walletInfo.style.display = addr ? 'flex' : 'none';
    if (addr) {
        walletSetupPromise = (async function () {
            initConnection();
            await updateBalance();
            await loadPlayerData();
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
    
    var isPhantomInstalled = typeof window.solana !== 'undefined' && (window.solana.isPhantom || typeof window.solana.connect === 'function');
    
    window.addEventListener('message', function(e) {
        if (!e.data || !e.data.type) return;
        if (e.data.type === 'CONNECT_WALLET' && connectBtn) connectBtn.click();
        if (e.data.type === 'WALLET_ADDRESS' && e.data.address) {
            applyWalletConnected(e.data.address, connectContainer, walletInfo, walletAddress);
        }
        if (e.data.type === 'TOKEN_CHANGED') {
            window.__SLOTS_TOKEN__ = (e.data.token === 'bux') ? 'bux' : 'bux';
            // Reset UI state tied to token, then reload DB + balances for the selected token.
            xmaBalance = 0;
            spinsRemaining = 0;
            totalWon = 0;
            updateDisplay();
            updateButtonStates();
            loadGameStats();
            loadLeaderboard('spins');
            if (wallet) {
                updateBalance().then(function () { return loadPlayerData(); }).then(function () {
                    updateDisplay();
                    updateButtonStates();
                }).catch(function(){});
            }
        }
        if (e.data.type === 'DISCONNECT_WALLET') {
            if (window.solana && window.solana.disconnect) window.solana.disconnect().catch(function(){});
            wallet = null;
            connection = null;
            connectContainer.style.display = 'block';
            walletInfo.style.display = 'none';
            xmaBalance = 0;
            spinsRemaining = 0;
            totalWon = 0;
            updateDisplay();
            updateButtonStates();
            try { window.parent.postMessage({ type: 'WALLET_DISCONNECTED' }, '*'); } catch (_) {}
        }
    });
    
    if (window.self !== window.top) {
        try { window.parent.postMessage({ type: 'REQUEST_WALLET' }, '*'); } catch (_) {}
    }
    
    if (isPhantomInstalled) {
        try {
            if (window.solana.isConnected) {
                const resp = await window.solana.connect({ onlyIfTrusted: true });
                if (resp) await applyWalletConnected(resp.publicKey.toString(), connectContainer, walletInfo, walletAddress);
            }
        } catch (err) {
            console.log('Wallet not auto-connected:', err.message);
        }
        
        connectBtn.addEventListener('click', async () => {
            try {
                const resp = await window.solana.connect({ onlyIfTrusted: false });
                await applyWalletConnected(resp.publicKey.toString(), connectContainer, walletInfo, walletAddress);
            } catch (err) {
                console.error('Wallet connection error:', err);
                if (err.message && (err.message.includes('User rejected') || err.message.includes('not been authorized'))) return;
                showSlotsMessage({ title: 'Connection failed', message: 'Failed to connect wallet: ' + err.message, isError: true });
            }
        });
        
        disconnectBtn.addEventListener('click', async () => {
            if (window.solana && window.solana.disconnect) await window.solana.disconnect();
            wallet = null;
            connection = null;
            connectContainer.style.display = 'block';
            walletInfo.style.display = 'none';
            xmaBalance = 0;
            spinsRemaining = 0;
            totalWon = 0;
            updateDisplay();
            updateButtonStates();
            try { window.parent.postMessage({ type: 'WALLET_DISCONNECTED' }, '*'); } catch (_) {}
        });
    } else {
        connectBtn.textContent = 'Install Phantom';
        connectBtn.onclick = function() { window.open('https://phantom.app/', '_blank'); };
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

// Update Balance - server lookup first (Helius), then on-chain fallback
async function updateBalance() {
    if (!wallet) return;
    const fetchId = ++balanceFetchId;

    try {
        const balance = await fetchServerBuxBalance();
        if (fetchId !== balanceFetchId) return;
        if (balance !== null) {
            xmaBalance = balance;
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

        const tokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            userPublicKey
        );

        try {
            const account = await getAccount(connection, tokenAccount);
            if (fetchId !== balanceFetchId) return;
            xmaBalance = Number(account.amount) / Math.pow(10, getTokenDecimals());
        } catch (error) {
            if (fetchId !== balanceFetchId) return;
            const errorMsg = (error && (error.message || error.toString())) || '';
            const isNotFound = errorMsg.includes('Invalid param') || errorMsg.includes('not found') || errorMsg.includes('could not find account') ||
                errorMsg.includes('TokenAccountNotFoundError') || (error && error.name === 'TokenAccountNotFoundError');
            if (errorMsg.includes('403') || errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('Too Many Requests')) {
                console.warn('RPC rate limited. Balance may not update.');
            } else if (isNotFound) {
                xmaBalance = 0;
            } else {
                console.warn('Error fetching token account:', errorMsg);
            }
        }

        if (fetchId !== balanceFetchId) return;
        updateDisplay();
    } catch (error) {
        if (fetchId !== balanceFetchId) return;
        console.error('Error fetching balance:', error);
    }
}

// Game Controls
function setupGameControls() {
    const purchaseBtn = document.getElementById('purchase-spins');
    const spinBtn = document.getElementById('spin-button');
    const withdrawBtn = document.getElementById('withdraw-button');
    const costSelect = document.getElementById('cost-per-spin');
    const spinsSelect = document.getElementById('number-of-spins');
    
    purchaseBtn.addEventListener('click', purchaseSpins);
    spinBtn.addEventListener('click', toggleAutoSpin);
    withdrawBtn.addEventListener('click', withdrawWinnings);
    
    // Update button states when selection changes
    [costSelect, spinsSelect].forEach(sel => {
        if (sel) sel.addEventListener('change', updateButtonStates);
    });
    
    // Initialize spin button text
    updateSpinButtonText();
}

// Purchase Spins - Transfer tokens to treasury wallet
async function purchaseSpins() {
    if (!wallet) {
        showSlotsMessage({ title: 'Wallet required', message: 'Please connect your wallet first.', isError: true });
        return;
    }
    if (!connection) initConnection();
    if (!connection) {
        showSlotsMessage({ title: 'Connection error', message: 'Could not connect to Solana RPC.', isError: true });
        return;
    }
    
    let costPerSpin = parseFloat(document.getElementById('cost-per-spin').value);
    let numSpins = parseInt(document.getElementById('number-of-spins').value);
    
    if (!costPerSpin || costPerSpin <= 0 || !numSpins || numSpins <= 0) {
        showSlotsMessage({ title: 'Invalid input', message: 'Please enter valid cost per spin and number of spins.', isError: true });
        return;
    }
    if (costPerSpin > MAX_COST_PER_SPIN) {
        showSlotsMessage({ title: 'Cost capped', message: `Cost per spin is capped at ${MAX_COST_PER_SPIN.toLocaleString()} ${getTokenLabel()}.`, isError: true });
        return;
    }
    if (numSpins > MAX_SPINS_PER_PURCHASE) {
        showSlotsMessage({ title: 'Limit', message: `Maximum ${MAX_SPINS_PER_PURCHASE} spins per purchase.`, isError: true });
        return;
    }
    costPerSpin = Math.min(costPerSpin, MAX_COST_PER_SPIN);
    numSpins = Math.min(numSpins, MAX_SPINS_PER_PURCHASE);
    
    const totalCost = costPerSpin * numSpins;

    try {
        const serverBalance = await fetchServerBuxBalance();
        if (serverBalance !== null) {
            xmaBalance = serverBalance;
            updateDisplay();
        }
    } catch (error) {
        console.warn('Could not refresh balance before purchase:', error);
    }
    
    if (xmaBalance < totalCost) {
        showSlotsMessage({ title: 'Insufficient balance', message: `You need ${totalCost} ${getTokenLabel()} but only have ${xmaBalance.toFixed(2)} ${getTokenLabel()}.`, isError: true });
        return;
    }
    
    // Check user has enough SOL for purchase fee (0.002 SOL) + tx fee
    const solBalance = await connection.getBalance(new (window.solanaWeb3 || solanaWeb3).PublicKey(wallet));
    const minSolRequired = getMinSolForPurchase();
    if (solBalance < minSolRequired) {
        showSlotsMessage({ title: 'Insufficient SOL', message: `Need ~${(minSolRequired / 1e9).toFixed(4)} SOL for transaction fee. You have ${(solBalance / 1e9).toFixed(4)} SOL.`, isError: true });
        return;
    }
    
    // Check if SPL token library is loaded
    if (!window.splToken) {
        showSlotsMessage({ title: 'Loading', message: 'SPL token library is still loading. Please wait a moment and try again.', isError: true });
        return;
    }
    
    try {
        const { PublicKey, Transaction, SystemProgram } = window.solanaWeb3 || solanaWeb3;
        const { getAssociatedTokenAddress, createTransferInstruction } = window.splToken;
        const createAssociatedTokenAccountInstruction = window.splToken.createAssociatedTokenAccountInstruction || window.splToken.createAssociatedTokenAccountIdempotentInstruction;
        
        const tokenMint = new PublicKey(getTokenMint());
        const userPublicKey = new PublicKey(wallet);
        const treasuryPublicKey = new PublicKey(getTreasuryWallet());
        
        // Get token accounts
        const userTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            userPublicKey
        );
        
        const treasuryTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            treasuryPublicKey
        );
        
        // Ensure treasury has an ATA for this mint (transfer fails otherwise)
        const treasuryAccountInfo = await connection.getAccountInfo(treasuryTokenAccount);
        const transaction = new Transaction();
        if (!treasuryAccountInfo) {
            if (createAssociatedTokenAccountInstruction) {
                // (payer, associatedToken, owner, mint) - user pays rent for treasury's ATA
                transaction.add(createAssociatedTokenAccountInstruction(
                    userPublicKey,
                    treasuryTokenAccount,
                    treasuryPublicKey,
                    tokenMint
                ));
            } else {
                try {
                    const createAta = window.splToken.createAssociatedTokenAccount;
                    if (createAta) {
                        await createAta(connection, userPublicKey, tokenMint, treasuryPublicKey);
                    }
                } catch (e) {
                    console.warn('Create ATA fallback:', e);
                    throw new Error('Treasury token account does not exist. Please try again or contact support.');
                }
            }
        }
        
        // Token transfer instruction
        const transferAmount = BigInt(Math.floor(totalCost * Math.pow(10, getTokenDecimals())));
        const transferInstruction = createTransferInstruction(
            userTokenAccount,
            treasuryTokenAccount,
            userPublicKey,
            transferAmount
        );
        transaction.add(transferInstruction);
        if (window.CasinoFees) {
            window.CasinoFees.addPurchaseSolFeeTransfers(transaction, SystemProgram, PublicKey, userPublicKey);
        }
        
        let blockhash;
        let retries = 3;
        while (retries > 0) {
            try {
                const result = await connection.getLatestBlockhash();
                blockhash = result.blockhash;
                break;
            } catch (error) {
                retries--;
                const errorMsg = error.message || error.toString() || '';
                if (retries === 0 || (!errorMsg.includes('403') && !errorMsg.includes('429'))) {
                    throw error;
                }
                console.warn(`RPC rate limited, retrying... (${3 - retries}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries))); // Exponential backoff
            }
        }
        
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

            // Sign and send transaction
            const signed = await window.solana.signTransaction(transaction);

            if (window.CasinoFees?.showPurchaseProcessing) {
                window.CasinoFees.showPurchaseProcessing(
                    'Confirming your purchase on-chain. This may take a minute.',
                    'Processing purchase'
                );
            }
        
        // Send the signed transaction
        retries = 3;
        let signature;
        while (retries > 0) {
            try {
                signature = await connection.sendRawTransaction(signed.serialize(), {
                    skipPreflight: false,
                    maxRetries: 3
                });
                break;
            } catch (error) {
                retries--;
                const errorMsg = error.message || error.toString() || '';
                if (retries === 0 || (!errorMsg.includes('403') && !errorMsg.includes('429'))) {
                    throw error;
                }
                console.warn(`RPC rate limited on send, retrying... (${3 - retries}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
            }
        }
        
        try {
            await connection.confirmTransaction(signature, 'confirmed');
        } catch (confirmError) {
            console.warn('Client confirmation timed out; server will verify on-chain:', confirmError);
        }
        
        // Save purchase to database (server verifies on-chain tx)
        try {
            const saveResponse = await fetch('/api/save-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    walletAddress: wallet,
                    spinCost: costPerSpin,
                    resultSymbols: [],
                    wonAmount: 0,
                    spinsPurchased: numSpins,
                    purchaseSignature: signature,
                    gameType: 'slots',
                    tokenUsed: isBuxToken() ? 'bux' : 'bux'
                })
            });
            
            if (!saveResponse.ok) {
                const errorData = await saveResponse.json();
                console.error('Failed to save purchase to database:', errorData);
                throw new Error(errorData.error || 'Purchase could not be recorded');
            }
            const saveData = await saveResponse.json();
            if (typeof saveData.spinsRemaining === 'number') {
                spinsRemaining = saveData.spinsRemaining;
            } else {
                spinsRemaining += numSpins;
            }
            console.log('Purchase saved to database successfully');
        } catch (saveError) {
            console.error('Error saving purchase to database:', saveError);
            showSlotsMessage({
                title: 'Purchase recorded on chain',
                message: (saveError.message || 'Could not sync purchase with server.') + ' Refresh the page in a minute or contact support with your transaction link.',
                txSignature: signature,
                isError: true,
            });
            return;
        }
        
        // Update balance
        await updateBalance();
        updateDisplay();
        updateButtonStates();
        
        const successCost = window.CasinoFees?.formatBuxWithUsd
            ? await window.CasinoFees.formatBuxWithUsd(totalCost, { label: getTokenLabel() })
            : `${totalCost} ${getTokenLabel()}`;
        const successMsg = `Successfully purchased ${numSpins} spin(s) for ${successCost}${getPurchaseFeeSol() > 0 ? ` + ${getPurchaseFeeSol()} SOL fee` : ''}.`;
        showSlotsMessage({ title: 'Purchase complete', message: successMsg, txSignature: signature });
        } finally {
            if (purchaseProcessing && window.CasinoFees?.hidePurchaseProcessing) {
                window.CasinoFees.hidePurchaseProcessing();
            }
        }
    } catch (error) {
        console.error('Purchase error:', error);
        const errorMsg = error.message || error.toString() || '';
        
        // Handle user rejection gracefully
        if (errorMsg.includes('User rejected') || errorMsg.includes('User cancelled') || errorMsg.includes('rejected')) {
            // User intentionally rejected - don't show error, just return silently
            return;
        }
        
        showSlotsMessage({ title: 'Purchase failed', message: 'Failed to purchase spins: ' + errorMsg, isError: true });
    }
}

// Create fixed reel order with no consecutive repeats
// Same order on all reels for consistency
function createFixedReelOrder() {
    // Build array of all symbols with their counts
    const symbolPool = [];
    for (let symbolIndex = 0; symbolIndex < SYMBOL_NAMES.length; symbolIndex++) {
        for (let count = 0; count < SYMBOL_COUNTS[symbolIndex]; count++) {
            symbolPool.push(symbolIndex);
        }
    }
    
    // Arrange to avoid consecutive repeats by interleaving
    // Strategy: alternate between different symbols
    const ordered = [];
    const remaining = [...symbolPool];
    
    let lastSymbol = -1;
    while (remaining.length > 0) {
        // Find a symbol that's different from the last one
        let found = false;
        for (let i = 0; i < remaining.length; i++) {
            if (remaining[i] !== lastSymbol) {
                ordered.push(remaining[i]);
                lastSymbol = remaining[i];
                remaining.splice(i, 1);
                found = true;
                break;
            }
        }
        
        // If we can't avoid a repeat (shouldn't happen with our distribution), just take the first
        if (!found && remaining.length > 0) {
            ordered.push(remaining[0]);
            lastSymbol = remaining[0];
            remaining.splice(0, 1);
        }
    }
    
    return ordered;
}

// Generate weighted random position for a reel
// We select a random index in the fixed reel order; symbol probabilities follow SYMBOL_COUNTS
function getWeightedRandomPosition() {
    // Use the pre-created fixed order (same for all reels)
    if (!FIXED_REEL_ORDER) {
        FIXED_REEL_ORDER = createFixedReelOrder();
    }
    // Select random position in the reel (this naturally gives weighted probability)
    return Math.floor(Math.random() * FIXED_REEL_ORDER.length);
}

// Toggle Auto Spin
function toggleAutoSpin() {
    // If autospin is currently on, turn it off (can do this even while spinning)
    if (isAutoSpinning) {
        isAutoSpinning = false;
        updateSpinButtonText();
        return;
    }
    
    // Can't start autospin if no spins remaining
    if (spinsRemaining <= 0) return;
    
    // Start autospin
    isAutoSpinning = true;
    updateSpinButtonText();
    
    // Begin spinning (only if not already spinning)
    if (!isSpinning) {
        performSpin();
    }
}

function findReelPositionForSymbol(symbolIndex) {
    if (!FIXED_REEL_ORDER) {
        FIXED_REEL_ORDER = createFixedReelOrder();
    }
    const matches = [];
    for (let i = 0; i < FIXED_REEL_ORDER.length; i++) {
        if (FIXED_REEL_ORDER[i] === symbolIndex) matches.push(i);
    }
    if (matches.length === 0) return Math.floor(Math.random() * FIXED_REEL_ORDER.length);
    return matches[Math.floor(Math.random() * matches.length)];
}

// Perform a single spin (server-authoritative outcome)
async function performSpin() {
    if (isSpinning || spinsRemaining <= 0) {
        if (isAutoSpinning && spinsRemaining <= 0) {
            isAutoSpinning = false;
            updateSpinButtonText();
        }
        return;
    }

    if (!isAutoSpinning) {
        return;
    }

    if (!wallet) {
        isAutoSpinning = false;
        updateSpinButtonText();
        return;
    }

    isSpinning = true;
    updateButtonStates();
    updateSpinButtonText();

    let serverData;
    try {
        const saveResponse = await fetch('/api/save-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress: wallet,
                gameType: 'slots',
                spin: true,
                tokenUsed: isBuxToken() ? 'bux' : 'bux'
            })
        });
        if (!saveResponse.ok) {
            const errorData = await saveResponse.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || 'Spin failed');
        }
        serverData = await saveResponse.json();
    } catch (spinError) {
        console.error('Spin error:', spinError);
        isSpinning = false;
        isAutoSpinning = false;
        updateButtonStates();
        updateSpinButtonText();
        showSlotsMessage({ title: 'Spin failed', message: spinError.message || 'Could not complete spin.', isError: true });
        return;
    }

    spinsRemaining = serverData.spinsRemaining ?? spinsRemaining;
    if (typeof serverData.unclaimedRewards === 'number') {
        totalWon = serverData.unclaimedRewards;
    } else if (serverData.wonAmount > 0) {
        totalWon += serverData.wonAmount;
    }

    const results = Array.isArray(serverData.resultSymbols) ? serverData.resultSymbols : [0, 0, 0];
    const resultPositions = results.map((sym) => findReelPositionForSymbol(sym));
    const costPerSpin = Math.min(parseFloat(document.getElementById('cost-per-spin').value) || SPIN_COST, MAX_COST_PER_SPIN);

    for (let i = 1; i <= 3; i++) {
        const reel = document.getElementById(`reel-${i}`);
        const strip = reel.querySelector('.reel-strip');
        if (reel && strip) {
            const currentTransform = strip.style.transform;
            const currentY = currentTransform ? parseFloat(currentTransform.match(/-?\d+\.?\d*/)?.[0] || '0') : 0;
            strip.style.setProperty('--spin-start', `${currentY}px`);
            reel.classList.add('spinning');
        }
    }

    setTimeout(() => stopReel(1, resultPositions[0]), 1000);
    setTimeout(() => stopReel(2, resultPositions[1]), 1500);
    setTimeout(() => stopReel(3, resultPositions[2]), 2000);

    setTimeout(async () => {
        calculateWin(results, costPerSpin);
        isSpinning = false;
        loadGameStats();
        loadLeaderboard('spins');
        updateDisplay();
        updateButtonStates();
        updateSpinButtonText();

        if (isAutoSpinning && spinsRemaining > 0) {
            setTimeout(() => { performSpin(); }, 500);
        } else if (isAutoSpinning && spinsRemaining <= 0) {
            isAutoSpinning = false;
            updateSpinButtonText();
        }
    }, 2500);
}

// Update spin button text based on state
function updateSpinButtonText() {
    const spinBtn = document.getElementById('spin-button');
    if (!spinBtn) return;
    
    if (isSpinning) {
        spinBtn.innerHTML = 'SPINNING<br><span class="spin-button-subtitle">CLICK TO STOP AUTOSPIN</span>';
    } else if (isAutoSpinning) {
        spinBtn.innerHTML = 'SPINNING<br><span class="spin-button-subtitle">CLICK TO STOP AUTOSPIN</span>';
    } else {
        spinBtn.innerHTML = 'SPIN<br><span class="spin-button-subtitle">CLICK FOR AUTOSPIN</span>';
    }
}

// Stop Reel - position a specific symbol index from the reel strip in the center
function stopReel(reelNum, targetPosition) {
    const reel = document.getElementById(`reel-${reelNum}`);
    const strip = reel.querySelector('.reel-strip');
    
    reel.classList.remove('spinning');
    reel.classList.add('stopping');
    
    // Calculate position using pixels for accuracy
    const reelHeight = reel.offsetHeight;
    // Position so the chosen symbol (at targetPosition) is centered on the winline
    // Each symbol occupies exactly reelHeight in the strip, so:
    // offset = -(targetPosition * reelHeight)
    const offset = -(targetPosition * reelHeight);
    strip.style.transform = `translateY(${offset}px)`;
    strip.style.transition = 'transform 0.5s ease-out';
}

// Calculate Win
function calculateWin(results, bet) {
    const winDisplay = document.getElementById('win-display');
    const winMessage = document.getElementById('win-message');
    
    let win = 0;
    
    // Check for 3-of-a-kind
    if (results[0] === results[1] && results[1] === results[2]) {
        // All symbols match - use payout table
        const symbolIndex = results[0];
        const costPerSpin = Math.min(parseFloat(document.getElementById('cost-per-spin').value) || SPIN_COST, MAX_COST_PER_SPIN);
        win = getPayoutAmount(symbolIndex, costPerSpin);
        
        if (win > 0) {
            totalWon += win;
            winMessage.textContent = `${win.toLocaleString()} ${getTokenLabel()}`;
            winDisplay.style.display = 'block';
            
            setTimeout(() => {
                winDisplay.style.display = 'none';
            }, 3000);
        }
    }
    // No popup for losses - just update display silently
    
    // Return the win amount so it can be saved to database
    return win;
}

// Withdraw Winnings - Transfer tokens from treasury to user wallet
// Uses backend API to get presigned transaction from treasury
async function withdrawWinnings() {
    if (totalWon <= 0) {
        showSlotsMessage({ title: 'No winnings', message: 'No winnings to withdraw.', isError: true });
        return;
    }
    
    if (!wallet || !connection) {
        showSlotsMessage({ title: 'Wallet required', message: 'Please connect your wallet.', isError: true });
        return;
    }
    
    // Check if SPL token library is loaded
    if (!window.splToken) {
        showSlotsMessage({ title: 'Loading', message: 'SPL token library is still loading. Please wait a moment and try again.', isError: true });
        return;
    }
    
    // Security: Validate wallet address format
    try {
        const { PublicKey } = window.solanaWeb3 || solanaWeb3;
        new PublicKey(wallet); // Will throw if invalid
    } catch (error) {
        showSlotsMessage({ title: 'Invalid wallet', message: 'Invalid wallet address.', isError: true });
        console.error('Invalid wallet address:', wallet);
        return;
    }
    
    // Set collecting flag and disable button immediately
    isCollecting = true;
    const withdrawBtn = document.getElementById('withdraw-button');
    if (withdrawBtn) {
        withdrawBtn.disabled = true;
    }
    
    let collectProcessing = false;
    try {
        const amount = totalWon;

        if (window.CasinoFees?.showCasinoProcessing) {
            window.CasinoFees.showCasinoProcessing(
                'Preparing your collect…',
                'Processing collect'
            );
            collectProcessing = true;
        }
        
        // Call backend API to get presigned transaction
        const response = await fetch('/api/collect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userWallet: wallet,
                amount: amount,
                gameType: 'slots',
                token: typeof window.__SLOTS_TOKEN__ !== 'undefined' ? window.__SLOTS_TOKEN__ : 'bux'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            let errorMessage = errorData.error || errorData.message || 'Failed to create collect transaction';
            
            // Add more details if available
            if (errorData.treasuryAccount) {
                errorMessage += ` (Treasury account: ${errorData.treasuryAccount})`;
            }
            if (errorData.availableBalance !== undefined) {
                errorMessage += ` (Available: ${errorData.availableBalance} ${getTokenLabel()})`;
            }
            
            console.error('Collect API error:', errorData);
            throw new Error(errorMessage);
        }

        const collectData = await response.json();
        if (collectData.reconciled) {
            totalWon = 0;
            await loadPlayerData();
            await updateBalance();
            updateDisplay();
            updateButtonStates();
            showSlotsMessage({
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

        // Deserialize the presigned transaction
        const { Transaction } = window.solanaWeb3 || solanaWeb3;
        // Convert base64 to Uint8Array for browser
        const transactionBytes = Uint8Array.from(atob(transactionBase64), c => c.charCodeAt(0));
        const transaction = Transaction.from(transactionBytes);

        // Send the transaction with retry logic for rate limits
        // Try with preflight first, then without if it fails (for mobile/Phantom browser compatibility)
        let retries = 3;
        let signature;
        let lastError = null;
        
        while (retries > 0) {
            try {
                // Send transaction with preflight to ensure it's valid before sending
                // This helps catch issues before the transaction is sent
                signature = await connection.sendRawTransaction(transaction.serialize(), {
                    skipPreflight: false,
                    maxRetries: 3,
                    preflightCommitment: 'confirmed'
                });
                
                console.log(`Transaction sent successfully. Signature: ${signature}`);
                console.log(`View on Solscan: https://solscan.io/tx/${signature}`);
                
                // Immediately check if transaction was accepted
                const immediateStatus = await connection.getSignatureStatus(signature);
                if (immediateStatus && immediateStatus.value && immediateStatus.value.err) {
                    throw new Error(`Transaction failed immediately: ${JSON.stringify(immediateStatus.value.err)}`);
                }
                
                break;
            } catch (error) {
                lastError = error;
                const errorMsg = error.message || error.toString() || '';
                
                // If this is a SendTransactionError, try to pull full simulation logs
                try {
                    // Log the full error object for debugging
                    console.error('Collect transaction error details:', {
                        message: error.message,
                        name: error.name,
                        stack: error.stack,
                        logs: error.logs,
                        hasGetLogs: typeof error.getLogs === 'function'
                    });
                    
                    if (typeof error.getLogs === 'function') {
                        try {
                            const logs = await error.getLogs(connection);
                            if (logs && logs.length) {
                                console.error('Collect transaction simulation logs (preflight):', logs);
                            } else {
                                console.error('Collect transaction simulation logs (preflight): <no logs>');
                            }
                        } catch (getLogsError) {
                            console.error('Error calling getLogs():', getLogsError);
                            // Try to get logs from error object directly
                            if (error.logs && Array.isArray(error.logs)) {
                                console.error('Collect transaction logs (from error.logs):', error.logs);
                            }
                        }
                    } else if (Array.isArray(error.logs)) {
                        console.error('Collect transaction simulation logs (preflight, from error.logs):', error.logs);
                    } else {
                        console.error('No logs available in error object');
                    }
                } catch (logErr) {
                    console.error('Failed to fetch simulation logs for collect (preflight):', logErr);
                }
                
                // If it's a simulation error about treasury account, provide helpful error message
                if (errorMsg.includes('attempt to debit') || errorMsg.includes('no record of a prior credit')) {
                    // This error specifically means treasury account doesn't have balance
                    throw new Error(`Transaction failed: Treasury token account has insufficient balance or doesn't exist. This usually happens when:\n1. No purchases have been made with the new treasury wallet yet\n2. The treasury account hasn't received tokens\n\nPlease make a purchase first to fund the treasury, or contact support if purchases have already been made.`);
                }
                
                // If it's a simulation error and we haven't tried without preflight yet, try that
                if (errorMsg.includes('Simulation failed')) {
                    console.warn('Preflight simulation failed, trying without preflight...');
                    try {
                        signature = await connection.sendRawTransaction(transaction.serialize(), {
                            skipPreflight: true,
                            maxRetries: 3
                        });
                        break;
                    } catch (skipPreflightError) {
                        console.error('Transaction failed even without preflight:', skipPreflightError);
                        const skipErrorMsg = skipPreflightError.message || skipPreflightError.toString() || '';
                        
                        // Check for treasury account error
                        if (skipErrorMsg.includes('attempt to debit') || skipErrorMsg.includes('no record of a prior credit')) {
                            throw new Error(`Transaction failed: Treasury token account has insufficient balance or doesn't exist. Please make a purchase first to fund the treasury, or contact support if purchases have already been made.`);
                        }
                        
                        // Try to get logs if it's a SendTransactionError
                        let detailedError = skipErrorMsg;
                        try {
                            if (typeof skipPreflightError.getLogs === 'function') {
                                const logs = await skipPreflightError.getLogs(connection);
                                if (logs && logs.length) {
                                    console.error('Collect transaction simulation logs (skipPreflight):', logs);
                                    detailedError += `\nSimulation logs:\n${logs.join('\n')}`;
                                } else {
                                    detailedError += '\nSimulation logs: <no logs>';
                                }
                            } else if (Array.isArray(skipPreflightError.logs)) {
                                console.error('Collect transaction simulation logs (skipPreflight, from error.logs):', skipPreflightError.logs);
                                detailedError += `\nSimulation logs:\n${skipPreflightError.logs.join('\n')}`;
                            }
                        } catch (logErr) {
                            console.error('Failed to fetch simulation logs for collect (skipPreflight):', logErr);
                        }
                        
                        throw new Error(`Transaction simulation failed: ${detailedError}. This usually means the treasury token account doesn't exist or has insufficient balance. If you just switched treasury wallets, make sure at least one purchase has been made to create the treasury token account.`);
                    }
                }
                
                // Handle rate limiting
                if (errorMsg.includes('403') || errorMsg.includes('429')) {
                    retries--;
                    if (retries > 0) {
                        console.warn(`RPC rate limited on send, retrying... (${3 - retries}/3)`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
                        continue;
                    }
                }
                
                // If we get here, it's not a rate limit issue
                throw error;
            }
        }
        
        if (!signature && lastError) {
            throw lastError;
        }

        if (window.CasinoFees?.confirmTransactionBestEffort) {
            await window.CasinoFees.confirmTransactionBestEffort(connection, signature);
        } else {
            try {
                await connection.confirmTransaction(signature, 'confirmed');
            } catch (confirmError) {
                console.warn('Client confirmation timed out; server will verify on-chain:', confirmError);
            }
        }

        const tokenUsed = typeof window.__SLOTS_TOKEN__ !== 'undefined' ? window.__SLOTS_TOKEN__ : 'bux';
        if (window.CasinoFees?.confirmCollectWithServer) {
            await window.CasinoFees.confirmCollectWithServer({
                wallet: wallet,
                signature: signature,
                amount: actualAmount || amount,
                gameType: 'slots',
                token: tokenUsed,
            });
        } else {
            let confirmSuccess = false;
            let confirmRetries = 5;
            let confirmWaitTime = 2000;
            while (confirmRetries > 0 && !confirmSuccess) {
                const confirmResponse = await fetch('/api/confirm-collect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userWallet: wallet,
                        signature: signature,
                        amount: actualAmount || amount,
                        gameType: 'slots',
                        token: tokenUsed,
                    }),
                });
                if (confirmResponse.ok) {
                    confirmSuccess = true;
                    break;
                }
                const errorData = await confirmResponse.json().catch(() => ({}));
                if (errorData.error === 'Transaction not found' && confirmRetries > 1) {
                    await new Promise(resolve => setTimeout(resolve, confirmWaitTime));
                    confirmWaitTime *= 1.5;
                    confirmRetries--;
                    continue;
                }
                if (confirmResponse.status === 202 && confirmRetries > 1) {
                    await new Promise(resolve => setTimeout(resolve, confirmWaitTime));
                    confirmRetries--;
                    continue;
                }
                throw new Error(errorData.message || errorData.error || 'Could not confirm collect with server');
            }
        }

        // Reset total won (now that database is updated)
        totalWon = 0;

        // Update balance
        await updateBalance();
        updateDisplay();
        updateButtonStates();

        const collectedAmount = actualAmount || amount;
        const collectedLabel = window.CasinoFees?.formatBuxWithUsd
            ? await window.CasinoFees.formatBuxWithUsd(collectedAmount, { label: getTokenLabel() })
            : `${collectedAmount.toLocaleString()} ${getTokenLabel()}`;
        showSlotsMessage({
            title: 'Collect complete',
            message: `Successfully collected ${collectedLabel}! Your balance should update shortly.`,
            txSignature: signature
        });
    } catch (error) {
        console.error('Withdrawal error:', error);
        const errorMsg = error.message || error.toString() || '';
        
        // Handle user rejection gracefully
        if (errorMsg.includes('User rejected') || errorMsg.includes('User cancelled') || errorMsg.includes('rejected')) {
            // User intentionally rejected - don't show error, just return silently
            // But re-enable button
            isCollecting = false;
            updateButtonStates();
            return;
        }
        
        // Reload player data from database to restore correct totalWon value
        // This ensures the UI shows the correct unclaimed rewards even if transaction failed
        try {
            await loadPlayerData();
        } catch (loadError) {
            console.error('Failed to reload player data after collect error:', loadError);
        }
        
        showSlotsMessage({ title: 'Collect failed', message: 'Failed to collect winnings: ' + errorMsg, isError: true });
    } finally {
        if (collectProcessing && window.CasinoFees?.hideCasinoProcessing) {
            window.CasinoFees.hideCasinoProcessing();
        }
        // Always reset collecting flag and re-enable button
        isCollecting = false;
        updateButtonStates();
    }
}

// Update Display
function updateDisplay() {
    const label = getTokenLabel();
    document.getElementById('xma-balance').textContent = `${xmaBalance.toFixed(2)} ${label}`;
    document.getElementById('spins-remaining').textContent = spinsRemaining;
    document.getElementById('total-won').textContent = `${totalWon.toFixed(2)} ${label}`;
    // Update mobile stats
    const mobileBalance = document.getElementById('mobile-xma-balance');
    const mobileSpins = document.getElementById('mobile-spins-remaining');
    const mobileWon = document.getElementById('mobile-total-won');
    if (mobileBalance) mobileBalance.textContent = `${xmaBalance.toFixed(2)} ${label}`;
    if (mobileSpins) mobileSpins.textContent = spinsRemaining;
    if (mobileWon) mobileWon.textContent = `${totalWon.toFixed(2)} ${label}`;
}

// Setup Prize Modal
function setupPrizeModal() {
    const prizeBtn = document.getElementById('prize-structure-btn');
    const prizeBtnDesktop = document.getElementById('prize-structure-btn-desktop');
    const modal = document.getElementById('prize-modal');
    const closeBtn = document.getElementById('close-prize-modal');
    
    const openModal = () => {
        modal.classList.add('show');
    };
    
    // Open modal from mobile button
    if (prizeBtn) {
        prizeBtn.addEventListener('click', openModal);
    }
    
    // Open modal from desktop button
    if (prizeBtnDesktop) {
        prizeBtnDesktop.addEventListener('click', openModal);
    }
    
    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

// Setup Leaderboard Modal
// Setup Background Music
function setupBackgroundMusic() {
    // Create audio element
    backgroundMusic = new Audio('/music/the-night-circus-cory-alstad-main-version-43700-02-05.mp3');
    backgroundMusic.loop = true;
    backgroundMusic.volume = 0.5; // Set to 50% volume
    
    // Get music toggle button
    const musicToggleBtn = document.getElementById('music-toggle');
    const musicIconOn = document.getElementById('music-icon-on');
    const musicIconOff = document.getElementById('music-icon-off');
    
    if (!musicToggleBtn) return;
    
    // Sync button to current isMusicPlaying (user may have toggled from parent before this ran)
    musicToggleBtn.classList.toggle('active', isMusicPlaying);
    if (musicIconOn) musicIconOn.style.display = 'block';
    if (musicIconOff) musicIconOff.style.display = isMusicPlaying ? 'none' : 'block';
    
    // Function to update button visual state (off = same icon, corner X only via CSS)
    const updateButtonState = (playing) => {
        if (playing) {
            musicToggleBtn.classList.add('active');
            musicIconOn.style.display = 'block';
            musicIconOff.style.display = 'none';
        } else {
            musicToggleBtn.classList.remove('active');
            musicIconOn.style.display = 'block';
            musicIconOff.style.display = 'none';
        }
    };
    
    // Try to play music only if user has not turned it off (may require user interaction on some browsers)
    const playMusic = () => {
        if (backgroundMusic && isMusicPlaying) {
            backgroundMusic.play().catch(() => {
                // Silently fail - autoplay is blocked by browser policy
            });
        }
    };
    
    // Try to play on page load
    playMusic();
    
    // Also try to play after delays
    setTimeout(playMusic, 500);
    setTimeout(playMusic, 1500);
    setTimeout(playMusic, 3000);
    
    // Toggle is handled by inline onclick (window.toggleSlotsMusic) so it always fires
    // Try to play music on first user interaction (to bypass autoplay restrictions) - only if user hasn't turned it off
    const enableMusicOnInteraction = (e) => {
        var mt = document.getElementById('music-toggle');
        if (e && e.target && mt && mt.contains(e.target)) return; // don't start music when clicking the toggle
        if (backgroundMusic && isMusicPlaying && backgroundMusic.paused) {
            backgroundMusic.play().catch(() => {});
        }
    };
    
    ['click', 'keydown', 'touchstart', 'mousedown'].forEach(eventType => {
        document.addEventListener(eventType, enableMusicOnInteraction, { once: true, passive: true });
    });
}

function setupLeaderboardModal() {
    const leaderboardBtn = document.getElementById('leaderboard-btn-desktop');
    const modal = document.getElementById('leaderboard-modal');
    const closeBtn = document.getElementById('close-leaderboard-modal');
    const sortSelect = document.getElementById('leaderboard-sort');
    
    const openModal = async () => {
        if (!modal) {
            console.error('Leaderboard modal not found');
            return;
        }
        modal.classList.add('show');
        await loadLeaderboard('spins'); // Default sort
    };
    
    // Open modal from button
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', openModal);
    }
    
    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }
    
    // Close on background click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
    
    // Handle sort change
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            loadLeaderboard(e.target.value);
        });
    }
}

// Load leaderboard data
async function loadLeaderboard(sortBy = 'spins') {
    const loadingEl = document.getElementById('leaderboard-loading');
    const errorEl = document.getElementById('leaderboard-error');
    const listEl = document.getElementById('leaderboard-list');
    
    // Show loading
    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';
    
    try {
        const tokenUsed = (typeof window.__SLOTS_TOKEN__ !== 'undefined' ? window.__SLOTS_TOKEN__ : 'bux');
        const response = await fetch(`/api/leaderboard?gameType=slots&tokenUsed=${encodeURIComponent(tokenUsed)}&sortBy=${sortBy}&limit=100`);
        
        if (!response.ok) {
            throw new Error(`Failed to load leaderboard: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Display leaderboard
        if (listEl && data.leaderboard) {
            if (data.leaderboard.length === 0) {
                listEl.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No players yet. Be the first!</p>';
            } else {
                listEl.innerHTML = data.leaderboard.map((player, index) => {
                    const rank = index + 1;
                    const winRate = player.winRate.toFixed(2);
                    const totalWon = player.totalWon.toFixed(2);
                    const totalWagered = player.totalWagered.toFixed(2);
                    
                    return `
                        <div class="leaderboard-item">
                            <div class="leaderboard-rank">#${rank}</div>
                            <div class="leaderboard-wallet">${player.displayAddress}</div>
                            <div class="leaderboard-stats">
                                <div class="leaderboard-stat">
                                    <span class="stat-label">Spins:</span>
                                    <span class="stat-value">${player.totalSpins.toLocaleString()}</span>
                                </div>
                                <div class="leaderboard-stat">
                                    <span class="stat-label">Won:</span>
                                    <span class="stat-value">${totalWon} ${getTokenLabel()}</span>
                                </div>
                                <div class="leaderboard-stat">
                                    <span class="stat-label">Win %:</span>
                                    <span class="stat-value">${winRate}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        if (errorEl) {
            errorEl.textContent = error.message || 'Failed to load leaderboard';
            errorEl.style.display = 'block';
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Update Button States — only one of Buy / Spin / Collect is ever enabled
function updateButtonStates() {
    const purchaseBtn = document.getElementById('purchase-spins');
    const spinBtn = document.getElementById('spin-button');
    const withdrawBtn = document.getElementById('withdraw-button');
    if (!purchaseBtn || !spinBtn || !withdrawBtn) return;

    const buyEnabled = !!wallet && !isCollecting && spinsRemaining === 0 && totalWon === 0;
    const spinEnabled = !!wallet && !isCollecting && spinsRemaining > 0;
    const collectEnabled = !!wallet && !isCollecting && spinsRemaining === 0 && totalWon > 0;

    purchaseBtn.disabled = !buyEnabled;
    purchaseBtn.style.opacity = buyEnabled ? '1' : '0.5';
    purchaseBtn.style.cursor = buyEnabled ? 'pointer' : 'not-allowed';

    spinBtn.disabled = !spinEnabled;

    withdrawBtn.disabled = !collectEnabled;

    updateSpinButtonText();
}

// Database Functions

// Load game stats (grand totals)
async function loadGameStats() {
    try {
        const tokenUsed = (typeof window.__SLOTS_TOKEN__ !== 'undefined' ? window.__SLOTS_TOKEN__ : 'bux');
        const response = await fetch(`/api/game-stats?gameType=slots&tokenUsed=${encodeURIComponent(tokenUsed)}`);
        
        if (!response.ok) {
            console.error('Failed to load game stats:', response.statusText);
            return;
        }
        
        const data = await response.json();
        
        // Update grand totals display
        const grandTotalSpinsEl = document.getElementById('grand-total-spins');
        const grandTotalWonEl = document.getElementById('grand-total-won');
        
        if (grandTotalSpinsEl) {
            grandTotalSpinsEl.textContent = data.grandTotalSpins.toLocaleString();
        }
        
        if (grandTotalWonEl) {
            grandTotalWonEl.textContent = `${data.grandTotalWon.toFixed(2)} ${getTokenLabel()}`;
        }
        
        console.log('Game stats loaded:', data);
    } catch (error) {
        console.error('Error loading game stats:', error);
        // Don't show error to user - just continue without stats
    }
}

// Load player data from database
let isLoadingPlayerData = false; // Prevent duplicate calls
async function loadPlayerData() {
    if (!wallet) return;
    
    // Prevent duplicate simultaneous calls
    if (isLoadingPlayerData) return;
    
    isLoadingPlayerData = true;
    
    try {
        const response = await fetch(`/api/load-player?walletAddress=${encodeURIComponent(wallet)}&gameType=slots&tokenUsed=${typeof window.__SLOTS_TOKEN__ !== 'undefined' ? window.__SLOTS_TOKEN__ : 'bux'}`, {
            signal: AbortSignal.timeout(25000) // 25s for cold DB/API
        });
        
        if (!response.ok) {
            console.error('Failed to load player data:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        
        console.log('Player data loaded from database:', data);
        
        // Restore unclaimed rewards
        if (data.unclaimedRewards > 0) {
            totalWon = data.unclaimedRewards;
            console.log('Restored unclaimed rewards:', data.unclaimedRewards);
        }
        
        // Restore spins remaining (always restore, even if 0, to sync with database)
        spinsRemaining = data.spinsRemaining || 0;
        console.log('Restored spins remaining:', spinsRemaining);
        
        // Restore cost per spin for remaining spins (nearest option: 100,200,...,1000)
        if (data.costPerSpin != null && spinsRemaining > 0) {
            const costPerSpinSelect = document.getElementById('cost-per-spin');
            if (costPerSpinSelect) {
                const costOptions = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
                const restored = Math.min(1000, Math.max(100, Number(data.costPerSpin)));
                const nearest = costOptions.reduce((a, b) => Math.abs(b - restored) < Math.abs(a - restored) ? b : a);
                costPerSpinSelect.value = String(nearest);
                console.log('Restored cost per spin:', costPerSpinSelect.value);
            }
        }
        
        // Update display and buttons
        updateDisplay();
        updateButtonStates();
        
        console.log('Player data loaded:', {
            totalSpins: data.totalSpins,
            totalWon: data.totalWon,
            unclaimedRewards: data.unclaimedRewards,
            spinsRemaining: data.spinsRemaining,
            costPerSpin: data.costPerSpin
        });
    } catch (error) {
        // Only log if it's not an abort/timeout (which are expected in some cases)
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            console.warn('loadPlayerData: Request timeout or aborted');
        } else if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
            console.warn('loadPlayerData: Network error - API may be unavailable or request was aborted');
        } else {
            console.error('Error loading player data:', error);
        }
        // Don't show error to user - just continue without saved data
    } finally {
        isLoadingPlayerData = false;
    }
}
