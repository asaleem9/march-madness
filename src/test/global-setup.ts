import { getSnapshot } from "./pglite-snapshot";

/** Build the PGlite schema snapshot once before any worker starts. */
export default async function setup() {
  await getSnapshot();
}
