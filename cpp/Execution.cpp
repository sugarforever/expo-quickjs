#include "Execution.h"
extern "C" {
#include "../vendor/quickjs-2025-09-13/quickjs.h"
}
#include <cmath>
#include <limits>
#include <stdexcept>
#include <vector>
namespace expoquickjs {
void Limits::validate() const {
 if(!timeoutMs||timeoutMs>86400000||memoryBytes<262144||memoryBytes>2147483648ULL||stackBytes<16384||stackBytes>1048576||!outputBytes||outputBytes>67108864||!messageBytes||messageBytes>16777216||!maxHostCalls||maxHostCalls>1024) throw std::invalid_argument("Invalid execution limits");
}
struct Execution::VM {
 Execution& owner; JSRuntime* rt=nullptr; JSContext* ctx=nullptr; JSValue receive=JS_UNDEFINED, hook=JS_UNDEFINED;
 std::chrono::steady_clock::time_point deadline;
 std::string status,error,result; size_t output=0; bool finished=false;
 explicit VM(Execution& e):owner(e),deadline(std::chrono::steady_clock::now()+std::chrono::milliseconds(e.options_.limits.timeoutMs)){}
 ~VM(){if(ctx){JS_FreeValue(ctx,receive);JS_FreeValue(ctx,hook);JS_FreeContext(ctx);}if(rt)JS_FreeRuntime(rt);}
 bool interrupted(){
  if(owner.cancelled_.load()){fail("aborted","Execution cancelled");return true;}
  if(std::chrono::steady_clock::now()>=deadline){fail("timeout","Execution deadline exceeded");return true;}
  return !status.empty();
 }
 void fail(std::string s,std::string e){if(status.empty()){if(e.size()>owner.options_.limits.messageBytes){s="resource-limit";e="Error text exceeds message byte limit";e.resize(std::min(e.size(),owner.options_.limits.messageBytes));}status=std::move(s);error=std::move(e);}}
 static int interrupt(JSRuntime*,void* opaque){return static_cast<VM*>(opaque)->interrupted();}
 static VM& self(JSContext*c){return *static_cast<VM*>(JS_GetContextOpaque(c));}
 std::string string(JSValueConst v){size_t n=0;const char*p=JS_ToCStringLen(ctx,&n,v);if(!p)throw std::runtime_error("String conversion failed");std::string s(p,n);JS_FreeCString(ctx,p);return s;}
 std::string json(JSValueConst v){
  if(!JS_IsString(v))throw std::invalid_argument("Bridge expects JSON string");
  auto s=string(v);if(s.size()>owner.options_.limits.messageBytes){fail("resource-limit","Message byte limit exceeded");throw std::runtime_error(error);}
  JSValue parsed=JS_ParseJSON(ctx,s.data(),s.size(),"message.json");bool bad=JS_IsException(parsed);JS_FreeValue(ctx,parsed);if(bad)throw std::invalid_argument("Invalid JSON message");
  if(s.size()>owner.options_.limits.outputBytes-output){fail("resource-limit","Aggregate output byte limit exceeded");throw std::runtime_error(error);}output+=s.size();return s;
 }
 static JSValue emit(JSContext*c,JSValueConst,int argc,JSValueConst*argv,int magic){
  auto&v=self(c);if(v.finished||!v.status.empty())return JS_UNDEFINED;
  try{
   if(argc<(magic==1?2:1))throw std::invalid_argument("Missing bridge arguments");
   uint64_t id=0;
   if(magic==1){double n=0; if(JS_ToFloat64(c,&n,argv[0])<0||!std::isfinite(n)||n<1||n>9007199254740991.||std::floor(n)!=n)throw std::invalid_argument("Invalid call ID");id=static_cast<uint64_t>(n);}
   auto s=v.json(argv[magic==1?1:0]);
   if(magic==1){std::lock_guard<std::mutex>l(v.owner.mutex_);if(v.owner.used_.count(id))throw std::invalid_argument("Duplicate call ID");if(v.owner.pending_.size()>=v.owner.options_.limits.maxHostCalls){v.fail("resource-limit","Pending host call limit exceeded");throw std::runtime_error(v.error);}v.owner.used_.insert(id);v.owner.pending_.insert(id);}
   if(magic==2){v.result=std::move(s);v.finished=true;}
   else v.owner.callback_({v.owner.options_.runId,"message","",s,""});
   return JS_UNDEFINED;
  }catch(const std::exception&e){return JS_ThrowTypeError(c,"%s",e.what());}catch(...){v.fail("native-error","Event callback failed");return JS_ThrowInternalError(c,"Event callback failed");}
 }
 void exception(){
  JSValue e=JS_GetException(ctx);std::string msg="QuickJS exception";try{msg=string(e);}catch(...){}JS_FreeValue(ctx,e);
  if(msg.find("out of memory")!=std::string::npos||msg.find("stack overflow")!=std::string::npos)fail("resource-limit",msg);else fail("script-error",msg);
 }
 bool check(JSValue v){bool ok=!JS_IsException(v);if(!ok)exception();JS_FreeValue(ctx,v);return ok;}
 bool call(JSValueConst fn,JSValue arg,bool hasArg,bool*again=nullptr){
  if(JS_IsUndefined(fn)){JS_FreeValue(ctx,arg);return true;}
  JSValue r=JS_Call(ctx,fn,JS_UNDEFINED,hasArg?1:0,hasArg?&arg:nullptr);if(again&&!JS_IsException(r))*again=JS_ToBool(ctx,r)>0;
  JS_FreeValue(ctx,arg);return check(r);
 }
 void drain(){
  do{
   int jobs=0;
   while(JS_IsJobPending(rt)&&!finished&&!interrupted()){
    JSContext* jobctx=nullptr;int r=JS_ExecutePendingJob(rt,&jobctx);if(r<0){exception();return;}
    if(++jobs%50==0&&interrupted())return;
   }
   if(finished||interrupted())return;
   bool again=false;
   if(!call(hook,JS_UNDEFINED,false,&again))return;
   if(!again&&!JS_IsJobPending(rt))return;
  }while(!finished&&!interrupted());
 }
 void execute(){
  if(interrupted())return;
  rt=JS_NewRuntime();if(!rt){fail("resource-limit","Cannot allocate QuickJS runtime");return;}
  JS_SetMemoryLimit(rt,owner.options_.limits.memoryBytes);JS_SetMaxStackSize(rt,owner.options_.limits.stackBytes);JS_SetInterruptHandler(rt,interrupt,this);
  ctx=JS_NewContext(rt);if(!ctx){fail("resource-limit","Cannot allocate QuickJS context");return;}JS_SetContextOpaque(ctx,this);
  JSValue g=JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx,g,"__emit",JS_NewCFunctionMagic(ctx,emit,"__emit",1,JS_CFUNC_generic_magic,0));
  JS_SetPropertyStr(ctx,g,"__request",JS_NewCFunctionMagic(ctx,emit,"__request",2,JS_CFUNC_generic_magic,1));
  JS_SetPropertyStr(ctx,g,"__finish",JS_NewCFunctionMagic(ctx,emit,"__finish",1,JS_CFUNC_generic_magic,2));
  JSValue data=JS_ParseJSON(ctx,owner.options_.data.data(),owner.options_.data.size(),"start.json");
  if(JS_IsException(data)){JS_FreeValue(ctx,g);exception();return;}
  JS_SetPropertyStr(ctx,g,"__startData",data);JS_FreeValue(ctx,g);
  if(!check(JS_Eval(ctx,owner.options_.bootstrap.data(),owner.options_.bootstrap.size(),"bootstrap.js",JS_EVAL_TYPE_GLOBAL)))return;
  g=JS_GetGlobalObject(ctx);
  receive=JS_GetPropertyStr(ctx,g,"__receive");hook=JS_GetPropertyStr(ctx,g,"__drain");
  if(JS_IsUndefined(hook)){JS_FreeValue(ctx,hook);hook=JS_GetPropertyStr(ctx,g,"__onIdle");}
  for(const char*name:{"__receive","__drain","__onIdle"}){JSAtom atom=JS_NewAtom(ctx,name);JS_DeleteProperty(ctx,g,atom,0);JS_FreeAtom(ctx,atom);}
  JS_FreeValue(ctx,g);
  drain();
  while(!finished&&!interrupted()){
   std::string input;
   {std::unique_lock<std::mutex>l(owner.mutex_);owner.cv_.wait_until(l,deadline,[&]{return owner.cancelled_.load()||!owner.inbox_.empty();});if(!owner.inbox_.empty()){input=std::move(owner.inbox_.front());owner.inbox_.pop_front();}}
   if(interrupted())break;if(input.empty())continue;
   JSValue value=JS_ParseJSON(ctx,input.data(),input.size(),"reply.json");if(JS_IsException(value)){exception();break;}
   if(!call(receive,value,true))break;drain();
  }
 }
};
Execution::Execution(Start o,Callback c):options_(std::move(o)),callback_(std::move(c)){}
Execution::~Execution(){cancel();join();}
void Execution::start(){thread_=std::thread([this]{run();});}
void Execution::run(){
 Event terminal{options_.runId,"terminal","native-error","","Native execution failed"};
 try{VM vm(*this);vm.execute();terminal.status=vm.status.empty()?(vm.finished?"ok":"native-error"):vm.status;terminal.error=vm.error;terminal.json=vm.result;}catch(const std::exception&e){terminal.error=e.what();}catch(...){terminal.error="Unknown native failure";}
 ended_.store(true);
 {std::lock_guard<std::mutex>l(mutex_);std::string().swap(options_.bootstrap);std::string().swap(options_.data);pending_.clear();used_.clear();std::deque<std::string>().swap(inbox_);}
 try{callback_(terminal);}catch(...){}callback_={};
}
void Execution::deliver(uint64_t id,std::string json){
 if(json.size()>options_.limits.messageBytes)throw std::invalid_argument("Reply byte limit exceeded");
 std::lock_guard<std::mutex>l(mutex_);
 if(ended_.load()||cancelled_.load()||!pending_.count(id))throw std::invalid_argument("Unknown, duplicate or stale reply");
 if(inbox_.size()>=options_.limits.maxHostCalls)throw std::invalid_argument("Inbound queue full");
 pending_.erase(id);inbox_.push_back(std::move(json));cv_.notify_one();
}
void Execution::cancel(){cancelled_.store(true);cv_.notify_one();}
void Execution::join(){std::lock_guard<std::mutex>l(joinMutex_);if(thread_.joinable())thread_.join();}
Runtime::~Runtime(){close();}
void Runtime::start(Start o,Execution::Callback cb){
 std::lock_guard<std::mutex>admission(closeMutex_);
 o.limits.validate();if(o.runId.empty()||o.runId.size()>256||o.bootstrap.size()>o.limits.messageBytes||o.data.size()>o.limits.messageBytes)throw std::invalid_argument("Invalid start payload");
 std::vector<std::shared_ptr<Execution>> retired;
 {
  std::lock_guard<std::mutex>l(mutex_);
  for(auto i=runs_.begin();i!=runs_.end();){if(i->second->ended()){retired.push_back(i->second);i=runs_.erase(i);}else ++i;}
  if(closed_||ids_.count(o.runId)||live_.size()>=2)throw std::invalid_argument("Closed runtime, duplicate run ID or admission limit");
  const auto id=o.runId;auto e=std::make_shared<Execution>(std::move(o),[this,id,cb](const Event&event){if(event.type=="terminal"){std::lock_guard<std::mutex>l(mutex_);live_.erase(id);}cb(event);});
  runs_[id]=e;ids_.insert(id);live_.insert(id);
  try{e->start();}catch(...){runs_.erase(id);ids_.erase(id);live_.erase(id);throw;}
 }
 // Retired workers may still be returning from terminal callback. Never join under mutex_.
 for(auto&e:retired)e->join();
}
void Runtime::deliver(const std::string&id,uint64_t call,std::string message){std::shared_ptr<Execution>e;{std::lock_guard<std::mutex>l(mutex_);auto i=runs_.find(id);if(i==runs_.end())throw std::invalid_argument("Unknown run");e=i->second;}e->deliver(call,std::move(message));}
void Runtime::stop(const std::string&id){std::shared_ptr<Execution>e;{std::lock_guard<std::mutex>l(mutex_);auto i=runs_.find(id);if(i==runs_.end())return;e=i->second;e->cancel();}e->join();{std::lock_guard<std::mutex>l(mutex_);auto i=runs_.find(id);if(i!=runs_.end()&&i->second==e)runs_.erase(i);}}
void Runtime::close(){std::lock_guard<std::mutex>closing(closeMutex_);std::map<std::string,std::shared_ptr<Execution>>runs;{std::lock_guard<std::mutex>l(mutex_);closed_=true;runs.swap(runs_);for(auto&[id,e]:runs)e->cancel();}for(auto&[id,e]:runs)e->join();}
}
