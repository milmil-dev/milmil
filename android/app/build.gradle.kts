plugins {
    // AGP 9 has Kotlin built in and registers the `kotlin` extension itself —
    // applying kotlin.android as well fails with a duplicate extension.
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "dev.milmil.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.milmil.android"
        // API 26 keeps the app on every Android still receiving apps; nothing
        // in the client needs newer platform APIs yet.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.20"
    }

    buildFeatures { compose = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
    debugImplementation(libs.compose.ui.tooling)
}
