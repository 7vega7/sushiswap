import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { API_BASE_URL } from 'src/lib/swap/api-base-url'
import { slippageAmount } from 'sushi/calculate'
import { isRouteProcessor7ChainId, isWNativeSupported } from 'sushi/config'
import { Amount, Native, Price, type Type } from 'sushi/currency'
import { Fraction, Percent, ZERO } from 'sushi/math'
import { isLsd, isStable, isWrapOrUnwrap } from 'sushi/router'
import { stringify, zeroAddress } from 'viem'
import { usePrices } from '~evm/_common/ui/price-provider/price-provider/use-prices'
import { apiAdapter02To01 } from './apiAdapter'
import type { UseTradeParams, UseTradeQuerySelect } from './types'
import { tradeValidator02 } from './validator02'

export const useTradeQuoteQuery = (
  {
    chainId,
    fromToken,
    toToken,
    amount,
    gasPrice = 50n,
    slippagePercentage,
    recipient,
    source,
    enabled,
  }: UseTradeParams,
  select: UseTradeQuerySelect,
) => {
  return useQuery({
    queryKey: [
      'getTradeQuote',
      {
        chainId,
        currencyA: fromToken,
        currencyB: toToken,
        amount,
        slippagePercentage,
        gasPrice,
        source,
      },
    ],
    queryFn: async () => {
      const params = new URL(`${API_BASE_URL}/quote/v7/${chainId}`)
      params.searchParams.set('referrer', 'sushi')
      params.searchParams.set(
        'tokenIn',
        `${
          fromToken?.isNative
            ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
            : fromToken?.wrapped.address
        }`,
      )
      params.searchParams.set(
        'tokenOut',
        `${
          toToken?.isNative
            ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
            : toToken?.wrapped.address
        }`,
      )
      params.searchParams.set('amount', `${amount?.quotient.toString()}`)
      params.searchParams.set('maxSlippage', `${+slippagePercentage / 100}`)
      params.searchParams.set('fee', '0.0025')
      params.searchParams.set('feeBy', 'output')

      const res = await fetch(params.toString())
      const json = await res.json()
      const resp2 = tradeValidator02.parse(json)

      const resp1 = apiAdapter02To01(
        resp2,
        fromToken as Type,
        toToken as Type,
        recipient,
      )

      return resp1
    },
    refetchOnWindowFocus: true,
    refetchInterval: 2500,
    gcTime: 0, // the length of time before inactive data gets removed from the cache
    retry: false, // dont retry on failure, immediately fallback
    select,
    enabled:
      enabled && Boolean(chainId && fromToken && toToken && amount && gasPrice),
    queryKeyHashFn: stringify,
  })
}

export const useTradeQuote = (variables: UseTradeParams) => {
  const {
    chainId,
    fromToken,
    toToken,
    amount,
    slippagePercentage,
    // carbonOffset,
    gasPrice,
    tokenTax,
  } = variables
  const { data: prices } = usePrices({
    chainId,
  })

  const [nativePrice, tokenOutPrice] = useMemo(() => {
    const result = [new Fraction(0), undefined]

    if (prices) {
      if (
        isWNativeSupported(chainId) &&
        Native.onChain(chainId).wrapped.address !== zeroAddress
      ) {
        result[0] = prices.getFraction(Native.onChain(chainId).wrapped.address)
      }

      if (toToken) {
        result[1] = prices.getFraction(toToken.wrapped.address)
      }
    }

    return result
  }, [chainId, prices, toToken])

  const select: UseTradeQuerySelect = useCallback(
    (data) => {
      if (
        isRouteProcessor7ChainId(chainId) &&
        data &&
        amount &&
        data.route &&
        fromToken &&
        toToken
      ) {
        const amountIn = Amount.fromRawAmount(fromToken, data.route.amountInBI)
        const amountOut = Amount.fromRawAmount(
          toToken,
          new Fraction(data.route.amountOutBI).multiply(
            tokenTax ? new Percent(1).subtract(tokenTax) : 1,
          ).quotient,
        )
        const minAmountOut = data.args?.amountOutMin
          ? Amount.fromRawAmount(toToken, data.args.amountOutMin)
          : Amount.fromRawAmount(
              toToken,
              slippageAmount(
                Amount.fromRawAmount(toToken, data.route.amountOutBI),
                new Percent(Math.floor(+slippagePercentage * 100), 10_000),
              )[0],
            )

        // const isOffset = chainId === ChainId.POLYGON && carbonOffset

        // if (writeArgs && isOffset && chainId === ChainId.POLYGON) {
        //   writeArgs = [
        //     '0xbc4a6be1285893630d45c881c6c343a65fdbe278',
        //     20000000000000000n,
        //     ...writeArgs,
        //   ]
        //   value = (fromToken.isNative ? writeArgs[3] : 0n) + 20000000000000000n
        // }

        // const value =
        //   fromToken.isNative && data?.args?.amountIn
        //     ? data.args.amountIn
        //     : undefined

        const gasSpent = gasPrice
          ? Amount.fromRawAmount(
              Native.onChain(chainId),
              gasPrice * BigInt(data.route.gasSpent * 1.2),
            )
          : undefined

        return {
          swapPrice: amountOut.greaterThan(ZERO)
            ? new Price({
                baseAmount: amount,
                quoteAmount: amountOut,
              })
            : undefined,
          priceImpact: data.route.priceImpact
            ? new Percent(Math.round(data.route.priceImpact * 10000), 10000)
            : new Percent(0),
          amountIn,
          amountOut,
          minAmountOut,
          gasSpent: gasSpent?.toSignificant(4),
          gasSpentUsd:
            nativePrice && gasSpent
              ? gasSpent.multiply(nativePrice.asFraction).toSignificant(4)
              : undefined,
          fee:
            !isWrapOrUnwrap({ fromToken, toToken }) &&
            !isStable({ fromToken, toToken }) &&
            !isLsd({ fromToken, toToken })
              ? `${tokenOutPrice ? '$' : ''}${minAmountOut
                  .multiply(new Percent(25, 10000))
                  .multiply(tokenOutPrice ? tokenOutPrice.asFraction : 1)
                  .toSignificant(4)} ${!tokenOutPrice ? toToken.symbol : ''}`
              : '$0',
          route: data.route,
          tx: undefined,
          tokenTax,
        }
      }

      return {
        swapPrice: undefined,
        priceImpact: undefined,
        amountIn: undefined,
        amountOut: undefined,
        minAmountOut: undefined,
        gasSpent: undefined,
        gasSpentUsd: undefined,
        fee: undefined,
        route: undefined,
        tx: undefined,
        tokenTax: undefined,
      }
    },
    [
      // carbonOffset,
      amount,
      chainId,
      fromToken,
      nativePrice,
      tokenOutPrice,
      slippagePercentage,
      toToken,
      gasPrice,
      tokenTax,
    ],
  )

  return useTradeQuoteQuery(variables, select)
}
