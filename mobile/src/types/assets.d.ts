/** Lets `require('./model.glb')` type-check — Metro resolves it to an asset module number (see metro.config.js). */
declare module '*.glb' {
  const value: number;
  export default value;
}

/** Text assets (the vendored model-viewer script) are bundled the same way. */
declare module '*.txt' {
  const value: number;
  export default value;
}
