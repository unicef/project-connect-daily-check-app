package com.meter.giga.domain.usecases

import com.meter.giga.data.repository.SpeedTestRepositoryImpl
import com.meter.giga.data.util.RetrofitInstanceProviderImpl
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.ResultState

/**
 * This class is responsible only to fetch the Client Info
 * Data
 */
class GetClientInfoUseCase() {
  /**
   * This function responsible for fetching the client info
   * @return ResultState<ClientInfoResponseEntity?> : Result State
   * as Success as ClientInfoResponseEntity instance
   * as Failure as String Message with failure message
   */
  suspend fun invoke(
    ipInfoToken: String,
    uploadKey: String,
    baseUrl: String
  ): ResultState<ClientInfoResponseEntity?> {
    val speedTestRepository = SpeedTestRepositoryImpl(
      retrofitProvider = RetrofitInstanceProviderImpl()
    )
    AppLogger.d("GIGA GetClientInfoUseCase", "speedTestRepository $speedTestRepository")
    return speedTestRepository.getClientInfoLiteData(ipInfoToken, uploadKey, baseUrl)
  }
}
