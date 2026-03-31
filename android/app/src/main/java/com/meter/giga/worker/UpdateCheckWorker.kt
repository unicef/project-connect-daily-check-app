package com.meter.giga.worker

import android.Manifest
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import android.app.PendingIntent
import android.content.Intent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import com.google.android.gms.tasks.Task
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import com.meter.giga.MainActivity
import com.meter.giga.R
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.APP_UPDATE_CHANNEL_ID
import com.meter.giga.utils.Constants.APP_UPGRADE_NOTIFICATION_ID
import com.meter.giga.utils.Constants.WORKER_TAG
import com.meter.giga.utils.Logger
import io.sentry.Sentry
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class UpdateCheckWorker(
  appContext: Context,
  params: WorkerParameters
) : CoroutineWorker(appContext, params) {

  private var logger: Logger = AppLogger

  override suspend fun doWork(): Result {
    logger.d("Daily Schedule Interval", "Worker executed")

    return try {
      Sentry.capture("Updated Checker executed before play store check")

      val appUpdateManager =
        AppUpdateManagerFactory.create(applicationContext)

      // WAIT for Play Store response
      val info = appUpdateManager.appUpdateInfo.await()

      Sentry.capture("Updated Checker executed after play store check")
      Sentry.capture("Update Available: ${info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE}")
      Sentry.capture("Update Allowed: ${info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)}")

      if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
        info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
      ) {
        Sentry.capture("Update: Update available and allowed")

        logger.d("Update", "Update available and allowed")
        showUpdateNotification()

      } else {
        Sentry.capture("Update: No update OR not allowed")

        logger.d("Update", "No update OR not allowed")
      }

      Result.success()

    } catch (e: Exception) {
      Sentry.capture("Updated Checker Failed due to ${e.message}")
      Result.failure()
    }
  }

  private fun showUpdateNotification() {
    createNotificationChannel()

    val intent = Intent(applicationContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
      putExtra("START_UPDATE", true)
    }

    val pendingIntent = PendingIntent.getActivity(
      applicationContext,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = NotificationCompat.Builder(applicationContext, APP_UPDATE_CHANNEL_ID)
      .setContentTitle("New App Update Available")
      .setContentText("Tap to open app")
      .setSmallIcon(R.mipmap.ic_launcher_round)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)

    val notificationManager = NotificationManagerCompat.from(applicationContext)

    if (ActivityCompat.checkSelfPermission(
        applicationContext,
        Manifest.permission.POST_NOTIFICATIONS
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      logger.d("GIGA METER", "POST_NOTIFICATION PERMISSIONS ARE MISSING")
      return
    }

    notificationManager.notify(APP_UPGRADE_NOTIFICATION_ID, builder.build())
  }

  private fun createNotificationChannel() {
    val channel = NotificationChannel(
      APP_UPDATE_CHANNEL_ID,
      WORKER_TAG,
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Notifications for app updates"
    }

    val notificationManager =
      applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    notificationManager.createNotificationChannel(channel)
  }
}


/**
 * Extension function to await Play Core Task
 */
suspend fun <T> Task<T>.await(): T =
  suspendCancellableCoroutine { cont ->
    addOnSuccessListener { cont.resume(it) }
    addOnFailureListener { cont.resumeWithException(it) }
  }
