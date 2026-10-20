#import "EQQRuntime.h"
#include "../cpp/Execution.h"
#include "../cpp/Identity.h"
#include <cmath>
using namespace expoquickjs;
static std::string utf8(NSString *s){NSData *d=[s dataUsingEncoding:NSUTF8StringEncoding];return std::string((const char*)d.bytes,d.length);}
static NSString *str(const std::string&s){return [[NSString alloc] initWithBytes:s.data() length:s.size() encoding:NSUTF8StringEncoding]?:@"Invalid UTF-8 native string";}
static NSDictionary *object(NSString*s){NSData*d=[s dataUsingEncoding:NSUTF8StringEncoding];id v=[NSJSONSerialization JSONObjectWithData:d options:0 error:nil];if(![v isKindOfClass:[NSDictionary class]])throw std::invalid_argument("Expected JSON object");return v;}
static size_t integer(NSDictionary*d,NSString*k){id n=d[k];if(![n isKindOfClass:[NSNumber class]]||CFGetTypeID((__bridge CFTypeRef)n)==CFBooleanGetTypeID())throw std::invalid_argument("Expected integer");double v=[n doubleValue];if(!std::isfinite(v)||v<1||v>9007199254740991.||floor(v)!=v)throw std::invalid_argument("Expected positive safe integer");return (size_t)v;}
static BOOL failed(NSError **e,const std::exception&ex){if(e)*e=[NSError errorWithDomain:@"ExpoQuickJS" code:1 userInfo:@{NSLocalizedDescriptionKey:str(ex.what())}];return NO;}
@implementation EQQRuntime { std::shared_ptr<Runtime> _runtime; void (^_handler)(NSDictionary<NSString *,id> *); }
+ (NSString*)identity {return str(expoquickjs::identity());}
- (instancetype)initWithEventHandler:(void (^)(NSDictionary<NSString *,id> *))handler {if((self=[super init])){_runtime=std::make_shared<Runtime>();_handler=[handler copy];}return self;}
- (BOOL)start:(NSString*)runId bootstrap:(NSString*)bootstrap data:(NSString*)data limits:(NSString*)limits error:(NSError**)error {
 try{NSDictionary*d=object(limits);Limits l; l.timeoutMs=integer(d,@"timeoutMs");l.memoryBytes=integer(d,@"memoryBytes");l.stackBytes=integer(d,@"stackBytes");l.outputBytes=integer(d,@"outputBytes");l.messageBytes=integer(d,@"messageBytes");l.maxHostCalls=integer(d,@"maxHostCalls");
  auto handler=_handler;
  _runtime->start({utf8(runId),utf8(bootstrap),utf8(data),l},[handler](const Event&e){@autoreleasepool {NSDictionary*event=@{@"runId":str(e.runId),@"type":str(e.type),@"status":str(e.status),@"json":str(e.json),@"error":str(e.error)};dispatch_async(dispatch_get_main_queue(),^{handler(event);});}});return YES;
 }catch(const std::exception&ex){return failed(error,ex);}
}
- (BOOL)deliver:(NSString*)runId message:(NSString*)message error:(NSError**)error {try{NSDictionary*d=object(message);_runtime->deliver(utf8(runId),integer(d,@"id"),utf8(message));return YES;}catch(const std::exception&ex){return failed(error,ex);}}
- (BOOL)stop:(NSString*)runId error:(NSError**)error {try{_runtime->stop(utf8(runId));return YES;}catch(const std::exception&ex){return failed(error,ex);}}
- (BOOL)close:(NSError**)error {try{_runtime->close();return YES;}catch(const std::exception&ex){return failed(error,ex);}}
- (void)dealloc {_runtime->close();}
@end
