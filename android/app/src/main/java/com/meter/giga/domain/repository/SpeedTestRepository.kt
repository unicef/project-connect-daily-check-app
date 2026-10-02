package com.meter.giga.domain.repository

import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.utils.ResultState

/**
 * Provides abstract function definition
 * to be implemented in class where this
 * interface is getting implemented
 */
interface SpeedTestRepository {

  /**
   * This function provides getClientInfoData abstract definition
   * to fetch the client info
   * @return ResultState<ClientInfoResponseEntity?> : Result State
   * as Success as ClientInfoResponseEntity instance
   * as Failure as String Message with failure message
   */
  suspend fun getClientInfoData(ipInfoToken: String): ResultState<ClientInfoResponseEntity?>

  /**
   * This function provides getClientInfoData abstract definition
   * to fetch the client info
   * @return ResultState<ClientInfoResponseEntity?> : Result State
   * as Success as ClientInfoResponseEntity instance
   * as Failure as String Message with failure message
   */
  suspend fun getClientInfoLiteData(
    ipInfoToken: String,
    uploadKey: String,
    baseUrl: String
  ): ResultState<ClientInfoResponseEntity?>

  /**
   * This function provides publishSpeedTestData abstract
   * definition to post the speed test data
   * @param speedTestData : instance of SpeedTestResultRequestEntity,
   * contains details of speed test
   * @return ResultState<Any?>
   *   as Success if posted the data successfully
   *   as Failure if post request failed with message
   */
  suspend fun publishSpeedTestData(
    speedTestData: SpeedTestResultRequestEntity,
    uploadKey: String,
    baseUrl: String
  ): ResultState<Unit?>
}
