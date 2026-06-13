# Legacy unclaimed $BUX — airdrop list

Snapshot exported from the **old BUXDAO Neon database** (`claim_accounts` + `user_wallets`) for one-time airdrops. Users can no longer claim on the old site.

**Machine-readable export:** [`legacy-unclaimed-airdrop-list.csv`](./legacy-unclaimed-airdrop-list.csv)

---

## Summary

| Metric | Value |
|--------|------:|
| Users with unclaimed balance | 63 |
| Total unclaimed | **2,474,385 BUX** |
| Ready to airdrop (wallet resolved) | 62 |
| Needs manual wallet | 1 |
| Multi-wallet users | 14 |

Amounts are **whole $BUX integers** (same units as the old claim UI), not 9-decimal on-chain lamports. Multiply by `10^9` when building SPL transfers.

`total_claimed` is included for reference only — it reflects what they already claimed on the old site before shutdown.

---

## Wallet resolution rules

Each row’s `destination_wallet` was chosen automatically:

1. **`primary`** — wallet flagged `is_primary` on the old site
2. **`only`** — user linked exactly one wallet
3. **`oldest`** — multiple wallets, none marked primary → earliest `connected_at`
4. **`missing`** — no linked wallet on file → **do not airdrop until resolved**

---

## Action required

| Discord | Discord ID | Unclaimed | Issue |
|---------|------------|----------:|-------|
| ridonnnn | `963388231636889630` | 4,905 | No wallet linked in old DB |

Reach out on Discord for a payout wallet, then add a row manually before running the script.

---

## Multi-wallet users (oldest-wallet fallback)

These 5 users had multiple wallets with **no primary** set. Payout wallet is the oldest link — verify if any look wrong:

| Discord | Unclaimed | Resolution | Destination wallet |
|---------|----------:|------------|-------------------|
| itsdowntime | 48,840 | oldest | `Cbo7JZEmVEbkcNzfoE7V3489MKwTehZ37KYJ4Me2cEDv` |
| wolly9787 | 17,416 | oldest | `9756X61QRrgDUSmfJedRyG316BoK56UME6g1n81yberA` |
| cken99 | 13,854 | oldest | `AtWaBfpUHeeqVpFBVK1SMVrcedYYSNrXU9CdRThjzho1` |
| world_boss_ceorjctd | 5,687 | oldest | `FgK7BFW4vN6x3hbbgPXN5AAAH8eyYkvAXHrNJUZ8ymjq` |
| hambearpig | 1,303 | oldest | `HKAQGLE5sjf7KpnFNjffp1UUynhSdq96E26fozBMNYHa` |

---

## CSV columns

| Column | Description |
|--------|-------------|
| `discord_id` | Discord snowflake |
| `discord_name` | Username at time of export |
| `unclaimed_amount` | BUX to airdrop |
| `total_claimed` | Previously claimed on old site |
| `destination_wallet` | Solana address for airdrop (empty if missing) |
| `wallet_resolution` | `primary` / `only` / `oldest` / `missing` |
| `linked_wallet_count` | How many wallets they had linked |

---

## Full list (sorted by amount)

| Discord | Unclaimed | Wallet | Resolution |
|---------|----------:|--------|------------|
| crazylunatiik | 288,833 | `B6o9AfiJ5uhw5ewWR3nSTtgLvg1JFNQWoVuR6tQXtZCo` | primary |
| gob.1. | 285,141 | `AfVXtsmsbmeVDuYSTdEQdiJsYKsi8EKZEdzoTmRb8mQ` | primary |
| snoopdfox | 259,865 | `7azqm8HWqiqZPrcgWoBbtNc9HykxpzK5zGTuiJXkpzNZ` | primary |
| johnsey | 253,423 | `9HM4nYLACGaSFGKwTgMS2yTH3yBrz98PwvSi9q3HiUC4` | primary |
| benno094 | 155,529 | `6ngUm36nabsREufTBRNGuif5pyEffaZqj2ik7NqEJfL5` | primary |
| tom_buxdao | 121,385 | `AcWwsEwgcEHz6rzUTXcnSksFZbETtc2JhA4jF7PKjp9T` | primary |
| josh_hodlin_40532 | 112,909 | `63T32BUbMNTSeemfGKAuL4NB5xfjSeUHRUkHqn92Sjuj` | primary |
| josh_hodlin | 109,885 | `63T32BUbMNTSeemfGKAuL4NB5xfjSeUHRUkHqn92Sjuj` | only |
| therealmrfunguy | 72,111 | `DtCsPVrxh7Ws5fXgwUVQQQyVZ27FJAKW4uf6n8QHnwxS` | primary |
| friedaw13 | 70,437 | `EFwA7nqU4XYi44mspmWacTV5C4ivjnm2Mgd9ExN5hpFM` | primary |
| machineman710 | 61,596 | `6MDAEysXBp4wyx1kDzA1GBHr2sZLuEZCdH58vkKhhPyR` | primary |
| dannisc1437gmail.com | 61,491 | `BHCYL69P56TzBBy1r4CxmHs6Sz9Caebgb14oTyQQkRS1` | primary |
| geneguy2023 | 56,560 | `3s6c6JzbqgdDpnXrvdfJXhJLq6i9CeMh5JghFe72nBk4` | primary |
| drgreen78paz | 55,737 | `94Q2QhtrLUxL1txrgSJeXMi8jdkVTQK4EZphfT9LYsmE` | primary |
| itsdowntime | 48,840 | `Cbo7JZEmVEbkcNzfoE7V3489MKwTehZ37KYJ4Me2cEDv` | oldest |
| sposato | 47,432 | `9FdEErSA8N9kkyukLHLsKTyyu6vN3iNq4vpQLN1rdWpc` | primary |
| daniel774263 | 38,556 | `HKN4zACpPLhE6CBQtarSfk2Dn45NVVWTKU2RLrtCLdwA` | only |
| .shoeman | 35,036 | `7azqm8HWqiqZPrcgWoBbtNc9HykxpzK5zGTuiJXkpzNZ` | primary |
| samosandthebullyz | 34,033 | `DenXVLRxRR3yrXFzwMEpnuizCcP6YMpaN9jUdZy2N8hB` | primary |
| _meowy_ | 28,945 | `EkbZV2UjHLWGKS1FtijH7gUwMyKpxXVBwYHyf8nTrEAX` | primary |
| mademoisellecynthia | 20,782 | `B9HVBrcjceo635n7wuaHXkXSpGC9pCXKragyNfdhPPRT` | primary |
| badass.missbunny | 19,543 | `HH1F12eCYL5mgn9zx7SEY5pj4owMfrLE8JmnvCRdafSJ` | primary |
| wolly9787 | 17,416 | `9756X61QRrgDUSmfJedRyG316BoK56UME6g1n81yberA` | oldest |
| dublin17 | 17,254 | `MZgHwrpoLepv6yuzM7fdAKd5WXkUi5wGNq4CAkTYrXQ` | primary |
| bizton | 15,405 | `9oLwXTf1sszgMiaxcxtk6N8pLxuV8qakgZRd9uuUu4ku` | primary |
| hodler71 | 14,406 | `2dBWhhpStkUHyWd8SH5HasAhtAbtdXRNzKm2ofKbFWZA` | primary |
| cken99 | 13,854 | `AtWaBfpUHeeqVpFBVK1SMVrcedYYSNrXU9CdRThjzho1` | oldest |
| novamark. | 13,072 | `7sakeU6TwHDey3B12tpPpEwQxtnEswrV7afHHC6LMvJg` | primary |
| qwasezeb | 11,872 | `J34vpqJdUCTBj9YcvRUq6MkwRbXWWFfSiHbfQ6LKvsiE` | primary |
| tbroker | 11,096 | `C9xiFhke9pTU89YdNoLskuA64YNScWF42dmCJach13yh` | primary |
| sorak7 | 10,425 | `9eqa8vdNhfj5891d8Ms9vKE4uaxts6rFQjcn4usvw7k1` | primary |
| professor420k | 10,153 | `ncgaRYS2kaDE85S94oAR5B3ALXA6425jXeCQGSSsrMu` | primary |
| osyfoods | 9,170 | `46TT1ruNM82nhodwCUvky5QwRZeGLiuDPY6i9hFnftqd` | only |
| .andrec. | 8,835 | `Fk3bMsvjRQTzpVanFFTCKqzKS9C27qD9bDbfU4gWMTnp` | only |
| guava007 | 8,671 | `HzrwHaJ8AVKwXg5fGqQQPyngk73QVjm4wJsm5hWmH9qu` | primary |
| z4ki28 | 7,145 | `5oNBPrLrpFfhXGivR883n8HuFbkhgXrbsToRMqfuaBWM` | only |
| sandralee78 | 6,030 | `49NtqJccaxU3Usp5Wbpw62TFK7zBsbbu361Xcy7LXohX` | primary |
| madmatte | 5,812 | `5hTZwrtqqmGwSdohNFTqr2nBGNk2BbouGDBG31hxAVdt` | primary |
| world_boss_ceorjctd | 5,687 | `FgK7BFW4vN6x3hbbgPXN5AAAH8eyYkvAXHrNJUZ8ymjq` | oldest |
| **ridonnnn** | **4,905** | *(missing)* | **missing** |
| friguy859 | 4,714 | `BnsGDzy5YVS3zUDCdXsL9FAAGaLhrYLEaUW7Pj9ip57N` | primary |
| bandoo44 | 4,140 | `5Yk4M63queqjuyNSkBoADsaxxVk83PSsYybj2ZAQHqxs` | only |
| jimmy_rugpull | 3,738 | `9ms5WgDa2e8z7HE7PD2ci3a2WnhQEZtP4dBJePhhdhXq` | primary |
| dragonking2338 | 3,282 | `6QraZLLg2i9WBiG3jxr66hoN2DZEmtW4WrN6kWZa7juj` | primary |
| nolasmokes | 3,234 | `EhCeavQuvQRf2uSNPW1dJb8hHqa511TyzDXyjM2BTr4x` | primary |
| zerotwo02_0202 | 3,225 | `Aa5xb9Ri7UwmYLvtRsqbVTSiwVvj5AoyQ4Ru31wGPLFW` | primary |
| helipos | 3,195 | `GBowhf35uo25ThZRByBxJj1wpCYPZrLvXNMmzz4H2YZA` | primary |
| memnoch666. | 3,163 | `7NoaPFrbr3cetZ3Zt8SmniuqMjnDyfUf9XZzt3yqT7rx` | primary |
| jvilla1620 | 3,100 | `22dFv1xahR495EpaBjMfMMtxRX6h8NXstwxo8cAzoGiU` | only |
| seeshell | 3,002 | `DJi5TeBtVjFhHw4Z97t3NZxNWrFRzbuEKCWZWAcnuACA` | primary |
| oli_zeki | 2,850 | `8jUhXV2ZNbsjAJNQH22JhZMR1dBMYUtoHW4ASroUiXaz` | primary |
| scophano | 2,840 | `GW29D5X9qnCwmwCjn5Js1qMFfWdFhczFBFKvEVuKbVFG` | only |
| hambearpig | 1,303 | `HKAQGLE5sjf7KpnFNjffp1UUynhSdq96E26fozBMNYHa` | oldest |
| icebird25 | 1,045 | `bP7Y8DL1S45FiqoPeEwaRtCMqy4sAHEZCa4Wp9pjQcY` | only |
| cffcbibitoni | 905 | `BEpkoGChmKStEhi5RzfPd83tAr3zguyMKhBswJ7AXyiK` | primary |
| ic0n1586 | 500 | `Gz5u2XsXXxG5jbvq16fE8Z369k54CHpXi2FnhHguvhkC` | only |
| olukurou. | 304 | `8jB5izgHFrtAigvZdYg9YjkqiLgPrVSRcSZvfcPrKuaW` | primary |
| treasuredad1 | 200 | `AumrH8CKDPJ1rNzY2ySufwmvDGmhmtJuPFFRvgS5DJ8r` | only |
| anonymous.__. | 140 | `4QFh45rTR2XuYjnn7PzhbMxX9QNhRAoJHT2zESN7zRBZ` | only |
| shelby013 | 108 | `GvHHDfEdHUU7uERWXbw7Zf8FqwpcnYLiNdhc4yhNHFGZ` | only |
| midnytemyst79 | 80 | `CjDuH7dNDAmHQuYNSaSnWXZXL3bs3d3twcorY4Tra46C` | only |
| jwinga | 35 | `EVvkoxurtifh1rtC5rW91MD3wqxP9f4PZqKXWdkWBoVK` | only |
| ghostygoobz. | 5 | `2HqzC2VgfE6DLDa6RZtDjueHHDAMM1osjTqraEaBWzDV` | only |

---

## Re-exporting

Source tables on old DB: `claim_accounts`, `user_wallets`.

To regenerate the CSV after manual fixes, re-run the export query against the old Neon database (see git history or ask in dev chat).

Exported: **2026-06-11**
