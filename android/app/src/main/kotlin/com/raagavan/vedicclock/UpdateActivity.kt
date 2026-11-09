package com.raagavan.vedicclock

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * "Check for updates" (Settings in the page): asks GitHub for the latest release of the app, shows
 * what is new, then downloads the APK and hands it to Android's installer. Releases are tagged
 * "android-<run number>", which is also the app's versionCode.
 */
class UpdateActivity : Activity() {
    private val ui = Handler(Looper.getMainLooper())
    private var dialog: AlertDialog? = null
    private var apk: File? = null
    private var waitingForPermission = false

    private class Release(val build: Int, val name: String, val notes: String, val url: String) {
        /** "1.2.1", taken from the release name; "build N" if it has none. */
        val version: String get() = Regex("""\d+\.\d+\.\d+""").find(name)?.value ?: "build $build"
    }

    /** The release text as plain words: no markdown marks, only the first paragraph, at most 3 lines / 220 characters. */
    private fun plainSummary(body: String): String {
        val first = body.replace("\r", "").trim().split(Regex("\n\\s*\n")).firstOrNull { it.isNotBlank() } ?: return ""
        val lines = first.lines().map { it.replace(Regex("""[*_`#>]"""), "").replace(Regex("""^\s*[-•]\s*"""), "").trim() }.filter { it.isNotEmpty() }.take(3)
        val text = lines.joinToString("\n")
        return if (text.length > 220) text.take(217).trimEnd() + "…" else text
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        check()
    }

    override fun onResume() {
        super.onResume()
        // Back from the "install unknown apps" page: carry on if it was allowed.
        val file = apk
        if (waitingForPermission && file != null && canInstall()) {
            waitingForPermission = false
            install(file)
        }
    }

    override fun onDestroy() {
        dialog?.dismiss()
        super.onDestroy()
    }

    private fun show(title: String, message: String, positive: String? = null, onPositive: (() -> Unit)? = null, negative: String = "Close") {
        if (isFinishing || isDestroyed) return
        dialog?.dismiss()
        val builder = AlertDialog.Builder(this).setTitle(title).setMessage(message).setCancelable(false)
        if (positive != null) builder.setPositiveButton(positive) { _, _ -> onPositive?.invoke() }
        builder.setNegativeButton(negative) { _, _ -> finish() }
        dialog = builder.show()
    }

    private fun installedBuild(): Int =
        if (Build.VERSION.SDK_INT >= 28) packageManager.getPackageInfo(packageName, 0).longVersionCode.toInt()
        else @Suppress("DEPRECATION") packageManager.getPackageInfo(packageName, 0).versionCode

    private fun installedName(): String = packageManager.getPackageInfo(packageName, 0).versionName ?: "?"

    private fun check() {
        show("Check for updates", "Checking for updates…", negative = "Cancel")
        Thread {
            try {
                val release = latest()
                ui.post {
                    if (release.build > installedBuild()) {
                        val notes = plainSummary(release.notes)
                        show("Update available", "Version ${release.version} is available (you have ${installedName()}).\n" + notes,
                            "Update", { download(release) }, "Later")
                    } else show("Up to date", "You have the latest version (${installedName()}).")
                }
            } catch (e: Exception) {
                ui.post { show("Could not check", "Could not reach GitHub. Check your connection and try again.\n\n${e.message ?: ""}", "Retry", { check() }) }
            }
        }.start()
    }

    private fun get(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000
        c.readTimeout = 30_000
        c.setRequestProperty("User-Agent", "VedicWallClock")
        c.setRequestProperty("Accept", "application/vnd.github+json")
        if (c.responseCode !in 200..299) throw java.io.IOException("GitHub answered ${c.responseCode}")
        return c
    }

    private fun latest(): Release {
        val json = JSONObject(get(LATEST).inputStream.bufferedReader().use { it.readText() })
        val tag = json.getString("tag_name")
        val build = tag.substringAfterLast('-').toIntOrNull() ?: throw java.io.IOException("Unexpected release tag $tag")
        val assets = json.getJSONArray("assets")
        var url: String? = null
        for (i in 0 until assets.length()) {
            val a = assets.getJSONObject(i)
            if (a.getString("name").endsWith(".apk")) { url = a.getString("browser_download_url"); break }
        }
        return Release(build, json.optString("name", tag), json.optString("body", ""), url ?: throw java.io.IOException("The latest release has no APK"))
    }

    private fun download(release: Release) {
        show("Downloading", "Downloading version ${release.version}…", negative = "Cancel")
        Thread {
            try {
                val dir = File(cacheDir, "updates").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
                val file = File(dir, "update.apk")
                val c = get(release.url)
                val total = c.contentLengthLong
                var done = 0L
                var lastPct = -1
                c.inputStream.use { input ->
                    file.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                if (pct != lastPct) { lastPct = pct; ui.post { dialog?.setMessage("Downloading version ${release.version}… $pct%") } }
                            }
                        }
                    }
                }
                ui.post { apk = file; install(file) }
            } catch (e: Exception) {
                ui.post { show("Download failed", e.message ?: "The download did not finish.", "Retry", { download(release) }) }
            }
        }.start()
    }

    private fun canInstall(): Boolean = Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls()

    private fun install(file: File) {
        if (!canInstall()) {
            waitingForPermission = true
            show("Allow installing", "Android needs your permission to install the update from this app. Tap Open settings, allow it, then come back.",
                "Open settings", {
                    startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                })
            return
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.updates", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            startActivity(intent)
            finish()
        } catch (e: Exception) {
            show("Could not install", e.message ?: "Android could not open the installer.", "Retry", { install(file) })
        }
    }

    companion object {
        private const val LATEST = "https://api.github.com/repos/raagavan1092/wall-clock/releases/latest"
    }
}
