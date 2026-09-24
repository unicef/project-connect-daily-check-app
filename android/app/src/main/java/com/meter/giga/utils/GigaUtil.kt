package com.meter.giga.utils

import android.app.AlarmManager
import android.content.Context
import android.location.Location
import android.os.Build
import androidx.core.content.pm.PackageInfoCompat
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.reflect.TypeToken
import com.meter.giga.domain.entity.history.AccessInformation
import com.meter.giga.domain.entity.history.DataUsage
import com.meter.giga.domain.entity.history.Geo
import com.meter.giga.domain.entity.history.GeoLocation
import com.meter.giga.domain.entity.history.MeasurementsItem
import com.meter.giga.domain.entity.history.MlabInformation
import com.meter.giga.domain.entity.history.SnapLog
import com.meter.giga.domain.entity.request.ClientInfoRequestEntity
import com.meter.giga.domain.entity.request.ResultsRequestEntity
import com.meter.giga.domain.entity.request.ServerInfoRequestEntity
import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.Constants.M_D_YYYY_H_MM_SS_A
import io.sentry.Sentry
import io.sentry.SentryLevel
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.Locale

/**
 * Utility singleton containing reusable helper methods
 * used across the application.
 *
 * <p>This utility class provides functionalities related to:
 * <ul>
 *   <li>Device and OS checks.</li>
 *   <li>Alarm permission validation.</li>
 *   <li>Date and time formatting.</li>
 *   <li>Speed test payload generation.</li>
 *   <li>Measurement history processing.</li>
 *   <li>Data usage calculations.</li>
 *   <li>Alarm scheduling validations.</li>
 * </ul>
 */
object GigaUtil {

  /**
   * Determines whether the application is running
   * on a Chromebook device.
   *
   * <p>The validation checks:
   * <ul>
   *   <li>Device build identifiers.</li>
   *   <li>ARC (Android Runtime for Chrome) system features.</li>
   * </ul>
   *
   * @param context application context.
   * @return {@code true} if running on Chromebook,
   * otherwise {@code false}.
   */
  fun isRunningOnChromebook(context: Context): Boolean {
    val pm = context.packageManager
    return Build.DEVICE.contains("cheets", ignoreCase = true) ||
      pm.hasSystemFeature("org.chromium.arc") ||
      pm.hasSystemFeature("org.chromium.arc.device_management")
  }


  /**
   * Checks whether exact alarm scheduling permission
   * is granted for the application.
   *
   * <p>For Android S and above, this validates the
   * {@code SCHEDULE_EXACT_ALARM} capability.
   *
   * @param context application context.
   * @return {@code true} if exact alarms are allowed,
   * otherwise {@code false}.
   */
  fun isExactAlarmPermissionGranted(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.canScheduleExactAlarms()
    } else {
      true
    }
  }

  /**
   * Retrieves the current application version name.
   *
   * @param context application context.
   * @return app version name or {@code Unknown}
   * if retrieval fails.
   */
  fun getAppVersionName(context: Context): String {
    return try {
      val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
      packageInfo.versionName ?: "1.0"
    } catch (e: Exception) {
      "Unknown"
    }
  }

  /**
   * Retrieves the current device details.
   *
   * @param context application context.
   * @return app and device info
   * if retrieval fails.
   */
  fun getDeviceInfo(context: Context): DeviceInfo {
    val packageInfo = context.packageManager.getPackageInfo(
      context.packageName,
      0
    )
    val versionCode = PackageInfoCompat.getLongVersionCode(packageInfo)
    return DeviceInfo(
      deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
      manufacturer = Build.MANUFACTURER,
      model = Build.MODEL,
      sdkInt = Build.VERSION.SDK_INT,
      buildId = versionCode
    )
  }

  /**
   * Converts a formatted local timestamp into
   * ISO 8601 UTC format.
   *
   * <p>The input format must match:
   * {@code M_D_YYYY_H_MM_SS_A}
   *
   * @param input formatted timestamp string.
   * @return ISO formatted UTC timestamp.
   */
  fun convertToIso(input: String): String {
    // 1. Parse your input date string
    val formatter = DateTimeFormatter.ofPattern(M_D_YYYY_H_MM_SS_A, Locale.ENGLISH)
    val parsed = LocalDateTime.parse(input, formatter)

    // 2. Convert to UTC and format to ISO 8601
    val instant = parsed.atZone(ZoneOffset.systemDefault()).toInstant()
    return instant.toString() // this gives you the "Z" (Zulu/UTC) format
  }

  /**
   * Checks whether the current local time
   * is before 8:00 AM.
   *
   * @return {@code true} if current time is before 8 AM,
   * otherwise {@code false}.
   */
  fun isBefore8AM(): Boolean {
    val now = LocalDateTime.now()
    val eightAMToday = LocalDateTime.of(LocalDate.now(), LocalTime.of(8, 0))

    return now.isBefore(eightAMToday)
  }

  /**
   * Returns the current local time formatted using
   * {@code M_D_YYYY_H_MM_SS_A}.
   *
   * @return formatted current timestamp.
   */
  fun getCurrentFormattedTime(): String {
    val now = LocalDateTime.now()
    val formatter = DateTimeFormatter.ofPattern(M_D_YYYY_H_MM_SS_A, Locale.ENGLISH)
    return now.format(formatter)
  }

  /**
   * Builds the backend POST body from ndt7 Go-client complete JSON for each
   * direction. [downloadCompleteJson] / [uploadCompleteJson] are used as-is for
   * Results (MeanClientMbps and ElapsedTime in seconds come from the client;
   * they are not recomputed). Latency is the mean of BBRInfo.MinRTT from both
   * directions, in milliseconds. ServerInfo comes from the locate target JSON.
   */
  fun createSpeedTestPayload(
    downloadCompleteJson: String,
    uploadCompleteJson: String,
    serverChosenJson: String?,
    clientInfoRequestEntity: ClientInfoRequestEntity?,
    schoolId: String,
    gigaSchoolId: String,
    appVersion: String,
    scheduleType: String,
    deviceType: String,
    browserId: String,
    countryCode: String,
    ipAddress: String,
    deviceHardwareId: String?,
    geo: Geo?,
    deviceInfo: DeviceInfo
  ): SpeedTestResultRequestEntity? {
    AppLogger.d("Giga Meter Payload", "$deviceInfo")
    try {
      val currentTime = getCurrentFormattedTime()
      val downloadComplete = JsonParser.parseString(downloadCompleteJson).asJsonObject
      val uploadComplete = JsonParser.parseString(uploadCompleteJson).asJsonObject
      val meanDownload = meanClientMbps(downloadComplete)
      val meanUpload = meanClientMbps(uploadComplete)
      return SpeedTestResultRequestEntity(
        annotation = "",
        appVersion = appVersion,
        browserID = browserId,
        deviceHardwareId = deviceHardwareId,
        clientInfo = clientInfoRequestEntity,
        countryCode = countryCode,
        deviceType = deviceType,
        download = meanDownload * 1000,
        upload = meanUpload * 1000,
        gigaIdSchool = gigaSchoolId,
        ipAddress = if (ipAddress == "") clientInfoRequestEntity?.ip else ipAddress,
        latency = meanBbrMinRttMs(downloadComplete, uploadComplete),
        notes = scheduleType,
        results = ResultsRequestEntity(
          ndtResultS2C = downloadComplete,
          ndtResultC2S = uploadComplete
        ),
        schoolId = schoolId,
        serverInfo = serverInfoFromLocate(serverChosenJson),
        timestampLocal = currentTime,
        timestamp = convertToIso(currentTime),
        uUID = connectionUuid(uploadComplete) ?: connectionUuid(downloadComplete),
        source = "DailyCheckApp",
        geo = geo,
        appBuildNumber = deviceInfo.buildId,
        deviceManufacturer = deviceInfo.manufacturer,
        deviceModel = deviceInfo.model,
        deviceName = deviceInfo.deviceName,
        osVersion = deviceInfo.sdkInt.toString(),
      )
    } catch (e: Exception) {
      Sentry.captureMessage("Failed to create speedtest request payload", SentryLevel.ERROR)
      Sentry.captureException(e)
      return null
    }
  }

  /**
   * Maps a locate target (same shape as the desktop serverChosen callback)
   * into the ServerInfo fields posted to the backend.
   */
  fun serverInfoFromLocate(serverChosenJson: String?): ServerInfoRequestEntity? {
    if (serverChosenJson.isNullOrBlank()) {
      return null
    }
    return try {
      val server = JsonParser.parseString(serverChosenJson).asJsonObject
      val location = server.getAsJsonObject("location")
      val machine = server.get("machine")?.asString ?: ""
      ServerInfoRequestEntity(
        city = location?.get("city")?.asString,
        country = location?.get("country")?.asString,
        fQDN = "",
        iPv4 = "",
        iPv6 = "",
        label = "",
        metro = "",
        site = "",
        uRL = machine
      )
    } catch (e: Exception) {
      Sentry.captureException(e)
      null
    }
  }

  private fun meanClientMbps(complete: JsonObject): Double {
    val client = complete.getAsJsonObject("LastClientMeasurement") ?: return 0.0
    val value = client.get("MeanClientMbps") ?: return 0.0
    return if (value.isJsonNull) 0.0 else value.asDouble
  }

  private fun meanBbrMinRttMs(download: JsonObject, upload: JsonObject): String {
    val downloadMin = bbrMinRtt(download) ?: 0.0
    val uploadMin = bbrMinRtt(upload) ?: 0.0
    return ((downloadMin + uploadMin) / 2.0 / 1000.0).toInt().toString()
  }

  private fun bbrMinRtt(complete: JsonObject): Double? {
    val server = complete.getAsJsonObject("LastServerMeasurement") ?: return null
    val bbr = server.getAsJsonObject("BBRInfo") ?: return null
    val minRtt = bbr.get("MinRTT") ?: return null
    return if (minRtt.isJsonNull) null else minRtt.asDouble
  }

  private fun connectionUuid(complete: JsonObject): String? {
    val server = complete.getAsJsonObject("LastServerMeasurement") ?: return null
    val connection = server.getAsJsonObject("ConnectionInfo") ?: return null
    val uuid = connection.get("UUID") ?: return null
    return if (uuid.isJsonNull) null else uuid.asString
  }

  /**
   * Adds a new JSON item into an existing JSON array string.
   *
   * <p>The method maintains a FIFO queue behavior
   * with a maximum size of 10 items.
   *
   * @param existingArrayStr existing JSON array string.
   * @param jsonString new JSON item to append.
   * @return updated JSON array string.
   */
  fun addJsonItem(existingArrayStr: String, jsonString: String): String {

    val gson = Gson()
    val listType = object : TypeToken<List<String>>() {}.type
    val list: List<String> = gson.fromJson(existingArrayStr, listType)

    // Convert to mutable list of strings
    val itemList = mutableListOf<String>()
    for (i in 0 until list.size) {
      itemList.add(list[i])
    }

    // Enforce FIFO max size = 10
    if (itemList.size >= 10) {
      itemList.removeAt(0) // Remove oldest
    }

    itemList.add(jsonString) // Add new item

    // Store updated array
    val updatedArray = gson.toJson(itemList)
    return updatedArray.toString()
  }

  /**
   * Calculates total upload, download,
   * and combined data usage values from Go-client complete JSON.
   */
  fun getDataUsage(
    uploadComplete: JsonObject?,
    downloadComplete: JsonObject?,
  ): DataUsage {
    try {
      val bytesReceived = tcpInfoLong(downloadComplete, "BytesReceived") +
        tcpInfoLong(uploadComplete, "BytesReceived")
      val bytesSent = tcpInfoLong(downloadComplete, "BytesAcked") +
        tcpInfoLong(uploadComplete, "BytesAcked")
      val totalBytes = bytesSent + bytesReceived
      return DataUsage(
        download = bytesReceived,
        upload = bytesSent,
        total = totalBytes,
      )
    } catch (e: Exception) {
      Sentry.captureException(e)
      return DataUsage(
        download = 0,
        upload = 0,
        total = 0,
      )
    }
  }

  private fun tcpInfoLong(complete: JsonObject?, field: String): Long {
    val server = complete?.getAsJsonObject("LastServerMeasurement") ?: return 0L
    val tcp = server.getAsJsonObject("TCPInfo") ?: return 0L
    val value = tcp.get(field) ?: return 0L
    return if (value.isJsonNull) 0L else value.asLong
  }

  /**
   * Creates a historical measurement item object
   * used for local storage and sync operations.
   */
  fun getMeasurementItem(
    clientInfoResponse: ClientInfoResponseEntity?,
    downloadComplete: JsonObject?,
    uploadComplete: JsonObject?,
    serverInfo: ServerInfoRequestEntity?,
    scheduleType: String?,
    results: ResultsRequestEntity?,
    c2sRate: ArrayList<Double>,
    s2cRate: ArrayList<Double>,
    historyDataIndex: Int,
    currentLocation: Location?,
    deviceHardwareId: String?,
    deviceInfo: DeviceInfo
  ): MeasurementsItem {
    AppLogger.d("Giga Meter Measurement", "$deviceInfo")
    return MeasurementsItem(
      accessInformation = AccessInformation(
        asn = clientInfoResponse?.asn,
        city = clientInfoResponse?.city,
        country = clientInfoResponse?.country,
        hostname = clientInfoResponse?.isp,
        ip = clientInfoResponse?.ip,
        loc = clientInfoResponse?.loc,
        org = clientInfoResponse?.org,
        postal = clientInfoResponse?.postal,
        region = clientInfoResponse?.region,
        timezone = clientInfoResponse?.timezone
      ),
      dataUsage = getDataUsage(uploadComplete, downloadComplete),
      index = historyDataIndex + 1,
      mlabInformation = MlabInformation(
        city = serverInfo?.city,
        country = serverInfo?.country,
        fqdn = serverInfo?.fQDN,
        ip = listOf(serverInfo?.iPv4 ?: "", serverInfo?.iPv6 ?: ""),
        label = serverInfo?.label,
        metro = serverInfo?.metro,
        site = serverInfo?.site,
        url = serverInfo?.uRL
      ),
      notes = scheduleType,
      results = results,
      snapLog = SnapLog(
        c2sRate = c2sRate,
        s2cRate = s2cRate
      ),
      timestamp = System.currentTimeMillis(),
      uploaded = false,
      uuid = uploadComplete?.let { connectionUuid(it) }
        ?: downloadComplete?.let { connectionUuid(it) },
      version = 1,
      geolocation = if (currentLocation !== null) Geo(
        geoLocation = GeoLocation(
          lat = currentLocation.latitude,
          lng = currentLocation.longitude
        ),
        accuracy = currentLocation.accuracy,
        timestamp = currentLocation.time
      ) else null,
      synced = false,
      deviceHardwareId = deviceHardwareId,
      appBuildNumber = "${deviceInfo.buildId}",
      deviceManufacturer = deviceInfo.manufacturer,
      deviceModel = deviceInfo.model,
      deviceName = deviceInfo.deviceName,
      osVersion = deviceInfo.sdkInt.toString(),
    )
  }

  /**
   * Filters locally stored measurement data
   * and returns only items pending synchronization.
   *
   * <p>Pending items are measurements where
   * {@code uploaded == false}.
   *
   * @param measurementItems serialized measurement JSON array.
   * @return list of unsynchronized measurement items.
   */
  fun checkDataPendingForSync(measurementItems: String): List<MeasurementsItem> {
    val gson = Gson()

// Step 1: Parse the outer array (which contains inner JSON strings)
    val type = object : TypeToken<List<String>>() {}.type
    val jsonStringList: List<String> = gson.fromJson(measurementItems, type)

// Step 2: Parse each inner string to your model
    val modelList: List<MeasurementsItem> = jsonStringList.map { json ->
      gson.fromJson(json, MeasurementsItem::class.java)
    }

    val notUploadedItems = modelList.filter { it.uploaded == false }

    return notUploadedItems
  }

  /**
   * Checks whether a future alarm execution
   * is already scheduled.
   *
   * @param alarmPrefs shared preference manager.
   * @return {@code true} if a future alarm exists,
   * otherwise {@code false}.
   */
  fun checkIfFutureAlarmScheduled(alarmPrefs: AlarmSharedPref): Boolean {
    val nextScheduleTime = alarmPrefs.nextExecutionTime
    val currentTime = Calendar.getInstance().timeInMillis
    return nextScheduleTime > currentTime
  }
}
