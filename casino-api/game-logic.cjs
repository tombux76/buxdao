// Server-authoritative casino game logic (must match client rules).
const crypto = require("crypto");

const DB_DECIMALS = 6;
const MAX_COST_PER_SPIN = 1500;
const MAX_SPINS_PER_PURCHASE = 500;
const MAX_FLIPS_PER_PURCHASE = 500;
const MAX_CHIPS_PER_PURCHASE = 5000;
const COINFLIP_WIN_MULTIPLIER = 1.9;

const SLOTS_SYMBOL_COUNTS = [8, 7, 6, 5, 4, 3, 2, 1]; // weighted reel distribution (36 total)

const SLOTS_PAYOUT_MULTIPLIERS = {
  0: 13,
  1: 16,
  2: 21,
  3: 35,
  4: 70,
  5: 165,
  6: 550,
  7: 3300,
};

function pickWeightedSlotSymbol() {
  let r = crypto.randomInt(0, 36);
  for (let i = 0; i < SLOTS_SYMBOL_COUNTS.length; i++) {
    if (r < SLOTS_SYMBOL_COUNTS[i]) return i;
    r -= SLOTS_SYMBOL_COUNTS[i];
  }
  return 0;
}

function generateSlotsSpin() {
  return [pickWeightedSlotSymbol(), pickWeightedSlotSymbol(), pickWeightedSlotSymbol()];
}

const ROULETTE_WHEEL_ORDER = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, "00",
  27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];
const ROULETTE_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const ROULETTE_COL1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
const ROULETTE_COL2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const ROULETTE_COL3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

function toRaw6(amount) {
  return BigInt(Math.floor(Number(amount) * Math.pow(10, DB_DECIMALS)));
}

function fromRaw6(raw) {
  return Number(raw || 0) / Math.pow(10, DB_DECIMALS);
}

function calculateSlotsWin(resultSymbols, costPerSpin) {
  if (!Array.isArray(resultSymbols) || resultSymbols.length !== 3) return 0;
  const symbols = resultSymbols.map((s) => Number(s));
  if (symbols.some((s) => !Number.isInteger(s) || s < 0 || s > 7)) return 0;
  const cost = Math.min(Math.max(Math.floor(Number(costPerSpin) || 0), 1), MAX_COST_PER_SPIN);
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    const mult = SLOTS_PAYOUT_MULTIPLIERS[symbols[0]];
    return mult ? mult * cost : 0;
  }
  return 0;
}

function generateCoinflipResult() {
  return crypto.randomInt(0, 2) === 0 ? "heads" : "tails";
}

function calculateCoinflipWin(choice, result, costPerFlip) {
  const side = String(choice || "").toLowerCase();
  const flipResult = String(result || "").toLowerCase();
  if (side !== "heads" && side !== "tails") return 0;
  if (flipResult !== "heads" && flipResult !== "tails") return 0;
  const cost = Math.max(Math.floor(Number(costPerFlip) || 0), 1);
  return side === flipResult ? cost * COINFLIP_WIN_MULTIPLIER : 0;
}

function roulettePayoutMultiplier(key, result) {
  const num = result === "00" ? "00" : result === 0 ? 0 : Number(result);
  if (key === "0" || key === "00" || (key >= "1" && key <= "36")) {
    return String(key) === String(result) ? 35 : 0;
  }
  if (num !== 0 && num !== "00") {
    const n = Number(num);
    switch (key) {
      case "red":
        return ROULETTE_RED.includes(n) ? 1 : 0;
      case "black":
        return !ROULETTE_RED.includes(n) ? 1 : 0;
      case "even":
        return n % 2 === 0 ? 1 : 0;
      case "odd":
        return n % 2 === 1 ? 1 : 0;
      case "1-18":
        return n >= 1 && n <= 18 ? 1 : 0;
      case "19-36":
        return n >= 19 && n <= 36 ? 1 : 0;
      case "1-12":
        return n >= 1 && n <= 12 ? 2 : 0;
      case "13-24":
        return n >= 13 && n <= 24 ? 2 : 0;
      case "25-36":
        return n >= 25 && n <= 36 ? 2 : 0;
      case "col1":
        return ROULETTE_COL1.includes(n) ? 2 : 0;
      case "col2":
        return ROULETTE_COL2.includes(n) ? 2 : 0;
      case "col3":
        return ROULETTE_COL3.includes(n) ? 2 : 0;
      default:
        return 0;
    }
  }
  return 0;
}

function normalizeRouletteBets(bets) {
  if (!bets || typeof bets !== "object" || Array.isArray(bets)) return null;
  const out = {};
  for (const [key, val] of Object.entries(bets)) {
    const stake = Math.floor(Number(val));
    if (!Number.isFinite(stake) || stake <= 0) continue;
    out[String(key)] = stake;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sumRouletteStakes(bets) {
  return Object.values(bets).reduce((sum, n) => sum + n, 0);
}

function calculateRouletteWinnings(bets, result) {
  let profit = 0;
  for (const [key, stake] of Object.entries(bets)) {
    const mult = roulettePayoutMultiplier(key, result);
    if (mult > 0) profit += stake * mult;
  }
  return profit;
}

function generateRouletteResult() {
  return ROULETTE_WHEEL_ORDER[crypto.randomInt(0, ROULETTE_WHEEL_ORDER.length)];
}

function isCasinoPaused() {
  const v = (process.env.CASINO_PAUSED || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

module.exports = {
  DB_DECIMALS,
  MAX_COST_PER_SPIN,
  MAX_SPINS_PER_PURCHASE,
  MAX_FLIPS_PER_PURCHASE,
  MAX_CHIPS_PER_PURCHASE,
  toRaw6,
  fromRaw6,
  calculateSlotsWin,
  generateSlotsSpin,
  generateCoinflipResult,
  calculateCoinflipWin,
  normalizeRouletteBets,
  sumRouletteStakes,
  calculateRouletteWinnings,
  generateRouletteResult,
  isCasinoPaused,
};
