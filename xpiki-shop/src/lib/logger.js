function stamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function write(level, scope, args) {
  console.log(`${stamp()} [${level}] [${scope}]`, ...args);
}

function createLogger(scope) {
  return {
    info: (...args) => write("info", scope, args),
    warn: (...args) => write("warn", scope, args),
    error: (...args) => write("error", scope, args)
  };
}

module.exports = { createLogger };
