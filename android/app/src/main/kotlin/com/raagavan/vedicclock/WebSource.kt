package com.raagavan.vedicclock

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Serves the web app's files to the WebView. The page always runs at https://appassets.androidplatform.net/
 * (one origin, so its saved alarms persist and the alarm bridge is never exposed to a remote site); this
 * class decides where each file's bytes come from:
 *
 *  1. the site (GitHub Pages) - fresh, so a push to the repo reaches the phone with no new APK;
 *  2. else the last complete copy saved from the site (only if saved by this app version);
 *  3. else the copy bundled in the APK - always there, so the app works offline from the first launch.
 *
 * The choice is made once per page load, when app-files.json is asked for: if the site answers, the load
 * is in REMOTE mode; if not, OFFLINE (steps 2/3). If the site fails part-way through a load it switches to OFFLINE.
 * index.html (the boot shell) and the icons always come from the APK.
 */
class WebSource(private val ctx: Context, private val bundled: WebViewAssetLoader, private val remoteEnabled: Boolean) {
    enum class Mode { UNDECIDED, REMOTE, OFFLINE }

    @Volatile var mode = if (remoteEnabled) Mode.UNDECIDED else Mode.OFFLINE
        private set

    private val dir = File(ctx.filesDir, "web")
    private val appVersion: Int = runCatching {
        @Suppress("DEPRECATION") ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionCode
    }.getOrDefault(0)
    private val prefs = Store.prefs(ctx)
    private var expected: Set<String> = emptySet()
    private val fetched = mutableSetOf<String>()

    /** Called on a WebView thread for every request. */
    fun intercept(uri: Uri): WebResourceResponse? {
        val path = uri.path.orEmpty().removePrefix("/")
        if (!WebPolicy.isManaged(path)) return bundled.shouldInterceptRequest(uri)
        if (path == "app-files.json") decide()
        if (mode == Mode.REMOTE) {
            val bytes = download(path)
            if (bytes != null) {
                save(path, bytes)
                return response(path, bytes)
            }
            Log.w(TAG, "The site failed on $path: serving the rest of this load offline")
            mode = Mode.OFFLINE
        }
        return fromCacheOrBundle(path)
    }

    /** Stop using the site for the rest of this session (the page it served did not start). */
    fun forceBundled() {
        mode = Mode.OFFLINE
        prefs.edit().putInt(PREF_CACHE_VERSION, -1).apply()
    }

    @Synchronized
    private fun decide() {
        if (!remoteEnabled || mode == Mode.OFFLINE && !remoteEnabled) { mode = Mode.OFFLINE; return }
        // Every page load starts afresh: ask the site again (it may have been unreachable last time).
        prefs.edit().putInt(PREF_CACHE_VERSION, -1).apply()
        fetched.clear()
        val manifest = download("app-files.json")
        if (manifest == null) { mode = Mode.OFFLINE; return }
        expected = runCatching { WebPolicy.expectedFiles(String(manifest, Charsets.UTF_8)) }.getOrElse { emptySet() }
        mode = if (expected.isEmpty()) Mode.OFFLINE else Mode.REMOTE
    }

    private fun download(path: String): ByteArray? = try {
        val conn = URL(BASE + path).openConnection() as HttpURLConnection
        conn.useCaches = false
        conn.connectTimeout = 4_000
        conn.readTimeout = 8_000
        conn.setRequestProperty("Cache-Control", "no-cache")
        try {
            if (conn.responseCode == 200) conn.inputStream.use { it.readBytes() } else null
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        Log.i(TAG, "Could not reach the site for $path: ${e.javaClass.simpleName}")
        null
    }

    @Synchronized
    private fun save(path: String, bytes: ByteArray) {
        runCatching {
            val file = File(dir, path)
            file.parentFile?.mkdirs()
            file.writeBytes(bytes)
            fetched.add(path)
            // The copy is trustworthy only once every file of this load has been saved.
            if (expected.isNotEmpty() && fetched.containsAll(expected)) {
                prefs.edit().putInt(PREF_CACHE_VERSION, appVersion).apply()
            }
        }
    }

    private fun fromCacheOrBundle(path: String): WebResourceResponse? {
        if (WebPolicy.cacheUsable(prefs.getInt(PREF_CACHE_VERSION, -1), appVersion)) {
            val file = File(dir, path)
            if (file.isFile) return response(path, file.readBytes())
        }
        return bundled.shouldInterceptRequest(Uri.parse("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/$path"))
    }

    private fun response(path: String, bytes: ByteArray): WebResourceResponse {
        val mime = WebPolicy.mimeFor(path)
        return WebResourceResponse(mime, if (WebPolicy.isText(mime)) "utf-8" else null, ByteArrayInputStream(bytes))
    }

    companion object {
        private const val TAG = "VedicWeb"
        /** Where the site is published (GitHub Pages of this repo). */
        const val BASE = "https://raagavan1092.github.io/wall-clock/"
        private const val PREF_CACHE_VERSION = "web_cache_version"
        const val PREF_WEB_UPDATES = "web_updates"
    }
}
