package com.meter.giga.utils

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import androidx.core.app.NotificationCompat
import com.meter.giga.MainActivity
import com.meter.giga.app.R
import com.meter.giga.utils.Constants.NOTIFICATION_ID
import com.meter.giga.utils.Constants.SPEED_TEST_CHANNEL_ID

class NotificationHelper(private val context: Context) {

  /**
   * Builds the Notification object.
   * Reuse this for both create and update.
   */
  fun createNotification(content: String): Notification {
    val intent = android.content.Intent(context, MainActivity::class.java).apply {
      flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
        android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
    }

    val pendingIntent = PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        PendingIntent.FLAG_IMMUTABLE
    )

    val largeBitmap = android.graphics.BitmapFactory.decodeResource(
      context.resources,
      R.mipmap.ic_launcher_round
    )

    return NotificationCompat.Builder(context, SPEED_TEST_CHANNEL_ID)
      .setContentTitle(context.getString(R.string.notification_header))
      .setContentText(content)
      .setSmallIcon(R.mipmap.ic_launcher_round)
      .setLargeIcon(largeBitmap)
      .setOngoing(true)
      .setOnlyAlertOnce(true)        // sound/vibrate only on first post with this ID
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(pendingIntent)
      .build()
  }

  /**
   * Call this whenever you want to show or update the notification.
   * Android will:
   *  - create if no notification with NOTIFICATION_ID exists
   *  - update if one already exists
   */
  fun showOrUpdateNotification(content: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE)
      as NotificationManager

    val notification = createNotification(content)
    manager.notify(NOTIFICATION_ID, notification)
  }

  /**
   * Optional: explicit cancel when operation is done or user dismisses via your UI.
   */
  fun cancelNotification() {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE)
      as NotificationManager
    manager.cancel(NOTIFICATION_ID)
  }
}
