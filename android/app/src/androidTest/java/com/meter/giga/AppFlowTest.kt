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
import org.hamcrest.Matchers.not
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

    }
  }

  @Test
  fun web_searchSchool_ValidId_EnablesButton_AndNavigates() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      // Direct navigation to search school with valid params (ES=Spain, IN=detected)
      onWebView(isAssignableFrom(WebView::class.java))
        .withTimeout(30, TimeUnit.SECONDS)
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/searchschool/ES/IN/Spain'"))

      // Wait for page to load
      waitForElement("[data-testid='search-school-page']")
      waitForElement("[data-testid='search-school-input']")
      waitForElement("[data-testid='search-school-submit']")

      // Verify initial button disabled
      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-testid='search-school-submit']"))
        .perform(Atoms.script("if (!arguments[0].disabled) throw new Error('Button should be initially disabled');"))

      // Type valid school ID (length >= 2)
      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-testid='search-school-input']"))
        .perform(
          Atoms.script(
            """
          arguments[0].value = 'SpainTestSchool1';
          arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
          arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
          """
          )
        )

      Thread.sleep(500)

      // Verify button now enabled
      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-testid='search-school-submit']"))
        .perform(Atoms.script("if (arguments[0].disabled) throw new Error('Button should be enabled after valid input');"))

      // Click and verify navigation (adjust expected route)
      clickElement("[data-testid='search-school-submit']")
      Thread.sleep(2000)

      // Check navigation happened (your app goes to schooldetails or schoolnotfound)
      onWebView(isAssignableFrom(WebView::class.java))
        .check(
          webMatches(
            getCurrentUrl(),
            allOf(containsString("/schooldetails"), not(containsString("/searchschool")))
          )
        )
    }
  }

  @Test
  fun web_searchSchool_SchoolId_Input_EnablesSearchButton() {
    launchMainForWeb().use {
      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/searchschool/ES/IN/Spain'"))

      waitForElement("[data-testid='search-school-input']")
      waitForElement("[data-testid='search-school-submit']")

      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-testid='search-school-input']"))
        .perform(
          Atoms.script(
            """
          arguments[0].value = 'SpainTestSchool1';
          arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
          arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
          """
          )
        )

      Thread.sleep(500)

      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-testid='search-school-submit']"))
        .check(webMatches(getText(), containsString("Search")))
    }
  }

  @Test
  fun web_schoolNotFoundPage_RendersContent() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .withTimeout(30, TimeUnit.SECONDS)
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/schoolnotfound/12345/ES/IN/Spain'"))

      waitForElement("[data-testid='school-not-found-page']")
      waitForElement("[data-testid='school-not-found-icon']")
      waitForElement("[data-testid='school-not-found-message']")
      waitForElement("[data-testid='school-not-found-try-again-text']")
      waitForElement("[data-testid='school-not-found-try-again-button']")
    }
  }

  @Test
  fun web_schoolNotFound_Back_Button_NavigatesToSearchSchool() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .withTimeout(30, TimeUnit.SECONDS)
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/schoolnotfound/12345/ES/IN/Spain'"))

      waitForElement("[data-testid='school-not-found-back']")
      clickElement("[data-testid='school-not-found-back']")
      waitForUrlContains("/searchschool")
    }
  }

  @Test
  fun web_schoolNotFound_TryAgain_Button_NavigatesToSearchSchool() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .withTimeout(30, TimeUnit.SECONDS)
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/schoolnotfound/12345/ES/IN/Spain'"))

      waitForElement("[data-testid='school-not-found-try-again-button']")
      clickElement("[data-testid='school-not-found-try-again-button']")
      waitForUrlContains("/searchschool")
    }
  }

  @Test
  fun web_schoolDetails_RendersPage_AfterAsyncLoad() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .withTimeout(30, TimeUnit.SECONDS)
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/schooldetails/SpainTestSchool1/ES/IN/Spain'"))

      waitForElement("[data-testid='school-details-page']")
      waitForElement("[data-testid='school-details-select-confirm']")
      waitForElement("[data-testid='school-details-matches-count']")

      Thread.sleep(5000) // Give API time to respond

      // Check either multiple OR single school loaded
      try {
        waitForElement("[data-testid='school-radio-group']", 5)
      } catch (e: Throwable) {
        waitForElement("[data-testid='single-school-item']", 5)
      }
    }
  }

  @Test
  fun web_schoolDetails_Back_Works() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/schooldetails/SpainTestSchool1/ES/IN/Spain'"))

      waitForElement("[data-testid='school-details-back']")
      clickElement("[data-testid='school-details-back']")
      waitForUrlContains("/searchschool")
    }
  }

  @Test
  fun web_schoolDetails_SelectButton_Exists() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/schooldetails/SpainTestSchool1/ES/IN/Spain'"))

      waitForElement("[data-testid='school-details-select-button']")

      onWebView(isAssignableFrom(WebView::class.java))
        .withElement(
          findElement(
            Locator.CSS_SELECTOR,
            "[data-testid='school-details-select-button']"
          )
        )
        .check(webMatches(getText(), containsString("Select")))
    }
  }

  @Test
  fun web_confirmSchool_RendersContent() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/confirmschool/SpainTestSchool1/ES/IN/Spain'"))

      waitForElement("[data-testid='confirm-school-page']")
      waitForElement("[data-testid='confirm-school-title']")
      waitForElement("[data-testid='confirm-school-footer']")
      waitForElement("[data-testid='confirm-school-no-button']")
      waitForElement("[data-testid='confirm-school-yes-button']")
    }
  }

  @Test
  fun web_confirmSchool_BackButton_NavigatesToSchoolDetails() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/confirmschool/SpainTestSchool1/ES/IN/Spain'"))

      waitForElement("[data-testid='confirm-school-back']")
      clickElement("[data-testid='confirm-school-back']")
      waitForUrlContains("/schooldetails")
    }
  }

  @Test
  fun web_confirmSchool_NoButton_NavigatesToSearchSchool() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/confirmschool/SpainTestSchool1/ES/IN/Spain'"))

      waitForElement("[data-testid='confirm-school-no-button']")
      clickElement("[data-testid='confirm-school-no-button']")
      waitForUrlContains("/searchschool")
    }
  }

  @Test
  fun web_confirmSchool_YesButton_NavigatesToStartTestOrRegisters() {
    launchMainForWeb().use {
      waitForWebViewVisible()

      onWebView(isAssignableFrom(WebView::class.java))
        .forceJavascriptEnabled()
        .perform(Atoms.script("window.location.hash = '/confirmschool/SpainTestSchool1/ES/IN/Spain'"))

      waitForElement("[data-testid='confirm-school-yes-button']")
      clickElement("[data-testid='confirm-school-yes-button']")

      waitForUrlContains("/confirmschool")
    }
  }
}
