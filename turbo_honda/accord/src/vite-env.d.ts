/// <reference types="vite/client" />

// Allow CSS Module imports
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
