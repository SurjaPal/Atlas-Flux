// Compiles contracts/ with the locally-bundled solc-js package (no network
// call — the compiler ships inside the npm package itself) and writes
// artifacts in the exact shape Hardhat/hardhat-ethers expect, so the rest
// of the toolchain (tests, hardhat-ethers, hardhat network) works normally
// via `npx hardhat test --no-compile`.
//
// This script exists only because the sandbox this was built in blocks
// binaries.soliditylang.org, which `npx hardhat compile` needs to fetch the
// solc binary on a fresh machine. On a normal dev machine or CI runner with
// open internet access, `npx hardhat compile` works directly and this
// script is not needed — it's kept here for reproducibility.

const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");
const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");
const NODE_MODULES = path.join(__dirname, "..", "node_modules");

function findSolFiles(dir, base = dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(findSolFiles(full, base));
    } else if (entry.name.endsWith(".sol")) {
      out.push(path.relative(path.join(base, ".."), full).replace(/\\/g, "/"));
    }
  }
  return out;
}

function importCallback(importPath) {
  // Resolve node_modules imports (e.g. @openzeppelin/contracts/...) and
  // relative "contracts/..." paths used as source names.
  const candidates = [
    path.join(__dirname, "..", importPath),
    path.join(NODE_MODULES, importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }
  return { error: `File not found: ${importPath}` };
}

function main() {
  const solFiles = findSolFiles(CONTRACTS_DIR); // e.g. ["contracts/AuditLedger.sol"]
  const sources = {};
  for (const f of solFiles) {
    sources[f] = { content: fs.readFileSync(path.join(__dirname, "..", f), "utf8") };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.bytecode.linkReferences", "evm.deployedBytecode.linkReferences"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: importCallback }));

  let hasError = false;
  for (const err of output.errors || []) {
    if (err.severity === "error") {
      hasError = true;
      console.error(err.formattedMessage);
    } else {
      console.warn(err.formattedMessage);
    }
  }
  if (hasError) {
    process.exit(1);
  }

  for (const sourceName of Object.keys(output.contracts)) {
    for (const contractName of Object.keys(output.contracts[sourceName])) {
      const c = output.contracts[sourceName][contractName];
      const outDir = path.join(ARTIFACTS_DIR, sourceName);
      fs.mkdirSync(outDir, { recursive: true });

      const artifact = {
        _format: "hh-sol-artifact-1",
        contractName,
        sourceName,
        abi: c.abi,
        bytecode: "0x" + c.evm.bytecode.object,
        deployedBytecode: "0x" + c.evm.deployedBytecode.object,
        linkReferences: c.evm.bytecode.linkReferences || {},
        deployedLinkReferences: c.evm.deployedBytecode.linkReferences || {},
      };

      fs.writeFileSync(path.join(outDir, `${contractName}.json`), JSON.stringify(artifact, null, 2));
      console.log(`Compiled ${sourceName}:${contractName} -> ${path.join(outDir, contractName + ".json")}`);
    }
  }
}

main();
