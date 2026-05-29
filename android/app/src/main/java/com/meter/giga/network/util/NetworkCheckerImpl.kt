package com.meter.giga.network.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities


/**
 * Default implementation of {@link NetworkChecker}
 * used to validate internet connectivity availability.
 *
 * <p>This implementation uses:
 * <ul>
 *   <li>{@link ConnectivityManager}</li>
 *   <li>{@link NetworkCapabilities}</li>
 * </ul>
 *
 * <p>The validation ensures that:
 * <ul>
 *   <li>An active network connection exists.</li>
 *   <li>The network provides internet capability.</li>
 *   <li>The network connection is validated by the system.</li>
 * </ul>
 *
 * @property context application context used to access
 * system connectivity services.
 */
class NetworkCheckerImpl(
  private val context: Context
) : NetworkChecker {

  /**
   * Checks whether the device currently has
   * an active and validated internet connection.
   *
   * <p>The method validates:
   * <ul>
   *   <li>Availability of an active network.</li>
   *   <li>Internet capability support.</li>
   *   <li>Validated connectivity state.</li>
   * </ul>
   *
   * @return {@code true} if internet connectivity
   * is available and validated, otherwise {@code false}.
   */
  override fun isNetworkAvailable(): Boolean {
    val connectivityManager =
      context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    val network = connectivityManager.activeNetwork ?: return false
    val capabilities =
      connectivityManager.getNetworkCapabilities(network) ?: return false

    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
  }
}
