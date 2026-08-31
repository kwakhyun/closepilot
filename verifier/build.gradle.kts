plugins {
    kotlin("jvm") version "2.4.10"
    application
}

repositories { mavenCentral() }

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.12.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.12.2")
}

kotlin { jvmToolchain(21) }
// A caller may choose an ASCII build path for Windows JVM argument-file compatibility.
providers.environmentVariable("CLOSEPILOT_VERIFIER_BUILD_DIR").orNull?.let {
    layout.buildDirectory.set(file(it))
}
application { mainClass.set("io.closepilot.MainKt") }
tasks.test { useJUnitPlatform() }
