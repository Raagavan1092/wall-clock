package com.raagavan.vedicclock

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import org.json.JSONObject

/**
 * Plays the alarm. A foreground service (type mediaPlayback - allowed to start from the exact-alarm
 * broadcast) so it keeps running with the screen off: the chosen sound loops on the ALARM audio stream
 * (alarm volume, and it plays in Do Not Disturb when alarms are allowed), the phone vibrates, and the
 * notification carries the full-screen intent that opens [RingActivity] over the lock screen.
 * Stops when dismissed, or after [MAX_RING_MS].
 */
class RingService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var focus: AudioFocusRequest? = null
    private var ringing = false
    private val timeout = Runnable { finish(missed = true) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DISMISS -> finish(missed = false)
            else -> {
                val ring = intent?.getStringExtra(EXTRA_RING)?.let { runCatching { Ring.fromJson(JSONObject(it)) }.getOrNull() }
                if (ring == null) {
                    // Started with nothing to ring (e.g. restarted by the system): we are not a foreground service yet, so just stop.
                    if (!ringing) stopSelf()
                } else {
                    onRing(ring)
                }
            }
        }
        return START_NOT_STICKY
    }

    private fun onRing(ring: Ring) {
        val merged = current?.takeIf { ringing }?.let { old ->
            // A second alarm while one rings: one screen, every item listed.
            ScheduleLogic.mergeDue(listOf(old, ring))?.copy(key = old.key + "+" + ring.key)
        } ?: ring
        current = merged
        Notifier.ensureChannels(this)
        val notification = Notifier.ringNotification(this, merged)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(Notifier.ID_RING, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(Notifier.ID_RING, notification)
        }
        sendBroadcast(Intent(ACTION_UPDATE).setPackage(packageName))
        if (ringing) return // already playing; the screen and notification were refreshed
        ringing = true
        acquireWakeLock()
        if (merged.sound) startSound(merged.soundKind)
        startVibration()
        handler.postDelayed(timeout, MAX_RING_MS)
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vedicclock:ring").apply { acquire(MAX_RING_MS + 15_000L) }
    }

    private fun alarmAttributes(): AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()

    private fun startSound(kind: String) {
        val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
            .setAudioAttributes(alarmAttributes()).build().also { audio.requestAudioFocus(it) }
        // The chosen sound, else the bell, else the phone's own alarm tone: never silence.
        val candidates = listOf<(MediaPlayer) -> Unit>(
            { Sounds.setSource(this, it, kind) },
            { Sounds.setSource(this, it, "bell") },
            { it.setDataSource(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)) },
        )
        for (setSource in candidates) {
            val mp = MediaPlayer()
            try {
                mp.setAudioAttributes(alarmAttributes())
                setSource(mp)
                mp.isLooping = true
                mp.setVolume(1f, 1f)
                mp.prepare()
                mp.start()
                player = mp
                return
            } catch (e: Exception) {
                Log.w(TAG, "Sound failed, trying the next one", e)
                runCatching { mp.release() }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun startVibration() {
        val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (!v.hasVibrator()) return
        val effect = VibrationEffect.createWaveform(longArrayOf(0, 700, 400, 700, 400, 1200, 900), 0)
        v.vibrate(effect, alarmAttributes())
    }

    @Suppress("DEPRECATION")
    private fun stopAll() {
        handler.removeCallbacks(timeout)
        runCatching { player?.stop() }
        runCatching { player?.release() }
        player = null
        runCatching { (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel() }
        focus?.let { runCatching { (getSystemService(Context.AUDIO_SERVICE) as AudioManager).abandonAudioFocusRequest(it) } }
        focus = null
        runCatching { wakeLock?.takeIf { it.isHeld }?.release() }
        wakeLock = null
    }

    private fun finish(missed: Boolean) {
        val ring = current
        stopAll()
        ringing = false
        current = null
        sendBroadcast(Intent(ACTION_CLOSE).setPackage(packageName))
        stopForeground(STOP_FOREGROUND_REMOVE)
        // Say so if nobody dismissed it, or if the alarm asked for a notification.
        if (ring != null && (missed || ring.notify) && !ring.isTest) Notifier.postRangNotice(this, ring, missed)
        AlarmScheduler.reschedule(this)
        stopSelf()
    }

    override fun onDestroy() {
        stopAll()
        ringing = false
        super.onDestroy()
    }

    companion object {
        private const val TAG = "VedicAlarms"
        const val ACTION_DISMISS = "com.raagavan.vedicclock.DISMISS"
        const val ACTION_CLOSE = "com.raagavan.vedicclock.RING_CLOSE"
        const val ACTION_UPDATE = "com.raagavan.vedicclock.RING_UPDATE"
        const val EXTRA_RING = "ring"
        const val MAX_RING_MS = 5 * 60 * 1000L

        /** The alarm now ringing, for [RingActivity] to show (same process). */
        @Volatile var current: Ring? = null
            private set

        fun start(ctx: Context, ring: Ring) {
            val intent = Intent(ctx, RingService::class.java).putExtra(EXTRA_RING, ring.toJson().toString())
            try {
                ctx.startForegroundService(intent)
            } catch (e: Exception) {
                // Not allowed to start the service: fall back to a full-screen notification the system sounds itself.
                Log.e(TAG, "Could not start the ring service", e)
                Notifier.ensureChannels(ctx)
                Notifier.manager(ctx).notify(Notifier.ID_RING, Notifier.ringNotification(ctx, ring, Notifier.CHANNEL_RING_FALLBACK))
            }
        }

        fun dismiss(ctx: Context) {
            ctx.startService(Intent(ctx, RingService::class.java).setAction(ACTION_DISMISS))
        }
    }
}
