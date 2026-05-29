import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: pino.stdSerializers,
});

export type Logger = typeof logger;
