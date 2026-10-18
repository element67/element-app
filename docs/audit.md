# PERPX Codebase Audit — October 2026

## What Works
- Perp DEX terminal: chart (live Binance WS), order book, positions, history — fully functional
- AI Agent (Element): signal analysis, chat interface, trade queuing — functional
- DeFi page: Swap, Bridge, Send, Receive, Buy, P2P tabs render and have UX flows
- Home dashboard: balance display, quick actions, market movers grid, tx history
- P2P: order creation, escrow state machine, dispute flow — functional (in-memory)
- Built-in wallet store: Zustand+persist, multi-asset balances, tx history
- Live Binance price feed: 22 markets, kline streams, miniTicker WS

## What Is Incomplete

### Critical: DeFi actions don't mutate wallet balances
- Swap panel: calculates quote, but `executeSwap()` only shows a toast — never calls `walletStore.swap()`
- Send panel: validates address, but `executeSend()` only toasts — never calls `walletStore.debit()`
- Buy panel: shows quote, but confirm never calls `walletStore.credit()`
- P2P: trade completion never calls `walletStore.credit()/debit()`

### Critical: GlobalMarketplace store exists (36KB) but never renders
- `marketplaceStore.ts` is fully written (195 countries, FX rates, bill categories)
- No component renders it — it's dead code

### Moderate: walletStore balance mutations ignore live prices
- `credit`/`debit`/`swap` use the static `USD_PRICES` map, not live Binance prices
- Portfolio value can diverge from the live ticker data

### Moderate: Transaction IDs not idempotent
- `addTx` uses `Date.now()` as ID — two rapid calls can collide
- No deduplication key prevents double-credit on retry

### Minor: P2P escrow never debits wallet
- `createTrade` locks crypto in escrow conceptually but never calls `walletStore.debit(amount)`
- `verifyAndRelease` credits buyer but `walletStore.credit()` is not called

### Minor: StakingPage still present in nav
- Was replaced by DeFiPage conceptually but StakingPage.tsx still exists and is imported

### Performance
- DeFiPage is 43KB in one file — imported eagerly on every page load
- AIAgentPage is 42KB — same issue
- No React.lazy() anywhere; full bundle loads synchronously

## What Requires External Credentials (Clearly Labeled in UI)
- Real custodial crypto: Circle developer-controlled wallets SDK + entity secret
- Real fiat balances: Licensed EMI (Flutterwave, Stripe Treasury, etc.)
- Real bank transfers: Wise / Flutterwave API key
- Real KYC/AML: Persona / Sumsub key
- Real onchain escrow: deployed PerpVault contract + wallet signature

## Implementation Plan (This Session)
1. Fix DeFi actions to actually mutate walletStore (Swap, Send, Receive, Buy)
2. Fix P2P escrow to debit/credit walletStore
3. Make walletStore use live prices in mutations
4. Add idempotency keys to tx records
5. Add React.lazy() for heavy pages
6. Wire GlobalMarketplace or remove dead import
7. Build + deploy
