const fs = require("fs");
const path = require("path");

let s3Client = null;
let PutObjectCommand = null;
let DeleteObjectCommand = null;

function getS3Credentials() {
  const accessKey = (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY || "").trim();
  const secretKey = (process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY || "").trim();
  const bucket = (process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME || "").trim();
  const region = (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1").trim();

  return { accessKey, secretKey, bucket, region };
}

function initS3Client() {
  const { accessKey, secretKey, bucket, region } = getS3Credentials();
  if (accessKey && secretKey && bucket) {
    try {
      const s3Sdk = require("@aws-sdk/client-s3");
      s3Client = new s3Sdk.S3Client({
        region,
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey
        }
      });
      PutObjectCommand = s3Sdk.PutObjectCommand;
      DeleteObjectCommand = s3Sdk.DeleteObjectCommand;
      console.log(`[AWS S3] Client initialized for Bucket: ${bucket} | Region: ${region}`);
      return true;
    } catch (err) {
      console.error("[AWS S3 Init Error] Could not load @aws-sdk/client-s3:", err.message);
    }
  } else {
    console.log(`[AWS S3] Credentials incomplete. Key: ${!!accessKey}, Secret: ${!!secretKey}, Bucket: ${!!bucket}`);
  }
  return false;
}

// Try initializing S3 client on module load
initS3Client();

/**
 * Uploads a local file to AWS S3 (if configured) or returns the local relative URL.
 * @param {string} localFilePath - Local disk path to the file.
 * @param {string} originalName - Original filename or target S3 key name.
 * @param {string} mimeType - Content type (e.g. application/pdf, image/png).
 * @returns {Promise<string>} - The public S3 HTTPS URL or local relative URL (/uploads/...).
 */
async function uploadToStorage(localFilePath, originalName, mimeType) {
  const fileName = path.basename(localFilePath);
  const localRelativeUrl = "/uploads/" + fileName;
  const { accessKey, secretKey, bucket, region } = getS3Credentials();

  if (accessKey && secretKey && bucket) {
    try {
      if (!s3Client && !initS3Client()) {
        console.warn("[AWS S3] Could not initialize S3 client. Using local URL.");
        return localRelativeUrl;
      }

      if (!fs.existsSync(localFilePath)) {
        console.error("[AWS S3 Upload Error] File path does not exist on disk:", localFilePath);
        return localRelativeUrl;
      }

      const fileBuffer = fs.readFileSync(localFilePath);
      const cleanOriginalName = (originalName || fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
      const s3Key = `uploads/${Date.now()}-${Math.round(Math.random() * 1e8)}-${cleanOriginalName}`;

      console.log(`[AWS S3 Uploading] Preparing to upload ${fileName} (${fileBuffer.length} bytes) to S3 bucket ${bucket}...`);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimeType || "application/octet-stream"
      });

      await s3Client.send(command);

      const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
      console.log(`[AWS S3 Upload Success] Document live at: ${s3Url}`);
      return s3Url;
    } catch (err) {
      console.error(`[AWS S3 Upload Failed] Bucket: ${bucket}, Error:`, err.message);
      console.error(err);
      return localRelativeUrl;
    }
  }

  console.log("[AWS S3] AWS S3 keys not present in process.env. Saved to local disk path.");
  return localRelativeUrl;
}

/**
 * Deletes a file from AWS S3 (if it's an S3 URL) or local disk.
 * @param {string} fileUrl - S3 URL or local relative path.
 */
async function deleteFromStorage(fileUrl) {
  if (!fileUrl) return false;

  const { accessKey, secretKey, bucket } = getS3Credentials();

  // If it's an AWS S3 URL
  if (fileUrl.includes("amazonaws.com")) {
    if (accessKey && secretKey && bucket) {
      try {
        const s3Sdk = require("@aws-sdk/client-s3");
        if (!s3Client) {
          initS3Client();
        }
        DeleteObjectCommand = DeleteObjectCommand || s3Sdk.DeleteObjectCommand;

        // Extract S3 key (everything after amazonaws.com/)
        const urlParts = fileUrl.split(".amazonaws.com/");
        if (urlParts.length > 1) {
          const s3Key = decodeURIComponent(urlParts[1]);
          console.log(`[AWS S3 Deleting] Removing object "${s3Key}" from bucket "${bucket}"...`);

          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: s3Key
          }));

          console.log(`[AWS S3 Delete Success] Successfully deleted "${s3Key}" from S3 bucket.`);
          return true;
        }
      } catch (err) {
        console.error(`[AWS S3 Delete Error] Could not delete S3 object:`, err.message);
      }
    }
  } else {
    // Local disk deletion
    try {
      const fileName = path.basename(fileUrl);
      const runtimeDir = process.env.VERCEL ? "/tmp" : path.join(__dirname, "..");
      const localFilePath = path.join(runtimeDir, "uploads", fileName);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        console.log(`[Local Storage Delete Success] Removed local file: ${localFilePath}`);
        return true;
      }
    } catch (err) {
      console.error(`[Local Storage Delete Error] Could not delete local file:`, err.message);
    }
  }
  return false;
}

module.exports = {
  uploadToStorage,
  deleteFromStorage
};
