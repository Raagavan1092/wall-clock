package com.raagavan.vedicclock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebPolicyTest {
    @Test fun `the shell and icons always come from the APK`() {
        assertFalse(WebPolicy.isManaged("index.html"))
        assertFalse(WebPolicy.isManaged("icons/icon-192.png"))
        assertFalse(WebPolicy.isManaged(""))
        assertTrue(WebPolicy.isManaged("app-files.json"))
        assertTrue(WebPolicy.isManaged("js/alarms.js"))
    }

    @Test fun `a saved copy is only used by the app version that saved it`() {
        assertTrue(WebPolicy.cacheUsable(7, 7))
        assertFalse(WebPolicy.cacheUsable(6, 7)) // newer APK: its bundled files are at least as new
        assertFalse(WebPolicy.cacheUsable(-1, 7)) // incomplete
        assertFalse(WebPolicy.cacheUsable(0, 0))
    }

    @Test fun `expected files are the manifest plus the data file`() {
        val json = """{"shell":1,"css":["css/style.css"],"html":"app.html","js":["js/a.js","js/b.js"]}"""
        assertEquals(
            setOf("app-files.json", "js/data/panchanga-data.json", "app.html", "css/style.css", "js/a.js", "js/b.js"),
            WebPolicy.expectedFiles(json),
        )
    }

    @Test fun `mime types`() {
        assertEquals("text/javascript", WebPolicy.mimeFor("js/x.js"))
        assertEquals("application/json", WebPolicy.mimeFor("app-files.json"))
        assertEquals("text/css", WebPolicy.mimeFor("css/style.css"))
        assertTrue(WebPolicy.isText("text/css"))
        assertFalse(WebPolicy.isText("image/png"))
    }
}
