package com.meter.giga.utils;

import android.webkit.WebView;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

/**
 * Repairs speed-test history already stored in the WebView before the page reads it.
 *
 * The Data page reads localStorage directly. A measurement missing mlabInformation
 * or results.receivedBytes throws while that page is opening, and the previous
 * page stays on screen. This runs at document start, on Android only.
 */
public final class WebViewHistoryRepair {
  private static final String SCRIPT = """
    (function () {
      if (window.__gigaHistoryRepair) return;
      window.__gigaHistoryRepair = true;
      // Assigning localStorage.getItem would store a "getItem" item instead of
      // replacing the method, so the prototype is patched.
      var original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        var value = original.call(this, key);
        if (this !== window.localStorage) return value;
        if (key !== 'historicalData' && key !== 'historicalDataAll') return value;
        if (!value) return value;
        try {
          return JSON.stringify(repairHistory(JSON.parse(value)));
        } catch (e) {
          return value;
        }
      };

      function repairHistory(data) {
        if (!data || typeof data !== 'object' || !data.measurements) return data;
        for (var i = 0; i < data.measurements.length; i++) {
          repairMeasurement(data.measurements[i]);
        }
        return data;
      }

      function repairMeasurement(measurement) {
        if (!measurement || typeof measurement !== 'object') return;
        if (!measurement.mlabInformation || typeof measurement.mlabInformation !== 'object') {
          measurement.mlabInformation = {};
        }
        if (measurement.mlabInformation.city == null) measurement.mlabInformation.city = '';
        if (!measurement.accessInformation || typeof measurement.accessInformation !== 'object') {
          measurement.accessInformation = {};
        }
        var results = measurement.results && typeof measurement.results === 'object'
          ? measurement.results
          : {};
        var downloadDirection = results['NDTResult.S2C'];
        var tcp = downloadDirection && downloadDirection.LastServerMeasurement
          ? downloadDirection.LastServerMeasurement.TCPInfo
          : null;
        var latencyUs = tcp ? asNumber(tcp.MinRTT) : null;
        results['NDTResult.S2C'] = fillDirection(results['NDTResult.S2C'], latencyUs);
        results['NDTResult.C2S'] = fillDirection(results['NDTResult.C2S'], latencyUs);
        if (asNumber(results.receivedBytes) === null) {
          var download = measurement.dataUsage ? asNumber(measurement.dataUsage.download) : null;
          results.receivedBytes = download === null ? 0 : download;
        }
        measurement.results = results;
      }

      function fillDirection(source, latencyUs) {
        var direction = source && typeof source === 'object' ? source : {};
        var client = direction.LastClientMeasurement;
        if (!client || typeof client !== 'object') client = {};
        if (asNumber(client.MeanClientMbps) === null) client.MeanClientMbps = 0;
        direction.LastClientMeasurement = client;
        var server = direction.LastServerMeasurement;
        if (!server || typeof server !== 'object') server = {};
        var bbr = server.BBRInfo;
        if (!bbr || typeof bbr !== 'object') bbr = {};
        if (asNumber(bbr.MinRTT) === null) bbr.MinRTT = latencyUs === null ? 0 : latencyUs;
        server.BBRInfo = bbr;
        direction.LastServerMeasurement = server;
        return direction;
      }

      function asNumber(value) {
        return typeof value === 'number' && !isNaN(value) ? value : null;
      }
    })();
    """;

  private WebViewHistoryRepair() {}

  public static void install(WebView webView) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      AppLogger.INSTANCE.d("WebViewHistoryRepair", "Document start script is not supported");
      return;
    }
    for (String origin : new String[]{"https://localhost", "http://localhost"}) {
      try {
        WebViewCompat.addDocumentStartJavaScript(
          webView,
          SCRIPT,
          Collections.singleton(origin)
        );
      } catch (IllegalArgumentException ex) {
        AppLogger.INSTANCE.d("WebViewHistoryRepair", "Could not install repair for " + origin);
      }
    }
  }
}
