import * as Sentry from "@sentry/node";
import { config } from "./config.js";

// Keep Sentry inert when no DSN is configured; never require a DSN to boot locally.
Sentry.init({
  dsn: config.sentryDsn,
  enabled: Boolean(config.sentryDsn),
  environment: config.nodeEnv,
  tracesSampleRate: config.sentryTracesSampleRate,
  // Remove user identifiers and sensitive request payloads before events leave the service.
  beforeSend(event) {
    delete event.user;
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      if (event.request.headers) {
        for (const header of Object.keys(event.request.headers)) {
          if (/^(authorization|cookie|set-cookie)$/i.test(header)) {
            delete event.request.headers[header];
          }
        }
      }
    }
    return event;
  },
});
