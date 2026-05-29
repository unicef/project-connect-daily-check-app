package com.meter.giga.data.util

import com.google.gson.Gson
import com.meter.giga.network.RetrofitInstanceBuilder
import com.meter.giga.network.api.ApiService
import com.meter.giga.network.util.RetrofitProvider

/**
 * Default implementation of {@link RetrofitProvider}
 * responsible for providing Retrofit API service instances.
 *
 * <p>This provider acts as a centralized access point for:
 * <ul>
 *   <li>Client information APIs.</li>
 *   <li>Fallback APIs.</li>
 *   <li>Server information APIs.</li>
 *   <li>Dynamic speed test APIs.</li>
 * </ul>
 *
 * <p>The implementation delegates Retrofit instance creation
 * to {@link RetrofitInstanceBuilder}.
 */
class RetrofitInstanceProviderImpl : RetrofitProvider {

  /**
   * Retrofit API instance used for fetching
   * client information details.
   */
  override val clientInfoApi = RetrofitInstanceBuilder.clintInfoApi

  /**
   * Lightweight Retrofit API instance used for
   * fetching limited client information details.
   */
  override val clientInfoLiteApi = RetrofitInstanceBuilder.clintInfoLitApi

  /**
   * Fallback Retrofit API instance used when
   * primary client information APIs fail.
   */
  override val clientInfoFallbackApi = RetrofitInstanceBuilder.clintInfoFallbackApi

  /**
   * Retrofit API instance used for retrieving
   * server information data.
   */
  override val serverInfoApi = RetrofitInstanceBuilder.serverInfoApi

  /**
   * Returns a Retrofit API instance configured
   * with the provided base URL.
   *
   * <p>This API is primarily used for
   * speed test network operations.
   *
   * @param baseUrl dynamic base URL for API requests.
   * @return configured {@link ApiService} instance.
   */
  override fun getSpeedTestApi(baseUrl: String) =
    RetrofitInstanceBuilder.getSpeedTestApi(baseUrl)

  /**
   * Returns a Retrofit API instance configured
   * with a custom Gson adapter.
   *
   * <p>This is useful when API responses require
   * custom serialization/deserialization handling.
   *
   * @param baseUrl dynamic base URL for API requests.
   * @param gson custom Gson instance.
   * @return configured {@link ApiService} instance.
   */
  override fun getSpeedTestApiWithAdapter(baseUrl: String, gson: Gson) =
    RetrofitInstanceBuilder.getSpeedTestApiWithCustomAdapter(baseUrl, gson)
}

