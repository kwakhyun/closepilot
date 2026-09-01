package io.closepilot.domain

import java.time.LocalDate

enum class Channel(val wireName: String) {
    D2C("d2c"),
    NAVER("naver"),
    COUPANG("coupang");

    companion object {
        fun parse(value: String): Channel = entries.firstOrNull { it.wireName == value }
            ?: error("Unsupported channel: $value")
    }
}

val DEFAULT_FEE_POLICY: Map<Channel, BasisPoints> = mapOf(
    Channel.D2C to BasisPoints.of(330),
    Channel.NAVER to BasisPoints.of(385),
    Channel.COUPANG to BasisPoints.of(880),
)

data class OrderKey(val channel: Channel, val id: String) {
    val wireName: String get() = "${channel.wireName}:$id"
}

data class Order(
    val key: OrderKey,
    val date: LocalDate,
    val gross: Won,
    val refund: Won,
    val sourceId: String,
) {
    init { require(gross.amount >= 0 && refund.amount in 0..gross.amount) { "Invalid order amounts" } }
}

data class Settlement(
    val id: String,
    val orderKey: OrderKey,
    val gross: Won,
    val refund: Won,
    val fee: Won,
    val net: Won,
    val dueDate: LocalDate,
    val paidDate: LocalDate?,
    val sourceId: String,
) {
    init {
        require(gross.amount >= 0 && refund.amount in 0..gross.amount && fee.amount >= 0) {
            "Invalid settlement amounts"
        }
    }
}

enum class ExceptionKind(val wireName: String) {
    MISSING("missing"), ORPHAN("orphan"), DUPLICATE("duplicate"),
    REFUND("refund"), FEE("fee"), AMOUNT("amount"), TIMING("timing")
}

data class Evidence(
    val key: OrderKey,
    val date: LocalDate,
    val gross: Won,
    val refund: Won,
    val expectedFee: Won,
    val actualFee: Won,
    val expectedNet: Won,
    val actualNet: Won,
    val sources: Set<String>,
    val settlementIds: List<String>,
    val dueDate: LocalDate?,
    val paidDate: LocalDate?,
) { val delta: Won get() = actualNet - expectedNet }

/** The type requires the caller to handle a match and an exception separately. */
sealed interface Reconciliation {
    val evidence: Evidence
    val kind: String
    data class Matched(override val evidence: Evidence) : Reconciliation {
        override val kind: String = "matched"
    }
    data class Exception(val reason: ExceptionKind, override val evidence: Evidence) : Reconciliation {
        override val kind: String get() = reason.wireName
    }
}

fun reconcile(
    orders: List<Order>,
    settlements: List<Settlement>,
    asOf: LocalDate,
    feePolicy: Map<Channel, BasisPoints> = DEFAULT_FEE_POLICY,
): List<Reconciliation> {
    val orderMap = orders.associateBy { it.key }
    require(orderMap.size == orders.size) { "Duplicate order key" }
    val groups = settlements.groupBy { it.orderKey }
    val idCounts = settlements.groupingBy { it.orderKey.channel to it.id }.eachCount()
    return (orderMap.keys + groups.keys).map { key ->
        val order = orderMap[key]
        val entries = groups[key].orEmpty()
        val gross = order?.gross ?: Won.ZERO
        val refund = order?.refund ?: Won.ZERO
        val expectedFee = feeFor(
            gross - refund,
            feePolicy[key.channel] ?: error("Missing fee policy: ${key.channel.wireName}"),
        )
        val expectedNet = gross - refund - expectedFee
        val actualGross = entries.map { it.gross }.sumWon()
        val actualRefund = entries.map { it.refund }.sumWon()
        val actualFee = entries.map { it.fee }.sumWon()
        val actualNet = entries.map { it.net }.sumWon()
        val evidence = Evidence(
            key, order?.date ?: entries.first().dueDate, gross, refund,
            expectedFee, actualFee, expectedNet, actualNet,
            (listOfNotNull(order?.sourceId) + entries.map { it.sourceId }).toSet(),
            entries.map { it.id }, entries.maxOfOrNull { it.dueDate },
            if (entries.isNotEmpty() && entries.all { it.paidDate != null }) entries.maxOf { it.paidDate!! } else null,
        )
        val exception = when {
            entries.any { (idCounts[it.orderKey.channel to it.id] ?: 0) > 1 } -> ExceptionKind.DUPLICATE
            order == null -> ExceptionKind.ORPHAN
            entries.isEmpty() -> ExceptionKind.MISSING
            actualRefund != refund -> ExceptionKind.REFUND
            actualGross != gross || entries.any { it.gross - it.refund - it.fee != it.net } -> ExceptionKind.AMOUNT
            actualFee != expectedFee -> ExceptionKind.FEE
            actualNet != expectedNet -> ExceptionKind.AMOUNT
            entries.any { it.paidDate == null || it.paidDate > asOf } -> ExceptionKind.TIMING
            else -> null
        }
        if (exception == null) Reconciliation.Matched(evidence) else Reconciliation.Exception(exception, evidence)
    }
}
