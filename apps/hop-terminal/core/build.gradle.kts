plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}

// Handmatige proef tegen een draaiende pi-bridge — zie LiveBridgeDemo.
tasks.register<JavaExec>("demo") {
    group = "verification"
    description = "Draait de app-lus tegen een echte pi-bridge, met de stub als kaartlezer."
    classpath = sourceSets["test"].runtimeClasspath
    mainClass.set("nl.hopbites.terminal.LiveBridgeDemo")
}

tasks.test {
    useJUnitPlatform()
    testLogging { events("passed", "failed") }
}
