package com.raagavan.vedicclock

import org.json.JSONObject

/** Pure helpers for [WebSource] (no Android classes, so they run in JVM unit tests). */
object WebPolicy {
    /** Which web files are updated from the site: everything except the boot shell and the icons. */
    fun isManaged(path: String): Boolean = path.isNotEmpty() && path != "index.html" && !path.startsWith("icons/")

    /** The saved copy of the site is only trusted if it is complete and was saved by this very app version
     *  (a newer APK carries web files at least as new as any older saved copy). */
    fun cacheUsable(savedForVersion: Int, appVersion: Int): Boolean = savedForVersion == appVersion && appVersion > 0

    /** Every file the page loads: those listed in app-files.json plus the data file app.js fetches. */
    fun expectedFiles(appFilesJson: String): Set<String> {
        val o = JSONObject(appFilesJson)
        val out = linkedSetOf("app-files.json", "js/data/panchanga-data.json")
        o.optString("html").takeIf { it.isNotEmpty() }?.let { out.add(it) }
        for (key in listOf("css", "js")) {
            val a = o.optJSONArray(key) ?: continue
            for (i in 0 until a.length()) out.add(a.getString(i))
        }
        return out
    }

    fun mimeFor(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js" -> "text/javascript"
        "json" -> "application/json"
        "css" -> "text/css"
        "png" -> "image/png"
        "svg" -> "image/svg+xml"
        else -> "application/octet-stream"
    }

    fun isText(mime: String) = mime.startsWith("text/") || mime == "application/json"
}
