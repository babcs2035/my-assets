import pino from "pino";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname",
      singleLine: false,
    },
  },
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
});

export default logger;
