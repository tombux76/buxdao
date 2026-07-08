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
  name: "$BUX",
  mint: "AaKrMsZkuAdJL6TKZbj7X1VaH5qWioL7oDHagQZa1w59",
  /** SOL liquidity wallet — royalties, project funds, cashout pool */
  communityWallet: "DvDj1YAg4aM2xxXhLtXE9kheuUDhLRuaR6TWcUVEBN66",
  exemptWallets: [
    /** BUX treasury */
    "FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75",
    /** Magic Eden V2 authority / escrow — not a community holder */
    "1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix",
  ],
} as const;

/** Per-page titles + descriptions for social/link previews (see src/lib/seo.ts). */
export const pageMeta = {
  home: {
    title: "Home",
    description:
      "BUXDAO is a web3 studio and NFT ecosystem — focused on passive earning, gaming, and white-label Solana builds.",
  },
  collections: {
    title: "Collections",
    description:
      "Explore the five BUXDAO NFT collections — Fcked Catz, Money Monsters, A.I. BitBots, Money Monsters 3D, and Celebrity Catz.",
  },
  staking: {
    title: "Staking",
    description: "Stake your BUXDAO NFTs on GraveStake to earn $BUX every day.",
  },
  games: {
    title: "Games",
    description: "Play BUX Casino and card games — wager and win $BUX across the BUXDAO ecosystem.",
  },
  merch: {
    title: "Merch",
    description: "Shop official BUXDAO merch — printed and shipped worldwide via Printful.",
  },
  hub: {
    title: "Holder Hub",
    description:
      "Connect Discord, link wallets, view your holdings, claim rewards, and cash out $BUX to SOL in the BUXDAO Holder Hub.",
  },
  bux: {
    title: "$BUX",
    description:
      "$BUX is backed by the BUXDAO liquidity wallet. Track live token value, supply, revenue sources, and the holder leaderboard.",
  },
  empireDraw: {
    title: "Empire prize draw",
    description:
      "Win 50,000 EMPIRE every week. BUXDAO shares its Omerta – Empire City founders bond yield with verified holders in a weekly prize draw.",
  },
  rewards: {
    title: "Daily rewards",
    description: "Earn daily $BUX rewards for holding BUXDAO NFTs.",
  },
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
  { href: "/empire-draw", label: "Prize draw", description: "Weekly EMPIRE prize" },
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
  /** GraveStake pool wallet — staked NFTs attributed to depositors; $BUX here is exempt supply */
  stakingWallet?: string;
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
    collectionMint: "EPeeeDr21EPJ4GJgjuRJ8SHD4A2d59erMaTtWaTT2hqm",
    logo: "/collections/cat.PNG",
    accent: "#FFF44D",
    gif: "/gifs/catz.gif",
    graveMarketUrl: "https://gravemarket.io/collection/fcked-catz",
    graveStakeUrl: "https://gravestake.io/p/fcked-catz",
    stakeLive: true,
    stakingWallet: "9ykXGCGJF8LL3MRMmhrhDtXKfKXpaY1NcJeJQWAPCpfz",
    dailyBuxYield: 10,
  },
  {
    id: "money-monsters",
    name: "Money Monsters",
    symbol: "MM",
    magicEdenSymbol: "money_monsters",
    collectionMint: "3EyhWtevHSkXg4cGsCurLLJ1NEc3rR3fWrYBx5CVLn7R",
    logo: "/collections/monster.PNG",
    accent: "#4DFFFF",
    gif: "/gifs/mm.gif",
    graveMarketUrl: "https://gravemarket.io/collection/money-monsters",
    graveStakeUrl: "https://gravestake.io/p/money-monsters",
    stakeLive: true,
    stakingWallet: "AbRPmEHSAubSktYYeuqdXXsnbww1VrzZogkhQgw5iDa7",
    dailyBuxYield: 5,
  },
  {
    id: "ai-bitbots",
    name: "A.I. BitBots",
    symbol: "AIBB",
    magicEdenSymbol: "ai_bitbots",
    collectionMint: "41swUeWc8Hm87T7ahtndUWfDTLRWndWYFpuE4UKp79Vq",
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
    collectionMint: "HLD74kSbBLf4aYnGkZ4dYSoh9cZvS4exAB9t7pPDDPvE",
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
    collectionMint: "H6c8gJqMk2ktfKriGGLB14RKPAz2otz1iPv2AAegetXD",
    logo: "/collections/celeb.PNG",
    accent: "#FF4DFF",
    gif: "/gifs/celebs.gif",
    graveMarketUrl: "https://gravemarket.io/collection/celebrity-catz",
    graveStakeUrl: "https://gravestake.io/p/celebrity-catz",
    stakeLive: true,
    stakingWallet: "7rJDJYRbG4pU9QyCaYMJjrjLs6E9C46NpCDguQGhWNMR",
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
    thumbnail: "/products/casino.png",
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
  thumbnail?: string;
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
    thumbnail: "/casino/images/slots.png",
  },
  {
    id: "roulette",
    name: "Roulette",
    status: "live",
    description: "American wheel — stack chips and spin.",
    tokens: ["$BUX"],
    href: "/games/roulette",
    category: "casino",
    thumbnail: "/casino/images/roulette.png",
  },
  {
    id: "coinflip",
    name: "Coin Flip",
    status: "live",
    description: "Heads or tails — 1.9× payout.",
    tokens: ["$BUX"],
    href: "/games/coinflip",
    category: "casino",
    thumbnail: "/casino/images/coinflip.png",
  },
  {
    id: "blackjack",
    name: "Blackjack",
    status: "soon",
    description: "Classic 21 — hit, stand, and beat the dealer.",
    tokens: ["$BUX"],
    href: "/games/blackjack",
    category: "casino",
    thumbnail: "/casino/images/blackjack.png",
  },
  {
    id: "spades",
    name: "BUX Spades",
    status: "live",
    description:
      "Fully customisable game play options\nSolo or partners\nPlay with friends or against bots",
    tokens: [],
    href: "https://www.bux-spades.pro",
    external: true,
    category: "cards",
    thumbnail: "/products/spades.png",
  },
  {
    id: "poker",
    name: "BUX Poker",
    status: "soon",
    description:
      "Cross community poker platform\nTournament and league options\nDiscord integration",
    tokens: [],
    href: "https://www.bux-poker.pro",
    external: true,
    category: "cards",
    thumbnail: "/products/poker.png",
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
  subtitle: "Connect Discord, link wallets, and manage $BUX — view holdings, claim rewards, and cash out to SOL.",
  verifyBanner:
    "Verify in Discord to receive holder roles — use the verify button in our server after connecting your wallet.",
  steps: [
    { step: 1, title: "Connect Discord", body: "Link your Discord account to your BUXDAO profile." },
    { step: 2, title: "Connect X", body: "Optionally link your X (Twitter) account." },
    { step: 3, title: "Connect wallet(s)", body: "Add one or more Solana wallets to view NFT holdings." },
    { step: 4, title: "Verify in Discord", body: "Use the GraveKeeper verify embed in our Discord server for holder roles." },
  ],
  note: "Log in with Discord to unlock your profile, holdings, and cashout.",
};

export const prizeDrawContent = {
  title: "EMPIRE prize draw",
  subtitle:
    "Weekly community giveaway funded by Omerta Empire City founders bond yield — one random verified BUXDAO holder wins 50,000 EMPIRE.",
  intro:
    "The EMPIRE prize draw is a weekly giveaway for the BUXDAO community. Each week we send 50,000 $EMPIRE to one randomly selected holder. BUXDAO holds an Omerta – Empire City founders bond, and the bond is staked to earn roughly 10,000 $EMPIRE per day. Under Omerta's rules that yield must be distributed back to the community, so we pool it and give it away here. Every verified BUXDAO holder is automatically entered — there's nothing to buy and no ticket to claim. To be eligible, simply log in with Discord, link a Solana wallet, and hold at least one NFT from any of the five BUXDAO collections (which also gives you your holder role in Discord). Each person gets a single entry regardless of how many NFTs they hold, winners are paid straight to their first linked wallet, and past winners stay in the pool every week.",
  prizeLabel: "Weekly prize",
  poolLabel: "Eligible holders",
  lastWinnerLabel: "Last winner",
  checklistTitle: "Am I eligible?",
  winnersTitle: "Past winners",
  empireIntro:
    "BUXDAO holds an Omerta Empire City founders bond. Staking yields ~10,000 EMPIRE per day; Omerta requires that yield be shared with the community.",
  empireBullets: [
    "One entry per verified Hub user — NFT count does not increase your odds.",
    "Payout goes to your first linked wallet (earliest linked_at).",
    "Repeat winners stay in the pool every week.",
    "Draws are run manually by admins (e.g. during community events).",
  ],
  steps: [
    { step: 1, title: "Connect Discord", body: "Log into the Holder Hub with your Discord account." },
    { step: 2, title: "Connect wallet", body: "Link at least one Solana wallet on your Hub profile." },
    {
      step: 3,
      title: "Verify holder",
      body: "Hold at least one NFT from a BUXDAO collection and verify in Discord for holder roles.",
    },
  ],
} as const;

/** Copy for Discord engagement rewards — keep in sync with `discord-engagement-config.ts`. */
export const discordEngagement = {
  modalTitle: "Engage to earn $BUX",
  intro:
    "Earn $BUX by participating in the BUXDAO Discord. Credits land in your Holder Hub claim balance — separate from GraveStake staking.",
  eligibility: {
    title: "Who qualifies",
    items: [
      "Log into the Holder Hub with Discord.",
      "Link at least one Solana wallet on your Hub profile.",
      "Use the same Discord account in our server.",
    ],
  },
  rewards: {
    title: "Rewards",
    items: [
      {
        label: "Messages",
        amount: "1 $BUX",
        detail: "Per qualifying message in eligible channels (min. 10 characters).",
      },
      {
        label: "Reactions",
        amount: "2 $BUX",
        detail: "Per reaction on a post in #announcements (once per announcement per user).",
      },
    ],
    limits: [
      "Up to 50 message rewards per day.",
      "5-minute cooldown between message rewards.",
      "Daily totals reset at midnight US Eastern.",
    ],
  },
  channels: {
    title: "Eligible channels",
    items: [
      {
        label: "Messages",
        detail: "Any public text channel in the BUXDAO Discord — chat, announcements, and forum channels.",
      },
      {
        label: "Reactions",
        detail: "#announcements only.",
      },
    ],
  },
  claim: {
    title: "Claim account & payout",
    items: [
      "One claim balance per Hub profile — not per wallet.",
      "Engagement credits sync automatically from Discord (usually within a few minutes).",
      "Open Holder Hub → Claim rewards to withdraw your unclaimed $BUX.",
      "Connect a wallet that is linked on your Hub profile, approve a small SOL platform fee, then sign to receive $BUX to that wallet.",
      "Admin bonus credits may also appear in the same balance.",
    ],
  },
  cta: "Open Holder Hub to claim",
} as const;

/** Holder Hub $BUX → SOL cashout — keep fee/limits in sync with `src/lib/cashout/config.ts`. */
export const cashoutContent = {
  title: "Cash out $BUX",
  intro:
    "Exchange $BUX for SOL at the live token rate from our liquidity pool. Fees stay in the pool to support the token.",
  howItWorks: {
    title: "How it works",
    steps: [
      "You send $BUX to the liquidity wallet (sign an SPL transfer in your wallet).",
      "Net SOL is paid automatically to your linked payout wallet.",
    ],
  },
  requirements: {
    title: "Gated to holders",
    items: [
      "Log into Holder Hub with Discord.",
      "Link the Solana wallet you want SOL paid to.",
      "Hold at least one NFT from any BUXDAO collection in a linked wallet (on-chain check).",
    ],
  },
  perks: {
    title: "Holder perks",
  },
  limits: {
    title: "Limits",
    items: [
      "One cashout every 14 days per Hub account (cooldown starts when SOL is paid out).",
      "Up to 1.5 SOL net per cashout.",
      "Whale role required for net payouts above 0.5 SOL.",
    ],
  },
  ctaLoggedOut: "Log in with Discord to check your fee tier, limits, and cash out.",
  ctaNeedWallet: "Connect and link a wallet to cash out.",
} as const;

export const buxPage = {
  headline: "$BUX — backed by our liquidity wallet",
  liquidityLabel: "Liquidity wallet balance",
  principles: [
    "Our token is not tradable on coin exchanges — earn $BUX through GraveStake, Discord engagement, and ecosystem participation.",
    "Value is tied to SOL in our liquidity wallet divided by public $BUX supply (including unclaimed rewards).",
    "Cashout fees flow straight back into the wallet so the pool stays sustainable.",
  ],
  supplyBreakdownNote:
    "Exempt supply is $BUX held in the BUX treasury and the five collection staking pool wallets. Unclaimed rewards count toward public supply for token value.",
  revenueSources: [
    {
      title: "Collection royalties",
      description: "8% on secondary sales across all 5 main collections — paid to the liquidity wallet.",
    },
    {
      title: "BUX Casino",
      description: "0.002 SOL from every casino transaction.",
    },
    {
      title: "Slotto.gg",
      description: "2% of all Solana ticket sales on Slotto.gg.",
    },
    {
      title: "Partner sites",
      description: "0.0005 SOL from transactions on other sites we built.",
    },
  ],
  revenueHighlight: {
    title: "Celeb Catz mint (soon)",
    description: "50 new celebs to mint — proceeds added to the wallet (~25 SOL expected).",
  },
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
