import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI numbers builds with the workflow run; locally it is 1.
val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "com.raagavan.vedicclock"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.raagavan.vedicclock"
        minSdk = 26
        targetSdk = 36
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    // Release and debug builds are signed with one fixed key so a new build installs over the old
    // one and keeps its alarms. The key is never committed: CI creates it once and caches it
    // (see .github/workflows/android.yml) and passes it in through these variables. Without them
    // (a local build) the ordinary Android debug key is used.
    val keystorePath = System.getenv("VEDIC_KEYSTORE")
    if (keystorePath != null && file(keystorePath).exists()) {
        signingConfigs {
            create("sideload") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("VEDIC_KEYSTORE_PASSWORD")
                keyAlias = "sideload"
                keyPassword = System.getenv("VEDIC_KEYSTORE_PASSWORD")
            }
        }
    }
    val signing = signingConfigs.findByName("sideload") ?: signingConfigs.getByName("debug")

    buildTypes {
        debug {
            signingConfig = signing
        }
        release {
            signingConfig = signing
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main") {
            // The web app, copied from the repo root at build time (single source of truth).
            assets.srcDir(layout.buildDirectory.dir("generated/webassets"))
        }
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

// index.html, app.html, app-files.json, manifest.json, css/, js/, icons/ -> assets/ (served by WebViewAssetLoader).
val copyWebApp = tasks.register<Sync>("copyWebApp") {
    val repo = rootProject.projectDir.parentFile
    from(repo) {
        include("index.html", "app.html", "app-files.json", "manifest.json", "css/**", "js/**", "icons/**")
    }
    into(layout.buildDirectory.dir("generated/webassets"))
}
tasks.matching { it.name.matches(Regex("merge.*Assets")) || it.name.matches(Regex("lint.*")) || it.name.matches(Regex("generate.*LintModel.*")) }
    .configureEach { dependsOn(copyWebApp) }

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
