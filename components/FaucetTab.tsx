'use client'

import { useState, useEffect } from 'react'
import { useReadContract, useWriteContract, useChainId, useSwitchChain } from 'wagmi'
import { formatUnits } from 'viem'
import { CONTRACTS, FAUCET_ABI, INRT_ABI, CLAIM_AMOUNT, CLAIM_COOLDOWN } from '@/lib/contracts'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, Clock, Coins, IndianRupee, Network, ShieldCheck, Zap } from 'lucide-react'

interface FaucetTabProps {
  address?: `0x${string}`
}

export default function FaucetTab({ address }: FaucetTabProps) {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [selectedChain, setSelectedChain] = useState<'sepolia' | 'base'>('sepolia')
  const [claimLoading, setClaimLoading] = useState(false)
  const [lastClaimTime, setLastClaimTime] = useState<number>(0)
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [hasClaimed, setHasClaimed] = useState(false)

  const currentContract = selectedChain === 'sepolia' 
    ? CONTRACTS.SEPOLIA 
    : CONTRACTS.BASE_SEPOLIA

  // Read token balance
  const { data: balance } = useReadContract({
    address: currentContract.TOKEN as `0x${string}`,
    abi: INRT_ABI,
    functionName: 'balanceOf',
    args: [address || '0x'],
    query: { enabled: !!address },
  })

  // Read last claim time
  const { data: lastClaim } = useReadContract({
    address: currentContract.FAUCET as `0x${string}`,
    abi: FAUCET_ABI,
    functionName: 'lastClaimTime',
    args: [address || '0x'],
    query: { enabled: !!address },
  })

  // Read next access time
  const { data: nextAccess } = useReadContract({
    address: currentContract.FAUCET as `0x${string}`,
    abi: FAUCET_ABI,
    functionName: 'nextAccessTime',
    args: [address || '0x'],
    query: { enabled: !!address },
  })

  // Claim tokens
  const { writeContractAsync: claimTokens } = useWriteContract()

  // Calculate time until next claim
  useEffect(() => {
    if (nextAccess) {
      const nextAccessNum = Number(nextAccess)
      const now = Math.floor(Date.now() / 1000)
      const timeLeft = Math.max(0, nextAccessNum - now)
      setTimeUntilNextClaim(timeLeft)

      // Update timer every second
      const interval = setInterval(() => {
        setTimeUntilNextClaim((prev) => Math.max(0, prev - 1))
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [nextAccess])

  // Track last claim time separately
  useEffect(() => {
    if (lastClaim) {
      const lastClaimNum = Number(lastClaim)
      setLastClaimTime(lastClaimNum)
      setHasClaimed(lastClaimNum > 0)
    }
  }, [lastClaim])

  const handleClaim = async () => {
    setError(null)
    
    if (chainId !== currentContract.CHAIN_ID) {
      switchChain({ chainId: currentContract.CHAIN_ID })
      return
    }

    setClaimLoading(true)
    try {
      await claimTokens({
        address: currentContract.FAUCET as `0x${string}`,
        abi: FAUCET_ABI,
        functionName: 'requestTokens',
      })
      setHasClaimed(true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to claim tokens. Please try again.'
      setError(errorMessage)
      console.error('Claim error:', error)
      setClaimLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours}h ${minutes}m ${secs}s`
  }

  const balanceNum = balance ? parseFloat(formatUnits(balance as bigint, 18)) : 0
  const claimAmount = parseFloat(formatUnits(BigInt(CLAIM_AMOUNT), 18))
  const canClaim = timeUntilNextClaim === 0 && address
  const isWrongChain = chainId !== currentContract.CHAIN_ID

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <IndianRupee className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Token Faucet
            </h1>
            <p className="mt-2 text-base font-medium text-muted-foreground">
              Claim INR-T test tokens for bridge development.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Select network</p>
        <div className="flex gap-3 flex-wrap">
          {(['sepolia', 'base'] as const).map((chainName) => (
            <button
              key={chainName}
              onClick={() => setSelectedChain(chainName)}
              className={`rounded-md border px-5 py-3 text-sm font-semibold transition-colors ${
                selectedChain === chainName
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {chainName === 'sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <AlertCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-bold text-foreground">Error</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="h-full rounded-lg border border-border bg-card p-6 shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your balance</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-5xl font-bold tracking-tight text-foreground">
                  {balanceNum.toFixed(2)}
                </p>
                <p className="mt-1 text-sm font-bold text-muted-foreground">INR-T</p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <IndianRupee className="h-8 w-8" />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-lg border border-secondary/35 bg-secondary/10 p-6 shadow-sm sm:p-8">
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Claimable amount</p>
                <div className="flex items-baseline gap-3">
                  <p className="text-6xl font-black tracking-tight text-secondary">
                    {claimAmount.toFixed(0)}
                  </p>
                  <p className="text-xl font-black text-secondary">INR-T</p>
                </div>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">Once every {CLAIM_COOLDOWN / 3600} hours</p>
              </div>

              {hasClaimed && (
                <div className="rounded-lg border border-accent/35 bg-accent/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-accent" />
                    <p className="text-sm font-bold text-foreground">Next claim available</p>
                  </div>
                  <p className="text-3xl font-black text-accent">
                    {formatTime(timeUntilNextClaim)}
                  </p>
                </div>
              )}

              {isWrongChain ? (
                <button
                  onClick={() => switchChain({ chainId: currentContract.CHAIN_ID })}
                  className="flex w-full items-center justify-center gap-3 rounded-lg bg-destructive px-6 py-4 text-lg font-bold text-destructive-foreground transition-colors hover:bg-destructive/90"
                >
                  <Zap className="h-5 w-5" />
                  Switch to {selectedChain === 'sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia'}
                </button>
              ) : (
                <button
                  onClick={handleClaim}
                  disabled={!canClaim || claimLoading}
                  className={`flex w-full items-center justify-center gap-3 rounded-lg px-6 py-4 text-lg font-bold transition-colors ${
                    canClaim && !claimLoading
                      ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90'
                      : 'cursor-not-allowed bg-muted text-muted-foreground'
                  }`}
                >
                  {claimLoading ? (
                    <>
                      <Spinner className="h-5 w-5" />
                      <span>Processing...</span>
                    </>
                  ) : canClaim ? (
                    <>
                      <Zap className="h-5 w-5" />
                      <span>Claim Now</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-5 w-5" />
                      <span>Cooldown Active</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {(hasClaimed || lastClaimTime > 0 || nextAccess) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {lastClaimTime > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Last claimed</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {new Date(lastClaimTime * 1000).toLocaleString()}
              </p>
            </div>
          )}
          {nextAccess && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Next access</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {new Date(Number(nextAccess) * 1000).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Faucet details</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-sm font-bold text-foreground">Instant</h3>
            <p className="text-xs text-muted-foreground">Tokens are sent directly after confirmation.</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
              <Coins className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-sm font-bold text-foreground">Free</h3>
            <p className="text-xs text-muted-foreground">No faucet fee or hidden token cost.</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Network className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-sm font-bold text-foreground">Direct</h3>
            <p className="text-xs text-muted-foreground">Sent to the connected wallet address.</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-sm font-bold text-foreground">Secure</h3>
            <p className="text-xs text-muted-foreground">Built on wallet-signed transactions.</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Token contract address</p>
        <p className="break-all rounded-md bg-muted p-3 font-mono text-xs font-semibold text-foreground">
          {currentContract.TOKEN}
        </p>
      </div>
    </div>
  )
}
