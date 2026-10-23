# RushPay

A self-custodial fintech super-app — crypto wallet, P2P marketplace, Quick Swap, DeFi tools, and local-currency account management for 25+ countries.

Built with [Arc Studio](https://studio.arc.io)

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, framer-motion
- **Web3**: wagmi v2, viem v2, ConnectKit (DeFi external wallet)
- **State**: Zustand
- **Backend**: Bun HTTP server (port 3001)
- **Native wallet**: BIP-44 HD wallet with AES-256-GCM encrypted keystore
- **Chain**: Arc Testnet (Chain ID 5042002) — default; all major EVM chains supported
- **Token**: USDC

---

## Development

### Prerequisites
- Bun ≥ 1.0
- Node ≥ 18 (for Circle CLI)

### Install
```bash
bun install
```

### Run
```bash
# Frontend (port 5173)
bun run dev

# Backend (port 3001)
bun run server
```

### Build
```bash
bun run build
```

### Check (lint + typecheck)
```bash
bash /home/user/arc-studio-helpers/check.sh
```

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `WALLET_ENCRYPTION_KEY` | AES-256 key for HD wallet keystore | Yes (falls back to default — less secure) |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy | Auto-provisioned in Arc Studio |
| `RPC_PROXY_TOKEN` | RPC proxy auth token | Auto-provisioned |
| `RPC_PROXY_CHAINS` | Proxy chain keys | Auto-provisioned |
| `FLUTTERWAVE_SECRET_KEY` | NGN/Africa fiat payouts | No — demo mode without it |
| `PAYSTACK_SECRET_KEY` | GHS/KES fiat payouts | No — demo mode without it |
| `VAULT_PRIVATE_KEY` | Hot wallet for swap engine | No — simulation mode without it |
| `VAULT_EVM_ADDRESS` | Deposit address for swaps | No — required for real swaps |
| `VAULT_LIQUIDITY_NGN` | Vault balance for instant settlement | No — required for instant payouts |
| `OPENAI_API_KEY` | Enhanced Element AI responses | No — built-in intelligence without it |

---

## Features

- **Wallet**: Self-custodial HD wallet — BTC, ETH, SOL, USDC, USDT, BNB, ARB, and more
- **P2P Marketplace**: Buy/sell crypto peer-to-peer with escrow protection
- **Quick Swap**: AI-assisted instant crypto↔fiat conversion with blockchain verification
- **DeFi**: External wallet — swap, bridge, send, receive across all major chains
- **NGN Account**: Local-currency deposits, transfers, bills, airtime
- **Multi-currency**: 25+ countries with automatic locale detection
- **Element AI**: Intelligent assistant with market analysis, diagnostics, and chat
- **Exchange**: Coming soon — instant crypto-to-fiat conversion engine
