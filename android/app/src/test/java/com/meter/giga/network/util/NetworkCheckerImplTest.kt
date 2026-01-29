package com.meter.giga.network.util

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.meter.giga.network.util.NetworkCheckerImpl
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class NetworkCheckerImplTest {

  private lateinit var context: Context
  private lateinit var connectivityManager: ConnectivityManager
  private lateinit var networkChecker: NetworkCheckerImpl

  @Before
  fun setup() {
    context = mock(Context::class.java)
    connectivityManager = mock(ConnectivityManager::class.java)

    `when`(context.getSystemService(Context.CONNECTIVITY_SERVICE))
      .thenReturn(connectivityManager)

    networkChecker = NetworkCheckerImpl(context)
  }

  @Test
  fun `returns false when activeNetwork is null`() {
    `when`(connectivityManager.activeNetwork).thenReturn(null)

    assertFalse(networkChecker.isNetworkAvailable())
  }

  @Test
  fun `returns false when capabilities are null`() {
    val network = mock(Network::class.java)
    `when`(connectivityManager.activeNetwork).thenReturn(network)
    `when`(connectivityManager.getNetworkCapabilities(network)).thenReturn(null)

    assertFalse(networkChecker.isNetworkAvailable())
  }

  @Test
  fun `returns false when missing INTERNET capability`() {
    val network = mock(Network::class.java)
    val caps = mock(NetworkCapabilities::class.java)

    `when`(connectivityManager.activeNetwork).thenReturn(network)
    `when`(connectivityManager.getNetworkCapabilities(network)).thenReturn(caps)

    `when`(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)).thenReturn(false)
    `when`(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)).thenReturn(true)

    assertFalse(networkChecker.isNetworkAvailable())
  }

  @Test
  fun `returns false when missing VALIDATED capability`() {
    val network = mock(Network::class.java)
    val caps = mock(NetworkCapabilities::class.java)

    `when`(connectivityManager.activeNetwork).thenReturn(network)
    `when`(connectivityManager.getNetworkCapabilities(network)).thenReturn(caps)

    `when`(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)).thenReturn(true)
    `when`(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)).thenReturn(false)

    assertFalse(networkChecker.isNetworkAvailable())
  }

  @Test
  fun `returns true when INTERNET and VALIDATED capabilities exist`() {
    val network = mock(Network::class.java)
    val caps = mock(NetworkCapabilities::class.java)

    `when`(connectivityManager.activeNetwork).thenReturn(network)
    `when`(connectivityManager.getNetworkCapabilities(network)).thenReturn(caps)

    `when`(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)).thenReturn(true)
    `when`(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)).thenReturn(true)

    assertTrue(networkChecker.isNetworkAvailable())
  }
}
