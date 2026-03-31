package com.meter.giga

import android.app.Application
import android.os.Build
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import com.meter.giga.ararm_scheduler.AlarmHelper.getNextDayTimeToCheckVersionUpdate
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.AppLogger
import com.meter.giga.worker.UpdateCheckWorker
import io.sentry.Sentry
import io.sentry.android.AndroidSentryClientFactory
import java.util.Properties
import java.util.concurrent.TimeUnit

/**
 * Giga App Application class
 * This class is getting used to instantiate the third party
 * libs like Sentry etc.
 */
class GigaApp : Application() {

  override fun onCreate() {
    super.onCreate()
    initSentry()
    //initAppUpdateCheck()
//    if (isInstalledFromPlayStore()) {
//      initAppUpdateCheck()
//    } else {
//      AppLogger.d("Giga Meter", "App not installed from playstore")
//    }
  }

  fun getInstallerPackage(): String? {
    val pm = applicationContext.packageManager

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val installSourceInfo = pm.getInstallSourceInfo(applicationContext.packageName)
      installSourceInfo.installingPackageName
    } else {
      @Suppress("DEPRECATION")
      pm.getInstallerPackageName(applicationContext.packageName)
    }
  }

  fun isInstalledFromPlayStore(): Boolean {
    val installer = getInstallerPackage()
    return installer == "com.android.vending"
  }

  private fun initAppUpdateCheck() {
    AppLogger.d("Giga Meter", "App update check installer")
    Sentry.capture("Updated Checker executed On App Launch")
    val workRequest = PeriodicWorkRequest.Builder(
      UpdateCheckWorker::class.java,
      24, TimeUnit.HOURS
    ).build()

    WorkManager.getInstance(this).enqueueUniquePeriodicWork(
      "update_check",
      ExistingPeriodicWorkPolicy.KEEP,
      workRequest
    )
  }

  /**
   * This function is used to instantiate the Sentry instance to capture the
   * logs
   */
  private fun initSentry() {

    // Access capacitor config
    val props = Properties()
    try {
      val inputStream = assets.open("env.properties")
      props.load(inputStream)
    } catch (e: Exception) {
      e.printStackTrace()
    }
    // Add global context data
    val alarmPrefs = AlarmSharedPref(this.applicationContext)
    val environment = props.getProperty("ENVIRONMENT", "development")
    alarmPrefs.environment = environment
    AppLogger.d("GIGA App environment : ", environment)
    // Initialize Sentry with legacy Android factory
    Sentry.init(
      getString(R.string.sentry_dsn),
      AndroidSentryClientFactory(applicationContext)
    )
    Sentry.getContext().apply {
      // 🏷️ Add custom tags (key-value)
      addTag("environment", getEnvironment(environment))
    }
  }

  private fun getEnvironment(env: String): String {
    when (env) {
      "stg" ->
        return "staging"


      "prod" ->
        return "production"


      else ->
        return "development"

    }
  }
}
