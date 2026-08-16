const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Read api.js
const apiJsPath = path.join(__dirname, 'src', 'shared', 'api.js');
const apiJsContent = fs.readFileSync(apiJsPath, 'utf8');

// 2. Extract endpoints (strings starting with / inside request() calls)
// Using regex to find request("/something") or request(`/something`)
const endpointRegex = /request(?:WithToken)?\s*\(\s*(['"`])(\/[^'"?$`]+)/g;
const endpoints = new Set();
let match;
while ((match = endpointRegex.exec(apiJsContent)) !== null) {
  // Extract just the path part before any query params like ? or dynamic ${}
  let endpoint = match[2];
  endpoints.add(endpoint);
}

// 3. Get all markdown files in the workspace
function getAllMarkdownFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file.startsWith('.')) continue; // skip node_modules and hidden dirs
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllMarkdownFiles(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const mdFiles = getAllMarkdownFiles(__dirname);
console.log(`Found ${mdFiles.length} markdown files to search.`);

// 4. Check which endpoints are missing
const missingEndpoints = [];
const foundEndpoints = [];

for (const ep of endpoints) {
  let found = false;
  for (const mdFile of mdFiles) {
    const mdContent = fs.readFileSync(mdFile, 'utf8');
    if (mdContent.includes(ep)) {
      found = true;
      break;
    }
  }
  if (found) {
    foundEndpoints.push(ep);
  } else {
    missingEndpoints.push(ep);
  }
}

console.log("\n==== ENDPOINTS NOT FOUND IN ANY MD FILE ====");
missingEndpoints.forEach(ep => console.log(ep));

console.log("\n==== SUMMARY ====");
console.log(`Total endpoints in api.js: ${endpoints.size}`);
console.log(`Endpoints FOUND in docs: ${foundEndpoints.length}`);
console.log(`Endpoints MISSING from docs: ${missingEndpoints.length}`);
