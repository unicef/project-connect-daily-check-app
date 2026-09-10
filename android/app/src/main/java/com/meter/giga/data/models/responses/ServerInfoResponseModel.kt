package com.meter.giga.data.models.responses


data class ServerInfoResponseModel(
    val city: String?,
    val country: String?,
    val fqdn: String?,
    val ip: List<String?>?,
    val site: String?,
    val url: String?
)
