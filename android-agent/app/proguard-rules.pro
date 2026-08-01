# kotlinx.serialization generates synthetic serializer classes that R8 cannot
# see being used, so keep them or JSON encoding fails only in release builds.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

-keepclassmembers class app.netscope.agent.data.** {
    *** Companion;
}
-keepclasseswithmembers class app.netscope.agent.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class app.netscope.agent.data.**$$serializer { *; }

# OkHttp ships optional platform hooks that are absent on Android.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
