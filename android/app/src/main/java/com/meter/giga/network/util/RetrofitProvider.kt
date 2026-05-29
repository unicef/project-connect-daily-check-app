package com.meter.giga.network.util

import com.google.gson.Gson
import com.meter.giga.network.api.ApiService

/**
 * Contract interface responsible for providing
 * Retrofit API service instances used throughout the application.
 *
 * <p>This abstraction centralizes access to:
 * <ul>
 *   <li>Client information APIs.</li>
 *   <li>Fallback APIs.</li>
 *   <li>Lightweight client APIs.</li>
 *   <li>Server information APIs.</li>
 *   <li>Dynamic speed test APIs.</li>
 * </ul>
 *
 * <p>The interface improves:
 * <ul>
 *   <li>Dependency injection support.</li>
 *   <li>Code modularity.</li>
 *   <li>Testability and mocking.</li>
 * </ul>
 */
interface RetrofitProvider {
  /**
   * Retrofit API service used for retrieving
   * client information details.
   */
  val clientInfoApi: ApiService

  /**
   * Retrofit API service used as a fallback
   * when primary client information APIs fail.
   */
  val clientInfoFallbackApi: ApiService

  /**
   * Lightweight Retrofit API service used for
   * fetching limited client information data.
   */
  val clientInfoLiteApi: ApiService

  /**
   * Retrofit API service used for retrieving
   * server-related information.
   */
  val serverInfoApi: ApiService

  /**
   * Returns a Retrofit API service configured
   * with the provided base URL.
   *
   * <p>This method is primarily used for
   * speed test API communication.
   *
   * @param baseUrl dynamic API base URL.
   * @return configured {@link ApiService} instance.
   */
  fun getSpeedTestApi(baseUrl: String): ApiService

  /**
   * Returns a Retrofit API service configured
   * with a custom Gson serializer/deserializer.
   *
   * <p>This method is useful when handling
   * custom API response parsing logic.
   *
   * @param baseUrl dynamic API base URL.
   * @param gson custom Gson instance.
   * @return configured {@link ApiService} instance.
   */
  fun getSpeedTestApiWithAdapter(baseUrl: String, gson: Gson): ApiService
}


