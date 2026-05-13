import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import {
  arbitrumSepolia,
  baseSepolia,
  optimismSepolia,
  polygonAmoy,
  sepolia,
} from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'INR-T Faucet & Bridge',
  projectId: '91e6b8756d3193f06f6daaad7ec32002',
  chains: [sepolia, baseSepolia, optimismSepolia, arbitrumSepolia, polygonAmoy],
  ssr: true,
})
