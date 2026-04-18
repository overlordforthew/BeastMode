const { randomUUID } = require("crypto");
const pino = require("pino");
const pinoHttp = require("pino-http");

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.newPassword",
  "req.body.code",
  "req.body.credential",
  "res.headers['set-cookie']",
];

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: redactPaths,
    censor: "[redacted]",
  },
});

const httpLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const requestId = typeof incoming === "string" && incoming.trim() ? incoming.trim() : randomUUID();
    res.setHeader("x-request-id", requestId);
    return requestId;
  },
  autoLogging: {
    ignore(req) {
      return req.url === "/api/health";
    },
  },
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    if (req.url === "/api/health") return "debug";
    return "info";
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} -> ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    return `${req.method} ${req.url} -> ${res.statusCode} (${err.message})`;
  },
  customProps(req) {
    return {
      requestId: req.id,
      userId: req.userId || req.admin?.id || null,
    };
  },
});

module.exports = { logger, httpLogger };
