'use client'

import { useState, useEffect } from 'react'
import { useReadContract, useWriteContract, useChainId, useSwitchChain } from 'wagmi'
import { formatUnits, parseUnits, pad } from 'viem'
import { CONTRACTS, OFT_ABI, INRT_ABI, LAYER_ZERO_ENDPOINTS } from '@/lib/contracts'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { Coins, Globe2, IndianRupee, Landmark, RefreshCw, ShieldCheck, Zap } from 'lucide-react'

interface BridgeTabProps {
  address?: `0x${string}`
}

export default function BridgeTab({ address }: BridgeTabProps) {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)
  const [sourceChain, setSourceChain] = useState<'sepolia' | 'base'>('sepolia')
  const [destChain, setDestChain] = useState<'sepolia' | 'base'>('base')
  const [amount, setAmount] = useState('')
  const [bridgeLoading, setBridgeLoading] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)
  const [txInProgress, setTxInProgress] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Handle hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  const sourceContract = sourceChain === 'sepolia' 
    ? CONTRACTS.SEPOLIA 
    : CONTRACTS.BASE_SEPOLIA

  // Derive these early since they're used in hooks
  const isWrongChain = chainId !== sourceContract.CHAIN_ID
  const amountNum = parseFloat(amount) || 0

  // Prevent same chain selection
  const handleSourceChainChange = (newChain: 'sepolia' | 'base') => {
    setSourceChain(newChain)
    if (newChain === destChain) {
      setDestChain(newChain === 'sepolia' ? 'base' : 'sepolia')
    }
  }

  const handleDestChainChange = (newChain: 'sepolia' | 'base') => {
    setDestChain(newChain)
    if (newChain === sourceChain) {
      setSourceChain(newChain === 'sepolia' ? 'base' : 'sepolia')
    }
  }

  // Read source chain balance
  const { data: balance } = useReadContract({
    address: sourceContract.TOKEN as `0x${string}`,
    abi: INRT_ABI,
    functionName: 'balanceOf',
    args: [address || '0x'],
    query: { enabled: !!address },
  })

  // Read allowance
  const { data: allowance } = useReadContract({
    address: sourceContract.TOKEN as `0x${string}`,
    abi: INRT_ABI,
    functionName: 'allowance',
    args: [address || '0x', sourceContract.TOKEN as `0x${string}`],
    query: { enabled: !!address },
  })

  // Quote LayerZero V2 native fee using quoteSend
  const { data: quotedFee, isLoading: isQuotingFee } = useReadContract({
    address: sourceContract.TOKEN as `0x${string}`,
    abi: OFT_ABI,
    functionName: 'quoteSend',
    args: [
      // SendParam struct - LayerZero V2 format
      {
        dstEid: destChain === 'sepolia'
          ? LAYER_ZERO_ENDPOINTS[CONTRACTS.SEPOLIA.CHAIN_ID]
          : LAYER_ZERO_ENDPOINTS[CONTRACTS.BASE_SEPOLIA.CHAIN_ID],
        to: pad(address || '0x', { size: 32 }),
        amountLD: parseUnits(amount || '0', 18),
        minAmountLD: (parseUnits(amount || '0', 18) * BigInt(95)) / BigInt(100), // 5% slippage tolerance
        extraOptions: '0x0003010011010000000000000000000000000000ea60', // Default gas settings for lzReceive
        composeMsg: '0x',
        oftCmd: '0x',
      },
      false, // _payInLzToken = false, paying in native ETH not ZRO token
    ],
    query: {
      // Only quote if address is available, amount is positive, and not on wrong chain
      enabled: !!address && parseFloat(amount) > 0 && !isWrongChain,
      select: (data: any) => data?.nativeFee || BigInt(0), // Extract nativeFee from MessagingFee struct
    },
  })

  // Read if approval is required for this OFT
  const { data: approvalRequired } = useReadContract({
    address: sourceContract.TOKEN as `0x${string}`,
    abi: OFT_ABI,
    functionName: 'approvalRequired',
    query: { enabled: !!address },
  })

  // Approve and bridge tokens
  const { writeContractAsync: approveTokens } = useWriteContract()
  const { writeContractAsync: bridgeTokens } = useWriteContract()

  const handleApprove = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    
    setApproveLoading(true)
    setTxInProgress(true)
    try {
      const amountWei = parseUnits(amount, 18)
      const hash = await approveTokens({
        address: sourceContract.TOKEN as `0x${string}`,
        abi: INRT_ABI,
        functionName: 'approve',
        args: [sourceContract.TOKEN as `0x${string}`, amountWei],
      })
      setTxHash(hash as string)
      toast({
        title: 'Approval pending',
        description: 'Your token approval is being processed...',
        variant: 'default',
      })
    } catch (error) {
      console.error('Approve error:', error)
      toast({
        title: 'Approval failed',
        description: error instanceof Error ? error.message : 'Failed to approve tokens',
        variant: 'destructive',
      })
    } finally {
      setApproveLoading(false)
      setTxInProgress(false)
    }
  }

  const handleBridge = async () => {
    if (!address || !amount || parseFloat(amount) <= 0) return
    
    if (chainId !== sourceContract.CHAIN_ID) {
      switchChain({ chainId: sourceContract.CHAIN_ID })
      return
    }

    setBridgeLoading(true)
    setTxInProgress(true)
    const amountWei = parseUnits(amount, 18)
    
    if (!quotedFee || quotedFee === BigInt(0)) {
      toast({
        title: 'Fee quote pending',
        description: 'Waiting for LayerZero fee quote. Please try again in a moment.',
        variant: 'default',
      })
      setBridgeLoading(false)
      setTxInProgress(false)
      return;
    }
    try {
      // LayerZero V2 OFT send() function call
      // Reference: https://docs.layerzero.network/v2/developers/evm/oft
      const hash = await bridgeTokens({
        address: sourceContract.TOKEN as `0x${string}`,
        abi: OFT_ABI,
        functionName: 'send',
        args: [
          // SendParam struct - defines the cross-chain transfer
          {
            dstEid: destChain === 'sepolia'
              ? LAYER_ZERO_ENDPOINTS[CONTRACTS.SEPOLIA.CHAIN_ID]
              : LAYER_ZERO_ENDPOINTS[CONTRACTS.BASE_SEPOLIA.CHAIN_ID],
            to: pad(address, { size: 32 }), // Destination address (padded to 32 bytes)
            amountLD: amountWei,
            minAmountLD: (amountWei * BigInt(95)) / BigInt(100), // Minimum receive with 5% slippage
            extraOptions: '0x0003010011010000000000000000000000000000ea60', // Message execution options
            composeMsg: '0x', // Compose message (empty for simple transfers)
            oftCmd: '0x', // OFT command (empty for standard transfers)
          },
          // MessagingFee struct - quoted fee for LayerZero messaging
          {
            nativeFee: quotedFee, // Native fee quoted earlier
            lzTokenFee: BigInt(0), // No ZRO token payment
          },
          // _refundAddress - receives refunds if ETH is overpaid
          address,
        ],
        value: quotedFee, // Send quoted native fee with transaction
      })
      setTxHash(hash as string)
      toast({
        title: 'Bridge transaction submitted',
        description: `${parseFloat(amount).toFixed(2)} INR-T is being bridged to ${destChain === 'sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia'}. This may take 5-10 minutes.`,
        variant: 'default',
      })
      setAmount('')
      
      // Auto-refresh after 10 seconds to update balances
      setTimeout(() => {
        window.location.reload()
      }, 10000)
    } catch (error) {
      console.error('LayerZero V2 bridge error:', error)
      toast({
        title: 'Bridge failed',
        description: error instanceof Error ? error.message : 'Failed to bridge tokens. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBridgeLoading(false)
      setTxInProgress(false)
    }
  }

  const balanceNum = balance ? parseFloat(formatUnits(balance as bigint, 18)) : 0
  const allowanceNum = allowance ? parseFloat(formatUnits(allowance as bigint, 18)) : 0
  const nativeFeeNum = quotedFee ? parseFloat(formatUnits(quotedFee, 18)) : 0;
  const needsApproval = approvalRequired && amountNum > allowanceNum && amountNum > 0
  const isValidAmount = amountNum > 0 && amountNum <= balanceNum

  if (!mounted) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">From</label>
          <div className="flex gap-2">
            {(['sepolia', 'base'] as const).map((chainName) => (
              <button
                key={chainName}
                onClick={() => handleSourceChainChange(chainName)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                  sourceChain === chainName
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {chainName === 'sepolia' ? 'Ethereum' : 'Base'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">To</label>
          <div className="flex gap-2">
            {(['sepolia', 'base'] as const).map((chainName) => (
              <button
                key={chainName}
                onClick={() => handleDestChainChange(chainName)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                  destChain === chainName
                    ? 'border-secondary bg-secondary/15 text-secondary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {chainName === 'sepolia' ? 'Ethereum' : 'Base'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Available balance</p>
            <p className="text-4xl font-bold tracking-tight text-foreground">{balanceNum.toFixed(2)} INR-T</p>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              Digital Rupee token on {sourceChain === 'sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia'}
            </p>
          </div>
          <button
            onClick={() => setAmount(balanceNum.toString())}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            MAX
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <label htmlFor="amount" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Amount to Bridge
        </label>
        <div className="relative">
          <IndianRupee className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
          <input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-input bg-card py-3 pl-11 pr-16 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
            INR-T
          </span>
        </div>
      </div>

      {isValidAmount && (
        <div className="rounded-lg border border-accent/35 bg-accent/10 p-4">
          {isQuotingFee ? (
            <div className="flex justify-between items-center animate-pulse">
              <span className="text-sm font-bold text-foreground">Estimating network fee...</span>
              <span className="text-sm font-semibold text-muted-foreground">--- ETH</span>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-foreground">Estimated network fee</span>
              <span className="text-sm font-semibold text-muted-foreground">{nativeFeeNum.toFixed(6)} ETH</span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-accent/30 pt-3">
            <span className="text-sm font-bold text-foreground">You will receive</span>
            <span className="text-lg font-black text-secondary">
              {(amountNum * 0.99).toFixed(2)} INR-T
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            (1% RBI processing fee included)
          </p>
        </div>
      )}

      {txInProgress && (
        <div className="rounded-lg border border-accent/35 bg-accent/10 p-4">
          <div className="flex items-center gap-3">
            <Spinner className="h-5 w-5 text-accent" />
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Transaction processing</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {approveLoading ? 'Approving tokens...' : bridgeLoading ? 'Bridging tokens across LayerZero V2...' : 'Waiting for confirmation...'}
              </p>
            </div>
          </div>
          {txHash && (
            <p className="mt-2 break-all font-mono text-xs font-bold text-foreground">
              Hash: {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {isWrongChain && (
          <button
            onClick={() => switchChain({ chainId: sourceContract.CHAIN_ID })}
            className="w-full rounded-lg bg-destructive px-4 py-3 font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            Switch to {sourceChain === 'sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia'}
          </button>
        )}

        {!isWrongChain && (
          <>
            {needsApproval && (
              <button
                onClick={handleApprove}
                disabled={approveLoading || !isValidAmount || txInProgress}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold transition-colors ${
                  !approveLoading && isValidAmount && !txInProgress
                    ? 'cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
                }`}
              >
                {approveLoading && <Spinner className="w-4 h-4 animate-spin" />}
                {approveLoading ? 'Approving...' : 'Approve Tokens'}
              </button>
            )}

            <button
              onClick={handleBridge}
              disabled={(!needsApproval && !isValidAmount) || bridgeLoading || (needsApproval && allowanceNum < amountNum) || isQuotingFee || !quotedFee || txInProgress}
              className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold transition-colors ${
                isValidAmount && (!needsApproval || allowanceNum >= amountNum) && !bridgeLoading && !txInProgress
                  ? 'cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
              }`}
            >
              {bridgeLoading && <Spinner className="w-4 h-4 animate-spin" />}
              {bridgeLoading
                ? 'Bridging...'
                : isQuotingFee
                ? 'Getting Fee Quote...'
                : needsApproval && allowanceNum < amountNum
                ? 'Approve First'
                : 'Bridge Tokens'}
            </button>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-foreground">Digital Rupee INR-T</h3>
          <span className="rounded-md bg-primary/15 px-2 py-1 text-xs font-bold text-primary">Demo </span>
        </div>
        <div className="grid gap-2 text-sm font-semibold text-muted-foreground sm:grid-cols-2">
          <p className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" />Indian Digital Rupee demo currency</p>
          <p className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-accent" />LayerZero V2 OFT protocol</p>
          <p className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />1% bridge fee applied</p>
          <p className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-accent" />Cross-chain delivery in 5-10 minutes</p>
          <p className="flex items-center gap-2"><Coins className="h-4 w-4 text-secondary" />No minimum amount required</p>
          <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-secondary" />Non-custodial and decentralized</p>
        </div>
      </div>
    </div>
  )
}
