#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface EQQRuntime : NSObject
@property(class, nonatomic, readonly) NSString *identity;
- (instancetype)initWithEventHandler:(void (^)(NSDictionary<NSString *,id> *))handler NS_SWIFT_NAME(init(eventHandler:));
- (BOOL)start:(NSString *)runId bootstrap:(NSString *)bootstrap data:(NSString *)data limits:(NSString *)limits error:(NSError **)error;
- (BOOL)deliver:(NSString *)runId message:(NSString *)message error:(NSError **)error;
- (BOOL)stop:(NSString *)runId error:(NSError **)error;
- (BOOL)close:(NSError **)error;
@end
NS_ASSUME_NONNULL_END
