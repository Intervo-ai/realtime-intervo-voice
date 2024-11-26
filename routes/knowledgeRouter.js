const express = require("express");
const router = express.Router();
const Source = require("../models/KnowledgeSource");
const axios = require("axios");
const multer = require("multer");
const authenticateUser = require("../lib/authMiddleware");
const { Blob } = require("buffer");
const {
  difyFaqSourceConfig,
  difyFileSourceConfig,
} = require("../config/difyConfig");

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

// fetch text source form dify and return it
router.get("/sources/:sourceId/text", async (req, res) => {
  try {
    const source = await Source.findById(req.params.sourceId);
    if (!source.difyDocumentIds?.text) {
      res.status(200).json({ message: "success", text: "" });
    } else {
      const response = await difyClient.get(
        `/datasets/${source.difySourceId}/documents/${source.difyDocumentIds.text}/segments`
      );
      const data = await response.data?.data[0];
      res.status(200).json({ message: "success", text: data.content });
    }
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
  try {
    const { questions } = req.body; // Array of {question, answer}
    const markdownContent = questions
      .map(({ question, answer }) => {
        return `Question: ${question}\n\nAnswer: ${answer}\n\n---`;
      })
      .join("\n"); // create markdown from q&a with delimiter as ----

    const source = await Source.findById(req.params.sourceId);
    const formData = new FormData();
    const blob = new Blob([markdownContent], { type: "text/markdown" });
    formData.append("data", JSON.stringify(difyFaqSourceConfig));
    formData.append("type", "text/markdown");
    formData.append("file", blob, "questions.md");

    if (!source.difyDocumentIds?.faq) {
      const difyResponse = await difyClient.post(
        `/datasets/${source.difySourceId}/document/create_by_file`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      source.difyDocumentIds.faq = difyResponse.data.document?.id;
    } else {
      await difyClient.post(
        `/datasets/${source.difySourceId}/documents/${source.difyDocumentIds.faq}/update_by_file`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
    }

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

// fetch all faqs
router.get("/sources/:sourceId/faq", async (req, res) => {
  try {
    const source = await Source.findById(req.params.sourceId);
    if (!source.difyDocumentIds?.faq) {
      res.status(200).json({ message: "success", faqs: [] });
    } else {
      const response = await difyClient.get(
        `/datasets/${source.difySourceId}/documents/${source.difyDocumentIds.faq}/segments`
      );
      const data = await response.data?.data;
      const faqs = data.map((obj) => {
        const content = obj.content;
        const questionMatch = content.match(/Question:\s*(.*?)Answer:/);
        const answerMatch = content.match(/Answer:\s*(.*)/);

        return {
          question: questionMatch ? questionMatch[1].trim() : "",
          answer: answerMatch ? answerMatch[1].trim() : "",
        };
      });
      res.status(200).json({ message: "success", faqs: faqs });
    }
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
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const source = await Source.findById(req.params.sourceId);
      let fileDocuments = source.difyDocumentIds?.file || [];
      const files = req.files;

      // Upload each file to Dify. if file name exist in DB, update existing dify document else create a new one and add it to DB
      for (const file of files) {
        const formData = new FormData();
        const blob = new Blob([file.buffer], { type: file.mimetype });
        formData.append("data", JSON.stringify(difyFileSourceConfig));
        formData.append("type", file.mimetype);
        formData.append("file", blob, file.originalname);

        const fileExists = fileDocuments.find(
          (doc) => doc.fileName === file.originalname
        );
        if (fileExists) {
          await difyClient.post(
            `/datasets/${source.difySourceId}/documents/${fileExists.id}/update_by_file`,
            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
              },
            }
          );
        } else {
          const response = await difyClient.post(
            `/datasets/${source.difySourceId}/document/create_by_file`,
            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
              },
            }
          );
          source.difyDocumentIds.file = [
            ...source.difyDocumentIds.file,
            {
              fileName: file.originalname,
              id: await response.data.document?.id,
            },
          ];
          fileDocuments = [
            ...fileDocuments,
            {
              fileName: file.originalname,
              id: await response.data.document?.id,
            },
          ];
        }
      }

      source.sourceType = "file";
      await source.save();
      const newFiles = source.difyDocumentIds.file.map((obj) => {
        return {
          name: obj.fileName,
          _id: obj._id,
          uploaded: true,
        };
      });
      res
        .status(200)
        .json({ message: "Files uploaded successfully", files: newFiles });
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

//get all files from the db
router.get("/sources/:sourceId/files", async (req, res) => {
  try {
    const source = await Source.findById(req.params.sourceId);
    if (source.difyDocumentIds?.file.length == 0) {
      res.status(200).json({ message: "success", files: [] });
    } else {
      const files = source.difyDocumentIds.file.map((obj) => {
        return {
          name: obj.fileName,
          _id: obj._id,
          uploaded: true,
        };
      });
      res.status(200).json({ message: "success", files: files });
    }
  } catch (error) {
    console.log(error);
    if (error?.response?.data) {
      res.status(500).json({ error: error.response.data.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

// delete a file from dify and remove the entry from db
router.delete("/sources/:sourceId/files/:fileId", async (req, res) => {
  try {
    const { sourceId, fileId } = req.params;
    const source = await Source.findById(sourceId);
    if (!source) {
      return res.status(404).json({ error: "Source not found" });
    }
    const fileIndex = source.difyDocumentIds.file.findIndex(
      (file) => file._id == fileId
    );
    if (fileIndex === -1) {
      return res.status(404).json({ error: "File not found" });
    }
    const [deletedFile] = source.difyDocumentIds.file.splice(fileIndex, 1);

    await difyClient.delete(
      `/datasets/${source.difySourceId}/documents/${deletedFile.id}`
    );

    await source.save();
    res.status(200).json({ message: "File deleted successfully" });
  } catch (error) {
    console.log(error);
    if (error?.response?.data) {
      res.status(500).json({ error: error.response.data.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

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
    const sources = await Source.find({ user: req.user.id });
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
