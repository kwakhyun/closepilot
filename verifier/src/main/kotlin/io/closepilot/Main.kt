package io.closepilot

import io.closepilot.application.verifyClosePackage
import java.nio.file.Files
import java.nio.file.Path
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    if (args.firstOrNull() == "--server") {
        val port = args.getOrNull(1)?.toIntOrNull() ?: 8081
        require(port in 0..65535) { "Port must be between 0 and 65535" }
        val server = VerifierHttpServer(port).start()
        Runtime.getRuntime().addShutdownHook(Thread { server.stop() })
        println("ClosePilot reconciliation service listening on http://127.0.0.1:${server.port}")
        Thread.currentThread().join()
        return
    }
    if (args.size != 1) {
        System.err.println("Usage: closepilot-service <close-package.json> | --server [port]")
        exitProcess(2)
    }
    try {
        val path = Path.of(args.single())
        require(Files.isRegularFile(path) && Files.size(path) <= 5_000_000) { "Expected a JSON file no larger than 5 MB" }
        val result = verifyClosePackage(Files.readString(path))
        println("PASS: ${result.rows} rows, ${result.matched} matches, ${result.reviewed} evidence-backed reviews, ${result.auditEvents} audit events")
        println("SHA-256: ${result.snapshotHash}")
        println("Integrity verified; this is not a signature or authorization to transfer money.")
    } catch (error: Exception) {
        System.err.println("FAIL: ${error.message?.take(250) ?: "Invalid close package"}")
        exitProcess(1)
    }
}
