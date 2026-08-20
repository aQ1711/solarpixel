import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // .netlify/ is Netlify CLI's local build-artifact directory (bundled/
  // minified Functions runtime code from `netlify deploy --build`) —
  // not source, shouldn't be linted, same reasoning as .next/ and
  // node_modules/ (already excluded by eslint-config-next's own
  // defaults). Already gitignored; this just keeps `eslint .` from
  // reporting thousands of irrelevant problems against generated code.
  { ignores: [".netlify/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
