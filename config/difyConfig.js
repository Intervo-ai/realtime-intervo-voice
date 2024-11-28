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

const difyCrawlWebsiteConfig = {
  options: {
    crawl_sub_pages: true,
    excludes: "",
    includes: "",
    limit: 10,
    max_depth: "",
    only_main_content: true,
    use_sitemap: true,
  },
  provider: "jinareader",
};

const difyUrlDocumentConfig = (jobId, urls) => {
  return {
    data_source: {
      type: "website_crawl",
      info_list: {
        data_source_type: "website_crawl",
        website_info_list: {
          provider: "jinareader",
          job_id: jobId,
          urls: urls,
          only_main_content: true,
        },
      },
    },
    indexing_technique: "high_quality",
    process_rule: {
      rules: {},
      mode: "automatic",
    },
    doc_form: "text_model",
    doc_language: "English",
    retrieval_model: {
      search_method: "semantic_search",
      reranking_enable: false,
      reranking_mode: null,
      reranking_model: {
        reranking_provider_name: "",
        reranking_model_name: "",
      },
      weights: null,
      top_k: 2,
      score_threshold_enabled: false,
      score_threshold: null,
    },
    embedding_model: "text-embedding-3-small",
    embedding_model_provider: "vertex_ai",
  };
};

const difyFileDocumentConfig = (fileIds) => {
  return {
    data_source: {
      type: "upload_file",
      info_list: {
        data_source_type: "upload_file",
        file_info_list: { file_ids: fileIds },
      },
    },
    indexing_technique: "high_quality",
    process_rule: { rules: {}, mode: "automatic" },
    doc_form: "text_model",
    doc_language: "English",
    retrieval_model: {
      search_method: "semantic_search",
      reranking_enable: false,
      reranking_mode: null,
      reranking_model: {
        reranking_provider_name: "",
        reranking_model_name: "",
      },
      weights: null,
      top_k: 2,
      score_threshold_enabled: false,
      score_threshold: null,
    },
    embedding_model: "text-embedding-3-small",
    embedding_model_provider: "vertex_ai",
  };
};

module.exports = {
  difyFaqSourceConfig,
  difyFileSourceConfig,
  difyCrawlWebsiteConfig,
  difyUrlDocumentConfig,
  difyFileDocumentConfig
};
