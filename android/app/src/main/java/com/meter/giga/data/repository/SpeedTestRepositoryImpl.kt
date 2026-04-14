package com.meter.giga.data.repository

import com.google.gson.GsonBuilder
import com.meter.giga.data.models.responses.AsnData
import com.meter.giga.data.util.AsnDataAdapter
import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.domain.entity.response.ServerInfoResponseEntity
import com.meter.giga.domain.repository.SpeedTestRepository
import com.meter.giga.error_handler.ErrorEntity
import com.meter.giga.error_handler.ErrorHandlerImpl
import com.meter.giga.network.util.RetrofitProvider
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.ResultState
import com.meter.giga.utils.toEntity
import com.meter.giga.utils.toModel
import io.sentry.Sentry
import kotlinx.coroutines.delay

/**
 * SpeedTestRepositoryImpl provides abstract implementation of
 * SpeedTestRepository interface
 */
class SpeedTestRepositoryImpl(
  private val retrofitProvider: RetrofitProvider,
  private val logger: AppLogger = AppLogger
) :
  SpeedTestRepository {
  /**
   * This function provides getClientInfoData function
   * implementation
   * @param ipInfoToken: access token
   * @return ResultState<ClientInfoResponseEntity?> : Result State
   * as Success as ClientInfoResponseEntity instance
   * as Failure as String Message with failure message
   */
  override suspend fun getClientInfoData(
    ipInfoToken: String,
  ): ResultState<ClientInfoResponseEntity?> {
    try {
      logger.d("GIGA SpeedTestRepositoryImpl", "getClientInfoData Invoked")
      val response = retrofitProvider.clientInfoApi.getClientInfo(ipInfoToken)
      logger.d("GIGA SpeedTestRepositoryImpl", "response $response")
      if (response.isSuccessful) {
        if (response.body() != null) {
          return ResultState.Success(
            response.body()!!.toEntity()
          )
        } else {
          val fallbackResponse =
            retrofitProvider.clientInfoFallbackApi.getClientInfoFallback()
          if (fallbackResponse.isSuccessful) {
            return if (fallbackResponse.body() != null) {
              ResultState.Success(
                fallbackResponse.body()!!.toEntity()
              )
            } else {
              ResultState.Failure(ErrorHandlerImpl().getError(response.errorBody()))
            }
          }
        }
      }
      return ResultState.Failure(
        ErrorEntity.Unknown("Get client info api failed")
      )
    } catch (e: Exception) {
      logger.d("GIGA SpeedTestRepositoryImpl", "Exception $e")
      return ResultState.Failure(
        ErrorEntity.Unknown("Get client info api failed")
      )
    }
  }


  /**
   * This function provides getClientInfoLiteData function
   * implementation
   * @param ipInfoToken : IP info token to get ip details
   * @param authKey : Authentication key to access backend
   * @param baseUrl : Base Url based on env
   * @return ResultState<ClientInfoResponseEntity?> : Result State
   * as Success as ClientInfoResponseEntity instance
   * as Failure as String Message with failure message
   */
  override suspend fun getClientInfoLiteData(
    ipInfoToken: String,
    authKey: String,
    baseUrl: String
  ): ResultState<ClientInfoResponseEntity?> {
    try {
      logger.d("GIGA SpeedTestRepositoryImpl", "getClientInfoLiteData Invoked")
      val response = retrofitProvider.clientInfoLiteApi.getClientInfoLite(ipInfoToken)
      logger.d("GIGA SpeedTestRepositoryImpl getClientInfoLiteData", "response $response")
      if (response.isSuccessful) {
        if (response.body() != null) {
          val clintLiteInfo = response.body()
          if (clintLiteInfo?.ip != null) {
            // Create custom Gson
            val gson = GsonBuilder()
              .registerTypeAdapter(AsnData::class.java, AsnDataAdapter())
              .create()
            val ipInfoMetaDataResponse =
              retrofitProvider.getSpeedTestApiWithAdapter(baseUrl, gson)
                .getIpInfoMetaData(authorization = "Bearer $authKey", ip = clintLiteInfo.ip)

            if (ipInfoMetaDataResponse.isSuccessful) {
              val clientInfoMetaDataModel = ipInfoMetaDataResponse.body()
              var asnValue: String? = null
              when (val asn = clientInfoMetaDataModel?.asn) {

                is AsnData.AsString -> {
                  logger.d("ASN", "ASN string: ${asn.value}")
                  asnValue = asn.value
                }

                is AsnData.AsObject -> {
                  logger.d("ASN", "ASN object: ${asn.obj.asn}")
                  asnValue = asn.obj.asn
                }

                null -> {
                  asnValue = clientInfoMetaDataModel?.org?.let { org ->
                    Regex("AS[0-9]+").find(org)?.value
                  }
                }
              }
              val clientInfoResponseEntity = ClientInfoResponseEntity(
                asn = asnValue,
                city = clientInfoMetaDataModel?.city,
                isp = clientInfoMetaDataModel?.org?.replaceFirst(Regex("^AS\\d+\\s*"), "")
                  ?: clintLiteInfo.asName,
                country = clientInfoMetaDataModel?.country,
                ip = clientInfoMetaDataModel?.ip,
                loc = clientInfoMetaDataModel?.loc,
                org = clientInfoMetaDataModel?.org,
                postal = clientInfoMetaDataModel?.postal,
                region = clientInfoMetaDataModel?.region,
                timezone = clientInfoMetaDataModel?.timezone
              )
              return ResultState.Success(clientInfoResponseEntity)
            } else {
              val response = retrofitProvider.clientInfoApi.getClientInfo(ipInfoToken)
              if (response.isSuccessful) {
                if (response.body() != null) {
                  return ResultState.Success(
                    response.body()!!.toEntity()
                  )
                }
              } else {
                val fallbackResponse =
                  retrofitProvider.clientInfoFallbackApi.getClientInfoFallback()
                if (fallbackResponse.isSuccessful) {
                  return if (fallbackResponse.body() != null) {
                    ResultState.Success(
                      fallbackResponse.body()!!.toEntity()
                    )
                  } else {
                    ResultState.Failure(ErrorHandlerImpl().getError(response.errorBody()))
                  }
                }
              }
            }
          }
        } else {
          val fallbackResponse =
            retrofitProvider.clientInfoFallbackApi.getClientInfoFallback()
          if (fallbackResponse.isSuccessful) {
            return if (fallbackResponse.body() != null) {
              ResultState.Success(
                fallbackResponse.body()!!.toEntity()
              )
            } else {
              ResultState.Failure(ErrorHandlerImpl().getError(response.errorBody()))
            }
          }
        }
      }
      return ResultState.Failure(
        ErrorEntity.Unknown("Get client info api failed")
      )
    } catch (e: Exception) {
      logger.d("GIGA SpeedTestRepositoryImpl", "Exception $e")
      return ResultState.Failure(
        ErrorEntity.Unknown("Get client info api failed")
      )
    }
  }

  /**
   * This function provides getServerInfoData function
   * implementation
   * @param metro : Null or value if user has selected any metro
   * @return ResultState<ServerInfoResponseEntity?> : Result State
   * as Success as ServerInfoResponseEntity instance
   * as Failure as String Message with failure message
   */
  override suspend fun getServerInfoData(metro: String?): ResultState<ServerInfoResponseEntity?> {
    logger.d("GIGA SpeedTestRepositoryImpl", "getClientInfoData Invoked")
    val response = if (metro != null && metro != "automatic") {
      retrofitProvider.serverInfoApi.getServerMetroInfo(metro = metro)
    } else {
      retrofitProvider.serverInfoApi.getServerInfoNoPolicy()
    }
    logger.d("GIGA SpeedTestRepositoryImpl", "response $response")
    if (response.isSuccessful) {
      if (response.body() != null) {
        return ResultState.Success(
          response.body()!!.toEntity()
        )
      } else {
        ResultState.Failure(ErrorHandlerImpl().getError(response.errorBody()))
      }
    }
    return ResultState.Failure(
      ErrorEntity.Unknown("Get client info api failed")
    )
  }

  /**
   * This function provides publishSpeedTestData function
   * implementation to post the speed test data
   * @param speedTestData : instance of SpeedTestResultRequestEntity,
   * contains details of speed test
   * @return ResultState<Any?>
   *   as Success if posted the data successfully
   *   as Failure if post request failed with message
   */
  override suspend fun publishSpeedTestData(
    speedTestData: SpeedTestResultRequestEntity,
    uploadKey: String,
    baseUrl: String
  ): ResultState<Unit?> {
    var retryAttemptCount = 0;
    return syncSpeedTestData(speedTestData, uploadKey, baseUrl, retryAttemptCount)
  }

  /**
   * This function is used to invoke the Sync api call while syncing first time
   * or while retry in failure scenario. We have added little as well between 2 api call while retries
   * @param speedTestData: Instance of SpeedTestResultRequestEntity
   * @param uploadKey: Upload key to authenticate the post request
   * @param retryAttemptCount: Number of retry
   * @return instance of ResultState. It can be Success or Failure
   *
   */
  private suspend fun syncSpeedTestData(
    speedTestData: SpeedTestResultRequestEntity,
    uploadKey: String,
    baseUrl: String,
    retryAttemptCount: Int
  ): ResultState<Unit> {
    val response = retrofitProvider.getSpeedTestApi(baseUrl).postSpeedTestData(
      body = speedTestData.toModel(),
      authorization = "Bearer $uploadKey"
    )
    logger.d("GIGA SpeedTestRepositoryImpl Response", "$response")
    if (response.isSuccessful) {
      logger.d("GIGA SpeedTestRepositoryImpl Success", "$response")
      return if (response.body() != null) {
        ResultState.Success(
          response.body()!!
        )
      } else {
        ResultState.Failure(ErrorHandlerImpl().getError(response.errorBody()))
      }
    } else {
      delay(500)
      if (retryAttemptCount < 4) {
        val attemptNo = retryAttemptCount + 1;
        Sentry.captureMessage("Sync data re attempt count : $attemptNo")
        syncSpeedTestData(speedTestData, uploadKey, baseUrl, attemptNo)
        logger.d("GIGA SpeedTestRepositoryImpl Failed with attempt No: ", "$retryAttemptCount")
      } else {
        logger.d(
          "GIGA SpeedTestRepositoryImpl Failed after no of attempts",
          "$retryAttemptCount"
        )
        Sentry.captureMessage("Sync retry failed with $response")
      }
    }
    return ResultState.Failure(
      ErrorEntity.Unknown("Post speed test data api failed")
    )
  }
}

