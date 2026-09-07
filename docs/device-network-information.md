# 2.0.4 network information

Only what is **new** or **newly populated** in this version. Fields that already existed and were already filled by the Windows client (`device_type`, `device_hardware_id`, `windows_username`, `installed_path`, `wifi_connections`, `ip_address`, `client_info`, `timestamp`) are unchanged and not listed.

# new field: device\_network\_information

One JSON object per measurement, for the context that changes from run to run and had no column. All keys optional — unreadable values are absent, never zero-filled.

## network shape

*   `connection_type` — `wifi`, `ethernet` or `unknown`, from the default adapter
*   `default_gateway` — router address
*   `dns_servers` — configured IPv4 resolvers, deduplicated, max 8, loopback stubs excluded
*   `ip_family` — `v4`, `v6` or `dual`
*   `link_speed_mbps` — negotiated link speed of the default adapter

## vpn inference

*   `vpn_likely` — a VPN or virtual adapter appears to be in the path
*   `vpn_adapter` — name of the adapter behind that guess

Heuristic, not detection: matches virtual adapters and known VPN driver names (TAP/TUN/WinTun, WireGuard, OpenVPN, AnyConnect, ZeroTier, Tailscale, NordLynx, GlobalProtect, L2TP, SSTP, IKEv2…). Flags virtual adapters that are not VPNs; misses VPNs with unexpected names.

## traffic counters

*   `net_bytes_rx` — bytes received by the adapter
*   `net_bytes_tx` — bytes sent by the adapter

Cumulative since boot, not per test. Only meaningful as a difference between two rows from the same machine and boot.

## machine load

*   `cpu_load_percent` — CPU load around the test
*   `memory_available_mb` — free memory
*   `disk_free_mb` — free space on the system volume (`C:`)

Context for a measurement that looks wrong: a machine at 100% CPU does not produce a trustworthy speed test.

# new root level fields

## wi-fi diagnostics

*   `wifi_unavailable_reason` — why the existing `wifi_connections` record is empty: `no_adapter`, `wlan_service_off`, `location_disabled`, `unknown`
*   `ssid_source` — where the network name came from: `wlan` (full record) or `nlm` (name only)

Why they were added: on Windows 11 24H2+ the WLAN stack sits behind the Location services permission. With it off, `wifi_connections` comes back empty **on a machine connected over Wi-Fi**, and Wi-Fi geolocation silently degrades to the IP estimate — previously indistinguishable from a machine with no Wi-Fi at all. `ssid_source` marks rows whose name was recovered through the ungated fallback: those have a name, but no BSSID, signal or channel.

## timing

*   `server_timestamp` — the measurement server's own clock, read at server discovery

Added because these machines frequently have a clock that is wrong by hours or days. It sits next to the existing `timestamp` rather than replacing it. Read a few seconds before the test starts, at one-second resolution: good for detecting a bad clock, not a precise start time.

# newly populated: device identity

These columns were **added by the Android client**. The Windows client did not fill them, so Windows rows landed null. **From 2.0.4 the Windows client populates them:**

*   `device_name` — machine hostname
*   `device_model` — hardware model from the firmware
*   `device_manufacturer` — hardware vendor
*   `app_build_number` — short commit of the build, falling back to the app version

No schema change was needed — the columns and the API already accepted them.

# capture cost

*   Cached, recomputed only on network change (keyed on default gateway): `connection_type`, `ip_family`, `vpn_likely`, `vpn_adapter`, `link_speed_mbps`, `dns_servers`
*   Read per measurement, concurrently: `default_gateway`, `net_bytes_rx`, `net_bytes_tx`, `cpu_load_percent`, `memory_available_mb`, `disk_free_mb`
*   Failure is soft: an unreadable value yields an absent key, never a failed measurement

# validation on the way in

*   Only the twelve keys above are accepted; anything else is dropped with a warning
*   Values coerced to their declared type; mismatches dropped
*   Strings truncated at 128 chars, `dns_servers` capped at 8
*   Non-finite numbers rejected
*   Nothing valid left → stored as `null`, not `{}`

# not collected

Considered and rejected:

*   MAC addresses
*   Neighbouring networks (SSIDs/BSSIDs from the scan) — used in transit for geolocation, never stored
*   Active connection table
*   CPU temperature — empty without admin rights
*   CPU model, cores, RAM size, disk size and type — static facts, wrong shape per measurement row

# status

*   `device_network_information`, `wifi_unavailable_reason`, `ssid_source` and `server_timestamp` are **implemented in the 2.0.4 client**; their backend columns are still in open pull requests, not yet on staging
*   The client fills them regardless — the API ignores fields it does not know, so client and backend can ship in either order

# gaps

*   **`os_version`** **is not sent by the Windows client**, so it stays null on Windows rows. It arrived with the same Android set as the four fields above, and 2.0.4 does not fill it. Separately, the Windows client sends `sdk_version` meaning the _speed-test library_ version — a different thing from the Android SDK level the name came from — and the API no longer has a field by that name, so that value is discarded. Two decisions: do we want the real OS version from Windows, and where should the speed-test library version live?
*   Static hardware facts (CPU model, cores, RAM, disk) have no per-installation home
*   Final key list still needs sign-off
