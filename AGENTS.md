# RushPay — Project Memory

> Built with Arc Studio — money-powered apps in minutes

---

## What This App Does

RushPay is a fintech super-app with a built-in self-custodial crypto wallet, P2P marketplace, DeFi tools, and local-currency account management. It supports 25+ countries with automatic currency detection.

---

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v3
- **State**: Zustand (`src/store/walletStore.ts`, `priceStore.ts`, `fiatStore.ts`, `p2pStore.ts`, `marketplaceStore.ts`)
- **Web3**: wagmi v2, viem v2, ConnectKit (optional, DeFi only)
- **Native wallet**: HD BIP-44 wallet — `server/wallet.ts`, `src/hooks/useNativeWallet.ts`
- **Backend**: Bun HTTP server (`server/index.ts`, port 3001)
- **Chain**: Arc Testnet (Chain ID 5042002) — default; all major EVM chains supported
- **Token**: USDC — native on Arc, ERC-20 on Ethereum/Base/Arbitrum/etc.

---

## Pages

| Page | Route key | Description |
|---|---|---|
| Wallet | `wallet` | Home — balances, send/receive, crypto portfolio |
| P2P | `p2p` | Peer-to-peer marketplace + quick swap |
| DeFi | `defi` | Swap, bridge, send, receive (external wallet optional) |
| Element (AI) | `ai` | AI market analysis agent |
| Portfolio | `portfolio` | Full portfolio overview |
| Subaccounts | `subaccounts` | Sub-account management |
| Referrals | `referrals` | Referral program |

---

## Native Wallet System

- **Key generation**: BIP-44 HD wallet via server-side `server/wallet.ts`
- **Storage**: AES-256-GCM encrypted keystore on server (key from `WALLET_ENCRYPTION_KEY` env var)
- **EVM address**: All EVM chains share one address (m/44'/60'/0'/0/0)
- **Balance polling**: Real on-chain via RPC proxy (`RPC_PROXY_BASE_URL`) or public RPC fallback
- **Signing**: `viem` `createWalletClient` for EVM transactions
- **Non-EVM**: Solana, Bitcoin addresses derived; signing requires additional libraries (marked as pending)

---

## Backend Server (port 3001)

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Health check + integration status |
| `POST /api/wallet/get-or-create` | Create or retrieve wallet by user ID |
| `GET /api/wallet/addresses/:id` | Get all derived addresses |
| `GET /api/wallet/balance/:id/:network/:symbol` | Real on-chain balance |
| `POST /api/wallet/send` | Sign + broadcast transaction |
| `POST /api/swap/quote` | P2P swap quote |
| `POST /api/swap/initiate` | Initiate P2P swap |
| `GET /api/swap/status/:id` | Swap status polling |
| `POST /api/swap/payment` | Submit payment proof |
| `POST /api/swap/cancel/:id` | Cancel swap |

---

## Environment Variables

| Variable | Purpose | Status |
|---|---|---|
| `WALLET_ENCRYPTION_KEY` | AES-256 key for keystore | Required for persistent wallets |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy base | Auto-provisioned |
| `RPC_PROXY_TOKEN` | RPC proxy auth token | Auto-provisioned |
| `RPC_PROXY_CHAINS` | Comma-separated proxy chain keys | Auto-provisioned |
| `FLUTTERWAVE_SECRET_KEY` | Fiat deposits (Nigeria/Africa) | Not set — demo mode |
| `PAYSTACK_SECRET_KEY` | Fiat deposits (Ghana/Kenya) | Not set — demo mode |
| `VAULT_PRIVATE_KEY` | Hot wallet for swap engine | Not set — simulation mode |
| `VTPASS_API_KEY` | Bills (airtime, data, TV) | Not set — preview mode |

---

## Deployed Contracts (Arc Testnet) — legacy, not used in frontend

| Contract | Address |
|---|---|
| MockOracle | `0x8429098a03c01118504883aebd5fb6955e214d8b` |
| PerpVault | `0x6e044e96806002fe6aae3fe138a711bc4b4e8cfb` |
| PerpMarket | `0xb3661afe562ec4f96c0e28de979e845d1b3d4ca7` |
| OrderBook | `0x7da561770d451b77a2794f559f01950535246687` |
| FundingRateOracle | `0xabbbbfaccfaa1eac7b0d4e2e5d74349559e12631` |

*(These remain deployed on-chain but are not referenced by the current frontend.)*

---

## To Run

```bash
# Install
bun install

# Start backend (terminal 1)
bun run server

# Start frontend (terminal 2)
bun run dev
```

---

## Key Architecture Decisions

1. Zustand selectors use individual field selectors `s => s.field` — no bare destructuring (prevents infinite loops)
2. `useNativeWallet` is instantiated once per page, passed as prop to child modals — never duplicated
3. Real on-chain balances sync into `walletStore` via `syncOnChainBalances()` every 30s
4. External wallet (MetaMask/WalletConnect) is optional — only prompted inside DeFi tab
5. All balance mutations are idempotent (keyed by idempotency key)
6. `hmr: false` in vite.config — permanent
