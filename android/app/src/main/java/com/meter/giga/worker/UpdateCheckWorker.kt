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

/**
 * Worker responsible for performing periodic app update checks
 * using Google Play Core In-App Updates API.
 *
 * <p>This worker:
 * <ul>
 *   <li>Checks whether a new application update is available.</li>
 *   <li>Validates whether flexible updates are allowed.</li>
 *   <li>Shows a notification prompting the user to update the app.</li>
 *   <li>Logs update flow events into Sentry.</li>
 * </ul>
 *
 * @param appContext application context used by the worker.
 * @param params worker execution parameters.
 */
open class UpdateCheckWorker(
  appContext: Context,
  params: WorkerParameters
) : CoroutineWorker(appContext, params) {


  /**
   * Logger implementation used for application logging.
   */
  var logger: Logger = AppLogger

  /**
   * Executes the background update check task.
   *
   * <p>This method:
   * <ul>
   *   <li>Requests update information from Google Play.</li>
   *   <li>Determines whether an update is available.</li>
   *   <li>Validates whether flexible updates are supported.</li>
   *   <li>Shows a notification if an update is available.</li>
   *   <li>Captures execution logs and failures using Sentry.</li>
   * </ul>
   *
   * @return {@link Result#success()} if the update check completes successfully,
   * otherwise {@link Result#failure()} when an exception occurs.
   */
  override suspend fun doWork(): Result {
    logger.d("Daily Schedule Interval", "Worker executed")

    return try {
      Sentry.captureMessage("Updated Checker executed before play store check")

      val appUpdateManager =
        AppUpdateManagerFactory.create(applicationContext)

      // WAIT for Play Store response
      val info = appUpdateManager.appUpdateInfo.await()

      Sentry.captureMessage("Updated Checker executed after play store check")
      Sentry.captureMessage("Update Available: ${info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE}")
      Sentry.captureMessage("Update Allowed: ${info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)}")

      if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
        info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
      ) {
        Sentry.captureMessage("Update: Update available and allowed")

        logger.d("Update", "Update available and allowed")
        showUpdateNotification()

      } else {
        Sentry.captureMessage("Update: No update OR not allowed")

        logger.d("Update", "No update OR not allowed")
      }

      Result.success()

    } catch (e: Exception) {
      Sentry.captureMessage("Updated Checker Failed due to ${e.message}")
      Result.failure()
    }
  }

  /**
   * Displays a notification informing the user
   * that a new application update is available.
   *
   * <p>The notification:
   * <ul>
   *   <li>Launches {@link MainActivity} when tapped.</li>
   *   <li>Triggers the in-app update flow using an intent extra.</li>
   *   <li>Uses a high-priority notification channel.</li>
   * </ul>
   *
   * <p>If notification permission is not granted,
   * the notification will not be displayed.
   */
  protected fun showUpdateNotification() {
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

  /**
   * Creates the notification channel used for
   * application update notifications.
   *
   * <p>This channel is registered with high importance
   * to ensure update notifications are prominently displayed.
   */
  protected fun createNotificationChannel() {
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
 * Suspends the current coroutine until the Play Core {@link Task}
 * completes successfully or fails.
 *
 * <p>This extension function converts the callback-based Play Core API
 * into a coroutine-friendly suspend function.
 *
 * <p>Execution listeners are attached using a dedicated background executor
 * to avoid dependency on the Android main looper.
 *
 * @param T type of result returned by the task.
 *
 * @return the successful task result.
 *
 * @throws Exception if the task fails.
 */
suspend fun <T> Task<T>.await(): T =
  suspendCancellableCoroutine { cont ->
    val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
    addOnSuccessListener(executor) { result ->
      if (cont.isActive) cont.resume(result)
    }
    addOnFailureListener(executor) { exception ->
      if (cont.isActive) cont.resumeWithException(exception)
    }
    cont.invokeOnCancellation {
      // Task cancellation is not supported by Play Core — just guard the cont
    }
  }
