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


  private void handlePluginEvent(PluginEvent event) {
    if (event == null) return;

    AppLogger.INSTANCE.d("MAIN Activity", "Received plugin event: " + event.getAction()
      + ", payload: " + event.getPayload());

    switch (event.getAction()) {

      case PluginEvent.ACTION_APP_CHECK_AVAILABLE:
        AppLogger.INSTANCE.d("MAIN Activity", Objects.requireNonNull(event.getPayload()));
        startUpdateFlow();
        break;

      case PluginEvent.ACTION_APP_CHECK_NOT_AVAILABLE:
        AppLogger.INSTANCE.d("MAIN Activity", Objects.requireNonNull(event.getPayload()));
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
      popupSnackbarForCompleteUpdate();
    }
  };

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

  @Override
  public void onStart() {
    super.onStart();
    AppUpdateCheckEventBus.setListener(pluginEventListener);
    AppLogger.INSTANCE.d("MAIN Activity", "AppEventBus listener registered");
  }

  @Override
  public void onStop() {
    super.onStop();
    AppUpdateCheckEventBus.removeListener();
    AppLogger.INSTANCE.d("MAIN Activity", "AppEventBus listener removed");
  }

  private boolean isUiTest() {
    Intent intent = getIntent();
    return intent != null && "true".equals(intent.getStringExtra("ui_test"));
  }

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

  private void onNotificationStepComplete() {
    initAppUpdateCheck();
    checkAlarmPermission(true);
  }

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

  private boolean isAlarmPermissionGranted() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
      return am != null && am.canScheduleExactAlarms();
    }
    return true;
  }

  private void navigateToAlarmSettings() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
      intent.setData(Uri.parse("package:" + getPackageName()));
      alarmPermissionLauncher.launch(intent);
    }
  }

  private void showAlarmMandatoryDialog() {
    new AlertDialog.Builder(this)
      .setTitle("Exact Alarm Required")
      .setMessage("This app requires 'Exact Alarm' permission to function in the background. Please enable it in Settings.")
      .setCancelable(false)
      .setPositiveButton("Go to Settings", (dialog, which) -> navigateToAlarmSettings())
      .setNegativeButton("Exit App", (dialog, which) -> finishAffinity())
      .show();
  }

  private void checkLocationPermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this,
        new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
        REQ_LOCATION_PERMISSION);
    }
  }


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

  private void handleIntent(Intent intent) {
    if (intent != null && intent.getBooleanExtra("START_UPDATE", false)) {
      startUpdateFlow();
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleIntent(intent);
  }

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

  private void popupSnackbarForCompleteUpdate() {
    Snackbar snackbar = Snackbar.make(findViewById(android.R.id.content), "New update ready! Restart to install.", Snackbar.LENGTH_INDEFINITE);
    snackbar.setAction("RESTART", v -> {
      if (appUpdateManager != null) appUpdateManager.completeUpdate();
    });
    snackbar.setActionTextColor(ContextCompat.getColor(this, android.R.color.holo_blue_dark));
    snackbar.show();
  }
}
