# Keep all classes in com.example.app.data.models and subpackages
-keep class com.meter.giga.domain.entity.request.** { *; }
-keep class com.meter.giga.domain.entity.response.** { *; }
-keep class com.meter.giga.data.models.requests.** { *; }
-keep class com.meter.giga.data.models.responses.** { *; }
-keep interface com.meter.giga.network.api.** { *; }
-keep class com.meter.giga.network.RetrofitInstanceBuilder { *; }
-keep class com.meter.giga.domain.entity.SpeedTestResultEntity { *; }
-keep class com.meter.giga.utils.Constants { *; }
# Also, keep the Kotlin metadata (important for data classes)
-keepclassmembers class com.meter.giga.domain.entity.request.** {
    <fields>;
    <methods>;
}
-keepclassmembers class com.meter.giga.domain.entity.response.** {
    <fields>;
    <methods>;
}
-keepclassmembers class com.meter.giga.data.models.requests.** {
    <fields>;
    <methods>;
}
-keepclassmembers class com.meter.giga.data.models.responses.** {
    <fields>;
    <methods>;
}
# If you use Gson/Moshi or other reflection-based serialization
-keepattributes Signature, InnerClasses, EnclosingMethod, RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
# Remove all Log calls in release build
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}

-keepattributes LineNumberTable,SourceFile
-keep class io.sentry.** { *; }
-keep class org.jetbrains.annotations.** { *; }
-dontwarn javax.naming.**
-dontwarn javax.servlet.**
-dontwarn org.slf4j.impl.**


# Capacitor
-keep class com.getcapacitor.** { *; }

# Capacitor plugins
-keep class com.capacitorjs.plugins.** { *; }

# Keep annotations used by Capacitor permissions
-keepattributes *Annotation*

# Google location
-keep class com.google.android.gms.location.** { *; }
