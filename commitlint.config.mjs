export default {
  extends: ["@commitlint/config-conventional"],
  // Allow an optional agent-tier prefix before the Conventional Commits header,
  // e.g. "[claude] fix(api): ...". See AGENTS.md.
  parserPreset: {
    parserOpts: {
      headerPattern: /^(?:\[(claude|antigravity|qwen|user)\] )?(\w+)(?:\(([^)]*)\))?!?: (.+)$/,
      headerCorrespondence: ["agent", "type", "scope", "subject"],
    },
  },
};
