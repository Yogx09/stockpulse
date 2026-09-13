export function createLogger(serviceName: string) {
  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      console.log(`\x1b[36m[${new Date().toISOString()}] [${serviceName.toUpperCase()}]\x1b[0m ${message}`, meta ? meta : "");
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.warn(`\x1b[33m[${new Date().toISOString()}] [${serviceName.toUpperCase()}] WARN:\x1b[0m ${message}`, meta ? meta : "");
    },
    error: (message: string, error?: unknown) => {
      console.error(`\x1b[31m[${new Date().toISOString()}] [${serviceName.toUpperCase()}] ERROR:\x1b[0m ${message}`, error ? error : "");
    },
    success: (message: string, meta?: Record<string, unknown>) => {
      console.log(`\x1b[32m[${new Date().toISOString()}] [${serviceName.toUpperCase()}] SUCCESS:\x1b[0m ${message}`, meta ? meta : "");
    }
  };
}
