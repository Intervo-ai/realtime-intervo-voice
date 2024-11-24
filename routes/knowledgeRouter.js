const express = require("express");
const router = express.Router();
const Source = require("../models/KnowledgeSource");
const axios = require("axios");
const multer = require("multer");
const authenticateUser = require("../lib/authMiddleware");
const { Blob } = require("buffer");

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Configuration for Dify API
const AI_FLOW_DATASET_API_KEY = process.env.AI_FLOW_DATASET_API_KEY;
const AI_FLOW_API_URL = process.env.AI_FLOW_API_URL;

const difyClient = axios.create({
  baseURL: AI_FLOW_API_URL,
  headers: {
    Authorization: `Bearer ${AI_FLOW_DATASET_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const storage = multer.memoryStorage(); // Store files in memory as Buffer
const upload = multer({ storage });

// Create a new knowledge source
router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id;
    // Create source in Dify with "name" as name_uid
    const difyResponse = await difyClient.post("/datasets", {
      name: `${name}_${userId}`,
      description,
      permission: "only_me",
    });

    // Create source in our database
    const source = new Source({
      user: userId,
      name,
      description,
      difySourceId: difyResponse.data.id,
    });

    await source.save();
    res.status(201).json(source);
  } catch (error) {
    console.error(error);
    if (error?.response?.data) {
      res.status(500).json({ error: error.response.data.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

// Add text content to a source
router.post("/sources/:sourceId/text", async (req, res) => {
  try {
    const { text } = req.body;
    const source = await Source.findById(req.params.sourceId);
    if (!source.difyDocumentIds?.text) {
      // create a dify document if document it for text is not present
      const difyResponse = await difyClient.post(
        `/datasets/${source.difySourceId}/document/create_by_text`,
        {
          name: "text",
          text: text,
          indexing_technique: "high_quality",
          process_rule: {
            mode: "automatic",
          },
        }
      );
      source.difyDocumentIds.text = difyResponse.data.document?.id;
    } else {
      // if source type is text, update the text based on dify document id
      await difyClient.post(
        `/datasets/${source.difySourceId}/documents/${source.difyDocumentIds.text}/update_by_text`,
        {
          name: "text",
          text: text,
        }
      );
    }
    source.sourceType = "text";
    await source.save();

    res.status(200).json({ message: "Text added successfully" });
  } catch (error) {
    console.log(error);
    if (error?.response?.data) {
      res.status(500).json({ error: error.response.data.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

// Add FAQ to a source
router.post("/sources/:sourceId/faq", async (req, res) => {
  const data = {
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

  try {
    const { questions } = req.body; // Array of {question, answer}
    const markdownContent = questions
      .map(({ question, answer }) => {
        return `## ${question}\n\n${answer}\n\n---`;
      })
      .join("\n"); // create markdown from q&a with delimiter as ----

    const source = await Source.findById(req.params.sourceId);
    const formData = new FormData();
    const blob = new Blob([markdownContent], { type: "text/markdown" });
    formData.append("data", JSON.stringify(data));
    formData.append("type", "text/markdown");
    formData.append("file", blob, "questions.md");

    await difyClient.post(
      `/datasets/${source.difySourceId}/document/create_by_file`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    source.sourceType = "faq";
    await source.save();
    res.status(200).json({ message: "FAQs added successfully" });
  } catch (error) {
    console.log(error);
    if (error?.response?.data) {
      res.status(500).json({ error: error.response.data.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

// Upload files to a source
router.post(
  "/sources/:sourceId/files",
  upload.array("files"),
  async (req, res) => {
    const data = {
      indexing_technique: "high_quality",
      process_rule: {
        rules: {
          pre_processing_rules: [
            { id: "remove_extra_spaces", enabled: true },
            { id: "remove_urls_emails", enabled: true },
          ],
        },
        mode: "custom",
      },
    };

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const source = await Source.findById(req.params.sourceId);
      const files = req.files;

      // Upload each file to Dify
      for (const file of files) {
        const formData = new FormData();
        const blob = new Blob([file.buffer], { type: file.mimetype });
        formData.append("data", JSON.stringify(data));
        formData.append("type", "text/plain");
        formData.append("file", blob, file.originalname);

        await difyClient.post(
          `/datasets/${source.difySourceId}/document/create_by_file`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );
      }

      source.sourceType = "file";
      await source.save();
      res.status(200).json({ message: "Files uploaded successfully" });
    } catch (error) {
      console.log(error);
      if (error?.response?.data) {
        res.status(500).json({ error: error.response.data.message });
        return;
      }
      res.status(500).json({ error: error.message });
    }
  }
);

// Add website for crawling
router.post("/sources/:sourceId/crawl", async (req, res) => {
  try {
    const { url } = req.body;
    const source = await Source.findById(req.params.sourceId);

    await difyClient.post(`/knowledge-sources/${source.difySourceId}/crawl`, {
      url,
    });

    res.status(200).json({ message: "Website crawling initiated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all sources
router.get("/sources", async (req, res) => {
  try {
    const sources = await Source.find({user: req.user.id});
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific source
router.get("/sources/:sourceId", async (req, res) => {
  try {
    const source = await Source.findById(req.params.sourceId);
    if (!source) {
      return res.status(404).json({ error: "Source not found" });
    }
    res.json(source);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a source
router.put("/sources/:sourceId", async (req, res) => {
  try {
    const { name, description } = req.body;
    const source = await Source.findById(req.params.sourceId);

    // Update in Dify
    await difyClient.put(`/knowledge-sources/${source.difySourceId}`, {
      name,
      description,
    });

    // Update in our database
    source.name = name;
    source.description = description;
    source.updatedAt = Date.now();
    await source.save();

    res.json(source);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a source
router.delete("/sources/:sourceId", async (req, res) => {
  try {
    const source = await Source.findById(req.params.sourceId);

    // Delete from Dify
    await difyClient.delete(`/datasets/${source.difySourceId}`);

    // Delete from our database
    await Source.findByIdAndDelete(req.params.sourceId);

    res.json({ message: "Source deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
