#include "Execution.h"
#include <iostream>
#include <stdexcept>
#include <vector>
#include <future>
using namespace expoquickjs;
#define CHECK(x) do {if(!(x)) throw std::runtime_error(#x);}while(0)
struct Run {
 Runtime runtime; std::mutex mutex; std::condition_variable cv; std::vector<Event> events;
 void start(std::string code, Limits limits={}) {runtime.start({"test",code,"null",limits},[this](const Event&e){std::lock_guard<std::mutex>l(mutex);events.push_back(e);cv.notify_all();});}
 Event terminal(){std::unique_lock<std::mutex>l(mutex);CHECK(cv.wait_for(l,std::chrono::seconds(4),[&]{return !events.empty()&&events.back().type=="terminal";}));return events.back();}
 ~Run(){runtime.close();}
};
int main(){try{
 {Run r;r.start("__finish(JSON.stringify(6*7))");CHECK(r.terminal().json=="42");}
 {Run r;r.start("__finish(JSON.stringify([typeof process,typeof require,typeof fetch,typeof setTimeout]))");CHECK(r.terminal().json=="[\"undefined\",\"undefined\",\"undefined\",\"undefined\"]");}
 {Run r;r.start("throw Error('oops')");CHECK(r.terminal().status=="script-error");}
 {Run r;Limits l;l.timeoutMs=40;r.start("while(true){}",l);CHECK(r.terminal().status=="timeout");}
 {Run r;Limits l;l.timeoutMs=40;r.start("(async()=>{while(true) await null})()",l);CHECK(r.terminal().status=="timeout");}
 {Run r;r.start("while(true){}");r.runtime.stop("test");CHECK(r.terminal().status=="aborted");}
 {Run r;r.start("globalThis.__receive=m=>__finish(JSON.stringify(m.payload)); __request(1,'{\"name\":\"delay\"}')");
  {std::unique_lock<std::mutex>l(r.mutex);CHECK(r.cv.wait_for(l,std::chrono::seconds(1),[&]{return !r.events.empty();}));}
  r.runtime.deliver("test",1,"{\"id\":1,\"payload\":\"你好🌳\"}");CHECK(r.terminal().json=="\"你好🌳\"");
  bool threw=false;try{r.runtime.deliver("test",1,"{}");}catch(...){threw=true;}CHECK(threw);}
 {Run r;Limits l;l.outputBytes=8;r.start("try{__emit(JSON.stringify('🌳🌳'))}catch(e){};__finish('null')",l);CHECK(r.terminal().status=="resource-limit");}
 {Run r;Limits l;l.memoryBytes=1024*1024;r.start("let x=[];while(true)x.push(new Array(10000).fill('abc'))",l);CHECK(r.terminal().status=="resource-limit");}
 {Run r;r.start("function f(){f()}f()");CHECK(r.terminal().status=="resource-limit");}
 {Run r;r.start("globalThis.__onIdle=()=>__finish('true')");CHECK(r.terminal().json=="true");}

 {Runtime rt;std::mutex m;std::condition_variable cv;int terminals=0;
  auto cb=[&](const Event&e){if(e.type=="terminal"){std::lock_guard<std::mutex>l(m);terminals++;cv.notify_all();}};
  rt.start({"one","globalThis.__receive=m=>__finish('null');__request(1,'null')"},cb);
  rt.start({"two","globalThis.__receive=m=>__finish('null');__request(1,'null')"},cb);
  bool rejected=false;try{rt.start({"three","__finish('null')"},cb);}catch(...){rejected=true;}CHECK(rejected);
  std::thread a([&]{rt.stop("one");}),b([&]{rt.close();});a.join();b.join();CHECK(terminals==2);
 }
 {Run r;Limits l;l.maxHostCalls=1;r.start("try{__request(1,'null');__request(2,'null')}catch(e){}",l);CHECK(r.terminal().status=="resource-limit");}
 {Run r;r.start("globalThis.__receive=m=>{__finish(JSON.stringify(m))};__request(1,'null')");
  {std::unique_lock<std::mutex>l(r.mutex);CHECK(r.cv.wait_for(l,std::chrono::seconds(1),[&]{return !r.events.empty();}));}
  bool rejected=false;try{r.runtime.deliver("test",2,"{}");}catch(...){rejected=true;}CHECK(rejected);r.runtime.stop("test");CHECK(r.terminal().status=="aborted");
 }

 {Runtime rt;std::mutex m;std::condition_variable cv;int terminals=0;
  auto token=std::make_shared<int>(42);std::weak_ptr<int>weak=token;
  auto cb=[&](const Event&e){if(e.type=="terminal"){std::lock_guard<std::mutex>l(m);terminals++;cv.notify_all();}};
  rt.start({"first","__finish('null')"},[token,cb](const Event&e){cb(e);});token.reset();
  {std::unique_lock<std::mutex>l(m);CHECK(cv.wait_for(l,std::chrono::seconds(1),[&]{return terminals==1;}));}
  rt.start({"second","__finish('null')"},cb);
  {std::unique_lock<std::mutex>l(m);CHECK(cv.wait_for(l,std::chrono::seconds(1),[&]{return terminals==2;}));}
  CHECK(weak.expired());rt.close();
 }

 {Runtime rt;std::mutex m;std::condition_variable cv;bool blocked=false,release=false,second=false;
  rt.start({"old","__finish('null')"},[&](const Event&e){if(e.type=="terminal"){std::unique_lock<std::mutex>l(m);blocked=true;cv.notify_all();cv.wait(l,[&]{return release;});}});
  {std::unique_lock<std::mutex>l(m);CHECK(cv.wait_for(l,std::chrono::seconds(1),[&]{return blocked;}));}
  auto starting=std::async(std::launch::async,[&]{rt.start({"new","__finish('null')"},[&](const Event&e){if(e.type=="terminal"){std::lock_guard<std::mutex>l(m);second=true;cv.notify_all();}});});
  {std::unique_lock<std::mutex>l(m);CHECK(cv.wait_for(l,std::chrono::seconds(1),[&]{return second;}));}
  auto closing=std::async(std::launch::async,[&]{rt.close();});bool early=closing.wait_for(std::chrono::milliseconds(30))==std::future_status::ready;
  {std::lock_guard<std::mutex>l(m);release=true;cv.notify_all();}starting.get();closing.get();CHECK(!early);
 }
 for(int i=0;i<30;i++){Run r;r.start("__finish('null')");CHECK(r.terminal().status=="ok");}
 std::cout<<"native execution tests passed\n";
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
