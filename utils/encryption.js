//!Incomplete module.
const crypto = require('crypto');

// Get encryption key from environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // For GCM, IV length is 12 bytes
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a string using AES-256-GCM
 * @param {string} text - The text to encrypt
 * @returns {string} - Base64 encoded encrypted string
 */
function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Generate a random initialization vector
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher with key, iv, and algorithm
  const cipher = crypto.createCipheriv(
    ALGORITHM, 
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );

  // Encrypt the text
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine IV, encrypted text, and auth tag
  const combined = Buffer.concat([
    iv,
    Buffer.from(encrypted, 'base64'),
    authTag
  ]);

  return combined.toString('base64');
}

/**
 * Decrypts a string using AES-256-GCM
 * @param {string} encryptedText - Base64 encoded encrypted string
 * @returns {string} - Decrypted string
 */
function decrypt(encryptedText) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Convert combined string to buffer
  const combined = Buffer.from(encryptedText, 'base64');

  // Extract IV, encrypted text, and auth tag
  const iv = combined.slice(0, IV_LENGTH);
  const authTag = combined.slice(-AUTH_TAG_LENGTH);
  const encrypted = combined.slice(IV_LENGTH, -AUTH_TAG_LENGTH);

  // Create decipher
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );
  
  decipher.setAuthTag(authTag);

  // Decrypt the text
  let decrypted = decipher.update(encrypted);
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  encrypt,
  decrypt
}; 