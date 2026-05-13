'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { IndianRupee, Landmark, Network, ShieldCheck } from 'lucide-react'
import FaucetTab from '@/components/FaucetTab'
import BridgeTab from '@/components/BridgeTab'
import Header from '@/components/Header'

export default function Home() {
  const { isConnected, address } = useAccount()
  const [activeTab, setActiveTab] = useState<'faucet' | 'bridge'>('faucet')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Check URL params for tab selection
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (tab === 'bridge' || tab === 'faucet') {
      setActiveTab(tab)
    }
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <main className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {!isConnected ? (
          <div className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center gap-8 py-12">
            <div className="w-full max-w-2xl rounded-lg border border-border bg-card/85 p-6 text-center shadow-xl shadow-black/10 backdrop-blur sm:p-8">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <IndianRupee className="h-8 w-8" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Digital Rupee Demo
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-base font-medium leading-7 text-muted-foreground sm:text-lg">
                Experience INR-T test tokens with a focused faucet and cross-chain bridge powered by LayerZero V2.
              </p>
              <div className="mt-6 grid gap-3 border-t border-border pt-5 text-sm font-semibold text-muted-foreground sm:grid-cols-3">
                <span className="inline-flex items-center justify-center gap-2 rounded-md bg-muted px-3 py-2">
                  <Landmark className="h-4 w-4 text-primary" />
                  Demo 
                </span>
                <span className="inline-flex items-center justify-center gap-2 rounded-md bg-muted px-3 py-2">
                  <Network className="h-4 w-4 text-secondary" />
                  Multi-chain
                </span>
                <span className="inline-flex items-center justify-center gap-2 rounded-md bg-muted px-3 py-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  Non-custodial
                </span>
              </div>
            </div>
            <ConnectButton />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-1 rounded-lg border border-border bg-card/80 p-1 shadow-sm">
              <button
                onClick={() => setActiveTab('faucet')}
                className={`relative flex-1 rounded-md px-6 py-3 text-sm font-bold transition-colors ${
                  activeTab === 'faucet'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Faucet
              </button>
              <button
                onClick={() => setActiveTab('bridge')}
                className={`relative flex-1 rounded-md px-6 py-3 text-sm font-bold transition-colors ${
                  activeTab === 'bridge'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Bridge
              </button>
            </div>

            <div className="animate-in fade-in duration-300">
              {activeTab === 'faucet' && <FaucetTab address={address} />}
              {activeTab === 'bridge' && <BridgeTab address={address} />}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
