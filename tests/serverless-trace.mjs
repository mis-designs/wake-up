import { nodeFileTrace } from "@vercel/nft";
import { readlink } from "node:fs/promises";
import path from "node:path";

// Local isolated checkouts may share an installed dependency tree via a Windows
// junction. Model that ONE root as the real directory installed in production;
// otherwise NFT records the junction alone and omits its outside-base targets.
// Trace every package file normally; never skip directories or borrow packages
// from the source tree when executing the resulting isolated bundle.
export function traceServerless(entry, root) {
  const dependencyRoot = path.resolve(root, "node_modules");
  return nodeFileTrace([path.resolve(root, entry)], { base: root, processCwd: root,
    async readlink(file) {
      if (path.resolve(file) === dependencyRoot) return null;
      try { return await readlink(file); }
      catch (error) {
        if (["EINVAL", "ENOENT", "ENOTDIR", "UNKNOWN"].includes(error.code)) return null;
        throw error;
      }
    }
  });
}
