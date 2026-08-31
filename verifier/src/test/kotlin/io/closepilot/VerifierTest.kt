package io.closepilot

import io.closepilot.application.sha256
import io.closepilot.application.verifyClosePackage
import io.closepilot.domain.BasisPoints
import io.closepilot.domain.Channel
import io.closepilot.domain.Order
import io.closepilot.domain.OrderKey
import io.closepilot.domain.Reconciliation
import io.closepilot.domain.Settlement
import io.closepilot.domain.Won
import io.closepilot.domain.feeFor
import io.closepilot.domain.reconcile
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs

class VerifierTest {
    private val fixture: String get() = Files.readString(Path.of("../fixtures/closed-package.json"))

    @Test fun `rounding stays exact at the monetary boundary`() {
        assertEquals(2L, feeFor(Won.of(15), BasisPoints.of(1000)).amount)
        assertEquals(38_500_000_000L, feeFor(Won.of(1_000_000_000_000L), BasisPoints.of(385)).amount)
        assertFailsWith<IllegalArgumentException> { Won.of(Won.MAX + 1) }
        assertFailsWith<IllegalArgumentException> { BasisPoints.of(10001) }
    }
    @Test fun `independently replays the TypeScript close package`() {
        val result = verifyClosePackage(fixture)
        assertEquals(128, result.rows)
        assertEquals(120, result.matched)
        assertEquals(8, result.reviewed)
        assertEquals(11, result.auditEvents)
    }
    @Test fun `changing an export breaks its checksum`() {
        assertFailsWith<IllegalArgumentException> { verifyClosePackage(fixture.replaceFirst("\"rowCount\": 128", "\"rowCount\": 127")) }
    }
    @Test fun `a recomputed checksum cannot conceal wrong arithmetic`() {
        val root = Json.parseToJsonElement(fixture).jsonObject
        val snapshot = root.getValue("snapshot").jsonObject
        val rows = snapshot.getValue("rows").jsonArray.toMutableList()
        rows[0] = JsonObject(rows[0].jsonObject + ("expectedNet" to JsonPrimitive(1)))
        val modified = JsonObject(snapshot.filterKeys { it != "hash" } + ("rows" to JsonArray(rows)))
        val withHash = JsonObject(modified + ("hash" to JsonPrimitive(sha256(modified))))
        val forged = JsonObject(root + ("snapshot" to withHash))
        assertFailsWith<IllegalArgumentException> { verifyClosePackage(forged.toString()) }
    }
    @Test fun `tampering with approval evidence breaks the audit chain`() {
        assertFailsWith<IllegalArgumentException> { verifyClosePackage(fixture.replaceFirst("가상 브랜드 LUMIÈRE", "변조된 브랜드 LUMIÈRE")) }
    }
    @Test fun `duplicate settlements remain an explicit typed exception`() {
        val key = OrderKey(Channel.D2C, "A-1")
        val date = LocalDate.of(2026, 8, 31)
        val order = Order(key, date, Won.of(100000), Won.ZERO, "O")
        val settlement = Settlement("S-1", key, Won.of(100000), Won.ZERO, Won.of(3300), Won.of(96700), date, date, "S")
        val result = reconcile(listOf(order), listOf(settlement, settlement), date).single()
        assertIs<Reconciliation.Exception>(result)
        assertEquals("duplicate", result.kind)
        assertEquals(193400L, result.evidence.actualNet.amount)
    }
}
