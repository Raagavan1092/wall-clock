package com.raagavan.vedicclock

import android.content.Context
import android.media.MediaPlayer

/**
 * Maps an alarm's soundKind ("bell", "track", "tune:<id>") to a file. The tunes and the bell are
 * synthesised in the web page, so tools/render-sounds.js pre-renders each to a loop-ready WAV in
 * res/raw (tune_<id with _ for ->, bell). "track" is the person's own file, copied here by the page.
 */
object Sounds {
    fun rawName(kind: String): String = when {
        kind.startsWith("tune:") -> "tune_" + kind.removePrefix("tune:").replace('-', '_')
        else -> "bell"
    }

    /** Points [mp] at the sound for [kind]; throws if it has none (the caller falls back to the bell). */
    fun setSource(ctx: Context, mp: MediaPlayer, kind: String) {
        if (kind == "track") {
            val file = Store.trackFile(ctx)
            if (!file.exists() || file.length() == 0L) throw IllegalStateException("No track chosen")
            mp.setDataSource(file.absolutePath)
            return
        }
        val id = ctx.resources.getIdentifier(rawName(kind), "raw", ctx.packageName)
        if (id == 0) throw IllegalStateException("No sound for $kind")
        ctx.resources.openRawResourceFd(id).use { mp.setDataSource(it.fileDescriptor, it.startOffset, it.length) }
    }
}
