package com.meter.giga.network.api

import com.meter.giga.data.models.requests.ConnectivityRecordsRequestModel
import com.meter.giga.data.models.requests.SpeedTestResultRequestModel
import com.meter.giga.data.models.responses.ClientInfoFallbackResponseModel
import com.meter.giga.data.models.responses.ClientInfoLiteResponseModel
import com.meter.giga.data.models.responses.ClientInfoMetaDataModel
import com.meter.giga.data.models.responses.ClientInfoResponseModel
import com.meter.giga.data.models.responses.FeatureFlagsResponseModel
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit API Service interface provides
 * End point url definition to hit with
 * API call type like @POST/@GET/@DELETE/@PUT etc
 */
interface ApiService {

  /**
   * getClientInfo info end point
   * @param token : access token to extract client info
   * @return Instance of Response as ClientInfoResponseModel if success or Error
   */
  @GET("json")
  suspend fun getClientInfo(
    @Query("token") token: String
  ): Response<ClientInfoResponseModel>

  /**
   * getClientInfo info end point
   * @param token : access token to extract client info
   * @return Instance of Response as ClientInfoResponseModel if success or Error
   */
  @GET("lite/me")
  suspend fun getClientInfoLite(
    @Query("token") token: String
  ): Response<ClientInfoLiteResponseModel>

  /**
   * getClient Info Fallback end point
   * @return Instance of Response as ClientInfoFallbackResponseModel if success or Error
   */
  @GET("ip/geo.json")
  suspend fun getClientInfoFallback(): Response<ClientInfoFallbackResponseModel>

  /**
   * postSpeedTestData to submit the speed test data on backend
   * @param token : Access Token for backend
   * @param body : SPeed Test Result data
   * @return : Instance of Response as Success or error
   */

  @POST("measurements")
  suspend fun postSpeedTestData(
    @Header("Authorization") authorization: String,
    @Body body: SpeedTestResultRequestModel
  ): Response<Unit>

  /**
   * postSpeedTestData to submit the speed test data on backend
   * @param authorization : Access Token for backend
   * @param ip : ip address
   * @return : Instance of Response as Success or error
   */

  @GET("ip-metadata/{ip}")
  suspend fun getIpInfoMetaData(
    @Header("Authorization") authorization: String,
    @Path(value = "ip", encoded = true) ip: String
  ): Response<ClientInfoMetaDataModel>

  /**
   * postConnectivityRecords to submit ping checks on backend
   * @param authorization : Access Token for backend
   * @param gigaIdSchool : giga id of the school the checks belong to
   * @param body : ping checks
   * @return : Instance of Response as Success or error
   */
  @POST("connectivity/{giga_id_school}")
  suspend fun postConnectivityRecords(
    @Header("Authorization") authorization: String,
    @Path("giga_id_school") gigaIdSchool: String,
    @Body body: ConnectivityRecordsRequestModel
  ): Response<Unit>

  /**
   * getFeatureFlags to read the school's feature flags, such as pingService
   * @param authorization : Access Token for backend
   * @param gigaIdSchool : giga id of the school
   * @return : Instance of Response as FeatureFlagsResponseModel if success or Error
   */
  @GET("schools/features_flags/{giga_id_school}")
  suspend fun getFeatureFlags(
    @Header("Authorization") authorization: String,
    @Path("giga_id_school") gigaIdSchool: String
  ): Response<FeatureFlagsResponseModel>
}
