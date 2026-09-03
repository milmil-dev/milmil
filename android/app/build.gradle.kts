plugins {
    // AGP 9 has Kotlin built in and registers the `kotlin` extension itself —
    // applying kotlin.android as well fails with a duplicate extension.
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// release-please rewrites the marked line below on every release, keeping the
// app's version in step with the server, web and macOS clients (see
// release-please-config.json). Android also needs a monotonically increasing
// integer for upgrades to install, so derive it rather than bump it by hand:
// 0.1.20 → 1020, 1.2.3 → 1002003.
val milmilVersion = "0.1.20" // x-release-please-version
val milmilVersionCode = milmilVersion.split(".").map(String::toInt).let { (major, minor, patch) ->
    major * 1_000_000 + minor * 1_000 + patch
}

// Release signing comes from the environment so the keystore never lives in
// the tree: release-android.yml decodes it from GitHub Secrets, and
// scripts/make-keystore.sh creates one (and the secrets) locally. Without
// MILMIL_ANDROID_KEYSTORE the release build stays unsigned, which is fine for
// assembleDebug in CI and wrong for anything users install.
val releaseKeystore = System.getenv("MILMIL_ANDROID_KEYSTORE")?.takeIf { it.isNotBlank() }

android {
    namespace = "dev.milmil.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.milmil.android"
        // API 26 keeps the app on every Android still receiving apps; nothing
        // in the client needs newer platform APIs yet.
        minSdk = 26
        targetSdk = 36
        versionCode = milmilVersionCode
        versionName = milmilVersion
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("MILMIL_ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MILMIL_ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("MILMIL_ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildFeatures { compose = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseKeystore != null) signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    implementation(project(":core:api"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.coil.compose)
    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.mlkit.barcode)
    implementation(libs.accompanist.permissions)
    implementation(libs.security.crypto)
    debugImplementation(libs.compose.ui.tooling)
    testImplementation(libs.kotlin.test.junit5)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test> { useJUnitPlatform() }
