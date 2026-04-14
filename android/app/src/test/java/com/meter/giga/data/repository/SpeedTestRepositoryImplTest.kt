import com.meter.giga.data.models.responses.AbuseResponseModel
import com.meter.giga.data.models.responses.AsnData
import com.meter.giga.data.models.responses.AsnObject
import com.meter.giga.data.models.responses.AsnResponseModel
import com.meter.giga.data.models.responses.CarrierResponseModel
import com.meter.giga.data.models.responses.ClientInfoFallbackResponseModel
import com.meter.giga.data.models.responses.ClientInfoLiteResponseModel
import com.meter.giga.data.models.responses.ClientInfoMetaDataModel
import com.meter.giga.data.models.responses.ClientInfoResponseModel
import com.meter.giga.data.models.responses.CompanyResponseModel
import com.meter.giga.data.models.responses.DomainsResponseModel
import com.meter.giga.data.models.responses.PrivacyResponseModel
import com.meter.giga.data.models.responses.ServerInfoResponseModel
import com.meter.giga.data.repository.SpeedTestRepositoryImpl
import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.error_handler.ErrorEntity
import com.meter.giga.network.api.ApiService
import com.meter.giga.network.util.RetrofitProvider
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.ResultState
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertTrue
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mock
import org.mockito.Mockito
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.mockito.junit.MockitoJUnitRunner
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.whenever
import retrofit2.Response

@RunWith(MockitoJUnitRunner::class)
class SpeedTestRepositoryImplTest {

  @Mock
  lateinit var mockProvider: RetrofitProvider

  @Mock
  lateinit var mockClientApi: ApiService

  @Mock
  lateinit var mockClientLiteApi: ApiService

  @Mock
  lateinit var mockClientFallbackApi: ApiService

  @Mock
  lateinit var mockServerApi: ApiService

  @Mock
  lateinit var mockSpeedTestApi: ApiService

  @Mock
  lateinit var logger: AppLogger

  private lateinit var repo: SpeedTestRepositoryImpl

  private fun <T> any(): T = Mockito.any<T>()

  @Before
  fun setup() {
    whenever(mockProvider.clientInfoApi).thenReturn(mockClientApi)
    whenever(mockProvider.clientInfoLiteApi).thenReturn(mockClientLiteApi)
    whenever(mockProvider.clientInfoFallbackApi).thenReturn(mockClientFallbackApi)
    whenever(mockProvider.serverInfoApi).thenReturn(mockServerApi)
    whenever(mockProvider.getSpeedTestApi(anyOrNull())).thenReturn(mockSpeedTestApi)
    whenever(logger.d(anyOrNull(), anyOrNull())).then { /* ignore */ }
    repo = SpeedTestRepositoryImpl(mockProvider, logger)
  }

  @Test
  fun `getClientInfoData returns Success when API returns body`() = runBlocking {

    val apiModel = ClientInfoResponseModel(
      abuse = AbuseResponseModel(
        address = "",
        country = "",
        email = "",
        name = "",
        network = "",
        phone = ""
      ),
      asn = AsnResponseModel(
        asn = "",
        domain = "",
        name = "",
        route = "",
        type = ""
      ),
      carrier = CarrierResponseModel(
        mcc = "",
        mnc = "",
        name = ""
      ),
      city = "",
      company = CompanyResponseModel(
        domain = "",
        name = "",
        type = ""
      ),
      country = "",
      domains = DomainsResponseModel(
        domains = emptyList(),
        page = 0,
        total = 0
      ),
      ip = "",
      loc = "",
      org = "",
      postal = "",
      privacy = PrivacyResponseModel(
        hosting = false,
        proxy = false,
        relay = false,
        service = "",
        tor = false,
        vpn = false
      ),
      region = "",
      timezone = ""
    )
    val apiResponse = Response.success(apiModel)

    whenever(mockClientApi.getClientInfo(anyOrNull())).thenReturn(apiResponse)

    val result = repo.getClientInfoData("token")

    assertTrue(result is ResultState.Success)
  }

  @Test
  fun `getClientInfoData returns Success via fallback`() = runBlocking {

    val fallbackResponse = ClientInfoFallbackResponseModel(
      ip = "3.3.3.3",
      accuracy = 0,
      area_code = "",
      asn = 0,
      city = "",
      continent_code = "",
      country = "",
      country_code = "",
      country_code3 = "",
      latitude = "",
      longitude = "",
      organization = "",
      organization_name = "",
      region = "",
      timezone = "",
    )

    val apiModel: ClientInfoResponseModel? = null

    val apiResponse = Response.success(apiModel)

    whenever(mockClientApi.getClientInfo(anyOrNull())).thenReturn(apiResponse)
    // fallback success
    `when`(mockClientFallbackApi.getClientInfoFallback()).thenReturn(
      Response.success(
        fallbackResponse
      )
    )

    val result = repo.getClientInfoData("token")

    assertTrue(result is ResultState.Success)
  }

  @Test
  fun `getClientInfoData returns Failure via fallback as well`() = runBlocking {

    val apiModel: ClientInfoResponseModel? = null

    val apiResponse = Response.success(apiModel)

    whenever(mockClientApi.getClientInfo(anyOrNull())).thenReturn(apiResponse)
    // fallback success
    `when`(mockClientFallbackApi.getClientInfoFallback())
      .thenReturn(
        Response.error(
          500,
          "Error".toResponseBody("text/plain".toMediaTypeOrNull())
        )
      )

    val result = repo.getClientInfoData("token")

    assertTrue(result is ResultState.Failure)
  }

  @Test
  fun `getClientInfoData returns Failure when fallback response null`() = runBlocking {

    val apiModel: ClientInfoResponseModel? = null

    val apiResponse = Response.success(apiModel)

    val fallbackModel: ClientInfoFallbackResponseModel? = null

    val fallbackResponse = Response.success(fallbackModel)

    whenever(mockClientApi.getClientInfo(anyOrNull())).thenReturn(apiResponse)
    // fallback success
    `when`(mockClientFallbackApi.getClientInfoFallback())
      .thenReturn(
        fallbackResponse
      )

    val result = repo.getClientInfoData("token")

    assertTrue(result is ResultState.Failure)
  }

  @Test
  fun `getClientInfoData returns Failure when exception thrown`() = runBlocking {

    whenever(mockClientApi.getClientInfo(anyOrNull())).thenThrow(RuntimeException("Network failure"))

    val result = repo.getClientInfoData("token")

    assertTrue(result is ResultState.Failure)
  }

  @Test
  fun `getClientInfoData returns Failure when API fails`() = runBlocking {
    val response = Response.error<ClientInfoResponseModel>(
      400,
      "Bad request".toResponseBody(null)
    )

    whenever(mockClientApi.getClientInfo(anyOrNull())).thenReturn(response)

    val result = repo.getClientInfoData("token")

    assertTrue(result is ResultState.Failure)
  }

  @Test
  fun `getClientInfoLiteData success with ASN string`() = runBlocking {

    val liteInfo = ClientInfoLiteResponseModel(
      ip = "1.1.1.1",
      asName = "MyISP",
      asDomain = "",
      asn = "",
      continent = "",
      continentCode = "",
      country = "",
      countryCode = ""
    )

    val metaData = ClientInfoMetaDataModel(
      asn = AsnData.AsString("AS1234"),
      city = "Mumbai",
      country = "IN",
      ip = "1.1.1.1",
      org = "AS1234 MyOrg",
      loc = "19.0760,72.8777",
      postal = "400001",
      region = "MH",
      timezone = "Asia/Kolkata",
      hostname = "",
      id = 0
    )

    `when`(mockClientLiteApi.getClientInfoLite("token")).thenReturn(Response.success(liteInfo))
    `when`(mockProvider.getSpeedTestApiWithAdapter(anyString(), any())).thenReturn(
      mockSpeedTestApi
    )
    `when`(mockSpeedTestApi.getIpInfoMetaData(anyString(), anyString()))
      .thenReturn(Response.success(metaData))

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Success)
    val entity = (result as ResultState.Success).data!!
    assertEquals("AS1234", entity.asn)
    assertEquals("Mumbai", entity.city)
  }

  @Test
  fun `getClientInfoLiteData success with ASN object`() = runBlocking {

    val liteInfo = ClientInfoLiteResponseModel(
      ip = "1.1.1.1",
      asName = "MyISP",
      asDomain = "",
      asn = "",
      continent = "",
      continentCode = "",
      country = "",
      countryCode = ""
    )

    val metaData = ClientInfoMetaDataModel(
      asn = AsnData.AsObject(AsnObject("AS1234")),

      city = "Delhi",
      country = "IN",
      ip = "1.1.1.1",
      org = "AS9876 OrgName",
      loc = "",
      postal = "",
      region = "",
      timezone = "",
      hostname = "",
      id = 0
    )

    `when`(mockClientLiteApi.getClientInfoLite("token")).thenReturn(Response.success(liteInfo))
    `when`(mockProvider.getSpeedTestApiWithAdapter(anyString(), any())).thenReturn(
      mockSpeedTestApi
    )
    `when`(mockSpeedTestApi.getIpInfoMetaData(anyString(), anyString()))
      .thenReturn(Response.success(metaData))

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Success)
    val entity = (result as ResultState.Success).data!!
    assertEquals("AS1234", entity.asn)
  }

  @Test
  fun `getClientInfoLiteData ASN null extracted from org`() = runBlocking {

    val liteInfo = ClientInfoLiteResponseModel(
      ip = "1.1.1.1",
      asName = "MyISP",
      asDomain = "",
      asn = "",
      continent = "",
      continentCode = "",
      country = "",
      countryCode = ""
    )

    val metaData = ClientInfoMetaDataModel(
      asn = null,
      city = "Mumbai",
      country = "IN",
      ip = "1.1.1.1",
      org = "AS1234 MyOrg",
      loc = "19.0760,72.8777",
      postal = "400001",
      region = "MH",
      timezone = "Asia/Kolkata",
      hostname = "",
      id = 0
    )

    `when`(mockClientLiteApi.getClientInfoLite("token")).thenReturn(Response.success(liteInfo))
    `when`(mockProvider.getSpeedTestApiWithAdapter(anyString(), any())).thenReturn(
      mockSpeedTestApi
    )
    `when`(mockSpeedTestApi.getIpInfoMetaData(anyString(), anyString()))
      .thenReturn(Response.success(metaData))

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Success)
    val entity = (result as ResultState.Success).data!!
    assertEquals("AS1234", entity.asn)
  }

  @Test
  fun `getClientInfoLiteData metadata fails then fallback api success`() = runBlocking {

    val liteInfo = ClientInfoLiteResponseModel(
      ip = "1.1.1.1",
      asName = "MyISP",
      asDomain = "",
      asn = "",
      continent = "",
      continentCode = "",
      country = "",
      countryCode = ""
    )
    val fallbackResponse = ClientInfoFallbackResponseModel(
      ip = "3.3.3.3",
      accuracy = 0,
      area_code = "",
      asn = 0,
      city = "",
      continent_code = "",
      country = "",
      country_code = "",
      country_code3 = "",
      latitude = "",
      longitude = "",
      organization = "",
      organization_name = "",
      region = "",
      timezone = "",
    )

    `when`(mockClientLiteApi.getClientInfoLite("token")).thenReturn(Response.success(liteInfo))
    `when`(mockProvider.getSpeedTestApiWithAdapter(anyString(), any())).thenReturn(
      mockSpeedTestApi
    )

    // metadata call fails
    `when`(mockSpeedTestApi.getIpInfoMetaData(anyString(), anyString()))
      .thenReturn(
        Response.error(
          500,
          "Error".toResponseBody("text/plain".toMediaTypeOrNull())
        )
      )

    // metadata call fails
    `when`(mockClientApi.getClientInfo(anyString()))
      .thenReturn(
        Response.error(
          500,
          "Error".toResponseBody("text/plain".toMediaTypeOrNull())
        )
      )

    // fallback success
    `when`(mockClientFallbackApi.getClientInfoFallback()).thenReturn(
      Response.success(
        fallbackResponse
      )
    )

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Success)
  }

  @Test
  fun `getClientInfoLiteData metadata fails then fallback api response null`() = runBlocking {

    val liteInfo: ClientInfoLiteResponseModel? = null
    val fallbackResponse: ClientInfoFallbackResponseModel? = null

    `when`(mockClientLiteApi.getClientInfoLite("token")).thenReturn(Response.success(liteInfo))

    // fallback success
    `when`(mockClientFallbackApi.getClientInfoFallback()).thenReturn(
      Response.success(
        fallbackResponse
      )
    )

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Failure)
  }

  @Test
  fun `getClientInfoLiteData metadata fails then fallback api fail`() = runBlocking {

    val liteInfo: ClientInfoLiteResponseModel? = null

    `when`(mockClientLiteApi.getClientInfoLite("token")).thenReturn(Response.success(liteInfo))

    // fallback success
    `when`(mockClientFallbackApi.getClientInfoFallback()).thenReturn(
      Response.error(
        500,
        "Error".toResponseBody("text/plain".toMediaTypeOrNull())
      )
    )

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Failure)
  }

  @Test
  fun `getClientInfoLiteData metadata fails when exception thrown`() = runBlocking {


    `when`(mockClientLiteApi.getClientInfoLite("token")).thenThrow(RuntimeException("Network failure"))

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Failure)
  }

  @Test
  fun `getClientInfoLiteData all api calls fail returns Failure`() = runBlocking {

    `when`(mockClientLiteApi.getClientInfoLite("token"))
      .thenReturn(Response.error(400, "bad".toResponseBody(null)))

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Failure)
    val error = (result as ResultState.Failure).error as ErrorEntity.Unknown
    assertEquals("Get client info api failed", error.message)
  }

  @Test
  fun `getClientInfoLiteData exception caught returns Failure`() = runBlocking {

    `when`(mockClientLiteApi.getClientInfoLite("token")).thenThrow(RuntimeException("boom"))

    val result = repo.getClientInfoLiteData("token", "key", "baseUrl")

    assertTrue(result is ResultState.Failure)
  }

  @Test
  fun `getServerInfoData returns Success`() = runBlocking {

    val apiModel = ServerInfoResponseModel(
      ip = emptyList(),
      site = "Delhi, India",
      url = "",
      city = "",
      country = "",
      fqdn = ""
    )
    val apiResponse = Response.success(apiModel)

    whenever(mockServerApi.getServerInfoNoPolicy())
      .thenReturn(apiResponse)

    val result = repo.getServerInfoData(null)

    assertTrue(result is ResultState.Success)
  }

  @Test
  fun `publishSpeedTestData returns Success when post is successful`() = runBlocking {

    val mockSpeedResponse = Response.success(Unit)

    whenever(mockSpeedTestApi.postSpeedTestData(anyOrNull(), anyOrNull()))
      .thenReturn(mockSpeedResponse)

    val data = mock(SpeedTestResultRequestEntity::class.java)

    val result = repo.publishSpeedTestData(data, "key", "https://base/")

    assertTrue(result is ResultState.Success)
  }

  @Test
  fun `publishSpeedTestData returns Failure when post is successful`() = runBlocking {
    whenever(mockSpeedTestApi.postSpeedTestData(anyOrNull(), anyOrNull()))
      .thenReturn(
        Response.error(
          500,
          "Error".toResponseBody("text/plain".toMediaTypeOrNull())
        )
      )

    val data = mock(SpeedTestResultRequestEntity::class.java)

    val result = repo.publishSpeedTestData(data, "key", "https://base/")

    assertTrue(result is ResultState.Failure)
  }
}





