import {
  utilities as nestWinstonModuleUtilities,
  WinstonModuleOptions,
} from 'nest-winston';
import * as winston from 'winston';
import { scrubSensitive } from './sensitive-fields.serializer';

export function createWinstonConfig(level = 'info'): WinstonModuleOptions {
  return {
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format((info) => {
        const scrubbed = scrubSensitive(
          info,
        ) as winston.Logform.TransformableInfo;
        return scrubbed;
      })(),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        format:
          process.env.NODE_ENV === 'production'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                nestWinstonModuleUtilities.format.nestLike('sserp', {
                  prettyPrint: true,
                }),
              ),
      }),
    ],
  };
}
