# RushPay — Global Fintech Super-App

RushPay is a self-custodial fintech super-app built with Arc Studio. It combines crypto wallets, P2P trading, Quick Swap, DeFi, local-currency (NGN) accounts, AI-assisted settlement, and an onchain merchant escrow marketplace in a single Liquid Glass UI.

Built with [Arc Studio](https://studio.arc.io)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite + wagmi)                                 │
│  TopNav │ MarketHeader │ OrderBook │ Chart │ OrderPanel │ Bottom│
│  Zustand store ← WebSocket hook → ws://localhost:3001           │
└──────────────────────────────┬──────────────────────────────────┘
                               │ WS + REST
┌──────────────────────────────▼──────────────────────────────────┐
│  Bun backend  (server/index.ts)  port 3001                      │
│  • Matching Engine (price-time priority, CLOB)                  │
│  • Simulated market data: BTC-USD, ETH-USD, SOL-USD             │
│  • REST: /api/markets, /api/orderbook/:sym, /api/candles/:sym   │
│  • WS push: ticker, orderbook, trade, candles, candle_update    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ onchain settlement
┌──────────────────────────────▼──────────────────────────────────┐
│  Smart Contracts (Arc Testnet)                                  │
│  MockOracle  → mark & index prices per market                   │
│  PerpVault   → USDC collateral, subaccounts, insurance fund     │
│  PerpMarket  → positions, funding, liquidations, fees           │
│  OrderBook   → EIP-712 signed orders, GTC/IOC/FOK/PostOnly      │
│  FundingRateOracle → cumulative funding index storage           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Smart Contracts

| Contract | Purpose |
|---|---|
| `MockOracle.sol` | Owner-updatable mark/index prices (18-decimal, per marketId) |
| `PerpVault.sol` | USDC collateral vault: deposit/withdraw, subaccounts, insurance fund |
| `PerpMarket.sol` | Core perp engine: cross/isolated margin, longs/shorts, funding, liquidations |
| `OrderBook.sol` | Onchain order registry with EIP-712 signed relay; matching engine settles |
| `FundingRateOracle.sol` | Stores last funding rate + cumulative index for external queries |

### Key parameters

| Parameter | Value |
|---|---|
| Taker fee | 0.03% (3 bps) |
| Maker fee | 0% |
| Liquidator reward | 0.5% of position value |
| BTC-USD max leverage | 40x |
| ETH-USD max leverage | 25x |
| SOL-USD max leverage | 20x |
| Funding cadence | Hourly, rate = clamp((mark−index)/index/24, ±0.5%) |
| Maintenance margin (BTC) | 2.5% (250 bps) |
| Initial margin (BTC) | 5.0% (500 bps) |

### Safety
- `ReentrancyGuard` on all state-changing vault and market functions
- `Pausable` (admin can halt deposits, trades, and orders)
- `AccessControl` — `MATCHING_ENGINE_ROLE`, `MARKET_ROLE`, `PAUSER_ROLE`
- Every state change emits a named event

---

## Frontend

Built with React 18 + TypeScript + Tailwind CSS + wagmi v2 + ConnectKit.

| Component | Description |
|---|---|
| `TopNav` | Logo, nav tabs, theme toggle, language selector, wallet button |
| `MarketHeader` | Market selector, live stats strip (price, OI, funding countdown) |
| `OrderBookPanel` | Asks/bids with depth bars, spread row, buy/sell pressure ratio |
| `ChartPanel` | TradingView lightweight-charts v5: candles, RSI(14), Volume; 6 timeframes |
| `OrderPanel` | Full order form: margin mode, leverage, order types, TP/SL, TIF |
| `AccountPanel` | Portfolio margin card: equity, margin ratio, available margin |
| `BottomPanel` | Positions, Open Orders, Balances, and history tabs |
| `FooterBar` | Connection status, subaccount switcher |

State management: **Zustand** (`src/store/perpStore.ts`)  
Real-time data: **WebSocket hook** (`src/hooks/useWebSocket.ts`) — auto-reconnects with backoff

---

## Backend (Matching Engine)

`server/index.ts` — single Bun file, no external runtime dependencies.

- Simulates continuous price ticks for BTC-USD, ETH-USD, SOL-USD (every 500ms)
- Rebuilds order book depth on each tick with realistic spread
- Emits OHLCV candle updates for 1m, 5m, 15m, 1H, 4H, 1D
- Serves 300-candle history per timeframe on connect
- REST endpoints: `GET /api/health`, `/api/markets`, `/api/orderbook/:sym`, `/api/trades/:sym`, `/api/candles/:sym/:tf`, `/api/ticker/:sym`

For production: replace simulated ticks with real order matching, sign settled trades with `MATCHING_ENGINE_ROLE`, and submit batched settlements to `PerpMarket.openPosition/closePosition`.

---

## Foundry Tests

54 tests across 5 suites — all passing.

| Suite | Tests | Coverage |
|---|---|---|
| `MockOracleTest` | 9 | Price updates, access control, fuzz |
| `PerpVaultTest` | 16 | Deposit/withdraw, subaccounts, insurance fund, pause, fuzz |
| `PerpMarketTest` | 17 | Open/close long/short, partial close, funding, liquidation, fuzz |
| `OrderBookTest` | 8 | Submit, cancel, fill, EIP-712 signatures, expiry |
| `PERPXIntegrationTest` | 4 | Full flow: deposit→open→profit→withdraw, short, funding, liquidation |

```bash
cd /home/user/app
bun run contracts:test
# or: forge test -vv
```

---

## Running Locally

### Prerequisites
- [Bun](https://bun.sh) ≥ 1.1
- [Foundry](https://getfoundry.sh) (for contract work)

### Install
```bash
bun install
```

### Development (two terminals)

**Terminal 1 — Backend matching engine:**
```bash
bun run server
# Starts on ws://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
bun run dev
# Opens http://localhost:5173
```

### Build contracts
```bash
bun run contracts:build   # forge build
bun run contracts:test    # forge test -vv
```

---

## Deploying to Arc Testnet

The deploy script targets Arc Testnet (chain ID 1516 / `ARC-TESTNET`).

> **Prerequisites:** set `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` in `.env`, then run:

```bash
bun run deploy:self
```

Or use the Circle Smart Contract Platform UI to deploy the compiled artifacts from `contracts/out/`.

**Constructor arguments:**

| Contract | Args |
|---|---|
| `MockOracle` | `admin` address |
| `PerpVault` | `admin`, `pauser`, `matchingEngine`, `usdcToken (Arc USDC)` |
| `PerpMarket` | `admin`, `pauser`, `matchingEngine`, `vault`, `oracle` |
| `OrderBook` | `admin`, `pauser`, `matchingEngine` |
| `FundingRateOracle` | `admin`, `pauser`, `updater` |

After deploy, update the contract addresses in `AGENTS.md` and set them in `.env` as `VITE_VAULT_ADDRESS`, `VITE_MARKET_ADDRESS`, etc.

---

## Assumptions

1. **Unit system**: Contract prices and sizes use 18-decimal fixed-point (1e18 = 1 unit). The vault stores whatever the ERC-20 token's native decimals are. Tests use a mock ERC-20 with 18 decimals for simplicity; production USDC on Arc is 6 decimals — a decimals-normalisation layer should be added before mainnet.
2. **Matching engine trust**: `MATCHING_ENGINE_ROLE` is trusted to submit valid fills. A production system would validate signed order receipts onchain or use a ZK proof of matching correctness.
3. **Oracle**: `MockOracle` is owner-controlled; replace with a Pyth/Chainlink integration before mainnet.
4. **Funding settlement**: Called manually or by a keeper. A production keeper bot should call `settleFunding` hourly.
5. **Insurance fund**: Seeded manually. A production system would allocate a fraction of taker fees to it automatically.
6. **Demo data**: The backend generates simulated price data. All market data in the UI is for demonstration only.
