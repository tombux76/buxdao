/**
 * BUXDAO Roulette — $BUX token flow.
 * Buy chips, place bets, spin. Collect uses server-signed tx (no user signing).
 */
(function () {
    'use strict';

    var WHEEL_ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
    var RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    var SEGMENTS = 38;
    var SLIDE_MS = 65;
    var CELL_H = 66;

    var BUX_TOKEN_MINT = 'AaKrMsZkuAdJL6TKZbj7X1VaH5qWioL7oDHagQZa1w59';
    var KNUKL_TOKEN_MINT = '6sYhJZDwqHpv1shyVeZ91tx8QYSiHJh2bio97Qdhq1br';
    var TREASURY_WALLET = 'FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75'; // BUX casino pool fallback
    var BUX_DECIMALS = 9;
    var KNUKL_DECIMALS = 6;
    var ALLOWED_COST_PER_CHIP = [10, 50, 100, 500];
    var ALLOWED_NUM_CHIPS = [10, 50, 100, 200, 500, 1000, 5000];
    var SOLSCAN_TX_BASE = 'https://solscan.io/tx/';

    var wallet = null;
    var connection = null;
    var tokenBalance = 0;
    var balanceFetchId = 0;
    var walletSetupPromise = null;
    var costPerChip = 1;
    var unclaimedRewards = 0;
    var isCollecting = false;

    var chipBalance = 0;
    var selectedChipValue = 0;
    var bets = {};
    var chipTypes = {};
    var undoHistory = [];
    var lastBets = {};
    var lastChipTypes = {};
    var last10Results = [];
    var spinInProgress = false;
    var userClickedChipYet = false;

    function isBuxToken() {
        return true;
    }
    function getTokenLabel() { return 'BUX'; }
    function getTokenMint() { return window.__BUX_TOKEN_MINT__ || BUX_TOKEN_MINT; }
    function getTokenDecimals() { return typeof window.__BUX_DECIMALS__ === 'number' ? window.__BUX_DECIMALS__ : BUX_DECIMALS; }
    function getTreasuryWallet() {
        return window.__TREASURY_WALLET__ || (window.CasinoFees && window.CasinoFees.getTreasuryWallet()) || TREASURY_WALLET;
    }
    function getPurchaseFeeSol() {
        return window.CasinoFees ? window.CasinoFees.getPurchaseFeeSol() : 0.002;
    }
    function getMinSolForPurchase() {
        var fee = window.CasinoFees ? window.CasinoFees.getTotalPurchaseFeeLamports() : 2000000;
        return fee + 10000;
    }

    function getRpcUrl() {
        if (window.CasinoFees && window.CasinoFees.getCasinoRpcUrl) {
            return window.CasinoFees.getCasinoRpcUrl();
        }
        return window.location.origin + '/api/solana/rpc';
    }

    function setCostPerChipLabel() {
        var el = document.getElementById('roulette-cost-per-chip-label');
        if (el) el.textContent = 'Cost per chip (' + getTokenLabel() + ')';
        var costSelect = document.getElementById('roulette-cost-per-chip');
        if (costSelect && window.CasinoFees && window.CasinoFees.updateBuxCostSelect) {
            window.CasinoFees.updateBuxCostSelect(costSelect);
        }
    }

    function showMessage(options) {
        var title = options.title;
        var message = options.message;
        var txSignature = options.txSignature;
        var isError = options.isError;
        var modal = document.getElementById('message-modal');
        var titleEl = document.getElementById('message-modal-title');
        var textEl = document.getElementById('message-modal-text');
        var txLink = document.getElementById('message-modal-tx-link');
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
        var modal = document.getElementById('message-modal');
        var closeBtn = document.getElementById('close-message-modal');
        var okBtn = document.getElementById('message-modal-ok');
        if (!modal) return;
        function closeModal() { modal.classList.remove('show'); }
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (okBtn) okBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('show')) closeModal(); });
    }

    function getBgColor(num) {
        if (num === 0 || num === '00') return '#0d7d3a';
        return RED_NUMBERS.indexOf(num) !== -1 ? '#b91c1c' : '#1c1917';
    }

    function getBetKey(el) {
        var key = el.getAttribute('data-num');
        if (key != null) return String(key);
        return el.getAttribute('data-bet') || '';
    }

    function getTotalStaked() {
        var total = 0;
        for (var k in bets) if (bets.hasOwnProperty(k)) total += bets[k];
        return total;
    }

    function updateChipUI() {
        var el = document.getElementById('roulette-chips');
        if (el) el.textContent = chipBalance;
        updateToCollectUI();
    }

    function updateStakedUI() {
        var el = document.getElementById('roulette-staked');
        if (el) el.textContent = getTotalStaked();
    }

    function getTotalToCollect() {
        return chipBalance * costPerChip + unclaimedRewards;
    }

    function updateToCollectUI() {
        var el = document.getElementById('roulette-to-collect');
        if (el) el.textContent = Math.floor(unclaimedRewards) + ' ' + getTokenLabel();
    }

    function renderChipStacks() {
        var overlay = document.getElementById('roulette-chip-overlay');
        var table = document.querySelector('.roulette-table');
        if (!overlay || !table) return;
        overlay.innerHTML = '';
        var cells = table.querySelectorAll('.roulette-num, .roulette-zero-cell, .roulette-outside-bet');
        var overlayRect = overlay.getBoundingClientRect();
        cells.forEach(function (cell) {
            var key = getBetKey(cell);
            var amount = bets[key];
            if (amount && amount > 0) {
                var stack = document.createElement('div');
                var chipClass = chipTypes[key] ? 'roulette-chip-stack roulette-chip-' + chipTypes[key] : 'roulette-chip-stack roulette-chip-10';
                stack.className = chipClass;
                stack.textContent = amount;
                var cellRect = cell.getBoundingClientRect();
                var left = cellRect.left - overlayRect.left + cellRect.width / 2;
                var top = cellRect.top - overlayRect.top + cellRect.height / 2;
                stack.style.left = left + 'px';
                stack.style.top = top + 'px';
                overlay.appendChild(stack);
            }
        });
    }

    var COL1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
    var COL2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
    var COL3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

    function getPayoutMultiplier(key, result) {
        var num = result === '00' ? '00' : (result === 0 ? 0 : Number(result));
        if (key === '0' || key === '00' || (key >= '1' && key <= '36')) {
            if (String(key) === String(result)) return 35;
            return 0;
        }
        if (num !== 0 && num !== '00') {
            var n = Number(num);
            switch (key) {
                case 'red': return RED_NUMBERS.indexOf(n) !== -1 ? 1 : 0;
                case 'black': return RED_NUMBERS.indexOf(n) === -1 ? 1 : 0;
                case 'even': return n % 2 === 0 ? 1 : 0;
                case 'odd': return n % 2 === 1 ? 1 : 0;
                case '1-18': return n >= 1 && n <= 18 ? 1 : 0;
                case '19-36': return n >= 19 && n <= 36 ? 1 : 0;
                case '1-12': return n >= 1 && n <= 12 ? 2 : 0;
                case '13-24': return n >= 13 && n <= 24 ? 2 : 0;
                case '25-36': return n >= 25 && n <= 36 ? 2 : 0;
                case 'col1': return COL1.indexOf(n) !== -1 ? 2 : 0;
                case 'col2': return COL2.indexOf(n) !== -1 ? 2 : 0;
                case 'col3': return COL3.indexOf(n) !== -1 ? 2 : 0;
            }
        }
        return 0;
    }

    function calculateWinnings(result) {
        var profit = 0;
        var totalReturned = 0;
        for (var key in bets) {
            if (!bets.hasOwnProperty(key)) continue;
            var stake = bets[key];
            var mult = getPayoutMultiplier(key, result);
            if (mult > 0) {
                profit += stake * mult;
                totalReturned += stake * (1 + mult);
            }
        }
        return { profit: profit, totalReturned: totalReturned };
    }

    function placeBet(key, amount) {
        bets[key] = (bets[key] || 0) + amount;
        chipTypes[key] = selectedChipValue;
        chipBalance -= amount;
        undoHistory.push({ key: key, amount: amount });
        updatePopups();
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
        updateRouletteButtonStates();
    }

    function undoLastBet() {
        if (undoHistory.length === 0) return;
        var last = undoHistory.pop();
        var key = last.key;
        var amount = last.amount;
        bets[key] = (bets[key] || 0) - amount;
        if (bets[key] <= 0) { delete bets[key]; delete chipTypes[key]; }
        chipBalance += amount;
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
        updateRouletteButtonStates();
    }

    function updateUndoButton() {
        var btn = document.getElementById('roulette-undo');
        if (btn) btn.disabled = undoHistory.length === 0;
    }

    function updateReplaceButton() {
        var btn = document.getElementById('roulette-replace');
        if (!btn) return;
        var total = 0;
        for (var k in lastBets) if (lastBets.hasOwnProperty(k)) total += lastBets[k];
        btn.disabled = Object.keys(lastBets).length === 0 || chipBalance < total;
    }

    function showWinMessage(profit) {
        var overlay = document.getElementById('roulette-win-display');
        var msg = document.getElementById('roulette-win-message');
        if (!overlay || !msg) return;
        if (profit > 0) {
            msg.textContent = 'You won ' + profit + ' chips!';
        } else {
            msg.textContent = 'No win this spin.';
        }
        overlay.style.display = 'block';
        setTimeout(function () { overlay.style.display = 'none'; }, 3000);
    }

    function clearTable() {
        bets = {};
        chipTypes = {};
        undoHistory = [];
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
    }

    function replaceChips() {
        var total = 0;
        for (var k in lastBets) if (lastBets.hasOwnProperty(k)) total += lastBets[k];
        if (chipBalance < total || Object.keys(lastBets).length === 0) return;
        for (var key in lastBets) {
            if (lastBets.hasOwnProperty(key)) {
                bets[key] = lastBets[key];
                chipTypes[key] = lastChipTypes[key] || 10;
                chipBalance -= lastBets[key];
            }
        }
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
        updateRouletteButtonStates();
    }

    function copyBets(src) {
        var out = {};
        for (var k in src) if (src.hasOwnProperty(k)) out[k] = src[k];
        return out;
    }

    function updatePopups() {
        var popupSelect = document.getElementById('roulette-popup-select-chip');
        var popupPlace = document.getElementById('roulette-popup-place-chip');
        if (!popupSelect || !popupPlace) return;
        if (spinInProgress || chipBalance <= 0) {
            popupSelect.classList.remove('roulette-popup-visible');
            popupPlace.classList.remove('roulette-popup-visible');
            return;
        }
        if (userClickedChipYet) {
            popupSelect.classList.remove('roulette-popup-visible');
            popupPlace.classList.add('roulette-popup-visible');
        } else {
            popupSelect.classList.add('roulette-popup-visible');
            popupPlace.classList.remove('roulette-popup-visible');
        }
    }

    function bindChipSelector() {
        var chips = document.querySelectorAll('.roulette-chip');
        chips.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var val = parseInt(btn.getAttribute('data-value'), 10);
                if (isNaN(val)) return;
                selectedChipValue = val;
                userClickedChipYet = true;
                updatePopups();
                chips.forEach(function (b) { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
                btn.classList.add('selected');
                btn.setAttribute('aria-pressed', 'true');
            });
        });
    }

    function bindTableClicks() {
        var table = document.querySelector('.roulette-table');
        if (!table) return;
        table.addEventListener('click', function (e) {
            var cell = e.target.closest('.roulette-num, .roulette-zero-cell, .roulette-outside-bet');
            if (!cell) return;
            if (!selectedChipValue || chipBalance < selectedChipValue) return;
            var key = getBetKey(cell);
            if (!key) return;
            placeBet(key, selectedChipValue);
        });
    }

    function setSlot(slotEl, num) {
        if (!slotEl) return;
        slotEl.textContent = num;
        slotEl.style.background = getBgColor(num);
    }

    function getSlider(cellEl) { return cellEl ? cellEl.querySelector('.roulette-cell-slider') : null; }
    function getSlots(cellEl) {
        if (!cellEl) return [null, null];
        var slots = cellEl.querySelectorAll('.roulette-cell-num');
        return [slots[0] || null, slots[1] || null];
    }

    function setCellToIndex(cellEl, centerIndex, offset) {
        var idx = (centerIndex + offset + SEGMENTS) % SEGMENTS;
        var num = WHEEL_ORDER[idx];
        var slots = getSlots(cellEl);
        setSlot(slots[0], num);
        setSlot(slots[1], WHEEL_ORDER[(idx + 1) % SEGMENTS]);
        var slider = getSlider(cellEl);
        if (slider) { slider.style.transition = 'none'; slider.style.transform = 'translateY(0px)'; }
    }

    function showThree(centerIndex) {
        var above = document.getElementById('roulette-cell-above');
        var center = document.getElementById('roulette-cell-center');
        var below = document.getElementById('roulette-cell-below');
        setCellToIndex(above, centerIndex, -1);
        setCellToIndex(center, centerIndex, 0);
        setCellToIndex(below, centerIndex, 1);
    }

    function doOneSlide(above, center, below, currentIdx, onDone) {
        var nextIdx = (currentIdx + 1) % SEGMENTS;
        var slotsA = getSlots(above), slotsC = getSlots(center), slotsB = getSlots(below);
        setSlot(slotsA[1], WHEEL_ORDER[(nextIdx - 1 + SEGMENTS) % SEGMENTS]);
        setSlot(slotsC[1], WHEEL_ORDER[nextIdx]);
        setSlot(slotsB[1], WHEEL_ORDER[(nextIdx + 1) % SEGMENTS]);
        var sliderA = getSlider(above), sliderC = getSlider(center), sliderB = getSlider(below);
        var t = (SLIDE_MS / 1000) + 's';
        sliderA.style.transition = 'transform ' + t + ' ease-out';
        sliderC.style.transition = 'transform ' + t + ' ease-out';
        sliderB.style.transition = 'transform ' + t + ' ease-out';
        sliderA.style.transform = 'translateY(-' + CELL_H + 'px)';
        sliderC.style.transform = 'translateY(-' + CELL_H + 'px)';
        sliderB.style.transform = 'translateY(-' + CELL_H + 'px)';
        setTimeout(function () {
            setSlot(slotsA[0], WHEEL_ORDER[(nextIdx - 1 + SEGMENTS) % SEGMENTS]);
            setSlot(slotsC[0], WHEEL_ORDER[nextIdx]);
            setSlot(slotsB[0], WHEEL_ORDER[(nextIdx + 1) % SEGMENTS]);
            setSlot(slotsA[1], WHEEL_ORDER[(nextIdx + SEGMENTS - 2) % SEGMENTS]);
            setSlot(slotsC[1], WHEEL_ORDER[(nextIdx + 1) % SEGMENTS]);
            setSlot(slotsB[1], WHEEL_ORDER[(nextIdx + 2) % SEGMENTS]);
            sliderA.style.transition = 'none'; sliderA.style.transform = 'translateY(0)';
            sliderC.style.transition = 'none'; sliderC.style.transform = 'translateY(0)';
            sliderB.style.transition = 'none'; sliderB.style.transform = 'translateY(0)';
            if (onDone) onDone(nextIdx);
        }, SLIDE_MS);
    }

    function spinReel(resultNumber, callback) {
        var resultIdx = WHEEL_ORDER.indexOf(resultNumber);
        if (resultIdx === -1) return;
        var above = document.getElementById('roulette-cell-above');
        var center = document.getElementById('roulette-cell-center');
        var below = document.getElementById('roulette-cell-below');
        if (!above || !center || !below) return;
        var duration = 3000;
        var totalSteps = 45 + Math.floor(Math.random() * 15);
        var startIdx = (resultIdx - totalSteps + SEGMENTS * 100) % SEGMENTS;
        showThree(startIdx);
        var currentIdx = startIdx;
        var step = 0;
        function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
        function runNextSlide() {
            if (step >= totalSteps) {
                showThree(resultIdx);
                if (typeof callback === 'function') callback();
                return;
            }
            doOneSlide(above, center, below, currentIdx, function (newIdx) {
                currentIdx = newIdx;
                step++;
                if (step >= totalSteps) {
                    showThree(resultIdx);
                    if (typeof callback === 'function') callback();
                    return;
                }
                var nextT = easeOutCubic((step + 1) / totalSteps);
                var prevT = easeOutCubic(step / totalSteps);
                var gap = (nextT - prevT) * duration - SLIDE_MS;
                setTimeout(runNextSlide, Math.max(10, gap));
            });
        }
        runNextSlide();
    }

    function getResultColorClass(num) {
        return (num === 0 || num === '00') ? 'roulette-green' : (RED_NUMBERS.indexOf(num) !== -1 ? 'roulette-red' : 'roulette-black');
    }

    function renderLast10() {
        var container = document.getElementById('roulette-last-10');
        if (!container) return;
        container.textContent = '';
        for (var i = 0; i < last10Results.length; i++) {
            var num = last10Results[i];
            var span = document.createElement('span');
            span.className = 'roulette-last-10-num ' + getResultColorClass(num);
            span.textContent = num;
            container.appendChild(span);
        }
    }

    function bindSpinButton() {
        var btn = document.getElementById('roulette-spin');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (btn.disabled) return;
            if (getTotalStaked() <= 0) return;
            btn.disabled = true;
            spinInProgress = true;
            userClickedChipYet = false;
            updatePopups();
            updateRouletteButtonStates();
            var betsSnapshot = copyBets(bets);
            saveSpinToDb(betsSnapshot, function (data, err) {
                if (err || !data) {
                    spinInProgress = false;
                    updateRouletteButtonStates();
                    showMessage({ title: 'Spin failed', message: (err && err.message) || 'Could not complete spin.', isError: true });
                    return;
                }
                var result = data.result;
                var profitChips = data.profitChips || 0;
                spinReel(result, function () {
                    last10Results.push(result);
                    if (last10Results.length > 7) last10Results.shift();
                    renderLast10();
                    lastBets = copyBets(betsSnapshot);
                    lastChipTypes = copyBets(chipTypes);
                    showWinMessage(profitChips);
                    chipBalance = typeof data.chipsBalance === 'number' ? data.chipsBalance : chipBalance;
                    if (typeof data.unclaimedRewards === 'number') {
                        unclaimedRewards = data.unclaimedRewards;
                    } else if (data.wonAmount > 0) {
                        unclaimedRewards += data.wonAmount;
                    }
                    clearTable();
                    userClickedChipYet = false;
                    selectedChipValue = 0;
                    document.querySelectorAll('.roulette-chip').forEach(function (b) { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
                    updateChipUI();
                    updateToCollectUI();
                    updateReplaceButton();
                    spinInProgress = false;
                    updateRouletteButtonStates();
                    updatePopups();
                });
            });
        });
    }

    function bindUndoButton() { var btn = document.getElementById('roulette-undo'); if (btn) btn.addEventListener('click', undoLastBet); }
    function bindReplaceButton() { var btn = document.getElementById('roulette-replace'); if (btn) btn.addEventListener('click', replaceChips); }

    function saveSpinToDb(betsSnapshot, onComplete) {
        if (!wallet) {
            if (onComplete) onComplete(null, new Error('No wallet'));
            return;
        }
        fetch('/api/save-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress: wallet,
                costPerChip: costPerChip,
                bets: betsSnapshot,
                gameType: 'roulette',
                tokenUsed: isBuxToken() ? 'bux' : 'bux'
            })
        }).then(function (res) {
            if (!res.ok) {
                return res.json().then(function (d) { throw new Error(d.error || d.message || 'Save failed'); });
            }
            return res.json();
        }).then(function (data) {
            if (onComplete) onComplete(data, null);
        }).catch(function (err) {
            console.error('Save spin error:', err);
            if (onComplete) onComplete(null, err);
        });
    }

    function updateRouletteButtonStates() {
        var buyBtn = document.getElementById('roulette-buy-chips');
        var spinBtn = document.getElementById('roulette-spin');
        var collectBtn = document.getElementById('roulette-collect');
        var totalStaked = getTotalStaked();
        var totalToCollect = getTotalToCollect();
        var buyEnabled = false, spinEnabled = false, collectEnabled = false;
        if (wallet && !isCollecting) {
            if (totalStaked > 0) spinEnabled = true;
            else if (chipBalance > 0) { }
            else if (totalToCollect > 0) collectEnabled = true;
            else buyEnabled = true;
        }
        if (buyBtn) buyBtn.disabled = !buyEnabled;
        if (spinBtn) spinBtn.disabled = totalStaked <= 0 || !spinEnabled || spinInProgress;
        if (collectBtn) collectBtn.disabled = !collectEnabled;
    }

    function initConnection() {
        var rpcUrl = getRpcUrl();
        if (typeof window.solanaWeb3 !== 'undefined') {
            connection = new window.solanaWeb3.Connection(rpcUrl, 'confirmed', { commitment: 'confirmed', disableRetryOnRateLimit: false, httpHeaders: { 'Content-Type': 'application/json' } });
        } else if (typeof solanaWeb3 !== 'undefined') {
            connection = new solanaWeb3.Connection(rpcUrl, 'confirmed', { commitment: 'confirmed', disableRetryOnRateLimit: false, httpHeaders: { 'Content-Type': 'application/json' } });
        }
    }

    function fetchServerBuxBalance() {
        if (!wallet) return Promise.resolve(null);
        return fetch('/api/casino/token-balance?wallet=' + encodeURIComponent(wallet))
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (data && typeof data.balance === 'number' && isFinite(data.balance)) return data.balance;
                return null;
            })
            .catch(function () { return null; });
    }

    function applyWalletConnected(addr, connectContainer, walletInfo, walletAddressEl) {
        if (addr && wallet === addr && walletSetupPromise) {
            return walletSetupPromise;
        }
        wallet = addr;
        if (walletAddressEl) walletAddressEl.textContent = addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : '';
        if (connectContainer) connectContainer.style.display = addr ? 'none' : 'block';
        if (walletInfo) walletInfo.style.display = addr ? 'flex' : 'none';
        if (!addr) {
            walletSetupPromise = null;
            connection = null;
            tokenBalance = 0;
            costPerChip = 1;
            unclaimedRewards = 0;
            chipBalance = 0;
            updateChipUI();
            updateStakedUI();
            updateRouletteButtonStates();
            try { window.parent.postMessage({ type: 'WALLET_DISCONNECTED' }, '*'); } catch (_) {}
            return Promise.resolve();
        }
        walletSetupPromise = Promise.resolve().then(function () {
            initConnection();
            return updateBalance();
        }).then(function () {
            return loadPlayerData();
        }).then(function () {
            updateRouletteButtonStates();
            try { window.parent.postMessage({ type: 'WALLET_CONNECTED', address: addr }, '*'); } catch (_) {}
        });
        return walletSetupPromise.finally(function () { walletSetupPromise = null; });
    }

    function setupWalletConnection() {
        var connectBtn = document.getElementById('connect-wallet');
        var disconnectBtn = document.getElementById('disconnect-wallet');
        var walletInfo = document.getElementById('wallet-info');
        var walletAddress = document.getElementById('wallet-address');
        var connectContainer = document.getElementById('connect-wallet');
        var isPhantomInstalled = typeof window.solana !== 'undefined' && (window.solana.isPhantom || typeof window.solana.connect === 'function');
        if (!isPhantomInstalled) {
            if (connectBtn) { connectBtn.textContent = 'Install Phantom'; connectBtn.onclick = function () { window.open('https://phantom.app/', '_blank'); }; }
            return;
        }
        try {
            if (window.solana && window.solana.isConnected) {
                window.solana.connect({ onlyIfTrusted: true }).then(function (r) {
                    if (r && r.publicKey) applyWalletConnected(r.publicKey.toString(), connectContainer, walletInfo, walletAddress);
                }).catch(function () {});
            }
        } catch (e) {}
        if (connectBtn) {
            connectBtn.addEventListener('click', function () {
                window.solana.connect({ onlyIfTrusted: false }).then(function (r) {
                    if (r && r.publicKey) applyWalletConnected(r.publicKey.toString(), connectContainer, walletInfo, walletAddress);
                }).catch(function (err) {
                    if (err && !String(err.message || '').match(/reject|authorized/i)) showMessage({ title: 'Connection failed', message: 'Failed to connect: ' + (err.message || err), isError: true });
                });
            });
        }
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', function () {
                if (window.solana && window.solana.disconnect) window.solana.disconnect();
                applyWalletConnected(null, connectContainer, walletInfo, walletAddress);
            });
        }
        if (window.self !== window.top) {
            try { window.parent.postMessage({ type: 'REQUEST_WALLET' }, '*'); } catch (_) {}
        }
    }

    function updateBalance() {
        if (!wallet) return Promise.resolve();
        var fetchId = ++balanceFetchId;
        return fetchServerBuxBalance().then(function (serverBalance) {
            if (fetchId !== balanceFetchId) return;
            if (serverBalance !== null) {
                tokenBalance = serverBalance;
                return;
            }
            if (!connection) initConnection();
            if (!connection || !window.splToken) return;
            var PublicKey = (window.solanaWeb3 || solanaWeb3).PublicKey;
            var tokenMint = new PublicKey(getTokenMint());
            var userPublicKey = new PublicKey(wallet);
            return window.splToken.getAssociatedTokenAddress(tokenMint, userPublicKey)
                .then(function (tokenAccount) { return window.splToken.getAccount(connection, tokenAccount); })
                .then(function (account) {
                    if (fetchId !== balanceFetchId) return;
                    tokenBalance = account ? Number(account.amount) / Math.pow(10, getTokenDecimals()) : 0;
                })
                .catch(function (err) {
                    if (fetchId !== balanceFetchId) return;
                    var errorMsg = (err && (err.message || err.toString())) || '';
                    if (errorMsg.indexOf('403') >= 0 || errorMsg.indexOf('429') >= 0 || errorMsg.indexOf('rate limit') >= 0) {
                        console.warn('RPC rate limited. Balance may not update.');
                    } else if (errorMsg.indexOf('not found') >= 0 || errorMsg.indexOf('TokenAccountNotFoundError') >= 0) {
                        tokenBalance = 0;
                    }
                });
        });
    }

    function loadPlayerData() {
        if (!wallet) return Promise.resolve();
        return fetch('/api/load-player?walletAddress=' + encodeURIComponent(wallet) + '&gameType=roulette&tokenUsed=' + (isBuxToken() ? 'bux' : 'bux'))
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data) return;
                chipBalance = data.chipsBalance || 0;
                costPerChip = data.costPerChip || 1;
                unclaimedRewards = data.unclaimedRewards || 0;
                var costInput = document.getElementById('roulette-cost-per-chip');
                if (costInput) {
                    var costToSet = ALLOWED_COST_PER_CHIP.indexOf(costPerChip) >= 0 ? costPerChip : 100;
                    costInput.value = String(costToSet);
                }
                setCostPerChipLabel();
                updateChipUI();
                updateToCollectUI();
                updatePopups();
                updateRouletteButtonStates();
            })
            .catch(function (err) { console.error('loadPlayerData:', err); });
    }

    function purchaseSpins() {
        if (!wallet) { showMessage({ title: 'Wallet required', message: 'Please connect your wallet first.', isError: true }); return; }
        if (!connection) initConnection();
        if (!connection) { showMessage({ title: 'Connection error', message: 'Could not connect to Solana RPC.', isError: true }); return; }
        if (chipBalance > 0) { showMessage({ title: 'Chips remaining', message: 'Use or collect your chips before buying more.', isError: true }); return; }
        var costEl = document.getElementById('roulette-cost-per-chip');
        var numEl = document.getElementById('roulette-num-chips');
        var cost = parseFloat(costEl && costEl.value ? costEl.value : 100);
        var num = parseInt(numEl && numEl.value ? numEl.value : 500, 10);
        if (ALLOWED_COST_PER_CHIP.indexOf(cost) < 0) cost = 100;
        if (ALLOWED_NUM_CHIPS.indexOf(num) < 0) num = 500;
        if (!cost || cost <= 0 || !num || num <= 0) { showMessage({ title: 'Invalid input', message: 'Please enter valid cost per chip and number of chips.', isError: true }); return; }
        var total = cost * num;
        var label = getTokenLabel();
        if (!window.splToken) { showMessage({ title: 'Loading', message: 'SPL token library is still loading. Please wait a moment and try again.', isError: true }); return; }
        var PublicKey = (window.solanaWeb3 || solanaWeb3).PublicKey;
        var Transaction = (window.solanaWeb3 || solanaWeb3).Transaction;
        var SystemProgram = (window.solanaWeb3 || solanaWeb3).SystemProgram;
        var tokenMint = new PublicKey(getTokenMint());
        var userPublicKey = new PublicKey(wallet);
        var treasuryPublicKey = new PublicKey(getTreasuryWallet());
        fetchServerBuxBalance().then(function (serverBalance) {
            if (serverBalance !== null) tokenBalance = serverBalance;
            if (tokenBalance < total) {
                showMessage({ title: 'Insufficient balance', message: 'You need ' + total + ' ' + label + ' but only have ' + tokenBalance.toFixed(2) + ' ' + label + '.', isError: true });
                return Promise.reject(new Error('INSUFFICIENT_BUX'));
            }
            return connection.getBalance(userPublicKey);
        }).then(function (solBal) {
            if (solBal == null) return;
            var minSol = getMinSolForPurchase();
            if (solBal < minSol) {
                showMessage({ title: 'Insufficient SOL', message: 'Need ~' + (minSol / 1e9).toFixed(4) + ' SOL for transaction fee (includes ' + getPurchaseFeeSol() + ' SOL fee). You have ' + (solBal / 1e9).toFixed(4) + ' SOL.', isError: true });
                return Promise.reject(new Error('INSUFFICIENT_SOL'));
            }
            return Promise.all([
                window.splToken.getAssociatedTokenAddress(tokenMint, userPublicKey),
                window.splToken.getAssociatedTokenAddress(tokenMint, treasuryPublicKey)
            ]);
        }).then(function (accounts) {
            if (!accounts) return;
            var userTokenAccount = accounts[0];
            var treasuryTokenAccount = accounts[1];
            return connection.getAccountInfo(treasuryTokenAccount).then(function (treasuryAccountInfo) {
                var transferAmount = BigInt(Math.floor(total * Math.pow(10, getTokenDecimals())));
                var tx = new Transaction();
                var createAssociatedTokenAccountInstruction = window.splToken.createAssociatedTokenAccountInstruction || window.splToken.createAssociatedTokenAccountIdempotentInstruction;
                if (!treasuryAccountInfo) {
                    if (!createAssociatedTokenAccountInstruction) {
                        showMessage({ title: 'Setup error', message: 'Could not prepare treasury token account.', isError: true });
                        return Promise.reject(new Error('NO_ATA_HELPER'));
                    }
                    tx.add(createAssociatedTokenAccountInstruction(userPublicKey, treasuryTokenAccount, treasuryPublicKey, tokenMint));
                }
                tx.add(window.splToken.createTransferInstruction(userTokenAccount, treasuryTokenAccount, userPublicKey, transferAmount));
                if (window.CasinoFees) {
                    window.CasinoFees.addPurchaseSolFeeTransfers(tx, SystemProgram, PublicKey, userPublicKey);
                }
                return connection.getLatestBlockhash().then(function (r) {
                    tx.recentBlockhash = r.blockhash;
                    tx.feePayer = userPublicKey;
                    if (window.CasinoFees && window.CasinoFees.showPurchaseProcessing) {
                        window.CasinoFees.showPurchaseProcessing(
                            'Confirm the purchase in your wallet.',
                            'Waiting for wallet'
                        );
                    }
                    return window.solana.signTransaction(tx);
                });
            });
        }).then(function (signed) {
            if (!signed) return;
            if (window.CasinoFees && window.CasinoFees.showPurchaseProcessing) {
                window.CasinoFees.showPurchaseProcessing(
                    'Confirming your purchase on-chain. This may take a minute.',
                    'Processing purchase'
                );
            }
            return connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
        }).then(function (sig) {
            return connection.confirmTransaction(sig, 'confirmed').then(function () { return sig; }).catch(function (confirmError) {
                console.warn('Client confirmation timed out; server will verify on-chain:', confirmError);
                return sig;
            });
        }).then(function (sig) {
            costPerChip = cost;
            updateChipUI();
            updateRouletteButtonStates();
            return fetch('/api/save-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: wallet,
                    chipsPurchased: num,
                    costPerChip: cost,
                    purchaseSignature: sig,
                    gameType: 'roulette',
                    tokenUsed: isBuxToken() ? 'bux' : 'bux'
                })
            }).then(function (res) {
                if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Save failed'); });
                return res.json().then(function (saveData) { return { saveData: saveData, sig: sig }; });
            });
        }).then(function (result) {
            if (!result) return;
            if (result.saveData && typeof result.saveData.chipsBalance === 'number') {
                chipBalance = result.saveData.chipsBalance;
            }
            updateBalance();
            updatePopups();
            updateRouletteButtonStates();
            var costPromise = window.CasinoFees && window.CasinoFees.formatBuxWithUsd
                ? window.CasinoFees.formatBuxWithUsd(total, { label: getTokenLabel() })
                : Promise.resolve(total + ' ' + getTokenLabel());
            return costPromise.then(function (costLabel) {
                showMessage({
                    title: 'Purchase complete',
                    message: 'Successfully bought ' + num + ' chips for ' + costLabel + (getPurchaseFeeSol() > 0 ? ' + ' + getPurchaseFeeSol() + ' SOL fee' : '') + '.',
                    txSignature: result.sig
                });
            });
        }).catch(function (err) {
            if (err && (err.message === 'INSUFFICIENT_SOL' || err.message === 'INSUFFICIENT_BUX' || err.message === 'NO_ATA_HELPER')) return;
            if (String(err.message || '').match(/reject|authorized|cancelled/i)) return;
            showMessage({ title: 'Purchase failed', message: 'Failed to purchase: ' + (err.message || err), isError: true });
        }).finally(function () {
            if (window.CasinoFees && window.CasinoFees.hidePurchaseProcessing) {
                window.CasinoFees.hidePurchaseProcessing();
            }
        });
    }

    function withdrawWinnings() {
        if (!wallet) { showMessage({ title: 'Wallet required', message: 'Please connect your wallet.', isError: true }); return; }
        if (!connection) initConnection();
        if (!connection) { showMessage({ title: 'Connection error', message: 'Could not connect to Solana RPC.', isError: true }); return; }
        if (!window.splToken) { showMessage({ title: 'Loading', message: 'Token library still loading. Try again in a moment.', isError: true }); return; }
        var label = getTokenLabel();
        var totalToCollectAmount = 0;
        var collectProcessing = false;
        isCollecting = true;
        updateRouletteButtonStates();
        if (window.CasinoFees && window.CasinoFees.showCasinoProcessing) {
            window.CasinoFees.showCasinoProcessing('Preparing your collect…', 'Processing collect');
            collectProcessing = true;
        }
        fetch('/api/load-player?walletAddress=' + encodeURIComponent(wallet) + '&gameType=roulette&tokenUsed=' + (isBuxToken() ? 'bux' : 'bux'))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (player) {
                var currentUnclaimed = (player && player.unclaimedRewards) ? player.unclaimedRewards : unclaimedRewards;
                var chipValueToken = chipBalance * costPerChip;
                var totalToCollect = currentUnclaimed + chipValueToken;
                if (totalToCollect <= 0) {
                    isCollecting = false;
                    updateRouletteButtonStates();
                    showMessage({ title: 'Nothing to collect', message: 'No chips or unclaimed winnings to collect.', isError: true });
                    return Promise.reject(new Error('NOTHING_TO_COLLECT'));
                }
                totalToCollectAmount = totalToCollect;
                return fetch('/api/collect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userWallet: wallet, amount: totalToCollectAmount, gameType: 'roulette', token: isBuxToken() ? 'bux' : 'bux' })
                });
            })
            .then(function (res) {
                if (!res.ok) {
                    return res.text().then(function (text) {
                        var d = {};
                        try { d = JSON.parse(text); } catch (_) {}
                        var msg = (d && (d.error || d.message)) || 'Collect failed';
                        if (d && d.message && d.error !== d.message) msg = d.error + ': ' + d.message;
                        throw new Error(msg);
                    });
                }
                return res.json();
            })
            .then(function (data) {
                if (window.CasinoFees && window.CasinoFees.showCasinoProcessing) {
                    window.CasinoFees.showCasinoProcessing(
                        'Confirming your collect on-chain. This may take a minute.',
                        'Processing collect'
                    );
                }
                var txBytes = Uint8Array.from(atob(data.transaction), function (c) { return c.charCodeAt(0); });
                var Transaction = (window.solanaWeb3 || solanaWeb3).Transaction;
                var tx = Transaction.from(txBytes);
                return connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 })
                    .then(function (sig) {
                        var confirmClient = window.CasinoFees && window.CasinoFees.confirmTransactionBestEffort
                            ? window.CasinoFees.confirmTransactionBestEffort(connection, sig)
                            : connection.confirmTransaction(sig, 'confirmed').catch(function (confirmError) {
                                console.warn('Client confirmation timed out; server will verify on-chain:', confirmError);
                            });
                        return confirmClient.then(function () { return sig; });
                    })
                    .then(function (sig) {
                        if (window.CasinoFees && window.CasinoFees.confirmCollectWithServer) {
                            return window.CasinoFees.confirmCollectWithServer({
                                wallet: wallet,
                                signature: sig,
                                amount: data.actualAmount || totalToCollectAmount,
                                gameType: 'roulette',
                                token: isBuxToken() ? 'bux' : 'bux',
                            }).then(function () { return sig; });
                        }
                        return fetch('/api/confirm-collect', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userWallet: wallet, signature: sig, amount: data.actualAmount || totalToCollectAmount, gameType: 'roulette', token: isBuxToken() ? 'bux' : 'bux' })
                        }).then(function (cr) {
                            if (!cr.ok) {
                                return cr.json().then(function (d) {
                                    var msg = (d && (d.error || d.message)) || 'Confirm failed';
                                    throw new Error(msg);
                                });
                            }
                            return sig;
                        });
                    });
            })
            .then(function (sig) {
                chipBalance = 0;
                unclaimedRewards = 0;
                updateChipUI();
                updatePopups();
                updateStakedUI();
                renderChipStacks();
                updateBalance();
                loadPlayerData();
                updateRouletteButtonStates();
                var collectedPromise = window.CasinoFees && window.CasinoFees.formatBuxWithUsd
                    ? window.CasinoFees.formatBuxWithUsd(totalToCollectAmount, { label: label })
                    : Promise.resolve(totalToCollectAmount.toFixed(2) + ' ' + label);
                return collectedPromise.then(function (collectedLabel) {
                    showMessage({
                        title: 'Collect complete',
                        message: 'Successfully collected ' + collectedLabel + '!',
                        txSignature: sig
                    });
                });
            })
            .catch(function (err) {
                if (err && err.message === 'NOTHING_TO_COLLECT') return;
                if (String(err.message || '').match(/reject|authorized|cancelled/i)) return;
                showMessage({ title: 'Collect failed', message: 'Failed to collect: ' + (err.message || err), isError: true });
            })
            .finally(function () {
                if (collectProcessing && window.CasinoFees && window.CasinoFees.hideCasinoProcessing) {
                    window.CasinoFees.hideCasinoProcessing();
                }
                isCollecting = false;
                updateRouletteButtonStates();
            });
    }

    function init() {
        setupMessageModal();
        setCostPerChipLabel();
        showThree(0);
        updateChipUI();
        updateToCollectUI();
        updateStakedUI();
        updateUndoButton();
        updateReplaceButton();
        renderChipStacks();
        updatePopups();
        bindChipSelector();
        bindTableClicks();
        bindSpinButton();
        bindUndoButton();
        bindReplaceButton();
        var buyBtn = document.getElementById('roulette-buy-chips');
        var collectBtn = document.getElementById('roulette-collect');
        if (buyBtn) buyBtn.addEventListener('click', purchaseSpins);
        if (collectBtn) collectBtn.addEventListener('click', withdrawWinnings);
        var initWallet = function () {
            setupWalletConnection();
            updateRouletteButtonStates();
        };
        if (window.splToken) initWallet();
        else { window.addEventListener('splTokenLoaded', initWallet); setTimeout(initWallet, 2000); }
        window.addEventListener('resize', renderChipStacks);
        window.addEventListener('message', function (e) {
            if (!e.data || !e.data.type) return;
            if (e.data.type === 'CONNECT_WALLET') {
                var btn = document.getElementById('connect-wallet');
                if (btn) btn.click();
            }
            if (e.data.type === 'WALLET_ADDRESS' && e.data.address) {
                var connectContainer = document.getElementById('connect-wallet');
                var walletInfo = document.getElementById('wallet-info');
                var walletAddress = document.getElementById('wallet-address');
                applyWalletConnected(e.data.address, connectContainer, walletInfo, walletAddress);
            }
            if (e.data.type === 'DISCONNECT_WALLET') {
                if (window.solana && window.solana.disconnect) window.solana.disconnect().catch(function () {});
                var connectContainer = document.getElementById('connect-wallet');
                var walletInfo = document.getElementById('wallet-info');
                var walletAddress = document.getElementById('wallet-address');
                applyWalletConnected(null, connectContainer, walletInfo, walletAddress);
            }
            if (e.data.type === 'TOKEN_CHANGED') {
                window.__ROULETTE_TOKEN__ = (e.data.token === 'bux') ? 'bux' : 'bux';
                tokenBalance = 0;
                chipBalance = 0;
                unclaimedRewards = 0;
                updateChipUI();
                updateToCollectUI();
                updateRouletteButtonStates();
                if (wallet) {
                    updateBalance().then(function () { return loadPlayerData(); }).then(updateRouletteButtonStates);
                }
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
