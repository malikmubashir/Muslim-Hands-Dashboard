/// <reference types="vite/client" />

// Allow importing .json modules (e.g. the dev-only seed import in
// services/donverseClient.ts) with a typed default export.
declare module '*.json' {
  const value: any;
  export default value;
}
