import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function isPublished(name, version, lookup = fetch) {
  const response = await lookup(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (response.status === 404) return false;
  if (!response.ok)
    throw Error(`npm registry lookup failed (${response.status})`);
  const manifest = await response.json();
  if (manifest.version !== version)
    throw Error("npm registry returned an unexpected version");
  return true;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));
  const published = await isPublished(name, version);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `published=${published}\n`);
  console.log(
    published
      ? `${name}@${version} is already published; no upload needed`
      : `${name}@${version} is not yet published`,
  );
}
