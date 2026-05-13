'use client'

import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import Link from 'next/link'
import { IndianRupee } from 'lucide-react'

export default function Header() {
  const { isConnected, address } = useAccount()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 shadow-sm backdrop-blur">
      <div className="container mx-auto px-4 py-4 max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <IndianRupee className="h-6 w-6" />
            </div>
            <div>
              <Link href="/" className="text-lg font-bold text-foreground transition-colors hover:text-primary">
                Digital Rupee
              </Link>
              <p className="text-xs font-semibold text-muted-foreground">Demo  on LayerZero V2</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && address && (
              <div className="hidden rounded-md border border-border bg-card px-4 py-2 font-mono text-sm font-bold text-muted-foreground sm:block">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  )
}
