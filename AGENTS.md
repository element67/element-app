# PERPX — Project Memory

> Built with Arc Studio — money-powered apps in minutes

---

## What This App Does

PERPX is a professional perpetual futures DEX (trading terminal) on Arc Testnet. Users can trade BTC-USD, ETH-USD, and SOL-USD perpetuals with up to 40x leverage using USDC collateral. Features a full dark-mode trading terminal UI with real-time order book, TradingView-style candlestick chart, order panel with TP/SL, and an account/positions panel.

---

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v3
- **State**: Zustand (`src/store/perpStore.ts`)
- **Web3**: wagmi v2, viem v2, ConnectKit
- **Chart**: lightweight-charts v5 (TradingView)
- **Contracts**: Solidity 0.8.28 + Foundry (`via_ir = true`)
- **Backend**: Bun WebSocket + REST server (`server/index.ts`, port 3001)
- **Chain**: Arc Testnet (Chain ID 5042002)
- **Token**: USDC — `0x3600000000000000000000000000000000000000` (Arc Testnet, 6 dec)

---

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| MockOracle | `0x8429098a03c01118504883aebd5fb6955e214d8b` |
| PerpVault | `0x6e044e96806002fe6aae3fe138a711bc4b4e8cfb` |
| PerpMarket | `0xb3661afe562ec4f96c0e28de979e845d1b3d4ca7` |
| OrderBook | `0x7da561770d451b77a2794f559f01950535246687` |
| FundingRateOracle | `0xabbbbfaccfaa1eac7b0d4e2e5d74349559e12631` |

Admin/deployer wallet: `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42` (Circle platform deployer)

---

## Key Files

| Path | Purpose |
|---|---|
| `src/App.tsx` | Root layout — 3-column trading terminal shell |
| `src/store/perpStore.ts` | Zustand store — all UI + market state |
| `src/hooks/useWebSocket.ts` | WS client — connects to backend, feeds store |
| `src/components/TopNav.tsx` | Navigation bar |
| `src/components/MarketHeader.tsx` | Stats strip with funding countdown |
| `src/components/OrderBookPanel.tsx` | Order book + Recent Trades |
| `src/components/ChartPanel.tsx` | Candlestick chart (lightweight-charts v5) |
| `src/components/OrderPanel.tsx` | Order form (market/limit/pro, TP/SL, TIF) |
| `src/components/AccountPanel.tsx` | Portfolio margin card |
| `src/components/BottomPanel.tsx` | Positions / Orders / History tabs |
| `src/components/FooterBar.tsx` | Connection status + subaccount switcher |
| `server/index.ts` | Bun matching engine + WS + REST backend |
| `contracts/MockOracle.sol` | Owner-updatable price oracle |
| `contracts/PerpVault.sol` | USDC collateral vault + subaccounts |
| `contracts/PerpMarket.sol` | Perp engine: margin, funding, liquidation |
| `contracts/OrderBook.sol` | EIP-712 signed order registry |
| `contracts/FundingRateOracle.sol` | Cumulative funding index storage |
| `contracts/test/PERPX.t.sol` | 54 Foundry tests (all passing) |

---

## To Run

```bash
# Install
bun install

# Start backend (terminal 1)
bun run server

# Start frontend (terminal 2)
bun run dev

# Contracts
bun run contracts:build   # forge build
bun run contracts:test    # forge test -vv  (54/54 passing)
```

---

## Assumptions / Known Limitations

1. Prices/sizes are 18-decimal in contracts; vault uses raw ERC-20 decimals. A normalisation adapter is needed for production 6-decimal USDC.
2. MockOracle is owner-controlled — replace with Pyth/Chainlink for mainnet.
3. Matching engine is trusted (`MATCHING_ENGINE_ROLE`) — add ZK proof of matching for trustless operation.
4. Funding is settled manually/by keeper — add a keeper bot for production.
5. Backend generates simulated market data for demo purposes.
