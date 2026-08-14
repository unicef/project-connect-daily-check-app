package com.meter.giga

import android.annotation.SuppressLint
import android.app.Application
import android.os.Build
import android.provider.Settings.Secure
import android.provider.Settings.Secure.ANDROID_ID
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.AppLogger
import io.sentry.ProfileLifecycle
import io.sentry.Sentry
import io.sentry.android.core.SentryAndroid
import io.sentry.protocol.User
import java.util.Properties

/**
 * Application class for the Giga application.
 *
 * <p>This class is responsible for performing application-level
 * initializations such as:
 * <ul>
 *   <li>Initializing third-party SDKs.</li>
 *   <li>Setting up Sentry crash reporting and performance monitoring.</li>
 *   <li>Loading environment-specific configurations.</li>
 * </ul>
 */
class GigaApp : Application() {
  /**
   * Called when the application is created.
   *
   * <p>This is the entry point for application-level initialization logic.
   * Currently used to initialize Sentry monitoring.
   */
  override fun onCreate() {
    super.onCreate()
    initSentry()
  }

  /**
   * Initializes the Sentry SDK for crash reporting,
   * performance monitoring, and profiling.
   *
   * <p>This method performs the following operations:
   * <ul>
   *   <li>Loads environment configuration from {@code env.properties}.</li>
   *   <li>Stores the application environment in shared preferences.</li>
   *   <li>Configures Sentry DSN and monitoring options.</li>
   *   <li>Enables tracing, screenshots, view hierarchy, and profiling.</li>
   * </ul>
   *
   * <p>If loading the environment configuration fails,
   * the application defaults to the {@code development} environment.
   */
  @SuppressLint("HardwareIds")
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
    val androidId = Secure.getString(
      this.contentResolver,
      ANDROID_ID
    )
    val deviceModel = Build.MODEL
    val deviceManufacturer = Build.MANUFACTURER
    val deviceName = Build.DEVICE
    AppLogger.d("Android Id : ", androidId)
    AppLogger.d("Android Device Manufacturer : ", deviceManufacturer)
    AppLogger.d("Android Device Name : ", deviceName)
    AppLogger.d("Android Device Model : ", deviceModel)
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
      // Capture 100% of sessions during testing
      options.sessionReplay.sessionSampleRate = 1.0
      // Capture the replay when an error occurs
      options.sessionReplay.onErrorSampleRate = 1.0
      options.environment = getEnvironment(environment)

      options.setTag("Android Device Id", "$androidId")
      options.setTag("Android Device Name", "$deviceName")
      options.setTag("Android Device Manufacturer", "$deviceManufacturer")
      options.setTag("Android Device Model", "$deviceModel")

//      options.sessionReplay.maskAllText = true
//      options.sessionReplay.maskAllImages = true
    }
    val user = User().apply {
      id = androidId
    }
    Sentry.setUser(user)
  }
}

/**
 * Maps environment identifiers to readable environment names.
 *
 * <p>Supported environment mappings:
 * <ul>
 *   <li>{@code stg -> staging}</li>
 *   <li>{@code prod -> production}</li>
 *   <li>Any other value -> development</li>
 * </ul>
 *
 * @param env short environment identifier.
 * @return readable environment name.
 */
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

