/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import {
  mainnet, base, arbitrum, optimism, polygon, bsc, avalanche,
  sepolia, baseSepolia, arbitrumSepolia,
} from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

const connectors = [
  injected(),
  ...(WC_PROJECT_ID ? [walletConnect({ projectId: WC_PROJECT_ID })] : []),
]

export const config = createConfig({
  chains: [
    arcTestnet,
    mainnet, base, arbitrum, optimism, polygon, bsc, avalanche,
    sepolia, baseSepolia, arbitrumSepolia,
  ],
  connectors,
  transports: {
    [arcTestnet.id]:      http(),
    [mainnet.id]:         http(),
    [base.id]:            http(),
    [arbitrum.id]:        http(),
    [optimism.id]:        http(),
    [polygon.id]:         http(),
    [bsc.id]:             http(),
    [avalanche.id]:       http(),
    [sepolia.id]:         http(),
    [baseSepolia.id]:     http(),
    [arbitrumSepolia.id]: http(),
  },
})
