package com.meter.giga.network

import com.google.gson.Gson
import com.meter.giga.network.api.ApiService
import com.meter.giga.utils.Constants.CLIENT_INFO_END_URL
import com.meter.giga.utils.Constants.CLIENT_INFO_FALLBACK_END_URL
import com.meter.giga.utils.Constants.CLIENT_LITE_INFO_END_URL
import com.meter.giga.utils.Constants.SERVER_INFO_END_URL
import io.sentry.Sentry
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * Singleton Builder class to create the retrofit instance for
 * multiple base urls, this can be configured based on build tupe
 * As discussed with Rashan, at the moment it's static but can be
 * based on environment in future
 */
object RetrofitInstanceBuilder {

  internal fun createRetrofit(baseUrl: String): Retrofit {
    return Retrofit.Builder()
      .baseUrl(baseUrl)
      .addConverterFactory(GsonConverterFactory.create())
      .build()
  }

  /**
   * Creates ApiService service instance to
   * fetch the client info data
   */
  val clintInfoApi: ApiService by lazy {
    createRetrofit(CLIENT_INFO_END_URL)
      .create(ApiService::class.java)
  }

  /**
   * Creates ApiService service instance to
   * fetch the client info data
   */
  val clintInfoLitApi: ApiService by lazy {
    createRetrofit(CLIENT_LITE_INFO_END_URL)
      .create(ApiService::class.java)
  }

  /**
   * Creates ApiService service instance to
   * fetch the client info data from fallback base url
   */
  val clintInfoFallbackApi: ApiService by lazy {
    createRetrofit(CLIENT_INFO_FALLBACK_END_URL)
      .create(ApiService::class.java)
  }

  /**
   * Creates ApiService service instance to
   * post the speed test data
   */
  fun getSpeedTestApi(baseUrl: String): ApiService {
    Sentry.capture("Base Url is : $baseUrl");
    return Retrofit.Builder()
      .baseUrl(baseUrl)
      .addConverterFactory(GsonConverterFactory.create())
      .build()
      .create(ApiService::class.java)
  }

  /**
   * Creates ApiService service instance to
   * post the speed test data
   * @param baseUrl: Base URL
   * @param gson : custom adapters
   */
  fun getSpeedTestApiWithCustomAdapter(baseUrl: String, gson: Gson): ApiService {
    return Retrofit.Builder()
      .baseUrl(baseUrl)
      .addConverterFactory(GsonConverterFactory.create(gson))
      .build()
      .create(ApiService::class.java)
  }

  /**
   * Creates ApiService service instance to
   * fetch the server info data
   */
  val serverInfoApi: ApiService by lazy {
    createRetrofit(SERVER_INFO_END_URL)
      .create(ApiService::class.java)
  }
}
