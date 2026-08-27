// Only `core:api` for now: it is plain JVM Kotlin, so it builds and tests
// without the Android SDK — the same trick that keeps MilmilKit unit-testable
// on macOS. The Compose app module joins in Phase 1.
rootProject.name = "milmil-android"

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        google()
    }
}

include(":core:api")
