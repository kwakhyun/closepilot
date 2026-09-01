package io.closepilot

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import io.closepilot.application.verifyClosePackage
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets

private const val MAX_BODY_BYTES = 5_000_000

class VerifierHttpServer(port: Int = 8081) {
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", port), 0)
    val port: Int get() = server.address.port

    init {
        server.createContext("/health") { exchange ->
            if (exchange.requestMethod != "GET") exchange.sendJson(405, buildJsonObject { put("error", "METHOD_NOT_ALLOWED") }.toString())
            else exchange.sendJson(200, buildJsonObject { put("status", "ok"); put("service", "closepilot-verifier") }.toString())
        }
        server.createContext("/verify") { exchange -> verify(exchange) }
    }

    fun start(): VerifierHttpServer {
        server.start()
        return this
    }

    fun stop() = server.stop(0)

    private fun verify(exchange: HttpExchange) {
        if (exchange.requestMethod != "POST") {
            exchange.sendJson(405, buildJsonObject { put("error", "METHOD_NOT_ALLOWED") }.toString())
            return
        }
        if (!exchange.requestHeaders.getFirst("Content-Type").orEmpty().lowercase().startsWith("application/json")) {
            exchange.sendJson(415, buildJsonObject { put("error", "JSON_REQUIRED") }.toString())
            return
        }
        val bytes = exchange.requestBody.use { it.readNBytes(MAX_BODY_BYTES + 1) }
        if (bytes.size > MAX_BODY_BYTES) {
            exchange.sendJson(413, buildJsonObject { put("error", "BODY_TOO_LARGE") }.toString())
            return
        }
        try {
            val report = verifyClosePackage(String(bytes, StandardCharsets.UTF_8))
            exchange.sendJson(200, buildJsonObject {
                put("valid", true)
                put("rows", report.rows)
                put("matched", report.matched)
                put("reviewed", report.reviewed)
                put("auditEvents", report.auditEvents)
                put("snapshotHash", report.snapshotHash)
                put("notice", "Integrity verified; this is not a signature or authorization to transfer money.")
            }.toString())
        } catch (error: Exception) {
            exchange.sendJson(422, buildJsonObject {
                put("valid", false)
                put("error", "VERIFICATION_FAILED")
                put("message", error.message?.take(250) ?: "Invalid close package")
            }.toString())
        }
    }
}

private fun HttpExchange.sendJson(status: Int, body: String) {
    val bytes = body.toByteArray(StandardCharsets.UTF_8)
    responseHeaders.set("Content-Type", "application/json; charset=utf-8")
    responseHeaders.set("Cache-Control", "no-store")
    sendResponseHeaders(status, bytes.size.toLong())
    responseBody.use { it.write(bytes) }
}
