package io.closepilot.application

import io.closepilot.domain.BasisPoints
import io.closepilot.domain.Channel
import io.closepilot.domain.Order
import io.closepilot.domain.OrderKey
import io.closepilot.domain.Reconciliation
import io.closepilot.domain.Settlement
import io.closepilot.domain.Won
import io.closepilot.domain.reconcile
import io.closepilot.domain.sumWon
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.time.LocalDate
import kotlin.math.abs

const val RULE_VERSION = "krw-net-v1.2.0"
val SUPPORTED_RULE_VERSIONS = setOf("krw-net-v1.1.0", RULE_VERSION)

private fun JsonObject.requiredString(key: String): String {
    val value = getValue(key).jsonPrimitive
    require(value.isString) { "$key must be a string" }
    return value.content
}

private fun JsonObject.requiredLong(key: String): Long {
    val value = getValue(key).jsonPrimitive
    require(!value.isString) { "$key must be an integer JSON number" }
    return value.longOrNull ?: error("$key must be an integer")
}

private fun JsonObject.requiredMoney(key: String): Won = Won.of(requiredLong(key))
private fun JsonObject.requiredDate(key: String): LocalDate = LocalDate.parse(requiredString(key))
private fun JsonObject.optionalDateValue(key: String): LocalDate? =
    if (getValue(key) == JsonNull) null else requiredDate(key)
private fun JsonObject.requiredArray(key: String): JsonArray = getValue(key).jsonArray
private fun JsonObject.orderKey(idField: String): OrderKey =
    OrderKey(Channel.parse(requiredString("channel")), requiredString(idField))

/** Core application use case shared by the REST service and CI contract tests. */
fun reconcileRequest(text: String): JsonObject {
    require(text.toByteArray(Charsets.UTF_8).size <= 5_000_000) { "Request exceeds 5 MB" }
    val root = Json.parseToJsonElement(text).jsonObject
    val ruleVersion = root.requiredString("ruleVersion")
    require(ruleVersion in SUPPORTED_RULE_VERSIONS) { "Unsupported rule version" }
    val ordersJson = root.requiredArray("orders")
    val settlementsJson = root.requiredArray("settlements")
    require(ordersJson.size <= 500 && settlementsJson.size <= 1_000) { "Invalid input size" }
    require(ordersJson.isNotEmpty() || settlementsJson.isNotEmpty()) { "At least one input row is required" }
    val policyJson = root.getValue("feeBps").jsonObject
    val feePolicy = Channel.entries.associateWith { channel ->
        val value = policyJson.requiredLong(channel.wireName)
        require(value in 0..10_000) { "Invalid fee policy: ${channel.wireName}" }
        BasisPoints.of(value.toInt())
    }
    val orders = ordersJson.map { element ->
        val row = element.jsonObject
        Order(
            row.orderKey("id"),
            row.requiredDate("date"),
            row.requiredMoney("gross"),
            row.requiredMoney("refund"),
            row.requiredString("sourceId"),
        )
    }
    val settlements = settlementsJson.map { element ->
        val row = element.jsonObject
        Settlement(
            row.requiredString("id"),
            row.orderKey("orderId"),
            row.requiredMoney("gross"),
            row.requiredMoney("refund"),
            row.requiredMoney("fee"),
            row.requiredMoney("net"),
            row.requiredDate("dueDate"),
            row.optionalDateValue("paidDate"),
            row.requiredString("sourceId"),
        )
    }
    val rows = reconcile(orders, settlements, root.requiredDate("asOf"), feePolicy).sortedWith(
        compareBy<Reconciliation> { if (it.kind == "matched") 1 else 0 }
            .thenByDescending { abs(it.evidence.delta.amount) }
            .thenBy { it.evidence.key.wireName },
    )
    return buildJsonObject {
        put("ruleVersion", ruleVersion)
        put("engine", "kotlin-jvm")
        put("rows", buildJsonArray {
            rows.forEach { result ->
                val evidence = result.evidence
                add(buildJsonObject {
                    put("key", evidence.key.wireName)
                    put("orderId", evidence.key.id)
                    put("channel", evidence.key.channel.wireName)
                    put("date", evidence.date.toString())
                    put("gross", evidence.gross.amount)
                    put("refund", evidence.refund.amount)
                    put("expectedFee", evidence.expectedFee.amount)
                    put("actualFee", evidence.actualFee.amount)
                    put("expectedNet", evidence.expectedNet.amount)
                    put("actualNet", evidence.actualNet.amount)
                    put("delta", evidence.delta.amount)
                    put("kind", result.kind)
                    put("sources", buildJsonArray { evidence.sources.forEach { add(it) } })
                    put("settlementIds", buildJsonArray { evidence.settlementIds.forEach { add(it) } })
                    if (evidence.dueDate == null) put("dueDate", JsonNull)
                    else put("dueDate", evidence.dueDate.toString())
                    if (evidence.paidDate == null) put("paidDate", JsonNull)
                    else put("paidDate", evidence.paidDate.toString())
                })
            }
        })
        put("summary", buildJsonObject {
            put("total", rows.size)
            put("matched", rows.count { it.kind == "matched" })
            put("issues", rows.count { it.kind != "matched" })
            put("expectedNet", rows.map { it.evidence.expectedNet }.sumWon().amount)
            put("actualNet", rows.map { it.evidence.actualNet }.sumWon().amount)
            put("delta", rows.map { it.evidence.delta }.sumWon().amount)
        })
    }
}
