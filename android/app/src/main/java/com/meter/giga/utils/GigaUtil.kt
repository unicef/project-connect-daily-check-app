package com.meter.giga.utils

import android.app.AlarmManager
import android.content.Context
import android.location.Location
import android.os.Build
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.meter.giga.domain.entity.history.AccessInformation
import com.meter.giga.domain.entity.history.DataUsage
import com.meter.giga.domain.entity.history.Geo
import com.meter.giga.domain.entity.history.MeasurementsItem
import com.meter.giga.domain.entity.history.MlabInformation
import com.meter.giga.domain.entity.history.SnapLog
import com.meter.giga.domain.entity.request.ClientInfoRequestEntity
import com.meter.giga.domain.entity.request.LastClientMeasurementRequestEntity
import com.meter.giga.domain.entity.request.ResultsRequestEntity
import com.meter.giga.domain.entity.request.ServerInfoRequestEntity
import com.meter.giga.domain.entity.request.SpeedTestMeasurementRequestEntity
import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.domain.entity.response.ServerInfoResponseEntity
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.Constants.M_D_YYYY_H_MM_SS_A
import io.sentry.Sentry
import net.measurementlab.ndt7.android.models.AppInfo
import net.measurementlab.ndt7.android.models.BBRInfo
import net.measurementlab.ndt7.android.models.ClientResponse
import net.measurementlab.ndt7.android.models.ConnectionInfo
import net.measurementlab.ndt7.android.models.Measurement
import net.measurementlab.ndt7.android.models.TCPInfo
import org.json.JSONArray
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.Locale

/**
 * This is an utility class and contains reusable functions
 * This is singleton class instance can be accessed via same
 * instance across the app
 */
object GigaUtil {

  /**
   * This function checks if app is running on Chromebook
   * @param context : App Context
   * @return Boolean (True/False)
   */
  fun isRunningOnChromebook(context: Context): Boolean {
    val pm = context.packageManager
    return Build.DEVICE.contains("cheets", ignoreCase = true) ||
      pm.hasSystemFeature("org.chromium.arc") ||
      pm.hasSystemFeature("org.chromium.arc.device_management")
  }

  /**
   * This function checks if app has schedule alarm permission if
   * Device is running above Android 31
   * @param context : App Context
   * @return Boolean (True/False)
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
   * This function used to get the app build version
   * @param context : App Context
   * @return App Build Version
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
   * This function used to convert the time into ISO format
   * @param input: Time to convert in ISO format
   * @return ISO formated time
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
   * This function used to check the current time is less than 8 AM
   * @return Boolean
   */
  fun isBefore8AM(): Boolean {
    val now = LocalDateTime.now()
    val eightAMToday = LocalDateTime.of(LocalDate.now(), LocalTime.of(8, 0))

    return now.isBefore(eightAMToday)
  }

  /**
   * Used to get the current time in format: M_D_YYYY_H_MM_SS_A
   * @return current timestamp in M_D_YYYY_H_MM_SS_A format
   */
  fun getCurrentFormattedTime(): String {
    val now = LocalDateTime.now()
    val formatter = DateTimeFormatter.ofPattern(M_D_YYYY_H_MM_SS_A, Locale.ENGLISH)
    return now.format(formatter)
  }

  /**
   * This function used to create the speed test result payload to
   * post on backend
   * @param uploadMeasurement
   * @param downloadMeasurement
   * @param clientInfoRequestEntity
   * @param serverInfoRequestEntity
   * @param scheduleType
   * @param schoolId
   * @param gigaSchoolId
   * @param appVersion
   * @param ipAddress
   * @param deviceType
   * @param browserId
   * @param countryCode
   * @param lastDownloadResponse
   * @param lastUploadResponse
   */
  fun createSpeedTestPayload(
    uploadMeasurement: Measurement?,
    downloadMeasurement: Measurement?,
    clientInfoRequestEntity: ClientInfoRequestEntity?,
    serverInfoRequestEntity: ServerInfoRequestEntity?,
    schoolId: String,
    gigaSchoolId: String,
    appVersion: String,
    scheduleType: String,
    deviceType: String,
    browserId: String,
    countryCode: String,
    ipAddress: String,
    lastDownloadResponse: ClientResponse?,
    lastUploadResponse: ClientResponse?,
    deviceHardwareId: String,
  ): SpeedTestResultRequestEntity? {
    try {
      val currentTime = getCurrentFormattedTime()
      var meanUploadClientMbps: Double? = null
      lastUploadResponse?.appInfo?.let {
        meanUploadClientMbps = if (it.elapsedTime == 0L || it.numBytes.toInt() == 0) {
          0.0
        } else {
          (it.numBytes / (it.elapsedTime / 1000)) * 0.008
        }
      }
      var meanDownloadClientMbps: Double? = null
      lastDownloadResponse?.appInfo?.let {
        meanDownloadClientMbps = if (it.elapsedTime == 0L || it.numBytes.toInt() == 0) {
          0.0
        } else {
          (it.numBytes / (it.elapsedTime / 1000)) * 0.008
        }
      }
      return SpeedTestResultRequestEntity(
        annotation = "",
        appVersion = appVersion,
        browserID = browserId,
        deviceHardwareId = deviceHardwareId,
        clientInfo = clientInfoRequestEntity,
        countryCode = countryCode,
        deviceType = deviceType,
        download = (meanDownloadClientMbps ?: 0.0) * 1000,
        upload = (meanUploadClientMbps ?: 0.0) * 1000,
        gigaIdSchool = gigaSchoolId,
        ipAddress = if (ipAddress == "") clientInfoRequestEntity?.ip else ipAddress,
        latency = (if (uploadMeasurement?.tcpInfo?.minRtt != null) uploadMeasurement.tcpInfo!!.minRtt!! / 1000 else 0.0).toInt()
          .toString(),
        notes = scheduleType,
        results = ResultsRequestEntity(
          ndtResultC2S = SpeedTestMeasurementRequestEntity(
            lastClientMeasurement = LastClientMeasurementRequestEntity(
              elapsedTime = (lastUploadResponse?.appInfo?.elapsedTime ?: 0).toDouble(),
              meanClientMbps = meanUploadClientMbps,
              numBytes = (lastUploadResponse?.appInfo?.numBytes ?: 0).toInt()
            ),
            lastServerMeasurement = uploadMeasurement?.toEntity()
          ),
          ndtResultS2C = SpeedTestMeasurementRequestEntity(
            lastClientMeasurement = LastClientMeasurementRequestEntity(
              elapsedTime = (lastDownloadResponse?.appInfo?.elapsedTime ?: 0).toDouble(),
              meanClientMbps = meanDownloadClientMbps,
              numBytes = (lastDownloadResponse?.appInfo?.numBytes ?: 0).toInt()
            ),
            lastServerMeasurement = downloadMeasurement?.toEntity()
          )
        ),
        schoolId = schoolId,
        serverInfo = serverInfoRequestEntity,
        timestampLocal = currentTime,
        timestamp = convertToIso(currentTime),
        uUID = uploadMeasurement?.connectionInfo?.uuid,
        source = "DailyCheckApp",
//      createdAt = null,
//      dataDownloaded = null,
//      dataUploaded = null,
//      dataUsage = null,
//      id = null
      )
    } catch (e: Exception) {
      Sentry.capture("Failed to create speedtest request payload")
      Sentry.capture(e)
      return null;
    }
  }

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

  fun getDataUsage(
    c2sLastServerManagement: Measurement?,
    s2cLastServerManagement: Measurement?,
  ): DataUsage {
    try {
      val bytesReceived = (s2cLastServerManagement?.tcpInfo?.bytesReceived
        ?: 0) + (c2sLastServerManagement?.tcpInfo?.bytesReceived ?: 0)
      val bytesSent = (s2cLastServerManagement?.tcpInfo?.bytesAcked
        ?: 0) + (c2sLastServerManagement?.tcpInfo?.bytesAcked ?: 0)
      val totalBytes = bytesSent + bytesReceived
      return DataUsage(
        download = bytesReceived,
        upload = bytesSent,
        total = totalBytes,
      )
    } catch (e: Exception) {
      Sentry.capture(e)
      return DataUsage(
        download = 0,
        upload = 0,
        total = 0,
      );
    }
  }

  fun getMeasurementItem(
    clientInfoResponse: ClientInfoResponseEntity?,
    c2sLastServerManagement: Measurement?,
    s2cLastServerManagement: Measurement?,
    serverInfoResponse: ServerInfoResponseEntity?,
    scheduleType: String?,
    results: ResultsRequestEntity?,
    c2sRate: ArrayList<Double>,
    s2cRate: ArrayList<Double>,
    historyDataIndex: Int,
    currentLocation: Location?
  ): MeasurementsItem {
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
      dataUsage = getDataUsage(c2sLastServerManagement, s2cLastServerManagement),
      index = historyDataIndex + 1,
      mlabInformation = MlabInformation(
        city = serverInfoResponse?.city,
        country = serverInfoResponse?.country,
        fqdn = serverInfoResponse?.fqdn,
        ip = listOf(serverInfoResponse?.ipv4 ?: "", serverInfoResponse?.ipv6 ?: ""),
        label = serverInfoResponse?.city,
        metro = serverInfoResponse?.city,
        site = serverInfoResponse?.site,
        url = serverInfoResponse?.url
      ),
      notes = scheduleType,
      results = results,
      snapLog = SnapLog(
        c2sRate = c2sRate,
        s2cRate = s2cRate
      ),
      timestamp = System.currentTimeMillis(),
      uploaded = false,
      uuid = c2sLastServerManagement?.connectionInfo?.uuid,
      version = 1,
      geolocation = if (currentLocation !== null) Geo(
        latitude = currentLocation.latitude,
        longitude = currentLocation.longitude
      ) else null
    )
  }

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

  fun checkIfFutureAlarmScheduled(alarmPrefs: AlarmSharedPref): Boolean {
    val nextScheduleTime = alarmPrefs.nextExecutionTime
    val currentTime = Calendar.getInstance().timeInMillis
    return nextScheduleTime > currentTime
  }
}
