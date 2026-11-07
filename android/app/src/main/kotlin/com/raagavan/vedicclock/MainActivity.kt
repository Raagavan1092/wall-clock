package com.raagavan.vedicclock

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * Hosts the bundled web app. It is served from https://appassets.androidplatform.net/ by
 * WebViewAssetLoader (file:// would break the page's fetch() calls), so it works offline and
 * localStorage / IndexedDB persist like in a browser.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var source: WebSource
    private val handler = Handler(Looper.getMainLooper())

    // If the page served from the site does not start (a broken push), run the copy in the APK instead.
    private val bootCheck = Runnable {
        if (!booted && source.mode == WebSource.Mode.REMOTE) {
            source.forceBundled()
            web.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/index.html")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        // Files come from the site when it answers, else the last saved copy, else the APK (see WebSource).
        source = WebSource(this, loader, Store.prefs(this).getBoolean(WebSource.PREF_WEB_UPDATES, true))
        booted = false

        web = WebView(this).apply {
            setBackgroundColor(0xFF0B0A08.toInt())
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
            }
            addJavascriptInterface(AlarmBridge(applicationContext), "AndroidAlarms")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    source.intercept(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    return true
                }

                override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                    recreate() // the page's renderer died (e.g. out of memory): start it afresh
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                // The "My track" button in the alarm dialog.
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    return try {
                        @Suppress("DEPRECATION")
                        startActivityForResult(params.createIntent(), REQ_FILE)
                        true
                    } catch (e: Exception) {
                        fileCallback = null
                        false
                    }
                }
            }
        }
        setContentView(web)
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/index.html")
        handler.postDelayed(bootCheck, BOOT_CHECK_MS)

        // First run: the checklist that makes alarms ring when the phone is locked.
        val prefs = Store.prefs(this)
        if (!prefs.getBoolean(PREF_SETUP_SEEN, false)) {
            prefs.edit().putBoolean(PREF_SETUP_SEEN, true).apply()
            startActivity(Intent(this, SetupActivity::class.java))
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        if (Store.prefs(this).getBoolean(PREF_KEEP_ON, false)) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // A wall clock: full screen. Swipe from an edge to see the system bars.
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
        }
        // Belt and braces: make sure the next ring is registered whenever the app is opened.
        Thread { AlarmScheduler.reschedule(applicationContext) }.start()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            val result = if (resultCode == RESULT_OK) android.webkit.WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
            fileCallback?.onReceiveValue(result)
            fileCallback = null
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onDestroy() {
        handler.removeCallbacks(bootCheck)
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQ_FILE = 42
        private const val BOOT_CHECK_MS = 20_000L

        /** Set by the page (AndroidAlarms.booted()) once it has started properly. */
        @Volatile var booted = false
        const val PREF_SETUP_SEEN = "setup_seen"
        const val PREF_KEEP_ON = "keep_screen_on"
    }
}
