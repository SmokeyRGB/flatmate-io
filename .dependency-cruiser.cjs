/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-cross-module-schema-or-repository",
      comment:
        "ADR-001: a module's schema.ts and repository.ts are not importable from another module. " +
        "Known violations are baselined in .dependency-cruiser-known-violations.json; delete an entry when its import is gone.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/(schema|repository)\\.ts$",
        pathNot: "^src/modules/$1/(schema|repository)\\.ts$",
      },
    },
    {
      name: "app-imports-module-public-functions-only",
      comment:
        "ADR-001: src/app may import a module's public functions (repository.ts and the other function modules). " +
        "schema.ts is the table module and is not part of that surface.",
      severity: "error",
      from: { path: "^src/app/" },
      to: { path: "^src/modules/[^/]+/schema\\.ts$" },
    },
    {
      name: "no-raw-db-client",
      comment:
        "Nothing imports src/db/client.ts except src/db itself and a module repository.ts.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/db/|repository\\.ts$" },
      to: { path: "^src/db/client\\.ts$" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
  },
};
