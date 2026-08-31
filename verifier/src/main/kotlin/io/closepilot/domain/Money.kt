package io.closepilot.domain

import java.math.BigInteger

/** A bounded, integral KRW value. No floating point enters the domain. */
@JvmInline
value class Won private constructor(val amount: Long) {
    operator fun plus(other: Won): Won = of(Math.addExact(amount, other.amount))
    operator fun minus(other: Won): Won = of(Math.subtractExact(amount, other.amount))

    companion object {
        const val MAX: Long = 1_000_000_000_000L
        val ZERO: Won = Won(0)
        fun of(amount: Long): Won {
            require(amount in -MAX..MAX) { "KRW amount exceeds the domain limit" }
            return Won(amount)
        }
    }
}

@JvmInline
value class BasisPoints private constructor(val value: Int) {
    companion object {
        fun of(value: Int): BasisPoints {
            require(value in 0..10_000) { "Invalid basis-point policy" }
            return BasisPoints(value)
        }
    }
}

fun feeFor(netSales: Won, rate: BasisPoints): Won {
    require(netSales.amount >= 0) { "Net sales cannot be negative" }
    val fee = BigInteger.valueOf(netSales.amount)
        .multiply(BigInteger.valueOf(rate.value.toLong()))
        .add(BigInteger.valueOf(5_000))
        .divide(BigInteger.valueOf(10_000))
    return Won.of(fee.longValueExact())
}

fun Iterable<Won>.sumWon(): Won = fold(Won.ZERO) { total, amount -> total + amount }
