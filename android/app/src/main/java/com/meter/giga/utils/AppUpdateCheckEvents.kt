package com.meter.giga.utils

/**
 * Represents an application-level plugin event used for
 * communication between native Android components.
 *
 * <p>This event model is primarily used for:
 * <ul>
 *   <li>App update availability notifications.</li>
 *   <li>Background worker to UI communication.</li>
 *   <li>Event bus message passing.</li>
 * </ul>
 *
 * @property action unique identifier representing the event type.
 * @property payload optional additional data associated with the event.
 */
data class PluginEvent(
  /**
   * Defines the type/category of the event.
   */
  val action: String,
  /**
   * Optional event payload containing extra details
   * related to the event.
   */
  val payload: String? = null
) {
  companion object {
    /**
     * Event action indicating that a new application
     * update is available in the Play Store.
     *
     * <p>This event is typically used to trigger
     * the in-app update flow.
     */
    const val ACTION_APP_CHECK_AVAILABLE = "ACTION_APP_CHECK_AVAILABLE"

    /**
     * Event action indicating that no new application
     * update is available.
     *
     * <p>This event is used to notify the UI layer
     * that the application is already up to date.
     */
    const val ACTION_APP_CHECK_NOT_AVAILABLE = "ACTION_APP_CHECK_NOT_AVAILABLE"
  }
}
