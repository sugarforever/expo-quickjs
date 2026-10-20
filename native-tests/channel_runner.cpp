// Host-only real-engine transport for conformance tests. Not part of mobile runtime.
#include "Execution.h"
#include "Identity.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <sys/select.h>
#include <unistd.h>
using namespace expoquickjs;
static std::string read(const char*p){std::ifstream f(p);if(!f)throw std::runtime_error("Cannot read input");return {std::istreambuf_iterator<char>(f),{}};}
static std::string quote(const std::string&s){std::string r="\"";for(unsigned char c:s){if(c=='"'||c=='\\'){r+='\\';r+=c;}else if(c<32){const char*h="0123456789abcdef";r+="\\u00";r+=h[c>>4];r+=h[c&15];}else r+=c;}return r+'"';}
int main(int argc,char**argv){try{
 if(argc==2&&std::string(argv[1])=="--identity"){std::cout<<expoquickjs::identity()<<std::endl;return 0;}
 if(argc<3)return 2;std::atomic<bool>done{false};Runtime runtime;Limits l;
 if(argc>3)l.timeoutMs=std::stoull(argv[3]);if(argc>4)l.memoryBytes=std::stoull(argv[4]);if(argc>5)l.stackBytes=std::stoull(argv[5]);if(argc>6)l.outputBytes=std::stoull(argv[6]);if(argc>7)l.messageBytes=std::stoull(argv[7]);if(argc>8)l.maxHostCalls=std::stoull(argv[8]);
 runtime.start({"run",read(argv[1]),read(argv[2]),l},[&](const Event&e){
  std::cout<<"{\"runId\":\"run\",\"type\":"<<quote(e.type)<<",\"status\":"<<quote(e.status)<<",\"json\":"<<quote(e.json)<<",\"error\":"<<quote(e.error)<<"}"<<std::endl;
  if(e.type=="terminal")done.store(true);
 });
 std::string buffered;
 while(!done.load()){
  fd_set fds;FD_ZERO(&fds);FD_SET(STDIN_FILENO,&fds);timeval t{0,10000};
  if(select(STDIN_FILENO+1,&fds,nullptr,nullptr,&t)>0){
   char bytes[8192];ssize_t count=::read(STDIN_FILENO,bytes,sizeof bytes);if(count<=0){runtime.stop("run");break;}
   buffered.append(bytes,count);size_t end;
   while((end=buffered.find('\n'))!=std::string::npos){std::string line=buffered.substr(0,end);buffered.erase(0,end+1);
    if(line=="stop"){runtime.stop("run");break;}auto tab=line.find('\t');try{runtime.deliver("run",std::stoull(line.substr(0,tab)),line.substr(tab+1));}catch(const std::exception&e){std::cerr<<e.what()<<std::endl;}
   }
  }
 }
 runtime.close();return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<std::endl;return 1;}}
