const difyFaqSourceConfig = {
  indexing_technique: "high_quality",
  process_rule: {
    rules: {
      pre_processing_rules: [
        { id: "remove_extra_spaces", enabled: true },
        { id: "remove_urls_emails", enabled: true },
      ],
      segmentation: {
        separator: "---",
        max_tokens: 500,
      },
    },
    mode: "custom",
  },
};

const difyFileSourceConfig = {
  indexing_technique: "high_quality",
  process_rule: {
    rules: {
      pre_processing_rules: [
        { id: "remove_extra_spaces", enabled: true },
        { id: "remove_urls_emails", enabled: true },
      ],
      segmentation: {
        separator: "###",
        max_tokens: 500,
      },
    },
    mode: "custom",
  },
};

module.exports = { difyFaqSourceConfig, difyFileSourceConfig };
