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
import org.json.JSONObject
import java.net.URI
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.Locale
import kotlin.math.roundToLong

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
   * they are not recomputed). Latency is the download TCPInfo.MinRTT in
   * milliseconds. ServerInfo comes from the locate target JSON.
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
        latency = downloadMinRttMs(downloadComplete),
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
   *
   * Locate v2 does not return the server IPs, so IPv4 and IPv6 stay blank.
   * The FQDN and URL come from the download URL, without its access token.
   * Site and metro come from the machine name, e.g. mlab1-lga03 is site
   * lga03 in metro lga.
   */
  fun serverInfoFromLocate(serverChosenJson: String?): ServerInfoRequestEntity? {
    if (serverChosenJson.isNullOrBlank()) {
      return null
    }
    return try {
      val server = JsonParser.parseString(serverChosenJson).asJsonObject
      val location = server.objectOrNull("location")
      val city = location?.stringOrNull("city")
      val machine = server.stringOrNull("machine") ?: ""
      val downloadUrl = server.objectOrNull("urls")
        ?.stringOrNull(LOCATE_DOWNLOAD_URL_KEY)
        ?.let { runCatching { URI(it) }.getOrNull() }
      val fqdn = downloadUrl?.host ?: machine
      val site = siteFromMachine(machine)
      ServerInfoRequestEntity(
        city = city,
        country = location?.stringOrNull("country"),
        fQDN = fqdn,
        iPv4 = "",
        iPv6 = "",
        label = city ?: "",
        metro = site.take(3),
        site = site,
        uRL = downloadUrl?.let { "${it.scheme}://${it.host}${it.path}" } ?: fqdn
      )
    } catch (e: Exception) {
      Sentry.captureException(e)
      null
    }
  }

  /**
   * MeanClientMbps from a Go-client progress update, or null when the update
   * has no usable value.
   */
  fun progressMbps(clientJson: String): Double? = try {
    JsonParser.parseString(clientJson).asJsonObject.doubleOrNull("MeanClientMbps")
  } catch (e: Exception) {
    null
  }

  private fun siteFromMachine(machine: String): String {
    val name = machine.substringBefore('.')
    return name.split('-').firstOrNull { SITE_PATTERN.matches(it) } ?: ""
  }

  private fun meanClientMbps(complete: JsonObject): Double =
    complete.objectOrNull("LastClientMeasurement")?.doubleOrNull("MeanClientMbps") ?: 0.0

  /**
   * Latency is the download test's TCPInfo.MinRTT in milliseconds, rounded:
   * the value the backend stores and the one M-Lab recommends. BBRInfo.MinRTT
   * is an internal BBR metric, and the upload's MinRTT comes from a handful of
   * server-to-client messages, so neither is used. There is no fallback: if
   * the download has no TCPInfo.MinRTT, latency is null.
   */
  private fun downloadMinRttMs(download: JsonObject): String? {
    val minRtt = download.objectOrNull("LastServerMeasurement")
      ?.objectOrNull("TCPInfo")
      ?.doubleOrNull("MinRTT")
      ?: return null
    return (minRtt / 1000).roundToLong().toString()
  }

  private fun connectionUuid(complete: JsonObject): String? =
    complete.objectOrNull("LastServerMeasurement")
      ?.objectOrNull("ConnectionInfo")
      ?.stringOrNull("UUID")

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
    val list: List<String> = gson.fromJson(existingArrayStr, stringListType)

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
    val value = complete?.objectOrNull("LastServerMeasurement")
      ?.objectOrNull("TCPInfo")
      ?.get(field)
    return if (value != null && value.isJsonPrimitive && value.asJsonPrimitive.isNumber) value.asLong else 0L
  }

  // Go-client JSON can omit a field or send it as null; these read either as null.
  private fun JsonObject.objectOrNull(name: String): JsonObject? =
    get(name)?.takeIf { it.isJsonObject }?.asJsonObject

  private fun JsonObject.stringOrNull(name: String): String? =
    get(name)?.takeIf { it.isJsonPrimitive }?.asString

  private fun JsonObject.doubleOrNull(name: String): Double? =
    get(name)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asDouble

  // getParameterized keeps the list-of-strings type without an anonymous TypeToken
  // subclass, whose generic signature R8 strips in release builds.
  private val stringListType =
    TypeToken.getParameterized(List::class.java, String::class.java).type

  private const val LOCATE_DOWNLOAD_URL_KEY = "wss:///ndt/v7/download"
  private val SITE_PATTERN = Regex("[a-z]{3}[0-9]+")

  /**
   * Copy of Go-client results for the Android WebView.
   *
   * The shared UI reads MeanClientMbps, BBRInfo.MinRTT on both directions,
   * and results.receivedBytes. A missing piece throws and stops the Data page.
   * Gaps are filled on this copy. The object posted to the backend is separate
   * and is left as the client sent it.
   */
  fun resultsForUi(results: ResultsRequestEntity?, receivedBytes: Long): ResultsRequestEntity {
    val latencyUs = results?.ndtResultS2C?.let { tcpMinRttUs(it) }
    return ResultsRequestEntity(
      ndtResultS2C = directionForUi(results?.ndtResultS2C, latencyUs),
      ndtResultC2S = directionForUi(results?.ndtResultC2S, latencyUs),
      receivedBytes = receivedBytes,
    )
  }

  private fun tcpMinRttUs(complete: JsonObject): Double? =
    complete.objectOrNull("LastServerMeasurement")
      ?.objectOrNull("TCPInfo")
      ?.doubleOrNull("MinRTT")

  private fun directionForUi(source: JsonObject?, latencyUs: Double?): JsonObject {
    val direction = source?.deepCopy() ?: JsonObject()
    val client = direction.childObject("LastClientMeasurement")
    if (client.doubleOrNull("MeanClientMbps") == null) {
      client.addProperty("MeanClientMbps", 0.0)
    }
    direction.add("LastClientMeasurement", client)
    val server = direction.childObject("LastServerMeasurement")
    val bbr = server.childObject("BBRInfo")
    if (bbr.doubleOrNull("MinRTT") == null) {
      bbr.addProperty("MinRTT", latencyUs ?: 0.0)
    }
    server.add("BBRInfo", bbr)
    direction.add("LastServerMeasurement", server)
    return direction
  }

  private fun JsonObject.childObject(name: String): JsonObject {
    val existing = get(name)
    return if (existing != null && existing.isJsonObject) existing.asJsonObject else JsonObject()
  }

  /**
   * One stored measurement, shaped so the existing WebView can open the Data page.
   *
   * History already on the device can omit mlabInformation, accessInformation,
   * MeanClientMbps, BBRInfo.MinRTT, or receivedBytes. The page reads those
   * directly and a missing one throws while the page is opening.
   * Other fields on the measurement are left as stored.
   */
  fun measurementJsonForUi(measurementJson: String): String {
    val measurement = JSONObject(measurementJson)
    val mlab = measurement.optJSONObject("mlabInformation") ?: JSONObject()
    if (!mlab.has("city") || mlab.isNull("city")) {
      mlab.put("city", "")
    }
    measurement.put("mlabInformation", mlab)
    if (measurement.optJSONObject("accessInformation") == null) {
      measurement.put("accessInformation", JSONObject())
    }
    val results = measurement.optJSONObject("results") ?: JSONObject()
    val latencyUs = tcpMinRtt(results.optJSONObject("NDTResult.S2C"))
    results.put(
      "NDTResult.S2C",
      directionJsonForUi(results.optJSONObject("NDTResult.S2C"), latencyUs),
    )
    results.put(
      "NDTResult.C2S",
      directionJsonForUi(results.optJSONObject("NDTResult.C2S"), latencyUs),
    )
    if (!results.has("receivedBytes") || results.isNull("receivedBytes")) {
      val usage = measurement.optJSONObject("dataUsage")
      val download = if (usage != null && usage.has("download") && !usage.isNull("download")) {
        usage.optLong("download")
      } else {
        0L
      }
      results.put("receivedBytes", download)
    }
    measurement.put("results", results)
    return measurement.toString()
  }

  private fun tcpMinRtt(direction: JSONObject?): Double? {
    val tcp = direction
      ?.optJSONObject("LastServerMeasurement")
      ?.optJSONObject("TCPInfo")
      ?: return null
    if (!tcp.has("MinRTT") || tcp.isNull("MinRTT")) return null
    return tcp.optDouble("MinRTT")
  }

  private fun directionJsonForUi(source: JSONObject?, latencyUs: Double?): JSONObject {
    val direction = source ?: JSONObject()
    val client = direction.optJSONObject("LastClientMeasurement") ?: JSONObject()
    if (!client.has("MeanClientMbps") || client.isNull("MeanClientMbps")) {
      client.put("MeanClientMbps", 0.0)
    }
    direction.put("LastClientMeasurement", client)
    val server = direction.optJSONObject("LastServerMeasurement") ?: JSONObject()
    val bbr = server.optJSONObject("BBRInfo") ?: JSONObject()
    if (!bbr.has("MinRTT") || bbr.isNull("MinRTT")) {
      bbr.put("MinRTT", latencyUs ?: 0.0)
    }
    server.put("BBRInfo", bbr)
    direction.put("LastServerMeasurement", server)
    return direction
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
    val dataUsage = getDataUsage(uploadComplete, downloadComplete)
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
      dataUsage = dataUsage,
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
      results = resultsForUi(results, dataUsage.download ?: 0L),
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
    val jsonStringList: List<String> = gson.fromJson(measurementItems, stringListType)

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
