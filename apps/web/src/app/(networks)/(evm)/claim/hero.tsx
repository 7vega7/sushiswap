'use client'

import { Card, CardContent, CardHeader, SkeletonText } from '@sushiswap/ui'
import { type FC, useMemo } from 'react'
import { useClaimableRewards } from 'src/lib/hooks/react-query'
import { formatUSD } from 'sushi/format'
import { useAccount } from 'wagmi'

export const Hero: FC = () => {
  const { address } = useAccount()
  const { data: rewardsData } = useClaimableRewards({ account: address })
  const totalFeesUSD = 0
  const isFeesLoading = true

  const totalRewardsUSD = useMemo(() => {
    return rewardsData
      ? Object.values(rewardsData).reduce(
          (accum, { totalRewardsUSD }) => accum + totalRewardsUSD,
          0,
        )
      : undefined
  }, [rewardsData])

  return (
    <section className="flex flex-col gap-6">
      <span className="text-5xl font-bold">Claim</span>
      <span className="text-xl max-w-[720px] text-muted-foreground">
        Instead of claiming fees and rewards per V3 liquidity position, press
        claim to claim your rewards for all your V3 liquidity positions on a
        single network.
      </span>
      <div className="flex justify-between flex-wrap gap-5">
        <Card className="flex-1">
          <CardHeader className="!p-5 !pb-3">
            <span className="font-medium text-sm text-muted-foreground">
              Claimable V3 Fees
            </span>
          </CardHeader>
          <CardContent>
            {/* TODO:  {typeof totalFeesUSD === 'number' ? ( */}
            {totalFeesUSD ? (
              <span className="font-bold text-lg">
                {formatUSD(totalFeesUSD)}
              </span>
            ) : (
              <span className="w-24">
                <SkeletonText fontSize="lg" />
              </span>
            )}
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardHeader className="!p-5 !pb-3">
            <span className="font-medium text-sm text-muted-foreground">
              Claimable Rewards
            </span>
          </CardHeader>
          <CardContent>
            {typeof totalRewardsUSD === 'number' ? (
              <span className="font-bold text-lg">
                {formatUSD(totalRewardsUSD)}
              </span>
            ) : (
              <span className="w-24">
                <SkeletonText fontSize="lg" />
              </span>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
