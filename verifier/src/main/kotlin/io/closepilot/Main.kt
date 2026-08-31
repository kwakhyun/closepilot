package io.closepilot

import io.closepilot.application.verifyClosePackage
import java.nio.file.Files
import java.nio.file.Path
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    if (args.size != 1) {
        System.err.println("Usage: closepilot-verifier <close-package.json>")
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
