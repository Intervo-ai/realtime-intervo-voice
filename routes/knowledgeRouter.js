const express = require('express');
const router = express.Router();
const Source = require('../models/KnowledgeSource');
const axios = require('axios');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Configuration for Dify API
const AI_FLOW_DATASET_API_KEY = process.env.AI_FLOW_DATASET_API_KEY;
const AI_FLOW_API_URL = process.env.AI_FLOW_API_URL;

const difyClient = axios.create({
  baseURL: AI_FLOW_API_URL,
  headers: {
    'Authorization': `Bearer ${AI_FLOW_DATASET_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Create a new knowledge source
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    // Create source in Dify
    const difyResponse = await difyClient.post('/datasets', {
      name,
      description,
      permission: 'only_me'
    });

    // Create source in our database
    const source = new Source({
      user: req.user.id,
      name,
      description,
      difySourceId: difyResponse.data.id
    });

    await source.save();
    res.status(201).json(source);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Add text content to a source
router.post('/sources/:sourceId/text', async (req, res) => {
  try {
    const { text } = req.body;
    const source = await Source.findById(req.params.sourceId);

    await difyClient.post(`/knowledge-sources/${source.difySourceId}/texts`, {
      content: text
    });

    res.status(200).json({ message: 'Text added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add FAQ to a source
router.post('/sources/:sourceId/faq', async (req, res) => {
  try {
    const { questions } = req.body; // Array of {question, answer}
    const source = await Source.findById(req.params.sourceId);

    await difyClient.post(`/knowledge-sources/${source.difySourceId}/faqs`, {
      questions
    });

    res.status(200).json({ message: 'FAQs added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload files to a source
router.post('/sources/:sourceId/files', upload.array('files'), async (req, res) => {
  try {
    const source = await Source.findById(req.params.sourceId);
    const files = req.files;

    // Upload each file to Dify
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file.buffer, file.originalname);
      
      await difyClient.post(`/knowledge-sources/${source.difySourceId}/files`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    }

    res.status(200).json({ message: 'Files uploaded successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add website for crawling
router.post('/sources/:sourceId/crawl', async (req, res) => {
  try {
    const { url } = req.body;
    const source = await Source.findById(req.params.sourceId);

    await difyClient.post(`/knowledge-sources/${source.difySourceId}/crawl`, {
      url
    });

    res.status(200).json({ message: 'Website crawling initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all sources
router.get('/sources', async (req, res) => {
  try {
    const sources = await Source.find();
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific source
router.get('/sources/:sourceId', async (req, res) => {
  try {
    const source = await Source.findById(req.params.sourceId);
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }
    res.json(source);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a source
router.put('/sources/:sourceId', async (req, res) => {
  try {
    const { name, description } = req.body;
    const source = await Source.findById(req.params.sourceId);

    // Update in Dify
    await difyClient.put(`/knowledge-sources/${source.difySourceId}`, {
      name,
      description
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
router.delete('/sources/:sourceId', async (req, res) => {
  try {
    const source = await Source.findById(req.params.sourceId);

    // Delete from Dify
    await difyClient.delete(`/knowledge-sources/${source.difySourceId}`);

    // Delete from our database
    await Source.findByIdAndDelete(req.params.sourceId);

    res.json({ message: 'Source deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
