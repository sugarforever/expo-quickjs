#include <jni.h>
#include <string>
#include <stdexcept>
#include <memory>
#include "../../../../cpp/Execution.h"
#include "../../../../cpp/Identity.h"
using namespace expoquickjs;
namespace {
std::string utf8(JNIEnv*e,jstring s){
 const jchar*p=e->GetStringChars(s,nullptr);jsize n=e->GetStringLength(s);std::string out;
 for(jsize i=0;i<n;i++){uint32_t c=p[i];if(c>=0xd800&&c<=0xdbff&&i+1<n&&p[i+1]>=0xdc00&&p[i+1]<=0xdfff){c=0x10000+((c-0xd800)<<10)+(p[++i]-0xdc00);}else if(c>=0xd800&&c<=0xdfff)c=0xfffd;
  if(c<128)out+=char(c);else if(c<2048){out+=char(0xc0|(c>>6));out+=char(0x80|(c&63));}else if(c<65536){out+=char(0xe0|(c>>12));out+=char(0x80|((c>>6)&63));out+=char(0x80|(c&63));}else{out+=char(0xf0|(c>>18));out+=char(0x80|((c>>12)&63));out+=char(0x80|((c>>6)&63));out+=char(0x80|(c&63));}}
 e->ReleaseStringChars(s,p);return out;
}
jstring javaString(JNIEnv*e,const std::string&s){
 std::u16string out;for(size_t i=0;i<s.size();){uint32_t c=(unsigned char)s[i++];int extra=0;if(c>=0xf0){c&=7;extra=3;}else if(c>=0xe0){c&=15;extra=2;}else if(c>=0xc0){c&=31;extra=1;}for(int j=0;j<extra&&i<s.size();j++)c=(c<<6)|((unsigned char)s[i++]&63);if(c>0xffff){c-=0x10000;out+=char16_t(0xd800|(c>>10));out+=char16_t(0xdc00|(c&1023));}else out+=char16_t(c);}
 return e->NewString(reinterpret_cast<const jchar*>(out.data()),out.size());
}
struct Holder {
 JavaVM*vm; jobject module; jmethodID event; Runtime runtime;
 Holder(JNIEnv*e,jobject o){e->GetJavaVM(&vm);module=e->NewGlobalRef(o);jclass c=e->GetObjectClass(o);event=e->GetMethodID(c,"onNativeEvent","(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V");e->DeleteLocalRef(c);}
 ~Holder(){runtime.close();JNIEnv*e=nullptr;bool attach=vm->GetEnv(reinterpret_cast<void**>(&e),JNI_VERSION_1_6)!=JNI_OK;if(attach)vm->AttachCurrentThread(&e,nullptr);e->DeleteGlobalRef(module);if(attach)vm->DetachCurrentThread();}
 void emit(const Event&v){JNIEnv*e=nullptr;bool attach=vm->GetEnv(reinterpret_cast<void**>(&e),JNI_VERSION_1_6)!=JNI_OK;if(attach&&vm->AttachCurrentThread(&e,nullptr)!=JNI_OK)return;
  e->PushLocalFrame(8);auto id=javaString(e,v.runId),type=javaString(e,v.type),status=javaString(e,v.status),json=javaString(e,v.json),error=javaString(e,v.error);e->CallVoidMethod(module,event,id,type,status,json,error);if(e->ExceptionCheck())e->ExceptionClear();e->PopLocalFrame(nullptr);if(attach)vm->DetachCurrentThread();
 }
};
Holder&get(jlong h){if(!h)throw std::invalid_argument("Closed native module");return *reinterpret_cast<Holder*>(h);}
void error(JNIEnv*e,const std::exception&ex){auto c=e->FindClass("java/lang/IllegalArgumentException");e->ThrowNew(c,ex.what());e->DeleteLocalRef(c);}
}
extern "C" JNIEXPORT jlong JNICALL Java_expo_modules_quickjs_ExpoQuickJSModule_nativeCreate(JNIEnv*e,jobject o){try{return reinterpret_cast<jlong>(new Holder(e,o));}catch(const std::exception&ex){error(e,ex);return 0;}}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_quickjs_ExpoQuickJSModule_nativeStart(JNIEnv*e,jobject,jlong h,jstring id,jstring code,jstring data,jlongArray limits){try{if(e->GetArrayLength(limits)!=6)throw std::invalid_argument("Invalid limits");jlong v[6];e->GetLongArrayRegion(limits,0,6,v);Limits l{size_t(v[0]),size_t(v[1]),size_t(v[2]),size_t(v[3]),size_t(v[4]),size_t(v[5])};auto&host=get(h);host.runtime.start({utf8(e,id),utf8(e,code),utf8(e,data),l},[&host](const Event&event){host.emit(event);});}catch(const std::exception&ex){error(e,ex);}}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_quickjs_ExpoQuickJSModule_nativeDeliver(JNIEnv*e,jobject,jlong h,jstring id,jlong call,jstring message){try{get(h).runtime.deliver(utf8(e,id),call,utf8(e,message));}catch(const std::exception&ex){error(e,ex);}}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_quickjs_ExpoQuickJSModule_nativeStop(JNIEnv*e,jobject,jlong h,jstring id){try{get(h).runtime.stop(utf8(e,id));}catch(const std::exception&ex){error(e,ex);}}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_quickjs_ExpoQuickJSModule_nativeClose(JNIEnv*e,jobject,jlong h){try{get(h).runtime.close();}catch(const std::exception&ex){error(e,ex);}}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_quickjs_ExpoQuickJSModule_nativeDestroy(JNIEnv*,jobject,jlong h){delete reinterpret_cast<Holder*>(h);}

extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_quickjs_ExpoQuickJSModule_nativeIdentity(JNIEnv*e,jobject){return javaString(e,expoquickjs::identity());}
