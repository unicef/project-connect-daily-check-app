// This script handles code signing with DigiCert KeyLocker
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Custom signing function for electron-builder
 * @param {Object} options - Signing options provided by electron-builder
 * @param {string} options.path - Path to the file to sign
 */
exports.default = async function (options) {
  console.log("Signing file:", options.path);

  // Get DigiCert Signing Manager credentials
  const certificateId = "key_1096793475";
  const certificatePath = "C:\\Users\\shrey\\Downloads\\cert_1096793475.crt";

  // Check if certificate path is set
  if (!certificatePath) {
    console.error("Certificate path not found in environment variables (SM_CLIENT_CERT_FILE)");
    throw new Error("Missing certificate path");
  }

  // Check if certificate file exists
  if (!fs.existsSync(certificatePath)) {
    console.error(`Certificate file not found at path: ${certificatePath}`);
    throw new Error(`Certificate file not found: ${certificatePath}`);
  }

  try {
    // Command to sign the file using DigiCert Signing Manager
    const command = `signtool.exe sign /csp "Digicert Signing Manager KSP" /kc "${certificateId}" /f "${certificatePath}" /tr http://timestamp.digicert.com /td sha256 /fd sha256 "${options.path}"`;

    console.log("Executing command:", command);
    
    // Execute the signing command
    execSync(command, { stdio: "inherit" });

    console.log("Successfully signed:", options.path);
  } catch (error) {
    console.error("Error signing file:", error);
    throw error;
  }
};