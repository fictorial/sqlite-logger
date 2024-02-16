process.env.TZ = 'UTC';

const assert = require("assert");
const logging = require("./index")({ path: ":memory:", teeStderr: true });

const debugLogger = logging.getLogger('testing debug logger', 'debug');
debugLogger.debug('debug message');
let msgs = logging.getMessages({ ctxs: ['testing debug logger'] });
assert.equal(msgs.length, 1);
assert.equal(msgs[0].msg, 'debug message');
assert.equal(msgs[0].ctx, 'testing debug logger');
assert.equal(msgs[0].level, 0);
let deltaMs = new Date() - new Date(msgs[0].ctime);
assert.ok(deltaMs > 0 && deltaMs < 1000);

const infoLogger = logging.getLogger('testing info logger', 'info');
infoLogger.info('info message');
msgs = logging.getMessages({ ctxs: ['testing info logger'] });
assert.equal(msgs.length, 1);
assert.equal(msgs[0].msg, 'info message');
assert.equal(msgs[0].ctx, 'testing info logger');
assert.equal(msgs[0].level, 1);
deltaMs = new Date() - new Date(msgs[0].ctime);
assert.ok(deltaMs > 0 && deltaMs < 1000);

const warnLogger = logging.getLogger('testing warn logger', 'warn');
warnLogger.warn('warn message');
msgs = logging.getMessages({ ctxs: ['testing warn logger'] });
assert.equal(msgs.length, 1);
assert.equal(msgs[0].msg, 'warn message');
assert.equal(msgs[0].ctx, 'testing warn logger');
assert.equal(msgs[0].level, 2);
deltaMs = new Date() - new Date(msgs[0].ctime);
assert.ok(deltaMs > 0 && deltaMs < 1000);

const errorLogger = logging.getLogger('testing error logger', 'error');
errorLogger.error('error message');
msgs = logging.getMessages({ ctxs: ['testing error logger'] });
assert.equal(msgs.length, 1);
assert.equal(msgs[0].msg, 'error message');
assert.equal(msgs[0].ctx, 'testing error logger');
assert.equal(msgs[0].level, 3);
deltaMs = new Date() - new Date(msgs[0].ctime);
assert.ok(deltaMs > 0 && deltaMs < 1000);

infoLogger.debug('should not be logged');
msgs = logging.getMessages({ ctxs: ['testing info logger'] });
assert.equal(msgs.length, 1);

warnLogger.debug('should not be logged');
msgs = logging.getMessages({ ctxs: ['testing warn logger'] });
assert.equal(msgs.length, 1);
warnLogger.info('should not be logged');
msgs = logging.getMessages({ ctxs: ['testing warn logger'] });
assert.equal(msgs.length, 1);

errorLogger.debug('should not be logged');
msgs = logging.getMessages({ ctxs: ['testing error logger'] });
assert.equal(msgs.length, 1);
errorLogger.info('should not be logged');
msgs = logging.getMessages({ ctxs: ['testing error logger'] });
assert.equal(msgs.length, 1);
errorLogger.warn('should not be logged');
msgs = logging.getMessages({ ctxs: ['testing error logger'] });
assert.equal(msgs.length, 1);

infoLogger.info('hello', {foo:42});
msgs = logging.getMessages({ ctxs: ['testing info logger'] });
const lastMsg = msgs.at(-1);
assert.deepEqual(lastMsg.data, {"foo":42});

console.log('all tests pass');

logging.close();
