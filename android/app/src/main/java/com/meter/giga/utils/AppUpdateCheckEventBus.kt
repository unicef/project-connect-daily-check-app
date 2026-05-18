package com.meter.giga.utils

object AppUpdateCheckEventBus {

  // @JvmField makes this callable from Java as AppEventBus.listener (no getter/setter)
  @Volatile
  private var listener: EventListener? = null

  fun interface EventListener {
    fun onEvent(event: PluginEvent)
  }

  @JvmStatic
  fun setListener(listener: EventListener) {
    this.listener = listener
  }

  @JvmStatic
  fun removeListener() {
    this.listener = null
  }

  @JvmStatic
  fun post(event: PluginEvent) {
    listener?.onEvent(event)
  }
}
