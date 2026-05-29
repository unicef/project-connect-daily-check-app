package com.meter.giga.network.util

/**
 * Contract interface used to verify
 * network connectivity availability.
 *
 * <p>Implementations of this interface are responsible for:
 * <ul>
 *   <li>Checking internet/network connection state.</li>
 *   <li>Providing a reusable abstraction for connectivity validation.</li>
 *   <li>Supporting dependency injection and testability.</li>
 * </ul>
 */
interface NetworkChecker {
  /**
   * Checks whether network connectivity
   * is currently available on the device.
   *
   * <p>This validation may include:
   * <ul>
   *   <li>Wi-Fi connectivity.</li>
   *   <li>Mobile data connectivity.</li>
   *   <li>Active internet access availability.</li>
   * </ul>
   *
   * @return {@code true} if network connectivity
   * is available, otherwise {@code false}.
   */
  fun isNetworkAvailable(): Boolean
}
