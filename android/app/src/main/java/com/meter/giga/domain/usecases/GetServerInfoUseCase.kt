package com.meter.giga.domain.usecases

import com.meter.giga.data.repository.SpeedTestRepositoryImpl
import com.meter.giga.data.util.RetrofitInstanceProviderImpl
import com.meter.giga.domain.entity.response.ServerInfoResponseEntity
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.ResultState

/**
 * This class is responsible only to
 * fetch the Server Info Data
 */
class GetServerInfoUseCase {
  /**
   * This function responsible for fetching the server info
   * @param metro : Null or value if user has selected any metro
   * @return ResultState<ServerInfoResponseEntity?> : Result State
   * as Success as ServerInfoResponseEntity instance
   * as Failure as String Message with failure message
   */
  suspend fun invoke(metro: String?): ResultState<ServerInfoResponseEntity?> {
    val speedTestRepository = SpeedTestRepositoryImpl(
      retrofitProvider = RetrofitInstanceProviderImpl()
    )
    AppLogger.d("GIGA GetClientInfoUseCase", "speedTestRepository $speedTestRepository")
    return speedTestRepository.getServerInfoData(metro)
  }
}
