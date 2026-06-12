/**
 * BUXDAO site content — edit this file to change copy, links, and display data.
 * Functionality (APIs, wallet, checkout) not wired yet.
 */

export const site = {
  name: "BUXDAO",
  tagline: "Web3 Studio & NFT Ecosystem",
  logoWordmark: "/brand/buxdao-logo-wordmark.png",
  description:
    "BUXDAO is a web3 studio and NFT ecosystem — focused on passive earning, gaming, and white-label solutions.",
  url: "https://buxdao.com",
  social: {
    discord: "https://discord.com/invite/2dXNjyr593",
    x: "https://x.com/buxdao",
  },
  footer: {
    copyright: "© 2026 BUXDAO",
    tagline: "BUXDAO — Web3 Studio & NFT Ecosystem",
  },
} as const;

export const tokenConfig = {
  mint: "AaKrMsZkuAdJL6TKZbj7X1VaH5qWioL7oDHagQZa1w59",
  communityWallet: "3WNHW6sr1sQdbRjovhPrxgEJdWASZ43egGWMMNrhgoRR",
  /** Added to on-chain community wallet balance for cashout pool display */
  liquidityOffsetSol: 33.25,
  exemptWallets: [
    "FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75",
    "7rJDJYRbG4pU9QyCaYMJjrjLs6E9C46NpCDguQGhWNMR",
  ],
} as const;

export type NavItem = {
  href: string;
  label: string;
  description: string;
};

export const navItems: NavItem[] = [
  { href: "/", label: "Home", description: "Ecosystem overview" },
  { href: "/collections", label: "Collections", description: "5 NFT families" },
  { href: "/staking", label: "Staking", description: "Stake on GraveStake" },
  { href: "/games", label: "Games", description: "Casino & card games" },
  { href: "/merch", label: "Merch", description: "Printful store" },
  { href: "/hub", label: "Holder Hub", description: "Profile & cashout" },
  { href: "/bux", label: "$BUX", description: "Token & leaderboard" },
];

export const heroGifs = [
  { id: "catz", src: "/gifs/catz.gif", alt: "Fcked Catz" },
  { id: "mm", src: "/gifs/mm.gif", alt: "Money Monsters" },
  { id: "bitbot", src: "/gifs/bitbot.gif", alt: "A.I. BitBots" },
  { id: "mm3d", src: "/gifs/mm3d.gif", alt: "Money Monsters 3D" },
  { id: "celebs", src: "/gifs/celebs.gif", alt: "Celebrity Catz" },
] as const;

export const hero = {
  title: "We become what we think about most of the time...",
  subtitle:
    "BUXDAO is a web3 studio and NFT ecosystem — focused on passive earning, gaming, and white-label solutions.",
  carouselIntervalMs: 9000,
} as const;

export const whiteLabel = {
  title: "White-label Web3 builds",
  body: "We design and ship Solana-native community sites, games, and on-chain utilities for other projects — holder portals, customised token integrated casino games, discord bots and more.",
  cta: "Discuss a build on Discord",
} as const;

export type CollectionConfig = {
  id: string;
  name: string;
  symbol: string;
  magicEdenSymbol: string;
  /** On-chain collection address for Helius DAS supply counts */
  collectionMint: string;
  logo: string;
  accent: string;
  gif: string;
  graveMarketUrl: string;
  graveStakeUrl: string;
  stakeLive: boolean;
  /** Daily $BUX staking yield per NFT */
  dailyBuxYield: number;
};

/** @deprecated Use CollectionConfig or CollectionWithStats from @/lib/collections */
export type Collection = CollectionConfig;

export const collectionConfigs: CollectionConfig[] = [
  {
    id: "fcked-catz",
    name: "Fcked Catz",
    symbol: "FCKEDCATZ",
    magicEdenSymbol: "fcked_catz",
    collectionMint: "FCKEDcaTZZxf6c3tF3JYb7PhBZzXhQwEBDuSP6GSi9Q",
    logo: "/collections/cat.PNG",
    accent: "#FFF44D",
    gif: "/gifs/catz.gif",
    graveMarketUrl: "https://gravemarket.io/collection/fcked-catz",
    graveStakeUrl: "https://gravestake.io/p/fcked-catz",
    stakeLive: false,
    dailyBuxYield: 10,
  },
  {
    id: "money-monsters",
    name: "Money Monsters",
    symbol: "MM",
    magicEdenSymbol: "money_monsters",
    collectionMint: "MMNFTxVtpK2u7PRqRLBf1GDgKYKQg5PpJV1F2ppKxfd",
    logo: "/collections/monster.PNG",
    accent: "#4DFFFF",
    gif: "/gifs/mm.gif",
    graveMarketUrl: "https://gravemarket.io/collection/money-monsters",
    graveStakeUrl: "https://gravestake.io/p/money-monsters",
    stakeLive: false,
    dailyBuxYield: 5,
  },
  {
    id: "ai-bitbots",
    name: "A.I. BitBots",
    symbol: "AIBB",
    magicEdenSymbol: "ai_bitbots",
    collectionMint: "AiBiTboTxPRL9knyTKZBEJsNAoXvxjpZwYYpZHzYB5Y",
    logo: "/collections/bot.PNG",
    accent: "#FF4D4D",
    gif: "/gifs/bitbot.gif",
    graveMarketUrl: "https://gravemarket.io/collection/ai-bitbots",
    graveStakeUrl: "https://gravestake.io/p/ai-bitbots",
    stakeLive: false,
    dailyBuxYield: 5,
  },
  {
    id: "money-monsters-3d",
    name: "Money Monsters 3D",
    symbol: "MM3D",
    magicEdenSymbol: "moneymonsters3d",
    collectionMint: "MM3DxqWxszLFGQBwjKCQAAGbQHPRJN3UydswgGrWiPZ",
    logo: "/collections/monster.PNG",
    accent: "#4DFF4D",
    gif: "/gifs/mm3d.gif",
    graveMarketUrl: "https://gravemarket.io/collection/money-monsters-3d",
    graveStakeUrl: "https://gravestake.io/p/money-monsters-3d",
    stakeLive: false,
    dailyBuxYield: 10,
  },
  {
    id: "celebrity-catz",
    name: "Celebrity Catz",
    symbol: "CELEBCATZ",
    magicEdenSymbol: "celebcatz",
    collectionMint: "CCATZxVtpK2u7PRqRLBf1GDgKYKQg5PpJV1F2ppKxfd",
    logo: "/collections/celeb.PNG",
    accent: "#FF4DFF",
    gif: "/gifs/celebs.gif",
    graveMarketUrl: "https://gravemarket.io/collection/celebrity-catz",
    graveStakeUrl: "https://gravestake.io/p/celebrity-catz",
    stakeLive: true,
    dailyBuxYield: 20,
  },
];

/** Static collection list for pages that don't need live stats */
export const collections = collectionConfigs;

export type LiveProduct = {
  id: string;
  name: string;
  status: "live" | "soon";
  href: string;
  external?: boolean;
  thumbnail?: string;
};

export const liveProducts: LiveProduct[] = [
  {
    id: "slotto",
    name: "Slotto.gg",
    status: "live",
    href: "https://slotto.gg",
    external: true,
    thumbnail: "/products/slotto.png",
  },
  {
    id: "casino",
    name: "BUX Casino",
    status: "live",
    href: "/games",
    // thumbnail: "/products/casino.png" — add tomorrow
  },
  {
    id: "spades",
    name: "BUX Spades",
    status: "live",
    href: "https://www.bux-spades.pro",
    external: true,
    thumbnail: "/products/spades.png",
  },
  {
    id: "poker",
    name: "BUX Poker",
    status: "soon",
    href: "https://www.bux-poker.pro",
    external: true,
    thumbnail: "/products/poker.png",
  },
];

export const stakingContent = {
  title: "Stake your NFTs",
  subtitle:
    "Stake any of our collections on GraveStake.io to earn $BUX tokens. Each collection has its own pool.",
  lockIntro: "Lock for longer periods to receive additional staking yield.",
  lockBonuses: [
    { days: 182, multiplier: "1.5x bonus" },
    { days: 364, multiplier: "2x bonus" },
  ],
  note: "Verify holder roles in our Discord server. Staking is provided by GraveStake — a Solana Deads ecosystem product.",
};

export type Game = {
  id: string;
  name: string;
  status: "live" | "soon";
  description: string;
  tokens: string[];
  href: string;
  external?: boolean;
  category: "casino" | "cards";
};

export const games: Game[] = [
  {
    id: "slots",
    name: "BUX Slots",
    status: "live",
    description: "3-reel slots with collection-themed symbols.",
    tokens: ["$BUX"],
    href: "/games/slots",
    category: "casino",
  },
  {
    id: "roulette",
    name: "Roulette",
    status: "live",
    description: "American wheel — stack chips and spin.",
    tokens: ["$BUX"],
    href: "/games/roulette",
    category: "casino",
  },
  {
    id: "coinflip",
    name: "Coin Flip",
    status: "live",
    description: "Heads or tails — 1.9× payout.",
    tokens: ["$BUX"],
    href: "/games/coinflip",
    category: "casino",
  },
  {
    id: "blackjack",
    name: "Blackjack",
    status: "soon",
    description: "Classic 21 — hit, stand, and beat the dealer.",
    tokens: ["$BUX"],
    href: "/games/blackjack",
    category: "casino",
  },
  {
    id: "spades",
    name: "BUX Spades",
    status: "live",
    description: "Community spades tables on a dedicated platform.",
    tokens: ["SOL"],
    href: "https://www.bux-spades.pro",
    external: true,
    category: "cards",
  },
  {
    id: "poker",
    name: "BUX Poker",
    status: "soon",
    description: "Texas hold'em — launching soon.",
    tokens: ["SOL"],
    href: "https://www.bux-poker.pro",
    external: true,
    category: "cards",
  },
];

export type MerchProduct = {
  id: string;
  name: string;
  category: "bux" | "catz" | "bitbots" | "monsters";
  type: string;
  image: string;
  price: string;
};

export const merchProducts: MerchProduct[] = [
  { id: "bux-tee", name: "BUXDAO Tee", category: "bux", type: "T-Shirt", image: "/merch/bux/tees/black.jpg", price: "— SOL" },
  { id: "bux-hoodie", name: "BUXDAO Hoodie", category: "bux", type: "Hoodie", image: "/merch/bux/hoodies/black.jpg", price: "— SOL" },
  { id: "bux-hat", name: "BUXDAO Dad Hat", category: "bux", type: "Hat", image: "/merch/bux/dad hat/black.jpg", price: "— SOL" },
  { id: "catz-tee", name: "Fcked Catz Tee", category: "catz", type: "T-Shirt", image: "/merch/catz/tees/black-front.jpg", price: "— SOL" },
  { id: "catz-hoodie", name: "Fcked Catz Hoodie", category: "catz", type: "Hoodie", image: "/merch/catz/hoodies/black-front.jpg", price: "— SOL" },
  { id: "bitbots-tee", name: "BitBots Tee", category: "bitbots", type: "T-Shirt", image: "/merch/bitbots/tees/black-front.jpg", price: "— SOL" },
  { id: "bitbots-hoodie", name: "BitBots Hoodie", category: "bitbots", type: "Hoodie", image: "/merch/bitbots/hoodies/black-front.jpg", price: "— SOL" },
  { id: "monsters-tee", name: "Money Monsters Tee", category: "monsters", type: "T-Shirt", image: "/merch/monsters/tees/black-front.jpg", price: "— SOL" },
  { id: "monsters-hoodie", name: "Money Monsters Hoodie", category: "monsters", type: "Hoodie", image: "/merch/monsters/hoodies/black-front.jpg", price: "— SOL" },
];

export const merchContent = {
  title: "Merch Store",
  subtitle: "Official BUXDAO apparel — Printful fulfillment with SOL checkout.",
  note: "Connect Solflare, pick your size and color, then pay in SOL at checkout. Orders ship via Printful.",
};

export const hubContent = {
  title: "Holder Hub",
  subtitle: "Connect Discord, X, and your wallets to view holdings, roles, and $BUX cashout value.",
  verifyBanner:
    "Verify in Discord to receive holder roles — use the verify button in our server after connecting your wallet.",
  steps: [
    { step: 1, title: "Connect Discord", body: "Link your Discord account to your BUXDAO profile." },
    { step: 2, title: "Connect X", body: "Optionally link your X (Twitter) account." },
    { step: 3, title: "Connect wallet(s)", body: "Add one or more Solana wallets to view NFT holdings." },
    { step: 4, title: "Verify in Discord", body: "Use the GraveKeeper verify embed in our Discord server for holder roles." },
  ],
  note: "Functionality coming soon — UI mockup only.",
};

export const buxPage = {
  headline: "$BUX — tokenomics kept simple",
  principles: [
    "Our token is not tradable on coin exchanges — earn $BUX through staking and ecosystem participation.",
    "Value is tied to our community liquidity pool, not external pump-and-dump traders.",
    "$BUX can be cashed out for SOL from our private liquidity pool (cashout launching soon).",
    "The BUX team works voluntarily so revenue can be added to the liquidity pool.",
  ],
  revenueSources: [
    {
      title: "NFT Sales Royalties",
      description: "8% of all 5 main collection NFT sales (providing royalties are paid).",
    },
    {
      title: "Slotto.gg",
      description: "2% of all monthly lottery ticket sales.",
    },
    {
      title: "Services",
      description: "Profits from dev and artwork produced for other projects.",
    },
  ],
  leaderboardNote: "Listed NFTs are not included in holder counts.",
  leaderboardFilters: [
    { value: "bux,nfts", label: "BUX + NFTs" },
    { value: "bux", label: "BUX Only" },
    { value: "nfts", label: "NFTs Only" },
  ],
  collectionFilterOptions: collectionConfigs.map((c) => ({ value: c.id, label: c.name })),
  /** Mock rows until API wired */
  mockLeaderboard: [
    { rank: 1, discord: "holder_one", nfts: "12", bux: "4,200", value: "— SOL" },
    { rank: 2, discord: "holder_two", nfts: "8", bux: "3,100", value: "— SOL" },
    { rank: 3, discord: "holder_three", nfts: "5", bux: "1,850", value: "— SOL" },
    { rank: 4, discord: "holder_four", nfts: "3", bux: "920", value: "— SOL" },
    { rank: 5, discord: "holder_five", nfts: "2", bux: "640", value: "— SOL" },
  ],
  mockMetrics: {
    totalSupply: "—",
    publicSupply: "—",
    exemptSupply: "—",
    liquidityPool: "—",
    tokenValueSol: "—",
    tokenValueUsd: "—",
  },
};
