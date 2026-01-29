package com.meter.giga.network

import android.app.Application
import com.google.gson.Gson
import io.sentry.Sentry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class RetrofitInstanceBuilderTest {

  @Test
  fun `createRetrofit should return valid retrofit instance`() {
    val retrofit = RetrofitInstanceBuilder.createRetrofit("https://example.com/")

    assertNotNull(retrofit)
    assertEquals("https://example.com/", retrofit.baseUrl().toString())
    assertTrue(retrofit.converterFactories().isNotEmpty())
  }

  @Test
  fun `clintInfoApi lazy initializer should create ApiService`() {
    val api = RetrofitInstanceBuilder.clintInfoApi
    assertNotNull(api)
  }

  @Test
  fun `clintInfoLiteApi lazy initializer should create ApiService`() {
    val api = RetrofitInstanceBuilder.clintInfoLitApi
    assertNotNull(api)
  }

  @Test
  fun `clintInfoFallbackApi lazy initializer should create ApiService`() {
    val api = RetrofitInstanceBuilder.clintInfoFallbackApi
    assertNotNull(api)
  }

  @Test
  fun `serverInfoApi lazy initializer should create ApiService`() {
    val api = RetrofitInstanceBuilder.serverInfoApi
    assertNotNull(api)
  }

  @Test
  fun `retrofit instances should be different`() {
    val a = RetrofitInstanceBuilder.clintInfoApi
    val b = RetrofitInstanceBuilder.serverInfoApi
    assertNotEquals(a, b)
  }

  @Test
  fun `getSpeedTestApi returns ApiService with given base url`() {
    val api = RetrofitInstanceBuilder.getSpeedTestApi("https://example.com/")
    assertNotNull(api)
  }

  @Test
  fun `getSpeedTestApi captures base url in Sentry`() {
    val sentryMock = mockStatic(Sentry::class.java)

    RetrofitInstanceBuilder.getSpeedTestApi("https://baseurl.com/")

    sentryMock.verify { Sentry.capture("Base Url is : https://baseurl.com/") }
    sentryMock.close()
  }

  @Test
  fun `getSpeedTestApiWithCustomAdapter creates service with provided gson`() {
    val gson = Gson()
    val api = RetrofitInstanceBuilder.getSpeedTestApiWithCustomAdapter(
      "https://custom.com/",
      gson
    )
    assertNotNull(api)
  }
}
