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
import io.sentry.ProfileLifecycle
import io.sentry.Sentry
import io.sentry.SentryLevel
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import java.util.Properties
import java.util.concurrent.TimeUnit
import kotlin.apply

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
    Sentry.captureMessage("Updated Checker executed On App Launch")
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
//    Sentry.init(
//      getString(R.string.sentry_dsn),
//      AndroidSentryClientFactory(applicationContext)
//    )
//    Sentry.getContext().apply {
//      // 🏷️ Add custom tags (key-value)
//      addTag("environment", getEnvironment(environment))
//    }

    SentryAndroid.init(this) { options ->
      // Required: set your sentry.io project identifier (DSN)
      options.dsn = getString(R.string.sentry_dsn)
      // Add data like request headers, user ip address and device name, see https://docs.sentry.io/platforms/android/data-management/data-collected/ for more info
      options.isSendDefaultPii = true
      // enable automatic traces for user interactions (clicks, swipes, scrolls)
      options.isEnableUserInteractionTracing = true
      // enable screenshot for crashes
      options.isAttachScreenshot = true
      // enable view hierarchy for crashes
      options.isAttachViewHierarchy = true
      // enable the performance API by setting a sample-rate, adjust in production env
      options.tracesSampleRate = 1.0
      // enable UI profiling, adjust in production env. This is evaluated only once per session
      options.profileSessionSampleRate = 1.0
      // set profiling mode. For more info see https://docs.sentry.io/platforms/android/profiling/#enabling-ui-profiling
      options.profileLifecycle = ProfileLifecycle.TRACE
      // enable profiling on app start. The app start profile will be stopped automatically when the app start root span finishes
      options.isStartProfilerOnAppStart = true
    }
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

