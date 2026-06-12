export const GAME_CONFIG = {
  slots: { title: "BUX Slots", built: true, iframeSrc: "/casino/slots.html" },
  roulette: { title: "Roulette", built: true, iframeSrc: "/casino/roulette.html" },
  coinflip: { title: "Coin Flip", built: true, iframeSrc: "/casino/coinflip.html" },
  blackjack: { title: "Blackjack", built: false },
} as const;

export type GameId = keyof typeof GAME_CONFIG;

export function isValidGameId(value: string): value is GameId {
  return value in GAME_CONFIG;
}
