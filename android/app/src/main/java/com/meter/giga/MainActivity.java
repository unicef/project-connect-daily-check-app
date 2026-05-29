package com.meter.giga;

import android.Manifest;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.tasks.Task;
import com.google.android.material.snackbar.Snackbar;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.meter.giga.ionic_plugin.GigaAppPlugin;
import com.meter.giga.utils.AppLogger;
import com.meter.giga.utils.AppUpdateCheckEventBus;
import com.meter.giga.utils.PluginEvent;
import com.meter.giga.worker.UpdateCheckWorker;

import java.util.Objects;
import java.util.concurrent.TimeUnit;

import io.sentry.Sentry;

public class MainActivity extends BridgeActivity {
  private AppUpdateManager appUpdateManager;
  private static final int REQ_NOTIF_PERMISSION = 101;
  private static final int REQ_LOCATION_PERMISSION = 102;


  // Lambda works because EventListener is a @JvmFunctional (fun interface)
  private final AppUpdateCheckEventBus.EventListener pluginEventListener = event ->
    runOnUiThread(() -> handlePluginEvent(event));

  /**
   * Handles incoming plugin events from the application update check flow.
   *
   * <p>This method processes different plugin event actions and performs the
   * corresponding operations such as:
   * <ul>
   *   <li>Logging event details for debugging purposes.</li>
   *   <li>Capturing update status messages in Sentry.</li>
   *   <li>Starting the app update flow when an update is available.</li>
   *   <li>Displaying a toast message when no update is available.</li>
   * </ul>
   *
   * <p>Supported actions:
   * <ul>
   *   <li>{@code ACTION_APP_CHECK_AVAILABLE} - Triggers the update flow.</li>
   *   <li>{@code ACTION_APP_CHECK_NOT_AVAILABLE} - Shows a message indicating
   *       no update is available.</li>
   * </ul>
   *
   * @param event the {@link PluginEvent} received from the plugin.
   *              If {@code null}, the method returns without processing.
   */
  private void handlePluginEvent(PluginEvent event) {
    if (event == null) return;

    AppLogger.INSTANCE.d("MAIN Activity", "Received plugin event: " + event.getAction()
      + ", payload: " + event.getPayload());

    switch (event.getAction()) {

      case PluginEvent.ACTION_APP_CHECK_AVAILABLE:
        AppLogger.INSTANCE.d("MAIN Activity", Objects.requireNonNull(event.getPayload()));
        Sentry.captureMessage("New update available");
        startUpdateFlow();
        break;

      case PluginEvent.ACTION_APP_CHECK_NOT_AVAILABLE:
        AppLogger.INSTANCE.d("MAIN Activity", Objects.requireNonNull(event.getPayload()));
        Sentry.captureMessage("New update not available");
        Toast.makeText(this, event.getPayload(), Toast.LENGTH_SHORT).show();
        break;

      default:
        AppLogger.INSTANCE.d("MAIN Activity", "Unknown event action: " + event.getAction());
        break;
    }
  }

  private final ActivityResultLauncher<Intent> alarmPermissionLauncher =
    registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),
      result -> {
        if (isAlarmPermissionGranted()) {
          checkLocationPermission();
        } else {
          showAlarmMandatoryDialog();
        }
      });

  private final ActivityResultLauncher<IntentSenderRequest> updateFlowLauncher =
    registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(),
      result -> {
        if (result.getResultCode() != RESULT_OK) {
          AppLogger.INSTANCE.d("Update", "Update flow cancelled");
        }
      });

  private final InstallStateUpdatedListener installStateListener = state -> {
    if (state.installStatus() == InstallStatus.DOWNLOADED) {
      AppLogger.INSTANCE.d("Update", "App is downloaded");
      Sentry.captureMessage("App is downloaded");
      popupSnackbarForCompleteUpdate();
    } else {
      AppLogger.INSTANCE.d("Update", "App download failed");
      Sentry.captureMessage("App download failed");
    }
  };

  /**
   * Registers required plugins, initializes UI configurations,
   * handles incoming intents, and starts the permission flow.
   *
   * <p>This is the entry point of the activity lifecycle where:
   * <ul>
   *   <li>Capacitor plugins are registered.</li>
   *   <li>WebView debugging is enabled for debug builds.</li>
   *   <li>Incoming update intents are processed.</li>
   *   <li>Permission checks are initiated.</li>
   * </ul>
   *
   * @param savedInstanceState previously saved state of the activity.
   */

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(GigaAppPlugin.class);
    super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

    if (BuildConfig.DEBUG) {
      WebView.setWebContentsDebuggingEnabled(true);
    }

    handleIntent(getIntent());

    if (isUiTest()) {
      return;
    }

    checkNotificationPermission();
  }


  /**
   * Registers the plugin event listener when the activity becomes visible.
   *
   * <p>This ensures update-related events emitted through
   * {@link AppUpdateCheckEventBus} are received while the activity
   * is in the foreground.
   */
  @Override
  public void onStart() {
    super.onStart();
    AppUpdateCheckEventBus.setListener(pluginEventListener);
    AppLogger.INSTANCE.d("MAIN Activity", "AppEventBus listener registered");
  }

  /**
   * Removes the plugin event listener when the activity is no longer visible.
   *
   * <p>This prevents memory leaks and avoids receiving events
   * when the activity is stopped.
   */
  @Override
  public void onStop() {
    super.onStop();
    AppUpdateCheckEventBus.removeListener();
    AppLogger.INSTANCE.d("MAIN Activity", "AppEventBus listener removed");
  }

  /**
   * Determines whether the application is running in UI test mode.
   *
   * <p>UI test mode is enabled when the launching intent contains
   * the extra value {@code ui_test=true}.
   *
   * @return {@code true} if running in UI test mode, otherwise {@code false}.
   */
  private boolean isUiTest() {
    Intent intent = getIntent();
    return intent != null && "true".equals(intent.getStringExtra("ui_test"));
  }

  /**
   * Checks and requests notification permission on Android 13+ devices.
   *
   * <p>If permission is already granted or the device version is below
   * Android Tiramisu, the next setup step is triggered immediately.
   */
  private void checkNotificationPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(this,
          new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF_PERMISSION);
      } else {
        onNotificationStepComplete();
      }
    } else {
      onNotificationStepComplete();
    }
  }

  /**
   * Executes the next initialization steps after notification permission
   * handling is completed.
   *
   * <p>This method:
   * <ul>
   *   <li>Initializes periodic app update checks.</li>
   *   <li>Starts exact alarm permission validation.</li>
   * </ul>
   */
  private void onNotificationStepComplete() {
    initAppUpdateCheck();
    checkAlarmPermission(true);
  }

  /**
   * Validates whether the application has exact alarm scheduling permission.
   *
   * <p>If permission is unavailable, the user is either redirected to
   * settings or shown a mandatory permission dialog.
   *
   * @param directNavigate determines whether the user should be directly
   *                       redirected to alarm settings.
   */
  private void checkAlarmPermission(boolean directNavigate) {
    if (isAlarmPermissionGranted()) {
      checkLocationPermission();
    } else {
      if (directNavigate && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        navigateToAlarmSettings();
      } else {
        showAlarmMandatoryDialog();
      }
    }
  }

  /**
   * Checks whether exact alarm scheduling permission is granted.
   *
   * <p>For Android S and above, this validates the
   * {@code SCHEDULE_EXACT_ALARM} capability.
   *
   * @return {@code true} if exact alarm scheduling is permitted,
   * otherwise {@code false}.
   */
  private boolean isAlarmPermissionGranted() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
      return am != null && am.canScheduleExactAlarms();
    }
    return true;
  }

  /**
   * Navigates the user to the system settings screen for granting
   * exact alarm scheduling permission.
   *
   * <p>This is applicable only for Android S and above.
   */
  private void navigateToAlarmSettings() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
      intent.setData(Uri.parse("package:" + getPackageName()));
      alarmPermissionLauncher.launch(intent);
    }
  }

  /**
   * Displays a non-cancelable dialog explaining why exact alarm
   * permission is mandatory for the application.
   *
   * <p>The dialog provides options to:
   * <ul>
   *   <li>Open settings and grant permission.</li>
   *   <li>Exit the application.</li>
   * </ul>
   */
  private void showAlarmMandatoryDialog() {
    new AlertDialog.Builder(this)
      .setTitle("Exact Alarm Required")
      .setMessage("This app requires 'Exact Alarm' permission to function in the background. Please enable it in Settings.")
      .setCancelable(false)
      .setPositiveButton("Go to Settings", (dialog, which) -> navigateToAlarmSettings())
      .setNegativeButton("Exit App", (dialog, which) -> finishAffinity())
      .show();
  }

  /**
   * Checks and requests fine/coarse location permissions.
   *
   * <p>Location access is required for background scheduling
   * and measurement-related features.
   */
  private void checkLocationPermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this,
        new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
        REQ_LOCATION_PERMISSION);
    }
  }

  /**
   * Callback invoked after the user responds to runtime permission requests.
   *
   * <p>Handles:
   * <ul>
   *   <li>Notification permission flow.</li>
   *   <li>Location permission flow.</li>
   * </ul>
   *
   * @param code  request code identifying the permission request.
   * @param perms requested permissions.
   * @param res   grant results corresponding to requested permissions.
   */
  @Override
  public void onRequestPermissionsResult(int code, @NonNull String[] perms, @NonNull int[] res) {
    super.onRequestPermissionsResult(code, perms, res);
    AppLogger.INSTANCE.d("App Update", "App update check installer");

    if (code == REQ_NOTIF_PERMISSION) {
      if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) {
        onNotificationStepComplete();
      } else {
        Toast.makeText(this, "Notification permission is required.", Toast.LENGTH_SHORT).show();
        checkNotificationPermission();
      }
    } else if (code == REQ_LOCATION_PERMISSION) {
      AppLogger.INSTANCE.d("App Update", "App update check Location");
      initAppUpdateCheck();
      AppLogger.INSTANCE.d("GIGA", "Location sequence finished.");
    }
  }

  /**
   * Initializes periodic background app update checks using WorkManager.
   *
   * <p>A unique periodic worker is scheduled to execute every 24 hours
   * to verify whether a new application update is available.
   */
  private void initAppUpdateCheck() {
    AppLogger.INSTANCE.d("App Update", "App update check installer");
    Sentry.captureMessage("Updated Checker executed On App Launch");

    PeriodicWorkRequest workRequest =
      new PeriodicWorkRequest.Builder(UpdateCheckWorker.class, 24, TimeUnit.HOURS).build();
    WorkManager.getInstance(this).enqueueUniquePeriodicWork(
      "update_check",
      ExistingPeriodicWorkPolicy.KEEP,
      workRequest
    );
  }

  /**
   * Processes incoming intents related to update actions.
   *
   * <p>If the intent contains {@code START_UPDATE=true},
   * the in-app update flow is triggered.
   *
   * @param intent the incoming activity intent.
   */
  private void handleIntent(Intent intent) {
    if (intent != null && intent.getBooleanExtra("START_UPDATE", false)) {
      startUpdateFlow();
    }
  }

  /**
   * Handles newly delivered intents while the activity is already running.
   *
   * <p>This ensures update-related intents are processed correctly
   * without recreating the activity.
   *
   * @param intent the newly received intent.
   */
  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleIntent(intent);
  }

  /**
   * Starts the Google Play in-app update flow using flexible update mode.
   *
   * <p>This method:
   * <ul>
   *   <li>Initializes the {@link AppUpdateManager}.</li>
   *   <li>Registers install state listeners.</li>
   *   <li>Checks for update availability.</li>
   *   <li>Launches the update flow if an update exists.</li>
   * </ul>
   */
  private void startUpdateFlow() {
    appUpdateManager = AppUpdateManagerFactory.create(this);
    appUpdateManager.registerListener(installStateListener);
    Task<AppUpdateInfo> appUpdateInfo = appUpdateManager.getAppUpdateInfo();
    appUpdateInfo.addOnSuccessListener(info -> {
      if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
        AppUpdateOptions options = AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE);
        appUpdateManager.startUpdateFlowForResult(info, updateFlowLauncher, options);
      }
    });
  }

  /**
   * Displays a persistent snackbar prompting the user
   * to restart the application after an update is downloaded.
   *
   * <p>Clicking the restart action completes the flexible update installation.
   */
  private void popupSnackbarForCompleteUpdate() {
    Snackbar snackbar = Snackbar.make(findViewById(android.R.id.content), "New update ready! Restart to install.", Snackbar.LENGTH_INDEFINITE);
    snackbar.setAction("RESTART", v -> {
      if (appUpdateManager != null) appUpdateManager.completeUpdate();
    });
    snackbar.setActionTextColor(ContextCompat.getColor(this, android.R.color.holo_blue_dark));
    snackbar.show();
  }
}
