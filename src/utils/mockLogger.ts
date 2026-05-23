const dummyScope = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  log: console.log.bind(console),
};

export default {
  scope: () => dummyScope,
  ...dummyScope,
};
