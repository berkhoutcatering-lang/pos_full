// Hop Terminal — de app op de myPOS Ultra.
//
// Twee modules met opzet: `core` is gewone JVM-Kotlin en bevat alles wat
// interessant is (de lijn met de Pi, de wachtrij, de betaallus), zodat het
// zonder Android-toolchain en zonder toestel te testen is. `app` is de dunne
// Android-schil eromheen.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "hop-terminal"
include(":core")
include(":app")
