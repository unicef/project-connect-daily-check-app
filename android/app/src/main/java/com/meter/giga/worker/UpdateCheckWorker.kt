package com.meter.giga.worker

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
import android.os.Build
import androidx.core.content.ContextCompat.getSystemService
import com.google.android.play.core.install.model.UpdateAvailability
import com.meter.giga.MainActivity
import com.meter.giga.R
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.APP_UPDATE_CHANNEL_ID
import com.meter.giga.utils.Constants.SPEED_TEST_CHANNEL_ID
import com.meter.giga.utils.Constants.WORKER_TAG
import com.meter.giga.utils.Logger

class UpdateCheckWorker(appContext: Context, params: WorkerParameters) :
  CoroutineWorker(appContext, params) {
  var logger: Logger = AppLogger
  override suspend fun doWork(): Result {
    val appUpdateManager = AppUpdateManagerFactory.create(applicationContext)
    val appUpdateInfo = appUpdateManager.appUpdateInfo
    appUpdateInfo.addOnSuccessListener { info ->
      if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
        logger.d("Daily Schedule Interval", "Worker executed")
        showUpdateNotification()
      }
    }

    return Result.success()
  }

  private fun showUpdateNotification() {
    createNotificationChannel()
    val intent = Intent(applicationContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
      putExtra("START_UPDATE", true)
    }
    val pendingIntent = PendingIntent.getActivity(
      applicationContext, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    NotificationCompat.Builder(applicationContext, APP_UPDATE_CHANNEL_ID)
      .setContentTitle("New App Update Available")
      .setContentText("Tap to update now")
      .setSmallIcon(R.mipmap.ic_launcher_round)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun createNotificationChannel() {
    val channel = NotificationChannel(
      APP_UPDATE_CHANNEL_ID, WORKER_TAG,
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Notifications for app updates"
    }

    val notificationManager =
      applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.createNotificationChannel(channel)
  }
}

