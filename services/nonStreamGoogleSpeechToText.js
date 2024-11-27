const speech = require("@google-cloud/speech");
const {Storage} = require('@google-cloud/storage');
const client = new speech.SpeechClient();
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;
const fs = require('fs');
const path = require('path');

async function uploadToGCS(localFilePath) {
  const bucket = storage.bucket(bucketName);
  const filename = path.basename(localFilePath);
  const gcsFileName = `audio/${filename}`;
  const file = bucket.file(gcsFileName);

  try {
    // Upload the existing file to GCS
    await bucket.upload(localFilePath, {
      destination: gcsFileName,
      metadata: {
        contentType: 'audio/wav',
      }
    });

    console.log(`Uploaded to GCS: gs://${bucketName}/${gcsFileName}`);
    return `gs://${bucketName}/${gcsFileName}`;
  } catch (error) {
    throw new Error(`Failed to upload to GCS: ${error.message}`);
  }
}

async function deleteFromGCS(gcsUri) {
  try {
    // Extract filename from GCS URI (format: gs://bucket-name/path/to/file)
    const filePath = gcsUri.replace(`gs://${bucketName}/`, '');
    const file = storage.bucket(bucketName).file(filePath);

    // Check if file exists before attempting to delete
    const [exists] = await file.exists();
    if (exists) {
      // await file.delete();
      // console.log(`Successfully deleted file from GCS: ${gcsUri}`);
    } else {
      console.log(`File not found in GCS: ${gcsUri}`);
    }
  } catch (error) {
    console.error(`Failed to delete file from GCS: ${error.message}`);
    // Don't throw error here as this is cleanup code
  }
}

async function googleSpeechRecognize(input) {
  // const existingGscUrl = "gs://intervo/audio/audio-1732679783925.wav";
  const existingGscUrl = null
  let gcsUri = null;
  try {
    if (input.isLongRunning) {
      if(existingGscUrl){
        gcsUri = existingGscUrl
      } else if (input.audioPath) {
        // Use the existing audio file path
        const localFilePath = input.audioPath;
        gcsUri = await uploadToGCS(localFilePath);
      }

      const request = {
        audio: {
          uri: gcsUri
        },
        config: {
          languageCode: 'en-US',
          useEnhanced: true,
          model: "phone_call",
          enableWordTimeOffsets: true,
          enableAutomaticPunctuation: true,
        }
      };

      // Start the long-running operation
      const [operation] = await client.longRunningRecognize(request);
      
      // Wait for the operation to complete
      const [response] = await operation.promise();
      
      // Process results
      const phrases = response.results.map(result => ({
        transcript: result.alternatives[0].transcript,
        words: result.alternatives[0].words,
        startTime: result.alternatives[0].words[0]?.startTime?.seconds * 1000 || 0,
        endTime: result.alternatives[0].words[result.alternatives[0].words.length - 1]?.endTime?.seconds * 1000 || 0
      }));

      return { phrases };
    } else {
      // Short audio processing (unchanged)
      const request = {
        audio: {
          content: input.toString('base64')
        },
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          enableWordTimeOffsets: true,
          enableAutomaticPunctuation: true,
        }
      };

      const [response] = await client.recognize(request);
      
      if (response.results) {
        const phrases = response.results.map(result => {
          const alternative = result.alternatives[0];
          const words = alternative?.words || [];
          
          const startTime = words[0]?.startTime 
            ? (words[0].startTime.seconds * 1000) + (words[0].startTime.nanos / 1000000)
            : 0;
          
          const endTime = words[words.length - 1]?.endTime
            ? (words[words.length - 1].endTime.seconds * 1000) + (words[words.length - 1].endTime.nanos / 1000000)
            : 0;

          return {
            transcript: alternative?.transcript || '',
            words: words,
            startTime,
            endTime
          };
        });

        return { phrases };
      }
      
      return { phrases: [] };
    }
  } catch (error) {
    console.error('Speech recognition error:', error);
    throw new Error(`Speech recognition failed: ${error.message}`);
  } finally {
    // Clean up GCS file if it was created
    if (gcsUri) {
      await deleteFromGCS(gcsUri);
    }
  }
}

module.exports = googleSpeechRecognize;
 