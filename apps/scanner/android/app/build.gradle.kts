import java.io.FileInputStream
import java.util.Properties

// Release signing comes from android/key.properties, which is gitignored — the
// upload key never lives in the repo. Absent (a fresh clone, CI without the
// secret) the release build falls back to debug keys so `flutter run --release`
// still works; it just can't be uploaded, which is the honest outcome.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        FileInputStream(keystorePropertiesFile).use { load(it) }
    }
}

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "events.rueger.technikpool.technikpool_scanner"
    // API 37 ships under Android's minor-SDK-version scheme, so the platform is
    // installed as "android-37.0" rather than "android-37". Naming the minor
    // version is what lets AGP resolve it; compileSdk alone looks for
    // "android-37" and fails. Required by flutter_secure_storage 11.
    compileSdk = 37
    compileSdkMinor = 0
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "events.rueger.technikpool.technikpool_scanner"
        // flutter_secure_storage 11 requires 24, and it would win in manifest
        // merging anyway — stated here so the real floor is visible rather than
        // an implicit consequence of a plugin's manifest.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties.getProperty("keyAlias")
            keyPassword = keystoreProperties.getProperty("keyPassword")
            storePassword = keystoreProperties.getProperty("storePassword")
            keystoreProperties.getProperty("storeFile")?.let { storeFile = file(it) }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
