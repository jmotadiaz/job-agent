type Level = 'info' | 'warn' | 'error';

function emit(level: Level, module: string, event: string, payload?: unknown): void {
  const ts = new Date().toISOString();
  const payloadStr = payload !== undefined ? ' ' + JSON.stringify(payload) : '';
  const line = `[${ts}] [${module}] ${event}${payloadStr}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info(module: string, event: string, payload?: unknown): void {
    emit('info', module, event, payload);
  },
  warn(module: string, event: string, payload?: unknown): void {
    emit('warn', module, event, payload);
  },
  error(module: string, event: string, payload?: unknown): void {
    emit('error', module, event, payload);
  },
};
