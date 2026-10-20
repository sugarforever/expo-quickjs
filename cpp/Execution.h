#pragma once
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <deque>
namespace expoquickjs {
struct Limits {
  size_t timeoutMs=10000, memoryBytes=33554432, stackBytes=262144,
    outputBytes=1048576, messageBytes=1048576, maxHostCalls=32;
  void validate() const;
};
struct Event { std::string runId, type, status, json, error; };
struct Start { std::string runId, bootstrap, data="null"; Limits limits; };
class Execution {
 public:
  using Callback=std::function<void(const Event&)>;
  Execution(Start, Callback); ~Execution();
  bool ended() const { return ended_.load(); }
  void start(); void deliver(uint64_t id, std::string json); void cancel(); void join();
 private:
  struct VM;
  void run();
  Start options_; Callback callback_; std::thread thread_;
  std::atomic<bool> cancelled_{false}, ended_{false};
  std::mutex mutex_, joinMutex_; std::condition_variable cv_;
  std::deque<std::string> inbox_; std::set<uint64_t> pending_, used_;
};
class Runtime {
 public:
  ~Runtime();
  void start(Start, Execution::Callback);
  void deliver(const std::string&, uint64_t, std::string);
  void stop(const std::string&); void close();
 private:
  std::mutex mutex_, closeMutex_; bool closed_=false;
  std::map<std::string,std::shared_ptr<Execution>> runs_;
  std::set<std::string> ids_; std::set<std::string> live_;
};
}
