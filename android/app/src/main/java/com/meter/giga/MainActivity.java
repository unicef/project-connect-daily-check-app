package com.meter.giga;

import static com.meter.giga.utils.Constants.REQ_NOTIF_PERMISSION;
import static com.meter.giga.utils.Constants.REQ_STORAGE_PERMISSION;


import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ListenableWorker;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.tasks.OnSuccessListener;
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
import com.meter.giga.ararm_scheduler.AlarmHelper;
import com.meter.giga.ionic_plugin.GigaAppPlugin;
import com.meter.giga.utils.AppLogger;
import com.meter.giga.worker.UpdateCheckWorker;

import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {
  private AppUpdateManager appUpdateManager;


  private final ActivityResultLauncher<IntentSenderRequest> updateFlowLauncher =
    registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(),
      result -> {
        if (result.getResultCode() != RESULT_OK) {
          // Handle update not started/cancelled
          Log.d("Update", "Update flow cancelled");
        }
      });

  private final ActivityResultLauncher<Intent> alarmPermissionLauncher =
    registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),
      r -> {
        AppLogger.INSTANCE.d("GIGA MainActivity", "Alarm Permission Status : " + r.toString());
        AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
          showPermissionDialog();
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
    // This will required if local file read/write required
    //checkStoragePermission(this);
    checkNotificationPermission(this);
    handleIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleIntent(intent);
  }

  private void handleIntent(Intent intent) {
    if (intent != null && intent.getBooleanExtra("START_UPDATE", false)) {
      startUpdateFlow();
    }
  }

  private void popupSnackbarForCompleteUpdate() {
    Snackbar snackbar = Snackbar.make(
      findViewById(android.R.id.content),
      "New update ready! Restart to install.",
      Snackbar.LENGTH_INDEFINITE
    );
    snackbar.setAction("RESTART", v -> {
      if (appUpdateManager != null) {
        appUpdateManager.completeUpdate();
      }
    });
    snackbar.setActionTextColor(ContextCompat.getColor(this, android.R.color.holo_blue_dark));
    snackbar.show();
  }

  private void startUpdateFlow() {
    appUpdateManager = AppUpdateManagerFactory.create(this);
    appUpdateManager.registerListener(installStateListener);
    Task<AppUpdateInfo> appUpdateInfo = appUpdateManager.getAppUpdateInfo();
    appUpdateInfo.addOnSuccessListener(info -> {
      if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
        // Use modern API with AppUpdateOptions
        AppUpdateOptions options = AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE);

        appUpdateManager.startUpdateFlowForResult(
          info,
          updateFlowLauncher,
          options);
      }
    });
  }

  private void showPermissionDialog() {
    Activity activity = this;
    AlertDialog.Builder builder = new AlertDialog.Builder(activity);
    builder.setTitle("Exact Alarm Required");
    builder.setMessage("This app requires exact alarm permission to function properly.");
    builder.setCancelable(false);

    builder.setPositiveButton("Grant Permission", new DialogInterface.OnClickListener() {
      @Override
      public void onClick(DialogInterface dialog, int which) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
          if (!am.canScheduleExactAlarms()) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + activity.getPackageName()));

            alarmPermissionLauncher.launch(intent);    // modern API
          }
        }
      }
    });

    builder.setNegativeButton("Exit App", new DialogInterface.OnClickListener() {
      @Override
      public void onClick(DialogInterface dialog, int which) {
        activity.finishAffinity();
      }
    });

    builder.show();
  }


  /**
   * This function is used to check the storage permission
   *
   * @param context
   */
  private void checkStoragePermission(Context context) {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q &&
      ContextCompat.checkSelfPermission(this, android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
        != PackageManager.PERMISSION_GRANTED) {

      ActivityCompat.requestPermissions(this,
        new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE},
        REQ_STORAGE_PERMISSION);
      return;
    }
    checkNotificationPermission(context);       // 2️⃣
  }

  /**
   * This function is getting used to check the Notification Permission
   * This is mandatory to grant to execute the scheduled background
   * speed test in background
   *
   * @param context
   */
  private void checkNotificationPermission(Context context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
        != PackageManager.PERMISSION_GRANTED) {

      ActivityCompat.requestPermissions(this,
        new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
        REQ_NOTIF_PERMISSION);
      return;
    }
    checkAlarmPermission();
  }

// Need to enable if need to get background operation permission
//  private void checkAllowBackGroundPermission() {
//    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
//    if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
//      new AlertDialog.Builder(this)
//        .setTitle("Allow background activity")
//        .setMessage("To ensure continuous network checks and uploads even when the device sleeps, " +
//          "please allow the app to ignore battery optimizations. This enables reliable background " +
//          "network access. You can revoke this later in system settings.")
//        .setPositiveButton("Allow", (dialog, which) -> {
//          try {
//            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
//            intent.setData(Uri.parse("package:" + getPackageName()));
//            startActivity(intent);
//          } catch (Exception e) {
//            // Fallback: open the full battery optimization settings screen
//            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
//            startActivity(intent);
//          }
//        })
//        .setNegativeButton("Cancel", null)
//        .show();
//    }
//  }

  /**
   * This function is getting used to check the Schedule Alarm Permission
   * This is mandatory to grant to schedule the speed test in background
   * when system in idle or sleep state
   */
  private void checkAlarmPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
      if (!am.canScheduleExactAlarms()) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        intent.setData(Uri.parse("package:" + this.getPackageName()));

        alarmPermissionLauncher.launch(intent);    // modern API
      }
    }     // ✅ all done
  }

  /**
   * This function provides callback on Permission Granted ot Rejected
   *
   * @param code  the request code associated with the permission request
   * @param perms the Android permission strings requested
   * @param res   the status result of the permission request
   */
  @Override
  public void onRequestPermissionsResult(int code, @NonNull String[] perms,
                                         @NonNull int[] res) {
    super.onRequestPermissionsResult(code, perms, res);

    if (code == REQ_STORAGE_PERMISSION) {
      checkStoragePermission(this);            // continue chain
    } else if (code == REQ_NOTIF_PERMISSION) {
      checkNotificationPermission(this);
    }
  }
}
