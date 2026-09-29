package com.meter.giga

import android.content.Context
import android.content.SharedPreferences
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue

/**
 * Tests that run a real speed test against M-Lab. They need network access and
 * take about a minute, so they are skipped unless requested:
 *
 *   ./gradlew connectedDebugAndroidTest \
 *     -Pandroid.testInstrumentationRunnerArguments.liveMlab=true
 */
object LiveMlabTests {
  fun assumeEnabled() {
    val enabled = InstrumentationRegistry.getArguments().getString("liveMlab") == "true"
    assumeTrue("Live M-Lab tests are off; pass liveMlab=true to run them", enabled)
  }
}

/**
 * Copy of a SharedPreferences file, so a test that writes to the app's real
 * preferences can put back what the installed app had.
 */
class SharedPreferencesSnapshot(context: Context, name: String) {
  private val prefs: SharedPreferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)
  private val saved: Map<String, *> = HashMap(prefs.all)

  fun restore() {
    val editor = prefs.edit().clear()
    for ((key, value) in saved) {
      when (value) {
        is String -> editor.putString(key, value)
        is Int -> editor.putInt(key, value)
        is Long -> editor.putLong(key, value)
        is Float -> editor.putFloat(key, value)
        is Boolean -> editor.putBoolean(key, value)
        is Set<*> -> editor.putStringSet(key, value.filterIsInstance<String>().toSet())
      }
    }
    editor.commit()
  }
}
