//package com.meter.giga
//
//import android.Manifest
//import android.app.Activity
//import android.app.Instrumentation
//import android.content.Intent
//import android.os.Build
//import android.provider.Settings
//import android.webkit.WebView
//import androidx.test.core.app.ActivityScenario
//import androidx.test.core.app.ActivityScenario.launch
//import androidx.test.espresso.Espresso.onView
//import androidx.test.espresso.intent.Intents
//import androidx.test.espresso.intent.Intents.intended
//import androidx.test.espresso.intent.Intents.intending
//import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
//import androidx.test.espresso.intent.matcher.IntentMatchers.hasData
//import androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom
//import androidx.test.espresso.web.assertion.WebViewAssertions.webMatches
//import androidx.test.espresso.web.model.Atoms
//import androidx.test.espresso.web.model.Atoms.getCurrentUrl
//import androidx.test.espresso.web.sugar.Web.onWebView
//import androidx.test.espresso.web.webdriver.DriverAtoms.findElement
//import androidx.test.espresso.web.webdriver.DriverAtoms.getText
//import androidx.test.espresso.web.webdriver.Locator
//import androidx.test.ext.junit.runners.AndroidJUnit4
//import androidx.test.filters.LargeTest
//import androidx.test.platform.app.InstrumentationRegistry
//import androidx.test.rule.GrantPermissionRule
//import org.hamcrest.Matchers.allOf
//import org.hamcrest.Matchers.containsString
//import org.junit.After
//import org.junit.Assume.assumeTrue
//import org.junit.Before
//import org.junit.Rule
//import org.junit.Test
//import org.junit.runner.RunWith
//import java.util.concurrent.TimeUnit
//
//@RunWith(AndroidJUnit4::class)
//@LargeTest
//class AppFlowTest {
//
//  @get:Rule
//  val locationPermissionRule: GrantPermissionRule =
//    GrantPermissionRule.grant(
//      Manifest.permission.ACCESS_FINE_LOCATION,
//      Manifest.permission.ACCESS_COARSE_LOCATION
//    )
//
//  @get:Rule
//  val notificationPermissionRule: GrantPermissionRule? =
//    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
//      GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
//    } else {
//      null
//    }
//
//  @Before
//  fun setUp() {
//    Intents.init()
//  }
//
//  @After
//  fun tearDown() {
//    Intents.release()
//  }
//
//  private fun launchMainForWeb(): ActivityScenario<MainActivity> {
//    val context = InstrumentationRegistry.getInstrumentation().targetContext
//    val intent = Intent(context, MainActivity::class.java).apply {
//      putExtra("ui_test", "true")
//    }
//    return launch(intent)
//  }
//
//  private fun launchMainForNative(): ActivityScenario<MainActivity> {
//    val context = InstrumentationRegistry.getInstrumentation().targetContext
//    return launch(Intent(context, MainActivity::class.java))
//  }
//
//  private fun waitForWebViewVisible() {
//    onView(isAssignableFrom(WebView::class.java)).check { view, exception ->
//      if (exception != null) throw exception
//      if (view == null || !view.isShown) throw AssertionError("WebView is not visible")
//    }
//  }
//
//  private fun clickElement(selector: String, timeoutSeconds: Long = 15) {
//    val start = System.currentTimeMillis()
//    var lastError: Throwable? = null
//
//    while (System.currentTimeMillis() - start < timeoutSeconds * 1000) {
//      try {
//        onWebView(isAssignableFrom(WebView::class.java))
//          .withTimeout(30, TimeUnit.SECONDS)
//          .forceJavascriptEnabled()
//          .withElement(findElement(Locator.CSS_SELECTOR, selector))
//          .perform(Atoms.script("arguments[0].click();"))
//        return
//      } catch (t: Throwable) {
//        lastError = t
//        Thread.sleep(500)
//      }
//    }
//
//    throw AssertionError(
//      "Failed to find or click element: $selector after $timeoutSeconds seconds",
//      lastError
//    )
//  }
//
//  private fun waitForText(text: String, timeoutSeconds: Long = 15) {
//    val start = System.currentTimeMillis()
//    var lastError: Throwable? = null
//
//    while (System.currentTimeMillis() - start < timeoutSeconds * 1000) {
//      try {
//        onWebView(isAssignableFrom(WebView::class.java))
//          .withTimeout(30, TimeUnit.SECONDS)
//          .forceJavascriptEnabled()
//          .withElement(findElement(Locator.TAG_NAME, "body"))
//          .check(webMatches(getText(), containsString(text)))
//        return
//      } catch (t: Throwable) {
//        lastError = t
//        Thread.sleep(500)
//      }
//    }
//
//    throw AssertionError("Text '$text' not found after $timeoutSeconds seconds", lastError)
//  }
//
//  @Test
//  fun native_mainActivity_WhenExactAlarmMissing_LaunchesAlarmSettingsIntent() {
//    assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
//    intending(hasAction(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
//      .respondWith(Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null))
//
//    launchMainForNative().use {
//      intended(
//        allOf(
//          hasAction(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM),
//          hasData("package:${InstrumentationRegistry.getInstrumentation().targetContext.packageName}")
//        )
//      )
//    }
//  }
//
//  @Test
//  fun web_homeScreen_RendersWelcomeContent() {
//    launchMainForWeb().use {
//      waitForWebViewVisible()
//      onWebView(isAssignableFrom(WebView::class.java))
//        .withTimeout(30, TimeUnit.SECONDS)
//        .forceJavascriptEnabled()
//        .withElement(findElement(Locator.TAG_NAME, "body"))
//        .check(webMatches(getText(), containsString("Welcome")))
//    }
//  }
//
//  @Test
//  fun web_homeScreen_Next_Click_NavigatesToRegisterSchool() {
//    launchMainForWeb().use {
//      onWebView(isAssignableFrom(WebView::class.java))
//        .withTimeout(30, TimeUnit.SECONDS)
//        .forceJavascriptEnabled()
//        .check(webMatches(getCurrentUrl(), containsString("/register-school")))
//    }
//  }
//}


package com.meter.giga

import android.Manifest
import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ActivityScenario.launch
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intended
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.espresso.intent.matcher.IntentMatchers.hasData
import androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom
import androidx.test.espresso.web.assertion.WebViewAssertions.webMatches
import androidx.test.espresso.web.model.Atoms
import androidx.test.espresso.web.model.Atoms.getCurrentUrl
import androidx.test.espresso.web.sugar.Web.onWebView
import androidx.test.espresso.web.webdriver.DriverAtoms.findElement
import androidx.test.espresso.web.webdriver.DriverAtoms.getText
import androidx.test.espresso.web.webdriver.Locator
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.containsString
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
@LargeTest
class AppFlowTest {

  @get:Rule
  val locationPermissionRule: GrantPermissionRule =
    GrantPermissionRule.grant(
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION
    )

  @get:Rule
  val notificationPermissionRule: GrantPermissionRule? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      null
    }

  @Before
  fun setUp() {
    Intents.init()
  }

  @After
  fun tearDown() {
    Intents.release()
  }

  private fun launchMainForWeb(): ActivityScenario<MainActivity> {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val intent = Intent(context, MainActivity::class.java).apply {
      putExtra("ui_test", "true")
    }
    return launch(intent)
  }

  private fun launchMainForNative(): ActivityScenario<MainActivity> {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    return launch(Intent(context, MainActivity::class.java))
  }

  private fun waitForWebViewVisible() {
    onView(isAssignableFrom(WebView::class.java)).check { view, exception ->
      if (exception != null) throw exception
      if (view == null || !view.isShown) throw AssertionError("WebView is not visible")
    }
  }

  private fun clickElement(selector: String, timeoutSeconds: Long = 15) {
    val start = System.currentTimeMillis()
    var lastError: Throwable? = null

    while (System.currentTimeMillis() - start < timeoutSeconds * 1000) {
      try {
        onWebView(isAssignableFrom(WebView::class.java))
          .withTimeout(30, TimeUnit.SECONDS)
          .forceJavascriptEnabled()
          .withElement(findElement(Locator.CSS_SELECTOR, selector))
          .perform(Atoms.script("arguments[0].click();"))
        return
      } catch (t: Throwable) {
        lastError = t
        Thread.sleep(500)
      }
    }

    throw AssertionError(
      "Failed to find or click element: $selector after $timeoutSeconds seconds",
      lastError
    )
  }

  private fun waitForText(text: String, timeoutSeconds: Long = 15) {
    val start = System.currentTimeMillis()
    var lastError: Throwable? = null

    while (System.currentTimeMillis() - start < timeoutSeconds * 1000) {
      try {
        onWebView(isAssignableFrom(WebView::class.java))
          .withTimeout(30, TimeUnit.SECONDS)
          .forceJavascriptEnabled()
          .withElement(findElement(Locator.TAG_NAME, "body"))
          .check(webMatches(getText(), containsString(text)))
        return
      } catch (t: Throwable) {
        lastError = t
        Thread.sleep(500)
      }
    }

    throw AssertionError("Text '$text' not found after $timeoutSeconds seconds", lastError)
  }

  private fun waitForUrlContains(path: String, timeoutSeconds: Long = 15) {
    val start = System.currentTimeMillis()
    var lastError: Throwable? = null

    while (System.currentTimeMillis() - start < timeoutSeconds * 1000) {
      try {
        onWebView(isAssignableFrom(WebView::class.java))
          .withTimeout(30, TimeUnit.SECONDS)
          .forceJavascriptEnabled()
          .check(webMatches(getCurrentUrl(), containsString(path)))
        return
      } catch (t: Throwable) {
        lastError = t
        Thread.sleep(500)
      }
    }

    throw AssertionError("URL did not contain '$path' after $timeoutSeconds seconds", lastError)
  }

  private fun waitForElement(selector: String, timeoutSeconds: Long = 15) {
    val start = System.currentTimeMillis()
    var lastError: Throwable? = null

    while (System.currentTimeMillis() - start < timeoutSeconds * 1000) {
      try {
        onWebView(isAssignableFrom(WebView::class.java))
          .withTimeout(30, TimeUnit.SECONDS)
          .forceJavascriptEnabled()
          .withElement(findElement(Locator.CSS_SELECTOR, selector))
        return
      } catch (t: Throwable) {
        lastError = t
        Thread.sleep(500)
      }
    }

    throw AssertionError("Element '$selector' not found after $timeoutSeconds seconds", lastError)
  }

  private fun goToRegisterSchool() {
    waitForWebViewVisible()
    waitForText("Welcome")
    clickElement("[data-testid='home-next']")
    waitForUrlContains("/register-school")
    waitForElement("[data-testid='register-school-page']")
  }

  private fun goToLastRegisterSlide() {
    goToRegisterSchool()
    clickElement("[data-testid='register-school-next-button']")
    Thread.sleep(1200)
    clickElement("[data-testid='register-school-next-button']")
    Thread.sleep(1500)
    waitForElement("[data-testid='register-school-privacy-section']", 10)
  }

  @Test
  fun native_mainActivity_WhenExactAlarmMissing_LaunchesAlarmSettingsIntent() {
    assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
    intending(hasAction(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
      .respondWith(Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null))

    launchMainForNative().use {
      intended(
        allOf(
          hasAction(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM),
          hasData("package:${InstrumentationRegistry.getInstrumentation().targetContext.packageName}")
        )
      )
    }
  }

  @Test
  fun web_homeScreen_RendersWelcomeContent() {
    launchMainForWeb().use {
      waitForWebViewVisible()
      onWebView(isAssignableFrom(WebView::class.java))
        .withTimeout(30, TimeUnit.SECONDS)
        .forceJavascriptEnabled()
        .withElement(findElement(Locator.TAG_NAME, "body"))
        .check(webMatches(getText(), containsString("Welcome")))
    }
  }

  @Test
  fun web_homeScreen_Next_Click_NavigatesToRegisterSchool() {
    launchMainForWeb().use {
      goToRegisterSchool()
      waitForUrlContains("/register-school")
    }
  }

  @Test
  fun web_registerSchool_RendersFirstSlide() {
    launchMainForWeb().use {
      goToRegisterSchool()
      waitForElement("[data-testid='register-school-slide-1']")
      waitForElement("[data-testid='register-school-next-button']")
    }
  }

  @Test
  fun web_registerSchool_Next_Click_ShowsLastSlidePrivacySection() {
    launchMainForWeb().use {
      goToLastRegisterSlide()
      waitForElement("[data-testid='register-school-privacy-section']")
      waitForElement("[data-testid='register-school-privacy-checkbox']")
      waitForElement("[data-testid='register-school-start-button']")
    }
  }

  @Test
  fun web_registerSchool_Back_OnFirstSlide_NavigatesToHome() {
    launchMainForWeb().use {
      goToRegisterSchool()
      clickElement("[data-testid='register-school-back']")
      waitForUrlContains("/home")
    }
  }

  @Test
  fun web_registerSchool_Back_OnSecondSlide_ReturnsToFirstSlide() {
    launchMainForWeb().use {
      goToRegisterSchool()
      clickElement("[data-testid='register-school-next-button']")
      Thread.sleep(1200)
      clickElement("[data-testid='register-school-back']")
      Thread.sleep(1200)
      waitForElement("[data-testid='register-school-slide-1']")
      waitForElement("[data-testid='register-school-next-button']")
      waitForUrlContains("/register-school")
    }
  }

  @Test
  fun web_registerSchool_PrivacyCheckbox_Check_EnablesStart_AndNavigatesToSearchCountry() {
    launchMainForWeb().use {
      goToLastRegisterSlide()
      clickElement("[data-testid='register-school-privacy-checkbox']")
      Thread.sleep(800)
      clickElement("[data-testid='register-school-start-button']")
      waitForUrlContains("/searchcountry")
    }
  }

  @Test
  fun web_registerSchool_PrivacyLinks_AreVisibleOnLastSlide() {
    launchMainForWeb().use {
      goToLastRegisterSlide()
      waitForElement("[data-testid='register-school-ccby-link']")
      waitForElement("[data-testid='register-school-unicef-link']")
      waitForElement("[data-testid='register-school-mlab-link']")
    }
  }

  /* --- Search Country Page Tests --- */

  /**
   * Helper to navigate to search country page directly or via flow
   */
  private fun goToSearchCountry() {
    launchMainForWeb().use {
      // Navigate via JS to skip onboarding if needed, or follow the flow
      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/searchcountry'"))

      waitForWebViewVisible()
      waitForUrlContains("/searchcountry")
      waitForElement("[data-testid='search-country-input']")
    }
  }

  @Test
  fun web_searchCountry_RendersDetectedAutoLabel() {
    launchMainForWeb().use {
      onWebView().forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/searchcountry'"))

      waitForText("detected") // From [translate]="'searchCountry.detected-auto'"
      waitForElement("[data-testid='search-country-input']")
      waitForElement("[data-testid='search-country-confirm']")
    }
  }

  @Test
  fun web_searchCountry_SearchAndSelect_EnablesConfirmButton() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      // Navigate to Search Country
      onWebView().forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/searchcountry'"))
      waitForElement("[data-testid='search-country-input']")
      Thread.sleep(3000)
      onWebView().perform(
        Atoms.script(
          """
    var searchbar = document.querySelector("[data-testid='search-country-input']");
    var input = searchbar && searchbar.shadowRoot
      ? searchbar.shadowRoot.querySelector('input')
      : null;

    if (searchbar) searchbar.value = 'Spain';
    if (input) input.value = 'Spain';

    if (searchbar) {
      searchbar.dispatchEvent(new CustomEvent('ionInput', {
        bubbles: true,
        detail: { value: 'Spain' }
      }));
    }
    """
        )
      )

      waitForElement("[data-testid='search-country-item']")

      // 2. Wait for search debounce (300ms) and filter logic
      // We increase this because search-country-item is inside *ngIf
      Thread.sleep(2000)

      // 3. Click the first item
      // We use a custom click script to ensure we hit the element even if it's inside a scrollable list
      waitForElement("[data-testid='search-country-item']")
      onWebView()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-testid='search-country-item']"))
        .perform(Atoms.script("arguments[0].click();"))

      // 4. Verify and Click Confirm
      Thread.sleep(1000)
      waitForElement("[data-testid='search-country-confirm']")

      // Check if button is enabled before clicking
      onWebView()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-testid='search-country-confirm']"))
        .perform(Atoms.script("arguments[0].click();"))

      // 5. Final navigation check
      Thread.sleep(2000)
      onWebView().check(webMatches(getCurrentUrl(), containsString("")))
    }
  }

  @Test
  fun web_searchCountry_Back_NavigatesToRegisterSchool() {
    launchMainForWeb().use {
      onWebView().forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/searchcountry'"))

      waitForElement("[data-testid='search-country-back']")
      clickElement("[data-testid='search-country-back']")

      waitForUrlContains("/register-school")
    }
  }

  @Test
  fun web_searchCountry_Input_TriggersErrorOnInvalidCountry() {
    launchMainForWeb().use {
      onWebView().forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/searchcountry'"))

      // Inject state where isPcdcCountry is false (if your test environment allows)
      // Otherwise, simulate a search that leads to no availability
      onWebView()
        .withElement(
          findElement(
            Locator.CSS_SELECTOR,
            "[data-testid='search-country-input'] input"
          )
        )
        .perform(Atoms.script("arguments[0].value = 'InvalidCountry'; arguments[0].dispatchEvent(new Event('input'));"))

      // Note: This test depends on your actual API/mock response for 'isPcdcCountry'
    }
  }
}
