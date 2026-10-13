# Third-party dependency notices

FlightPilot's root MIT license applies to this project's original source. Dependencies retain their own licenses and copyright notices. No dependency source or binaries are vendored in this repository.

This inventory records package license metadata from the dependencies installed by pnpm, including development dependencies. It is not a replacement for the full upstream license texts or notices. The installed packages include those texts; preserve the applicable notices and satisfy their terms when redistributing dependencies or an application image.

Some dependencies use LGPL, MPL, or Creative Commons terms. In particular, libvips binaries, lightningcss, and caniuse-lite retain their respective upstream licenses. This project does not relicense them under MIT.

Regenerate after installing the locked dependencies:

```sh
pnpm install --frozen-lockfile
pnpm licenses:generate
```

The generator reads `pnpm licenses list --json` and retains only package names, versions, and license identifiers. Machine-specific install paths and other metadata are omitted. Platform-specific optional packages can change the inventory between operating systems or architectures; regenerate for any binary distribution target.

This snapshot contains **298 package entries** across **10 license groups**.

## 0BSD

| Package | Installed versions |
| ------- | ------------------ |
| tslib   | 2.8.1              |

## Apache-2.0

| Package                        | Installed versions |
| ------------------------------ | ------------------ |
| @electric-sql/pglite           | 0.3.16             |
| @eslint/config-array           | 0.23.5             |
| @eslint/config-helpers         | 0.7.0              |
| @eslint/core                   | 1.2.1              |
| @eslint/object-schema          | 3.0.5              |
| @eslint/plugin-kit             | 0.7.3              |
| @humanfs/core                  | 0.19.2             |
| @humanfs/node                  | 0.16.8             |
| @humanfs/types                 | 0.15.0             |
| @humanwhocodes/module-importer | 1.0.1              |
| @humanwhocodes/retry           | 0.4.3              |
| @img/sharp-darwin-arm64        | 0.35.5             |
| @playwright/test               | 1.64.0             |
| @swc/helpers                   | 0.5.23             |
| baseline-browser-mapping       | 2.11.28            |
| detect-libc                    | 2.1.2              |
| drizzle-orm                    | 0.45.4             |
| eslint-visitor-keys            | 3.4.3, 5.0.1       |
| expect-type                    | 1.4.0              |
| playwright                     | 1.64.0             |
| playwright-core                | 1.64.0             |
| sharp                          | 0.35.5             |
| typescript                     | 5.9.3              |

## BSD-2-Clause

| Package           | Installed versions |
| ----------------- | ------------------ |
| dotenv            | 17.4.2             |
| eslint-scope      | 9.1.2              |
| espree            | 11.2.0             |
| esrecurse         | 4.3.0              |
| estraverse        | 5.3.0              |
| esutils           | 2.0.3              |
| json-schema-typed | 8.0.2              |
| uri-js            | 4.4.1              |

## BSD-3-Clause

| Package       | Installed versions |
| ------------- | ------------------ |
| esquery       | 1.7.0              |
| fast-uri      | 3.1.8              |
| qs            | 6.16.0             |
| source-map-js | 1.2.2              |

## BlueOak-1.0.0

| Package   | Installed versions |
| --------- | ------------------ |
| minimatch | 10.2.6             |

## CC-BY-4.0

| Package      | Installed versions |
| ------------ | ------------------ |
| caniuse-lite | 1.0.30001815       |

## ISC

| Package              | Installed versions |
| -------------------- | ------------------ |
| electron-to-chromium | 1.5.452            |
| flatted              | 3.4.4              |
| glob-parent          | 6.0.2              |
| inherits             | 2.0.4              |
| isexe                | 2.0.0              |
| lru-cache            | 5.1.1              |
| once                 | 1.4.0              |
| pg-int8              | 1.0.1              |
| picocolors           | 1.1.1              |
| semver               | 6.3.1, 7.8.5       |
| setprototypeof       | 1.2.0              |
| siginfo              | 2.0.0              |
| split2               | 4.2.0              |
| which                | 2.0.2              |
| wrappy               | 1.0.2              |
| yallist              | 3.1.1              |
| zod-to-json-schema   | 3.25.2             |

## LGPL-3.0-or-later

| Package                         | Installed versions |
| ------------------------------- | ------------------ |
| @img/sharp-libvips-darwin-arm64 | 1.3.4              |

## MIT

| Package                               | Installed versions |
| ------------------------------------- | ------------------ |
| @babel/code-frame                     | 7.29.7             |
| @babel/compat-data                    | 7.29.7             |
| @babel/core                           | 7.29.7             |
| @babel/generator                      | 7.29.8             |
| @babel/helper-compilation-targets     | 7.29.7             |
| @babel/helper-globals                 | 7.29.7             |
| @babel/helper-module-imports          | 7.29.7             |
| @babel/helper-module-transforms       | 7.29.7             |
| @babel/helper-string-parser           | 7.29.7             |
| @babel/helper-validator-identifier    | 7.29.7             |
| @babel/helper-validator-option        | 7.29.7             |
| @babel/helpers                        | 7.29.10            |
| @babel/parser                         | 7.29.9             |
| @babel/template                       | 7.29.7             |
| @babel/traverse                       | 7.29.10            |
| @babel/types                          | 7.29.8             |
| @cacheable/memory                     | 2.2.0              |
| @cacheable/utils                      | 2.5.0              |
| @esbuild/darwin-arm64                 | 0.28.2             |
| @eslint-community/eslint-utils        | 4.10.1             |
| @eslint-community/regexpp             | 4.12.2             |
| @hono/node-server                     | 2.1.4              |
| @img/colour                           | 1.1.0              |
| @jridgewell/gen-mapping               | 0.3.13             |
| @jridgewell/remapping                 | 2.3.5              |
| @jridgewell/resolve-uri               | 3.1.2              |
| @jridgewell/sourcemap-codec           | 1.6.0              |
| @jridgewell/trace-mapping             | 0.3.31             |
| @keyv/bigmap                          | 1.3.1              |
| @keyv/serialize                       | 1.1.1              |
| @modelcontextprotocol/sdk             | 1.32.1             |
| @next/env                             | 16.4.0             |
| @next/swc-darwin-arm64                | 16.4.0             |
| @oxc-project/types                    | 0.153.0            |
| @rolldown/binding-darwin-arm64        | 1.2.13             |
| @rolldown/pluginutils                 | 1.0.1              |
| @standard-schema/spec                 | 1.1.0              |
| @types/chai                           | 5.2.3              |
| @types/deep-eql                       | 4.0.2              |
| @types/esrecurse                      | 4.3.1              |
| @types/estree                         | 1.0.9              |
| @types/json-schema                    | 7.0.15             |
| @types/luxon                          | 3.7.6              |
| @types/node                           | 24.19.2            |
| @types/pg                             | 8.23.1             |
| @types/react                          | 19.3.0             |
| @types/react-dom                      | 19.3.0             |
| @typescript-eslint/eslint-plugin      | 8.71.1             |
| @typescript-eslint/parser             | 8.71.1             |
| @typescript-eslint/project-service    | 8.71.1             |
| @typescript-eslint/scope-manager      | 8.71.1             |
| @typescript-eslint/tsconfig-utils     | 8.71.1             |
| @typescript-eslint/type-utils         | 8.71.1             |
| @typescript-eslint/types              | 8.71.1             |
| @typescript-eslint/typescript-estree  | 8.71.1             |
| @typescript-eslint/utils              | 8.71.1             |
| @typescript-eslint/visitor-keys       | 8.71.1             |
| @vitest/expect                        | 4.1.11             |
| @vitest/mocker                        | 4.1.11             |
| @vitest/pretty-format                 | 4.1.11             |
| @vitest/runner                        | 4.1.11             |
| @vitest/snapshot                      | 4.1.11             |
| @vitest/spy                           | 4.1.11             |
| @vitest/utils                         | 4.1.11             |
| accepts                               | 2.0.0              |
| acorn                                 | 8.19.0             |
| acorn-jsx                             | 5.3.2              |
| ajv                                   | 6.15.0, 8.20.0     |
| ajv-formats                           | 3.0.1              |
| assertion-error                       | 2.0.1              |
| balanced-match                        | 4.0.4              |
| body-parser                           | 2.3.0              |
| brace-expansion                       | 5.0.12             |
| browserslist                          | 4.29.3             |
| bytes                                 | 3.1.2              |
| cacheable                             | 2.5.0              |
| call-bind-apply-helpers               | 1.0.2              |
| call-bound                            | 1.0.4              |
| chai                                  | 6.3.0              |
| client-only                           | 0.0.1              |
| content-disposition                   | 2.0.1              |
| content-type                          | 1.0.5, 2.1.0       |
| convert-source-map                    | 2.0.0              |
| cookie                                | 0.7.2              |
| cookie-signature                      | 1.2.2              |
| cors                                  | 2.8.6              |
| cross-spawn                           | 7.0.6              |
| csstype                               | 3.2.3              |
| debug                                 | 4.4.3              |
| decimal.js                            | 10.6.0             |
| deep-is                               | 0.1.4              |
| depd                                  | 2.0.0              |
| dunder-proto                          | 1.0.1              |
| ee-first                              | 1.1.1              |
| encodeurl                             | 2.0.0              |
| es-define-property                    | 1.0.1              |
| es-errors                             | 1.3.0              |
| es-module-lexer                       | 2.3.2              |
| es-object-atoms                       | 1.1.2              |
| esbuild                               | 0.28.2             |
| escalade                              | 3.2.0              |
| escape-html                           | 1.0.3              |
| escape-string-regexp                  | 4.0.0              |
| eslint                                | 10.12.0            |
| eslint-plugin-react-hooks             | 7.1.1              |
| estree-walker                         | 3.0.3              |
| etag                                  | 1.8.1              |
| eventsource                           | 3.0.7              |
| eventsource-parser                    | 3.1.1              |
| express                               | 5.3.0              |
| express-rate-limit                    | 8.7.1              |
| fast-deep-equal                       | 3.1.3              |
| fast-json-stable-stringify            | 2.1.0              |
| fast-levenshtein                      | 2.0.6              |
| fdir                                  | 6.5.0              |
| file-entry-cache                      | 11.1.5             |
| finalhandler                          | 2.1.1              |
| find-up                               | 5.0.0              |
| flat-cache                            | 6.1.23             |
| forwarded                             | 0.2.0              |
| fresh                                 | 2.0.0              |
| fsevents                              | 2.3.3              |
| function-bind                         | 1.1.2              |
| gensync                               | 1.0.0-beta.2       |
| get-intrinsic                         | 1.3.0              |
| get-proto                             | 1.0.1              |
| gopd                                  | 1.2.0              |
| has-symbols                           | 1.1.0              |
| hashery                               | 1.5.1              |
| hasown                                | 2.0.4              |
| hermes-estree                         | 0.25.1             |
| hermes-parser                         | 0.25.1             |
| hono                                  | 4.13.13            |
| hookified                             | 1.15.1, 2.2.0      |
| http-errors                           | 2.0.1              |
| iconv-lite                            | 0.7.3              |
| ignore                                | 5.3.2, 7.0.12      |
| imurmurhash                           | 0.1.4              |
| ip-address                            | 10.7.4             |
| ipaddr.js                             | 1.9.1              |
| is-extglob                            | 2.1.1              |
| is-glob                               | 4.0.3              |
| is-promise                            | 4.0.0              |
| jiti                                  | 2.7.0              |
| jose                                  | 6.2.12             |
| js-tokens                             | 4.0.0              |
| jsesc                                 | 3.1.0              |
| json-schema-traverse                  | 0.4.1, 1.0.0       |
| json-stable-stringify-without-jsonify | 1.0.1              |
| json5                                 | 2.2.3              |
| keyv                                  | 5.6.0              |
| levn                                  | 0.4.1              |
| locate-path                           | 6.0.0              |
| luxon                                 | 3.7.2              |
| magic-string                          | 0.30.21            |
| math-intrinsics                       | 1.1.0              |
| media-typer                           | 1.1.1              |
| merge-descriptors                     | 2.0.0              |
| mime-db                               | 1.54.0             |
| mime-types                            | 3.0.2              |
| ms                                    | 2.1.3              |
| nanoid                                | 3.3.20             |
| natural-compare                       | 1.4.0              |
| negotiator                            | 1.1.0              |
| next                                  | 16.4.0             |
| node-releases                         | 2.0.58             |
| object-assign                         | 4.1.1              |
| object-inspect                        | 1.13.4             |
| obug                                  | 2.2.1              |
| on-finished                           | 2.4.1              |
| optionator                            | 0.9.4              |
| p-limit                               | 3.1.0              |
| p-locate                              | 5.0.0              |
| parseurl                              | 1.3.3              |
| path-exists                           | 4.0.0              |
| path-key                              | 3.1.1              |
| path-to-regexp                        | 8.4.2              |
| pathe                                 | 2.0.3              |
| pg                                    | 8.23.1             |
| pg-cloudflare                         | 1.4.1              |
| pg-connection-string                  | 2.14.1             |
| pg-pool                               | 3.14.0             |
| pg-protocol                           | 1.16.1             |
| pg-types                              | 2.2.0              |
| pgpass                                | 1.0.5              |
| picomatch                             | 4.0.7              |
| pkce-challenge                        | 5.0.1              |
| postcss                               | 8.5.23, 8.5.29     |
| postgres-array                        | 2.0.0              |
| postgres-bytea                        | 1.0.1              |
| postgres-date                         | 1.0.7              |
| postgres-interval                     | 1.2.0              |
| prelude-ls                            | 1.2.1              |
| prettier                              | 3.9.10             |
| proxy-addr                            | 2.0.8              |
| punycode                              | 2.3.1              |
| qified                                | 0.10.1             |
| range-parser                          | 1.3.0              |
| raw-body                              | 3.0.2              |
| react                                 | 19.3.0             |
| react-dom                             | 19.3.0             |
| require-from-string                   | 2.0.2              |
| rolldown                              | 1.2.13             |
| router                                | 2.2.0              |
| safer-buffer                          | 2.1.2              |
| scheduler                             | 0.28.0             |
| send                                  | 1.2.1              |
| serve-static                          | 2.2.1              |
| shebang-command                       | 2.0.0              |
| shebang-regex                         | 3.0.0              |
| side-channel                          | 1.1.1              |
| side-channel-list                     | 1.0.1              |
| side-channel-map                      | 1.0.1              |
| side-channel-weakmap                  | 1.0.2              |
| stackback                             | 0.0.2              |
| statuses                              | 2.0.2              |
| std-env                               | 4.3.0              |
| styled-jsx                            | 5.1.6              |
| tinybench                             | 2.9.0              |
| tinyexec                              | 1.3.1              |
| tinyglobby                            | 0.2.17             |
| tinyrainbow                           | 3.2.0              |
| toidentifier                          | 1.0.1              |
| ts-api-utils                          | 2.5.0              |
| tsx                                   | 4.23.15            |
| type-check                            | 0.4.0              |
| type-is                               | 2.1.0              |
| typescript-eslint                     | 8.71.1             |
| undici-types                          | 7.24.6             |
| unpipe                                | 1.0.0              |
| update-browserslist-db                | 1.3.4              |
| vary                                  | 1.1.2              |
| vite                                  | 8.3.4              |
| vitest                                | 4.1.11             |
| why-is-node-running                   | 2.3.0              |
| word-wrap                             | 1.2.5              |
| xtend                                 | 4.0.2              |
| yocto-queue                           | 0.1.0              |
| zod                                   | 4.6.6              |
| zod-validation-error                  | 4.0.2              |

## MPL-2.0

| Package                   | Installed versions |
| ------------------------- | ------------------ |
| lightningcss              | 1.33.0             |
| lightningcss-darwin-arm64 | 1.33.0             |
