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
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat.getSystemService
import com.google.android.play.core.install.model.UpdateAvailability
import com.meter.giga.MainActivity
import com.meter.giga.R
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.APP_UPDATE_CHANNEL_ID
import com.meter.giga.utils.Constants.SPEED_TEST_CHANNEL_ID
import com.meter.giga.utils.Constants.WORKER_TAG
import com.meter.giga.utils.Logger
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime

class UpdateCheckWorker(appContext: Context, params: WorkerParameters) :
  CoroutineWorker(appContext, params) {
  var logger: Logger = AppLogger
  override suspend fun doWork(): Result {
    logger.d("Daily Schedule Interval", "Worker executed")
    // ✅ Your logic
    runUpdateCheck()
    return Result.success()
  }

  private fun runUpdateCheck() {
    val appUpdateManager = AppUpdateManagerFactory.create(applicationContext)
    val appUpdateInfo = appUpdateManager.appUpdateInfo
    appUpdateInfo.addOnSuccessListener { info ->
      if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
        logger.d("Daily Schedule Interval", "Worker executed")
        showUpdateNotification("New App Update Available", "Tap to open app")
      } else {
        logger.d("Daily Schedule Interval", "Worker executed Inside")
        showUpdateNotification("No New App Available", "")
      }
    }
  }

  private fun showUpdateNotification(message: String, title: String) {
    createNotificationChannel()

    val intent = Intent(applicationContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
      putExtra("START_UPDATE", true)
    }

    val pendingIntent = PendingIntent.getActivity(
      applicationContext, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = NotificationCompat.Builder(applicationContext, APP_UPDATE_CHANNEL_ID)
      .setContentTitle(message)
      .setContentText(title)
      .setSmallIcon(R.mipmap.ic_launcher_round)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(pendingIntent)

    val notificationManager = NotificationManagerCompat.from(applicationContext)
    if (ActivityCompat.checkSelfPermission(
        applicationContext,
        Manifest.permission.POST_NOTIFICATIONS
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      logger.d("GIGA METER", "POST_NOTIFICATION PERMISSIONS ARE MISSING")
      return
    }
    notificationManager.notify(1001, builder.build())   // 👈 REQUIRED
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

