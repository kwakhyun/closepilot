package io.closepilot.application

import io.closepilot.domain.Channel
import io.closepilot.domain.BasisPoints
import io.closepilot.domain.Order
import io.closepilot.domain.OrderKey
import io.closepilot.domain.Settlement
import io.closepilot.domain.Won
import io.closepilot.domain.reconcile
import io.closepilot.domain.sumWon
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.security.MessageDigest
import java.time.LocalDate

data class VerificationReport(val rows: Int, val matched: Int, val reviewed: Int, val auditEvents: Int, val snapshotHash: String)

/** Canonical object-key ordering shared with the TypeScript export contract. */
fun canonical(value: JsonElement): String = when (value) {
    is JsonObject -> value.entries.sortedBy { it.key }.joinToString(",", "{", "}") {
        "${JsonPrimitive(it.key)}:${canonical(it.value)}"
    }
    is JsonArray -> value.joinToString(",", "[", "]") { canonical(it) }
    else -> value.toString()
}

fun sha256(value: JsonElement): String = MessageDigest.getInstance("SHA-256")
    .digest(canonical(value).toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it.toInt() and 0xff) }

private fun JsonObject.string(key: String): String {
    val value = getValue(key).jsonPrimitive
    require(value.isString) { "$key must be a string" }
    return value.content
}
private fun JsonObject.long(key: String): Long {
    val value = getValue(key).jsonPrimitive
    require(!value.isString) { "$key must be an integer JSON number" }
    return value.longOrNull ?: error("$key must be an integer")
}
private fun JsonObject.money(key: String): Won = Won.of(long(key))
private fun JsonObject.date(key: String): LocalDate = LocalDate.parse(string(key))
private fun JsonObject.optionalDate(key: String): LocalDate? = if (getValue(key) == JsonNull) null else date(key)
private fun JsonObject.array(key: String): JsonArray = getValue(key).jsonArray
private fun JsonObject.key(idField: String): OrderKey = OrderKey(Channel.parse(string("channel")), string(idField))
private fun JsonObject.stringList(key: String): List<String> = array(key).map {
    require(it.jsonPrimitive.isString) { "$key must contain strings" }
    it.jsonPrimitive.content
}

fun verifyClosePackage(text: String): VerificationReport {
    require(text.toByteArray(Charsets.UTF_8).size <= 5_000_000) { "Package exceeds 5 MB" }
    val root = Json.parseToJsonElement(text).jsonObject
    val snapshot = root.getValue("snapshot").jsonObject
    require(snapshot.string("ruleVersion") in SUPPORTED_RULE_VERSIONS) { "Unsupported rule version" }
    val snapshotHash = snapshot.string("hash")
    require(sha256(JsonObject(snapshot.filterKeys { it != "hash" })) == snapshotHash) { "Snapshot checksum mismatch" }
    val inputs = snapshot.getValue("inputs").jsonObject
    val profile = snapshot.getValue("profile").jsonObject
    require(profile.string("period") == snapshot.string("period") && profile.string("asOf") == inputs.string("asOf")) { "Profile period mismatch" }
    require(canonical(profile.getValue("policy").jsonObject.getValue("feeBps")) == canonical(inputs.getValue("feeBps"))) { "Profile policy mismatch" }
    require(inputs.array("orders").size in 1..500 && inputs.array("settlements").size <= 1_000) { "Invalid input size" }
    val orders = inputs.array("orders").map { element ->
        val row = element.jsonObject
        Order(row.key("id"), row.date("date"), row.money("gross"), row.money("refund"), row.string("sourceId"))
    }
    val settlements = inputs.array("settlements").map { element ->
        val row = element.jsonObject
        Settlement(row.string("id"), row.key("orderId"), row.money("gross"), row.money("refund"), row.money("fee"), row.money("net"), row.date("dueDate"), row.optionalDate("paidDate"), row.string("sourceId"))
    }
    require(orders.all { it.date.toString().startsWith(snapshot.string("period")) }) { "Out-of-period order" }
    val sources = snapshot.array("sources").map { it.jsonObject.string("id") }
    require(sources.toSet().size == sources.size) { "Duplicate source metadata" }
    require(orders.all { it.sourceId in sources } && settlements.all { it.sourceId in sources }) { "Unreferenced input source" }
    val policy = inputs.getValue("feeBps").jsonObject
    val feePolicy = Channel.entries.associateWith { channel ->
        val value = policy.long(channel.wireName)
        require(value in 0..10_000) { "Invalid fee policy: ${channel.wireName}" }
        BasisPoints.of(value.toInt())
    }
    val replay = reconcile(orders, settlements, inputs.date("asOf"), feePolicy)
    val reported = snapshot.array("rows").map { it.jsonObject }.associateBy { it.string("key") }
    require(reported.size == snapshot.array("rows").size && reported.size == replay.size) { "Missing or duplicate output rows" }
    require(snapshot.long("rowCount") == replay.size.toLong()) { "Row count mismatch" }
    for (result in replay) {
        val evidence = result.evidence
        val row = reported[evidence.key.wireName] ?: error("Missing result: ${evidence.key.wireName}")
        require(row.string("kind") == result.kind) { "Classification mismatch: ${evidence.key.wireName}" }
        require(row.string("orderId") == evidence.key.id && row.string("channel") == evidence.key.channel.wireName) { "Order identity mismatch" }
        require(row.date("date") == evidence.date) { "Order date mismatch" }
        val amounts = mapOf("gross" to evidence.gross, "refund" to evidence.refund, "expectedFee" to evidence.expectedFee, "actualFee" to evidence.actualFee, "expectedNet" to evidence.expectedNet, "actualNet" to evidence.actualNet, "delta" to evidence.delta)
        for ((field, expected) in amounts) require(row.money(field) == expected) { "$field mismatch: ${evidence.key.wireName}" }
        require(row.stringList("sources").toSet() == evidence.sources) { "Evidence source mismatch" }
        require(row.stringList("settlementIds").sorted() == evidence.settlementIds.sorted()) { "Settlement reference mismatch" }
        require(row.optionalDate("dueDate") == evidence.dueDate && row.optionalDate("paidDate") == evidence.paidDate) { "Settlement date mismatch" }
    }
    require(snapshot.money("gross") == orders.map { it.gross }.sumWon()) { "Gross total mismatch" }
    require(snapshot.money("refunds") == orders.map { it.refund }.sumWon()) { "Refund total mismatch" }
    require(snapshot.money("expectedNet") == replay.map { it.evidence.expectedNet }.sumWon()) { "Expected total mismatch" }
    require(snapshot.money("actualNet") == replay.map { it.evidence.actualNet }.sumWon()) { "Actual total mismatch" }
    require(snapshot.money("delta") == replay.map { it.evidence.delta }.sumWon()) { "Variance total mismatch" }
    val resolutions = snapshot.array("resolutions").map { it.jsonObject }
    val reviewedKeys = resolutions.map { it.string("rowKey") }
    val exceptionKeys = replay.filter { it.kind != "matched" }.map { it.evidence.key.wireName }.toSet()
    require(reviewedKeys.toSet() == exceptionKeys && reviewedKeys.size == exceptionKeys.size) { "Every exception needs exactly one review" }
    require(snapshot.long("reviewedCount") == resolutions.size.toLong()) { "Review count mismatch" }
    for (resolution in resolutions) {
        val row = reported.getValue(resolution.string("rowKey"))
        require(resolution.string("fingerprint") == sha256(row)) { "Stale review fingerprint" }
        require(resolution.string("note").trim().length >= 10 && resolution.string("evidence").trim().length >= 5) { "Missing review evidence" }
        val disposition = when (row.string("kind")) {
            "timing" -> "carry_forward"
            "duplicate" -> "exclude_duplicate"
            else -> "accepted_variance"
        }
        require(resolution.string("disposition") == disposition) { "Invalid review disposition" }
    }
    val audit = root.array("audit")
    require(audit.size in 2..101) { "Invalid audit size" }
    var previousHash = "GENESIS"
    for ((index, element) in audit.withIndex()) {
        val event = element.jsonObject
        require(event.string("id") == "EVT-${(index + 1).toString().padStart(4, '0')}") { "Audit sequence gap" }
        require(event.string("previousHash") == previousHash) { "Audit chain mismatch" }
        require(sha256(JsonObject(event.filterKeys { it != "hash" })) == event.string("hash")) { "Audit event checksum mismatch" }
        previousHash = event.string("hash")
    }
    val closeEvent = audit.last().jsonObject
    require(closeEvent.string("type") == "closed") { "Final audit event must close the period" }
    require(closeEvent.string("at") == snapshot.string("closedAt") && closeEvent.string("actor") == snapshot.string("closedBy")) { "Close provenance mismatch" }
    require(closeEvent.string("detail").contains(snapshotHash.take(16))) { "Close event does not reference this snapshot" }
    return VerificationReport(replay.size, replay.count { it.kind == "matched" }, resolutions.size, audit.size, snapshotHash)
}
