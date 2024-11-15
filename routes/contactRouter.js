const express = require("express");
const router = express.Router();
const Contact = require("../models/Contact");

// Create a new contact
router.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, country, agent, user } =
      req.body;
    const fullName = `${firstName} ${lastName}`;
    const contact = new Contact({
      firstName,
      lastName,
      fullName,
      email,
      phoneNumber,
      country,
      agent,
      user,
    });
    await contact.save();
    res.status(201).json(contact);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to create contact", details: error.message });
  }
});

// Get all contacts
router.get("/", async (req, res) => {
  try {
    const contacts = await Contact.find();
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// Get a single contact by ID
router.get("/:id", async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

// Update a contact
router.put("/:id", async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, country } = req.body;
    const fullName = `${firstName} ${lastName}`;
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, fullName, email, phoneNumber, country },
      { new: true }
    );
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// Partially update a contact
router.patch("/:id", async (req, res) => {
  try {
    const updates = req.body; 
    const contact = await Contact.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json(contact);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update contact", details: error.message });
  }
});

// Delete a contact
router.delete("/:id", async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.json({ message: "Contact deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

module.exports = router;
