plugins {
    id("com.android.application") version "8.7.3"
    kotlin("android") version "2.0.21"
}

android {
    namespace = "nl.hopbites.terminal"
    compileSdk = 35

    defaultConfig {
        applicationId = "nl.hopbites.terminal"
        // De Ultra draait Android 11.
        minSdk = 30
        targetSdk = 35
        versionCode = 1
        versionName = "0.1-proef"
    }

    // myPOS' PosAuth leest de handtekening bij het installeren. Beide schema's
    // aan, zoals hun troubleshootinggids voorschrijft — een APK met alleen V2
    // (of met een handgemaakt certificaat) wordt geweigerd met
    // INSTALL_PARSE_FAILED_CERTIFICATE_ENCODING.
    signingConfigs {
        create("hopbites") {
            // Debug-sleutel van Android Studio: goed genoeg om te installeren,
            // en bij productie zet myPOS er toch hun eigen handtekening op.
            storeFile = file(System.getProperty("user.home") + "/.android/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("hopbites")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    packaging {
        // Voorschrift van myPOS voor apps op hun toestellen.
        jniLibs { useLegacyPackaging = true }
    }
}

dependencies {
    implementation(project(":core"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
