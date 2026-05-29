package com.meter.giga.utils

/**
 * Lightweight event bus used for communicating
 * app update events between Android native components.
 *
 * <p>This event bus enables:
 * <ul>
 *   <li>Registering a single update event listener.</li>
 *   <li>Removing the registered listener safely.</li>
 *   <li>Dispatching update-related events across components.</li>
 * </ul>
 *
 * <p>The implementation is designed for simple in-app communication
 * between the update worker, plugin layer, and activity layer.
 */
object AppUpdateCheckEventBus {

  /**
   * Registered event listener instance.
   *
   * <p>{@link Volatile} ensures visibility of updates
   * across multiple threads.
   */
  @Volatile
  private var listener: EventListener? = null

  /**
   * Functional interface representing an update event listener.
   *
   * <p>Implemented by components interested in receiving
   * {@link PluginEvent} notifications.
   */
  fun interface EventListener {
    /**
     * Callback invoked when a new event is posted
     * to the event bus.
     *
     * @param event update-related plugin event.
     */
    fun onEvent(event: PluginEvent)
  }

  /**
   * Registers an event listener for receiving
   * app update events.
   *
   * <p>Only one listener is maintained at a time.
   * Registering a new listener replaces the previous one.
   *
   * @param listener listener implementation to receive events.
   */
  @JvmStatic
  fun setListener(listener: EventListener) {
    this.listener = listener
  }

  /**
   * Removes the currently registered event listener.
   *
   * <p>This is typically invoked during component cleanup
   * to avoid memory leaks.
   */
  @JvmStatic
  fun removeListener() {
    this.listener = null
  }

  /**
   * Dispatches an event to the currently registered listener.
   *
   * <p>If no listener is registered, the event is ignored.
   *
   * @param event plugin event to dispatch.
   */
  @JvmStatic
  fun post(event: PluginEvent) {
    listener?.onEvent(event)
  }
}
